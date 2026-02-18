# Mermaid RFC: next-vi 시각화 다이어그램 모음

- Status: Draft
- Last Updated: 2026-02-17
- Parent RFC: `./cli-rfc.md`
- Technical RFC: `./technical-rfc.md`
- Commands RFC: `./commands-rfc.md`
- Visualization RFC: `./visualization-rfc.md`
- Terms: `./terms.md`

## 1. Summary

본 문서는 next-vi의 핵심 동작을 Mermaid 다이어그램으로 고정한다.  
목적은 RFC 간 텍스트 해석 차이를 줄이고, 구현 전/후 동작 검증 기준을 통일하는 것이다.

## 2. 렌더링 방법

- GitHub Markdown 렌더 또는 VS Code Markdown Preview 사용
- Mermaid 미표시 시 VS Code 확장(`Markdown Preview Mermaid Support`) 사용

## 3. End-to-End 데이터 흐름

```mermaid
flowchart LR
  A["Next.js App Router App (Node runtime)"] --> B["record collector"]
  B --> C["trace JSONL"]
  C --> D["next-vi report"]
  D --> E["report JSON"]
  E --> F["report --view summary (console)"]
  E --> G["Visualization UI (DevTools/Standalone)"]
  E --> H["next-vi diff (as base/head input)"]
  H --> I["diff JSON"]
  I --> J["diff summary / diff view"]
```

## 4. Navigation 상태 전이 (`navEnd` 포함)

```mermaid
stateDiagram-v2
  [*] --> RouteChange: "routeChange recorded"
  RouteChange --> RSCStreaming: "rscChunk start"
  RSCStreaming --> FetchDecisions: "fetchDecision events"
  FetchDecisions --> RevalidatePhase: "revalidate(tag|path) optional"
  RevalidatePhase --> ActionPhase: "action optional"

  ActionPhase --> Completed: "navEnd.status=completed"
  ActionPhase --> SoftAborted: "navEnd.status=soft_aborted"
  ActionPhase --> HardReload: "navEnd.status=hard_reload"
  ActionPhase --> ClientCrash: "navEnd.status=client_crash"
  ActionPhase --> ServerCrash: "navEnd.status=server_crash"

  RouteChange --> Orphaned: "navEnd missing at session end"
  RSCStreaming --> Orphaned: "runtime terminated before navEnd"
  FetchDecisions --> Orphaned: "runtime terminated before navEnd"
  RevalidatePhase --> Orphaned: "runtime terminated before navEnd"
  ActionPhase --> Orphaned: "runtime terminated before navEnd"

  Completed --> [*]
  SoftAborted --> [*]
  HardReload --> [*]
  ClientCrash --> [*]
  ServerCrash --> [*]
  Orphaned --> [*]
```

## 5. Flush/Retry/Dedupe 동작

```mermaid
sequenceDiagram
  participant APP as "Runtime"
  participant COL as "Collector"
  participant BUF as "In-memory buffer"
  participant SINK as "trace sink (JSONL)"
  participant REP as "Reporter"

  APP->>COL: "emit events"
  COL->>BUF: "append (schemaVersion, traceId, sessionId, seq)"
  Note over COL,BUF: "flush trigger: navEnd OR pagehide/beforeunload OR size threshold"
  COL->>SINK: "flush attempt #1"

  alt "write success"
    SINK-->>COL: "ack"
  else "write fail"
    COL->>SINK: "retry #2 (200ms)"
    COL->>SINK: "retry #3 (1000ms)"
  end

  SINK-->>REP: "read trace JSONL"
  REP->>REP: "dedupe by eventId(hash(schemaVersion,traceId,sessionId,navId,seq))"
  REP-->>APP: "stable report metrics"
```

## 6. 영향도 계산 (`revalidate(tag|path)`)

```mermaid
flowchart TD
  RV["revalidate(tag|path) event"] --> OBS["observed routes from trace"]
  RV --> STA["static_possible routes from code graph"]
  OBS --> UNI["affectedRoutesEstimate = observed ∪ static_possible"]
  STA --> UNI
  UNI --> SCORE["confidenceScore (0~1)"]
  SCORE --> CONF["confidenceLevel (high|medium|low)"]
  UNI --> OUT["report.invalidations[]"]
```

## 7. Report/Diff 처리 흐름

```mermaid
flowchart LR
  T["trace JSONL"] --> RPT["report command"]
  RPT --> RJ["report JSON"]
  RJ --> SUM["report --view summary"]
  RJ --> B["base report JSON"]
  RJ --> H["head report JSON"]
  B --> DIFF["diff command"]
  H --> DIFF
  DIFF --> DJ["diff JSON"]
  DJ --> DS["diff summary"]
```

## 8. 탭 간 상호작용 동기화

```mermaid
flowchart TD
  NAV["Timeline: selected navId"] --> O["Overview cards filtered by navId"]
  NAV --> S["Segment Tree filtered by navId"]
  NAV --> I["Invalidation map highlighted by navId"]
  NAV --> D["Diff detail contextualized by navId"]
  I --> T["Timeline event highlight (related revalidate/action)"]
```

## 9. 다이어그램 검토 체크리스트

- `trace -> report -> diff` 입력/출력 타입이 RFC와 일치하는가
- `navEnd.status`와 `orphaned` 경로가 용어 정의와 일치하는가
- retry(최대 3회) + dedupe(eventId)가 같은 그림 안에서 모순 없이 표현되는가
- 영향도 계산식이 `observed ∪ static_possible`로 고정되어 있는가
