# Technical RFC: Next.js 16 라우팅/캐시 통합 관측 CLI 구현 설계

- Status: Draft
- Last Updated: 2026-02-17
- Owner: next-vi core
- Parent RFC: `./cli-rfc.md`
- Terms: `./terms.md`
- Commands Spec: `./commands-rfc.md`

## 1. Summary

본 문서는 Parent RFC의 제품 결정을 구현 가능한 기술 설계로 구체화한다.  
핵심 원칙은 다음 3가지다.

1. 수집 원본(trace)은 JSONL 단일, 분석 산출물(report)은 JSON 단일
2. Event는 self-contained (`schemaVersion`, `traceId`, `sessionId`, `seq` 포함)
3. CLI-first (`record`, `report`, `diff`) 후속 UI는 동일 스키마 소비

## 2. 구현 목표

- Next.js 16.x + Node runtime에서 안정적으로 이벤트 수집
- 내비게이션 단위 원인 분석(`TOP_CAUSE`)과 영향도(`observed ∪ static_possible`) 제공
- CI/팀 공유 가능한 결정적(JSON) 리포트 생성
- 강한 마스킹 기본값 유지

## 3. 비목표

- Edge runtime 수집
- 브라우저 패널 우선 구현
- 사용자 애플리케이션 내부 모든 동작의 완전 계측

## 4. 기술 선택 (추천안)

### 4.1 런타임/언어

- Node.js: `24.x` (LTS 기준)
- TypeScript: `5.x`
- 패키지 매니저: `pnpm v10.x`

선정 이유:
- Next.js 16.x와의 런타임 호환성
- 타입 안정성 기반의 이벤트 계약 유지

### 4.2 CLI

- 파서: `commander`
- 출력: `node:console` + JSON 파일 작성(`fs/promises`)

선정 이유:
- 명령 구조(`record/report/diff`)가 단순하고 선언적으로 표현 가능
- 하위 명령/옵션/헬프 출력이 안정적이며 러닝커브가 낮음
- 의존성 체인이 짧아 배포 리스크가 낮음

대체 후보:
- `cac`: 경량이지만 서브커맨드 검증/헬프 커스터마이징 확장성이 상대적으로 제한적
- `yargs`: 기능은 충분하지만 기본 동작/타입 구성이 상대적으로 무거움
- `oclif`: 대형 CLI 프레임워크로 현재 범위(record/report/diff)에 비해 과함

결론:
- 현재 범위에서는 `commander`가 기능 대비 복잡도가 가장 낮아 채택

### 4.3 스키마/검증

- 런타임 스키마: `zod v4`
- JSON 직렬화 규칙: 안정 정렬(stable key order)

선정 이유:
- 입력/출력 계약을 타입과 런타임에서 동시에 검증 가능

### 4.4 저장소

- 원본 trace:
  - Append-only JSONL
- 산출물 report/diff:
  - JSON 파일 단일

선정 이유:
- JSONL: 스트리밍/디버깅 친화

대안:
- Envelope 기반 binary 포맷은 v0 범위 밖 (운영 단순성 우선)
- SQLite 백엔드는 v1.0 범위에서 미채택 (향후 별도 RFC로 재검토)

### 4.5 테스트

- 단위/통합: `vitest`
- E2E fixture 앱: Next.js 16 샘플 앱 + CLI 호출 스크립트

### 4.6 TypeScript 설정 전략 (결정)

결정:
- 루트 `tsconfig.base.json`에 공통 컴파일 옵션을 둔다.
- 각 워크스페이스(`packages/contracts`, `packages/core`, `packages/cli`, `apps/fixture-next16`)는 자체 `tsconfig.json`에서 루트 base를 `extends`한다.
- 루트 `tsconfig.json`은 워크스페이스 레퍼런스/에디터 기준점으로 사용하고, 패키지 `tsc` 실행의 단일 소스로 사용하지 않는다.

