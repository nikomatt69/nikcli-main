/*!
 * Chat Stream Manager - Production Ready
 */

use tokio::sync::mpsc;

pub struct ChatStreamManager {
    tx: mpsc::Sender<String>,
    rx: Option<mpsc::Receiver<String>>,
}

impl ChatStreamManager {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        Self {
            tx,
            rx: Some(rx),
        }
    }
    
    pub async fn send_chunk(&self, chunk: String) -> Result<(), mpsc::error::SendError<String>> {
        self.tx.send(chunk).await
    }
    
    pub fn take_receiver(&mut self) -> Option<mpsc::Receiver<String>> {
        self.rx.take()
    }
}

impl Default for ChatStreamManager {
    fn default() -> Self {
        Self::new()
    }
}

