# @zhushanwen/pi-wool-trae

## 0.2.3

### Patch Changes

- fd24faa: 流式解析层支持 Qwen 系模型的 `<tool_call>` XML 工具调用方言。SOLO 免费通道的文本协议教学只教 `<toolcall>` JSON 方言，mimo-v2.6-flash 等模型实际输出训练时习得的 `<tool_call><function=NAME><parameter=KEY>VALUE</parameter></function></tool_call>` 形态，此前整段落入纯文本——工具不执行、无 toolResult、模型在 thinking 中误以为已调用并反复重试。现解析层双方言并存（教学方言不变，只扩解析容忍），覆盖流式跨增量截断重组、多参数、混合方言按位置保序、未闭合块原文保留、与原生 output.tool_calls 去重。

## 0.2.2

### Patch Changes

- Updated dependencies [934cdfd]
  - @zhushanwen/pi-wool-shared@0.3.1

## 0.2.1

### Patch Changes

- 5a9790f: Publish the wool shared plugin and family subpaths, and move every wool consumer onto that shared release. The 0.1.0 taiji plugin packages import `@zhushanwen/pi-wool-shared/plugin`, while the published 0.2.0 shared package contains neither that export nor its implementation; installing any wool taiji plugin therefore failed during module loading and taiji rolled the installation back.
- Updated dependencies [5a9790f]
  - @zhushanwen/pi-wool-shared@0.3.0
