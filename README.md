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

## Claude Code skills

This project includes custom [Claude Code](https://claude.com/claude-code) skills that automate common development workflows. Run them inside a Claude Code session.

### `/feature` — Full feature pipeline (recommended)

The all-in-one command. Describe a feature in plain language and it runs the entire planning pipeline before writing any code.

```
/feature 요소를 드래그해서 그룹으로 묶는 기능
/feature Add an eyedropper color picker to the style panel
```

**What it does:**
1. Analyzes the codebase and writes a structured PRD to `.claude/prds/<feature>.md`
2. Reviews the PRD against architecture rules and known gotchas
3. If blockers are found, fixes the PRD and re-reviews (once)
4. Generates a concrete implementation plan with file-by-file changes
5. Presents everything and waits for your approval before writing code

### `/prd` — Write a PRD only

Generates a PRD without reviewing or planning implementation. Useful when you want to draft first, then review separately.

```
/prd 색상 팔레트 히스토리 기능
```

Output: `.claude/prds/<feature-slug>.md` containing summary, affected components, proposed changes, edge cases, testing plan, and open questions — all referencing actual source files and architecture rules from `DEVELOPMENT.md`.

### `/review-prd` — Review an existing PRD

Reviews a PRD for architectural consistency, known iframe/Moveable gotchas, missing edge cases, and state management concerns. Appends a review section with categorized issues.

```
/review-prd color-palette-history
/review-prd .claude/prds/element-grouping.md
```

Issues are categorized as:
- `[BLOCKER]` — Must fix before implementation (architecture violations, guaranteed bugs)
- `[WARNING]` — Should fix (risk of bugs in specific scenarios)
- `[SUGGESTION]` — Nice to have (code quality, UX improvements)

### `/debug` — Diagnose and fix bugs

Describe a bug in natural language. The skill classifies it (UI vs code logic), launches a Playwright browser for UI bugs, reproduces the issue, traces the root cause, and applies a fix.

```
/debug 선택 박스가 요소 아래로 밀려나요
/debug UNDO after font size change clears selection
```

Requires the Playwright MCP plugin (see setup below).

---

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
