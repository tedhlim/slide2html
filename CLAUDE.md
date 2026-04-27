# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server at localhost:3000 (uses --webpack flag)
npm run build        # Production build
npm run lint         # ESLint
node scripts/test-ai.mjs   # Test AI provider connectivity
node scripts/qa-run.mjs    # Playwright QA suite (requires dev server running)
```

No unit test framework is configured. QA is done via Playwright browser automation (`scripts/qa-run.mjs`) against the running dev server. See `QA_GUIDE.md` for behavioral test specs.

## Architecture

**Slide.html** is a visual HTML slide deck editor with an AI-powered "round-trip" refactoring loop. Users make visual edits (drag, resize, text edit, style changes), which are captured as **VisualDelta JSON**. When the user clicks "SYNC WITH AI", the original HTML + deltas are sent to an LLM that refactors the code into clean Tailwind CSS.

### The "Sandwich" Layering Model

The editor uses three isolated layers stacked on the same viewport:

1. **Content Layer** — `IframeRenderer` renders the HTML deck in a sandboxed `<iframe>` with `allow-same-origin allow-scripts`. Auto-injects Tailwind CDN if missing.
2. **Interaction Layer** — `InteractionOverlay` is a transparent overlay using **Moveable.js** portaled into the iframe's `document.body`. Handles selection, drag/resize, text editing (contentEditable), style changes, and keyboard shortcuts. Injects a `slide2html-edit-override` style tag to disable animations/transitions during editing.
3. **Style Panel** — Rendered via React `createPortal` into `#style-panel-portal` in the right sidebar.

### Data Flow

```
Visual Edit → InteractionOverlay captures VisualDelta → page.tsx merges into delta queue
  → "SYNC WITH AI" → POST /api/refactor (cheerio parse + LLM call) → clean HTML returned
  → state reset, iframe re-renders → POST /api/storage/write to persist
```

### Key Implementation Details

- **Zoom detection**: Reads CSS transform matrix from `#deck` element to calculate correct drag/resize deltas.
- **Event blocking**: mousedown/pointerdown captured in capture phase inside iframe to prevent slide deck navigation during editing.
- **History/Undo**: Snapshots `body.innerHTML` before each action. Ctrl+Z or UNDO button restores from stack.
- **Delta merging**: Multiple changes to the same `target_selector` are accumulated (position/size deltas add together, style/content overwrites).
- **Image preservation**: Base64 images are masked with placeholders before sending to LLM, then restored in output.
- **Scroll-on-navigate bug fix**: Scroll listeners on `.slide-container` clear Moveable targets; `navigateSlide()` uses `scrollBy()` for CSS scroll-snap decks.

### API Routes

- `POST /api/refactor` — Takes `{ originalHtml, deltas }`. Parses with cheerio, handles deletions/content deterministically, sends geometry/style changes to LLM (Claude or OpenAI via `AI_PROVIDER` env var). Returns `{ refactoredHtml }`.
- `GET /api/storage/read` — Loads HTML from local `storage/document.html` or GCS (based on `STORAGE_MODE`).
- `POST /api/storage/write` — Saves HTML to local filesystem or GCS.

### Environment Variables

```env
AI_PROVIDER=claude                # "claude" (default) or "openai"
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6    # default model
STORAGE_MODE=local                # "local" or "cloud" (GCS)
```

## Development Rules

**Read `DEVELOPMENT.md` for full details.** Key rules summarized here:

1. **Cross-iframe `instanceof`** — Never use `el instanceof HTMLElement` for iframe elements. Use `iframe.contentWindow.HTMLElement` instead.
2. **DOM references die on innerHTML** — After replacing `body.innerHTML`, re-query elements by CSS selector. Wrap `setTargets` in `requestAnimationFrame`.
3. **CSS containing blocks** — `backdrop-filter`, `transform`, `filter`, `will-change` create containing blocks that break Moveable positioning. Neutralize them in `slide2html-edit-override`.
4. **Call `onActionStart()` before mutations** — Every DOM change (drag, resize, style, text edit, delete) must push history first for UNDO support.
5. **Don't select `section.slide`** — Selecting slide root elements causes Moveable to inject overflow styles that produce scrollbars.
6. **Use capture phase for iframe events** — All mousedown/pointerdown handlers must be registered with `addEventListener(..., true)` to intercept before the slide deck's own handlers.
7. **Verify after changes** — Run `npx tsc --noEmit`. Test selection, UNDO, and Moveable positioning.

## Next.js Version Warning

This project uses **Next.js 16** which has breaking changes from earlier versions. Check `node_modules/next/dist/docs/` before writing any Next.js-specific code. Heed deprecation notices.

## Tech Stack

- Next.js 16 + React 19 + TypeScript (strict)
- Tailwind CSS v4 (PostCSS plugin, NOT `@tailwind` directives — uses `@import "tailwindcss"`)
- `react-moveable` for visual manipulation
- `cheerio` for server-side HTML parsing in the refactor endpoint
- Path alias: `@/*` → `./src/*`
