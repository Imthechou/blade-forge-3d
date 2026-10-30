# 《锻刀大赛》持续自主开发｜唯一任务队列与交接状态

> 此文件位于工作分支 `feat/blade-collection-growth-v34-20261030`，配合 Draft [PR #32](https://github.com/Imthechou/blade-forge-3d/pull/32)。每轮先读此文件和 `game/AGENTS.md`，读取真实最新 SHA/CI/PR 后再工作。**不得自动合并 main、不得修改凭证或安全权限**。
>
> 最后人工接管：2026-10-31（Asia/Tokyo）；上次检查的基线 HEAD：`faefa0b2a307bcf5fe966cd93b41e5502187dc18`。文件建立这次提交新增了 CI P0 修复，最新 HEAD 请以 GitHub 为准。
> 自动化任务：`锻刀大赛自主开发`，ID `6ae4de2d70e48191bea1116346c171c1`；从 2026-11-01 起每日约 08:00 Asia/Tokyo（flexible）。**存在即复用，不得重复创建**。任务仅触发下轮对话，并不保证在任意运行环境拥有 GitHub 写入/浏览器权限；逐轮必须检查。

## 当前状态

- **PR：** #32 open Draft；main 尚未合并 V3.4。沿用 Five-Screen + Nine-stage ledger / original Three.js-PBR/GLB shader/caches/saves。改动小步提交同一 PR 分支。
- **上一可用 SHA：** `faefa0b2`，GitHub Actions 8 项中 7 项 PASS，`Whole-game mobile UX acceptance` FAIL，运行 [#41102747136](https://github.com/Imthechou/blade-forge-3d/actions/runs/41102747136)；`game/tools/unified-ux-acceptance.mjs:54` 在 Node 作用域误写 `innerWidth` 导致 ReferenceError。其他 7 项包括 S1–S9 材质/Playwright、iPhone、WebGL、赛事、P0 视觉成功。**不可把这称作 8/8。**
- **本轮修复：** 将 Node 范围检查中的 `innerWidth` 换成经真实 `page.viewportSize` 传入的当前测试宽度 `width`，保留原 `44px` 尺寸、五按钮数量和左右边界断言，绝不降低阈值。此项提交后**待新 SHA 的完整 CI 实际完成**。
- **已实现待细查：** S4 limited copy-on-write knife edge shaping、PNG 收藏卡 1080×1520（720×960 真实 PBR 截图）、透明图库斜向展陈、藏刀详情 3D 轻倾角、五屏收藏经济和单刀磨合；所有商用品质/实体手机体验须以截图及硬件验收为准。
- **独立设备局限：** CI 的 Playwright Chromium/SwiftShader 是“真浏览器+软件 WebGL”，不是实体手机；不能宣称触觉/散热/真实 GPU FPS 已验证。

## 按优先级执行（任务唯一标识，按最新证据更新）

| ID | 优先级 | 状态 | 任务和严格验收条件 | 连续失败数 |
|---|---|---|---|---:|
| BF-P0-01 | P0 | **已修复，待验收** | 修复 Actions 全游戏 UX Node 变量 `innerWidth`；最新 SHA 的全游戏 UX 320/375px、导出 PNG、五个按钮尺寸须 PASS，并检查 Artifact | 0 |
| BF-P0-02 | P0 | 待执行 | 核对最新 SHA 八项 Actions 均 PASS，读日志/真实画面。失败不得仅复用旧 SHA 的成功结果；逐图审查截图，若卡面刀具偏小/失焦需修正并重新跑 | 0 |
| BF-P1-03 | P1 | 待执行 | 商业级收藏卡构图与不同刀型材质保真；至少对 3 种刀型/不同底材，核对高清 PNG 截图、字层次、刀体可见性、旧数据兼容；不加常驻 WebGL | 0 |
| BF-P1-04 | P1 | 待执行 | S4 真形变效果的可感知性和一局内手感：对比 0/10/20 次落锤图片，检查刀刃变化、PBR 不受损、缓存释放、手机峰值运行耗时；收益有限则优化反馈而非无故扩大几何量 | 0 |
| BF-P1-05 | P1 | 待执行 | 五屏+赛事循环的实际乐趣/数值：验证稀有材料回收节奏、工坊直选、单刀磨合是否产生不同决策；加入防伪通过的随机种子/端到端测例，仅针对已证实的问题调整 | 0 |
| BF-P1-06 | P1 | 外部阻塞 | 真实 iOS/Android 中低端机 30/45/60fps、长局温升、触控及无障碍反馈；需要真实设备能力，不允许把 SwiftShader 结果当真机 | 0 |
| BF-P2-07 | P2 | 待执行 | 逐页删除冗余文字、审核弹窗焦点/回退、改良 320px 长文本与图鉴可读性；需实际截图支持 | 0 |

## 本轮记录

1. 接管 PR #32、V3.4 五屏设计文档和 `game/AGENTS.md`。
2. 读取上一最新失败运行 #41102747136，唯一失败处 ReferenceError: `innerWidth is not defined`；维持原严格点击热区标准，修复作用域变量。
3. 复核当前自动化任务：不存在《锻刀大赛》同名旧任务，创建唯一每日自动化（ID 见上）。
4. 将修复与本文件及 AGENTS 交接引用打包成一次 GitHub 原子提交，避免按文件依次提交反复取消并重排 8 条 Actions。
5. **测试结果待真实 Actions 更新；不预先记 PASS。**

## 每轮执行和停止规则

1. 检查能否读取及修改此仓库；无权则明确停止。读取本表、最新 PR、HEAD、Actions、设计约束，防止跨轮冲突或重复开发。
2. 每轮先处理失败 CI 和严重缺陷；小范围修改，优先可复用现有渲染、规则和材质。较大设计方向和架构重写要先咨询。
3. 验收 `cd game && npm run check && npm test`，相关功能还要实际 GitHub Actions/Playwright Chromium/WebGL、0 JS/HTTP/GLSL 错误、320/375px 真实截图、PNG 等产物检查；不运行则明确标注未验证。修改代码索引必要时运行 `npm run ai:index`。
4. 严格保证**同一 SHA**的通过结果；测试失败最多连续修复 3 次，再把失败数与证据写到任务表，转入下一安全任务。任何风险/授权阻塞不得绕过。
5. 尽量连续推进多项任务，但每轮控制 GitHub CI 成本、变更文件数与 GPU/云运行，不反复提交空内容，不合并或自动部署正式站。
6. 每轮结束：更新此文件的状态/优先级/失败次数/运行链接/当前 HEAD/明确下一任务（提交成功才算交接完成），在 PR #32 留下同内容摘要，不重复创建定时任务。每次自动化运行也要从本文件继续，而非重新规划全工程。
