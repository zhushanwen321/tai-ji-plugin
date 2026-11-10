# @zhushanwen/pi-wool-qoder

## 0.2.4

### Patch Changes

- 95a5fea: Honor the upstream queue notice during chat streaming: when Qoder's gateway replies with a 403 envelope carrying `isQueued` (free-tier queue saturation), wait `retryAfterSeconds` and re-send the request instead of failing the turn immediately. The retry loop re-signs each round, digests the queue notice before emitting `start` (the stream skeleton allows exactly one start), caps the total wait at a 10-minute budget, converts user aborts into the normal aborted outcome, and fails with an actionable error once the budget is exhausted. Non-queue 403/other non-200 envelopes keep the previous immediate-error path.

  Found during real-account acceptance: the free qfmodel (Qwen3.8-Flash) queue never drained within 17 minutes of spaced manual retries while the auto model got served after ~7 minutes.

## 0.2.3

### Patch Changes

- Updated dependencies [934cdfd]
  - @zhushanwen/pi-wool-shared@0.3.1

## 0.2.2

### Patch Changes

- c5a07e5: Guard against upstream `usage: null` SSE chunks — the stream crashed with "null is not an object (evaluating 'chunk.usage.prompt_tokens')" and the assistant reply was lost.

  - workbuddy: the `typeof chunk.usage === "object"` check passed `null` through (typeof null === "object") and `.prompt_tokens` threw on the next line
  - qoder: the `chunk.usage !== undefined` check did not exclude `null` either
  - both: add explicit `chunk.usage !== null`; regression tests replay a `usage: null` middle chunk in each package's SSE conformance suite

  Found during real-account acceptance: WorkBuddy upstream emits a `usage: null` chunk mid-stream before the final usage summary; Trae is unaffected (its token_usage path narrows via a record guard).

- 5a9790f: Publish the wool shared plugin and family subpaths, and move every wool consumer onto that shared release. The 0.1.0 taiji plugin packages import `@zhushanwen/pi-wool-shared/plugin`, while the published 0.2.0 shared package contains neither that export nor its implementation; installing any wool taiji plugin therefore failed during module loading and taiji rolled the installation back.
- Updated dependencies [5a9790f]
  - @zhushanwen/pi-wool-shared@0.3.0
