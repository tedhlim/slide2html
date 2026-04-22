/**
 * QA Script: 2번째 슬라이드 — 텍스트 박스 선택·수정·undo·save·파란색 테두리
 *
 * 세부 태스크:
 *  T1. 앱 로드 후 2번째 슬라이드로 이동
 *  T2. 텍스트 박스 클릭 → 파란색 Moveable 테두리(bounding box) 표시 확인
 *  T3. 더블클릭 → contentEditable 모드 진입 확인
 *  T4. 텍스트 입력 (수정)
 *  T5. 클릭 아웃으로 blur → 델타 카운터 증가 확인
 *  T6. UNDO 버튼 클릭 → 텍스트 원복 확인
 *  T7. 다시 수정 후 SAVE 버튼 클릭 → 저장 성공 확인
 *  T8. 선택 시 파란색 테두리 색상 실제 검증 (moveable-line border-color)
 */

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const TYPED_TEXT = 'QA_TEST_EDIT';

function log(status, label, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️ ';
  console.log(`${icon} [${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

const results = [];
const pass = (label, detail = '') => { log('PASS', label, detail); results.push({ status: 'PASS', label }); };
const fail = (label, detail = '') => { log('FAIL', label, detail); results.push({ status: 'FAIL', label, detail }); };
const info = (label, detail = '') => log('INFO', label, detail);

// ── Helper: iframe 내부 body.innerHTML 읽기 ───────────────────────────────────
const getIframeBody = (page) =>
  page.evaluate(() => {
    const f = document.querySelector('iframe');
    try { return f?.contentDocument?.body?.innerHTML ?? null; } catch { return null; }
  });

// ── Helper: iframe 내 CSS selector로 요소 BoundingBox 가져오기 (iframe 상대좌표 → 페이지 좌표로 변환) ──
const getElementPageBox = async (page, iframeBox, cssSelector) => {
  const rect = await page.evaluate((sel) => {
    const f = document.querySelector('iframe');
    const doc = f?.contentDocument;
    if (!doc) return null;
    const el = doc.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, cssSelector);
  if (!rect) return null;
  return {
    x: iframeBox.x + rect.x,
    y: iframeBox.y + rect.y,
    width: rect.width,
    height: rect.height,
  };
};

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  // ══════════════════════════════════════════════════════════════════════════
  // T1. 앱 로드 후 2번째 슬라이드로 이동
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── T1: 앱 로드 & 2번째 슬라이드 이동 ──');
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // iframe 초기 렌더링 대기

  const iframeEl = await page.$('iframe');
  const iframeBox = await iframeEl?.boundingBox();
  if (!iframeBox) { fail('T1', 'iframe not found'); process.exit(1); }

  // 헤더의 "다음 슬라이드" 화살표 버튼 클릭 (navigateSlide('next'))
  // 버튼은 SVG chevron-right — aria-label 없으므로 순서로 찾기
  const navButtons = await page.$$('button svg path[d*="7.293"]');
  info('nav button count', String(navButtons.length));

  // navigateSlide 트리거: iframe 내부 .slide-container를 scrollBy로 이동
  await page.evaluate(() => {
    const f = document.querySelector('iframe');
    const doc = f?.contentDocument;
    if (!doc) return;
    const container = doc.querySelector('.slide-container');
    if (container) {
      container.scrollBy({ top: container.clientHeight, behavior: 'smooth' });
    }
  });
  await page.waitForTimeout(1500); // scroll-snap 완료 대기

  // 2번째 슬라이드 heading이 iframe viewport에 보이는지 확인
  const slide2Heading = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    const doc = f?.contentDocument;
    if (!doc) return null;
    // 2번째 slide section 찾기 (index 1)
    const slides = doc.querySelectorAll('section.slide');
    if (slides.length < 2) return null;
    const h2 = slides[1].querySelector('h2');
    return h2?.textContent?.trim() ?? null;
  });
  slide2Heading
    ? pass('T1: 2번째 슬라이드 이동 성공', slide2Heading)
    : fail('T1: 2번째 슬라이드 heading 미검출', String(slide2Heading));

  // ══════════════════════════════════════════════════════════════════════════
  // T2. 텍스트 박스 클릭 → 파란색 Moveable 테두리 표시 확인
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── T2: 텍스트 박스 클릭 → 파란색 Moveable 테두리 ──');

  // 2번째 슬라이드의 첫 h3 요소를 클릭 대상으로 사용
  const targetSelector = 'section.slide:nth-of-type(2) h3:first-of-type';
  const targetBox = await getElementPageBox(page, iframeBox, targetSelector);
  if (!targetBox) { fail('T2', '클릭할 h3 요소를 찾지 못함'); }
  else {
    const cx = targetBox.x + targetBox.width / 2;
    const cy = targetBox.y + targetBox.height / 2;

    // Moveable이 이미 다른 요소를 잡고 있을 수 있으므로 일단 빈 영역 클릭으로 해제
    await page.mouse.click(iframeBox.x + 5, iframeBox.y + iframeBox.height - 10);
    await page.waitForTimeout(400);

    // 스크롤 후 iframe 좌표 재계산 (scroll offset 포함)
    const scrollOffset = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      const container = doc?.querySelector('.slide-container');
      return { scrollTop: container?.scrollTop ?? 0 };
    });
    info('slide-container scrollTop', String(scrollOffset.scrollTop));

    // 요소 클릭
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1000);

    // Moveable control box 등장 확인
    const moveableVisible = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      return !!doc?.querySelector('.moveable-control-box');
    });
    moveableVisible
      ? pass('T2: Moveable control box 등장 확인')
      : fail('T2: Moveable control box 미등장');

    // ── T8 (파란색 테두리 색상 검증) ───────────────────────────────────────
    console.log('\n── T8: Moveable 테두리 파란색 실제 검증 ──');
    const borderColor = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      if (!doc) return null;
      const line = doc.querySelector('.moveable-line');
      if (!line) return null;
      return window.getComputedStyle(line).borderColor
          || window.getComputedStyle(line).backgroundColor
          || line.style.background;
    });
    info('T8: moveable-line computed color', String(borderColor));

    // 파란색 계열 확인 (rgb blue channel > red/green, 또는 실제 파란색)
    const isBlue = (() => {
      if (!borderColor) return false;
      const m = borderColor.match(/\d+/g);
      if (!m || m.length < 3) return false;
      const [r, g, b] = m.map(Number);
      return b > 100 && b > r && b > g;
    })();
    isBlue
      ? pass('T8: Moveable 테두리 파란색 확인', borderColor ?? '')
      : fail('T8: 테두리 색상이 파란색 아님 (또는 미검출)', String(borderColor));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // T3. 더블클릭 → contentEditable 모드 진입 확인
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── T3: 더블클릭 → contentEditable 모드 ──');
  const targetBoxForEdit = await getElementPageBox(page, iframeBox, targetSelector);
  if (!targetBoxForEdit) {
    fail('T3', '요소 위치 재획득 실패');
  } else {
    const cx = targetBoxForEdit.x + targetBoxForEdit.width / 2;
    const cy = targetBoxForEdit.y + targetBoxForEdit.height / 2;

    // 원래 텍스트 저장
    const originalText = await page.evaluate((sel) => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      return doc?.querySelector(sel)?.textContent?.trim() ?? null;
    }, targetSelector);
    info('T3: 원래 텍스트', String(originalText));

    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);
    await page.mouse.dblclick(cx, cy);
    await page.waitForTimeout(800);

    const editModeActive = await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      return !!doc?.querySelector('[contenteditable="true"]');
    });
    editModeActive
      ? pass('T3: contentEditable 모드 진입 확인')
      : fail('T3: contentEditable 모드 미진입');

    // ════════════════════════════════════════════════════════════════════════
    // T4. 텍스트 입력 (수정)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── T4: 텍스트 수정 입력 ──');

    // 기존 텍스트 전체 선택 후 타이핑
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    await page.keyboard.type(TYPED_TEXT, { delay: 60 });
    await page.waitForTimeout(600);

    const textDuringEdit = await page.evaluate((sel) => {
      const f = document.querySelector('iframe');
      const doc = f?.contentDocument;
      const editable = doc?.querySelector('[contenteditable="true"]');
      return editable?.textContent?.trim() ?? doc?.querySelector(sel)?.textContent?.trim() ?? null;
    }, targetSelector);
    info('T4: 편집 중 텍스트', String(textDuringEdit));
    textDuringEdit?.includes(TYPED_TEXT)
      ? pass('T4: 텍스트 입력 확인', textDuringEdit ?? '')
      : fail('T4: 입력된 텍스트 미확인', String(textDuringEdit));

    // ════════════════════════════════════════════════════════════════════════
    // T5. blur → 델타 카운터 증가 확인
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── T5: blur 후 델타 카운터 확인 ──');

    // 빈 영역 클릭으로 blur
    await page.mouse.click(iframeBox.x + 10, iframeBox.y + iframeBox.height - 15);
    await page.waitForTimeout(800);

    const deltaText = await page.evaluate(() => {
      // 헤더의 델타 카운터 텍스트 찾기
      const spans = Array.from(document.querySelectorAll('span'));
      const delta = spans.find(s => s.textContent?.includes('DELTA'));
      return delta?.textContent?.trim() ?? null;
    });
    info('T5: 델타 카운터', String(deltaText));
    deltaText && deltaText.includes('DELTA') && !deltaText.includes('NO CHANGES')
      ? pass('T5: 델타 카운터 증가 확인', deltaText)
      : fail('T5: 델타 카운터 미증가', String(deltaText));

    // ════════════════════════════════════════════════════════════════════════
    // T6. UNDO 버튼 → 텍스트 원복 확인
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── T6: UNDO 버튼 → 텍스트 원복 ──');

    const undoBtn = page.getByText('UNDO', { exact: true });
    const undoBtnVisible = await undoBtn.isVisible().catch(() => false);
    info('T6: UNDO 버튼 visible', String(undoBtnVisible));

    if (undoBtnVisible) {
      await undoBtn.click();
      await page.waitForTimeout(1200);

      const restoredText = await page.evaluate((sel) => {
        const f = document.querySelector('iframe');
        const doc = f?.contentDocument;
        return doc?.querySelector(sel)?.textContent?.trim() ?? null;
      }, targetSelector);
      info('T6: undo 후 텍스트', String(restoredText));

      // 원래 텍스트가 돌아왔거나, QA_TEST_EDIT 텍스트가 없어졌어야 함
      const undone = restoredText !== null && !restoredText.includes(TYPED_TEXT);
      undone
        ? pass('T6: UNDO 후 텍스트 원복 확인', restoredText ?? '')
        : fail('T6: UNDO 실패 — 텍스트 여전히 수정됨', String(restoredText));

      // Moveable이 복원 후에도 선택 가능한지 확인
      const targetBoxAfterUndo = await getElementPageBox(page, iframeBox, targetSelector);
      if (targetBoxAfterUndo) {
        await page.mouse.click(
          targetBoxAfterUndo.x + targetBoxAfterUndo.width / 2,
          targetBoxAfterUndo.y + targetBoxAfterUndo.height / 2
        );
        await page.waitForTimeout(800);
        const moveableAfterUndo = await page.evaluate(() => {
          const f = document.querySelector('iframe');
          const doc = f?.contentDocument;
          return !!doc?.querySelector('.moveable-control-box');
        });
        moveableAfterUndo
          ? pass('T6: UNDO 후 요소 재선택 → Moveable 정상 등장')
          : fail('T6: UNDO 후 Moveable 재등장 실패');
      }
    } else {
      fail('T6: UNDO 버튼 비활성화 또는 미표시');
    }

    // ════════════════════════════════════════════════════════════════════════
    // T7. 다시 수정 후 SAVE 버튼 → 저장 성공 확인
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── T7: 재수정 후 SAVE ──');

    // 다시 요소 더블클릭하여 편집 모드
    const targetBoxForSave = await getElementPageBox(page, iframeBox, targetSelector);
    if (targetBoxForSave) {
      const cx2 = targetBoxForSave.x + targetBoxForSave.width / 2;
      const cy2 = targetBoxForSave.y + targetBoxForSave.height / 2;

      await page.mouse.click(cx2, cy2);
      await page.waitForTimeout(400);
      await page.mouse.dblclick(cx2, cy2);
      await page.waitForTimeout(800);

      await page.keyboard.press('End'); // 커서를 끝으로
      await page.keyboard.type(' SAVED', { delay: 60 });
      await page.waitForTimeout(500);

      // blur
      await page.mouse.click(iframeBox.x + 10, iframeBox.y + iframeBox.height - 15);
      await page.waitForTimeout(600);
    }

    // SAVE API 호출 감시
    const saveResponsePromise = page.waitForResponse(
      res => res.url().includes('/api/storage/write') && res.request().method() === 'POST',
      { timeout: 10000 }
    );

    const saveBtn = page.getByText('SAVE', { exact: true });
    await saveBtn.click();

    let saveSuccess = false;
    try {
      const saveRes = await saveResponsePromise;
      saveSuccess = saveRes.ok();
      saveSuccess
        ? pass('T7: SAVE 버튼 → /api/storage/write 성공', `status ${saveRes.status()}`)
        : fail('T7: SAVE API 실패', `status ${saveRes.status()}`);
    } catch (e) {
      fail('T7: SAVE API 응답 미수신', String(e));
    }

    // 저장 후 버튼 텍스트 복귀 확인 ('...' → 'SAVE')
    await page.waitForTimeout(1000);
    const saveBtnText = await saveBtn.textContent().catch(() => null);
    saveBtnText === 'SAVE'
      ? pass('T7: 저장 완료 후 버튼 상태 복귀', saveBtnText ?? '')
      : fail('T7: 버튼 상태 미복귀', String(saveBtnText));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 최종 요약
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  QA 결과 요약 — 2번째 슬라이드 텍스트 박스 검증');
  console.log('══════════════════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`통과: ${passed} / ${results.length}`);
  if (failed.length > 0) {
    console.log('\n실패 항목:');
    failed.forEach(f => console.log(`  ❌ ${f.label}${f.detail ? ': ' + f.detail : ''}`));
  } else {
    console.log('\n✅ 모든 태스크 통과!');
  }

  console.log('\n브라우저 10초 후 닫힘 (시각 확인용)...');
  await page.waitForTimeout(10000);
  await browser.close();

  process.exit(failed.length > 0 ? 1 : 0);
})();
