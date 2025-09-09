# Boxen Panels in src/cli/nik-cli.ts

This document lists each `boxen(` call with its line number and detected `title` (if any).

Note: A unified panel helper is now available at `src/cli/utils/panel.ts`.

- Use `printPanel(content, options)` for consistent panels with:
  - Default padding and rounded borders
  - Automatic wrapping to terminal width
  - Guaranteed one blank line after each panel

Example:

```ts
import { printPanel } from '@utils/panel';

printPanel('Hello world', { title: 'Demo', borderColor: 'cyan' });
```

| Line  | Title                                          | Snippet                                                                                                                                         |
| ----- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1175  | '🧠 Planning'                                  | `console.log(boxen(content, {`                                                                                                                  |
| 1189  | '🧠 Planning'                                  | `console.log(boxen(content, {`                                                                                                                  |
| 1619  | `<none>`                                       | `const header = boxen(`                                                                                                                         |
| 2082  | '⌨️ Keyboard & Commands'                       | `const panel = boxen(lines.join('\n'), {`                                                                                                       |
| 2676  | '📥 Input Queue'                               | `console.log(boxen(lines.join('\n'), { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' }));`       |
| 2682  | '📥 Input Queue'                               | `console.log(boxen(`Cleared ${cleared} inputs from queue`, { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderC...`  |
| 2686  | '📥 Input Queue'                               | `console.log(boxen('Processing next queued input…', { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderColor: '...`  |
| 2690  | '📥 Input Queue'                               | `console.log(boxen([`                                                                                                                           |
| 3475  | '🤖 Parallel'                                  | `console.log(boxen('Usage: /parallel <agent1,agent2,...> <task>', { title: '🤖 Parallel', padding: 1, margin: 1, borderStyle: 'round', bor...`  |
| 3481  | '🤖 Parallel'                                  | `console.log(boxen(`Running ${agentNames.length} agents in parallel...`, { title: '🤖 Parallel', padding: 1, margin: 1, borderStyle: 'roun...`  |
| 3484  | '✅ Parallel'                                  | `console.log(boxen('All agents launched successfully', { title: '✅ Parallel', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'g...` |
| 3486  | '❌ Parallel'                                  | `console.log(boxen(`Parallel execution error: ${e.message}`, { title: '❌ Parallel', padding: 1, margin: 1, borderStyle: 'round', borderCol...` |
| 3497  | '🧬 Create Agent'                              | `console.log(boxen('Usage: /create-agent [--vm\|--container] <name> <specialization>\nExamples:\n  /create-agent react-expert "React develo...` |
| 3506  | '🚀 Launch Agent'                              | `console.log(boxen('Usage: /launch-agent <blueprint-id> [task]', { title: '🚀 Launch Agent', padding: 1, margin: 1, borderStyle: 'round', ...`  |
| 4202  | `<none>`                                       | `const summary = boxen(`                                                                                                                        |
| 4697  | '🔍 NikCLI Status'                             | `const panel = boxen(lines.join('\n'), {`                                                                                                       |
| 5110  | '🔄 Processes'                                 | `console.log(boxen('No processes currently running', { title: '🔄 Processes', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'y...`  |
| 5119  | `🔄 Processes (${processes.length              | `console.log(boxen(lines.join('\n'), { title: `🔄 Processes (${processes.length})`, padding: 1, margin: 1, borderStyle: 'round', borderCol...`  |
| 5133  | '🛑 Kill Process'                              | `console.log(boxen(`Attempting to kill process ${pid}…`, { title: '🛑 Kill Process', padding: 1, margin: 1, borderStyle: 'round', borderCo...`  |
| 5135  | success ? '✅ Kill Success' : '❌ Kill Failed' | `console.log(boxen(success ? `Process ${pid} terminated`:`Could not kill process ${pid}`, { title: success ? '✅ Kill Success' : '❌ Kill ...`  |
| 5189  | '✅ Lint'                                      | `console.log(boxen('No linting errors found', { title: '✅ Lint', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));`       |
| 5199  | '⚠️ Lint'                                      | `console.log(boxen(lines.join('\n'), { title: '⚠️ Lint', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));`               |
| 5205  | '🧱 Create'                                    | `console.log(boxen('Usage: /create <type> <name>\nTypes: react, next, node, express', { title: '🧱 Create', padding: 1, margin: 1, borderS...`  |
| 5212  | '✅ Create'                                    | `console.log(boxen(lines.join('\n'), { title: '✅ Create', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));`              |
| 5214  | '❌ Create'                                    | `console.log(boxen(`Failed to create project ${name}`, { title: '❌ Create', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red...` |
| 5231  | '🆕 New Session'                               | `console.log(boxen(`${session.title} (${session.id.slice(0, 8)})`, { title: '🆕 New Session', padding: 1, margin: 1, borderStyle: 'round',...`  |
| 5249  | '📝 Chat Sessions'                             | `console.log(boxen(lines.join('\n'), { title: '📝 Chat Sessions', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));`        |
| 5257  | '📤 Export'                                    | `console.log(boxen(`Session exported to ${filename}`, { title: '📤 Export', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'gre...`  |
| 5269  | '📊 Usage Statistics'                          | `console.log(boxen(content, { title: '📊 Usage Statistics', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }));`              |
| 5372  | '🤖 Model Updated'                             | `console.log(boxen(`Switched to model: ${modelName}\nApplied immediately (no restart needed)`, {`                                               |
| 5392  | '🔑 API Key Missing'                           | `console.log(boxen(`                                                                                                                            |
| 5551  | '🌍 Workspace Context'                         | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 5563  | '🌍 Workspace Context Updated'                 | `console.log(boxen(confirm, {`                                                                                                                  |
| 5578  | '📡 Agent Streams'                             | `console.log(boxen('All agent streams cleared', {`                                                                                              |
| 5583  | '📡 Agent Streams'                             | `console.log(boxen('Live dashboard opened in terminal', {`                                                                                      |
| 5651  | '📚 Documentation System'                      | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 5774  | '📚 Documentation'                             | `console.log(boxen(content, {`                                                                                                                  |
| 5846  | '📋 Documentation'                             | `console.log(boxen(msg, { title: '📋 Documentation', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));`                   |
| 5863  | `<none>`                                       | `console.log(boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));`                            |
| 5898  | '⚠️ Docs Sync'                                 | `console.log(boxen('Cloud documentation not configured\nSet SUPABASE_URL and SUPABASE_ANON_KEY or use /config to enable', { title: '⚠️ Doc...`  |
| 5912  | '🔄 Docs Sync'                                 | `console.log(boxen(lines.join('\n'), { title: '🔄 Docs Sync', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));`           |
| 5940  | '📚 Load Docs'                                 | `console.log(boxen(lines.join('\n'), { title: '📚 Load Docs', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));`          |
| 5944  | '📚 Load Docs'                                 | `console.log(boxen(`Loading ${args.length} document(s) into AI context…`, { title: '📚 Load Docs', padding: 1, margin: 1, borderStyle: 'ro...`  |
| 6255  | `<none>`                                       | `console.log(boxen(`                                                                                                                            |
| 6892  | '📦 Compact Session'                           | `const box = boxen('Session too short to compact', {`                                                                                           |
| 6943  | '📦 Compact Session'                           | `console.log(boxen(details, {`                                                                                                                  |
| 6949  | '❌ Compact Error'                             | `console.log(boxen(`Error compacting session: ${error.message}`, {`                                                                             |
| 7013  | `<none>`                                       | `console.log(boxen(`                                                                                                                            |
| 7071  | `<none>`                                       | `console.log(boxen(`                                                                                                                            |
| 7117  | `<none>`                                       | `console.log(boxen(`                                                                                                                            |
| 7203  | `<none>`                                       | `console.log(boxen(`                                                                                                                            |
| 7256  | `<none>`                                       | `console.log(boxen(`                                                                                                                            |
| 7287  | '📋 Message Breakdown'                         | `console.log(boxen(lines.join('\n'), { title: '📋 Message Breakdown', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));`    |
| 7314  | '💸 Model Pricing Comparison'                  | `console.log(boxen(lines.join('\n'), { title: '💸 Model Pricing Comparison', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'bl...`  |
| 7319  | '🏷️ Current Model Pricing'                     | `console.log(boxen([`                                                                                                                           |
| 7329  | '📊 Cost Projections'                          | `console.log(boxen([`                                                                                                                           |
| 7351  | '🔀 Router: Avg Spend per Model (per 1K)'      | `console.log(boxen(lines.join('\n'), { title: '🔀 Router: Avg Spend per Model (per 1K)', padding: 1, margin: 1, borderStyle: 'round', bord...`  |
| 7442  | '📋 Todos'                                     | `console.log(boxen('No todo lists found', {`                                                                                                    |
| 7459  | '📋 Todos'                                     | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 7477  | '📋 Todos'                                     | `console.log(boxen('No todo lists found', {`                                                                                                    |
| 7507  | '📋 Todos: Auto Mode'                          | `console.log(boxen('Auto‑todos enabled (complex inputs can trigger background todos).\nUse "/todos off" to require explicit "todo".', {`        |
| 7512  | '📋 Todos: Explicit Mode'                      | `console.log(boxen('Auto‑todos disabled. Only messages containing "todo" will trigger todos.\nUse "/todos on" to enable automatic triggeri...`  |
| 7518  | '📋 Todos: Status'                             | `console.log(boxen(`Current: ${status}\n- on = auto (complex inputs can trigger)\n- off = explicit only (requires "todo")`, {`                  |
| 7523  | '📋 Todos'                                     | `console.log(boxen(`Unknown todo command: ${subcommand}\nAvailable: show \| open \| edit \| on \| off \| status`, {`                            |
| 7530  | '❌ Todos Error'                               | `console.log(boxen(`Todo operation failed: ${error.message}`, {`                                                                                |
| 7562  | '🔮 MCP Commands'                              | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 7638  | '🔮 MCP'                                       | `console.log(boxen(`Unknown MCP command: ${command}\nUse /mcp for available commands`, {`                                                       |
| 7643  | '❌ MCP Error'                                 | `console.log(boxen(`MCP command failed: ${error.message}`, {`                                                                                   |
| 8195  | '📚 Available Slash Commands'                  | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 8211  | `<none>`                                       | `console.log(boxen(`                                                                                                                            |
| 8313  | '🧭 Project Initialized'                       | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 8319  | '📘 NIKOCLI.md (Preview)'                      | `console.log(boxen(preview + (overview.markdown.includes('\n', 1) ? '\n\n… (truncated)' : ''), {`                                               |
| 8328  | '❌ Init Error'                                | `console.log(boxen(`Failed to initialize project: ${error.message}`, {`                                                                         |
| 10000 | '📋 Git Commit History'                        | `const historyBox = boxen(formattedHistory, {`                                                                                                  |
| 10037 | '🧠 Memory: Help'                              | `console.log(boxen(lines, {`                                                                                                                    |
| 10073 | '🧠 Memory: Statistics'                        | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10094 | '🧠 Memory: Configuration'                     | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10107 | '🧠 Memory: Context'                           | `console.log(boxen('No active memory session', {`                                                                                               |
| 10135 | '🧠 Memory: Context'                           | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10148 | '🧠 Memory: Personalization'                   | `console.log(boxen('No user ID in current session', {`                                                                                          |
| 10159 | '🧠 Memory: Personalization'                   | `console.log(boxen('No personalization data available', {`                                                                                      |
| 10177 | '🧠 Memory: Personalization'                   | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10199 | '🧠 Memory: Cleanup'                           | `console.log(boxen(msg, {`                                                                                                                      |
| 10213 | '❌ Memory Error'                              | `console.log(boxen(`Memory command failed: ${error.message}`,`                                                                                  |
| 10348 | '🔍 IDE Diagnostics: Help'                     | `console.log(boxen(content, {`                                                                                                                  |
| 10384 | '🔍 IDE Diagnostics: Monitoring'               | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10397 | '🔍 IDE Diagnostics: Monitoring Stopped'       | `console.log(boxen(content, {`                                                                                                                  |
| 10421 | '🔍 IDE Diagnostics: Status'                   | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10464 | '📊 Diagnostic Results'                        | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10478 | '🔍 IDE Diagnostics'                           | `console.log(boxen(content, {`                                                                                                                  |
| 10488 | '❌ Diagnostic Error'                          | `console.log(boxen(`Diagnostic command failed: ${error.message}`, {`                                                                            |
| 10510 | '📸 Snapshot Commands'                         | `console.log(boxen(content, {`                                                                                                                  |
| 10537 | '📸 Snapshot Created'                          | `console.log(boxen(`Snapshot created: ${name}\nID: ${id}`, {`                                                                                   |
| 10541 | '❌ Snapshot Error'                            | `console.log(boxen(`Snapshot failed: ${error.message}`, {`                                                                                      |
| 10555 | '📸 Snapshots'                                 | `console.log(boxen('No snapshots found', {`                                                                                                     |
| 10568 | '📸 Snapshots'                                 | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10572 | '❌ Snapshots Error'                           | `console.log(boxen(`List snapshots failed: ${error.message}`, {`                                                                                |
| 10584 | '📸 Restore Snapshot'                          | `console.log(boxen('Usage: /restore <snapshot-id>', {`                                                                                          |
| 10591 | '📸 Snapshot Restored'                         | `console.log(boxen(`Restored snapshot: ${id}`, {`                                                                                               |
| 10595 | '❌ Restore Error'                             | `console.log(boxen(`Restore failed: ${error.message}`, {`                                                                                       |
| 10625 | '🔒 Security Status'                           | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10640 | '🔒 Security Help'                             | `console.log(boxen(content, {`                                                                                                                  |
| 10653 | '🔒 Security Updated'                          | `console.log(boxen(`Security mode set to: ${value}`, {`                                                                                         |
| 10661 | '🔒 Security Error'                            | `console.log(boxen('Invalid setting. Only security-mode is supported here.', {`                                                                 |
| 10679 | '🔒 Security Help'                             | `console.log(boxen(content, {`                                                                                                                  |
| 10689 | '🔒 Security'                                  | `console.log(boxen(`Unknown security command: ${sub}\nUse /security help`, {`                                                                   |
| 10699 | '❌ Security Error'                            | `console.log(boxen(`Security command failed: ${error.message}`, {`                                                                              |
| 10725 | '🛠️ Developer Mode'                            | `console.log(boxen(content, {`                                                                                                                  |
| 10737 | '🛠️ Developer Mode: Status'                    | `console.log(boxen(content, {`                                                                                                                  |
| 10754 | '🛠️ Developer Mode: Help'                      | `console.log(boxen(lines.join('\n'), {`                                                                                                         |
| 10764 | '🛠️ Developer Mode'                            | `console.log(boxen(`Unknown dev-mode command: ${action}\nUse /dev-mode help`, {`                                                                |
| 10774 | '❌ Developer Mode Error'                      | `console.log(boxen(`Dev-mode command failed: ${error.message}`, {`                                                                              |
| 10792 | '🔒 Safe Mode Enabled'                         | `console.log(boxen('Maximum security restrictions. All risky operations require approval.\nUse /security status to see details.', {`            |
| 10800 | '🔒 Safe Mode Error'                           | `console.log(boxen(`Safe mode command failed: ${error.message}`, {`                                                                             |
| 10816 | '✅ Approvals Cleared'                         | `console.log(boxen('All session approvals cleared. Next operations will require fresh approval.', {`                                            |
| 10824 | '❌ Approvals Error'                           | `console.log(boxen(`Clear approvals command failed: ${error.message}`, {`                                                                       |
| 12206 | '🤖 Available Agents'                          | `const agentsBox = boxen(agentsList.trim(), {`                                                                                                  |
| 12229 | '🏭 Agent Factory'                             | `const factoryBox = boxen(factoryInfo, {`                                                                                                       |
| 12254 | '📋 Agent Blueprints'                          | `const blueprintsBox = boxen(blueprintsInfo, {`                                                                                                 |
| 12381 | '⚙️ Configuration Panel'                       | `const configBox = boxen(lines.join('\n'), {`                                                                                                   |
| 12606 | '🤖 Models Panel'                              | `const modelsBox = boxen(modelsContent.trim(), {`                                                                                               |
| 12627 | '🔑 Set API Key'                               | `console.log(boxen('No models configured. Use /models to review configuration.', {`                                                             |
| 12645 | '🔑 Set API Key – Provider'                    | `console.log(boxen('Select the provider to configure the API key.', {`                                                                          |
| 12673 | 'ℹ️ No Key Required'                           | `console.log(boxen('Ollama provider does not require API keys.', {`                                                                             |
| 12681 | '❌ Set API Key'                               | `console.log(boxen(`No models found for provider: ${provider}`, {`                                                                              |
| 12688 | '🔑 Set API Key – Model'                       | `console.log(boxen(`Provider: ${provider}\nSelect the model to attach the key.`, {`                                                             |
| 12713 | '🔑 Set API Key – Secret'                      | `console.log(boxen(`Model: ${modelName}\nEnter the API key for ${provider}. It will be stored encrypted.`, {`                                   |
| 12755 | '✅ API Key Saved'                             | `console.log(boxen(content, {`                                                                                                                  |
| 12759 | '❌ Set API Key'                               | `console.log(boxen(`Failed to set API key: ${error.message}`, {`                                                                                |
| 12797 | '🤖 Current Model'                             | `console.log(boxen(content, {`                                                                                                                  |
| 12805 | '❌ Model Error'                               | `console.log(boxen(`Failed to show model: ${error.message}`, {`                                                                                 |
