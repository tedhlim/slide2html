---
name: review-prd
description: "기존 PRD를 아키텍처 일관성, 알려진 gotcha, 누락된 edge case 관점에서 리뷰합니다. PRD 파일명을 입력하세요."
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
---

# /review-prd — slide2html PRD 아키텍처 리뷰

기존 PRD 문서를 slide2html의 아키텍처 규칙과 알려진 gotcha 관점에서 체계적으로 리뷰한다.

## Input

사용자가 아래 중 하나를 입력한다:
- PRD slug: `multi-element-alignment` → `.claude/prds/multi-element-alignment.md`로 해석
- 전체 경로: `.claude/prds/some-feature.md`
- 미입력: `.claude/prds/` 디렉토리의 PRD 목록을 표시하고 선택 요청

## Step 0: PRD 로드

PRD 파일을 읽는다. 파일이 없으면 에러를 보고하고 사용 가능한 PRD 목록을 출력한다.

## Step 1: 레퍼런스 자료 로드

리뷰의 ground truth로 사용할 파일들을 읽는다:

1. `DEVELOPMENT.md` — 모든 gotcha와 규칙
2. `CLAUDE.md` — 아키텍처 개요, 7대 개발 규칙
3. `src/lib/types.ts` — VisualDelta 타입

PRD의 "Affected Components" 테이블에 명시된 소스 파일도 **반드시** 읽는다. PRD가 현재 동작에 대해 주장하는 내용을 실제 코드와 대조 검증해야 한다.

## Step 2: 아키텍처 일관성 체크

### 2a. 레이어 경계

PRD의 각 변경 제안에 대해 검증한다:
- 3-레이어 격리(Content / Interaction / Style Panel)를 존중하는가?
- iframe에 UI를 추가한다면, React portal 방식(Moveable 패턴)인가?
- 사이드바에 UI를 추가한다면, `#style-panel-portal` 패턴을 사용하는가?
- 격리되어야 할 레이어를 실수로 결합하지 않는가?

**이슈**: `[BLOCKER] 레이어 위반: <경계를 넘어서는 안 되는 것이 넘는 설명>`

### 2b. iframe 경계 규칙

PRD에서 iframe 콘텐츠와 상호작용하는 코드를 스캔한다:

- [ ] `instanceof`에 `iframe.contentWindow.HTMLElement` 사용 (부모 window의 HTMLElement가 아닌)
- [ ] `getComputedStyle`에 `iframeWindow` 사용
- [ ] 텍스트 선택에 `iframeWindow.getSelection()` 사용
- [ ] innerHTML 교체(UNDO) 시 DOM 참조를 유지하지 않음
- [ ] iframe document의 이벤트 리스너가 capture phase (세 번째 인자 `true`)

**이슈**: `[BLOCKER] iframe 경계: <위반된 규칙과 PRD 내 위치>`

### 2c. CSS Containing Block 안전성

feature가 iframe 내부 요소에 CSS를 추가하면, DEVELOPMENT.md 테이블과 대조:

| 속성 | Containing block 생성? |
|---|---|
| `backdrop-filter` | **YES** |
| `transform` (none이 아닌 값) | YES |
| `filter` (none이 아닌 값) | YES |
| `will-change: transform` | YES |
| `contain: paint/layout` | YES |
| `perspective` (none이 아닌 값) | YES |

위 속성을 도입하면 반드시:
1. `slide2html-edit-override`에서 무력화하거나
2. Moveable 위치 계산에 영향을 주지 않는 이유를 문서화

**이슈**: `[BLOCKER] CSS containing block: <속성>이 <요소>에 적용되어 Moveable 위치 계산을 깨뜨림`

## Step 3: Known Gotcha 감사

DEVELOPMENT.md의 각 알려진 gotcha에 대해 PRD를 체크한다:

### 3a. "section.slide 선택 금지"
선택 로직을 변경하면 `section.slide`과 `.slide-container`를 여전히 필터링하는지 확인.

### 3b. "Moveable 핸들 패스스루"
새 click/mousedown 핸들러를 추가하면 `.moveable-control-box`와 `moveable` 클래스 요소를 체크하고 이벤트를 통과시키는지 확인.

### 3c. "scrollClearDisabledRef 패턴"
innerHTML을 수정하면(UNDO처럼) 교체 전 `scrollClearDisabledRef.current = true` 설정, 이후 복원하는지 확인.

### 3d. "pushHistoryState before mutations"
DOM 변경이 있으면 변경 전 `onActionStart?.()` 호출이 있는지 확인.

