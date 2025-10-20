/*!
 * Coinbase AgentKit - Base production-ready skeleton
 */

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletInfo {
    pub address: String,
    pub chain: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentKitStatus {
    pub initialized: bool,
    pub selected_wallet: Option<WalletInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Balance {
    pub amount: String,
    pub symbol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferParams {
    pub to: String,
    pub amount: String,
    pub asset: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionResult {
    pub hash: String,
    pub explorer_url: Option<String>,
}

pub struct CoinbaseAgentKit {
    api_key_id: String,
    api_key_secret: String,
    selected_wallet: Arc<RwLock<Option<WalletInfo>>>,
}

impl CoinbaseAgentKit {
    pub fn new(api_key_id: String, api_key_secret: String) -> Self {
        Self {
            api_key_id,
            api_key_secret,
            selected_wallet: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn initialize(&self) -> Result<WalletInfo> {
        // Base impl: require both keys
        if self.api_key_id.is_empty() || self.api_key_secret.is_empty() {
            anyhow::bail!("CDP keys missing: set CDP_API_KEY_ID and CDP_API_KEY_SECRET")
        }
        // For base implementation, we just create a dummy local wallet info
        let info = WalletInfo { address: "0x0000000000000000000000000000000000000000".to_string(), chain: "Base-sepolia".to_string() };
        let mut w = self.selected_wallet.write().await;
        *w = Some(info.clone());
        Ok(info)
    }

    pub async fn get_status(&self) -> Result<AgentKitStatus> {
        let w = self.selected_wallet.read().await;
        Ok(AgentKitStatus { initialized: w.is_some(), selected_wallet: w.clone() })
    }

    pub async fn get_wallet_info(&self) -> Result<Option<WalletInfo>> {
        Ok(self.selected_wallet.read().await.clone())
    }

    pub async fn use_wallet(&self, address: String, chain: String) -> Result<()> {
        let mut w = self.selected_wallet.write().await;
        *w = Some(WalletInfo { address, chain });
        Ok(())
    }

    pub async fn get_balance(&self) -> Result<Balance> {
        // Base impl: not connected to a node; return zero
        Ok(Balance { amount: "0".to_string(), symbol: "ETH".to_string() })
    }

    pub async fn transfer(&self, _params: TransferParams) -> Result<TransactionResult> {
        // Base impl: offline; return dummy tx id
        Ok(TransactionResult { hash: "0x0".to_string(), explorer_url: None })
    }

    pub async fn chat(&self, message: String) -> Result<String> {
        // Base impl: echo intent
        Ok(format!("[AgentKit] {}", message))
    }
}

