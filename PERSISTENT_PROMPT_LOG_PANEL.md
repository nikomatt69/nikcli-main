# Persistent Prompt and Scrollable Log Panel Implementation

## Overview
Implemented a persistent prompt at the bottom of the terminal with a scrollable log panel above it. All CLI chat outputs, text-delta streams, and structured logs now appear in the scrollable panel while the prompt and status bar remain fixed at the bottom.

## Changes Made

### 1. Added New Properties to NikCLI Class (`src/cli/nik-cli.ts`)

```typescript
// Persistent prompt and scrollable log panel
private logBuffer: string[] = []
private maxLogLines: number = 1000
private logScrollOffset: number = 0
private promptAreaHeight: number = 4 // Fixed height for prompt + status bar
```

### 2. Modified Terminal Dimensions Calculation

Updated `updateTerminalDimensions()` to properly reserve space for the fixed prompt area:

```typescript
private updateTerminalDimensions(): void {
  this.terminalHeight = process.stdout.rows || 24
  this.chatAreaHeight = this.terminalHeight - this.promptAreaHeight // Reserve space for fixed prompt area
}
```

### 3. Added Scrollable Log Panel Management

#### New Method: `addLogMessage(message: string)`
- Splits messages into lines
- Adds them to the log buffer
- Auto-scrolls to bottom on new content
- Maintains a maximum of 1000 log lines

#### New Method: `renderScrollableLogPanel()`
- Renders logs in the top portion of the terminal
- Shows the most recent logs that fit in the available space
- Supports scrolling (offset management)
- Adds a separator line between logs and prompt

### 4. Console Output Interception

#### New Method: `interceptConsoleOutput()`
Intercepts all console output to redirect it to the scrollable log panel:
- Overrides `console.log()`
- Overrides `console.error()` with red styling
- Overrides `console.warn()` with yellow styling
- Only intercepts when in chat mode and not printing panels

#### New Method: `bridgeAdvancedUIToLogPanel()`
Bridges `advancedUI` live updates to the log panel:
- Intercepts `advancedUI.addLiveUpdate()`
- Formats updates with appropriate icons
- Redirects to scrollable log panel

#### New Method: `getUpdateIcon(type: string)`
Returns appropriate icons for different update types:
- `info` → ℹ (blue)
- `success` → ✓ (green)  
- `warning` → ⚠ (yellow)
- `error` → ❌ (red)
- `status` → ⚡︎ (cyan)
- `cognitive` → 🧠 (gray)

### 5. Updated Chat UI Rendering

Modified `renderChatUI()` to:
1. First render the scrollable log panel
2. Then render the fixed prompt area at the bottom

### 6. Text-Delta Stream Redirection

Updated streaming handlers to use `addLogMessage()` instead of `process.stdout.write()`:

```typescript
case 'text_delta':
  // Real-time text streaming - output to scrollable log panel
  if (ev.content) {
    this.addLogMessage(ev.content)
    this.renderPromptAfterOutput()
  }
  break
```

## Architecture

```
┌─────────────────────────────────────┐
│                                     │
│   Scrollable Log Panel              │
│   - All console.log output          │
│   - Text-delta chunks               │
│   - Structured outputs              │
│   - AdvancedUI live updates         │
│                                     │
│   (Scrollable with offset)          │
│                                     │
├─────────────────────────────────────┤  ← Separator
│ ╭───────────────────────────────╮   │
│ │  Status Bar (Token, Cost, etc)│   │
│ ╰───────────────────────────────╯   │
│ ❯ Prompt Input (Always Visible)     │
└─────────────────────────────────────┘
```

## Features

1. **Persistent Prompt**: The prompt and status bar always stay at the bottom, never interrupted by streaming content

2. **Scrollable Logs**: All output appears in a scrollable panel above the prompt
   - Supports 1000 lines of history
   - Auto-scrolls to bottom on new content
   - Can be scrolled up to view history (offset management ready)

3. **Unified Output**: All output types are captured:
   - Console logs (log, error, warn)
   - Text-delta streaming chunks
   - Structured outputs
   - AdvancedUI live updates

4. **Smart Interception**: Only intercepts output when:
   - In chat mode (`isChatMode = true`)
   - Not printing panels (`isPrintingPanel = false`)
   - Not in interactive mode (`isInquirerActive = false`)

## Usage

The changes are automatically active when the CLI is in chat mode. Users will see:
- All streaming responses in the scrollable log panel
- The prompt and status bar fixed at the bottom
- No interruption to the input area during streaming

## Future Enhancements

1. **Scroll Controls**: Add keyboard shortcuts to scroll up/down in the log panel
2. **Log Search**: Add ability to search through the log history
3. **Log Export**: Add command to export log history to a file
4. **Log Filtering**: Add ability to filter logs by type (info, error, etc.)
5. **Split View**: Option to show different log types in separate panels
