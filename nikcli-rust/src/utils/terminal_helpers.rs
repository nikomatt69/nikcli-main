/*!
 * Terminal Helper Utilities
 * Port of terminal helper functions from TypeScript
 */

use colored::*;

/// Extract quoted argument from command line parts
/// Handles both single and double quotes
pub fn extract_quoted(parts: &[String]) -> (String, Vec<String>) {
    if parts.is_empty() {
        return (String::new(), vec![]);
    }
    
    let first = &parts[0];
    let quote = if first.starts_with('"') {
        Some('"')
    } else if first.starts_with('\'') {
        Some('\'')
    } else {
        None
    };
    
    match quote {
        None => (first.clone(), parts[1..].to_vec()),
        Some(q) => {
            let mut collected = vec![first.trim_start_matches(q).to_string()];
            
            for (i, token) in parts[1..].iter().enumerate() {
                if token.ends_with(q) {
                    collected.push(token.trim_end_matches(q).to_string());
                    return (
                        collected.join(" "),
                        parts[i + 2..].to_vec(),
                    );
                }
                collected.push(token.clone());
            }
            
            (collected.join(" "), vec![])
        }
    }
}

/// Format bytes to human-readable size
pub fn format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    format!("{:.2} {}", size, UNITS[unit_index])
}

/// Format seconds to human-readable uptime
pub fn format_uptime(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    
    if hours > 0 {
        format!("{}h {}m {}s", hours, minutes, secs)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, secs)
    } else {
        format!("{}s", secs)
    }
}

/// Format duration in minutes to human-readable string
pub fn format_duration(minutes: f64) -> String {
    if minutes < 1.0 {
        format!("{}s", (minutes * 60.0).round())
    } else if minutes < 60.0 {
        format!("{}m", minutes.round())
    } else {
        let hours = (minutes / 60.0).floor();
        let mins = (minutes % 60.0).round();
        format!("{}h {}m", hours, mins)
    }
}

/// Format time ago (milliseconds to human readable)
pub fn format_time_ago(ms: u64) -> String {
    let seconds = ms / 1000;
    let minutes = seconds / 60;
    let hours = minutes / 60;
    let days = hours / 24;
    
    if days > 0 {
        format!("{}d", days)
    } else if hours > 0 {
        format!("{}h", hours)
    } else if minutes > 0 {
        format!("{}m", minutes)
    } else {
        format!("{}s", seconds)
    }
}

/// Format tokens with K/M suffix
// removed duplicate format_tokens (see below)

/// Create ASCII table with borders
pub fn create_ascii_table(headers: &[String], rows: &[Vec<String>]) -> String {
    if rows.is_empty() {
        return "No data available".to_string();
    }
    
    // Calculate column widths
    let col_widths: Vec<usize> = headers.iter().enumerate().map(|(i, header)| {
        let header_len = header.len();
        let max_row_len = rows.iter()
            .map(|row| row.get(i).map(|s| s.len()).unwrap_or(0))
            .max()
            .unwrap_or(0);
        header_len.max(max_row_len) + 2
    }).collect();
    
    let mut lines = Vec::new();
    
    // Top border
    lines.push(format!("┌{}┐", 
        col_widths.iter().map(|w| "─".repeat(*w)).collect::<Vec<_>>().join("┬")
    ));
    
    // Headers
    let header_row = format!("│{}│",
        headers.iter().enumerate()
            .map(|(i, h)| format!(" {:<width$}", h, width = col_widths[i] - 1))
            .collect::<Vec<_>>()
            .join("│")
    );
    lines.push(header_row);
    
    // Header separator
    lines.push(format!("├{}┤",
        col_widths.iter().map(|w| "─".repeat(*w)).collect::<Vec<_>>().join("┼")
    ));
    
    // Data rows
    for row in rows {
        let data_row = format!("│{}│",
            row.iter().enumerate()
                .map(|(i, cell)| format!(" {:<width$}", cell, width = col_widths[i] - 1))
                .collect::<Vec<_>>()
                .join("│")
        );
        lines.push(data_row);
    }
    
    // Bottom border
    lines.push(format!("└{}┘",
        col_widths.iter().map(|w| "─".repeat(*w)).collect::<Vec<_>>().join("┴")
    ));
    
    lines.join("\n")
}

