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
- [ ] While inside edit mode, type new text and press keyboard arrow keys (Left/Right). 
- [ ] **ASSERT**: Navigational arrows successfully move the text caret within the paragraph but completely fail to trigger the iframe's global slide-transition events.

### 4. Re-synchronization Pipeline
- [ ] Click off the element onto a blank space to trigger the `onBlur` effect.
- [ ] **ASSERT**: The updated text remains on the screen, and the top navigation panel increments the "X DELTAS READY" warning indicator.
- [ ] Click the blue `SYNC WITH AI` button on the top toolbar.
- [ ] **ASSERT**: The button enters a `REFACTORING...` loading state.
- [ ] If required by current implementation, intercept the `/api/refactor` endpoint to mock an AI response and confirm that the document reloads cleanly and clears the delta queue without breaking Moveable.

### 5. Suite 5: History Management (UNDO Protocol)
- [ ] Select any element (e.g., text or container) and press the `Delete` key. 
- [ ] **ASSERT**: The target element visually disappears from the page.
- [ ] Trigger an Undo action via the `UNDO` toolbar button or `Ctrl+Z` / `Cmd+Z`.
- [ ] **ASSERT**: The deleted element is restored perfectly to the DOM, and selecting it again produces a valid Moveable frame.
- [ ] Move an element with a drag, then press `Ctrl+Z`. 
- [ ] **ASSERT**: The drag position instantly snaps back to standard location.

### 6. Suite 6: Right Sidebar / Style Portal
- [ ] Check that no layer is selected.
- [ ] **ASSERT**: The right sidebar design panel shows a gray placeholder "Select an element to edit".
- [ ] Select a text element.
- [ ] **ASSERT**: The right sidebar dynamically mounts the premium design tool panel containing Opacity slider, Typography selects, and Custom Color wells.
- [ ] Focus a number input (e.g. `Font Size`), type a new value, and click away.
- [ ] **ASSERT**: The visual text size inside the rendering iframe universally updates.
- [ ] Press the `UNDO` toolbar button.
- [ ] **ASSERT**: The size styling snaps back to its previous bounds.

### 7. Suite 7: Bounding Box Offset Accuracy
- [ ] Select a large outer container (e.g., the root `.grid` bounding box wrapping the slide elements).
- [ ] **ASSERT**: The blue interactive `Moveable` selection borders and corner handles precisely snap to the edges of the box layout without any vertical drift, confirming zero parent-iframe coordinate bleed.
