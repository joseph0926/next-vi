# RFC: fixture-next16 골든 시나리오/검증 기준

- Status: Draft
- Last Updated: 2026-02-17
- Owner: next-vi core
- Parent RFC: `./cli-rfc.md`
- Technical RFC: `./technical-rfc.md`
- Commands RFC: `./commands-rfc.md`
- Terms: `./terms.md`

## 1. Summary

본 문서는 `apps/fixture-next16`에서 실행할 골든 시나리오와 합격 기준(게이트)을 정의한다.
목표는 `record -> report -> diff` 파이프라인을 재현 가능한 입력으로 고정해, 기능 추가/리팩터링 시 회귀를 빠르게 검출하는 것이다.

핵심 원칙:

- 시나리오 입력은 결정적이어야 한다(고정 경로, 고정 데이터, 고정 타이밍 창).
- 저장 산출물은 RFC 합의대로 `trace(JSONL)`와 `report/diff(JSON)`만 사용한다.
- 모든 검증은 사람이 아닌 CI가 판정 가능해야 한다.

## 2. Problem Statement

현재 저장소는 워크스페이스/tsconfig 골격만 완료되었고, `fixture-next16` 앱과 E2E 골든 케이스가 없다.
이 상태에서는 아래 리스크가 크다.

- `record/report/diff` 구현 시 계약 위반을 늦게 발견할 수 있음
- Next.js 16 minor 변경에 따른 계측 회귀를 조기에 감지하기 어려움
- 성능/정확도 KPI를 정량 검증할 기준 데이터가 없음

## 3. Goals / Non-goals

### Goals

- 골든 시나리오 20개를 고정된 ID로 정의
- 각 시나리오의 기대 결과를 `trace/report/diff` 관점으로 분리 명시
- CI 게이트(필수 통과 조건)와 실패 분류 규칙을 명시
- Next.js 16 minor 매트릭스에서 동일 시나리오를 재사용 가능한 구조로 정의

세부 규칙:

- `trace`: 이벤트 수집/스키마 정합성 검증 기준
- `report`: 집계/요약/원인 추론 검증 기준
- `diff`: base/head 변화 검증 기준(비교 시나리오에 한함)

필수 통과 조건:

- Gate A(계약 정합성): 스키마/종료코드/산출물 생성
- Gate B(결정성): 동일 입력 반복 시 동일 요약 결과
- Gate C(정확도): 원인 식별률/비정상 종료 분류 지표

### Non-goals

- 실제 사용자 트래픽 분포를 fixture에 완전 복제
- Edge runtime 동작 검증
- 브라우저 패널 UI 품질 검증

## 4. Scope

포함:

- `apps/fixture-next16` 라우트/액션/캐시 시나리오 설계 기준
- 시나리오 실행 방법(명령, 출력 디렉터리, 파일 네이밍)
- 골든 판정 기준(정합성/결정성/정확도)

제외:

- collector 내부 알고리즘 상세 구현
- analyzer 원인 추론 규칙 상세 구현
- 시각화 렌더 상세 사양

## 5. Fixture 앱 구성 기준

디렉터리 목표(예시):

```text
apps/fixture-next16/
  app/
    page.tsx
    products/page.tsx
    products/[id]/page.tsx
    actions.ts
    api/revalidate/route.ts
  lib/
    seed.ts
    clock.ts
  scripts/
    run-scenario.ts
```

운영 규칙:

- `app/actions.ts`는 공통 시나리오 액션 진입점 예시이며, 모든 action을 단일 파일에 강제하지 않는다.
- 기능별 action은 라우트/기능 단위 파일로 분리할 수 있다.
- `lib/clock.ts`는 Gate B(결정성) 검증을 위해 시간 소스를 고정/주입하는 테스트 유틸 역할을 한다.
- 데이터는 테스트 시작 시 seed로 재설정한다.
- 시나리오 실행 중 시간 의존 로직은 고정 clock 또는 허용 오차 창을 사용한다.
- route/tag/path 네이밍은 RFC 용어(`revalidateTag`, `revalidatePath`)와 일치시킨다.

## 6. 골든 시나리오 카탈로그 (20개)

시나리오 ID 규칙:

- `S01` ~ `S20`
- 형식: `Sxx_<domain>_<intent>`

구성 근거:

