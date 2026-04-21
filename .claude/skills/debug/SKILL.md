---
name: debug
description: "slide2html 에디터의 버그를 진단하고 수정. UI 버그는 Playwright로 직접 보며, 코드 버그는 소스 분석으로. 자연어로 버그 설명을 입력하세요."
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, mcp__playwright*
---

# /debug — slide2html 버그 진단 & 수정

## Step 0: 버그 분류 (항상 첫 번째로 실행)

사용자의 버그 설명을 분석해서 두 가지 중 하나로 분류한다:

### A) UI 버그 → Playwright 브라우저 디버깅
아래 키워드/증상이 하나라도 해당되면 **UI 버그**로 판단하고 Step 1로 진행:
- 시각적 이상: 위치 어긋남, 안 보임, 깜빡임, 잔존, 겹침, 오프셋, 밀림
- 인터랙션 이상: 클릭 안 됨, 드래그 이상, 선택 안 됨, 호버 이상, 스크롤 이상
- 레이아웃 이상: 크기 이상, 정렬 이상, 반응형 깨짐
- 렌더링 이상: 스타일 안 먹힘, CSS 이상, 색상 이상, 폰트 이상
- Moveable 관련: 선택 박스, 핸들, 리사이즈, 컨트롤 박스
- 특정 UI 조작 후 발생하는 모든 문제 (UNDO 후 선택 해제, 버튼 클릭 후 이상 등)

### B) 코드 내부 로직 버그 → 소스 분석 디버깅
UI에서 직접 볼 필요 없는 순수 로직 문제는 **Step 5(소스 추적)로 바로 진행**:
- API 응답 에러, 데이터 변환 오류
- 빌드/컴파일 에러
- 환경 변수, 설정 문제
- 서버사이드 로직 (cheerio 파싱, LLM 호출 등)

**판단이 애매하면 UI 버그로 간주**하고 Playwright를 띄운다. 실제로 눈으로 보는 게 가장 확실하다.

---

## UI 버그 디버깅 플로우 (Step 1~6)

### Step 1: 서버 & 브라우저 자동 준비

**이 단계는 UI 버그 진단 시 반드시 실행한다. 건너뛰지 않는다.**

#### 1a. 개발 서버 체크
```bash
curl -sf http://localhost:3000 > /dev/null 2>&1
```
- 응답 없으면 `npm run dev`를 백그라운드로 시작하고 서버가 뜰 때까지 최대 15초 대기.

#### 1b. Playwright 브라우저 체크 & 실행
**반드시** `browser_snapshot`을 호출하여 브라우저가 이미 열려있는지 확인한다:
- **성공 (스냅샷 반환)** → 현재 URL이 `localhost:3000`인지 확인
  - 맞으면 → Step 2 건너뛰고 Step 3로
  - 아니면 → `browser_navigate` → `http://localhost:3000`
- **실패 (에러/빈 응답)** → `browser_navigate` → `http://localhost:3000` 으로 브라우저를 새로 연다

#### 1c. 초기 상태 캡처
브라우저가 localhost:3000에 도착하면:
1. `browser_snapshot` → 페이지 접근성 트리 확인
2. `browser_take_screenshot` → 전체 화면 초기 스크린샷 캡처
3. `browser_console_messages` → 기존 콘솔 에러 확인

### Step 2: 현재 상태 파악

스크린샷과 스냅샷을 분석하여 앱의 현재 상태를 파악한다:
- 어떤 슬라이드가 보이는지
- 에디트 모드가 켜져 있는지
- 선택된 요소가 있는지
- 에러 메시지가 표시되어 있는지

### Step 3: 버그 재현

사용자가 설명한 버그를 MCP 도구로 직접 재현한다:

- `browser_click` — 요소 클릭 (좌표 또는 ref 지정)
- `browser_hover` — 요소에 마우스 호버
- `browser_type` — 텍스트 입력
- `browser_press_key` — 키보드 입력 (Tab, Enter, Delete 등)
- `browser_drag` — 드래그 조작
- `browser_select_option` — 드롭다운 선택
- `browser_take_screenshot` — 각 단계마다 스크린샷으로 상태 확인

**iframe 내부 조작 시:**
- slide2html의 콘텐츠는 iframe 안에 있으므로, iframe 내부 요소를 클릭/조작할 때는 iframe 영역의 좌표를 사용한다.
- `browser_snapshot`으로 iframe 내부 요소의 ref를 확인하고 사용한다.

