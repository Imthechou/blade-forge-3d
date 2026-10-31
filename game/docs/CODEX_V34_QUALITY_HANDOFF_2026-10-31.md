# 《锻刀大赛》当前版本与 Codex 测试优化交接（2026-10-31）

> **本文件是面向下轮 Codex 的统一入口；以仓库最新 GitHub HEAD 为准。** 这是只整理资料的版本基线，不代表执行了新一轮测试或修复。

## 0. 仓库与版本基线

- 仓库：https://github.com/Imthechou/blade-forge-3d
- **main**：`c0f64354debed6e7eb7aed6f6877f270ba5174af`（已包含 2026-10-29 合并的赛事 V4.1 PR #31）。
- **PR #32**：https://github.com/Imthechou/blade-forge-3d/pull/32，`feat/blade-collection-growth-v34-20261030`，**open Draft、未合并 main**。
- **已验证代码 HEAD**：`fb89ddb57ff8fa0f9d73c04aba8a259da737b035`；与 main 比较为 ahead 174 commits、70 changed files。
- 2026-10-31 核实：该代码 HEAD 的 **9/9 GitHub Actions success，0 failure**。注意这是**软件自动化**的结论，不是游戏完成度或实体手机真机结论。
- Pages workflow 的 build success、**deploy job skipped**；正式 GitHub Pages 不包含 PR #32 的这些未合并改造。
- 文档修改以后 HEAD 会变化；**绝不能把代码 HEAD `fb89ddb` 的 9/9 自动继承到后来的代码 SHA**。

## 1. 已实现和已有自动化证据

| 系统 | 代码入口/证据 | 软件级状态 |
|---|---|---|
| 五屏锻造 | `src/core/forgeChapters.js`、`forgeAssist.js`、`ui/pages/forge.js` | 5 次主动选择 + 4 次辅助选择、保留原九道工序、S4/S7 实际操作、风险贯穿第二至四屏 |
| 材料和个人成长 | `forgeMaterials.js`、`forgeRecipeAccess.js`、`arenaV41Growth.js` | S1 稀有材料库存掉落与指定消耗；工坊十级、六流派专精，旧档与防重复结算 |
| 锤打局部修形 | `forgeShape.js`、`render/bladeShape.js` | S4 局部受限刀缘 COW 形变与 `shapeProfile` 存档/藏刀复现，**不是完整物理自由塑形** |
| 鉴定/收藏/单刀成长 | `ui/bladeCard.js`、`ui/pages/workshop.js`、`core/bladeMastery.js` | 3 种不同刀型 WebGL 录图、卡片、1080×1520 PNG、珍藏、有效赛事单刀磨合；不改原始刀皮/六维 |
| 快赛 | `core/arenaChallenge.js`、`ui/pages/arena.js` | 45 秒、单指切割、六材料、移动靶/避让靶、碰撞记录、音效、按真实时钟输入的 Playwright 回归 |
| 正式赛事 | `arenaStructures.js`、`arenaFormal.js`、`arenaCareerV41.js` | 六流派、五段位、全国五轮、世界三刀结构赛，存档回执与分刀成长 |
| 美术/生命周期 | `arenaStage.js`、`arenaSprites.js`、`arenaStructureVisual.js`、`platform/audio.js` | 六材料真实切面与实际结构断裂图，音效材质区分/共享 PCM，10 次赛场导航检查 Canvas/RAF 泄漏 |
| 可靠性 | `platform/storage.js`、`core/saveTransaction.js` | Web Locks 与修订号保护、双标签用例、失效回执防重复和旧数据兼容测试 |

- Arena 最近一次综合证据：https://github.com/Imthechou/blade-forge-3d/actions/runs/41180309315
- 全游戏移动 UX：https://github.com/Imthechou/blade-forge-3d/actions/runs/41180309120
- S4/S7 WebGL：https://github.com/Imthechou/blade-forge-3d/actions/runs/41180309276
- S1–S9 材质与 24 种 S3 对照：https://github.com/Imthechou/blade-forge-3d/actions/runs/41180309064
- 三刀型收藏：https://github.com/Imthechou/blade-forge-3d/actions/runs/41180309150

## 2. 尚未解决 / 不得声称已完成

