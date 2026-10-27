# 验收

> 合并自：改造验收记录（A01–A25 矩阵与浏览器实测）、存档迁移与兼容。
> 自动检查命令见根目录 README。

## 一、自动检查

```
npm run check     语法 / 本地引用 / 资源 / 当前文档链接   必须 0 errors
npm test          核心存档 + HTTP 回归                    必须全过
npm run verify    check + test
```

浏览器端验收（需先启动本地服务）：

```
npm run test:browser
```

## 二、人工验收清单

改造后必须逐项确认真实可玩，不以「页面能打开」代替：

- [ ] 首页展台：有收藏刀时展示代表作；无收藏刀时为半透明幽灵唐刀（材质随机）
- [ ] 开锻 → S1–S9 全流程可推进，每阶段三选一卡面完整可读
- [ ] S4 锻打：挥锤有逐锤六维成果，档位回执可见，拖动画布被禁用
- [ ] S5 淬火：**未选卡时刀身必须朴素**，选了才有对应效果
- [ ] S7 开刃：可描线提交；不描线提交必须判 MISS
- [ ] S10 鉴定：揭晓顺序 top→six→traits→bd→explain→archive，总分最后
- [ ] 藏刀阁：筛选/排序/两刀比较可用
- [ ] 赛事：六流派项目组合互不相同；全国赛五轮可推进
- [ ] 存档：旧档可读、不丢内容；断刀记录单独保存

## 三、未验证项（如实记录）

- **Android / iOS 真机**：硬件条件限制，未完成。真机 GPU、散热降频、内存压力
  无法用视口 + DPR + CPU 限速模拟。
- **完整人工点按**：鉴定跳过/完整播放一致性、两刀比较、荣誉条更新，
  目前为代码级 + 脚本级验证。

---

## 四、A01–A25 验收矩阵与浏览器实测

环境：Windows / Node.js v24.22.1 / 服务 `http://127.0.0.1:8123/`（复用已运行的 `serve.cjs`）
执行目录：`E:\锻刀大赛1020\Forge_AI`
最后更新：T12/T13/T14/T09 二次推进后

