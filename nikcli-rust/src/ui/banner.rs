use colored::Colorize;
use super::UIManager;

/// Render the welcome banner
pub fn render_welcome_banner(ui: &UIManager) {
    let banner = r#"
    ███╗   ██╗██╗██╗  ██╗     ██████╗██╗     ██╗
    ████╗  ██║██║██║ ██╔╝    ██╔════╝██║     ██║
    ██╔██╗ ██║██║█████╔╝     ██║     ██║     ██║
    ██║╚██╗██║██║██╔═██╗     ██║     ██║     ██║
    ██║ ╚████║██║██║  ██╗    ╚██████╗███████╗██║
    ╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝     ╚═════╝╚══════╝╚═╝
    "#;

    println!("{}", banner.bright_blue().bold());

    println!("{}", "    Rust Edition - Advanced AI-powered CLI Assistant".bright_cyan());
    println!();

    ui.print_divider();

    println!("  {} Type {} for available commands", "•".bright_yellow(), "/help".bright_green());
    println!("  {} Use {} or {} to exit", "•".bright_yellow(), "/exit".bright_green(), "Ctrl+D".bright_green());
    println!("  {} Press {} to interrupt operations", "•".bright_yellow(), "Ctrl+C".bright_green());

    ui.print_divider();
    println!();
}
