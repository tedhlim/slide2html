# Slide.html Automation QA Guide
*This document contains behavioral testing instructions for the automated headless sub-agent. Update this guide whenever new front-end features are implemented so the agent can execute reliable regression tests.*

## Test Protocol: Editor Interactivity Suite

When initiating a QA run, the agent must sequentially perform the following interaction assertions against the active frontend port (typically `http://localhost:3000`):

### 1. Element Initialization & Handles
- [ ] Scan the rendered iframe. Point to an internal text block (e.g., inside `.slide` or `.card`).
- [ ] Render a single pixel click on the center-mass of the element.
- [ ] **ASSERT**: The `Moveable.js` control interface (a bounding box containing blue control anchor points) visually appears directly over the element.

### 2. Moveable.js Isolation (Drag & Drop)
- [ ] Position the cursor over one of the blue internal border lines or control anchors of the active `Moveable` box.
- [ ] Perform a mouse-down, drag 50 pixels diagonally, and mouse-up.
- [ ] **ASSERT**: The position of the text changes smoothly. The drag operation must NOT fail, and the blue Moveable box must NOT glitch out or deselect itself during the mousedown trajectory.

### 3. Edit-Mode Invocation & Event Blocking
- [ ] Target the center of the same text element and execute a rapid double-click.
- [ ] **ASSERT**: The visual framework engages `contentEditable` mode (verifiable if the element adopts a blue rim or cursor changes to a text prompt).
- [ ] **ASSERT**: The overarching presentation deck counter (e.g., Slide 1/30) has NOT advanced or flipped backward due to event propagation.

### 4. Re-synchronization Pipeline
- [ ] Click off the element onto a blank space to trigger the `onBlur` effect.
- [ ] Change textual content by simulating keystrokes if possible.
- [ ] If required by current implementation, execute save/sync endpoints to confirm that the `VisualDelta` API payload successfully fires locally.