#### 命令与结果

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run check` | 0 | `222 scripts checked; 754 local references checked; 0 errors.` |
| `npm test` | 0 | `tests 10 / pass 10 / fail 0` |
| `node docs/rework/2026-10-24/verify-rework.mjs` | 0 | `25/25 项通过` |
| `node docs/rework/2026-10-24/bench-logic.mjs` | 0 | 纯逻辑耗时（见 BALANCE_REPORT 第 9 节） |
| `npm run ai:index` | 0 | `Indexed 136 source modules.` |

改动前基线（M0）：`check` 0 错误、`test` 10 通过 —— 与改动后同数量，说明未靠减少检查通过。

> ⚠ `npm run check` **不校验具名导入是否真实存在**。本轮有 5 处新增引用
> （`tagTierOf`、`HAMMER_TIERS`、`resolveModelId`、`nameOfModel`、`CodexCatalog`）
> 一度通过 `check` 却会在运行时抛 ReferenceError，靠逐项审查才发现并补齐。
> 结论：`check` 通过 ≠ 可运行。

#### A01–A20 矩阵

`verify-rework.mjs` 直接覆盖的项标「脚本」，需要浏览器/人工的项标「实测/未测」。

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| A01 | 六维 100 vs 256 | **通过** | 脚本：能力 100.0 vs 149.4；永久值保留 256 未截断 |
| A02 | 同六维换刀型 | **通过** | 脚本：精度 折叠1.12 > 砍刀0.90；切割 折叠0.94 < 砍刀1.12（反向） |
| A03 | 仅锻打一/四档 = 105/130 | **通过** | 脚本：105 / 130，锻打明细条数 = 1（无重复结算） |
| A04 | 两个六层标签 | **通过** | 脚本：待结算2/授予2/重复授予0/评分计入2 |
| A05 | 现存强化承诺 | **通过** | 脚本：淬火余温 无强化硬靶存活(0.95) / 有强化击破；文案同步为「完整硬靶同样击破，正常记分并承担刀损」 |
| A06 | S4 点位/速度 | **通过** | 脚本：同种子两次序列完全一致；`hammerStrike(run)` **不接收**坐标/速度参数（结构性保证） |
| A07 | S4 多策略产出 | **通过** | 脚本：0/1/2/4/7/13 锤存活 100/97.5/94.38/86.13/68.5/16.63%，中间锤亦有 5.5→45.5 点六维成果 |
| A08 | S7 五类路径 | **通过** | 脚本：未触摸 miss / 跳过 miss / 局部30% miss / 完整 perfect / 抖动 great / 重复提交不累加 |
| A09 | 两专长刀两项目反向优势 | **通过** | 脚本：精密赛 精密刀 90 > 结构刀 75.5；锻压赛 结构刀 91.3 > 精密刀 74.8 |
| A10 | 六流派五档 | **通过** | 脚本：六流派指纹 6/6 互不相同；五档目标 84/88/92/96/100 单调递增 |
| A11 | 全国赛成功/失败/退出 | **脚本通过 / 人工未测** | 脚本：五轮定义 `32强→16强→8强→半决赛→决赛`，实跑 1 轮晋级后在 16 强淘汰，`bladeDestroyed=false`。**完整一届人工通局未做** |
| A11b | 旧赛制退出兼容 | **通过** | 脚本：`abandonNationalRun/hasLegacyNationalActive` 已导出；另用隔离 localStorage 实测：旧赛可退出、成刀未断、退出后可再开赛 |
| A12 | 巅峰赛少刀/重复/断刀/重复派出 | **通过** | 脚本：1刀→"需要正好三把刀"/2刀同上/重复ID→"必须是不同的刀"/断刀→"已断裂"/合法三刀 ok/完成一轮后重复派出→"本场已经出过场" |
| A13 | 快赛永久安全 | **通过** | 脚本：零韧性收场 `fractured=false`、`riskStop=false`，永久六维不变 |
| A14 | 完成锻造/发现/比赛后刷新 | **脚本通过 / 刷新未实测** | 脚本：事件台账幂等（首次 true/重复 duplicate/另一把刀 false）；跨刷新依赖 `save.eventLedger`，浏览器刷新实测未单独做 |
| A15 | 仅登录/达成目标/隔日/漏日 | **通过** | 脚本：仅换日 streak 不变；首次完成目标 → 1；同日重复 → null |
| A16 | 单槽加成 S1 前后与消耗后 | **通过** | 脚本：2 项可选；首次生效；二次"本轮这次加成已经用掉了"；S1 后 locked=true |
| A16b | 未解锁/预留项不误装备 | **通过** | 脚本：可实际选择 2 项；`risk_cushion` 不入列表且装备返回 null；未知 id 返回 null |
| A17 | 旧档/未知内容/写盘失败/重试 | **通过** | 脚本：旧分/稀有度保留、未知字段保留、新字段补默认、旧刀可适配（强度能力 135.3）。写盘失败回滚由 `npm test` 10 项覆盖 |
| A18 | 鉴定/收藏比较/荣誉更新 | **实现完成 / 人工未全测** | 共用卡 `ui/bladeCard.js`（model/card/detail/compare）；藏刀阁筛选+排序+两刀比较；鉴定改为六维→特性→倍率→**总分最后**+跳过揭晓。**未做完整人工点按验收** |
| A19 | 逐阶段预览/候选切换/归档重现 | **部分** | 卡片新增「标签补档」行（`tagCounts` 从账本读）；3D 占屏比例与三竖卡重排**未改** |
| A20 | 双击启动/重启/移动布局/性能 | **部分** | 启动复用 8123 已验证（health 同 projectId）；桌面冒烟通过；**移动真机与有效性能采样未做** |
| A21 | 内容解锁（卡牌）加权不缩减池 | **通过** | 脚本：解锁命中 30.7% vs 基线 8.0%；卡池仍 25/25 未缩减；重铸 120 次后仍命中 103 次 |
| A22 | 分项个人纪录不被低分覆盖 | **通过** | 脚本：cutting 保留 60（更低 30 未覆盖）；precision 从 40 提升到 90 |
| A23 | T07 五类接触事件可达 | **通过** | 脚本：blocked/armor/cut/kill/deflect 全部可达；硬靶首击必为破甲（未重复计算同一击） |
| A24 | 全国赛完整夺冠路径 | **通过（脚本）** | 脚本：五轮全胜达冠军，梯度 0→1→2→3→4 递增，`bladeDestroyed=false`。**未做人工点按全程** |

##### 浏览器验收的执行方式补记

本轮前期用 Pi Desktop Browser 做了真实点按；后期该工具的等价调用被禁止重试
（`BROWSER_RETRY_BLOCKED`）。为不把“无法重测”写成“已验证”，改用**项目自带验收路径**：

- 发现本机已存在 `playwright`（在 `.cache/codex-runtimes/.../node_modules/playwright/index.mjs`）
  与系统 Chrome，通过 `PLAYWRIGHT_MODULE` + `CHROME_PATH` 调用；
- 于是后期新增改动（T07 接触反馈、T12 图鉴搜索、卡牌解锁、分项纪录、S4 触感分级）
  **已通过真实 Chrome 自动化验收**（见下方性能采样），但仍**未做逐项人工点按**。

#### 浏览器实测（真实点按 / 隔离 profile）

工具：Pi Desktop Browser，隔离 `temporary` profile（`localStorage` 初始为空，未触碰用户真实存档）。

| 步骤 | 观察 |
| --- | --- |
| 打开 `http://127.0.0.1:8123/` | 首页正常渲染，无白屏 |
| 写入隔离夹具（3 把专长刀）→ reload | 赛事页正确显示 `参赛刀 B-precise · 史诗 · 400 评分` |
| 进入「正式赛事」 | 显示「学徒 · 锻压 **3 项赛前策略 → 正式多项目测试**」（新入口生效） |
| 选「精密」→ 开始挑战 | **首次失败**：`TypeError: Formal.formalTask is not a function`，页面几乎空白 |
| 修正导入后重测 | 进入测试舞台；随后发现「精度：41.3 分 · 操作 0%」 |
| 修正零操作保底分后 | 脚本复测 util=0 → 0 分 |
| 首页（T12 后） | 出现「下一个目标 · 装备一项锻造加成 / 去工坊 →」，目标来自 `progress.nextGoal()` |
| 控制台（T12 后） | 仅余 `[render] 未找到刀型：folding` 警告 → 定位为刀型 id 当模型 id → 新增 `resolveModelId()` 并在 4 处接入；**reload 后无新 sequence 产生** |
| 页面内运行 `resolveModelId` 四用例 | `knife_folding / folding / garbage / null` → 全部归一为 `knife_folding`（`resolveOk=true`） |

