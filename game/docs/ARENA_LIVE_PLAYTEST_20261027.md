# 赛事真实浏览器验收（2026-10-27）

仓库：Imthechou/blade-forge-3d；分支：`test/arena-live-playtest-20261027`；验收对象：main 原有玩法代码（仅测试脚本独立提交）。

## 环境与步骤
- GitHub Actions Ubuntu + Chromium / Playwright，390×844，DPR 2，独立收藏刀存档，真实 PointerEvent 滑动。
- 快赛：赛事→快速挑战→自由快赛→Canvas 上对三靶做真实拖拽→观察分数、阶段、选择与结算。
- 正式赛：赛事→锋刃→开始挑战→现场切割 Canvas→统计已切数与真实题目序列。
- 执行：https://github.com/Imthechou/blade-forge-3d/actions/runs/40481551090
- 证据：上述运行中的 `arena-playtest-evidence` artifact（截图、JSON、server log）。
- 测试脚本：`game/tools/arena-live-playtest.mjs`；工作流：`.github/workflows/arena-live-playtest.yml`。

## 实机发现

1. **P0 正式赛空靶 / 0 分自动结算（已复现）**
   - 进入“锋刃”切割后显示 `已切 0/0`，空白舞台；不需玩家操作就出现“切割 0 分”“进入下一项”。
   - `Game.formalTask().rule = {}`，`sequence = undefined`；而 `definition.rules` 的 `kind` 为 `sweep`、`hold`。
   - 根因：`data/arena/formalTests.js` 生成规则时 `{kind:t, ...(projectRule(t)||{})}` 后者覆盖了 `kind`（切割项目 cutting→操作种类 sweep）；`core/arenaFormal.js#testTask` 却 `def.rules.find(r=>r.kind===entry.kind)`，永远找不到对应项目。
   - 建议分离 `projectId` 与 `operationKind`：规则以 `projectId` 索引，UI 按 `operationKind` 选对应操作舞台；禁止空题自动计 0 分并完成，补全六流派/五项规则的回归。
2. **P0/P1 快赛时间随低 FPS 变慢（已复现，CPU 软件渲染环境）**
   - Canvas 真正命中：三靶 `rope/foam/rope` 切断 3 个，得分 `0→292`。说明完整切割引擎可运行。
   - 但进入第8秒的 route-choice 后，实际等待约42秒，游戏时钟只推进到 `elapsed=17.5163`（应该到第30秒的 finale-choice）；该测试无法正常完成完整45秒流程。
   - 时间推进调用 `arena.js` 的 RAF `dt = Math.min(.05,(now-lastFrame)/1000)`，低于20 FPS 或长帧会丢失真实经过时间；浏览器截图/软件 GPU 渲染可能放大问题。需要拆分真实倒计时（单调时钟）与物理帧步长（clamp），并在失焦时明确暂停。
3. **P1 操作舞台与赛制割裂（架构确认）**
   - 快赛走 `arenaChallenge.js` + `arenaStage.js`（可见材质、破甲、磨损、连击、反馈）；正式赛切割另走 `formalTestStage.js#renderSweep`（线条靶、命中即消失、固定总量），未接入完整切割引擎。
   - 先修可玩性，再让正式切割统一消费同一判定内核；不同赛级通过目标、对手与材料配比差异化。
4. **P1 视觉/布局问题（真实截图）**
   - 正式赛手机端出现大面积空白、信息散落、步骤序号重复（如“1. 1. 切割”）。
   - 快赛 HUD 文字拥挤、部分信息贴边；修复逻辑后再优化交互密度、对比度和命中反馈。

## 其他诊断
- 2D 赛事可在 GPU 预热降级时启动；`__FORGE_PREP.ready=false` 的问题为 `S4 glow shader preparation: no-knife-model`，不是本次 2D 玩法失败的直接原因。
- 浏览器截图操作出现多次超时，说明测试环境存在高负载；不能直接推断所有真机都同样低帧率。Android / iOS 物理设备尚未验证。
- 工作流**预期失败**直到上述缺陷修复；不可把自动化通过当作无需真人试玩的证明。

## 推荐修复顺序
1. P0 统一 rule 字段和正式赛的任务生成，补空题保护/分项验收。
2. P0 改快赛倒计时为 wall-clock + 显式暂停，验证路线/压轴/结算正常。
3. P1 把正式切割接入 `arenaChallenge` / `arenaStage`，合并多条切割玩法分叉；保留非切割性能测试作为少量特殊玩法，避免偏离45秒主玩法。
4. P1 移动端画布尺寸、物理性能与视觉反馈；测真机 FPS、事件漏报、暂停/恢复。
