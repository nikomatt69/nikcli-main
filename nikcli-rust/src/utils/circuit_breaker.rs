/*!
 * Circuit Breaker - Production Ready
 */

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

pub struct CircuitBreaker {
    failure_threshold: u32,
    success_threshold: u32,
    timeout_ms: u64,
    failure_count: Arc<AtomicU32>,
    success_count: Arc<AtomicU32>,
    last_failure_time: Arc<AtomicU64>,
    state: Arc<AtomicU32>,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, timeout_ms: u64) -> Self {
        Self {
            failure_threshold,
            success_threshold: 2,
            timeout_ms,
            failure_count: Arc::new(AtomicU32::new(0)),
            success_count: Arc::new(AtomicU32::new(0)),
            last_failure_time: Arc::new(AtomicU64::new(0)),
            state: Arc::new(AtomicU32::new(CircuitState::Closed as u32)),
        }
    }
    
    pub fn record_success(&self) {
        self.success_count.fetch_add(1, Ordering::Relaxed);
        
        if self.get_state() == CircuitState::HalfOpen {
            if self.success_count.load(Ordering::Relaxed) >= self.success_threshold {
                self.close();
            }
        }
    }
    
    pub fn record_failure(&self) {
        self.failure_count.fetch_add(1, Ordering::Relaxed);
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        
        self.last_failure_time.store(now, Ordering::Relaxed);
        
        if self.failure_count.load(Ordering::Relaxed) >= self.failure_threshold {
            self.open();
        }
    }
    
    pub fn is_open(&self) -> bool {
        let state = self.get_state();
        
        if state == CircuitState::Open {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;
            
            let last_failure = self.last_failure_time.load(Ordering::Relaxed);
            
            if now - last_failure > self.timeout_ms {
                self.half_open();
                false
            } else {
                true
            }
        } else {
            false
        }
    }
    
    fn get_state(&self) -> CircuitState {
        match self.state.load(Ordering::Relaxed) {
            0 => CircuitState::Closed,
            1 => CircuitState::Open,
            2 => CircuitState::HalfOpen,
            _ => CircuitState::Closed,
        }
    }
    
    fn open(&self) {
        self.state.store(CircuitState::Open as u32, Ordering::Relaxed);
    }
    
    fn close(&self) {
        self.state.store(CircuitState::Closed as u32, Ordering::Relaxed);
        self.failure_count.store(0, Ordering::Relaxed);
        self.success_count.store(0, Ordering::Relaxed);
    }
    
    fn half_open(&self) {
        self.state.store(CircuitState::HalfOpen as u32, Ordering::Relaxed);
        self.success_count.store(0, Ordering::Relaxed);
    }
}