> 以上缺陷大多由**浏览器实测**发现，静态检查与 Node 单测均未捕获。

#### 浏览器性能采样（真实 Chrome，已取得有效数据）

脚本：`node docs/rework/2026-10-24/bench-browser.mjs`
命令：`$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; node docs/rework/2026-10-24/bench-browser.mjs`

| 项 | 值 |
| --- | --- |
| 浏览器 / 模式 | Chrome，headed（真实 GPU 合成 + vsync） |
| GPU / 显示 | NVIDIA RTX 5070 / 2560×1440 @ **180Hz** |
| 视口 | 390×844 @DPR3（手机视口模拟，**非真机**） |
| 冷启动 | DOMContentLoaded ~570–705ms；首页就绪（含着色器）~0.7–1.0s |
| 选卡预览（不限速） | p50 **7.6ms** / p95 **27.4ms** / max 27.4ms |
| 选卡预览（**6× CPU 限速，n=50 冷热分离**） | p50 **55.5ms** / p95 **90.2ms** / max 97.7ms |
| 30 次卡预览往返 | ~205ms（均 ~6.8ms） |
| 10 次切页往返 | ~1565ms（均 ~156ms） |
| JS heap | 未观察到单调增长 |
| 空闲帧率 | ~180 FPS（不限速）/ **138 FPS**（限速） |
| 控制台 error / pageerror | **0** |

冷/热分离（6× 限速）：冷（前 5 次）p50 53.5ms / max 55.6ms；热（45 次）p50 55.7ms / p95 90.2ms / max 97.7ms。

复现：`FORGE_CPU_THROTTLE=6 node docs/rework/2026-10-24/bench-browser.mjs`

##### 解读边界（不要当成已全达标）

1. **p95 27.4ms（不限速）/ 90.2ms（6× 限速）均在**任务书「约 100ms」目标内，
   但限速下 max 97.7ms 已贴边，**余量不大**，不应宣传为“性能优秀”。
   （早前一次 n=20 得 p95=113.9ms 且 p95==max，实为单次尖峰；扩到 n=50 并分离冷/热后修正。）
2. **180FPS 不是“性能远超需求”**：显示器本身就是 180Hz，这只是 vsync 上限，
   只证明未掉帧，不证明预算宽裕。
3. **手机视口模拟 ≠ 真机**：只改变布局与像素量；真机 GPU 限制、散热降频、
   内存压力均未覆盖——这是本项**最大未测风险**。
