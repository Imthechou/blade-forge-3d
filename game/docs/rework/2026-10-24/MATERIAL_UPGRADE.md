# S1–S9 3D 材质渲染改造 · 交付记录

> 2026-10-24。目标是向 CS2 刀皮质感靠拢。
> **本次交付的是「骨架修复」：把 7 处真实缺陷修掉并逐项实测验证。
> 完整达到 CS2 质感尚未完成，差距见文末「未达成」一节。**

---

## 一、核心发现：v2 从来没有表面结构层

`material.js` 的 hook 系统一直有 `normalFragment` 注入点（注入到 three 的
`#include <normal_fragment_maps>` 之后），**柄部（bladeViewer.js）一直在用**，
但 `v2/programFamilies.js` **一次都没写过它**。

后果：刀面只有几何解析法线。颜色、粗糙度、色带再怎么调，表面永远是平的
—— 这就是「像贴纸而不是金属」的根因。

修复：新增 `src/render/v2/surfaceDetail.js`，用纹样场（烘焙图集 / S3 图像）的
屏幕空间导数推真实法线扰动，数学上等价于一张高度图的 bump。

### 我在这一步先写错了一次（实测抓出来的）

初版照抄柄部的 Mikkelsen 式：

```glsl
vec3 bumped = abs(det) * normal - grad * scale;
normal = normalize(mix(normal, bumped, blend));
```

**这不是可用的 bump。** `abs(det)` 的量级约 1e-5（像素足迹的叉积），
而 `normal` 是单位向量（模长 1）。于是：

```
mix(normal, bumped, 0.5) ≈ 0.5*normal + 0.5*1e-5*方向
→ normalize 后又变回 normal     ← 扰动被完全淹没
```

实测证据链：
- 把放大系数从 0.55 改到 **50 倍**，高频能量变化 **0.0%**（`_amp.mjs`）
- 但把 `normal` 直接写成常量，画面明显变化 → 说明 normal 确实被消费，
  只是这一句算完等于没改
- 修法：**先把 `bumped` 归一化**再与 normal 混合（两个单位向量的 mix 才是角度插值）

修复后（`_ab3.mjs`，时间冻结、只测刀身、同状态两次逐位相同的稳定装置）：

```
surf=0.5 vs surf=0 : 高频 +7.95%   对比σ +1.96%
surf=1.0 vs surf=0 : 高频 +10.78%  对比σ +2.63%
aniso=1  vs surf=0 : 高频 +5.47%
```

---

## 二、另外 6 处失效参数（全部有实测证据）

| # | 问题 | 证据 | 修复 |
|---|---|---|---|
| 2 | **卡间强度梯度全被顶死** | 卡数据 `fx.y` = 0.774–1.163，shader 里 `clamp(fx.y, 0, 0.52)` 把**每一张卡**都压成 0.52 → 「这张卡更强」这个维度完全失效 | 把实测区间映射到 0.46–0.58，**均值保持 0.52** |
| 3 | **S9 调校零效果** | `k3dApplyTune(` 调用数 = 0，`uTune.x/yz/w` 引用数 = 0；而 S9_12/17/20/22/23/24 六张卡确实带 tune 数据 → 数据在、槽位在、着色器不读 | 补 S9 相位环（与 S6 回火同构，只用已有槽位，不拉整支函数进管线） |
| 4 | **各向异性是死 uniform** | `uBladeAnisotropy` 只写进 uniform，**material.js 里 anisotropy 出现 0 次** → 拉丝/磨削的方向性高光完全不存在 | `bladeViewer` 接线，三源合并（材质表 / 纹理 `uTexParam6[3]` / 工艺语义 F03·F11）；命中即 0.35 |
| 5 | **表面曲线与工序语义反了** | 我初版只按工艺查表 → S1–S4 抽 F01(0.13)、S5–S9 抽 F11(0.42) → S3 锻打 0.12（最细）、S9 精校 0.48（最粗），**完全反了** | 改为「阶段曲线为主 + 工艺乘性调制」，S3 锤痕最深 0.639、S9 最细 0.152 |
| 6 | **环境反射全程只降不升** | 实测 `scene.environmentIntensity` 0.55→1.50 亮度变化 **0.0%**；`material.envMapIntensity` 0.9→1.5 亮度 **+32.5%** | 给 `envMapIntensity` 加阶段递进（1 阶段 0.82 → 9 阶段 1.30） |
| 7 | **锻造阶段无表面区分** | S2/S3 对比σ 0.125/0.113，全程最低 | 由 #5 的阶段曲线 + #1 的法线层共同解决；S3 对比σ 0.1149 → 0.1238 |

### `scene.environmentIntensity` 为什么是死的（源码级定位）

three r169 里只有这一条路径会用它：

```js
material.isMeshStandardMaterial && material.envMap === null && scene.environment
  && (uniforms.envMapIntensity.value = scene.environmentIntensity)
```

本项目的刀身材质**自带 envMap**（道具级贴图），这条分支永远进不去。
真正生效的是 `material.envMapIntensity`。

---

## 三、验收（全部真实浏览器）

