# RFC: Next.js 16 라우팅/캐시 통합 관측 CLI

- Status: Draft
- Last Updated: 2026-02-17
- Target: v0 (CLI First)
- Scope: Next.js 16.x, Node Runtime

## 1. Summary

Next.js App Router/RSC 환경에서 라우팅, RSC 스트리밍, fetch 캐시 결정, revalidate, Server Actions를 **내비게이션 1회 단위**로 통합 관측하는 오픈소스 도구를 제안한다.  
v0는 Chrome DevTools 패널보다 **CLI를 먼저 출시**하고, 동일 이벤트 스키마를 기반으로 이후 Standalone UI/DevTools 뷰를 확장한다.

## 2. Problem Statement

App Router 기반 프로젝트에서 다음 질문에 답하기 어렵다.

- 왜 이 내비게이션이 느린가?
- 왜 이 데이터가 stale 상태로 보이는가?
- revalidate(tag/path) 1회가 어떤 라우트/캐시에 영향을 줬는가?

현재 도구들은 네트워크, React 렌더, 서버 로그를 분리해 보여주는 경우가 많아, 다층 캐시와 RSC 흐름을 한 번에 추적하기 어렵다.

## 3. Goals / Non-goals

### Goals

- 내비게이션 단위 타임라인으로 원인 좁히기
- `revalidate(tag|path)` 영향 범위 요약 제공
- 트레이스(JSONL)와 리포트(JSON)를 팀 내 재현/공유 가능하게 제공
- 개인정보 기본 보호(강한 마스킹)
- 새로고침/크래시를 내비게이션 종료 상태로 분류해 누락 없이 기록

### Non-goals (v0)

- Edge Runtime 지원
- 브라우저 패널 UI 완성
- 모든 사용자 코드/서드파티 라이브러리 내부 동작 100% 계측

## 4. Scope (v0)

### 포함 범위

- Route navigation (`push`, `replace`, `refresh`, `prefetch`)
- RSC stream chunk 관측
- fetch cache decision (`hit`/`miss`/`stale`)
- revalidate (`tag`, `path`)
- Server Actions 실행 결과/지연시간

### 제외 범위

- Next.js 16.x 이외 메이저 버전
- Node 이외 런타임

## 5. Success Criteria

- 골든 시나리오(통제된 테스트): **원인 식별 100%** (`completed`, `soft_aborted` 대상)
- 실제 트레이스(운영 유사 워크로드): **원인 식별 90~95%**
- 동일 입력 트레이스에 대해 동일 요약 리포트 보장(재현성)
- 비정상 종료(`hard_reload`, `client_crash`, `server_crash`, `orphaned`)는 원인 식별 KPI와 분리해 분류 정확도로 관리

## 6. Data Contract (Event Schema v0)

결정: 원본 trace(JSONL)의 각 Event는 `schemaVersion`, `traceId`, `sessionId`, `seq`를 반드시 포함하는 self-contained 레코드로 정의한다(외부 envelope 미사용).

```ts
type Base = {
  schemaVersion: string; // event schema compatibility key
  traceId: string; // single collection run id
  sessionId: string; // runtime instance id within trace
  ts: number; // epoch ms
  navId: string; // 내비게이션 단위 correlation id
  seq: number; // session 내 단조 증가 sequence (dedupe key 구성요소)
};

type RouteChange = Base & {
  t: "routeChange";
  from: string;
  to: string;
  kind: "push" | "replace" | "refresh" | "prefetch";
};

type NavEnd = Base & {
  t: "navEnd";
  status:
    | "completed"
    | "soft_aborted"
    | "hard_reload"
    | "client_crash"
    | "server_crash"
    | "orphaned";
  flush: "ok" | "partial" | "failed";
  reason?: string;
};

type RscChunk = Base & {
  t: "rscChunk";
  route: string;
  chunkId: string;
  bytes: number;
  ttfbMs: number;
  done: boolean;
};

type FetchDecision = Base & {
  t: "fetchDecision";
  urlHash: string; // 원본 URL 미저장, 해시만 저장
  cacheMode: string;
  revalidateSec?: number;
  result: "hit" | "miss" | "stale";
  reason: string;
};

type Revalidate = Base & {
  t: "revalidate";
  type: "tag" | "path";
  keyHash: string; // 원본 key 미저장
  caller: string;
  affectedRoutesEstimate: number;
};

type Action = Base & {
  t: "action";
  name: string;
  durationMs: number;
  status: "ok" | "err";
  errCode?: string;
};

type Event = RouteChange | NavEnd | RscChunk | FetchDecision | Revalidate | Action;
```

## 7. Architecture (CLI First)

