# @zhushanwen/pi-wool-shared

## 0.3.1

### Patch Changes

- 934cdfd: fix(wool-shared): install typebox as a runtime dependency

  The `/plugin` subpath (loaded by taiji plugins in the taiji sandbox, where
  no host provides peer modules) builds schemas at module load time via
  `Type.Object`, making typebox a hard runtime dependency. As an optional
  peer it was never installed by taiji's dependency installer (which
  installs `dependencies` only), so published plugins failed activation
  with `ERR_MODULE_NOT_FOUND: typebox`. Ship typebox as a regular
  dependency (pinned 1.3.27 to match the pi host version) so both install
  channels — the taiji plugin sandbox and the pi extension host — get a
  resolvable copy.

## 0.3.0

### Minor Changes

- 5a9790f: Publish the wool shared plugin and family subpaths, and move every wool consumer onto that shared release. The 0.1.0 taiji plugin packages import `@zhushanwen/pi-wool-shared/plugin`, while the published 0.2.0 shared package contains neither that export nor its implementation; installing any wool taiji plugin therefore failed during module loading and taiji rolled the installation back.
