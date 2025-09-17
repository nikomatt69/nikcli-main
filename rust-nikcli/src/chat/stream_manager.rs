use crate::ai::types::*;
use crate::chat::types::*;
use crate::error::NikCliResult;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use tracing::{debug, info, warn, error};

/// Stream manager for handling streaming chat responses
pub struct StreamManager {
    active_streams: Arc<RwLock<HashMap<String, StreamHandle>>>,
    stream_config: StreamConfig,
    event_sender: Option<mpsc::UnboundedSender<StreamEvent>>,
}

/// Stream handle for managing individual streams
pub struct StreamHandle {
    pub stream_id: String,
    pub session_id: String,
    pub message_id: String,
    pub status: StreamStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
    pub total_events: u32,
    pub total_tokens: u32,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Stream status
#[derive(Debug, Clone, PartialEq)]
pub enum StreamStatus {
    Starting,
    Active,
    Paused,
    Completed,
    Error,
    Cancelled,
}

impl std::fmt::Display for StreamStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StreamStatus::Starting => write!(f, "starting"),
            StreamStatus::Active => write!(f, "active"),
            StreamStatus::Paused => write!(f, "paused"),
            StreamStatus::Completed => write!(f, "completed"),
            StreamStatus::Error => write!(f, "error"),
            StreamStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Stream configuration
#[derive(Debug, Clone)]
pub struct StreamConfig {
    pub max_concurrent_streams: u32,
    pub stream_timeout: u64, // in seconds
    pub buffer_size: usize,
    pub enable_compression: bool,
    pub enable_metrics: bool,
    pub auto_cleanup_interval: u64, // in seconds
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            max_concurrent_streams: 10,
            stream_timeout: 300, // 5 minutes
            buffer_size: 1024,
            enable_compression: false,
            enable_metrics: true,
            auto_cleanup_interval: 60, // 1 minute
        }
    }
}

/// Stream metrics
#[derive(Debug, Clone)]
pub struct StreamMetrics {
    pub stream_id: String,
    pub session_id: String,
    pub total_events: u32,
    pub total_tokens: u32,
    pub total_duration_ms: u64,
    pub average_event_interval_ms: f64,
    pub error_count: u32,
    pub completion_rate: f64,
    pub throughput_tokens_per_second: f64,
}

/// Stream event with additional metadata
#[derive(Debug, Clone)]
pub struct EnhancedStreamEvent {
    pub event: StreamEvent,
    pub stream_id: String,
    pub session_id: String,
    pub message_id: String,
    pub sequence_number: u32,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub processing_time_ms: u64,
}

impl StreamManager {
    /// Create a new stream manager
    pub fn new(config: StreamConfig) -> Self {
        Self {
            active_streams: Arc::new(RwLock::new(HashMap::new())),
            stream_config: config,
            event_sender: None,
        }
    }
    
    /// Start a new stream
    pub async fn start_stream(&self, session_id: String, message_id: String) -> NikCliResult<String> {
        // Check concurrent stream limit
        let active_count = {
            let streams = self.active_streams.read().await;
            streams.len() as u32
        };
        
        if active_count >= self.stream_config.max_concurrent_streams {
            return Err(crate::error::NikCliError::ResourceExhausted(
                format!("Maximum concurrent streams ({}) exceeded", self.stream_config.max_concurrent_streams)
            ));
        }
        
        let stream_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        
        let handle = StreamHandle {
            stream_id: stream_id.clone(),
            session_id: session_id.clone(),
            message_id: message_id.clone(),
            status: StreamStatus::Starting,
            created_at: now,
            last_activity: now,
            total_events: 0,
            total_tokens: 0,
            metadata: HashMap::new(),
        };
        
        // Store stream handle
        {
            let mut streams = self.active_streams.write().await;
            streams.insert(stream_id.clone(), handle);
        }
        
        // Emit start event
        self.emit_event(StreamEvent {
            event_type: StreamEventType::Start,
            content: Some("Stream started".to_string()),
            tool_name: None,
            tool_args: None,
            tool_result: None,
            error: None,
            metadata: Some(json!({
                "stream_id": stream_id,
                "session_id": session_id,
                "message_id": message_id
            })),
        }).await;
        
        info!("Started stream {} for session {} message {}", stream_id, session_id, message_id);
        Ok(stream_id)
    }
    