**레이어 패널로 요소 선택 시:**
- 레이어 패널 클릭은 첫 번째 클릭이 scrollIntoView만 할 수 있음. **두 번째 클릭**으로 실제 선택이 됨.
- 선택 확인: "1 SELECTED" 텍스트가 레이어 패널 상단에 나타나고, Design 패널에 스타일이 보이면 성공.

### Step 4: 상태 수집 & 분석

재현 후 현재 상태를 수집한다:

1. `browser_take_screenshot` — 버그 상태 스크린샷
2. `browser_snapshot` — DOM 접근성 트리로 요소 상태 확인
3. `browser_console_messages` — 콘솔 에러/경고 확인
4. `browser_evaluate` — iframe 내부 상태 직접 조회 (아래 진단 스크립트 참조)

수집된 데이터를 사용자의 버그 설명과 대조 분석한다.

#### Step 4a: Moveable 위치 오프셋 진단 (선택 박스 위치 버그)

Moveable 컨트롤 박스가 요소와 어긋나는 경우, 아래 스크립트로 **정량적 오프셋**을 측정한다:

```js
// browser_evaluate로 실행
() => {
  const iframe = document.querySelector('iframe');
  const iDoc = iframe.contentDocument;
  const slideContainer = iDoc.querySelector('.slide-container');
  const target = /* 선택된 요소 */;

  const moveableBox = iDoc.querySelector('.moveable-control-box');
  const moveableStyle = moveableBox?.getAttribute('style');
  const targetRect = target.getBoundingClientRect();

  // offsetParent 체인 추적 — 핵심 진단 포인트
  const offsetChain = [];
  let el = target;
  while (el) {
    const cs = iframe.contentWindow.getComputedStyle(el);
    offsetChain.push({
      tag: el.tagName, class: el.className?.split?.(' ')?.[0],
      offsetTop: el.offsetTop, offsetLeft: el.offsetLeft,
      position: cs.position, transform: cs.transform,
      backdropFilter: cs.backdropFilter, filter: cs.filter,
      willChange: cs.willChange, contain: cs.contain,
    });
    el = el.offsetParent;
  }

  return {
    moveableTranslate: moveableStyle?.match(/translate3d\(([^)]+)\)/)?.[1],
    targetViewport: { top: targetRect.top, left: targetRect.left },
    scrollTop: slideContainer.scrollTop,
    containerPosition: iframe.contentWindow.getComputedStyle(slideContainer).position,
    offsetChain, // ← 이걸로 어떤 요소가 containing block인지 판별
  };
}
```

**분석 체크리스트:**
- `translate3d`의 좌표 ≠ `targetViewport` 좌표 → 오프셋 존재
- `offsetChain`에 예상치 못한 중간 containing block이 있는지 확인
- `scrollTop > 0`인데 `containerPosition === 'static'` → scroll context 누락

#### Step 4b: CSS Containing Block 트러블슈팅

**Moveable는 offsetParent 체인을 기반으로 좌표를 계산한다.** 의도치 않은 CSS 속성이 중간 요소를 containing block으로 만들면 오프셋 버그가 발생한다.

| CSS 속성 | containing block 생성 여부 |
|---|---|
| `backdrop-filter: blur(...)` | **YES** — 가장 흔한 함정 |
| `transform: (none 아닌 값)` | YES |
| `filter: (none 아닌 값)` | YES |
| `will-change: transform` | YES |
| `contain: paint / layout` | YES |
| `perspective: (none 아닌 값)` | YES |
| `position: relative/absolute/fixed/sticky` | YES (의도적) |

**해결 패턴:** edit-mode CSS override (`slide2html-edit-override`)에서 해당 속성을 비활성화:
```css
* {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
```

#### Step 4c: 스크롤 컨텍스트 진단

`.slide-container`가 `position: static`이면 Moveable의 `position: absolute` 컨트롤 박스가 스크롤과 동기화되지 않는다.

**진단:** `scrollTop > 0`인데 `containerPosition === 'static'` → 오프셋 = scrollTop만큼 어긋남

**해결:** `.slide-container { position: relative !important }` 추가

#### Step 4d: React 상태 진단 (상태/선택 관련 버그)

