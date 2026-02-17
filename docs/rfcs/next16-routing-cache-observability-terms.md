# Next.js 16 라우팅/캐시 통합 관측 용어 정의

- Version: v0.1-draft
- Last Updated: 2026-02-17
- Parent RFC: `./next16-routing-cache-observability-cli-rfc.md`

## 1. 식별자 계층

정책: 원본 trace(JSONL) 이벤트는 외부 envelope 없이 self-contained 레코드로 저장하며, 각 이벤트에 `schemaVersion`, `traceId`, `sessionId`, `seq`를 포함한다.

### `schemaVersion`
- 이벤트 스키마 버전.
- 리포터/파서가 어떤 구조로 해석할지 결정하는 호환성 키.
- 예: `1.0.0`, `1.1.0`.

### `traceId`
- 한 번의 수집 실행(run) 전체를 대표하는 식별자.
- 공유/재현/비교 단위의 루트 키.
- 일반적으로 CI job 또는 로컬 수집 세션 1회에 1개.

### `sessionId`
- 동일 `traceId` 내부에서 프로세스/탭/런타임 인스턴스를 구분하는 식별자.
- 앱 재시작, 탭 재생성 등 경계 추적에 사용.

### `navId`
- 사용자 내비게이션 1회를 묶는 correlation id.
- `routeChange`부터 `navEnd`까지 동일값 유지.

### `seq`
- 동일 `sessionId` 내 이벤트 순서를 나타내는 단조 증가 번호.
- `eventId` 생성에 사용되며 중복 제거 키의 안정성을 높인다.

### `eventId`
- 이벤트 중복 제거 키.
- 기본 생성식: `hash(schemaVersion, traceId, sessionId, navId, seq)`.

## 2. 내비게이션 종료 상태 (`navEnd.status`)

### `completed`
- 정상적으로 내비게이션이 끝난 상태.

### `soft_aborted`
- 사용자 이동/경합 등으로 중단됐지만, 프로세스는 정상 동작 중인 상태.

### `hard_reload`
- 새로고침/강한 전환으로 현재 컨텍스트가 교체된 상태.

### `client_crash`
- 클라이언트 런타임 예외로 내비게이션이 비정상 종료된 상태.

### `server_crash`
- 서버 프로세스 중단 등으로 종료 신호가 발생한 상태.

### `orphaned`
- `routeChange`는 기록됐지만 `navEnd`를 남기기 전에 종료되어, 다음 실행에서 미종결로 판정된 상태.

## 3. Flush / Retry / Dedupe 정책

### Flush 트리거
- `navEnd` 이벤트 기록 시점
- `beforeunload` 또는 `pagehide`
- 버퍼 임계치 초과: `>=100 events` 또는 `>=1MB`

### Retry 조건
- 네트워크 오류
- 업로드 타임아웃
- 프로세스 종료 신호로 flush 완료 불확실

### Retry 횟수/전략
- 일반 경로: 최대 3회 (`0ms`, `200ms`, `1000ms`)
- unload 경로: `sendBeacon` 1회 + `fetch keepalive` 1회

### Dedupe 규칙
- ingest 단계에서 `eventId` unique 제약으로 중복 제거
- 전략 목적:
  - retry로 데이터 유실 최소화(at-least-once)
  - dedupe로 이중 집계 방지

## 4. 영향도 계산 용어

### `observed`
- 실제 실행 중 관측된 영향 라우트 집합.

### `static_possible`
- 코드/라우트 분석으로 가능한 영향 라우트 집합.

### `affectedRoutesEstimate`
- 최종 추정 집합 크기.
- 계산식: `observed ∪ static_possible`.

### `confidence`
- 영향도 추정 신뢰도 레벨.
- 값: `high`, `medium`, `low`.

## 5. 운영 지표(DoD 관련)

### 원인 식별률
- 지정 시나리오에서 root cause를 올바르게 제시한 비율.

### 분류 F1
- 비정상 종료 상태 분류 정확도 지표(`hard_reload`, `client_crash`, `server_crash`, `orphaned`).

### 수집 오버헤드 p95
- 계측 활성화에 따른 응답/처리 지연의 95퍼센타일.

## 6. 리포트/비교 용어

### `trace` (JSONL 단일)
- 원본 이벤트 로그 산출물.
- v1.0 범위에서 저장 포맷은 JSONL만 지원.

### `report` (JSON 단일)
- 트레이스 분석 결과를 저장/교환하는 표준 산출물.
- 저장 포맷은 JSON 1개만 지원.
- `report --out <file>.json`은 JSON 아티팩트를 생성한다.

### `--view summary`
- JSON 리포트를 사람이 읽기 쉽게 렌더링하는 CLI 표시 모드.
- 저장 포맷 확장을 의미하지 않음.
- `report --view summary`는 콘솔 출력만 수행하고 파일을 쓰지 않는다.

### `base`
- 비교의 기준이 되는 리포트.
- 예: main 브랜치, 이전 배포.
- 입력 타입은 trace가 아니라 report(JSON) 경로다.

### `head`
- 기준과 비교할 대상 리포트.
- 예: PR 브랜치, 신규 배포.
- 입력 타입은 trace가 아니라 report(JSON) 경로다.

### `diff`
- `base`와 `head`를 비교한 결과 리포트(JSON).
- 주요 변화: 지연시간 변화, cache hit/miss/stale 변화, invalidation 영향 범위 변화, 주요 원인 변화.
