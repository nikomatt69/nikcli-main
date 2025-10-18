# StreamTTY Bug Fixes

## 🐛 Issues Resolved

### 1. HTML Entity Decoding
**Problem**: HTML entities like `&#39;` appeared as literal text instead of being decoded to `'`.

**Solution**: Enhanced the `preprocessText` method with comprehensive HTML entity decoding:
- Numeric entities: `&#39;` → `'`
- Hex entities: `&#x27;` → `'`
- Named entities: `&quot;` → `"`
- Generic numeric/hex entity decoder

**Files Modified**:
- `src/parser/streaming-parser.ts`: Enhanced `preprocessText()` method

### 2. Strikethrough Text Rendering
**Problem**: Blessed doesn't support `{strike}` tags, so strikethrough text showed as `{strike}text{/strike}`.

**Solution**:
- Replaced `{strike}` with visual alternative: `{gray-fg}~~text~~{/gray-fg}`
- Updated both inline and block rendering methods
- Maintains visual indication of deleted text

**Files Modified**:
- `src/renderer/blessed-renderer.ts`:
  - `renderInlineLine()` method
  - `renderDel()` method
  - `formatInlineStyles()` method

### 3. Task List Layout Issues
**Problem**: Task lists and regular lists had overlapping layout and poor spacing.

**Solution**:
- Enhanced `renderListItem()` with proper task list detection
- Added checkbox symbols: `✅` for completed, `☐` for pending
- Improved height calculation with proper text wrapping
- Better spacing and positioning

**Files Modified**:
- `src/renderer/blessed-renderer.ts`: `renderListItem()` method

### 4. Token Height Calculation
**Problem**: Poor height calculation caused overlapping elements and layout issues.

**Solution**: Complete rewrite of `getTokenHeight()` method:
- Accurate height calculation for each token type
- Proper text wrapping consideration
- Better table and mermaid diagram height estimation
- Accounts for borders, padding, and content length

**Files Modified**:
- `src/renderer/blessed-renderer.ts`: `getTokenHeight()` method

### 5. Auto-Scroll Behavior
**Problem**: Auto-scroll was too aggressive, always jumping to bottom during navigation.

**Solution**:
- Disabled automatic auto-scroll by default
- Added manual scroll controls with Space bar for quick bottom jump
- User maintains full control over scroll position
- Better scroll responsiveness

**Files Modified**:
- `src/index.ts`:
  - `createContainer()` method (alwaysScroll: false)
  - `render()` method (removed auto-scroll)
  - Added Space key for manual bottom jump

## 🔧 Technical Details

### HTML Entity Patterns Supported
```typescript
// Numeric entities
processed = processed.replace(/&#(\d+);/g, (match, num) => {
  return String.fromCharCode(parseInt(num, 10));
});

// Hex entities
processed = processed.replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => {
  return String.fromCharCode(parseInt(hex, 16));
});
```

### Task List Detection
```typescript
const taskMatch = content.match(/^(\[ \]|\[x\]|\[X\])\s*(.*)/);
if (taskMatch) {
  const isCompleted = taskMatch[1] !== '[ ]';
  bullet = isCompleted ? '✅' : '☐';
  content = taskMatch[2];
}
```

### Height Calculation Logic
```typescript
case 'table':
  const lines = token.content.split('\n').filter(line => line.trim());
  return Math.max(lines.length + 4, 6); // Table rows + borders + padding

case 'mermaid':
  const diagramLines = token.content.split('\n').length;
  return Math.max(diagramLines + 6, 10); // Diagram + border + padding
```

## ✅ Verification

### Before Fix:
- `&#39;` appeared as literal text
- `{strike}text{/strike}` showed blessed tag syntax
- Task lists overlapped and had poor formatting
- Layout issues with overlapping elements
- Aggressive auto-scroll interfered with navigation

### After Fix:
- ✅ HTML entities properly decoded to correct characters
- ✅ Strikethrough shows as `~~text~~` in gray color
- ✅ Task lists with proper checkboxes (✅ ☐) and spacing
- ✅ Clean layout without overlapping elements
- ✅ User-controlled scroll with manual bottom jump

## 🎯 Testing

Run the test suite:
```bash
npx tsx test-rendering-fixes.ts
```

This will verify all fixes are working correctly with a comprehensive test document.

## 📋 Impact

These fixes significantly improve the visual quality and usability of StreamTTY:
- **Better User Experience**: Proper text rendering and layout
- **Enhanced Readability**: Correct character display and formatting
- **Improved Navigation**: User-controlled scroll behavior
- **Professional Appearance**: Clean, properly spaced content

The changes maintain backward compatibility while providing a much more polished rendering experience.