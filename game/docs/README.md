# 文档目录

当前文档按实际源码和命令整理，更新日期：2026-10-24。

**顶层只有 5 篇**，每篇负责一个稳定主题；历史过程材料归档到 `archive/`，只读、不再维护。

| 文档 | 用途 |
| --- | --- |
| [项目说明](../README.md) | 双击开玩、存档和启动命令 |
| [架构](ARCHITECTURE.md) | 分层、渲染、存档边界，以及**按功能定位源码**的速查表 |
| [设计规范与决策](DESIGN.md) | 设计令牌、视觉方向、21 条改造决策、S5 配色、UI/UX 打磨、平衡参数 |
| [验收](VALIDATION.md) | 自动检查、人工清单、A01–A25 矩阵、存档迁移、未验证项 |
| [状态与交接](STATUS.md) | 当前可玩状态、能做什么、实机试玩记录、开发交接 |

## 工具产物（自动生成，不是手写文档）

| 文件 | 生成命令 |
| --- | --- |
| [源码索引](SOURCE_INDEX.md) | `npm run ai:index` |
| [依赖索引](dependencies.json) | `npm run ai:index` |

这两份是可随时重建的导航，**不是玩法规则真源**。

## 历史归档（只读）

| 目录 | 内容 |
| --- | --- |
| [archive/](archive/) | 早期交接全文、原始改造任务书、历史审计与验证快照 |

归档中未随包提供的报告与截图不会伪造补齐。当前代码、测试与本轮结果优先。

## 验证脚本

仍在使用的可复现脚本位于 `rework/2026-10-24/`：

```
verify-rework.mjs      A01–A25 永久回归断言
bench-logic.mjs        纯逻辑耗时采样
bench-browser.mjs      浏览器实测采样（⚠ 先确认没有游戏/编译在抢 CPU）
audit-mobile.mjs       4 视口 × 5 页面自动审计
playtest.mjs           走完一局逐页检查
_p3probe.mjs           P3：阶段像素采样（强制重绘 + 相位自检 + 编译等待）
_p3time.mjs            P3：S2 钢液流动时序验证（不强制重绘，验证时钟真的在走）
_p3diff.mjs            P3：before/after 对比表
_p3look.mjs            P3.5：小图视觉核验（DPR3 + 自然比例，单张 8–35KB）
_p3relief.mjs          P3.5：relief 单变量扫描（定位编织纹/网格纹阈值）
_p3sweep.mjs           P3.5：金属度 × 粗糙度幅度双杠杆扫描
_p3alias.mjs           P3.5：采样假象判决（方形 vs 自然比例）
_p3iso.mjs / _p3iso2.mjs  P3.5：逐层隔离开关
_p3s2.mjs              P3.6：S2 弧形条纹逐层隔离（⚠ 其中的 stripeShare 指标无效，只看图）
_s4glow.mjs            P3.6：S4 光晕档位/强度扫描（扫 uCardTier）
_glslerr.mjs           P3.6：抓 GLSL 真实编译错误（pageerror 为空时必用）
_verify_style.mjs      数字字体 / 触控热区验收
_verify_three.mjs      界面精简三项验收
_cover.mjs             numeric.css 覆盖完整性机器比对
_audit.mjs             六页面度量审查
```

材质阶段进度：`MATERIAL_PLAN.md`（方案）→ `P2_DELIVERY.md` → `P3_DELIVERY.md` → `P3.5_DELIVERY.md` → `P3.6_DELIVERY.md`。

> 已废弃：`_p3base.mjs` 产出的 `shots/p3/_rows.json` 曾因停帧读到旧缓冲，
> 导致 S1/S2 统计量全等。**不要引用它的数字**，改用 `_p3probe.mjs`。
>
> 同样废弃：`_p3facet.mjs`（`finally` 里对空数组 `reduce` 会抛错，掩盖真实异常），
> 已由 `_p3sweep.mjs` 取代。

> ⚠ **视觉验收必须用 `_p3look.mjs`，不要自己写截图脚本。**
> 本项（S1/S3）的视觉判断曾因截图装置三个独立缺陷全部反错：
> DPR=1 上采样、强制正方形（细长刀型产生摩尔纹）、读取陈旧帧。
> 详见 `P3.5_DELIVERY.md` 第 4 节。

> ⚠ **`pageerror` 为空不等于没错误。**
> GLSL 编译失败是**静默**的：外观表现为整阶段 `empty frame`，
> 而 `pageerror` 依然为空。遇到画布空白、但 JS 无报错时，
> 第一件事是跑 `_glslerr.mjs` 拿原始 info log。
>
> ⚠ **GLSL 模板字符串里的注释一律用纯 ASCII。**
> 注释里用 `═══ ★★` 这类装饰字符曾导致换行丢失，
> 下一行代码被 `//` 吞掉 → 变量 undeclared → 整支片元编译失败。
>
> ⚠ **跑 `bench-browser.mjs` 前先 `Get-Process` 看 CPU。**
> 游戏在后台时 warm p50 会从 25ms 虚高到 68ms，看起来像严重回退。