- Technical RFC의 E2E 축 4개(정상 내비게이션, stale/revalidate/refresh, hard reload/orphaned, action 성공/실패)를 반드시 포함한다.
- CLI RFC의 관측 범위(`push`, `replace`, `refresh`, `prefetch`, `revalidate(tag|path)`, `action`, `RSC`, `cache result`)를 커버하도록 세분화한다.
- 위 두 조건을 만족하는 최소 고정 세트로 20개를 채택한다(부족/과다 여부는 운영 데이터 기반으로 후속 조정).

분해 수:

- Navigation 5개
- Cache/Invalidation 7개
- RSC/Stream 3개
- Action/Error 3개
- 비정상 종료/복구 2개
- 총 20개

### 6.1 Navigation 기본군

1. `S01_nav_push_completed`: `/ -> /products` push 완료
2. `S02_nav_replace_completed`: replace 완료
3. `S03_nav_refresh_completed`: refresh 완료
4. `S04_nav_prefetch_hit`: prefetch 후 이동에서 cache hit 우세
5. `S05_nav_soft_aborted`: 경쟁 이동으로 soft abort

### 6.2 Cache/Invalidation 군

6. `S06_cache_miss_then_hit`: 첫 요청 miss, 재요청 hit
7. `S07_cache_stale_then_refresh`: stale 응답 후 refresh로 갱신
8. `S08_revalidate_tag_narrow`: 좁은 tag 무효화 영향 검증
9. `S09_revalidate_tag_broad`: 넓은 tag 무효화 영향 검증
10. `S10_revalidate_path_single`: 단일 path 무효화
11. `S11_revalidate_path_nested`: 중첩 path 영향 검증
12. `S12_revalidate_mix_tag_path`: tag/path 혼합 호출

### 6.3 RSC/Stream 군

13. `S13_rsc_small_chunks`: 소형 chunk 다건 전송
14. `S14_rsc_large_ttfb`: ttfb 상승 상황
15. `S15_rsc_partial_then_done`: 부분 수신 후 완료

### 6.4 Action/Error 군

16. `S16_action_ok_fast`: action 성공, 저지연
17. `S17_action_ok_slow`: action 성공, 고지연
18. `S18_action_err_domain`: 도메인 오류 반환

### 6.5 비정상 종료/복구 군

19. `S19_nav_hard_reload`: hard reload 종료 분류
20. `S20_nav_orphaned_recovery`: 미종결 내비게이션 orphaned 복구

## 7. 시나리오별 기대 산출물 계약

각 시나리오는 아래 3종을 생성한다.

- `trace`: `.next-vi/golden/<scenario-id>/trace.jsonl`
- `report`: `.next-vi/golden/<scenario-id>/report.json`
- `summary`: `.next-vi/golden/<scenario-id>/summary.txt` (선택, 디버깅 보조용)
  - `summary.txt`는 CLI 저장 포맷이 아니라 `report --view summary`의 콘솔 출력을 시나리오 러너가 캡처한 보조 아티팩트다.
  - Gate 판정의 소스 오브 트루스는 `report.json`/`diff.json`이다.

`diff`는 기준/비교 세트를 병렬로 둔 경우에만 생성한다.

- `base report`: `.next-vi/golden/base/<scenario-id>/report.json`
- `head report`: `.next-vi/golden/head/<scenario-id>/report.json`
- `diff`: `.next-vi/golden/diff/<scenario-id>/diff.json`

분리/명시 규칙:

1. trace 검증: 이벤트 타입/필수 필드/시퀀스 일관성
2. report 검증: 요약 지표/내비게이션 집계/원인 추론 결과
3. diff 검증: base-head 변화량과 원인 변화

판정 필수 필드:

- trace: `schemaVersion`, `traceId`, `sessionId`, `navId`, `seq`, `ts`, `t`
- report: `reportVersion`, `schemaVersion`, `traceId`, `summary`, `navigations`
- diff: `base`, `head`, `delta` 계열 핵심 키(세부 키는 Commands RFC 확정안 준수)

## 8. 게이트(합격 기준)

### Gate A: 계약 정합성 (필수)

- 20개 시나리오 모두 trace/report 생성 성공
- JSON 스키마 검증 100% 통과
- 비호환 입력은 종료코드 `3`으로 실패

### Gate B: 결정성 (필수)

