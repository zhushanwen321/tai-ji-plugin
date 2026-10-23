---
'@zhushanwen/pi-wool-qoder': patch
'@zhushanwen/pi-wool-workbuddy': patch
---

Guard against upstream `usage: null` SSE chunks — the stream crashed with "null is not an object (evaluating 'chunk.usage.prompt_tokens')" and the assistant reply was lost.

- workbuddy: the `typeof chunk.usage === "object"` check passed `null` through (typeof null === "object") and `.prompt_tokens` threw on the next line
- qoder: the `chunk.usage !== undefined` check did not exclude `null` either
- both: add explicit `chunk.usage !== null`; regression tests replay a `usage: null` middle chunk in each package's SSE conformance suite

Found during real-account acceptance: WorkBuddy upstream emits a `usage: null` chunk mid-stream before the final usage summary; Trae is unaffected (its token_usage path narrows via a record guard).
