# fixture-next16 골든 시나리오 계획

- Status: Draft
- Last Updated: 2026-02-18
- 대상 RFC: `../rfcs/fixture-next16-golden-scenarios.md`
- 근거 문서:
  - `../rfcs/technical-rfc.md`
  - `../rfcs/cli-rfc.md`
  - `../rfcs/commands-rfc.md`

## 1. 배경

현재 저장소에는 `apps/fixture-next16` 구현이 없고, 골든 시나리오를 CI에서 자동 판정하는 실행 기준도 아직 고정되지 않았다.  
본 문서는 RFC에서 의도적으로 열어둔 운영값(스모크 세트, 임계값 정책, minor 매트릭스)을 확정해, 구현자가 추가 의사결정 없이 바로 구현할 수 있도록 한다.

## 2. 목표 / 비목표

### 목표

- `S01~S20` 골든 시나리오를 기준으로 PR/주기 검증 운영값을 고정한다.
- Gate A/B/C/D 판정 규칙을 기계적으로 실행 가능한 형태로 고정한다.
- `smoke-set.json`, `gate-thresholds.json`, `gate-result.json` 계약을 문서로 확정한다.

### 비목표

- 앱/CLI/CI 코드 구현
- Next.js 16 minor 실제 버전 목록 확정(목록은 구현 시점 매트릭스 파일에서 관리)
- Gate D를 블로킹 게이트로 전환

## 3. 고정 결정

### 3.1 PR 게이트 시나리오(균형형 smoke 8개)

PR 블로킹 smoke 세트는 아래 8개로 고정한다.

1. `S01_nav_push_completed`
2. `S05_nav_soft_aborted`
3. `S07_cache_stale_then_refresh`
4. `S12_revalidate_mix_tag_path`
5. `S15_rsc_partial_then_done`
6. `S16_action_ok_fast`
7. `S19_nav_hard_reload`
8. `S20_nav_orphaned_recovery`

선정 원칙:

- Navigation/Cache/RSC/Action/비정상 종료를 모두 포함한다.
- `completed`, `soft_aborted`, `hard_reload`, `orphaned`를 PR에서 즉시 감시한다.

### 3.2 임계값 정책

Gate B/C/D 임계값은 고정 절대값이 아니라 baseline + 여유율 정책으로 확정한다.

- baseline 측정 결과를 `gate-thresholds.json`으로 저장한다.
- Gate B 시간 지표 허용치:
  - `allowedMax = baselineP95 * 1.15 + 20(ms)`
- Gate C 비정상 종료 분류 최소치:
  - `abnormalMacroF1Min = max(0.90, baselineMacroF1 - 0.02)`
- Gate D는 경고(warn) 전용으로 측정값만 기록한다.

### 3.3 Next.js 16 minor 매트릭스 운영

- PR: 단일 minor만 실행
- 주기 작업(schedule/manual): 지원 minor 전체 실행
- PR 단일 minor 선택 규칙:
  - 매트릭스 파일에서 `prDefault: true`인 항목 1개를 사용한다(항목은 정확히 1개여야 함).

## 4. Gate 판정 규칙

### 4.1 Gate A: 계약 정합성 (blocking)

조건:

- 대상 시나리오별 `trace.jsonl`, `report.json` 생성 성공
- 필요한 비교 시나리오는 `diff.json` 생성 성공
- trace/report/diff 스키마 검증 100% 통과
- 비호환 schema 입력은 종료코드 `3` 반환

판정:

- 하나라도 실패하면 Gate A 실패

### 4.2 Gate B: 결정성 (blocking)

조건:

- 동일 시나리오 반복 실행 시 비시간 핵심 필드는 완전 동일해야 한다.
- 시간 지표는 `gate-thresholds.json`의 허용치 이내여야 한다.

비시간 핵심 필드(최소):

- `summary.navCount`
- `summary.statusBreakdown`
- 종료 상태 분포(`completed`, `soft_aborted`, `hard_reload`, `client_crash`, `server_crash`, `orphaned`)

시간 지표(기본):

- `summary.avgDurationMs`
- `summary.p95DurationMs`
- `reportGeneratedMs`(report 생성 소요시간)

판정:

- 비시간 필드 불일치 또는 시간 지표 초과 발생 시 Gate B 실패

### 4.3 Gate C: 정확도 (blocking)

조건:

- `completed`, `soft_aborted` 대상 원인 식별률 100%
- 비정상 종료(`hard_reload`, `client_crash`, `server_crash`, `orphaned`) 분류 지표 측정
- `abnormalMacroF1 >= abnormalMacroF1Min`

판정:

- 원인 식별률 미달 또는 Macro-F1 미달 시 Gate C 실패

