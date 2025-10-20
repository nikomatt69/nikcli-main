/*!
 * Command Tools - Production Ready
 */

use anyhow::Result;
use std::process::Stdio;

pub async fn run_command_tool(command: &str, args: Vec<String>, cwd: Option<&str>) -> Result<String> {
    let mut cmd = tokio::process::Command::new(command);
    cmd.args(args);
    
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    let output = cmd.output().await?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        anyhow::bail!(
            "Command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
}

pub async fn bash_tool(script: &str, cwd: Option<&str>) -> Result<String> {
    let mut cmd = tokio::process::Command::new("bash");
    cmd.arg("-c").arg(script);
    
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    let output = cmd.output().await?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        anyhow::bail!(
            "Bash script failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
}

