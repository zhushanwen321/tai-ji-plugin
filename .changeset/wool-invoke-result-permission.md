---
'@zhushanwen/plugin-wool-qoder': patch
'@zhushanwen/plugin-wool-trae': patch
'@zhushanwen/plugin-wool-workbuddy': patch
---

Declare `plugin.commands.invoke.result` in the taijiPlugin permissions. The host authorizes every sandbox-channel RPC method fail-closed, and delivering the result of a host-invoked command back rides that method — without the grant the authorize-view / credential-extraction commands died with `PERMISSION_DENIED: plugin.commands.invoke.result` even after approving the 0.1.3 permission set (real-machine log evidence). Existing installs re-approve just this delta on their next activation.
