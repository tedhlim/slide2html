---
name: feature
description: "기능 설명을 입력하면 PRD 작성 → 아키텍처 리뷰 → 수정 → 구현 플랜까지 전 과정을 수행하고 유저 컨펌을 받습니다."
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
---

# /feature — slide2html 기능 기획 풀 파이프라인

사용자의 간단한 기능 설명으로부터 PRD 작성 → 아키텍처 리뷰 → BLOCKER 수정 → 구현 플랜 생성까지 전 과정을 실행한다. 구현은 유저 승인 후에만 진행한다.

**이 스킬은 `/prd`와 `/review-prd`의 로직을 인라인으로 포함한다.** 별도 스킬 호출 없이 단일 파이프라인으로 동작한다.

---

## Phase 1: PRD 생성

### Step 1.0: Feature Name 추출

사용자 설명에서 kebab-case slug를 생성한다.
- PRD 파일 경로: `.claude/prds/<slug>.md`
- `.claude/prds/` 디렉토리가 없으면 생성한다.

### Step 1.1: 아키텍처 컨텍스트 로드

**반드시 모두 읽는다:**

1. `CLAUDE.md` — 아키텍처 개요, 7대 개발 규칙
2. `DEVELOPMENT.md` — iframe 경계, CSS containing block, 상태 관리, 이벤트 핸들링, zoom, 포탈 패턴
3. `src/lib/types.ts` — VisualDelta, DebugInfo 타입

### Step 1.2: 관련 컴포넌트 탐색

feature 설명 기반으로 영향 받는 소스 파일을 읽는다:

| feature가 터치하는 영역 | 읽을 파일 |
|---|---|
| 선택, 드래그, 리사이즈, 스타일, 키보드 | `src/components/InteractionOverlay.tsx` |
| DOM 트리 패널, 선택 동기화 | `src/components/LayerPanel.tsx` |
| iframe 렌더링, Tailwind 주입 | `src/components/IframeRenderer.tsx` |
| 상태, UNDO, 델타, 네비게이션, 툴바 | `src/app/page.tsx` |
| AI 리팩터링, cheerio, LLM | `src/app/api/refactor/route.ts` |
| 스토리지 | `src/app/api/storage/read/route.ts`, `write/route.ts` |
| QA 패턴 | `QA_GUIDE.md` |

Grep, Glob으로 추가 관련 파일도 탐색.

### Step 1.3: 기존 패턴 파악