근거:
- 패키지별 요구사항이 다르다.
  - `cli`: bin 엔트리/실행 환경 중심
  - `contracts`: 타입/스키마 안정성 중심
  - `core`: 도메인 로직 및 내부 모듈 분리 중심
  - `fixture-next16`: Next.js 앱 구성 제약
- 모노레포에서 패키지 단위 `tsc -p` 실행이 가능해야 Turbo 캐시/병렬화/실패 지점 식별이 명확해진다.
- 루트 단일 `tsconfig`를 패키지에서 직접 재사용하면 패키지별 `include`/`exclude`/`emit` 제어가 어렵고, 설정 충돌 시 전체 파이프라인 실패 가능성이 커진다.

운영 규칙:
- 공통 규칙 변경은 `tsconfig.base.json`에서만 수행한다.
- 패키지 로컬 `tsconfig.json`에는 해당 패키지에 필요한 차이(엔트리, 출력, 테스트 타입)만 둔다.
- 빌드 전용 옵션이 필요하면 각 패키지 `tsconfig.build.json`을 추가한다.

## 5. 워크스페이스 구조 (결정)

```text
apps/
  fixture-next16/      # E2E fixture Next.js 16 샘플 앱

packages/
  contracts/           # zod 스키마, 타입, 버전 정책
  core/                # collector/storage/analyzer/reporter 내부 모듈
  cli/                 # record/report/diff 엔트리
```

원칙:
- 패키지 경계는 `contracts`, `core`, `cli` 3개로 유지한다.
- `collector-next`, `collector-fallback`, `storage`, `analyzer`, `reporter`는 `core` 내부 모듈로 구현한다.
- `core` 분해(추가 패키지 생성)는 실제 병목/의존성 격리 필요가 확인될 때 별도 RFC로 결정한다.

`core` 내부 예시 구조:
```text
packages/core/src/
  collectors/
    next/
    fallback/
  storage/
  analyzer/
  reporter/
```

## 6. 데이터 계약

## 6.1 Event (trace 레코드)

정책: trace(JSONL) 각 줄은 self-contained Event 객체 1개다.

필수 공통 필드:
- `schemaVersion: string`
- `traceId: string`
- `sessionId: string`
- `navId: string`
- `seq: number` (session 내 단조 증가)
- `ts: number` (epoch ms)
- `t: string` (discriminant)

유형:
- `routeChange`
- `navEnd`
- `rscChunk`
- `fetchDecision`
- `revalidate`
- `action`

## 6.2 Report JSON (출력 계약)

```json
{
  "reportVersion": "1.0.0",
  "schemaVersion": "1.0.0",
  "traceId": "tr_...",
  "generatedAt": 1760000000000,
  "input": { "kind": "jsonl", "path": ".next-vi/traces/session-001.jsonl" },
  "summary": {
    "navCount": 12,
    "avgDurationMs": 842,
    "statusBreakdown": { "completed": 10, "hard_reload": 1, "orphaned": 1 }
  },
  "navigations": []
}
```

정책:
- `report --out`은 위 JSON만 생성
- `report --view summary`는 report JSON을 읽어 콘솔 요약 렌더만 수행

## 6.3 Diff JSON (비교 산출물)

입력: `--base <report.json>`, `--head <report.json>`

출력:
- 지연시간 변화(`duration delta`)
- cache hit/miss/stale 변화
- invalidation 영향 범위 변화
- `TOP_CAUSE` 변화

## 7. 수집기 설계

## 7.1 Collector Adapter 계약

```ts
interface CollectorAdapter {
  name: string;
  detect(ctx: RuntimeContext): boolean;
  start(session: SessionContext): Promise<() => Promise<void>>;
}
```

규칙:
- 1순위: 공식 훅 기반 어댑터
- 2순위: fallback 어댑터(read-only)
- 동시에 두 소스가 같은 이벤트를 내면 `eventId` dedupe 적용

## 7.2 Navigation Finalizer

트리거:
- `navEnd` 기록 시점
- `beforeunload`/`pagehide`
- 버퍼 임계치(`>=100 events` or `>=1MB`)

