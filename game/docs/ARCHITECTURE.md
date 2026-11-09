# 当前架构

项目直接经 HTTP 加载 ES Module 与静态资源，无打包步骤。Node.js 提供服务和测试。

## 分层与启动

data 管内容，core 管规则，app/game.js 管当前会话和流程，ui 管 DOM 与交互。platform 提供存储、事件、音效和动效；render/index.js 是上层访问 3D 的门面。

index.html 依次加载两份经典 Three.js r169 脚本，随后交给 bootstrap.js。默认路由按页面载入 V19 工作台与切割大厅。首页、新锻造与新版藏刀检视轮流使用同一张 V19 画布，切页时停止其帧循环。URL 参数 `?legacy=1` 进入旧流程与旧档案。

| V19 职责 | 位置 |
| --- | --- |
| 选料、控温、锻打与装配 | `src/v19/forge.js`、`src/v19/forgeView.js` |
| 3D 舞台、刀面与配件 | `src/v19/sharedStage.js`、`src/v19/stage.js`、`src/v19/materials.js` |
| 2.5D 切割、关卡与战报 | `src/v19/arena/`、`src/v19/tournament.js` |
| 主档事务、成刀与逐轮结算 | `src/core/v19Progress.js`、`src/core/v19Save.js` |
| 玻璃界面 | `css/tokens.css`、`css/pages/v19.css` |