1. Collector
- 공식 훅/계측 포인트 우선 사용
- 이벤트를 스키마로 정규화

2. Fallback Collector (Read-only)
- 훅 기반 수집 실패/누락 시 로그/네트워크 신호로 보완
- 정확도 저하 가능성은 리포트에 명시

3. Storage
- Append-only JSONL
- v1.0 범위에서는 SQLite 미지원(추후 재검토)

4. Analyzer
- 내비게이션 단위 병합/정렬
- 병목/원인 후보 추론
- `revalidate(tag|path)` 영향도를 `observed ∪ static_possible`로 계산

5. Navigation Finalizer
- `beforeunload`/`pagehide`에서 flush 시도(`sendBeacon` 우선)
- 프로세스/세션 재시작 시 미종결 nav를 `orphaned`로 마킹

6. Reporter (CLI)
- 타임라인 요약
- 세그먼트 영향 요약
- revalidate 영향도 요약

## 8. CLI UX (Draft)

```bash
next-vi record --out .next-vi/traces/session-001.jsonl
next-vi report --in .next-vi/traces/session-001.jsonl --out .next-vi/reports/session-001.json
next-vi report --in .next-vi/reports/session-001.json --view summary
next-vi diff --base .next-vi/reports/base.json --head .next-vi/reports/head.json --out .next-vi/reports/diff.json
```

`report` 출력 계약은 `json` 단일로 고정한다.  
`report --out`은 JSON 아티팩트만 생성하고, `report --view summary`는 저장 없이 콘솔 렌더링만 수행한다.  
아래 템플릿은 저장 포맷이 아니라 CLI의 사람용 표시(`--view summary`) 규격이다.

```text
NAV nav_01  /products -> /products/42  kind=push  total=1284ms  status=hard_reload
RSC  chunks=9  bytes=178KB  ttfb=220ms
FETCH  hit=12  stale=2  miss=1
INVALIDATION  revalidateTag("products","max")  caller=app/actions.ts:updateProduct
IMPACT  affected_routes_estimate=7  observed=3  static_possible=4  confidence=0.93(high)
TOP_CAUSE  [high] stale-while-revalidate served before refresh completed
NEXT_ACTION  verify tag scope("products") and split broad tag into detail tags
```

요약 표시는 항상 JSON 리포트를 기준으로 렌더링하며, 별도 저장 포맷(`text`, `markdown`)은 제공하지 않는다.

### 채널 우선순위 결정 근거

- 초기 제안에서 Chrome DevTools 패널을 추천한 이유:
  - 개발 중 기본 동선(브라우저 DevTools)과 결합되어 학습 비용/컨텍스트 전환이 낮음
  - 라우팅/RSC/캐시 이벤트를 시간축으로 시각화해 MVP 이해 속도가 빠름
  - UI 기반 피드백 루프가 빨라 정보 구조를 조정하기 쉬움
- 최종 결정을 CLI First로 확정한 이유:
  - 브라우저 종속 없이 팀 공유/재현/CI 아티팩트 첨부가 가능함
  - JSON 리포트 산출물을 기준으로 회귀 비교와 자동화 검증이 쉬움
  - 민감정보 마스킹 정책을 출력 파이프라인에 일관되게 강제하기 유리함
- 결정: v0는 CLI를 우선 구현하고, DevTools/Standalone은 동일 이벤트 스키마를 소비하는 뷰 레이어로 확장한다.

## 9. Privacy & Security

기본값(강한 마스킹):

- URL: path/쿼리 원문 저장 금지, 해시화
- Headers: allowlist 외 마스킹
- Body: 기본 비수집
- Token/Key/Password 패턴 탐지 시 강제 제거

정밀 캡처는 명시적 opt-in 플래그 없이는 비활성화한다.

## 10. Compatibility Strategy

- 지원 버전: Next.js `16.x`
- 호환성 매트릭스: 16.x minor 단위로 CI 검증
- 내부 구현 변화 대비:
  - 1순위: 공식 훅/계측 포인트
  - 2순위: 폴백 수집기(read-only)

## 11. Risks and Mitigations

1. Next 내부 변경으로 계측 지점이 깨질 수 있음
- 완화: 훅 + 폴백 이중화, 버전별 어댑터 분리

2. 민감정보 유출 위험
- 완화: 기본 강한 마스킹, opt-in 정책, 비밀 패턴 강제 제거

3. 판정 정확도 과신 위험
- 완화: 이벤트별 신뢰 점수+레벨 동시 표시(`confidenceScore`, `confidenceLevel`)

## 12. Milestones (6 Weeks)

