---
name: prd
description: "기능 설명을 입력하면 코드베이스를 분석하여 구조화된 PRD 문서를 .claude/prds/에 작성합니다."
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
---

# /prd — slide2html Feature PRD 자동 생성

사용자가 간단한 기능 설명을 입력하면, 코드베이스를 분석하여 이 프로젝트의 아키텍처에 맞는 구조화된 PRD를 작성한다.

## Step 0: Feature Name 추출

사용자 설명에서 kebab-case slug를 생성한다.
- 예: "색상 팔레트 히스토리" → `color-palette-history`
- 예: "요소 정렬 스냅" → `element-alignment-snap`

PRD 파일 경로: `.claude/prds/<slug>.md`

`.claude/prds/` 디렉토리가 없으면 생성한다.

## Step 1: 아키텍처 컨텍스트 로드

**반드시 모두 읽는다. 스킵하지 않는다:**

1. `CLAUDE.md` — 프로젝트 아키텍처 개요, 7대 개발 규칙
2. `DEVELOPMENT.md` — 상세 gotcha: iframe 경계, CSS containing block, 상태 관리, 이벤트 핸들링, zoom, 컴포넌트 통신
3. `src/lib/types.ts` — VisualDelta, DebugInfo 타입 정의

내부화할 핵심 개념:
- **샌드위치 레이어링**: Content Layer (iframe) / Interaction Layer (Moveable portal) / Style Panel (sidebar portal)
- **데이터 흐름**: Visual Edit → Delta → AI Sync → Clean HTML
- **7대 개발 규칙** (CLAUDE.md의 Development Rules 섹션)

## Step 2: 관련 컴포넌트 탐색

feature 설명을 분석하여 영향 받는 소스 파일을 읽는다:

| feature가 터치하는 영역 | 읽을 파일 |
|---|---|
| 선택, 드래그, 리사이즈, 스타일 변경, 키보드 단축키 | `src/components/InteractionOverlay.tsx` |
| DOM 트리 패널, 선택 동기화 | `src/components/LayerPanel.tsx` |
| iframe 렌더링, Tailwind 주입 | `src/components/IframeRenderer.tsx` |
| 상태 관리, UNDO, 델타, 네비게이션, 툴바 | `src/app/page.tsx` |
| AI 리팩터링, cheerio 파싱, LLM 프롬프트 | `src/app/api/refactor/route.ts` |
| 스토리지 | `src/app/api/storage/read/route.ts`, `write/route.ts` |
| QA / 테스팅 패턴 | `QA_GUIDE.md` |

Grep과 Glob으로 feature와 관련된 추가 파일도 탐색한다.

## Step 3: 기존 패턴 파악

새 feature와 유사한 기존 구현을 레퍼런스로 식별한다:

- **UI 컨트롤 추가** → `handleStyleChange` 패턴 (InteractionOverlay.tsx)
- **이벤트 핸들러 추가** → capture phase 등록 패턴 (InteractionOverlay.tsx의 mousedown/pointerdown)
- **상태 흐름 추가** → targets/deltas/history 관리 (page.tsx)
- **포탈 패턴** → Moveable (iframe body로), Style Panel (#style-panel-portal로)

어떤 기존 패턴을 따라야 하고 어디서 다르게 가야 하는지 문서화한다.

## Step 4: PRD 작성

`.claude/prds/<slug>.md` 파일을 아래 구조로 생성한다:

```markdown
# PRD: <Feature 제목>

**Author**: Claude Code (auto-generated)
**Date**: <오늘 날짜>
**Status**: Draft

## Summary
<2-3문장 요약>

## Motivation
<왜 필요한지, 어떤 문제를 해결하는지>

## Current Architecture Context
<관련 시스템이 현재 어떻게 동작하는지, 파일 경로와 상태 변수 참조>

### Affected Components
| Component | File | How It's Affected |
|---|---|---|

### Key State Variables
| Variable | Location | Relevance |
|---|---|---|

## Proposed Changes

### <변경 영역 1>
<상세 설명: 컴포넌트 트리에서의 위치, props, page.tsx와의 통신 방식, 포탈 패턴>

### <변경 영역 2>
<...>

## Edge Cases & Gotchas
<관련된 것만 포함. DEVELOPMENT.md 규칙명을 참조:>
- **Cross-iframe instanceof**: <이 feature에서 어떻게 처리하는지>
- **DOM references after innerHTML**: <UNDO에 미치는 영향>
- **CSS containing blocks**: <새 CSS가 containing block을 만드는지>
- **Event capture phase**: <이벤트 리스너 추가 시>
- **Zoom handling**: <좌표 관련 시>
- **History/UNDO support**: onActionStart() 호출 지점은?
- **Multi-select**: targets.length > 1일 때 동작은?
- **Slide navigation**: 슬라이드 전환 시 scroll clear와의 상호작용
- **Edit mode vs Play mode**: isEditMode에 의한 게이팅

## Delta Integration
<VisualDelta 형태, merge 로직, AI refactor endpoint 대응>
<델타를 생성하지 않으면 "N/A" 명시>

## Testing Plan

### Manual QA Steps
1. <단계> — **ASSERT**: <기대 결과>
2. ...

### Regression Checks
- [ ] 요소 선택 → 새 기능 → UNDO → 정상 복원
- [ ] zoom != 1 환경 (#deck transform 있는 덱)
- [ ] 슬라이드 네비게이션 후 상태
- [ ] `npx tsc --noEmit` 통과

## Implementation Order
1. <먼저 할 것과 이유>
2. <...>

## Open Questions
<구현 전 사용자 결정이 필요한 모호한 점>
```

## Step 5: 셀프 체크

저장 전에 아래 기준으로 검증한다:

1. 모든 "Proposed Changes" 섹션이 구체적인 파일 경로를 참조하는가?
2. 모든 edge case가 DEVELOPMENT.md의 특정 규칙을 참조하는가?
3. iframe 내부 이벤트 리스너는 모두 capture phase로 문서화되었는가?
4. DOM 변경 전 onActionStart() 호출이 명시되었는가?
5. Testing plan이 Playwright로 자동화 가능할 만큼 구체적인가?

하나라도 실패하면 PRD를 수정한 뒤 저장한다.

## Step 6: 사용자에게 보고

아래 내용을 출력한다:
- PRD 파일 위치
- 영향 받는 컴포넌트 수
- 식별된 주요 edge case
- 사용자 결정이 필요한 Open Questions (있으면)
