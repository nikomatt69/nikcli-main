pub mod args;
pub mod commands;

use crate::error::{NikCliError, NikCliResult};
use args::Args;

/// Execute the main CLI logic based on parsed arguments
pub async fn execute(args: Args) -> NikCliResult<()> {
    match args.command {
        args::Command::Chat(chat_args) => {
            commands::chat::execute(chat_args).await
        }
        args::Command::Config(config_args) => {
            commands::config::execute(config_args).await
        }
        args::Command::Agent(agent_args) => {
            commands::agent::execute(agent_args).await
        }
        args::Command::Report(report_args) => {
            commands::report::execute(report_args).await
        }
        args::Command::Version => {
            commands::version::execute().await
        }
        args::Command::Help => {
            commands::help::execute().await
        }
    }
}