    /// Process stream event
    pub async fn process_event(&self, stream_id: &str, event: StreamEvent) -> NikCliResult<()> {
        let mut streams = self.active_streams.write().await;
        let handle = streams.get_mut(stream_id)
            .ok_or_else(|| crate::error::NikCliError::NotFound(format!("Stream {} not found", stream_id)))?;
        
        // Update handle
        handle.last_activity = chrono::Utc::now();
        handle.total_events += 1;
        
        // Estimate tokens from content
        if let Some(ref content) = event.content {
            handle.total_tokens += content.len() as u32 / 4; // Rough estimate
        }
        
        // Update status based on event type
        match event.event_type {
            StreamEventType::Start => {
                handle.status = StreamStatus::Active;
            }
            StreamEventType::Complete => {
                handle.status = StreamStatus::Completed;
            }
            StreamEventType::Error => {
                handle.status = StreamStatus::Error;
            }
            _ => {}
        }
        
        // Create enhanced event
        let enhanced_event = EnhancedStreamEvent {
            event: event.clone(),
            stream_id: stream_id.to_string(),
            session_id: handle.session_id.clone(),
            message_id: handle.message_id.clone(),
            sequence_number: handle.total_events,
            timestamp: chrono::Utc::now(),
            processing_time_ms: 0, // Would be calculated in real implementation
        };
        
        // Emit enhanced event
        self.emit_enhanced_event(enhanced_event).await;
        
        debug!("Processed event {} for stream {} (total events: {})", 
               event.event_type, stream_id, handle.total_events);
        
        Ok(())
    }
    
    /// Complete a stream
    pub async fn complete_stream(&self, stream_id: &str) -> NikCliResult<()> {
        let mut streams = self.active_streams.write().await;
        if let Some(handle) = streams.get_mut(stream_id) {
            handle.status = StreamStatus::Completed;
            handle.last_activity = chrono::Utc::now();
            
            // Emit completion event
            self.emit_event(StreamEvent {
                event_type: StreamEventType::Complete,
                content: Some("Stream completed".to_string()),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: None,
                metadata: Some(json!({
                    "stream_id": stream_id,
                    "total_events": handle.total_events,
                    "total_tokens": handle.total_tokens,
                    "duration_ms": handle.last_activity.signed_duration_since(handle.created_at).num_milliseconds()
                })),
            }).await;
            
            info!("Completed stream {} with {} events and {} tokens", 
                  stream_id, handle.total_events, handle.total_tokens);
        }
        
        Ok(())
    }
    
    /// Cancel a stream
    pub async fn cancel_stream(&self, stream_id: &str) -> NikCliResult<()> {
        let mut streams = self.active_streams.write().await;
        if let Some(handle) = streams.get_mut(stream_id) {
            handle.status = StreamStatus::Cancelled;
            handle.last_activity = chrono::Utc::now();
            
            // Emit cancellation event
            self.emit_event(StreamEvent {
                event_type: StreamEventType::Error,
                content: Some("Stream cancelled".to_string()),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: Some("Stream was cancelled by user".to_string()),
                metadata: Some(json!({
                    "stream_id": stream_id,
                    "reason": "cancelled"
                })),
            }).await;
            
            info!("Cancelled stream {}", stream_id);
        }
        
        Ok(())
    }
    
    /// Get stream status
    pub async fn get_stream_status(&self, stream_id: &str) -> Option<StreamStatus> {
        let streams = self.active_streams.read().await;
        streams.get(stream_id).map(|handle| handle.status.clone())
    }
    
    /// Get stream metrics
    pub async fn get_stream_metrics(&self, stream_id: &str) -> Option<StreamMetrics> {
        let streams = self.active_streams.read().await;
        let handle = streams.get(stream_id)?;
        
        let duration_ms = handle.last_activity.signed_duration_since(handle.created_at).num_milliseconds() as u64;
        let average_event_interval = if handle.total_events > 0 {
            duration_ms as f64 / handle.total_events as f64
        } else {
            0.0
        };
        
        let throughput = if duration_ms > 0 {
            (handle.total_tokens as f64 * 1000.0) / duration_ms as f64
        } else {
            0.0
        };
        
        Some(StreamMetrics {
            stream_id: stream_id.to_string(),
            session_id: handle.session_id.clone(),
            total_events: handle.total_events,
            total_tokens: handle.total_tokens,
            total_duration_ms: duration_ms,
            average_event_interval_ms: average_event_interval,
            error_count: 0, // Would be tracked in real implementation
            completion_rate: if handle.status == StreamStatus::Completed { 1.0 } else { 0.0 },
            throughput_tokens_per_second: throughput,
        })
    }
    
    /// Get all active streams
    pub async fn get_active_streams(&self) -> Vec<StreamHandle> {
        let streams = self.active_streams.read().await;
        streams.values().cloned().collect()
    }
    
    /// Clean up completed streams
    pub async fn cleanup_completed_streams(&self) -> u32 {
        let mut streams = self.active_streams.write().await;
        let initial_count = streams.len();
        
        streams.retain(|_, handle| {
            matches!(handle.status, StreamStatus::Active | StreamStatus::Starting | StreamStatus::Paused)
        });
        
        let cleaned_count = initial_count - streams.len();
        if cleaned_count > 0 {
            info!("Cleaned up {} completed streams", cleaned_count);
        }
        
        cleaned_count as u32
    }
    
