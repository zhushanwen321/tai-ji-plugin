# @zhushanwen/pi-wool-trae

## 0.2.1

### Patch Changes

- 5a9790f: Publish the wool shared plugin and family subpaths, and move every wool consumer onto that shared release. The 0.1.0 taiji plugin packages import `@zhushanwen/pi-wool-shared/plugin`, while the published 0.2.0 shared package contains neither that export nor its implementation; installing any wool taiji plugin therefore failed during module loading and taiji rolled the installation back.
- Updated dependencies [5a9790f]
  - @zhushanwen/pi-wool-shared@0.3.0
