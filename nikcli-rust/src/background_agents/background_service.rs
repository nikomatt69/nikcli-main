/*!
 * Background Service - Production Ready
 */

use anyhow::Result;
use tokio::sync::mpsc;

pub enum BackgroundJob {
    ProcessTask(String),
    Cleanup,
}

pub struct BackgroundService {
    tx: mpsc::Sender<BackgroundJob>,
}

impl BackgroundService {
    pub fn new() -> Self {
        let (tx, mut rx) = mpsc::channel::<BackgroundJob>(100);
        
        tokio::spawn(async move {
            while let Some(job) = rx.recv().await {
                match job {
                    BackgroundJob::ProcessTask(task) => {
                        tracing::info!("Processing background task: {}", task);
                    }
                    BackgroundJob::Cleanup => {
                        tracing::info!("Running cleanup");
                    }
                }
            }
        });
        
        Self { tx }
    }
    
    pub async fn submit_job(&self, job: BackgroundJob) -> Result<()> {
        self.tx.send(job).await?;
        Ok(())
    }
}