유사한 기존 구현을 레퍼런스로 식별:
- UI 컨트롤 → `handleStyleChange` 패턴
- 이벤트 핸들러 → capture phase 등록 패턴
- 상태 흐름 → targets/deltas/history 관리
- 포탈 → Moveable (iframe body), Style Panel (#style-panel-portal)

### Step 1.4: PRD 작성

`.claude/prds/<slug>.md`를 아래 구조로 생성한다:

```markdown
# PRD: <Feature 제목>

**Author**: Claude Code (auto-generated)
**Date**: <오늘 날짜>
**Status**: Draft

## Summary
<2-3문장 요약>

## Motivation
<왜 필요한지>

## Current Architecture Context
<관련 시스템의 현재 동작, 파일 경로와 상태 변수>

### Affected Components
| Component | File | How It's Affected |
|---|---|---|

### Key State Variables
| Variable | Location | Relevance |
|---|---|---|

## Proposed Changes

### <변경 영역 1>
<컴포넌트 트리 위치, props, 통신 방식, 포탈 패턴>

### <변경 영역 2>
<...>

## Edge Cases & Gotchas
<DEVELOPMENT.md 규칙명 참조:>
- Cross-iframe instanceof
- DOM references after innerHTML
- CSS containing blocks
- Event capture phase
- Zoom handling
- History/UNDO support
- Multi-select behavior
- Slide navigation interaction
- Edit mode vs Play mode

## Delta Integration
<VisualDelta 형태, merge 로직, AI endpoint 대응. 해당 없으면 "N/A">

## Testing Plan
### Manual QA Steps
1. <단계> — **ASSERT**: <기대 결과>

### Regression Checks
- [ ] UNDO round-trip
- [ ] zoom != 1 환경
- [ ] 슬라이드 네비게이션 후 상태
- [ ] `npx tsc --noEmit`

## Implementation Order
1. <순서와 이유>

## Open Questions
<사용자 결정 필요한 모호한 점>
```

사용자에게 "Phase 1 완료: PRD 작성됨. Phase 2 리뷰 진행합니다." 보고 후 바로 Phase 2로.

---

## Phase 2: PRD 리뷰

### Step 2.1: 소스 재검증

PRD "Affected Components" 테이블에 명시된 소스 파일을 다시 읽는다. PRD의 현재 동작 설명이 실제 코드와 일치하는지 검증.

### Step 2.2: 아키텍처 일관성 체크

**레이어 경계:**
- 3-레이어 격리(Content / Interaction / Style Panel) 존중?
- iframe UI 추가 시 portal 방식?
- 사이드바 UI 추가 시 `#style-panel-portal` 패턴?
- 레이어 간 우발적 결합 없음?

**iframe 경계 규칙** (DEVELOPMENT.md):
- `instanceof` — iframe의 window 생성자 사용
- `getComputedStyle` — `iframeWindow` 사용
- 이벤트 리스너 — capture phase (`true` 세 번째 인자)
- innerHTML 교체 시 DOM 참조 미보유

**CSS containing block 안전성** (DEVELOPMENT.md 테이블):
- `backdrop-filter`, `transform`, `filter`, `will-change`, `contain`, `perspective` 사용 시
- `slide2html-edit-override`에서 무력화 또는 안전 사유 문서화

### Step 2.3: Known Gotcha 감사

- section.slide 선택 금지 — 선택 로직 변경 시
- Moveable 핸들 패스스루 — 새 click/mousedown 핸들러 추가 시
- scrollClearDisabledRef — innerHTML 교체 시
- onActionStart — DOM 변경 전 호출
- rAF + setTargets — innerHTML 교체 후 재선택 시

### Step 2.4: 누락 Edge Case 체크리스트

- [ ] UNDO: 모든 mutation point에서 onActionStart()
- [ ] Multi-select: targets.length > 1 및 === 0
- [ ] Zoom: 픽셀 좌표를 zoom으로 나눔
- [ ] Navigation: 슬라이드 변경 시 targets 클리어
- [ ] Edit mode: isEditMode 게이팅
- [ ] Text editing: editingElement 충돌 없음
- [ ] Delta 직렬화: JSON 호환, /api/refactor 대응
- [ ] AI refactor: prompt 업데이트 필요 여부
- [ ] TypeScript strict: implicit any 없음
- [ ] Tailwind v4: @import "tailwindcss" 호환

### Step 2.5: 상태 관리 리뷰

- 새 state: 올바른 컴포넌트에 위치?
- SYNC WITH AI 시 리셋 (handleRefactor)?
- 파일 업로드 시 리셋 (handleFileUpload)?
- DOM 참조: UNDO/SYNC 후 생존?
- History: pushHistoryState를 통해서만 접근?

### Step 2.6: 테스팅 플랜 리뷰

- assertion 구체적, 측정 가능?
- UNDO, zoom, navigation, TypeScript 커버?

### Step 2.7: 이슈 분류 및 리뷰 작성

모든 이슈를 분류한다:
- `[BLOCKER]` — 구현 전 반드시 수정. 아키텍처 위반 또는 확실한 버그
- `[WARNING]` — 수정 권장. 특정 시나리오에서 버그 가능
- `[SUGGESTION]` — 코드 품질 또는 UX 개선

PRD 파일 하단에 리뷰 섹션을 추가:

```markdown
---

## PRD Review

**Reviewer**: Claude Code (automated)
**Date**: <오늘 날짜>
**Verdict**: <PASS / PASS WITH WARNINGS / NEEDS REVISION>

### Issues Found

#### Blockers
- [BLOCKER] <이슈>
  - **PRD 위치**: <섹션>
  - **Reference**: <DEVELOPMENT.md 규칙>
  - **해결 방안**: <수정 방법>

#### Warnings
- [WARNING] <이슈>
  - **Risk**: <잘못될 수 있는 것>
  - **해결 방안**: <수정 방법>

#### Suggestions
- [SUGGESTION] <아이디어>

### Summary
<전체 평가>
```

사용자에게 "Phase 2 완료: 리뷰 결과 — Verdict: X, Blockers: N, Warnings: N" 보고.

---

## Phase 3: 수정 (BLOCKER가 있을 때만)

Phase 2에서 `[BLOCKER]`가 발견되면:

### Step 3.1: BLOCKER 해결

각 blocker에 대해:
- PRD의 해당 "Proposed Changes" 섹션을 수정
- "Edge Cases & Gotchas" 섹션 업데이트
- 수정된 이슈를 커버하는 테스트 단계 추가/수정

### Step 3.2: 재리뷰

Step 2.2 ~ 2.6을 수정된 부분에 대해서만 재실행. 변경되지 않은 섹션은 재리뷰하지 않는다.

### Step 3.3: 리뷰 업데이트

리뷰 섹션의 verdict를 업데이트. 모든 blocker가 해결되면:
- Verdict를 `PASS` 또는 `PASS WITH WARNINGS`로 변경
- 해결된 blocker를 "Resolved" 서브섹션으로 이동

**수정은 최대 1회만 수행.** 1회 수정 후에도 blocker가 남아있으면 남은 이슈를 사용자에게 제시하고 가이드를 요청한다. 무한 루프 방지.

---

## Phase 4: 구현 플랜

PRD verdict가 `PASS` 또는 `PASS WITH WARNINGS`이면 구체적인 구현 플랜을 생성한다.

### Step 4.1: 파일 변경 매핑

PRD의 "Proposed Changes"를 구체적인 파일별 변경 목록으로 변환:

```markdown
## Implementation Plan

### File Changes

#### 1. `<파일 경로>`
**Action**: <신규 생성 / 기존 수정>
**Changes**:
- <라인 범위 또는 섹션>: <추가/변경할 내용>
- <라인 범위 또는 섹션>: <추가/변경할 내용>
**Depends on**: <먼저 완료해야 할 다른 파일 변경>
```

### Step 4.2: 의존성 순서 정렬

1. 타입 정의 (`src/lib/types.ts`)
2. 상태 관리 (`src/app/page.tsx`)
3. 컴포넌트 변경 (`InteractionOverlay`, `LayerPanel` 등)
4. API 라우트 변경 (필요시)
5. CSS / 스타일 변경

### Step 4.3: 검증 스텝

```markdown
### Verification

1. `npx tsc --noEmit` — TypeScript 컴파일 통과
2. `npm run lint` — 린트 에러 없음
3. Manual QA: <PRD에서 QA 스텝 복사>
4. Regression: <PRD에서 회귀 체크 복사>
```

### Step 4.4: PRD에 추가

구현 플랜을 PRD 파일의 리뷰 섹션 뒤에 추가한다.

---

## Phase 5: 유저 컨펌

사용자에게 아래 내용을 제시한다:

1. **PRD 파일 위치**: `.claude/prds/<slug>.md`
2. **리뷰 Verdict**: PASS / PASS WITH WARNINGS
3. **남은 warnings**: 개수와 간략 요약
4. **구현 플랜 요약**: 변경할 파일 수, 예상 범위
5. **Open Questions**: PRD에서 식별된 사용자 결정 필요 사항

**구현 진행 여부를 사용자에게 명시적으로 확인받는다.**

승인을 받으면 구현 플랜에 따라 코드 수정을 시작한다. 승인이 없으면 구현하지 않는다.