- 동일 시나리오를 반복 실행했을 때 report 요약 핵심 지표의 변동이 허용 기준 내여야 한다.
- 반복 횟수와 허용 오차(숫자)는 본 RFC에서 고정하지 않고 `docs/plan/<주제>.md`에서 baseline 측정 후 확정한다.

### Gate C: 정확도 (필수)

- 골든 시나리오 원인 식별률 100% (`completed`, `soft_aborted`)
- 비정상 종료 분류 정확도(`hard_reload`, `client_crash`, `server_crash`, `orphaned`)를 측정/추적한다.
- 정확도 임계값(숫자)은 본 RFC에서 고정하지 않고 `docs/plan/<주제>.md`에서 baseline 측정 후 확정한다.

### Gate D: 성능 측정 (권장, 임계값 미확정)

- 수집 오버헤드 p95 측정 결과를 산출물에 포함한다.
- report 처리 시간 p95 측정 결과를 산출물에 포함한다.
- 임계값(숫자)은 본 RFC에서 고정하지 않고 `docs/plan/<주제>.md`에서 baseline 측정 후 확정한다.

## 9. 실행 규약 (초안)

예시 명령:

```bash
next-vi record --out .next-vi/golden/S01_nav_push_completed/trace.jsonl
next-vi report --in .next-vi/golden/S01_nav_push_completed/trace.jsonl --out .next-vi/golden/S01_nav_push_completed/report.json
next-vi report --in .next-vi/golden/S01_nav_push_completed/report.json --view summary > .next-vi/golden/S01_nav_push_completed/summary.txt
next-vi diff --base .next-vi/golden/base/S01_nav_push_completed/report.json --head .next-vi/golden/head/S01_nav_push_completed/report.json --out .next-vi/golden/diff/S01_nav_push_completed/diff.json
```

권장 스크립트 계층:

- `scenario:run --id <Sxx>`
- `scenario:golden:baseline`
- `scenario:golden:verify`

## 10. CI 매트릭스 전략

- 필수 원칙: 지원 대상 Next.js `16.x` minor에 대해 골든 시나리오를 CI에서 실행한다.
- 운영 방식: PR에서는 smoke 세트, 주기 작업에서는 전체 minor 세트를 실행할 수 있다.
- 매트릭스 실행 실패 시 trace/report/diff를 아티팩트로 보관한다.

## 11. 보안/마스킹 규칙

- fixture 데이터에도 토큰/비밀 패턴 문자열은 원문 저장 금지
- `summary` 출력에서도 마스킹 규칙을 동일 적용
- 실패 로그에 URL/헤더 원문이 남지 않도록 sanitize 후 저장

## 12. 리스크 및 완화

1. flaky 시나리오 증가

- 완화: 시간 의존 최소화, seed/clock 고정, retry 대신 원인 분류 로그 강화

2. Next.js minor 변화로 fixture 깨짐

- 완화: 라우트/데이터 계약을 fixture 내부 어댑터로 분리

3. 골든 데이터 과다 유지비용

- 완화: 필수 필드 중심 검증, 비핵심 필드는 선택 snapshot으로 분리

## 13. 단계별 적용 계획

1단계:

- `S01~S05` 우선 구현, 파이프라인 기본 검증

2단계:

- `S06~S15` 확장, 캐시/RSC 영향도 검증

3단계:

- `S16~S20` 비정상 종료/복구 완성, CI 매트릭스 연결

## 14. DoD (Definition of Done)

- [ ] `apps/fixture-next16` 기본 앱/스크립트 생성
- [ ] 20개 시나리오 구현 및 ID 고정
- [ ] Gate A/B/C를 CI에서 자동 판정
- [ ] 실패 시 아티팩트(trace/report/diff) 자동 업로드
- [ ] 개발자 가이드 문서(`docs/plan` 또는 `docs/impl`) 연결

## 15. QnA

### Q1. 20개로 정한 이유는? 충분하거나 모자랄 수 있는 경우도 검토했나요?

A1. 20개는 임의 수치가 아니라 Technical RFC 체크리스트의 명시 항목(`골든 시나리오 fixture 20개 확보`)을 따른 값이다. 또한 E2E 필수 축 4개(정상, stale/revalidate/refresh, hard reload/orphaned, action 성공/실패)와 CLI 관측 범위를 함께 커버하도록 분해한 결과다. 부족/과다 여부는 운영 데이터 기준으로 후속 조정한다.

### Q2. 정확히 어떻게 분리/명시한다는 건가요?

