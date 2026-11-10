---
'@zhushanwen/pi-wool-qoder': patch
---

Honor the upstream queue notice during chat streaming: when Qoder's gateway replies with a 403 envelope carrying `isQueued` (free-tier queue saturation), wait `retryAfterSeconds` and re-send the request instead of failing the turn immediately. The retry loop re-signs each round, digests the queue notice before emitting `start` (the stream skeleton allows exactly one start), caps the total wait at a 10-minute budget, converts user aborts into the normal aborted outcome, and fails with an actionable error once the budget is exhausted. Non-queue 403/other non-200 envelopes keep the previous immediate-error path.

Found during real-account acceptance: the free qfmodel (Qwen3.8-Flash) queue never drained within 17 minutes of spaced manual retries while the auto model got served after ~7 minutes.
