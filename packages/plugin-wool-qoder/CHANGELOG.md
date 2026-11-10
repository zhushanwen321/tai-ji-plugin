# @zhushanwen/plugin-wool-qoder

## 0.1.4

### Patch Changes

- 571c958: Declare `plugin.commands.invoke.result` in the taijiPlugin permissions. The host authorizes every sandbox-channel RPC method fail-closed, and delivering the result of a host-invoked command back rides that method — without the grant the authorize-view / credential-extraction commands died with `PERMISSION_DENIED: plugin.commands.invoke.result` even after approving the 0.1.3 permission set (real-machine log evidence). Existing installs re-approve just this delta on their next activation.

## 0.1.3

### Patch Changes

- 95a5fea: Declare the plugin SDK permissions the wool skeletons actually call (`plugin.commands.register`, `plugin.storage.global.get/set`, `plugin.views.update`, `plugin.ui.openUrl`, `plugin.event`, `providers.write`, `providers.credential`) in each taijiPlugin manifest. The taiji host authorizes sandbox-channel RPC methods fail-closed against the declared set, so activating the published 0.1.2 packages failed with `PERMISSION_DENIED` and the installer rolled the installation back.

## 0.1.2

### Patch Changes

- Updated dependencies [934cdfd]
  - @zhushanwen/pi-wool-shared@0.3.1

## 0.1.1

### Patch Changes

- 5a9790f: Publish the wool shared plugin and family subpaths, and move every wool consumer onto that shared release. The 0.1.0 taiji plugin packages import `@zhushanwen/pi-wool-shared/plugin`, while the published 0.2.0 shared package contains neither that export nor its implementation; installing any wool taiji plugin therefore failed during module loading and taiji rolled the installation back.
- Updated dependencies [5a9790f]
  - @zhushanwen/pi-wool-shared@0.3.0
