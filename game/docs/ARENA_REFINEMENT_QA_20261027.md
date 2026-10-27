# PR #12 · 赛事靶具精修与合并验收

## 问题与变化

原六材靶具轮廓过于规整，表面大量硬亮划线使材质显得扁平；完整体几乎完全静止。旧断块实现还会把整件物体转到手指刀口角度，斜切或竖切时木桩、塑板等会突然变向。

本轮重新绘制六种原生材质：泡棉的孔隙与受拉绑带、绳束的交错编织和松散纤维、木桩的偏心年轮和起伏树皮、塑板的凹槽/加强筋/厚边、冰块的内部霜雾/裂纹/折射面、实心钢块的平整拉丝和倒角反光。美术在 3 倍分辨率绘制后缩小，减少锯齿与硬亮线。透明图集仍为 **1536×1280**，原 **161,276** 字节变为 **169,152** 字节，约增加 **7.7 KiB**；没有新增网络资源请求。

靶具现在有按材料轻重区分的微小摆动和出场回弹，字幕/进度条不跟着摆动；减弱动效时为完全静止姿态。所有运动只在绘制层计算，不改实际碰撞坐标、护甲、生命、伤害、投放、计时或计分。

切断改为按实际刀口裁切完整素材，保留原物体方向。切面使用材质专属颜色与截面细节，并通过 alpha 限制在物体内部。旧旋转整张贴图的做法已移除。方向按 2° 分桶，最多缓存 12 对透明片块（约 6 MiB），相同材质与方向不重复生成。命中亮白也随材质轮廓绘制，去掉原来罩住目标的白色矩形。

## 真实浏览器结果

Windows 系统 Chrome 156，390×844 移动视口、DPR 2、触控；独立测试存档，不访问玩家实际存档。另有六材 × 三刀口方向的组件实拍。

| 检查 | 结果 |
| --- | --- |
| 45 秒自由快赛，真实连续指针操作、阶段推进、完整结算 | PASS |
| 流派正式赛切割与下一项目入账 | PASS |
| 全国赛开场真实切割 | PASS |
| 全球巅峰赛开场真实切割 | PASS |
| 六材同屏、命中反馈、逐一切断 | PASS；泡棉/绳束 1 刀，其余 2 刀，与原版本一致 |
| 提前收刀不发 CR、不刷完成纪录 | PASS |
| 页面错误 / 失败请求 | 0 / 0 |
| 横切、45° 斜切、竖切的原轮廓连续性 | 18/18；上下片合拢后与完整体的覆盖差异均低于 2.5% |
| 断块缓存 | 验证创建 18 对后仍最多保留 12 对 |
| 动态姿态、输入数据不可变、确定性、减弱动效 | 单元回归 PASS |
| 全部 Node 回归（含已合并 S5） | 40/40 PASS |
| 图集生成源一致性 | RGBA 平均差 [0,0,0,0] |

原有赛事夹具记录的 `GPU_PREP_DEGRADED / S4 glow no-knife-model` 提示在基线和本轮均存在；赛事 Canvas2D 正常运行，原始 JSON 保留该提示，不把它隐藏成“没有任何诊断”。本轮不将 Chrome 移动视口测试当成手机物理触感/功耗测量，也没有宣称跑完全国赛或巅峰赛整届全部轮次。

## 截图与记录

- [精修前后对照](validation/2026-10-27-arena-refinement/arena-before-after.jpg)
- [六材 × 三方向断面](validation/2026-10-27-arena-refinement/arena-cut-directions.jpg)
- [真实赛事六靶画面](validation/2026-10-27-arena-refinement/11-six-material-design-gallery.jpg)
- [切断反馈](validation/2026-10-27-arena-refinement/12-six-material-slicing-feedback.jpg)
- [完整 45 秒结算](validation/2026-10-27-arena-refinement/05-quick-settlement.jpg)
- [六条实玩记录](validation/2026-10-27-arena-refinement/report.json)
- [18 组方向与轮廓记录](validation/2026-10-27-arena-refinement/cut-direction-report.json)

## 分支与验证方式

PR #12 原来叠在尚未合并的 PR #11 之上，现以 main 为合并目标；最终提交保留 PR #11 的完整赛事基础改动，并整合 main 已合并的 PR #10/S5。渲染模块按 main 对照，不回退 S5 工艺、S3 锻纹与 S8 Grip 归属。

`npm run ai:index` 已运行；静态检查的 40 处历史缺失脚本/文档引用与 main 基线一致，不因此宣称静态检查全绿。CI 的素材生成改为只读校验，避免在审图之后自动换掉素材。

复现：运行 `game/serve.cjs` 后，在 game 目录执行 `node tools/arena-live-playtest.mjs` 和 `node tools/arena-prop-visual-qa.mjs`；支持 `FORGE_URL`、`CHROME_PATH`、`PLAYWRIGHT_MODULE`、`ARENA_QA_OUT`。重新生成素材用 `python tools/build_arena_sprites.py`；核对用 `--verify`。
