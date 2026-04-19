---
name: debug
description: "Playwright MCP로 slide2html 에디터의 UI 버그를 브라우저에서 직접 보며 진단. 자연어로 버그 설명을 입력하세요."
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, mcp__playwright*
---

# /debug — slide2html UI 버그 라이브 진단

Playwright MCP 서버를 사용해 실제 브라우저를 띄우고, 직접 화면을 보면서 버그를 진단하고 수정한다.

## 전제 조건

Playwright MCP 서버가 Claude Code에 설정되어 있어야 한다. 설정 예시:

```json
// ~/.claude/settings.json 또는 프로젝트 .claude/settings.json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## 워크플로우

### Step 1: 서버 체크

```bash
curl -sf http://localhost:3000 > /dev/null 2>&1
```

- 응답 없으면 `npm run dev`를 백그라운드로 시작하고 서버가 뜰 때까지 최대 15초 대기.

### Step 2: 브라우저로 앱 열기

Playwright MCP 도구로 브라우저를 열고 `http://localhost:3000`으로 이동한다.

1. `browser_navigate` → `http://localhost:3000`
2. `browser_snapshot` → 현재 페이지 접근성 스냅샷 확인
3. `browser_take_screenshot` → 전체 화면 스크린샷 캡처

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

### Step 4: 상태 수집 & 분석

재현 후 현재 상태를 수집한다:

1. `browser_take_screenshot` — 버그 상태 스크린샷
2. `browser_snapshot` — DOM 접근성 트리로 요소 상태 확인
3. `browser_console_messages` — 콘솔 에러/경고 확인
4. `browser_evaluate` — iframe 내부 상태 직접 조회:
   - `.moveable-control-box` 존재/visibility/dimensions
   - `contenteditable="true"` 요소들
   - `.slide-container` 스크롤 포지션
   - `slide2html-edit-override` 스타일 주입 여부

수집된 데이터를 사용자의 버그 설명과 대조 분석한다.

### Step 5: 소스 추적 & 수정

진단 결과를 기반으로 관련 소스코드를 읽고 근본 원인을 파악한다.

**핵심 소스 파일 참조:**

| 증상 | 먼저 볼 파일 |
|---|---|
| 선택 박스 잔존, 클릭/드래그 이상 | `src/components/InteractionOverlay.tsx` — Moveable targets, 이벤트 캡처, clearSelection |
| 에디트 모드/델타/상태 이상 | `src/app/page.tsx` — targets, deltas, editMode state, 키보드 핸들러 |
| iframe 렌더링, 스타일 주입 | `src/components/IframeRenderer.tsx` — iframe setup, Tailwind CDN |
| 레이어 패널 선택 동기화 | `src/components/LayerPanel.tsx` — 레이어↔선택 연동 |
| 스크롤/네비게이션 | `src/app/page.tsx` — navigateSlide, scroll listeners |
| AI 리팩터링 | `src/app/api/refactor/route.ts` — cheerio parse, LLM call |

### Step 6: 수정 검증

수정 후 다시 브라우저에서 직접 확인한다:

1. 페이지 리로드: `browser_navigate` → `http://localhost:3000`
2. 동일한 재현 시나리오를 다시 수행
3. `browser_take_screenshot` — 수정 후 스크린샷
4. 버그가 해결되었는지 시각적으로 확인
5. 수정 내용을 사용자에게 요약 보고
