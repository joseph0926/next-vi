# Visualization RFC: next-vi 시각화/상호작용 명세

- Status: Draft
- Last Updated: 2026-02-17
- Parent RFC: `./cli-rfc.md`
- Technical RFC: `./technical-rfc.md`
- Commands RFC: `./commands-rfc.md`
- Terms: `./terms.md`
- Mermaid RFC: `./mermaid-rfc.md`

## 1. Summary

본 문서는 next-vi의 시각화 표현 방식과 사용자 상호작용 흐름을 정의한다.  
v1.0 범위의 진실 소스는 `report JSON`이며, 시각화는 해당 JSON을 렌더링한다.

핵심 목표:
- 한 번의 내비게이션 단위로 원인 추적을 빠르게 수행
- `revalidate(tag|path)` 영향도를 눈으로 확인
- 회귀 비교 결과(`diff`)를 팀이 동일한 관점으로 해석

## 2. 범위

포함:
- CLI `--view summary` 시각 표현 규격
- DevTools/Standalone의 화면 구성(미래 구현 기준)
- 화면 상태(loading/empty/error), 상호작용, 정보 계층

제외:
- 수집기 구현 세부(Collector 내부 로직)
- SQLite 기반 뷰 최적화 (v1.0 미반영)

## 3. 입력 데이터 원칙

- 시각화 입력 기본: `report JSON`
- 비교 화면 입력: `diff JSON`
- trace(JSONL)는 분석 전 단계 입력이며, 시각화는 직접 trace를 해석하지 않는다(예외: 개발용 Raw Events 뷰)

## 4. 사용자 시나리오

## 4.1 장애 분석 시나리오

1. 사용자: `next-vi report --in trace.jsonl --out report.json`
2. 사용자: `next-vi report --in report.json --view summary`
3. 화면: 느린 nav, cache miss/stale, invalidation 이벤트를 한 번에 표시
4. 결과: `TOP_CAUSE`와 `NEXT_ACTION`으로 대응 가이드 제시

## 4.2 회귀 비교 시나리오

1. 사용자: `next-vi diff --base base.json --head head.json --out diff.json`
2. 화면: duration/cache/invalidation delta를 우선순위대로 노출
3. 결과: PR/배포 변경의 영향 여부를 즉시 판단

## 5. 화면 정보 구조 (Information Architecture)

공통 구조:
- Header: `traceId`, `schemaVersion`, 생성 시각, 필터
- Primary Tabs: `Overview`, `Timeline`, `Segment Tree`, `Invalidation`, `Diff`
- Side Panel: 선택 객체 상세(raw event, caller, confidenceScore/confidenceLevel)

탭별 목적:
- `Overview`: 전체 요약 카드 + 주요 원인 상위 3개
- `Timeline`: nav 단위 이벤트 시퀀스(시간축)
- `Segment Tree`: layout/page 재사용/재렌더 영향
- `Invalidation`: revalidate -> 영향 라우트 관계 맵
- `Diff`: base/head 비교 결과

## 6. 실제 화면 스케치 (텍스트 와이어프레임)

## 6.1 Overview

```text
+----------------------------------------------------------------------------------+
| traceId=tr_abc123  schema=1.0.0  navCount=12  generatedAt=2026-02-17T09:20:11Z |
+----------------------------------------------------------------------------------+
| [Total Nav 12] [Avg 842ms] [stale 2] [hard_reload 1] [orphaned 1]              |
+--------------------------------------+-------------------------------------------+
| TOP_CAUSE #1                         | NEXT_ACTION                               |
| stale-while-revalidate before refresh| split broad tag: products -> detail tags  |
| confidence: 0.92 (high)              | owner: app/actions.ts:updateProduct       |
+--------------------------------------+-------------------------------------------+
| TOP_CAUSE #2 ...                                                                  |
+----------------------------------------------------------------------------------+
```

## 6.2 Timeline

```text
NAV nav_01  /products -> /products/42  total=1284ms status=hard_reload
0ms    220ms         480ms             910ms                     1284ms
|------RSC(TTFB)-----|-----FETCH------|-----INVALIDATION--------|--END--|
        hit=3 miss=1 stale=1         revalidateTag(products)
```

규칙:
- 이벤트 타입별 색/패턴 고정
- 선택 시 side panel에 raw payload + 마스킹 상태 표시

## 6.3 Segment Tree

```text
app/layout
 ├─ products/layout        [reused]
 └─ products/[id]/page     [rerendered][stale->fresh]
```

배지:
- `reused`, `rerendered`, `stale`, `fresh`, `invalidated`

## 6.4 Invalidation Map

```text
revalidateTag(products)
   ├─ observed: /products
   ├─ observed: /products/42
   └─ static_possible: /products/[id]
confidence: 0.93 (high)
```

## 6.5 Diff

```text
base: report-main.json  head: report-pr-182.json

duration delta (avg): +180ms
cache delta: hit -4 / miss +3 / stale +1
impact delta: affectedRoutesEstimate +2
top_cause delta: cache_miss_ratio_up (medium -> high)
```

## 7. 상호작용 규칙

- Timeline에서 nav 선택 시 전체 탭의 컨텍스트를 해당 nav로 동기화
- Invalidation에서 tag/path 선택 시 Timeline에서 관련 이벤트 하이라이트
- Diff에서 delta 항목 클릭 시 base/head 상세 카드 동시 표시
- 모든 상세 패널은 `confidenceScore`, `confidenceLevel`, `evidence`를 함께 표기

## 8. 상태/오류 처리

상태:
- `loading`: skeleton + 입력 경로 표시
- `empty`: "nav 이벤트 없음" + 재생성 명령 안내
- `error`: 스키마 불일치/파일 손상/권한 오류 분리 표시

오류 메시지 원칙:
- 원인 + 해결 방법 + 재시도 명령을 1화면에 제공

예시:
- `schema mismatch: expected 1.0.0, got 0.9.0`
- `action: run next-vi report --in <trace> --out <report>`

## 9. 시각 토큰 규칙

타입 색상:
- routeChange: blue
- rscChunk: cyan
- fetchDecision hit/miss/stale: green/red/amber
- revalidate: orange
- action ok/err: teal/red
- navEnd abnormal: magenta

신뢰도:
- high: solid badge
- medium: outlined badge
- low: muted badge

## 10. 접근성/가독성

- 키보드로 탭/타임라인/상세 패널 이동 가능
- 색상 외 패턴/아이콘으로 상태 이중 표현
- 최소 대비 4.5:1
- 숫자 단위(ms, KB, count) 일관 표기

## 11. 성능 요구사항

- report JSON 10MB 로드: p95 < 1.5s
- 탭 전환: p95 < 120ms
- Timeline 스크롤/확대: 60fps 유지 목표

## 12. 릴리즈 단계별 시각화 범위

v1.0 (CLI):
- `--view summary` 텍스트 시각화(고정 템플릿)

v1.5 (DevTools):
- `Overview`, `Timeline`, `Invalidation` 우선
- `Segment Tree`, `Diff`는 2차 확장

v2.0 (Standalone):
- 다중 report 세션 비교
- 팀 공유 링크/내보내기

## 13. 구현 산출물 체크리스트

- [ ] `report-view-schema.md` (view model 키 정의)
- [ ] `summary-render-spec.md` (CLI summary 라인 규칙)
- [ ] `timeline-color-token.md` (타입별 시각 토큰)
- [ ] `diff-visual-priority.md` (delta 우선순위 규칙)
- [ ] 시각화 스냅샷 fixture 20개
