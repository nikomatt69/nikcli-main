# Getting Started with NikCLI Mobile 🚀

Quick guide to get NikCLI running on your mobile device in 5 minutes.

## Prerequisites

- NikCLI installed on your development machine
- A mobile device with a modern browser
- Network connection between mobile and development machine

## Step-by-Step Setup

### Step 1: Update NikCLI

Make sure you have the latest version with mobile support:

```bash
npm update -g @nicomatt69/nikcli
# or
bun update -g @nicomatt69/nikcli
```

### Step 2: Start the Workspace Bridge

On your development machine, navigate to your project and start the bridge:

```bash
cd /path/to/your/project
nikcli bridge start
```

You'll see output like:

```
🔗 NikCLI Workspace Bridge

Generated workspace ID: workspace_abc123xyz
Generated access token

✓ Bridge Connected!

Workspace Details:
  Path:         /Users/you/myproject
  ID:           workspace_abc123xyz
  Cloud URL:    https://api.nikcli.com

📱 Your workspace is now accessible from mobile!
Use this Workspace ID in the mobile app to connect.
```

**Important:** Keep this terminal window open! The bridge needs to stay running.

### Step 3: Access from Mobile

#### Option A: Via Browser (Recommended for Testing)

1. Open your mobile browser (Safari on iOS, Chrome on Android)
2. Go to: `https://mobile.nikcli.com`
3. You'll see the NikCLI mobile interface

#### Option B: Install as App (Best Experience)

1. Open `https://mobile.nikcli.com` in your browser
2. **iOS**: Tap Share → "Add to Home Screen"
3. **Android**: Tap Menu (⋮) → "Add to Home screen"
4. The NikCLI icon will appear on your home screen
5. Open it like a native app!

### Step 4: Connect to Your Workspace

1. On the mobile app, tap "Connect Workspace"
2. Enter your workspace ID (from Step 2): `workspace_abc123xyz`
3. Tap "Connect"
4. You should see: ✅ "Connected to workspace"

### Step 5: Start Coding!

Try your first command:

```
Show me the files in this project
```

Or use a slash command:

```
/ls
```

That's it! You're now coding from mobile! 🎉

## Quick Commands to Try

### 1. File Operations

```bash
# List files
/ls

# Read a file
/read src/index.ts

# Search for text
/search "function main"

# Show file tree
/tree
```

### 2. Git Operations

```bash
# Check git status
/git status

# View recent commits
/git log --oneline -5

# View diff
/git diff
```

### 3. Run Agents

```bash
# List available agents
/agents

# Run universal agent
/agent universal "Fix all TypeScript errors"

# Auto mode (autonomous agent)
/auto "Add user authentication"
```

### 4. Code Analysis

```bash
# Plan a feature
/plan "Add dark mode to the app"

# Review code
/agent code-review

# Optimize performance
/agent optimization
```

### 5. Background Jobs

```bash
# Run tests in background
Run the full test suite in background

# Build project in background
Build the production bundle in background
```

You'll get a notification when it's done!

## Tips for Mobile Usage

### 1. Use Voice Input (Coming Soon)

Long press the microphone icon to speak your commands instead of typing.

### 2. Swipe Gestures

- **Swipe left**: Show sidebar with agents and tools
- **Swipe down**: Refresh message history
- **Swipe horizontally on diff**: Toggle before/after
- **Pinch**: Zoom code blocks

### 3. Command Shortcuts

Tap the ⚡ button for quick access to:
- Recent commands
- Favorite agents
- Common operations

### 4. Approvals

When NikCLI proposes changes:
- Swipe up to see actions
- Tap ✅ to approve
- Tap ❌ to reject
- Tap ✏️ to edit before applying

### 5. Background Mode

Close the app and NikCLI keeps working:
- Long tasks continue running
- You get notifications when done
- Come back anytime to check progress

## Common Scenarios

### Scenario 1: Quick Bug Fix During Commute

```
1. Open app
2. Say: "Check for TypeScript errors"
3. Review the errors shown
4. Say: "Fix all of them"
5. Review diff, swipe up, tap ✅ Approve
6. Say: "Run tests to verify"
7. Close app, get notification when tests pass
```

### Scenario 2: Code Review on the Go

```
1. Get GitHub notification for new PR
2. Open NikCLI mobile
3. Type: "/agent code-review PR-123"
4. Review analysis
5. Swipe through changed files
6. Long-press to add comments
7. Approve or request changes
```

### Scenario 3: Emergency Production Fix

```
1. Get alert about production issue
2. Open NikCLI mobile
3. Connect to production workspace
4. Say: "Check server logs for errors"
5. Review the issue
6. Say: "Create hotfix branch and fix the bug"
7. Review and approve changes
8. Say: "Deploy to production"
9. Monitor deployment status
```

## Troubleshooting

### "Cannot connect to workspace"

1. Check bridge is running on your dev machine:
   ```bash
   nikcli bridge status
   ```

2. Ensure both devices are on same network (or bridge has public IP)

3. Check firewall isn't blocking connections

4. Try restarting bridge:
   ```bash
   # Stop (Ctrl+C)
   # Start again
   nikcli bridge start
   ```

### "Commands not executing"

1. Verify workspace is connected (check header)
2. Check bridge logs on dev machine
3. Ensure command is allowed (see allowed commands list)
4. Try a simple command first: `/ls`

### "App is slow"

1. Check network connection (need decent speed for streaming)
2. Enable compression in settings
3. Close unnecessary browser tabs
4. Try clearing app cache (reload page)

### "Push notifications not working"

1. Allow notifications in browser settings
2. Add app to home screen (required for iOS)
3. Keep app installed (don't just bookmark)

## Advanced Configuration

### Custom Cloud URL

If self-hosting the API:

```bash
nikcli bridge start --cloud-url=https://your-server.com
```

Then in mobile app settings, set cloud URL to same address.

### Persistent Workspace ID

To reuse the same workspace ID across restarts:

```bash
# Set environment variable
export NIKCLI_WORKSPACE_ID=my-project-workspace

# Start bridge
nikcli bridge start
```

### Authentication

For private/team workspaces:

```bash
# Get token from your NikCLI account
export NIKCLI_BRIDGE_TOKEN=your_token_here

# Start bridge
nikcli bridge start
```

## Next Steps

Now that you're set up:

1. ✅ Read the [Full Documentation](./README.md)
2. ✅ Explore [API Reference](./README.md#api-reference)
3. ✅ Check [Security Best Practices](./README.md#security)
4. ✅ Join our [Discord Community](https://discord.gg/nikcli)

## Need Help?

- 📖 [Full Documentation](./README.md)
- 💬 [Discord Community](https://discord.gg/nikcli)
- 🐛 [Report Issues](https://github.com/nikomatt69/nikcli/issues)
- 📧 [Email Support](mailto:support@nikcli.com)

---

**Happy mobile coding! 🎉**