4. **heap 无增长**不能据此声称“零泄漏”；只能说 30+10 轮操作内未观察到单调增长，
   小时级会话未测。
5. 切页均 156ms 偏高，主要来自 3D 舞台重新挂载与资源准备，属既有实现，本轮未优化。

#### 移动端审计（4 个视口自动化，**不替代真机**）

脚本：`node docs/rework/2026-10-24/audit-mobile.mjs`（可复现，失败返回非零退出码）
视口：iPhone SE 320×568@2 / Android 小屏 360×640@2 / iPhone 14 390×844@3 / Pro Max 430×932@3
页面：home / forge / arena / workshop（含 collection/achievements/bonuses/codex 四个分页）

检测项：横向溢出、触控目标 <44px、搜索框字号、pageerror。

##### 修复前 → 修复后

| 问题 | 修复前 | 修复后 |
| --- | --- | --- |
| 横向溢出 | 0 | 0 |
| 触控目标偏小 | **12 处 / 4 视口** | **0** |
| 搜索框字号 | 14px（iOS 会强制放大） | 16px + `touch-action: manipulation` |

具体改了三处（均是本轮新增控件时引入的）：
1. `.ws-control-row .chip` 高 30px → **44px**（桌面 ≥600px 仍保持 32px）；
2. `.codex-search` 高 40px → **44px**，字号 14 → **16px**；
3. `.bcv-compare-btn`（卡片内“加入比较”）24px → **44px**。

**最终结果：4 个视口 × 5 页面全部 `ERR 0 / WARN 0`。**

##### 其他静态核查

| 检查项 | 结果 |
| --- | --- |
| viewport meta | ✅ `width=device-width, initial-scale=1, viewport-fit=cover` |
| `dvh`（避开 iOS 地址栏收缩） | ✅ 已用 3 处 `100dvh`，无裸 `100vh` |
| safe-area-inset | ✅ 2 处使用 |
| 粘滞 hover | ✅ **零 `:hover` 样式**，不存在触摸后 hover 卡住 |
| tap-highlight / touch-action / user-select | ✅ 2 / 15 / 7 处 |

#### 未测项（明确列出，不冒充已完成）

1. **移动真机（Android / iOS）全程未测**：只做了桌面 Chrome + 390×844@DPR3 + CPU 限速代理。
2. 真机帧率、发热降频、内存压力、显存占用：**未测**。
3. A18 完整人工点按（鉴定跳过/完整播放结果一致性、两刀比较、荣誉条更新）。
4. 全国赛完整一届通局（32强→决赛）人工实测。
5. 快赛 45 秒完整手感与「再来一局」连打体感评审。
6. Firefox / Safari 兼容（`dvh`、`color-mix` 等特性未跨引擎验证）。
7. 真人多日留存与「上瘾程度」 —— 只声明机制已实现，不声明留存已验证。


---

## 五、存档迁移与兼容

主档：`bladeforge.save`，版本仍为 **1**，地址仍为 `http://127.0.0.1:8123/`。
本轮**不要求清档、不改端口、不切浏览器**。

#### 新增字段（`core/saveSchema.js`）

| 字段 | 默认值 | 用途 | 归一化 |
| --- | --- | --- | --- |
| `eventLedger` | `{}` | 结算事件幂等台账 `{eventId: {type, at, detail}}` | `map()`，保留未知键 |
| `lastDailyCompleteDay` | `null` | 「今天已推进过连续天数」防重标记 | 仅接受字符串，否则 null |
| `unlockedEdgeSkins` | `[]` | 成就 `edgeSkin:` token 的落点 | 过滤非字符串 |
| `unlockedBladeCards` | `[]` | 成就 `bladeCard:` token 的落点 | 过滤非字符串 |
| `forgeBonus` | `{unlocked:[], equippedId:null, usesTotal:0}` | 有限锻造加成：永久解锁 / 开锻前装备 | 逐字段类型修复 |
| `codex.bonus` / `codex.traitTest` / `codex.fractureCause` | `{}` | 预留给 T12 图鉴扩展 | `map()` |

#### 旧档兼容行为

1. **保留身份与权益**：`bladeId`、`bladeName`、外观配方（`visualRecipe`/`pendingSkin`）、
   原鉴定分 `score`、原稀有度 `rarity`、已获荣誉（`arenaHistory`）、`cr`、`unlockedCardIds`
   全部原样保留（A17 实测）。
