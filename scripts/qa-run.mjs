import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

function log(status, label, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️ ';
  console.log(`${icon} [${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  const results = [];
  const pass = (label, detail) => { log('PASS', label, detail); results.push({ status: 'PASS', label }); };
  const fail = (label, detail) => { log('FAIL', label, detail); results.push({ status: 'FAIL', label, detail }); };
  const info = (label, detail) => log('INFO', label, detail);

  // ─── TEST 1: App Load & Header ───────────────────────────────────────────────
  console.log('\n── TEST 1: App Load & Header ──');
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');

  const title = await page.textContent('h1').catch(() => null);
  title?.includes('SLIDE.HTML') ? pass('Header title visible', title) : fail('Header title missing', String(title));

  const iframe = page.frameLocator('iframe').first();
  const iframeEl = await page.$('iframe');
  iframeEl ? pass('Iframe element present') : fail('Iframe element not found');

  for (const btn of ['UPLOAD', 'SAVE', 'SYNC WITH AI', 'EDIT', 'PLAY']) {
    const el = await page.getByText(btn, { exact: true }).first();
    (await el.isVisible().catch(() => false)) ? pass(`Button visible: ${btn}`) : fail(`Button missing: ${btn}`);
  }

  // ─── TEST 2: Iframe content renders ──────────────────────────────────────────
  console.log('\n── TEST 2: Iframe Content ──');
  await page.waitForTimeout(2000); // let iframe load

  const iframeBody = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    try { return f?.contentDocument?.body?.innerHTML?.slice(0, 200) ?? null; } catch { return 'cross-origin blocked'; }
  });
  iframeBody && iframeBody !== 'cross-origin blocked'
    ? pass('Iframe content accessible', iframeBody.slice(0, 80).replace(/\n/g, ' ') + '...')
    : fail('Iframe content inaccessible', String(iframeBody));

  // ─── TEST 3: Click element → Moveable handles appear ─────────────────────────
  console.log('\n── TEST 3: Element Selection & Moveable Handles ──');
  const clickable = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    const doc = f?.contentDocument;
    if (!doc) return null;
    // find a real content element
    const candidates = doc.querySelectorAll('h1, h2, p, div[class]');
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.height > 10) return { tag: el.tagName, text: el.textContent?.slice(0, 40) };
    }
    return null;
  });
  info('Clickable element found in iframe', JSON.stringify(clickable));

  // Click inside the iframe at center of viewport area
  const iframeBox = await iframeEl?.boundingBox();
  if (iframeBox) {
    const cx = iframeBox.x + iframeBox.width / 2;
    const cy = iframeBox.y + iframeBox.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1000);

    // Check if Moveable control box appeared (it's injected into the iframe body)
    const moveableVisible = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      return !!doc?.querySelector('.moveable-control-box');
    });
    moveableVisible
      ? pass('Moveable handles appeared after click')
      : fail('Moveable handles did NOT appear after clicking element');
  } else {
    fail('Could not get iframe bounding box');
  }

  // ─── TEST 4: Drag — element moves ────────────────────────────────────────────
  console.log('\n── TEST 4: Drag & Drop ──');
  if (iframeBox) {
    const cx = iframeBox.x + iframeBox.width / 2;
    const cy = iframeBox.y + iframeBox.height / 2;

    const posBefore = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      const el = doc?.querySelector('.moveable-control-box');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top };
    });

    // Drag from center of selected element 50px diagonally
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(cx + 50, cy + 50, { steps: 10 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(800);

    const posAfter = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      const el = doc?.querySelector('.moveable-control-box');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top };
    });

    if (posBefore && posAfter) {
      const moved = Math.abs(posAfter.x - posBefore.x) > 5 || Math.abs(posAfter.y - posBefore.y) > 5;
      moved
        ? pass('Element moved after drag', `from ${JSON.stringify(posBefore)} to ${JSON.stringify(posAfter)}`)
        : fail('Element did NOT move after drag', `before: ${JSON.stringify(posBefore)}, after: ${JSON.stringify(posAfter)}`);
    } else {
      fail('Could not measure element position for drag test', `before: ${JSON.stringify(posBefore)}, after: ${JSON.stringify(posAfter)}`);
    }

    // Check delta counter in header updated
    const deltaText = await page.locator('span').filter({ hasText: /DELTA/i }).first().textContent().catch(() => null);
    deltaText?.includes('DELTA')
      ? pass('Delta counter updated in header', deltaText)
      : fail('Delta counter did not update', String(deltaText));
  }

  // ─── TEST 5: Double-click → contentEditable mode, no slide advance ───────────
  console.log('\n── TEST 5: Double-click Text Edit & Event Blocking ──');
  if (iframeBox) {
    // First click to select
    const cx = iframeBox.x + iframeBox.width / 2;
    const cy = iframeBox.y + iframeBox.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);

    // Note the current slide indicator if any
    const slideIndicatorBefore = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      // look for slide counter or current class
      const deck = doc?.getElementById('deck');
      return deck?.dataset?.current ?? deck?.className ?? null;
    });

    // Double-click to enter text edit
    await page.mouse.dblclick(cx, cy);
    await page.waitForTimeout(800);

    const editModeActive = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      const editable = doc?.querySelector('[contenteditable="true"]');
      return !!editable;
    });
    editModeActive
      ? pass('contentEditable mode activated on double-click')
      : fail('contentEditable mode NOT activated on double-click');

    // Assert slide did NOT advance (check via keydown propagation — slide counter unchanged)
    const slideIndicatorAfter = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      const deck = doc?.getElementById('deck');
      return deck?.dataset?.current ?? deck?.className ?? null;
    });
    slideIndicatorBefore === slideIndicatorAfter
      ? pass('Slide did NOT advance on double-click (event blocked)')
      : fail('Slide advanced unexpectedly on double-click', `before: ${slideIndicatorBefore}, after: ${slideIndicatorAfter}`);

    // Click away to blur
    await page.mouse.click(iframeBox.x + 10, iframeBox.y + iframeBox.height - 20);
    await page.waitForTimeout(500);
  }

  // ─── TEST 6: EDIT / PLAY mode toggle ─────────────────────────────────────────
  console.log('\n── TEST 6: Mode Toggle ──');
  await page.getByText('PLAY', { exact: true }).click();
  await page.waitForTimeout(500);
  const overlayHidden = await page.$eval(
    'div[class*="MANIPULATION"]',
    el => window.getComputedStyle(el).display
  ).catch(() => 'element not found');
  info('Manipulation badge in PLAY mode', String(overlayHidden));

  await page.getByText('EDIT', { exact: true }).click();
  await page.waitForTimeout(500);
  const overlayVisible = await page.locator('text=MANIPULATION MODE ACTIVE').isVisible().catch(() => false);
  overlayVisible
    ? pass('MANIPULATION MODE badge visible in EDIT mode')
    : fail('MANIPULATION MODE badge not visible in EDIT mode');

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('QA RESULTS SUMMARY');
  console.log('══════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed.length) {
    console.log('\nFailed tests:');
    failed.forEach(f => console.log(`  ❌ ${f.label}: ${f.detail ?? ''}`));
  }

  console.log('\nLeaving browser open for 10s for visual inspection...');
  await page.waitForTimeout(10000);
  await browser.close();
})();
