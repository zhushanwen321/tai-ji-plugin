---
"@zhushanwen/pi-wool-shared": patch
---

fix(wool-shared): install typebox as a runtime dependency

The `/plugin` subpath (loaded by taiji plugins in the taiji sandbox, where
no host provides peer modules) builds schemas at module load time via
`Type.Object`, making typebox a hard runtime dependency. As an optional
peer it was never installed by taiji's dependency installer (which
installs `dependencies` only), so published plugins failed activation
with `ERR_MODULE_NOT_FOUND: typebox`. Ship typebox as a regular
dependency (pinned 1.3.27 to match the pi host version) so both install
channels — the taiji plugin sandbox and the pi extension host — get a
resolvable copy.