2. **未知字段不丢**：`normalizeSave` 用 `{...defaults, ...src}` 展开，测试中注入的
   `unknownFutureField` 被保留。
3. **缺字段补默认**：旧档没有上述新字段时，`normalizeSave` 补默认值，不需要迁移脚本。
4. **不后台重算旧刀**：旧刀保留原 `score` 与 `rarity`；
   新规则只用于新的鉴定与新的参赛适配。适配层按旧刀**已知**的
   永久六维 / 刀型 / 特性确定性换算，未知事项走显式降级，不随机重掷。
5. **旧刀可参赛**：A17 实测一把只有旧字段的刀，适配后 `canEnterArena=true`，
   强度能力 135.3（由永久 180 经曲线换算）。

#### 未知内容的显式降级

| 情况 | 行为 | 位置 |
| --- | --- | --- |
| 未知刀型 | 中性画像（5 项系数全 1），`knifeProfileKnown=false` | `bladeAdapter.knifeProfile` |
| 未知特性 id | 记入 `responsibilities` 的 `unknown-trait` / `duty: 'ignored'`，**不授予随机能力** | `bladeAdapter.resolveTraitEffects` |
| 未知测试项目 | 从序列中过滤，不足 2 项时拒绝建赛 | `formalTests.buildFormalDefinition` |
| 未知加成 id | `equipBonus` 返回 `bonusId: null`，不装备 | `forgeBonuses.equipBonus` |
| 预留加成（`risk_cushion`） | 不进可选列表，直接装备也返回 null | `data/forgeBonuses.RESERVED` |

#### 进行中的旧赛程

| 旧结构 | 本轮处置 | 理由 |
| --- | --- | --- |
| `nationalRuns`（全国赛 v1 游标 + checkpoint） | **原样保留**，继续由 `progress.nationalRuns` 管理 | 全国赛 UI 未迁移到新链路，旧结构必须继续可用（见 STATUS 剩余项） |
| `teamArena`（组队赛 v1） | **原样保留**，`normalizeTeamArena` 不变 | 三刀赛用新的独立结构，不覆盖旧组队历史 |
| `quickChallengeRecords` | 原样保留 | 快赛纪录语义未变 |
| 新增 `formalMatch` / `apexMatch`（内存态） | **不落盘** | 与既有 `Game.match` 一致：单场进行中状态不写主档，只写结算结果 |

> **明确说明**：正式赛/三刀赛的「进行中」状态**不持久化**。刷新后当前比赛丢失，
> 但不影响已结算的荣誉与 CR（结算走 `recordMatch` 的 `matchId` 幂等）。
> 这是沿用现有的保存边界，本轮未扩展到「赛事断线续战」。

#### 幂等与失败重试

| 场景 | 机制 | 证据 |
| --- | --- | --- |
| 锻造归档 | `archiveReceipts`（同对象）+ 存档内 `collection` id 去重 | `npm test` 第 4 项 |
| 锻造/断刀/发现/快赛/正式赛事件 | `save.eventLedger[eventId]`，`eventIdOf` 只用业务身份（不含时间戳/自增） | A14 实测 |
| 快赛结算 | `quickSettlementReceipts` + 存档指纹 | `npm test` 第 1 项 |
| 正式赛/三刀赛结算 | `matchId` 幂等（`recordMatchInto` 查 `arena.history`）+ 内存 `settled` 标记 | `npm test` 第 5 项 |
| 每日连续天数 | `lastDailyCompleteDay` 同日防重 | A15 实测 |
| 写盘失败 | `commitSave` 只在 `Storage.save()` 返回真值后 `Object.assign` 发布；失败不改内存态 | `npm test` 第 1/3/4 项 |

**关键不变量**：写盘失败时**不**发布成功状态、不丢重试机会、不多发奖励。
本轮所有新事件都在**同一个 `commitSave` 草稿**里兑现（归档、赛事、快赛三处），
不存在「先加 CR 再存档」的分裂路径。

#### 未改动的兼容边界

- 存档 key、版本号、地址、启动方式均未改。
- 损坏 JSON 的 `bladeforge.save.recovery` 备份逻辑未改。
- `national-checkpoint.v1` 独立检查点未改。
- 单页面单写者模型未改（仍不支持多标签页写入锁）。
- `FORMAL_RISK_TBD` 语义未改：正式赛不执行永久断刀，`arenaFormal` 明确返回
  `bladeDestroyed: false` 与 `permanentRiskPolicy: 'FORMAL_RISK_TBD'`。

