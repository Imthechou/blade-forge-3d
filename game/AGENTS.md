# AI 协作指南

## 先定位，再修改

- 先读 README.md、docs/ARCHITECTURE.md（含按功能定位源码的速查表）和相关模块；docs/SOURCE_INDEX.md 与 docs/dependencies.json 是可重新生成的导航，不是业务真源。
- 原压缩包内注释中的历史版本、内部规范引用只作背景；原包没有提供的规范不可假定为已知。
- 默认保持玩法、存档兼容性、资源路径和启动方式。针对需求作局部修改；若需求明确包含重构或规则变化，按用户要求执行并说明影响。
- 不要仅因目录叫 legacy 就删除或迁走代码。data/legacy 包含有效内容源，render/legacy 包含当前渲染内核和 Three.js。

## 分层边界

- data：配置与内容；core：规则；app/game.js：会话编排；ui：DOM 与交互；render：3D；platform：浏览器服务。
- 新 UI 操作优先经 app/game.js 协调；改具体规则先找 core；调整数值先找 data/balance.js。
- 新增渲染调用优先使用 src/render/index.js 门面。不要随意给新业务代码引入 legacy/_registry.js。
- index.html 中 two classic Three.js scripts 必须先于 bootstrap.js module 加载；保留现有顺序。
- CSS 令牌集中在 css/tokens.css，页面样式读取令牌；保留样式加载顺序。
- 存档默认值与字段归一化由 core/saveSchema.js 定义，core/progress.js 管理存档规则，platform/storage.js 持久化。重要操作使用 core/saveTransaction.js 的草稿事务。改字段时考虑旧存档与默认值，不能通过清除用户存档掩盖兼容问题。
- 处理大文件时先查具体符号和调用方。不要把 three.bundle.js、three.addons.js、s3TexMapsData.js 或二进制资源整体塞进上下文，也不要批量格式化它们。

## 完成前

1. 执行 `npm run check`；它验证语法、静态相对导入、部分资源路径、当前文档链接与 Node 脚本入口，不验证玩法。
   修改存档、服务或结算后执行 `npm test`；浏览器行为按验收清单选择实际流程。
2. 按 docs/VALIDATION.md 验证受影响流程；未运行的检查需明确标记。
3. 增删文件或更改导入、导出后执行 `npm run ai:index`。
4. 报告改了什么、为何修改、验证结果，以及兼容性或未验证项。