재시도:
- 일반 경로: `0ms`, `200ms`, `1000ms` (최대 3회)
- unload 경로: `sendBeacon` 1회 + `fetch keepalive` 1회

중복 제거:
- `eventId = hash(schemaVersion, traceId, sessionId, navId, seq)`
- ingest 시 unique 제약으로 처리

## 8. 저장소 설계

## 8.1 JSONL

- write-ahead append
- line 단위 flush
- crash 복구 시 마지막 불완전 라인은 폐기 후 `orphaned` 처리

## 9. 분석기 설계

## 9.1 내비게이션 집계

- 키: `(traceId, navId)`
- 시작: 첫 `routeChange.ts`
- 종료: `navEnd.ts` 또는 복구 시 `orphaned`

## 9.2 원인 추론(`TOP_CAUSE`)

입력 신호:
- RSC ttfb/bytes 이상치
- cache miss/stale 비율
- revalidate 직후 재요청 패턴

출력:
- `causeCode`
- `confidence` (`high|medium|low`)
- `actionHint`

## 9.3 영향도 계산

- `observed`: 실행 중 실제 관측된 영향 라우트
- `static_possible`: 코드 분석으로 가능한 라우트
- `affectedRoutesEstimate = observed ∪ static_possible`

## 10. Commands 분리 문서

CLI 명세(`record`, `report`, `diff`)는 다음 문서로 분리한다.  
`./commands-rfc.md`

## 11. 보안/마스킹 파이프라인

순서:
1. URL 정규화
2. 민감 파라미터 제거/대체
3. 헤더 allowlist 적용
4. body 기본 비수집
5. 비밀 패턴 토큰 강제 제거
6. hash 필드 계산(`urlHash`, `keyHash`)

원칙:
- 원문 노출보다 재현 가능성보다 우선순위 높음

## 12. 호환성 전략

- 지원: Next.js `16.x` minor
- 어댑터 버전 매트릭스 유지
- CI에서 minor별 골든 시나리오 실행

## 13. 테스트 전략

## 13.1 단위 테스트

- contracts(zod) 파싱/검증
- dedupe 키 안정성
- mask 함수 무해성/정확성

## 13.2 통합 테스트

- JSONL -> report 변환 결정성
- diff 결과 안정성

## 13.3 E2E 시나리오

- 정상 내비게이션
- stale -> revalidate -> refresh
- hard reload/orphaned
- server action 성공/실패

게이트:
- 골든 시나리오 100%
- 실제 트레이스 90~95%

## 14. 운영/릴리즈 규칙

- `schemaVersion` 변경 시 semver 정책 준수
- 하위 호환 불가 변경은 major bump
- report/diff 스키마 변경 시 마이그레이션 가이드 필수

## 15. 대안 검토

- Event 외부 envelope:
  - 장점: 메타 중복 감소
  - 단점: 부분 손실/스트리밍 복잡도 증가
  - 결론: v0에서는 미채택 (self-contained 유지)

- 다중 출력 포맷(text/markdown 저장):
  - 장점: 즉시 가독성
  - 단점: 계약 분산, diff 자동화 복잡
  - 결론: 미채택 (JSON 단일 + summary 렌더)

- SQLite 백엔드:
  - 장점: 대용량 집계/쿼리 성능 잠재력
  - 단점: 네이티브 빌드 의존성, 운영 복잡도 증가
  - 결론: v1.0 미채택, 추후 별도 RFC에서 재검토

## 16. 구현 체크리스트 (초기 2주)

- [ ] `contracts` 패키지 작성 (Event/Report/Diff zod)
- [ ] `core` 패키지 작성 (collector/storage/analyzer/reporter 내부 모듈)
- [ ] `cli record/report/diff` 엔트리 작성
- [ ] `tsconfig.base.json` + 패키지별 `tsconfig.json`(extends) 구성
- [ ] `report --view summary` 템플릿 렌더 구현
- [ ] commands 분리 문서와 실제 CLI 옵션 동기화
- [ ] 골든 시나리오 fixture 20개 확보