`browser_evaluate`로 React 컴포넌트 내부 상태를 간접 확인:
```js
() => {
  const iframe = document.querySelector('iframe');
  const iDoc = iframe?.contentDocument;
  return {
    // Moveable 선택 상태
    moveableBox: !!iDoc?.querySelector('.moveable-control-box'),
    moveableVisible: iDoc?.querySelector('.moveable-control-box')?.style?.display !== 'none',
    // 에디트 모드
    editOverride: !!iDoc?.querySelector('#slide2html-edit-override'),
    // 선택 표시 (외부 UI)
    selectedBadge: document.querySelector('[class*="SELECTED"]')?.textContent,
    // 디자인 패널 표시 여부
    designPanel: !!document.querySelector('[class*="style-panel"]'),
    // UNDO 버튼 상태
    undoButton: document.querySelector('button')?.disabled,
  };
}
```

### Step 5: 소스 추적 & 수정

진단 결과를 기반으로 관련 소스코드를 읽고 근본 원인을 파악한다.

**핵심 소스 파일 참조:**

| 증상 | 먼저 볼 파일 |
|---|---|
| 선택 박스 위치 어긋남(오프셋) | `InteractionOverlay.tsx` — `slide2html-edit-override` CSS, `moveablePortal`, Moveable `container` prop |
| 선택 박스 잔존, 클릭/드래그 이상 | `InteractionOverlay.tsx` — Moveable targets, 이벤트 캡처, clearSelection |
| UNDO/상태 초기화 이상 | `src/app/page.tsx` — handleUndo, history, setTargets |
| 에디트 모드/델타/상태 이상 | `src/app/page.tsx` — targets, deltas, editMode state, 키보드 핸들러 |
| iframe 렌더링, 스타일 주입 | `src/components/IframeRenderer.tsx` — iframe setup, Tailwind CDN |
| 레이어 패널 선택 동기화 | `src/components/LayerPanel.tsx` — 레이어↔선택 연동 |
| 스크롤/네비게이션 | `src/app/page.tsx` — navigateSlide, scroll listeners |
| AI 리팩터링 | `src/app/api/refactor/route.ts` — cheerio parse, LLM call |

**InteractionOverlay.tsx 핵심 구조:**
- `moveablePortal` (line ~501): Moveable가 렌더링되는 container. `.slide-container` 또는 `body`.
- `slide2html-edit-override` (line ~203): edit-mode CSS 주입. `transition/animation/backdrop-filter: none`, `.slide-container { position: relative }` 등.
- `zoom` detection (line ~53): `#deck` element의 CSS transform matrix에서 scale 추출.
- Moveable `container` prop: `moveablePortal` — 이 값이 위치 계산의 기준점.

### Step 6: 수정 검증

수정 후 다시 브라우저에서 직접 확인한다:

1. 페이지 리로드: `browser_navigate` → `http://localhost:3000`
2. 동일한 재현 시나리오를 다시 수행
3. `browser_take_screenshot` — 수정 후 스크린샷
4. **정량 검증** — `browser_evaluate`로 상태 수치 재측정:
   - Moveable control handle 위치 vs target의 `getBoundingClientRect()` 비교
   - 모든 control handle이 target 경계와 ±2px 이내이면 수정 완료
5. **다른 슬라이드/요소에서도 테스트** — 리프 요소(텍스트, 이미지)와 컨테이너(`.grid`, `.glass-panel`) 모두 확인
6. `npx tsc --noEmit` — TypeScript 에러 없는지 확인
7. 수정 내용을 사용자에게 요약 보고

---

## 코드 로직 버그 디버깅 플로우 (Step 5~6만)

Step 0에서 코드 내부 로직 버그로 판단된 경우:
1. **Step 5(소스 추적)로 바로 진행** — Playwright 없이 소스 코드만 분석
2. 수정 후 **Step 6의 TypeScript 체크**와 관련 동작 검증만 수행
3. 필요시 `browser_console_messages`로 런타임 에러만 확인

---

## 과거 해결 사례

### Case: 컨테이너 선택 시 Y축 오프셋 (Bug 2)
- **증상:** `.grid`, `.glass-panel` 등 컨테이너 선택 시 Moveable 박스가 30~80px 아래로 밀림
- **근본 원인:** `.glass-panel`의 `backdrop-filter: blur(15px)`가 CSS containing block을 생성 → Moveable가 offsetParent 체인을 잘못 계산. `.slide-container`가 `position: static`이라 scroll context도 누락.
- **수정:** `* { backdrop-filter: none !important }` + `.slide-container { position: relative !important }` (edit-mode CSS override에 추가)