1-2주차
- 이벤트 스키마 확정
- 마스킹 파이프라인
- `record` / `report` 기본 CLI

3-4주차
- 폴백 수집기 도입
- 내비게이션 타임라인 리포트
- 리포트 결정성/회귀 비교 안정화

5-6주차
- 골든 시나리오 100% 달성
- 실제 트레이스 90~95% 검증
- 16.x 호환 매트릭스 자동화

## 13. Future Work

- Chrome DevTools 패널(동일 스키마 기반 뷰 레이어)
- Standalone 웹 UI
- CI 리포트 업로드/아티팩트 통합

## 14. Q&A 결정 로그 (사용자 질의 기반)

Q1. "내비게이션 1회 단위"에서 새로고침이나 크래시는 어떻게 처리하나요?  
A1. 내비게이션 종료 이벤트(`navEnd`)를 강제한다. 종료 상태는 `completed`, `soft_aborted`, `hard_reload`, `client_crash`, `server_crash`, `orphaned`로 고정한다. 브라우저 종료/새로고침 시 `beforeunload`/`pagehide`에서 flush를 시도하고, flush 실패/강제 종료로 미완료된 세션은 다음 실행에서 `orphaned`로 마킹한다.

Q2. "App Router 기반 프로젝트에서 답하기 어렵다"는 주장이 사실인가요? 대체 도구가 없나요?  
A2. 공식 문서 기준으로 캐시 계층은 Router/Data/Full Route Cache처럼 분리 설명되며, `revalidatePath`/`revalidateTag`도 호출 컨텍스트별 동작이 다르다. 공식 디버깅 문서는 주로 런타임 디버거 중심이고, 캐시 무효화 영향도를 내비게이션 단위로 통합 시각화하는 전용 OSS는 확인 시점 기준 희소했다. 따라서 "통합 관측/영향도 추적" 공백은 유효하다고 판단한다.

Q3. 코드 기반으로 `revalidate(tag|path)` 영향도는 어떻게 계산하나요?  
A3. 정적 분석과 실행 관측을 결합한다. 정적 분석으로 라우트 트리와 `revalidatePath`/`revalidateTag`/태그 사용 지점을 수집하고, 실행 중에는 실제 invalidation 및 cache read 이벤트를 기록한다. 최종 영향도는 `affectedRoutesEstimate = observed ∪ static_possible`로 계산하고, `confidenceScore(0~1)`를 산출한 뒤 `confidenceLevel(high|medium|low)`로 파생해 함께 제공한다.

Q4. "출력은 사람이 읽기 쉬운 요약"이 추상적이지 않나요?  
A4. RFC는 `report` 저장 포맷을 JSON 단일로 고정하고, CLI 텍스트 요약은 `--view summary` 렌더링 규격으로만 제공한다. 즉 교환/자동화는 JSON 1개로 통일하고, 사람용 읽기 포맷은 JSON에서 파생한다.

Q5. 왜 처음에는 Chrome DevTools를 먼저 추천했고, 최종 결정은 CLI First인가요?  
A5. 초기 추천은 "MVP 검증 속도" 기준이었다. DevTools는 개발자의 기존 디버깅 동선 안에서 타임라인 시각화를 즉시 보여줄 수 있어 학습/피드백 루프가 빠르다. 다만 최종 우선순위는 "운영 적용성"으로 전환되었다. CLI는 브라우저 비종속, 리포트 공유/재현, CI 연동, 아티팩트 보관이 유리하므로 v0 우선순위로 채택했다. DevTools는 이후 동일 스키마 기반 뷰 레이어로 확장한다.

Q6. flush 재시도 + 중복 제거는 어떤 기준/조건에서 실행하나요?  
A6. flush는 (1) `navEnd` 기록 시점, (2) `beforeunload`/`pagehide`, (3) 버퍼 임계치 초과(`>=100` events 또는 `>=1MB`)에서 트리거한다. 재시도는 네트워크 오류/타임아웃/프로세스 중단 신호에서만 수행하고, 일반 경로는 최대 3회(0ms, 200ms, 1000ms), unload 경로는 `sendBeacon` 1회 + `fetch keepalive` 1회로 제한한다. 중복 제거는 `eventId = hash(schemaVersion, traceId, sessionId, navId, seq)` 키로 ingest 단계에서 unique 제약으로 처리하며, 재시도는 at-least-once를 보장하고 dedupe가 정확성을 보장한다.

Q7. `schemaVersion`, `traceId`, `sessionId`의 역할은 무엇인가요?  
A7. `schemaVersion`은 이벤트 포맷 호환성 키(파서 분기 기준), `traceId`는 한 번의 수집 실행 단위 식별자(공유/비교 단위), `sessionId`는 동일 trace 내부 프로세스/탭 인스턴스 식별자(재시작 경계 추적)다. 계층 관계는 `traceId > sessionId > navId`를 기본으로 한다.

