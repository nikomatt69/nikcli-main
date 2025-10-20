/*!
 * Stream Manager - Production Ready
 */

use anyhow::Result;
use tokio::sync::mpsc;

pub struct StreamManager {
    buffer_size: usize,
}

impl StreamManager {
    pub fn new(buffer_size: usize) -> Self {
        Self { buffer_size }
    }
    
    pub fn create_stream(&self) -> (mpsc::Sender<String>, mpsc::Receiver<String>) {
        mpsc::channel(self.buffer_size)
    }
}

impl Default for StreamManager {
    fn default() -> Self {
        Self::new(1000)
    }
}

