/*!
 * Async Lock - Production Ready
 */

use std::sync::Arc;
use tokio::sync::{Mutex, MutexGuard};

pub struct AsyncLock<T> {
    inner: Arc<Mutex<T>>,
}

impl<T> AsyncLock<T> {
    pub fn new(value: T) -> Self {
        Self {
            inner: Arc::new(Mutex::new(value)),
        }
    }
    
    pub async fn lock(&self) -> MutexGuard<'_, T> {
        self.inner.lock().await
    }
}

impl<T> Clone for AsyncLock<T> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

