# S5 光学工艺与 S3 锻纹分离 · PR #10

本轮基于 `0a4843aa330fbf68972910d22dbe6075f9d5375d`，继续使用
`feat/s5-family-material-energy-budget-20261027`。不创建其他 PR，不合并。

## 视觉变化

旧版的多张 S5 卡只在灰度、粗糙度或色带上略有区别；部分图案的横向坐标还把整个刀面挤进了取样图的一小段。本轮为 25 张卡分别设计光学分布，并修正 S5 横向坐标。急冷刃带、哑面分区、盐浴矿斑、斜向拉丝、氮化分面、温控金线、金蓝色岛、液态多普勒、宝石与紫晶蚀界分别拥有自己的空间结构。

S3 仍控制所选锻造纹理、原有投影和凹凸；S5 不写 S3 的贴图、纹理 ID 或法线。S5 使用一个 256×128 RGBA 光学通道图：光谱位置、处理覆盖、抛光粗糙度、清漆覆盖。图案同时进入真实金属粗糙度与独立清漆反射，并由已有 S3 高低差调制颜色和覆盖，保留原锻纹的辨识度。移除旧 S5 通用纹样对高度场的贡献，避免把 S5 叠成第二层锻纹。

S5 的构图种子只使用局级通道，排除 S3 pattern index。更换 S3 时，S5 的膜层构图不重抽；换局时膜层落点、色域比例和抛光分布变化。同卡、同局种子确定复现。稀有构图为独立的 6.5% 外观分支，不消费玩法 RNG，也不改变卡牌稀有度和掉率。宝石分型也改用局级种子；因此部分旧种子的宝石色相会重新映射，但存档字段与数值保持兼容。

## 研究依据

- [CS2-SP-Workshop-Tools customweapon.glsl](https://github.com/smoothie-ws/CS2-SP-Workshop-Tools/blob/main/assets/shader/customweapon.glsl)：分别合成底材、图案、磨损、粗糙度及金属度，并分别变换 pattern / wear 坐标。采用其通道分工思路，不复制原 shader 或 Valve 资源。
- [该项目的 PBR 输出](https://github.com/smoothie-ws/CS2-SP-Workshop-Tools/blob/main/assets/shader/std/pbr.glsl)：颜色与金属度共同决定漫反射/镜面反射，粗糙度控制真实镜面项。
- [Filament 标准表面实现](https://github.com/google/filament/blob/main/shaders/src/surface_shading_model_standard.fs)：基础表面 BRDF 与独立 dielectric clear-coat lobe 的分层思路。本项目继续使用已有 Three.js Physical 管线，无新光照 pass。
- [Valve Weapon Finishes Guide](https://www.counter-strike.net/workshop/workshopfinishes)：阳极、淬色、氧化和涂装有不同物理身份，图案位置和尺度可随机化；本轮以此区分工艺族和局内实例。

## 实际 Chrome 验收

[截图目录及全部 25 张完整手机画面](validation/2026-10-27-s5-optical/README.md)。

环境：Windows 系统 Google Chrome **156.0.8078.48**，移动视口 **390×844**，DPR 2、触控，实际画布 **585×707**（渲染器自适应 DPR 1.5）。使用独立浏览器上下文，不访问用户存档。不是 Android/iOS 真机性能结论。

最终版本 `bladeV2:60` 保存 **101 张**截图，页面/着色器编译/链接错误 **0**：

| 验收范围 | 结果 |
| --- | --- |
| 25 张 S5，同 M06、T07、种子、刀型、机位，真实卡牌点击 | 25/25；换卡 program 数稳定为 10 |
| 全部 24 种 S3，固定 S5_20 | 24/24，纹理可辨；S5 膜层构图一致 |
| 5 种 S3 × 3 张 S5 | 15 张额外交叉图 |
| M01 / M06 / M14 / M24 底材 | 9 张额外底材图；M06 已包含在主矩阵 |
| 3 个额外局种子 × 4 张 S5 | 12 张跨局变化图 |
| 六张稀有模板 | 均找到真实局种子并实拍 |
| S1–S6 全刀继承 | 原料、熔炼、刀胚、整刀、淬火、回火均可推进；S6 的 coverAll=1 |
| S8 Grip override，推进至 S9 | S8 选卡前 coverAll=1，选柄后=0；S5 卡与 S3 ID 持续保留 |
| 图像审查 | 所有 25 张有可见刀具；300 对截图均不同，最接近的一对平均 RGB 差为 6.60/255 |

流程回归夹具仅在确认 S5 后用固定成功 RNG 绕过随机断刀，保证能检查 S6–S9；没有修改产品玩法。25 卡、底材、纹理及跨局截图均走实际渲染和卡牌预览路径。

## 性能与资源

与原 PR 头提交使用同一 Chrome、分辨率、M06/T07/S5_20、15,000 三角形、1 draw call 对照。每个版本 3 组、每组 30 帧；GPU 通过 `EXT_disjoint_timer_query_webgl2` 查询，CPU+同步回读通过 readPixels 测量。

| 指标（三组中位数再取中位数） | 原版本 | 本轮 |
| --- | ---: | ---: |
| GPU / 帧 | 0.07552 ms | 0.07181 ms |
| CPU+同步回读 / 帧 | 1.90 ms | 1.70 ms |
| programs | 10 | 10 |
| textures（包含前序缓存） | 60 | 65 |
| draw calls | 1 | 1 |

本机测量未见性能回退，不将这些数据外推到手机硬件。新增采样替代旧的逐像素 FBM 和按卡图案分支；不增加 draw call 或后处理。每个活材质持有一张 **128 KiB** 无 mipmap 的光学图，换卡复用分配；随材质释放。五张额外存活纹理约 640 KiB。并行预览按材质隔离，不会相互覆盖纹理内容。

## 自动检查与复现

`npm test`：**27/27 通过**，包括确定性、25 卡差异、S3 种子隔离、稀有模板可达、预览资源隔离及释放，以及原有存档/HTTP/阶段归属回归。

`npm run ai:index` 已执行。`npm run check` 的原始基线有 **41** 个历史缺失引用；生成 dependencies.json 后剩 **40** 个（主要是仓库未提交的 probe 脚本和 archive 文档）。逐项对比未新增缺失引用；语法与本轮新增相对导入通过。完整的静态检查因此仍未全绿，不能写成“全部检查通过”。

仓库根目录运行：

```text
node tools/s5-optical-acceptance.mjs after --full
node tools/s5-optical-acceptance.mjs before --full --bench
node tools/s5-optical-acceptance.mjs after --full --bench
```

提前启动两个版本的 `game/serve.cjs`；可设置 `FORGE_URL`、`FORGE_BEFORE_URL`、`S5_QA_OUT`、`CHROME_PATH`、`PLAYWRIGHT_MODULE`。真实运行 JSON、性能 JSON 和像素审查随截图一同保存在验证目录。
