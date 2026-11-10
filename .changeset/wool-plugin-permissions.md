---
'@zhushanwen/plugin-wool-qoder': patch
'@zhushanwen/plugin-wool-trae': patch
'@zhushanwen/plugin-wool-workbuddy': patch
---

Declare the plugin SDK permissions the wool skeletons actually call (`plugin.commands.register`, `plugin.storage.global.get/set`, `plugin.views.update`, `plugin.ui.openUrl`, `plugin.event`, `providers.write`, `providers.credential`) in each taijiPlugin manifest. The taiji host authorizes sandbox-channel RPC methods fail-closed against the declared set, so activating the published 0.1.2 packages failed with `PERMISSION_DENIED` and the installer rolled the installation back.