1. **锻造深度**：当前材料“库存”是稀有材料的**确定性指定权**，并非九阶段全由玩家独立拥有的完整卡组。五屏已化繁为简，但缺少完整、自由物理塑形与系统协同成型的深入手感验证。
2. **快速挑战**：已支持加速后移动靶与少量避让目标；“聚拢、弧线、错位、快速补位”等高辨识度作者波次和真正可重复的技巧挑战仍需体验验证。
3. **正式比赛**：六流派结构和路线已经可玩，材料高级别终结特效、流派之间的独立技巧、同均值偏科刀跨任务优势反转，尚不能只凭规则单测宣称设计优秀。
4. **美术/UI**：玻璃拟态、刀皮/PBR、六材料和收藏卡已有实现；商业级主观审美、动画一体化、卡片与赛事同屏层次仍要逐图审核并据问题修正。
5. **长期平衡**：25k deterministic seeds 仅是数值警戒，不等于真人胜率、材料获取节奏和经济公平性；极端风险策略在既往模拟中成功率约 0.08%，可做独立分析，不得擅自大幅改数值。
6. **性能**：WebGL 软件 Chromium/SwiftShader 不代表真实 iOS/Android GPU。实体触控、60fps、内存、温升、耗电、音频与震动无法在纯 Actions 中完成。
7. **保留兼容**：旧版 `Arena.createMatch` team3 仍属于独立实验模型；不能伪装为 V4.1 正式三刀比赛获取成长或奖励。

## 3. Codex 第一轮执行目标（先测再修）

**P0 · 基线和真实试玩**

- 首先读取 `game/AGENTS.md`、本文件、`docs/AUTONOMOUS_AGENT_STATE.md`、`docs/REWORK_V34_COLLECTION_GROWTH_PLAN.md`，并核实最新 main、PR #32 HEAD 和 GitHub Actions；如果有人已经推进，使用最新 HEAD，避免覆盖。
- `cd game && npm run verify`；按仓库的现有流程运行 WebGL/Playwright，优先复用 `tools/forge-v4-live-qa.mjs`、`tools/unified-ux-acceptance.mjs`、`tools/arena-v3-playtest.mjs`、`tools/arena-prop-visual-qa.mjs` 及关联工作流。确认本地服务使用 HTTP（`npm run serve`），不可用文件协议验证 ES Module。
- 在 320、375、390px 竖屏浏览器视口，真实完成五屏锻造（含库存直选扣料、S4 0/10/20 锤、S7 三次轮廓）、鉴定收藏、PNG 下载、再次打开藏刀、出战、结算并检查旧档。用实际手势、真实 Canvas/WebGL 和截图，而非只调用 `core.swipe()` 给自己制造通过。
- 真实走满 45 秒快赛、不同平均六维刀的六材质切割、六流派至少各一完整局、全国赛五轮、世界赛三刀，并抓取切前/切中/切后、失败/重试/主目标收手和真实结算。
- 检查 Chrome console（JS/GLSL）、HTTP、失败存档、双标签竞争、10 次路由跳转、Canvas/RAF/ResizeObserver/事件监听、资源数与缓存预算。截图、JSON、性能日志写到现有 Actions Artifacts。

**P1 · 问题驱动精修（不盲目增加系统）**

- 按重现性和影响排序，最多优先处理 **3 个高收益问题**：① 切割命中反馈与波次变化；② S4 锤击形变可辨识性 / S7 贴合判定手感；③ 收藏卡视觉细节、赛事 UI 干扰或移动端卡顿。根据真实测试发现调整顺序，不为制造提交而改动。
- 每项先保存原画面、明确触发条件和可量化失败指标，再小范围修改；重跑专项测试、截图对照、必要时全套 Actions。不能只把断言改宽以通过测试。
- 不进行全面 UI 重写、不替换 Three.js/GLB/PBR 资源体系、不侵入缓存 Geometry，不破坏九工序账本、风险算法、材料库存、奖赏幂等及旧存档。
- 真实设备缺席的测试要明确标“未验证”，**禁止称模拟视口为 iPhone 真机**。

## 4. 必须交付

- `game/docs/CODEX_QUALITY_REVIEW.md`：问题清单 `严重度｜复现步骤｜原截图/日志｜根因｜修改/原因｜新截图/日志｜测试结果｜剩余风险`。区分“已实现”“已通过浏览器”“仅模拟”“未实现”。
- 在 PR #32 分支提交小粒度代码与测试，**不得合并 main**；记录新 SHA、9 个 Actions 分项结论、Artifacts 链接；如有失败必须如实记录，修复后再测。
- 若发现方向性问题（全面卡池重做、自由塑形大改、换引擎、不可逆数值改革）先列备选方案，**不得擅自大重构**。

**推荐顺序：核实→端到端试玩→复现和截图→排名→最有价值的 1–3 项小修→专项回归→全套 CI→视觉人工复核→PR 交接。**
