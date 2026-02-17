# 워크스페이스 패키지 매니페스트 계획

- 작성일: 2026-02-17
- 대상: `apps/fixture-next16`, `packages/contracts`, `packages/core`, `packages/cli`
- 근거 문서:
  - `../rfcs/technical-rfc.md`
  - `../rfcs/commands-rfc.md`
  - `../rfcs/cli-rfc.md`

## 1. 배경

현재 저장소는 RFC/설계가 먼저 정리된 상태이며, 구현 패키지의 `package.json`이 아직 없다.  
기술 RFC에서 워크스페이스 구조는 `contracts/core/cli` 3패키지로 결정되었고, `core` 분해는 필요 시 별도 RFC로 처리하도록 확정했다.

## 2. 패키지 구조 및 책임

- `@next-vi/contracts`
  - Event/Report/Diff 스키마(zod), 타입, 버전 정책
- `@next-vi/core`
  - collector/storage/analyzer/reporter 내부 모듈
- `@next-vi/cli`
  - `record/report/diff` 커맨드, 인자 파싱, 출력/종료코드

## 3. `package.json` 구성 원칙 (근거)

1. 공통: `private: true`
- 이유: 현재는 내부 모노레포 패키지이며 npm 배포가 목표가 아님.

2. 공통: `type: "module"` + `main/types/exports`
- 이유: Node 24 + TS 기준 ESM 통일, 패키지 경계 명확화.

3. 라이브러리(`contracts`, `core`)와 실행 인터페이스(`cli`) 분리
- 이유: 도메인 로직(`core`)과 입출력/옵션 처리(`cli`)의 변경 축이 다름.
- 효과: 테스트 격리, 재사용성(향후 UI/DevTools), 의존성 오염 방지.

4. 내부 의존성은 `workspace:*`
- 이유: 버전 드리프트 방지, 모노레포 로컬 연결 일관성 확보.

5. Turbo 태스크 정합성 유지(`build/lint/typecheck/test/clean`)
- 이유: 루트 `turbo.json` 파이프라인과 즉시 연결.

## 4. 패키지별 `package.json` 최소 스펙

### 4.1 `packages/contracts/package.json`

- `name`: `@next-vi/contracts`
- `dependencies`: `zod`
- `scripts`: `build`, `typecheck`, `lint`, `test`, `clean`

### 4.2 `packages/core/package.json`

- `name`: `@next-vi/core`
- `dependencies`: `@next-vi/contracts` (`workspace:*`)
- `scripts`: `build`, `typecheck`, `lint`, `test`, `clean`

### 4.3 `packages/cli/package.json`

- `name`: `@next-vi/cli`
- `bin`: `next-vi -> ./dist/bin/next-vi.js`
- `dependencies`: `@next-vi/contracts`, `@next-vi/core`, `commander`
- `scripts`: `build`, `typecheck`, `lint`, `test`, `clean`

## 5. 다음 작업 제안

1. 이 문서 기준으로 3개 패키지 `package.json` 실제 생성
2. 각 패키지 `tsconfig` 및 엔트리 파일 최소 골격 생성
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`로 파이프라인 확인
