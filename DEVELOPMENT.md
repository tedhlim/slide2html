# Development Guide

Detailed rules and gotchas for modifying slide2html. Read this before adding features or fixing bugs.

## The iframe Boundary

All slide content lives inside a sandboxed `<iframe>`. This is the single biggest source of bugs.

### Cross-iframe `instanceof` fails

```js
// WRONG — always returns false for iframe elements
el instanceof HTMLElement

// CORRECT
const iframeWin = iframe.contentWindow;
el instanceof iframeWin.HTMLElement || el instanceof iframeWin.SVGElement
```

**Why:** Each iframe has its own JavaScript realm with separate global constructors. An element created in the iframe is an instance of the iframe's `HTMLElement`, not the parent window's.

**Where this matters:**
- `handleUndo` in `page.tsx` — re-selecting elements after `innerHTML` replacement
- Any code that filters or validates elements obtained from `iframeRef.current.contentDocument`

### DOM references die on `innerHTML` replacement

When `body.innerHTML` is overwritten (e.g., UNDO), all existing DOM references become stale. To preserve selection across DOM replacement:

1. Save CSS selectors (nth-of-type path) before replacement
2. Replace innerHTML
3. Re-query elements using saved selectors
4. Use `requestAnimationFrame` before calling `setTargets` to let layout settle

See `handleUndo` in `page.tsx` for the canonical implementation.

### Accessing iframe internals

```js
const iframe = iframeRef.current;
const iDoc = iframe.contentDocument;           // or iframe.contentWindow.document
const iWin = iframe.contentWindow;
const cs = iWin.getComputedStyle(someElement);  // must use iframe's window
```

Always use the iframe's `window` for `getComputedStyle`, `getSelection`, `scrollTo`, etc.

---

## CSS Containing Block Traps

Moveable.js calculates positions using the `offsetParent` chain. Certain CSS properties create unexpected containing blocks that break this chain.

| Property | Creates containing block? |
|---|---|
| `backdrop-filter: blur(...)` | **YES** — most common trap |
| `transform: (any non-none)` | YES |
| `filter: (any non-none)` | YES |
| `will-change: transform` | YES |
| `contain: paint / layout` | YES |
| `perspective: (any non-none)` | YES |

**The fix:** The `slide2html-edit-override` style tag (injected by `InteractionOverlay.tsx`) neutralizes these:

```css
* {
  transition: none !important;
  animation: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.slide-container {
  position: relative !important;  /* scroll context for Moveable */
}
```

If you encounter a Moveable positioning bug, check whether a new CSS property is creating a containing block that isn't neutralized in this override.

---

## State Management

### Key state in `page.tsx`

| State | Purpose |
|---|---|
| `targets` | Currently selected DOM elements (array of iframe elements) |
| `deltas` | Pending visual changes (VisualDelta[]) queued for AI sync |
| `history` | Undo stack — snapshots of `{ bodyHtml, deltas }` |
| `isEditMode` | Edit vs Play mode toggle |
| `htmlKey` | Incremented to force LayerPanel tree rebuild |

### Clearing targets

Multiple things clear the selection (`setTargets([])`):
- Clicking empty canvas area (`page.tsx` main area onClick)
- Scroll events on `.slide-container` or `scrollingElement` (`InteractionOverlay.tsx` clearOnScroll)
- Slide navigation (arrow keys, nav buttons)
- Entering text edit mode (double-click)
- SYNC WITH AI / Upload / UNDO (state resets)

When adding new features that modify the DOM, consider whether target references need to be preserved or cleared.

### The `scrollClearDisabledRef` pattern

A ref-based flag that temporarily suppresses scroll-triggered selection clearing. Used during `handleUndo` because `innerHTML` replacement triggers scroll events.

```js
scrollClearDisabledRef.current = true;
iframe.contentWindow.document.body.innerHTML = last.bodyHtml;
// ... restore targets ...
setTimeout(() => { scrollClearDisabledRef.current = false; }, 200);
```

### History / Undo

`pushHistoryState()` must be called **before** any DOM mutation. It's passed as `onActionStart` to `InteractionOverlay`. Call it at the start of drag, resize, style change, text edit, or delete.

---

## Event Handling in the iframe

### Capture phase interception

All mouse/pointer events are registered in **capture phase** (`addEventListener(..., true)`) on the iframe's `document`. This prevents the slide deck's own navigation/click handlers from firing.

```js
doc.addEventListener('mousedown', onMouseDown, true);   // capture phase
doc.addEventListener('pointerdown', onPointerDown, true);
```

### What NOT to select

- `section.slide` elements (direct children of `.slide-container`) — selecting these causes Moveable to inject overflow styles that produce scrollbars
- `HTML`, `BODY`, `SCRIPT`, `STYLE`, `HEAD` tags

### Moveable handle passthrough

When the click target is inside `.moveable-control-box` or has a `moveable` class, the event must be allowed through (not stopped) so Moveable can handle drag/resize.

---

## Component Communication

### Portal pattern

The app uses two React portals:

1. **Moveable portal** — `createPortal(<Moveable>, iframeWindow.document.body)` — renders Moveable controls inside the iframe
2. **Style panel portal** — `createPortal(<StylePanel>, document.getElementById('style-panel-portal'))` — renders the design panel into the right sidebar

### Props flow

```
page.tsx (orchestrator)
  ├── IframeRenderer (ref → iframeRef)
  ├── InteractionOverlay
  │     ├── receives: iframeRef, targets, isEditMode, scrollClearDisabledRef
  │     ├── callbacks: onChange (delta), onTargetsChange, onDebugInfo, onActionStart
  │     └── portals: Moveable (into iframe), StylePanel (into sidebar)
  └── LayerPanel
        ├── receives: iframeRef, selectedElements (= targets), htmlKey
        └── callbacks: onSelectionChange (= setTargets)
```

---

## Zoom Handling

The slide deck may use CSS transforms for scaling (e.g., `#deck { transform: matrix(...) }`). All drag/resize deltas must be divided by the zoom factor:

```js
dx: Math.round((finalRect.left - initialRect.left) / zoom)
```

Zoom is detected on iframe load by reading the transform matrix from `#deck`.

---

## Adding New Style Properties

To add a new CSS property to the Design panel:

1. Add the property to the `StyleValues` interface in `InteractionOverlay.tsx`
2. Read its initial value in the `useEffect` that sets `selectedStyles` (~line 153)
3. Add the UI control in the style panel JSX (inside the `createPortal` for `stylePortalRoot`)
4. Call `handleStyleChange(propertyName, displayValue, cssValue)` on change
5. Remember to call `onActionStart?.()` before the change for undo support

---

## Checklist Before Submitting Changes

- [ ] `npx tsc --noEmit` passes
- [ ] Test with at least 2 different slide decks (some use `#deck` zoom, some don't)
- [ ] If you touched selection logic, verify: select element, change style, UNDO → element stays selected
- [ ] If you touched scroll/navigation, verify: navigate slides → selection clears, no stale handles
- [ ] If you added CSS overrides, verify Moveable positioning isn't broken (handles align with element ±2px)
