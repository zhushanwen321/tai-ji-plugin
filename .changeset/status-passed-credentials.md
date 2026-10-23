---
'@zhushanwen/pi-wool-shared': minor
'@zhushanwen/pi-wool-qoder': minor
'@zhushanwen/pi-wool-trae': minor
'@zhushanwen/pi-wool-workbuddy': minor
---

status manage command now accepts host-passed credentials (params.apiKey) so login-state checks use the same credential source as conversations.

- wool-shared: add woolPassedApiKey(params) helper and document the status params contract (old extensions ignore unknown keys — backward compatible)
- qoder: status adopts the passed apiKey through adoptRequestApiKey (userinfo-backed, same path as the conversation chain)
- workbuddy: status feeds the passed apiKey straight into account aggregation
- trae: status rebuilt to the host isWoolAccountStatusView contract shape (loggedIn/fetchedAt) — the old {providerId, loginDetected} shape never passed the host guard and always failed with a format error

Fixes the permanently-red "login expired" badge: manage sessions spawn a fresh pi process per action (cold in-process cache) and pi auth.json never holds wool entries, so status always resolved to not_logged_in while conversations kept working.