```
语法         138 个源文件 OK=138 FAIL=0
npm run check 219 scripts / 693 refs / 0 errors
npm test      9/9 pass
playtest      ERR 0 / WARN 0，20 张截图，0 console error
normalFragment 已挂上（3843 字符），刀身正常渲染
```

性能（本轮新增法线层后，`bench-browser.mjs`，真实退出码 0）：

```
选卡预览 p50 8.7ms / p95 13.0ms
50 次选卡  冷 p50 21.6ms / 热 p50 21.0ms / p95 24.1ms / max 25.4ms
空闲帧率   144.6–149.2 FPS
JS heap    36.7MB → 20.9MB（无单调增长）
console error 0
```

阶段实测（`_surf.mjs`，与原始基线同口径）：

| 阶段 | 亮度 | 对比σ | relief | 语义 |
|---|---|---|---|---|
| S1 原料 | 0.4346 | 0.1669 | 0.489 | 粗颗粒 |
| S2 熔炼 | 0.2443 | 0.1278 | 0.414 | 均质化 |
| S3 锻打 | 0.2400 | 0.1165 | **0.639** | **锤痕最深** ✓ |
| S4 定型 | 0.3233 | 0.1210 | 0.395 | 压平 |
| S5 淬火 | 0.3263 | 0.1260 | 0.369 | 晶粒细化 |
| S6 回火 | 0.4116 | 0.1320 | 0.282 | 氧化膜 |
| S7 开刃 | 0.3647 | 0.1240 | 0.412 | 折面+磨削 |
| S8 装配 | 0.4312 | 0.1295 | 0.260 | 趋于完成 |
| S9 精校 | 0.3843 | 0.1325 | **0.177** | **最细腻** ✓ |

`FAMILY_VERSION` 已随之提升到 `bladeV2:42`（改 GLSL 必须 bump，否则 three 复用旧 program）。

---

## 四、未达成（如实记录）

用户要求「接近 CS2 高级刀皮的视觉质感」。**本轮没有做到。** 差距在：

1. **S1–S4 是过程模型**（矿石/熔液/胚体），`uV2Preserve=1` 走的是「保留模型自带贴图」分支，
   刀身材质链基本不参与 → 这几阶段的观感主要取决于模型资产本身，不是本轮的材质系统。
2. **刀身仍偏暗**：本局抽到 M08「锻黑钢」`#5c564c`（metal 0.92 / rough 0.62），
   叠上 S2 低纯净度卡的 `envIntensity−0.22`，`lumMean ≈ 0.24–0.33`。
   这是「玩家选择的正确后果」，不是 bug，但离 CS2 的明亮金属反射仍有距离。
3. **没有真实纹理资产**：修的是程序化表面结构（法线扰动 + 微脊），
   而 CS2 的层次来自多张贴图（albedo / normal / roughness / mask 四层合成）。
   仓库里没有任何 normal map，本轮也没新增二进制资产（避免扩大改动面）。
4. **Pattern 混合仍是单通道**：CS2 的 Pattern 是「种子 + 多层 mask 叠加」，
   本项目仍是「烘焙图集 9 槽 + 单张 S3 图」。
5. **Wear 只做了衰减**，没有 CS2 那种「先磨边缘 → 表面失纹 → 露底材」的三段式遮罩。

## 五、下一轮真正要做的（按收益排序）

1. **给 S5–S9 补 normal map 资产**（或运行时用 canvas 生成 4 张可平铺的 normal 图），
   接 `material.normalMap + normalScale` —— 这是唯一能真正跨过「程序化 vs 真实贴图」门槛的一步。
2. **S1–S4 的过程模型单独一套材质曲线**，不要和成刀共用 `uV2Preserve` 分支。
3. **三层 Wear 遮罩**（edge / surface / substrate），替换现在单一的 `uWearLevels` 衰减。
4. **Pattern 多层叠加**（在现有 9 槽图集上加第二层 mask 混合）。
5. 移动端真机验证（本轮全部是桌面 GPU + 视口模拟）。

## 六、改动文件

| 文件 | 改动 |
|---|---|
| `src/render/v2/surfaceDetail.js` | **新增**：normalFragment 注入体 + 阶段 relief 曲线 + 工艺乘性调制 |
| `src/render/v2/programFamilies.js` | 接入 normalFragment；`uV2Surf`；fx.y 映射；S9 调校层；版本 → `bladeV2:42` |
| `src/render/legacy/bladeViewer.js` | 各向异性三源接线（两处：真实材质 + 预热副本）；envMapIntensity 阶段递进 |

## 七、验证脚本（可复现）

```
_surf.mjs     逐阶段截图 + 刀身像素 + 真实 uniform（探针已修正 alpha 与 hook 位置）
_ab3.mjs      严格 A/B 装置（冻结时间、只测刀身、同状态重复性校验）
_amp.mjs      法线层放大系数扫描（当初抓出数学错误的工具）
_relief3.mjs  阶段 relief 曲线语义校验（两种工艺组合）
_lightab.mjs  光照杠杆 A/B（env / exposure / envMapIntensity）
_aniso2.mjs   各向异性接线验证
_p0.mjs       三处 P0 的实机验收
```
