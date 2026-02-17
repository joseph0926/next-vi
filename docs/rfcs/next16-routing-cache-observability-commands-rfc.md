# Commands RFC: next-vi CLI 명령 사양

- Status: Draft
- Last Updated: 2026-02-17
- Parent RFC: `./next16-routing-cache-observability-cli-rfc.md`
- Technical RFC: `./next16-routing-cache-observability-technical-rfc.md`

## 1. Summary

본 문서는 `next-vi` CLI의 사용자 명령 계약을 정의한다.  
출력 계약 원칙은 다음과 같다.

- `report`/`diff` 저장 산출물은 JSON 단일
- `--view summary`는 저장 없이 콘솔 렌더만 수행
- v1.0 범위에서 trace 저장 백엔드는 JSONL 단일

## 2. 공통 규칙

- 경로 인자는 상대/절대 경로 모두 허용
- 출력 파일 경로가 없으면 명령은 실패한다(`--out` 필수 명령의 경우)
- 모든 명령은 비정상 입력 시 non-zero 종료 코드 반환

권장 종료 코드:
- `0`: 성공
- `2`: 사용자 입력 오류(인자/경로/포맷)
- `3`: 파싱/검증 오류(schema mismatch)
- `4`: 런타임 실행 오류(I/O, adapter, runtime)

## 3. `record`

목적:
- 런타임 이벤트를 trace(JSONL)로 수집

예시:
```bash
next-vi record --out .next-vi/traces/session-001.jsonl
```

옵션:
- `--out <path>`: trace JSONL 출력 경로 (필수)
- `--mask-policy <path>`: 마스킹 정책 파일 경로 (선택)

## 4. `report`

목적:
- trace(JSONL)를 report(JSON)로 변환
- 생성된 report(JSON)를 콘솔 summary로 렌더

예시:
```bash
next-vi report --in .next-vi/traces/session-001.jsonl --out .next-vi/reports/session-001.json
next-vi report --in .next-vi/reports/session-001.json --view summary
```

옵션:
- `--in <path>`: 입력 파일 경로 (필수)
- `--out <path>`: report JSON 출력 경로 (`--view` 미사용 시 필수)
- `--view summary`: 콘솔 요약 렌더 모드 (파일 미생성)

입력 타입:
- trace JSONL
- report JSON (`--view summary` 전용)

출력 타입:
- report JSON (저장 산출물)
- summary text (콘솔 렌더)

## 5. `diff`

목적:
- 기준 report와 비교 report를 비교해 diff(JSON) 생성

예시:
```bash
next-vi diff --base .next-vi/reports/base.json --head .next-vi/reports/head.json --out .next-vi/reports/diff.json
```

옵션:
- `--base <report.json>`: 기준 report 경로 (필수)
- `--head <report.json>`: 비교 대상 report 경로 (필수)
- `--out <path>`: diff JSON 출력 경로 (필수)
- `--view summary`: 콘솔 요약 렌더 모드 (선택)

출력 항목:
- navigation duration delta
- cache hit/miss/stale delta
- invalidation impact delta
- `TOP_CAUSE` delta

## 6. 호환성/버전 정책

- `schemaVersion` 불일치 시:
  - 호환 가능한 경우 변환 후 진행
  - 비호환인 경우 종료 코드 `3` 반환
- `reportVersion`은 semver 준수

## 7. 보안/민감정보 규칙

- trace 입력에 민감정보가 포함되어도 report/diff 출력은 마스킹 규칙을 재적용
- `--view summary` 역시 마스킹된 값만 표시