Q8. `next-vi diff --base <report> --head <report>`는 무엇을 의미하나요?  
A8. `base`는 기준 리포트(예: main, 이전 배포), `head`는 비교 대상 리포트(예: PR, 신규 배포)다. `diff`는 두 JSON 리포트를 비교해 내비게이션 지연 변화, cache hit/miss/stale 변화, invalidation 영향 범위 변화, 주요 원인 변화(`TOP_CAUSE`)를 요약한 JSON 결과를 생성한다.

## 15. Post-v0 Execution Plan (12 Weeks)

### 15.1 v0.1 안정화 (주 1-2)

주요 작업:
- `navEnd` 누락 복구 로직 고도화(`orphaned` 판정)
- flush 실패 재시도 및 중복 이벤트 제거
- 이벤트 메타 필드 고정: `schemaVersion`, `traceId`, `sessionId`
- Next.js `16.x` minor 호환 매트릭스 시작

산출물:
- `compatibility.md` (지원/제한 버전 명시)
- `known-issues.md` (재현 절차 포함)
- 샘플 트레이스 20개(JSONL)

완료 기준(DoD):
- 골든 시나리오 20/20 통과
- 비정상 종료 분류 임계값은 `../plan/fixture-next16-golden-scenarios.md` Gate C 기준 준수
- 수집 오버헤드/리포트 처리 시간은 `../plan/fixture-next16-golden-scenarios.md` Gate D 측정 정책 준수

### 15.2 v1.0 팀 적용 (주 3-6)

주요 작업:
- `report` 출력 계약 JSON 단일 고정
- `report --view summary` 렌더링 규격 고정(JSON 파생)
- `next-vi diff --base <report> --head <report>` 추가
- CI 템플릿 제공(GitHub Actions 기준)
- 마스킹 정책 파일 `.next-vi/policy.json` 도입

산출물:
- CI 워크플로우 예제 1개
- PR 코멘트용 요약 템플릿
- 리포트 스키마 문서(버전 정책 포함)

완료 기준(DoD):
- 동일 입력에 대한 동일 리포트(결정성) 보장
- PR 단계에서 회귀 원인 1줄 요약 자동 출력
- 실제 트레이스 원인 식별률 `90~95%`

### 15.3 v1.5 DevTools 패널 (주 7-9)

주요 작업:
- Chrome DevTools 패널 구현(수집 없음, 뷰 전용)
- JSON 리포트/JSONL 로더 구현
- 타임라인/세그먼트 트리/영향도 맵 3개 뷰 제공

산출물:
- 패널 MVP
- 데모 리포지토리 1개

완료 기준(DoD):
- 동일 트레이스 입력 시 CLI vs 패널 핵심 수치 100% 일치
- 패널 자체에서 민감정보 비마스킹 값 노출 없음

### 15.4 v2.0 Standalone 웹 UI (주 10-12)

주요 작업:
- 브라우저 비종속 대시보드 구현
- 세션 비교/필터링/내보내기(`.md`, `.json`) 지원
- 대용량 트레이스 스트리밍 파서(100MB 기준) 도입

산출물:
- Self-hostable UI 패키지
- 팀 공유 가이드

완료 기준(DoD):
- 100MB 트레이스 로드 p95 `< 3s`
- 세션 비교 리포트 자동 생성

### 15.5 즉시 백로그 (다음 1주)

- `schemaVersion`, `traceId`, `sessionId` 필드 추가
- `orphaned` 판정 테스트 10개 작성
- `next-vi diff` 명령 인터페이스 확정
- CI 템플릿 초안 작성
- 마스킹 정책 파일 스펙 동결

## 16. References

- Next.js Caching Guide: https://nextjs.org/docs/app/guides/caching
- revalidatePath API: https://nextjs.org/docs/app/api-reference/functions/revalidatePath
- revalidateTag API: https://nextjs.org/docs/app/api-reference/functions/revalidateTag
- next.config.js logging: https://nextjs.org/docs/app/api-reference/config/next-config-js/logging
- Next.js Debugging Guide: https://nextjs.org/docs/app/guides/debugging
- Caches Bypassed in Development Mode: https://nextjs.org/docs/messages/cache-bypass-in-dev
- Next.js 16 Release Notes: https://nextjs.org/blog/next-16
- Next.js MCP Guide: https://nextjs.org/docs/app/guides/mcp
- React Profiler: https://react.dev/reference/react/Profiler
- Glossary (local): ./terms.md
