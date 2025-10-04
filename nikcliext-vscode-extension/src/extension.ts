import * as vscode from 'vscode';
import { ConfigProvider } from './config/ConfigProvider';

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('NikCLI Configuration & Agent Manager extension is now active');

    // Initialize config provider
    const configProvider = new ConfigProvider();

    // Register command: Open Configuration
    const openConfigCommand = vscode.commands.registerCommand(
        'nikcli.openConfig',
        async () => {
            try {
                const config = await configProvider.readConfig();
                vscode.window.showInformationMessage(
                    `NikCLI Config loaded: ${config ? 'Success' : 'Not found'}`
                );
                // TODO: Open webview panel for config editing
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    // Register command: Open Agent Manager
    const openAgentsCommand = vscode.commands.registerCommand(
        'nikcli.openAgents',
        () => {
            vscode.window.showInformationMessage('Agent Manager - Coming Soon');
            // TODO: Open webview panel for agent management
        }
    );

    // Register command: Launch Background Agent
    const launchBackgroundAgentCommand = vscode.commands.registerCommand(
        'nikcli.launchBackgroundAgent',
        () => {
            vscode.window.showInformationMessage('Launching background agent...');
            // TODO: Implement background agent launcher
        }
    );

    // Register command: Refresh Configuration
    const refreshConfigCommand = vscode.commands.registerCommand(
        'nikcli.refreshConfig',
        async () => {
            try {
                await configProvider.readConfig();
                vscode.window.showInformationMessage('Configuration refreshed');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to refresh config: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    // Register command: Validate Configuration
    const validateConfigCommand = vscode.commands.registerCommand(
        'nikcli.validateConfig',
        async () => {
            try {
                const config = await configProvider.readConfig();
                // Basic validation: check if essential fields exist
                const isValid = !!(config && config.currentModel && config.models);
                if (isValid) {
                    vscode.window.showInformationMessage('Configuration is valid ✓');
                } else {
                    vscode.window.showWarningMessage('Configuration validation failed: Missing required fields');
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    // Add all commands to subscriptions
    context.subscriptions.push(
        openConfigCommand,
        openAgentsCommand,
        launchBackgroundAgentCommand,
        refreshConfigCommand,
        validateConfigCommand
    );
}

/**
 * Extension deactivation cleanup
 */
export function deactivate() {
    console.log('NikCLI extension deactivated');
}

