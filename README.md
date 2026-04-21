# Slide.html — AI Round-Trip Slide Editor

A visual editor for HTML slide decks. Make layout and style changes by dragging, resizing, and clicking — then let AI translate your visual intent back into clean, semantic HTML/Tailwind code.

## How it works

1. **Upload** an HTML slide deck (any Reveal.js, custom, or Tailwind-based deck)
2. **Edit** visually — drag elements, resize, double-click to edit text, use the style panel for colors and typography
3. **Sync with AI** — your visual changes are encoded as a delta JSON and sent to Claude (or OpenAI), which refactors the source code to match your intent using proper Tailwind classes
4. **Save** — the clean, refactored HTML is written back to storage

No dirty inline styles. No manual CSS. The code stays clean through every edit.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env.local` file in the project root:

```env
# AI provider: "claude" (default) or "openai"
AI_PROVIDER=claude

# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6

# OpenAI (if AI_PROVIDER=openai)
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o

# Storage: "local" (default) or "cloud" (Google Cloud Storage)
STORAGE_MODE=local

# GCS (if STORAGE_MODE=cloud)
# GCS_BUCKET_NAME=your-bucket
# GCS_PROJECT_ID=your-project
# GCS_CLIENT_EMAIL=...
# GCS_PRIVATE_KEY=...
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Editor controls

| Action | How |
|---|---|
| Select element | Click any element in the **Layers panel** (right side) or click directly on the canvas |
| Multi-select | Shift-click in the Layers panel |
| Deselect | Click "Clear" in the Layers panel |
| Move element | Drag with the Moveable handles |
| Resize element | Drag the corner/edge handles |
| Edit text | Double-click any element |
| Change style | Select an element — style panel appears at the top (color, font, size, weight, opacity, radius) |
| Delete element | Select it, then press `Delete` or `Backspace` |
| Navigate slides | Arrow keys, or use the `←` `→` buttons in the header |
| Apply changes | Click **SYNC WITH AI** to refactor the HTML with your queued deltas |
| Save | Click **SAVE** to write the current HTML to storage |
| Upload new deck | Click **UPLOAD** and pick an `.html` file |

## Project structure

```
src/
  app/
    page.tsx                  # Main editor UI
    api/
      refactor/route.ts       # AI refactor endpoint (Claude / OpenAI)
      storage/
        read/route.ts         # Read document from local fs or GCS
        write/route.ts        # Write document to local fs or GCS
  components/
    IframeRenderer.tsx        # Renders the slide deck in an isolated iframe
    InteractionOverlay.tsx    # Moveable drag/resize, text editing, style panel
    LayerPanel.tsx            # Photoshop-style element tree panel
  lib/
    types.ts                  # VisualDelta, DebugInfo types
    gcs.ts                    # Google Cloud Storage client
storage/
  document.html               # Active document (local mode, git-ignored)
scripts/
  test-ai.mjs                 # AI connectivity test
  qa-run.mjs                  # Playwright browser automation QA suite
```

## Testing

**Test AI connectivity:**
```bash
node scripts/test-ai.mjs
```

**Run the full QA suite** (requires the dev server to be running):
```bash
npm run dev &
node scripts/qa-run.mjs
```

## Debug panel

Click **DEBUG** in the header to open the debug overlay. It shows:
- Detected zoom factor and its source (critical for correct drag delta calculation)
- Last generated CSS selector
- Last delta type (drag/resize/style/deleted)
- Full pending delta JSON queued for the next SYNC

## Playwright MCP setup (for `/debug` skill)

The `/debug` Claude Code skill uses [Playwright MCP](https://github.com/anthropics/claude-code/blob/main/docs/mcp.md) to interact with the running app in a real browser — clicking elements, taking screenshots, and inspecting DOM state.

### 1. Install the Playwright MCP plugin

Inside Claude Code, run:

```
/install-plugin https://github.com/anthropics/claude-code-plugins/tree/main/external_plugins/playwright
```

Or manually add to `~/.claude/settings.json`:

```jsonc
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### 2. Grant permissions (optional)

To avoid repeated approval prompts, add these to `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__playwright__browser_snapshot",
      "mcp__playwright__browser_click",
      "mcp__playwright__browser_take_screenshot",
      "mcp__playwright__browser_evaluate",
      "mcp__playwright__browser_navigate",
      "mcp__playwright__browser_console_messages"
    ]
  }
}
```

### 3. Usage

With the dev server running (`npm run dev`), invoke the debug skill in Claude Code:

```
/debug 선택 박스가 요소 아래로 밀려나요
```

The skill will automatically:
1. Classify the bug (UI vs code logic)
2. Launch a Playwright browser and navigate to `localhost:3000`
3. Take screenshots and snapshots to understand current state
4. Reproduce the bug using browser interactions
5. Trace the root cause in source code and apply a fix
6. Verify the fix in the browser

If the Playwright MCP connection drops, run `/mcp` in Claude Code to reconnect.