### 4.4 Gate D: 성능 측정 (non-blocking)

조건:

- 수집 오버헤드 p95 산출
- report 처리 시간 p95 산출

판정:

- 임계 초과 시 `warn`으로 기록, 빌드는 실패 처리하지 않음

## 5. Baseline 측정 절차

고정 절차:

1. 기준 minor(`prDefault: true`)에서 실행한다.
2. 대상 시나리오는 기본 `full`(20개)로 수행한다.
3. 각 시나리오 반복 횟수는 5회로 고정한다.
4. run별 trace/report를 저장하고 metric을 집계한다.
5. 집계 결과로 `gate-thresholds.json`을 갱신한다.

집계 방식:

- 시간 지표: p50, p95 계산 후 p95 기반 허용치 생성
- 정확도 지표: 원인 식별률, 비정상 종료 confusion matrix, macro-F1 계산

산출 파일:

- `.next-vi/golden/baseline/<scenario-id>/run-<n>/trace.jsonl`
- `.next-vi/golden/baseline/<scenario-id>/run-<n>/report.json`
- `.next-vi/golden/baseline/metrics.json`
- `apps/fixture-next16/golden/gate-thresholds.json`

## 6. CI 운영 정책

### PR

- suite: `smoke`
- scenario: 위 8개
- minor: `prDefault: true` 1개
- Gate A/B/C blocking, Gate D warn

### Schedule / Manual

- suite: `full`
- scenario: `S01~S20`
- minor: 지원 minor 전체
- Gate A/B/C blocking, Gate D warn

아티팩트 보관(실패 시 필수):

- `.next-vi/golden/**/trace.jsonl`
- `.next-vi/golden/**/report.json`
- `.next-vi/golden/**/diff.json`
- `.next-vi/golden/**/gate-result.json`
- `.next-vi/golden/**/summary.txt` (생성된 경우, `report --view summary` stdout 캡처본)

`summary.txt` 운영 원칙:

- `summary.txt`는 디버깅/트리아지용 보조 아티팩트다.
- Gate 판정은 `report.json`, `diff.json`, `gate-result.json`만 사용한다.
- CLI 저장 포맷 확장은 금지하며, 파일 생성은 오케스트레이션 스크립트의 리다이렉션으로 처리한다.

### 운영 유사 워크로드(실제 트레이스) 연계

- fixture 게이트와 별도로 실제 트레이스 KPI를 주기 작업에서 추적한다.
- 목표 지표: 원인 식별률 `90~95%`(상위 RFC 성공 기준 연계).
- PR에서는 blocking으로 사용하지 않고, schedule/manual에서 추세를 보고한다.
- 산출물 예시:
  - `.next-vi/real-trace/<run-id>/report.json`
  - `.next-vi/real-trace/<run-id>/metrics.json`
  - `.next-vi/real-trace/<run-id>/summary.txt`

## 7. 명령 규약

오케스트레이션 명령:

- `scenario:run --id <Sxx>`
- `scenario:golden:baseline`
- `scenario:golden:verify --suite smoke|full`

규칙:

- `scenario:run`은 단일 시나리오를 실행하고 trace/report(필요 시 diff)를 생성한다.
- `scenario:golden:baseline`은 Gate B/C/D 임계값 산출용 baseline 파일을 생성/갱신한다.
- `scenario:golden:verify`는 suite 기준으로 Gate A/B/C/D를 판정하고 `gate-result.json`을 출력한다.
- `scenario:run`은 필요 시 `report --view summary` stdout을 `summary.txt`로 캡처할 수 있다(게이트 입력 아님).

주의:

- `record/report/diff`의 입력/출력/종료코드 규약은 `../rfcs/commands-rfc.md`를 단일 근거로 사용한다.
- 본 문서는 상위 CLI 계약을 재정의하지 않는다.

## 8. 공개 인터페이스 계약

### 8.1 `smoke-set.json`

필수 필드:

- `version: string`
- `suite: "smoke"`
- `scenarios: string[]` (정확히 8개, RFC 시나리오 ID만 허용)

예시:

```json
{
  "version": "1",
  "suite": "smoke",
  "scenarios": [
    "S01_nav_push_completed",
    "S05_nav_soft_aborted",
    "S07_cache_stale_then_refresh",
    "S12_revalidate_mix_tag_path",
    "S15_rsc_partial_then_done",
    "S16_action_ok_fast",
    "S19_nav_hard_reload",
    "S20_nav_orphaned_recovery"
  ]
}
```

### 8.2 `gate-thresholds.json`

필수 필드:

- `version: string`
- `baseline: { repeats: number, generatedAt: string, nextMinor: string }`
- `gateB: { timeSlackRatio: number, timeSlackMs: number }`
- `gateC: { causeAccuracyMin: number, abnormalMacroF1Min: number }`
- `gateD: { blocking: false }`

예시:

```json
{
  "version": "1",
  "baseline": {
    "repeats": 5,
    "generatedAt": "2026-02-17T00:00:00.000Z",
    "nextMinor": "16.x"
  },
  "gateB": {
    "timeSlackRatio": 0.15,
    "timeSlackMs": 20
  },
  "gateC": {
    "causeAccuracyMin": 1,
    "abnormalMacroF1Min": 0.9
  },
  "gateD": {
    "blocking": false
  }
}
```

### 8.3 `gate-result.json`

필수 필드:

- `gate: "A" | "B" | "C" | "D"`
- `suite: "smoke" | "full"`
- `scenarioId: string`
- `status: "pass" | "fail" | "warn"`
- `metrics: object`
- `reason: string`

예시:

```json
{
  "gate": "B",
  "suite": "smoke",
  "scenarioId": "S07_cache_stale_then_refresh",
  "status": "pass",
  "metrics": {
    "summary.avgDurationMs": 840,
    "threshold.summary.avgDurationMs": 986
  },
  "reason": "all deterministic checks passed"
}
```

## 9. 테스트/검증 시나리오(문서 검증)

1. 시나리오 카탈로그 검증
- RFC의 `S01~S20` 목록과 본 문서의 참조 목록이 일치해야 한다.

2. smoke 8개 검증
- 본 문서의 smoke 8개가 모두 RFC의 20개 집합 안에 있어야 한다.

3. 용어 정합성 검증
- `completed`, `soft_aborted`, `hard_reload`, `orphaned` 용어가 RFC/CLI 계약과 동일해야 한다.

4. 근거 문서 링크 검증
- technical/cli/commands RFC 링크가 모두 존재해야 한다.

## 10. 리스크 및 완화

1. PR 환경 변동으로 Gate B flaky 발생
- 완화: baseline + 여유율 정책 유지, 기준 minor 고정(`prDefault`), 시간 지표만 허용오차 적용

2. minor 추가/제거 시 운영 누락
- 완화: 매트릭스 파일을 단일 소스로 관리하고 schedule에서 전체 minor를 항상 실행

3. Gate D 장기 경고 누적
- 완화: 경고 추세를 주기적으로 리뷰하고 후속 RFC에서 블로킹 전환 여부를 결정

## 11. Assumptions

- 이번 작업은 문서화 전용이며 코드/스크립트/CI 파일을 변경하지 않는다.
- Gate D 블로킹 전환은 후속 합의로 분리한다.

## 12. QnA

### Q1. PR 게이트 범위는 어떻게 고정하나요?

A1. PR은 균형형 smoke 8개(`S01`, `S05`, `S07`, `S12`, `S15`, `S16`, `S19`, `S20`)만 blocking으로 실행한다.

### Q2. Gate 임계값은 절대값으로 고정하나요?

A2. 절대 고정값이 아니라 baseline + 여유율로 고정한다. Gate B는 `p95 * 1.15 + 20ms`, Gate C는 `max(0.90, baselineMacroF1 - 0.02)`를 사용한다.

### Q3. Next.js 16 minor 매트릭스는 어떻게 운영하나요?

A3. PR은 단일 minor(`prDefault: true`)만 실행하고, schedule/manual에서는 지원 minor 전체를 실행한다.

### Q4. smoke 8개 구성 기준은 무엇인가요?

A4. Navigation/Cache/RSC/Action/비정상 종료 축을 모두 포함하는 균형형 세트로 고정해, PR 시간과 회귀 탐지 범위를 함께 만족시킨다.

### Q5. `summary.txt`는 게이트 입력인가요?

A5. 아니다. `summary.txt`는 `report --view summary` 콘솔 출력을 저장한 보조 아티팩트이며, 게이트 판정은 `report/diff/gate-result` JSON만 사용한다.

### Q6. 실제 트레이스 `90~95%` 목표는 이 Plan에서 어떻게 다루나요?

A6. fixture 게이트와 분리된 주기 작업 KPI로 연계한다. PR 블로킹에는 넣지 않고 schedule/manual에서 추세를 측정·보고하며, 목표 범위는 상위 RFC(`90~95%`)를 따른다.

## 13. 근거 매핑

- 골든 시나리오 20개/E2E 축/게이트 기준: `../rfcs/technical-rfc.md`
- 성공 기준/종료 상태 용어: `../rfcs/cli-rfc.md`
- `record/report/diff` I/O/종료코드/스키마 오류 코드: `../rfcs/commands-rfc.md`