/// Create simple table without outer borders
pub fn create_simple_table(data: &[(String, String)]) -> String {
    if data.is_empty() {
        return "No data available".to_string();
    }
    
    let max_metric_width = data.iter().map(|(m, _)| m.len()).max().unwrap_or(0);
    let max_value_width = data.iter().map(|(_, v)| v.len()).max().unwrap_or(0);
    
    data.iter()
        .map(|(metric, value)| {
            format!("{:<metric_w$} │ {:>value_w$}",
                metric.cyan(),
                value.white(),
                metric_w = max_metric_width,
                value_w = max_value_width
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Create progress bar string
pub fn create_progress_bar(percentage: f64, width: usize) -> String {
    let filled = ((percentage / 100.0) * width as f64).round() as usize;
    let empty = width.saturating_sub(filled);
    
    let color = if percentage >= 90.0 {
        "red"
    } else if percentage >= 80.0 {
        "yellow"
    } else if percentage >= 50.0 {
        "blue"
    } else {
        "green"
    };
    
    let filled_str = "█".repeat(filled);
    let empty_str = "░".repeat(empty);
    
    match color {
        "red" => format!("{}{}", filled_str.red(), empty_str.bright_black()),
        "yellow" => format!("{}{}", filled_str.yellow(), empty_str.bright_black()),
        "blue" => format!("{}{}", filled_str.blue(), empty_str.bright_black()),
        _ => format!("{}{}", filled_str.green(), empty_str.bright_black()),
    }
}

/// Strip ANSI escape codes from string
pub fn strip_ansi(s: &str) -> String {
    let re = regex::Regex::new(r"\x1b\[[0-9;]*m").unwrap();
    re.replace_all(s, "").to_string()
}

/// Create detailed progress bar with special characters (Claude Code style)
pub fn create_detailed_progress_bar(percentage: f64, width: usize) -> String {
    let filled_count = ((percentage / 100.0) * width as f64).floor() as usize;
    let empty_count = width.saturating_sub(filled_count);
    
    let filled_char = "⛁";
    let empty_char = "⛶";
    
    let color = if percentage >= 90.0 {
        "#ff3366"
    } else if percentage >= 80.0 {
        "#ff9933"
    } else if percentage >= 50.0 {
        "#3366ff"
    } else {
        "#00b2b2"
    };
    
    // Note: colored crate doesn't support hex colors directly, using named colors
    let filled_str = filled_char.repeat(filled_count);
    let empty_str = empty_char.repeat(empty_count);
    
    if percentage >= 90.0 {
        format!("{}{}", filled_str.red(), empty_str.bright_black())
    } else if percentage >= 80.0 {
        format!("{}{}", filled_str.yellow(), empty_str.bright_black())
    } else if percentage >= 50.0 {
        format!("{}{}", filled_str.blue(), empty_str.bright_black())
    } else {
        format!("{}{}", filled_str.cyan(), empty_str.bright_black())
    }
}

/// Format token count in human-readable format
pub fn format_tokens(tokens: u64) -> String {
    if tokens < 1_000 {
        format!("{}", tokens)
    } else if tokens < 1_000_000 {
        format!("{:.1}k", tokens as f64 / 1000.0)
    } else {
        format!("{:.1}M", tokens as f64 / 1_000_000.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_format_size() {
        assert_eq!(format_size(0), "0.00 B");
        assert_eq!(format_size(1024), "1.00 KB");
        assert_eq!(format_size(1024 * 1024), "1.00 MB");
        assert_eq!(format_size(1024 * 1024 * 1024), "1.00 GB");
    }
    
    #[test]
    fn test_format_uptime() {
        assert_eq!(format_uptime(30), "30s");
        assert_eq!(format_uptime(90), "1m 30s");
        assert_eq!(format_uptime(3661), "1h 1m 1s");
    }
    
    #[test]
    fn test_format_tokens() {
        assert_eq!(format_tokens(500), "500");
        assert_eq!(format_tokens(1500), "1.5k");
        assert_eq!(format_tokens(1_500_000), "1.5M");
    }
    
    #[test]
    fn test_extract_quoted() {
        let args = vec![
            "\"hello world\"".to_string(),
            "next".to_string(),
        ];
        let (value, rest) = extract_quoted(&args);
        assert_eq!(value, "hello world");
        assert_eq!(rest, vec!["next".to_string()]);
    }
}