    /// Clean up old streams
    pub async fn cleanup_old_streams(&self, max_age_seconds: u64) -> u32 {
        let cutoff = chrono::Utc::now() - chrono::Duration::seconds(max_age_seconds as i64);
        let mut streams = self.active_streams.write().await;
        let initial_count = streams.len();
        
        streams.retain(|_, handle| {
            handle.last_activity > cutoff
        });
        
        let cleaned_count = initial_count - streams.len();
        if cleaned_count > 0 {
            info!("Cleaned up {} old streams", cleaned_count);
        }
        
        cleaned_count as u32
    }
    
    /// Get stream configuration
    pub fn get_config(&self) -> &StreamConfig {
        &self.stream_config
    }
    
    /// Update stream configuration
    pub fn update_config(&mut self, config: StreamConfig) {
        self.stream_config = config;
        info!("Updated stream configuration");
    }
    
    /// Set event sender
    pub fn set_event_sender(&mut self, sender: mpsc::UnboundedSender<StreamEvent>) {
        self.event_sender = Some(sender);
    }
    
    /// Get event receiver
    pub fn get_event_receiver(&self) -> Option<mpsc::UnboundedReceiver<StreamEvent>> {
        let (sender, receiver) = mpsc::unbounded_channel();
        self.event_sender = Some(sender);
        Some(receiver)
    }
    
    /// Emit stream event
    async fn emit_event(&self, event: StreamEvent) {
        if let Some(ref sender) = self.event_sender {
            let _ = sender.send(event);
        }
    }
    
    /// Emit enhanced stream event
    async fn emit_enhanced_event(&self, event: EnhancedStreamEvent) {
        // In a real implementation, this would emit the enhanced event
        // For now, we just emit the base event
        self.emit_event(event.event).await;
    }
    
    /// Start auto cleanup task
    pub async fn start_auto_cleanup(&self) -> tokio::task::JoinHandle<()> {
        let streams = self.active_streams.clone();
        let cleanup_interval = self.stream_config.auto_cleanup_interval;
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(cleanup_interval));
            
            loop {
                interval.tick().await;
                
                // Clean up completed streams
                {
                    let mut streams = streams.write().await;
                    streams.retain(|_, handle| {
                        matches!(handle.status, StreamStatus::Active | StreamStatus::Starting | StreamStatus::Paused)
                    });
                }
                
                // Clean up old streams (older than 1 hour)
                {
                    let cutoff = chrono::Utc::now() - chrono::Duration::hours(1);
                    let mut streams = streams.write().await;
                    streams.retain(|_, handle| {
                        handle.last_activity > cutoff
                    });
                }
            }
        })
    }
    
    /// Get overall stream statistics
    pub async fn get_stream_statistics(&self) -> StreamStatistics {
        let streams = self.active_streams.read().await;
        
        let mut total_streams = 0;
        let mut active_streams = 0;
        let mut completed_streams = 0;
        let mut error_streams = 0;
        let mut total_events = 0;
        let mut total_tokens = 0;
        let mut total_duration_ms = 0;
        
        for handle in streams.values() {
            total_streams += 1;
            total_events += handle.total_events;
            total_tokens += handle.total_tokens;
            
            let duration = handle.last_activity.signed_duration_since(handle.created_at).num_milliseconds() as u64;
            total_duration_ms += duration;
            
            match handle.status {
                StreamStatus::Active | StreamStatus::Starting | StreamStatus::Paused => {
                    active_streams += 1;
                }
                StreamStatus::Completed => {
                    completed_streams += 1;
                }
                StreamStatus::Error | StreamStatus::Cancelled => {
                    error_streams += 1;
                }
            }
        }
        
        StreamStatistics {
            total_streams,
            active_streams,
            completed_streams,
            error_streams,
            total_events,
            total_tokens,
            average_duration_ms: if total_streams > 0 { total_duration_ms / total_streams as u64 } else { 0 },
            average_events_per_stream: if total_streams > 0 { total_events as f64 / total_streams as f64 } else { 0.0 },
            average_tokens_per_stream: if total_streams > 0 { total_tokens as f64 / total_streams as f64 } else { 0.0 },
            success_rate: if total_streams > 0 { completed_streams as f64 / total_streams as f64 } else { 0.0 },
        }
    }
}

/// Stream statistics
#[derive(Debug, Clone)]
pub struct StreamStatistics {
    pub total_streams: u32,
    pub active_streams: u32,
    pub completed_streams: u32,
    pub error_streams: u32,
    pub total_events: u32,
    pub total_tokens: u32,
    pub average_duration_ms: u64,
    pub average_events_per_stream: f64,
    pub average_tokens_per_stream: f64,
    pub success_rate: f64,
}

impl Default for StreamManager {
    fn default() -> Self {
        Self::new(StreamConfig::default())
    }
}