A2. 시나리오마다 검증 대상을 산출물 단위로 분리한다. `trace`는 이벤트 계약/시퀀스, `report`는 집계/원인, `diff`는 변화량을 검증한다. 즉 한 시나리오에 대해 같은 입력으로 세 단계 산출물의 기대값을 각각 명시한다.

### Q3. 필수 통과 조건이 뭔지 명시해주세요.

A3. 필수는 Gate A/B/C다. Gate A는 계약 정합성, Gate B는 결정성, Gate C는 정확도다. Gate B/C/D의 숫자 임계값은 현재 문서 근거 범위에서 고정하지 않고 Plan 단계에서 baseline 측정 후 확정한다.

### Q4. actions.ts를 app 아래에 바로 둔 이유 및 actions.ts로 이름 지었다는 건 앞으로 모든 action을 여기에 작성할 계획인가요?

A4. 아니다. `app/actions.ts`는 공통 시나리오 액션의 진입점 예시일 뿐이며, 모든 action을 한 파일에 강제하지 않는다. 기능별 action은 라우트/기능 단위 파일로 분리 가능하다.

### Q5. clock.ts의 역할은 뭔가요?

A5. 결정성 검증을 위해 시간 소스를 고정/주입하는 테스트 유틸이다. 시간 의존 동작(지연, 타임아웃, 타임스탬프)을 통제해 동일 입력 반복 시 결과 변동을 줄이는 용도다.

### Q6. `summary.txt`는 어떤 역할이며 CLI가 직접 생성하나요?

A6. `summary.txt`는 사람용 빠른 트리아지 로그다. CLI 저장 포맷 확장은 아니며, `report --view summary` 콘솔 출력을 시나리오 러너가 캡처해 보조 아티팩트로 남긴다. Gate 판정은 `report.json`/`diff.json` 기준으로 수행한다.

### Q7. `confidence`는 숫자와 레벨 중 무엇을 기준으로 보나요?

A7. 내부 계산/정렬/임계값은 `confidenceScore(0~1)`를 기준으로 하고, 화면/CLI 가독성을 위해 `confidenceLevel(high|medium|low)`를 함께 표기한다. 즉 수치는 정확도, 레벨은 커뮤니케이션 목적이다.

## 16. 근거 매핑

- `20개 시나리오 고정`: `docs/rfcs/technical-rfc.md:338`
- `E2E 핵심 축`: `docs/rfcs/technical-rfc.md:298-301`
- `골든/실제 트레이스 KPI`: `docs/rfcs/technical-rfc.md:303-305`, `docs/rfcs/cli-rfc.md:56-59`
- `trace/report/diff 계약`: `docs/rfcs/technical-rfc.md:15-17`, `docs/rfcs/commands-rfc.md:13-16`, `docs/rfcs/commands-rfc.md:46-47`, `docs/rfcs/commands-rfc.md:71`
- `종료코드/검증 오류`: `docs/rfcs/commands-rfc.md:24-27`, `docs/rfcs/commands-rfc.md:92-95`
- `필수 이벤트 필드/종료 상태`: `docs/rfcs/technical-rfc.md:144-159`, `docs/rfcs/cli-rfc.md:82-93`
- `결정성 기준`: `docs/rfcs/technical-rfc.md:293-294`, `docs/rfcs/cli-rfc.md:58`
- `보안/마스킹`: `docs/rfcs/technical-rfc.md:266-272`, `docs/rfcs/commands-rfc.md:99-100`
- `minor 호환 전략`: `docs/rfcs/technical-rfc.md:279-281`

근거가 없는 기존 항목 처리:

- 삭제/대체: `Gate D`의 고정 수치(`오버헤드 p95 <= 8%`, `report p95 <= 1.5s`)는 본 RFC 근거가 없어 삭제했고, “측정 의무 + Plan에서 임계값 확정”으로 대체했다.
- 삭제/대체: `16.latest/16.previous` 고정 매트릭스는 근거가 약해 제거했고, “minor별 실행 원칙 + PR smoke/주기 full” 운영 방식으로 대체했다.
- 삭제/대체: `Gate B`의 반복 횟수/허용 오차 숫자와 `Gate C`의 F1 수치는 현재 문서 근거 범위에서 확정할 수 없어, “측정 의무 + Plan에서 임계값 확정”으로 대체했다.