玩法和原始视觉资源来自 [BladeLab V19](https://github.com/Imthechou/BladeLab/tree/0b95b6778dca9b4a9c747a7cdd23cc9ad6b38cad)。

## 存档边界

4.0 主档使用 `bladeforge.v4.save`。旧流程继续使用 `bladeforge.save`。两个档案各自从对应页面读写。

- 4.0 主档保存信用点、工坊经验、收藏、炉次、逐轮战报、每日奖励凭据与单刀磨合。
- 成刀保留原矿、精炼、刀面四层、锤痕与装配配方。品质按六维均值分档，稀有度按工艺加权评分分档，门槛定义在 `src/v19/workshop.js`。
- 图鉴计入 12 种刀型、12 种矿石、12 种纹理、29 项刀面工艺、6 款刀柄、4 种签名刀皮与 30 个流派阶位。签名刀皮在对应靶具上有切割伤害加成。
- 全国赛五轮与三刀巅峰赛三轮逐轮结算。巅峰赛要求三轮均达标且总评至少 2700 分。赛中刷新会重新开打尚未提交的一轮。
- 新炉按开工时的工坊等级和已装备专精结算。等级提高稀质矿芯概率、降低配件刷新价格与断裂概率。每日目标按北京时间刷新，工艺目标可用良好以上精炼并成刀完成。

- saveSchema.js 提供默认值和字段修复，保留有效内容、未知字段和完整历史。
- progress.js 负责成就、归档、赛事、长期进度及专用字段归一化。
- saveTransaction.js 在草稿中计算，写盘成功后再发布到当前对象，写入失败不发布草稿。
- platform/storage.js 负责 JSON 与存储，广播 save:persisted / save:failed，UI 提供提示和关键结算重试。
- 损坏 JSON 或需要字段修复时，尽量把首次原始文本保存在相应主档的 `.recovery` 键中。配额不足时备份也可能失败。
- 全国赛连续输入检查点独立使用 `bladeforge.national-checkpoint.v1`，依赖 seq / epoch 与主档协作。
- localStorage 不可用时仅保留当前页面内存状态，并提示玩家。恢复存储能力后需要重新打开页面。
- 读取主档后记住原始文本。写入前发现其他标签页已更新时拒绝写入并提示刷新。

存档按浏览器源隔离。启动器固定使用 127.0.0.1:8123，不通过换端口处理冲突。

## 服务与检查

serve.cjs 导出服务器工厂并保留直接运行方式，默认只监听本机地址。提供静态文件、文本 gzip、缓存验证和健康检查。

tools/launch.cjs 启动并打开系统浏览器；识别同一目录的已有服务后复用。端口被其他程序占用时说明原因，不结束其他程序。

静态检查覆盖语法、静态相对导入、部分资源路径、当前 Markdown 链接及 Node 脚本入口，不验证动态导出名称、运行时 shader 或玩法。Node 内置 test 验证核心逻辑和 HTTP，浏览器测试使用隔离存档。详见 [验收](VALIDATION.md)。


---

## 功能定位指南

先读 [协作规则](../AGENTS.md) 和 [架构](ARCHITECTURE.md)，再搜索相关符号与调用方。

| 需求 | 主要位置 |
| --- | --- |
| 双击启动、端口、HTTP 服务 | 上一级 `开始游戏.cmd`、`tools/launch.cjs`、`serve.cjs` |
| 启动与装填 | `src/app/bootstrap.js` |
| 游戏会话与业务操作 | `src/app/game.js` |
| 锻造、卡牌、评分 | `src/core/forge.js`、`cards.js`、`scoring.js` |
| 卡牌、数值、刀型、特性内容 | `src/data/`，数值先看 `balance.js` |
| 存档默认值和字段修复 | `src/core/saveSchema.js` |
| 长期进度和结算规则 | `src/core/progress.js` |
| 主档事务、物理持久化 | `src/core/saveTransaction.js`、`src/platform/storage.js` |
| 赛事规则 | `src/core/arena.js`、`arenaChallenge.js`、`arenaTeam.js`、`arenaSlice.js` |
| 赛事页面和共用展示 | `src/ui/pages/arena.js`、`src/ui/arenaReportParts.js` |
| 实际操作舞台 | `src/ui/arenaStage.js`、`src/ui/formalPerformance.js` |
| 首页、工坊、鉴定、设置 | `src/ui/pages/`、`src/ui/settingsSheet.js`、`src/app/settings.js` |
| 3D 对外接口 | `src/render/index.js` |
| v2 材质程序族、配方 | `src/render/v2/` |
| 预热、缓存和 GPU 预算 | `src/render/gpuPreparation.js`、`resourceLedger.js` |
| 设计令牌和样式 | `css/tokens.css`、`css/pages/` |
| 静态检查、回归与浏览器实测 | `tools/project.mjs`、`tests/`、`tools/verify-browser.mjs` |

新增存档字段同时更新默认值、归一化及相关回归用例。重要操作在草稿中计算，保存成功后发布；失败保留原状态，并允许玩家重试。不要通过清档掩盖兼容问题。

新增 UI 动作优先由 app 编排。调整接口返回值时一起核对调用方，避免失败仍播放成功反馈或锁定重试。

大型模块按独立职责逐步提取，保留原公共导出。当前已提取存档结构、事务和赛事展示组件，不进行无依据的大规模重写。legacy 仍包含有效数据和渲染内核。

完成后按 [验收清单](VALIDATION.md) 检查；增删文件或调整导入导出后运行 `npm run ai:index`。


---

## 功能定位指南

先读 [协作规则](../AGENTS.md) 和 [架构](ARCHITECTURE.md)，再搜索相关符号与调用方。

| 需求 | 主要位置 |
| --- | --- |
| 双击启动、端口、HTTP 服务 | 上一级 `开始游戏.cmd`、`tools/launch.cjs`、`serve.cjs` |
| 启动与装填 | `src/app/bootstrap.js` |
| 游戏会话与业务操作 | `src/app/game.js` |
| 锻造、卡牌、评分 | `src/core/forge.js`、`cards.js`、`scoring.js` |
| 卡牌、数值、刀型、特性内容 | `src/data/`，数值先看 `balance.js` |
| 存档默认值和字段修复 | `src/core/saveSchema.js` |
| 长期进度和结算规则 | `src/core/progress.js` |
| 主档事务、物理持久化 | `src/core/saveTransaction.js`、`src/platform/storage.js` |
| 赛事规则 | `src/core/arena.js`、`arenaChallenge.js`、`arenaTeam.js`、`arenaSlice.js` |
| 赛事页面和共用展示 | `src/ui/pages/arena.js`、`src/ui/arenaReportParts.js` |
| 实际操作舞台 | `src/ui/arenaStage.js`、`src/ui/formalPerformance.js` |
| 首页、工坊、鉴定、设置 | `src/ui/pages/`、`src/ui/settingsSheet.js`、`src/app/settings.js` |
| 3D 对外接口 | `src/render/index.js` |
| v2 材质程序族、配方 | `src/render/v2/` |
| 预热、缓存和 GPU 预算 | `src/render/gpuPreparation.js`、`resourceLedger.js` |
| 设计令牌和样式 | `css/tokens.css`、`css/pages/` |
| 静态检查、回归与浏览器实测 | `tools/project.mjs`、`tests/`、`tools/verify-browser.mjs` |

新增存档字段同时更新默认值、归一化及相关回归用例。重要操作在草稿中计算，保存成功后发布；失败保留原状态，并允许玩家重试。不要通过清档掩盖兼容问题。

新增 UI 动作优先由 app 编排。调整接口返回值时一起核对调用方，避免失败仍播放成功反馈或锁定重试。

大型模块按独立职责逐步提取，保留原公共导出。当前已提取存档结构、事务和赛事展示组件，不进行无依据的大规模重写。legacy 仍包含有效数据和渲染内核。

完成后按 [验收清单](VALIDATION.md) 检查；增删文件或调整导入导出后运行 `npm run ai:index`。

