<!-- AI_STATUS: COMPLETED -->
# TSConfig 구현 노트 (2026-02-17)

## 1) 구현 요약

이번 라운드에서 모노레포 TypeScript 구성을 아래처럼 적용했다.

- 루트 공통 설정: `tsconfig.base.json`
- 루트 solution 설정: `tsconfig.json` (`files: []`, `references` 전용)
- 패키지별 설정:
  - `packages/contracts/tsconfig.json`
  - `packages/core/tsconfig.json`
  - `packages/cli/tsconfig.json`
- 최소 입력 파일:
  - `packages/contracts/src/index.ts`
  - `packages/core/src/index.ts`
  - `packages/cli/src/index.ts`
- `typecheck` 스크립트 전환:
  - `@next-vi/contracts`: `tsc -b tsconfig.json`
  - `@next-vi/core`: `tsc -b tsconfig.json`
  - `@next-vi/cli`: `tsc -b tsconfig.json --pretty false`
- `build` 스크립트 전환:
  - `@next-vi/contracts`: `tsc -b tsconfig.build.json`
  - `@next-vi/core`: `tsc -b tsconfig.build.json`
  - `@next-vi/cli`: `tsc -b tsconfig.build.json`

## 2) 대화에서 확정한 결정과 근거

### A. `noEmit`은 base에 두지 않는다

결정:

- `noEmit`은 공통 base(`tsconfig.base.json`)에 넣지 않고 패키지/용도에서 제어한다.

근거:

- `typecheck`와 `build`는 목적이 다르다.
  - `typecheck`: 산출물 없이 타입 검증만 필요
  - `build`: 산출물(`.js`/`.d.ts`) 필요
- mode-dependent 옵션(`noEmit`)을 base에 두면, 이후 build 전환 시 각 패키지에서 override를 누락할 위험이 크다.

### B. 루트 `exclude`는 solution config에서 생략한다

결정:

- 루트 `tsconfig.json`은 `files: [] + references`만 유지하고 `exclude`를 넣지 않았다.

근거:

- solution config는 직접 소스 파일을 수집하지 않으므로 `exclude`의 실효성이 낮다.
- 목적은 “컴파일 옵션 선언”이 아니라 “프로젝트 참조 진입점” 유지다.

### C. `tsc -b`는 config 경로를 명시한다

결정:

- 패키지 스크립트를 `tsc -b tsconfig.json` 형태로 고정했다.

근거:

- `tsc -b`만으로도 기본 추론은 가능하지만, config 파일 명시는 실행 의도를 분명히 한다.
- 작업 디렉터리(CWD) 혼동 시 오동작 가능성을 줄인다.

### D. `--pretty false`는 CLI 패키지에만 적용한다

결정:

- `@next-vi/cli`의 `typecheck`에만 `--pretty false`를 적용했다.

근거:

- 사용자 선택 사항.
- 로그 파싱/CI 아티팩트 관점에서 평문 출력이 유리하다.
- 모든 패키지에 강제 적용할 필요는 없고, 현재 요구 범위는 CLI 한정이다.

### E. `TS6310` 대응으로 `contracts/core`는 `noEmit` 대신 declaration-only 출력 사용

실제 이슈:

- `tsc -b + references` 적용 직후 아래 오류 발생:
- `TS6310: Referenced project '.../packages/contracts' may not disable emit.`

조치:

- `packages/contracts/tsconfig.json`
- `packages/core/tsconfig.json`
  - `noEmit: true` 제거
  - `emitDeclarationOnly: true` + `outDir: "./.turbo/types"` 적용

근거:

- build mode(`-b`)에서 참조되는 프로젝트는 emit이 완전히 꺼져 있으면 안 된다.
- 선언 출력만 `.turbo`로 흘려 타입체크 체인 요구사항을 충족하고, 배포 산출물(`dist`)은 유지하지 않는다.

### F. `tsconfig.build.json`을 별도로 둔 이유

결정:

- 각 패키지에 `tsconfig.build.json`을 두고 `build`는 해당 파일로만 실행한다.

근거:

- `typecheck`용 옵션과 `build`용 옵션이 충돌한다.
  - typecheck는 `noEmit` 또는 `emitDeclarationOnly` 중심
  - build는 `outDir: dist`에 실제 산출(`.js`, `.d.ts`)이 필요
- references + `tsc -b` 제약으로 typecheck 체인에서 `contracts/core`는 declaration-only 출력이 필요했지만, build에서는 실제 산출이 필요해 목적이 분리된다.
- typecheck/build의 `tsBuildInfoFile`과 출력 경로를 분리하면 캐시/아티팩트 추적이 명확해지고, 잘못된 설정 전파 위험이 줄어든다.

## 3) 현재 상태 (파일 기준)

- 루트
  - `/Users/kimyounghoon/Downloads/@work/next-vi/tsconfig.base.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/tsconfig.json`
- 패키지
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/contracts/tsconfig.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/contracts/tsconfig.build.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/core/tsconfig.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/core/tsconfig.build.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/cli/tsconfig.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/cli/tsconfig.build.json`
- 스크립트
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/contracts/package.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/core/package.json`
  - `/Users/kimyounghoon/Downloads/@work/next-vi/packages/cli/package.json`

## 4) 검증 기록

실행:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm --filter @next-vi/contracts typecheck
pnpm --filter @next-vi/core typecheck
pnpm --filter @next-vi/cli typecheck
pnpm lint && pnpm test && pnpm build
```

결과:

- `typecheck` 통과
- `build` 통과 (`tsc -b tsconfig.build.json`)
- 패키지 단위 `typecheck` 통과
- `lint/test/build` 통과
- `test`는 아직 no-op 스크립트 기반이며 Turbo outputs 경고는 후속 범위

## 5) 후속 작업

- `apps/fixture-next16` 생성 단계에서 앱 전용 tsconfig 상속 규칙 추가
