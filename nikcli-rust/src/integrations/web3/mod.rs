/*!
 * Web3 Integration Module
 * Complete interface for Coinbase AgentKit and Web3 operations
 */

pub mod coinbase_agentkit;
pub mod web3_provider;

pub use coinbase_agentkit::{CoinbaseAgentKit, AgentKitStatus, WalletInfo, Balance, TransferParams, TransactionResult};
pub use web3_provider::Web3Provider;

