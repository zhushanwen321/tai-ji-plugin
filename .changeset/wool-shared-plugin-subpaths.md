---
'@zhushanwen/pi-wool-shared': minor
'@zhushanwen/pi-wool-qoder': patch
'@zhushanwen/pi-wool-trae': patch
'@zhushanwen/pi-wool-workbuddy': patch
'@zhushanwen/plugin-wool-qoder': patch
'@zhushanwen/plugin-wool-trae': patch
'@zhushanwen/plugin-wool-workbuddy': patch
---

Publish the wool shared plugin and family subpaths, and move every wool consumer onto that shared release. The 0.1.0 taiji plugin packages import `@zhushanwen/pi-wool-shared/plugin`, while the published 0.2.0 shared package contains neither that export nor its implementation; installing any wool taiji plugin therefore failed during module loading and taiji rolled the installation back.
