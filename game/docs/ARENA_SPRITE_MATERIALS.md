# 赛事靶具素材化 · WebP 图集说明

状态：独立分支 `feat/arena-generated-sprite-materials-20261027`。基于已通过浏览器验收的赛事核心开发；本批**不修改**任何锻造渲染、刀具属性、赛事等级配额、切入伤害判定或45秒赛程。

## 素材源与实现

- 源生成器：`game/tools/build_arena_sprites.py`（Pillow；确定性栅格生成）
- 成品素材：`game/assets/arena/targets.webp`；索引 `targets.json`
- 图集尺寸 **1536 × 1280**，30格，每格256 × 256，透明通道。
- 列：`foam / rope / wood / plastic / ice / metal`
- 行：`whole / top / bottom / chips / flash`
- 场景只需一次异步请求、一张图解码；无 SVG、无外部纹理服务。
- 六材料原生视觉：彩色EVA泡棉、编织绳束、树皮年轮木桩、工业加强筋塑板、晶体透明冰、多层空心金属管。
- 断块带原材料自身的截面贴图，沿玩家滑切法线运动；碎屑和冲击光从素材行采样，粒子运动仍动态计算。

**注意：素材是由本项目脚本离线绘制并生成的透明栅格图，不是外部作品搬运，也不是复制水果忍者的素材。** 可把每个256px单元替换为更复杂的商用美术，只要图集行列不变即可。发布版本保留生成脚本以便复现。

## 状态切换

1. `arenaSprites.js` 基于模块地址请求 `game/assets/arena/targets.webp`；解码前旧Canvas绘制临时兜底。
2. `arenaStage.drawTarget` 绘制 `whole` 行，并用命中进度渲染切痕/受损。
3. 切断后不再绘制整体靶，`drawDebris` 使用 `top/bottom` 两个透明断块，根据滑动角度重定向断口、重力与轻重调整落体。
4. `drawBursts` 从 `chips/flash` 行读取材质粒子与撞击亮片，使用已有方向震屏、短视觉顿帧、音效和触觉反馈。
5. 图集加载失败时全部退回到原Canvas材质和碎片；游戏的判定、倒计时、结算不依赖素材加载。

## 验收

- `game/tools/arena-live-playtest.mjs` 新增强制确认 `__FORGE_SPRITES.status() = ready`、图集尺寸和六材实际滑切；测试截图保存完整、切割后两态。
- 原五条真实浏览器用例：快赛完整45秒结算、流派赛入账、全国赛、巅峰赛真实滑切、六材素材展示与撞击反馈。
- 生成图集通过PR内的 `Build generated arena sprite textures` workflow 生成并提交；遇到损坏可执行 `python game/tools/build_arena_sprites.py`。

## 已知边界

- 游戏玩法继续是基于预制切面图和二维动力学的假切割，不是按任意轨迹实时求布尔网格；方向通过变换断块贴图近似。
- 浏览器手机尺寸测试不是实体iPhone/Android设备触觉测量；触觉强度、声压和真实设备功耗仍应实机验收。
- 正式赛之外原有锻造材质渲染和赛事非切割小游戏保持原样。
