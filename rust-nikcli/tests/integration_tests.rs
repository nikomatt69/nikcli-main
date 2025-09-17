use assert_cmd::prelude::*;
use predicates::prelude::*;
use std::process::Command;
use tempfile::tempdir;

/// Test basic CLI functionality
#[test]
fn test_cli_help() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("--help");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("NikCLI - Context-Aware AI Development Assistant"));
}

/// Test version command
#[test]
fn test_cli_version() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("--version");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("nikcli"));
}

/// Test config show command
#[test]
fn test_config_show() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("config").arg("show");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Current Configuration"));
}

/// Test config validation
#[test]
fn test_config_validate() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("config").arg("validate");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Configuration is valid"));
}

/// Test agent list command
#[test]
fn test_agent_list() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("agent").arg("list");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Available Agents"));
}

/// Test agent status command
#[test]
fn test_agent_status() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("agent").arg("status");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("All Agents Status"));
}

/// Test report command with temp directory
#[test]
fn test_report_generation() {
    let temp_dir = tempdir().unwrap();
    
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("report")
        .arg("--report-type")
        .arg("analysis")
        .arg("--depth")
        .arg("2")
        .arg(temp_dir.path());
    
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Project Analysis Report"));
}

/// Test invalid command
#[test]
fn test_invalid_command() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("invalid-command");
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("unrecognized subcommand"));
}

/// Test config set with invalid value
#[test]
fn test_config_set_invalid() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("config")
        .arg("set")
        .arg("temperature")
        .arg("invalid");
    
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Invalid temperature value"));
}

/// Test agent start with invalid agent
#[test]
fn test_agent_start_invalid() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("agent")
        .arg("start")
        .arg("invalid-agent");
    
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Unknown agent"));
}

/// Test report with invalid type
#[test]
fn test_report_invalid_type() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("report")
        .arg("--report-type")
        .arg("invalid-type");
    
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Unknown report type"));
}

/// Test verbose flag
#[test]
fn test_verbose_flag() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("--verbose")
        .arg("config")
        .arg("show");
    
    cmd.assert()
        .success();
}

/// Test quiet flag
#[test]
fn test_quiet_flag() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("--quiet")
        .arg("config")
        .arg("show");
    
    cmd.assert()
        .success();
}

/// Test workdir flag
#[test]
fn test_workdir_flag() {
    let temp_dir = tempdir().unwrap();
    
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("--workdir")
        .arg(temp_dir.path())
        .arg("config")
        .arg("show");
    
    cmd.assert()
        .success();
}

/// Test config file flag
#[test]
fn test_config_file_flag() {
    let temp_dir = tempdir().unwrap();
    let config_file = temp_dir.path().join("test_config.toml");
    
    // Create a minimal config file
    std::fs::write(&config_file, r#"
current_model = "claude-3-sonnet"
temperature = 0.7
max_tokens = 8000
"#).unwrap();
    
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("--config")
        .arg(&config_file)
        .arg("config")
        .arg("show");
    
    cmd.assert()
        .success();
}

/// Test help command
#[test]
fn test_help_command() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("help");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("NikCLI Help"));
}

/// Test version command
#[test]
fn test_version_command() {
    let mut cmd = Command::cargo_bin("nikcli").unwrap();
    cmd.arg("version");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Version Information"));
}