### 3e. "requestAnimationFrame for setTargets after innerHTML"
innerHTML을 교체하고 요소를 재선택하면 `setTargets` 전에 `requestAnimationFrame`을 사용하는지 확인.

**이슈**: `[WARNING] Gotcha 미처리: <gotcha명> — <무엇이 잘못될 수 있는지>`

## Step 4: 누락 Edge Case 체크

PRD의 edge case 섹션을 아래 체크리스트와 대조:

- [ ] **UNDO**: 모든 mutation point에서 `onActionStart()` 호출이 문서화되었는가?
- [ ] **Multi-select**: `targets.length > 1`과 `targets.length === 0`을 모두 처리하는가?
- [ ] **Zoom**: 픽셀 좌표를 `zoom`으로 나누는가?
- [ ] **Slide navigation**: 슬라이드 변경 시 targets 클리어, scroll 클리어에서 생존?
- [ ] **Edit mode**: `isEditMode`로 게이팅되는가? Play 모드에서는?
- [ ] **Text editing**: `editingElement` (contentEditable 모드)와 충돌하지 않는가?
- [ ] **Delta 직렬화**: JSON 직렬화 가능하고 `/api/refactor`에 호환?
- [ ] **AI refactor**: AI refactor endpoint가 이 delta 타입을 이해하고 적용할 수 있는가?
- [ ] **TypeScript strict**: 모든 타입이 정의되고 implicit any가 없는가?
- [ ] **Tailwind v4**: `@import "tailwindcss"` 방식과 충돌하는 CSS가 없는가?

**이슈**: `[WARNING] 누락 edge case: <케이스> — <잠재적 실패 시나리오>`

## Step 5: 상태 관리 리뷰

### 5a. 새 State Variables
- 올바른 컴포넌트에 있는가? (page.tsx = 글로벌, InteractionOverlay = 인터랙션 로컬)
- SYNC WITH AI 시 리셋 필요한가? (handleRefactor — deltas, targets, htmlKey, history 리셋)
- 파일 업로드 시 리셋 필요한가? (handleFileUpload)
- InteractionOverlay에 props로 전달해야 하는가?

### 5b. Target References
iframe DOM 요소 참조를 저장하면:
- UNDO (innerHTML 교체) 시 참조가 죽는다. 어떻게 복원?
- SYNC WITH AI 시 참조가 죽는다. 적절히 클리어?

### 5c. History 상호작용
- history를 직접 수정하는가? `pushHistoryState`를 통해서만 접근해야 함
- UNDO가 이 feature의 변경을 올바르게 되돌리는가?

**이슈**: `[WARNING] 상태 관리: <우려 사항 설명>`

## Step 6: 테스팅 플랜 리뷰

- assertion이 구체적이고 측정 가능한가? (모호하지 않은가?)
- QA_GUIDE.md 패턴을 따르는가? (action → ASSERT → 측정 가능한 결과)
- 회귀 체크가 UNDO, zoom, navigation, TypeScript 컴파일을 커버하는가?
- Step 4에서 식별된 edge case를 테스트가 충분히 커버하는가?

**이슈**: `[SUGGESTION] 테스팅: <개선 제안>`

## Step 7: 리뷰 작성

PRD 파일 하단에 리뷰 섹션을 추가한다:

```markdown
---

## PRD Review

**Reviewer**: Claude Code (automated)
**Date**: <오늘 날짜>
**Verdict**: <PASS / PASS WITH WARNINGS / NEEDS REVISION>

### Issues Found

#### Blockers (구현 전 반드시 수정)

- [BLOCKER] <이슈 설명>
  - **PRD 위치**: <해당 섹션>
  - **Reference**: <DEVELOPMENT.md 규칙 또는 CLAUDE.md 섹션>
  - **해결 방안**: <어떻게 수정>

#### Warnings (수정 권장, 버그 위험)

- [WARNING] <이슈 설명>
  - **PRD 위치**: <해당 섹션>
  - **Risk**: <무엇이 잘못될 수 있는지>
  - **해결 방안**: <어떻게 수정>

#### Suggestions (권장 개선사항)

- [SUGGESTION] <개선 아이디어>

### Summary
<2-3문장 전체 평가. 구현 준비가 되었는가? 가장 큰 리스크는?>
```

## Step 8: Verdict 보고

사용자에게 간결한 요약을 출력한다:
- Verdict (PASS / PASS WITH WARNINGS / NEEDS REVISION)
- Blockers, Warnings, Suggestions 개수
- 가장 중요한 이슈 1개 (있으면)
- PRD 파일 내 리뷰 위치
