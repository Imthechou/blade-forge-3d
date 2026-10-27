# 设计规范与决策

> 本文件是**视觉、工艺与平衡参数的唯一说明**。合并自四份历史文档：
> 改造决策记录、S5 配色与阶段感知优化、UI/UX 风格化打磨、平衡与参数报告。
> 历史过程叙述已收敛为结论与依据；改动前请先看「设计令牌」与「决策」两节。

## 一、设计令牌（唯一真源）

所有颜色、字号、间距、圆角、动效只允许来自 `css/tokens.css`。
页面样式只读令牌，**不允许**再声明 `:root`。

### 字体（两个真源，零下载）

| 令牌 | 用途 | 取值 |
| --- | --- | --- |
| `--font` | 中文与正文 | `PingFang SC` / `Microsoft YaHei` / system-ui |
| `--font-num` | 数字与英文 | `Bahnschrift`（Windows 自带，DIN 1451 血统）→ macOS 回落 `DIN Alternate` |

数字必须等宽：由 `css/numeric.css`（最后加载）统一补 `font-variant-numeric: tabular-nums`，
因为多处规则用 `font:` 简写，简写会把该属性重置为 `normal`。

> 维护约定：新增任何用 `var(--font-num)` 显示数字的规则，都要把选择器补进
> `css/numeric.css` 的清单，否则数字会静默退回比例宽（宽度随内容跳动）。
> 可用 `node docs/rework/2026-10-24/_cover.mjs` 做机器比对。

### 视觉方向

瓷白界面、深钢蓝文字、竞技青状态色、香槟金仅用于稀有度与奖励。
深色摄影棚只改变 CSS 背景，不改金属 HDR 与曝光。

### 编码冗余（无障碍要求）

信息不允许单靠颜色传达，必须至少双通道：

- 稀有度：颜色 + 符号（●/◆/★/✦/✶）+ foil 底
- 风险三档：颜色 + ▲/▲▲/▲▲▲
- 六维：颜色 + 数值 + 方向箭头

---

## 二、改造决策记录

记录本轮所有参数/公式/旧内容处置的**选择与依据**，并区分「可调初版」与「已定案」。

#### 规则版本号

| 版本常量 | 值 | 位置 | 变更影响 |
| --- | --- | --- | --- |
| `ADAPTER_VERSION` | `adapter-1` | `data/bladeEffects.js` | 成刀→测试能力适配 |
| `EFFECT_VERSION` | `effect-1` | `data/bladeEffects.js` | 特性效果结算表 |
| `TEST_SCORING_VERSION` | `test-score-1` | `core/testScoring.js` | 分项计分与合成 |
| `FORMAL_RULES_VERSION` | `formal-1` | `data/arena/formalTests.js` | 赛事定义（项目/权重/目标分） |

历史成刀不后台重算：旧刀保留原 `score`/`rarity`，新适配层按其已知永久属性确定性换算（A17）。

#### 决策 1：六维超过 100 之后如何继续生效

**问题**：`cutParams`/`arenaChallenge` 曾把六维硬截到 100，导致 100 与 256 能力完全相同（审计问题 1）。

**选择**：在 `data/balance.js` 引入饱和曲线

```
v ≤ 100        → v
v > 100        → 100 + 60 × (1 − e^(−(v−100)/90))
```

**为什么不选另外两种**：
- 纯线性：256 点 = 2.56 倍能力，靶具与对手全部失去难度；
- 维持硬截断：就是缺陷本身。

**性质**：在 100 处 C¹ 连续（两侧导数都为 1），不出现「跨过 100 突然变强/变弱」。
渐近上限 160，配合 `STAT_SOFT_CAP = 300` 的永久上限。

**实测**：100→100.0，124→115.9，233→145.1，256→149.4，300→153.5（A01）。

**归类**：可调初版。改 `TAU`/`SPAN` 必须复核 `TEST_REF` 并重跑验收。

#### 决策 2：刀型差异如何进入判定

**问题**：`arenaSlice.bladeView()` 只留 id/name/score/stats，刀型与特性全部丢失（审计问题 2）。

**选择**：`data/bladeEffects.KNIFE_PROFILES` 给 12 个真实刀型分别定义 5 项测试系数（0.88–1.12）。系数按刀的真实形状语义给：
- `cutting` 刃长/曲率；`precision` 操控与刚性；`strength` 厚度/脊线；`durability` 结构冗余；`extreme` 超载余量。

**明确不做**：不让所有差异变成同一个攻击半径或统一倍率（任务书 T01.4 禁止）。

**归类**：可调初版。

#### 决策 3：S4 锻打倍率只结算一次

**问题**：`appraise` 同时传入 HAMMER 特性与 `hammerTierReward`，`scoring` 两处各乘一次（审计问题 7）。实测一档得 110（应 105）、四档得 169（应 130）。

**选择**：`core/scoring.js` 在特性循环中跳过 `kind === 'HAMMER'`，锻打倍率**只**由 `HAMMER_TIER_REWARD` 唯一结算，且兜底也读同一张表。

**实测**：一档 105 / 四档 130，锻打明细条数 = 1（A03）。

#### 决策 4：取消「全局高阶特性每局 1 条」

**问题**：`traits.grant` 的全局限额让第二个六层标签静默进共鸣，而评分又按所有达档标签计算 → 待结算/授予/评分三套口径互相矛盾（审计问题 10）。

**选择**：删除全局限额；保留同 ID 去重，新增**同标签只取最高档**（`hasSameTagTrait`）。这是最新基线 §3.2 的唯一规则。

**实测**：两标签各六层 → 待结算 2 / 授予 2 / 重复授予 0 / 评分计入 2（A04）。

#### 决策 5：特性职责分层（哪些进赛场，哪些只给六维）

**问题**：改造前 LEGACY 特性只给六维，但代码没说明这是「职责划分」还是「漏实现」。

**选择**：在 `data/bladeEffects.js` 显式声明
- `TRAIT_TEST_MODS`：确有赛场行为的条目（基础标签按标签最高档结算一次、特殊标签、S4 锻打按 `HT_<tag>` 归一、Combo）；
- `LEGACY_TEST_MODS`：仅显式列出的 LEGACY 才有赛场效果；
- 其余 LEGACY → `NO_TEST_EFFECT`（`permanent-stats-only`），由 `bladeAdapter.resolveTraitEffects` 写入 `responsibilities`，UI 与鉴定解释读同一份。

**关键约束**：`testMods` 只表达赛场行为，**不得**再写六维增量 —— 六维在 `traits.grant` 时已写入永久 stats，否则参赛适配会第二次叠加同一收益。

**归类**：已定案（职责口径），具体系数可调。

#### 决策 6：S4 档位门槛重标 + 逐锤成果

**问题**：旧门槛 18/46/82/126 对应 2/6/13/30 锤；第 4 档需 30 锤，而 Risk 在第 18 锤就满 100，存活率约 0.00000836%（约 1197 万次一次）——事实死档。且未跨档的锤只加 Risk 不留收益（审计问题 8）。

**选择**：
1. 门槛重标为 12/30/54/82 → 需要 2/4/7/13 锤；
2. 新增 `HAMMER_GAIN_SCALE = 0.55`：每锤把 `gain × 0.55` 点按方向向量写进六维 —— **逐锤即时兑现**，档位只负责身份与评分倍率；
3. `HAMMER_TIER_REWARD.statDelta` 全部改为 `{}`，避免与逐锤成果重复计算；
4. 九个方向各给独立分配向量（`HAMMER_DIRECTION_VECTORS`），不再九名一共用同一向量。

**实测（800 种子/档）**：

| 锤数 | 存活率 | 平均档位 | 平均六维成果 |
| --- | --- | --- | --- |
| 0 | 100% | 0 | 0 |
| 1 | 97.5% | 0 | 5.5 |
| 2 | 94.38% | 1 | 10.6 |
| 4 | 86.13% | 2 | 19.5 |
| 7 | 68.5% | 3 | 30.4 |
| 13 | 16.63% | 4 | 45.5 |

**归类**：可调初版（任务书允许先落可运行初版）。

#### 决策 7：S7 评价不再用「预填 0.5 的等长数组」

**问题**：UI 把整条轨迹预填 0.5，`accuracy()` 只比较等长数组 → 未画的采样点也算分，不操作也有 ~50% 概率 GOOD。题目是与刀型无关的随机正弦（审计问题 9）。

**选择**：
1. `data/bladeEffects.EDGE_SHAPES` 按 12 刀型给刃线形状（curve/recurve/tip/belly/wave），seed 只提供 <12% 的确定性微扰；
2. `core/edge.js` 重写：`normalizeSamples` 显式区分「未绘制/已绘制」并在稀疏采样时插值，但**空洞比例**计入完成度；
3. 三项评价：贴合 55% / 完成 30% / 稳定 15%；
4. **完成度硬门槛**：`coverage < EDGE_COVERAGE_MIN(0.55)` 时质量封顶在 GOOD 门槛以下；
5. 未触摸 / 主动跳过 → 强制 MISS；重复提交取最优差值，不累加。

**实测**：未触摸 miss(0) / 跳过 miss(0) / 局部完美30% miss(0.34) / 完整稳定 perfect(1.0) / 完整抖动 great(0.715) / 稀疏1/3 perfect(0.946)（A08）。

**归类**：完成度门槛与三项权重为可调初版。

#### 决策 8：正式赛合成权重

**问题**：旧主入口是三次 35 秒切割 + 逐局 buff，六流派同刀同种子拿到相同目标分与靶具指纹（审计问题 4）；`arenaSuite` 的 aggregation 为空。

**选择**：
- 赛事定义集中在 `data/arena/formalTests.js`，每流派有不同**项目组合**：
  锻压 强度+耐久 / 锋刃 切割+耐久 / 精密 精度+切割 / 淬彩 耐久+极限 / 复合 切割+强度+精度 / 过载 强度+极限；
- 合成 = Σ(项目分 × 权重)，权重按流派给并归一；
- **明确不用**旧的 70/10/20 与 70:30 —— 那些是旧桥接口径，任务书要求不得直接沿用；
- 项目分 = `testScoreOfRatio(有效能力/参考值) × 操作利用率`。

**实测指纹**：6/6 互不相同（A10）。

**归类**：权重与目标分（84/88/92/96/100）为可调初版。

> **修正记录**：初版合成为 `ratioScore × (0.35 + 0.65 × utilization)`，浏览器实测「零操作仍得 41.3 分」。
> 已改为 `ratioScore × utilization`，零操作 = 0 分（A09 复测）。

#### 决策 9：三种金属/靶具层

**问题**：旧 `MATERIALS` 只有 `hard` + 统一 progress + 金属层数，没拆破甲与生命（审计问题 3）。

**选择**：每材料给 `armor` / `health` / `damage` 三层，结算顺序固定「破甲 → 生命 → 反作用损伤」，同击只算一次：
- 破甲阶段由**强度**主导（`strengthDrive = 0.55 + 0.45 × strength/100`）；
- 生命阶段由**锋利**主导、工艺调节效率；
- 反作用损伤由**韧性**与**设计**降低，扣的是刀况。

`ARMOR_SCALE = 0.6`：在全值下硬靶会多出约两击、改变整体手感；0.6 让强度专长可感知而总击数接近改造前。

金属板升级为**金属管**（`tubular: true`），不只是改名：管壁破甲高、生命中等、反作用损伤最高。

**实测**：低强度木桩 3 击 / 高强度 2 击，反作用损伤 5.5 vs 2.0；软靶仍一击断。

**归类**：三层系数与 `ARMOR_SCALE` 为可调初版。

#### 决策 10：连胜倍率的唯一消费者

**问题**：`arenaSlice.finishRun` 无条件 `winStreak × 1.15`，而 buff 表 `artisansoul` 又声明 `winStreakMult: 1.15` 却从未被消费（审计问题 6 第三条）。

**选择**：连胜增长**只**由持有 `winStreakMult` 的 buff 驱动（`winStreakFactorOf`），没持有则恒为 1；上限 `WIN_STREAK_CAP = 1.32` 保留。

#### 决策 11：「狂热硬靶一刀必破」如何真正生效

**问题**：逻辑先把 power 设成 2，随后 `clamp(…, 0.78)` 压回 0.78 → 硬靶仍存活（审计问题 6 第一条）。

**选择**：必破在 clamp **之后**以 `power = max(power, 1)` 生效，并打 `guaranteedBreak` 标记；**不绕过**记分与刀损，照常走 progress/kills/score/addWear 全链路。

**实测**：无强化进度 0.95 存活 / 有强化击破（A05）。

#### 决策 12：连续天数改为真实行为驱动

**问题**：`rolloverDaily` 在换日时无条件 `dailyStreak += 1`，只登录也能推进「七日不辍」（审计问题 12）。

**选择**：`rolloverDaily` 只记录 `lastDailyDay` 与重置当日任务，**不再**改 streak；连续天数由 `events.bumpDailyStreak` 在**当日三个目标全完成**时推进，并用 `lastDailyCompleteDay` 防同日重复。旧档已得的 `dailyStreak` 不归零。

#### 决策 13：奖励 token 全部有处理器

**问题**：`unlockFromAchievement` 只处理 `title:`，`edgeSkin:七日` 被静默忽略。

**选择**：统一走 `events.applyUnlockToken`，支持 `title` / `edgeSkin` / `card` / `bladeCard`；未知类型记入 `unknown` 而不是消失（让「未实现」可见）。

#### 决策 14：有限锻造加成的交付范围

**选择**：只交两类（任务书 T11 明确允许）：
- `extra_reroll` 备料余裕 —— 一次免费重抽，不扣 CR，不绕过阶梯计数；
- `combo_insight` 匠人直觉 —— 一次组合线索（只给 hint，不泄露完整配方）。

两者 **默认解锁**：任务书要求「至少两项可实际选择」，若都上锁则新档只剩说明页。
理由：两者都属于设定允许的「信息/候选」类开局能力，不动数值。

**风险干预类（`risk_cushion`）明确不交付**：`data/forgeBonuses.RESERVED` 记录原因（与基础 Risk 曲线的关系、上限、次数未定义），不出现在可选列表，直接装备也返回 null。

#### 决策 15：旧内容处置（LEGACY 特性 / 旧入口 / 旧引擎）

| 旧内容 | 处置 | 理由 |
| --- | --- | --- |
| 卡池 218 张卡 | **全保留**，`unlockedCardIds` 不改语义 | 不拿走旧档已有内容 |
| 50 条 LEGACY 特性 | 保留 ID 与六维效果，标注 `NO_TEST_EFFECT` | 按职责分层，不按目录名批量删除 |
| 10 条隐藏 Combo | 保留，统一给赛场小额加成 | 每条一份，不重复 |
| `arenaSlice` 三局切割引擎 | **保留但不再充当正式单刀赛唯一形态** | 快速挑战/循环赛仍可用；旧 API 不批删 |
| `arenaSuite` / `arenaPerformance` | 保留原状 | 未被新链路调用，未删除以免破坏历史与诊断 |
| `ui/pages/arena.js` 旧单刀/组队/全国赛渲染 | 保留；新增正式赛/三刀赛/**新全国赛**分支优先 | 旧入口在无新赛时仍可打开；旧全国赛提供退出归档路径 |
| 旧全国赛 `nationalRuns` 进行中游标 | **保留但提供退出**：`progress.abandonNationalRun()` | 不伪造成绩、不扣已得奖励、不断刀；避免旧档被新链路永久卡死 |
| `FORMAL_RISK_TBD` | **语义不变** | 未定政策不得猜成已定 |

#### 决策 16：图鉴分母与目录（T12）

**问题**：`codexTotal()` 是 `CARDS + COMBOS + KNIFE_TYPES + BRANCHES×GRADIENTS + 60` ——
最后那个 **写死的 60** 不对应任何真实内容集合；而 `material` / `finish` / `arena`
三个目录**从来没有写入过**，于是完成度分母包含永远开不满的项目。

**选择**：新增 `data/codexCatalog.js` 作为图鉴唯一真源，10 个分类各自声明条目与线索，
分母由真实集合推导：**460 项**（刀型 12 / 材料 25 / 纹理 11 / 工艺 12 / 卡牌 218 /
标签 27 / 特性 115 / 组合 10 / 赛事 30；断刀记录为**事件型**，`total=null` 不计入百分比）。

**归档补齐**：`progress.archive` 依据 `pendingSkin` 写入 `material` 与 `finish`；
未发现项只给**线索**，已发现项给真实描述。

**归类**：目录结构已定案；线索文案可调。

#### 决策 17：共用收藏卡与鉴定揭晓顺序（T13）

**问题**：改造前每处各画一套卡片（藏刀阁缩略图+数值、鉴定页另一套排版、赛报再一套），
同一把刀在三处身份信息不一致；鉴定页把六维/特性放在**默认隐藏分页**里，
`play()` 的定时器把动画播给不可见节点，而总分在 600ms 就先亮——**先给结果再补来源**。

**选择**：
1. 新增 `ui/bladeCard.js`：`bladeCardModel()`（唯一展示模型，含赛事经历/荣誉）、
   `bladeCard()`（竖版卡面：刀具主视觉 + 名称/稀有度/评分/≤3 核心特性）、
   `bladeCardDetail()`（卡背：完整六维、特性职责、连携、赛事经历、工艺与风险）、
   `compareModels()`（两刀比较，突出项目专长，不只按总分）。
2. 藏刀阁改用共用卡 + 筛选/排序/两刀比较；详情改用卡背。
3. 鉴定主链全部放到概览页**可见**：六维 → 特性 → 倍率 → **总分在 1560ms 最后揭晓**；
   新增「跳过揭晓」，跳过与完整播放**归档结果相同**。

**归类**：已定案。

#### 决策 18：卡片标签补档提示（T14）

**问题**：卡片只给六维方向 + 风险，玩家看不出「这张卡会把哪个标签补到 2/4/6 层」，
而 2/4/6 层正是特性与评分倍率的门槛（1.10 / 1.22 / 1.40）。

**选择**：`components.decisionCard` 新增 `tagCounts` 参数，卡面直接写
「精密 3→4 层 · 补到强化」或「再 1 层升档」，升档用强调色。
层数从账本 `Tags.counts(ledger)` 读取（唯一真源），UI 不自行累计。
**只给层数与档名，不泄露隐藏六维精确值。**

**归类**：文案呈现可调；`tagTierOf` 阈值不动。

#### 决策 19：S4 HUD 门槛与逐锤信息（T04 补全）

**问题**：门槛已从 126 重标为 82，但锻造页进度条仍写死 `h.progress / 126` ——
进度条到 65% 就再也不动；同时 HUD 没有 T04.4 要求的逐锤收益、下一锤概率与收手保留内容。

**选择**：分母改为 `HAMMER_TIERS` 末档 `need`；HUD 补「已得六维成果 / 已落锤数 /
下一锤 Risk 与单次断裂概率 / 现在收手保留的档位与倍率」。

**归类**：已定案。

#### 决策 20：刀型 id 与模型 id 的归一（T01 兼容）

**问题**：存档里有两个不同字段 —— `knifeTypeId`（如 `folding`）与
`knifeType`（模型 id，如 `knife_folding`）。旧档/手改档可能把刀型 id 写进 `knifeType`，
而渲染层只认模型 id，于是控制台报 `[render] 未找到刀型：folding` 且卡面主视觉空白。

**选择**：`data/knifeTypes.resolveModelId(source, knifeTypeIdHint)` 作为唯一解析入口 ——
能当模型 id 就用；否则回落到该刀型自己的 `modelId`；都拿不到返回 `null` 走降级展示。
在 `game.showRecord`、`workshop.inspect`、`arena.teamBladeArt`、`bladeCardModel` 四处接入；
`appraise.knifeTypeName` 改用 `nameOfModel()`，不再直接显示英文槽位名。

**性质**：**确定性修正**，不猜测、不随机重掷旧刀。

#### 决策 21：全国赛迁移与旧赛退出（T09 补全）

**问题**：`arenaFormal` 已支持 `tier:'national'`，但 UI 入口仍走旧 `nationalRuns`（三局切割）；
且旧档若有 `nationalRuns.active`，`startNationalRun` 会永远返回 `NATIONAL_RUN_ACTIVE`，
新链路又无退出入口 → 玩家被**永久卡住**。

**选择**：
1. `core/arenaFormal` 新增 `createNationalMatch / nationalCurrentRound / nationalStartRound /
nationalSubmit / nationalAbandon / finishNational`，五轮 `32强→16强→8强→半决赛→决赛`，
每轮以 composite 三项真实测试+梯度递增，代表刀整届锁定。
2. `Game` 层新增 `startNationalMatch / nationalStartRound / nationalSubmitRound /
nationalAbandonRound / retryNationalSave`，结算走 `recordMatch('national')` 的 `matchId` 幂等。
3. `ui/pages/arena.js` 新增 `renderNationalMatch / renderNationalReport`，hub 入口改调
`Game.startNationalMatch`；旧赛进行中时提供「恢复旧赛制」与**「退出旧赛制，改用新赛制」**。
4. `progress.abandonNationalRun()` / `hasLegacyNationalActive()`：
   **不伪造成绩、不扣已得奖励、不断刀**，已完成轮次与奖励保留在 history。

**验证**：隔离 localStorage 实测 —— 旧赛可退出、成刀仍在 collection 且 `fractured=false`、
history 出现 `abandoned`、退出后可再开赛。

**归类**：已定案。

#### 仍未定案的政策（保持待定，未擅自补全）

1. **正式赛永久断刀概率曲线** —— `probabilityCurve: null`。`arenaFormal` 明确返回 `bladeDestroyed: false` 与 `permanentRiskPolicy: 'FORMAL_RISK_TBD'`，只用临时损伤。
2. **跨项目受损延续** —— `crossTestDamage: null`。
3. **极限测试收手细则** —— `withdrawalPolicy: null`。当前实现为「收手即结算、加压计临时损伤」，细则仍待定。
4. **整局锻造成功率整体平衡** —— 本轮只重标 S4 可调参数，未做全局平衡。


---

## 三、S5 配色与阶段感知

用户提出的三项：
1. S5 淬火配色偏艳，淬火效果不好
2. 切页 156ms 偏高（3D 重挂载），需优化
3. 锻造切阶段有预览，阶段切换感知不明显

---

#### 一、S5 淬火配色

##### 先说结论：这是「两个独立缺陷」，不是一个

| # | 缺陷 | 严重度 |
| --- | --- | --- |
| 1 | 11 套 S5 效果的 `cover`（颜色覆盖率）全部 **0.56–1.00**，实际是整刀通铺 | 偏艳的主因 |
| 2 | 中性工艺（F01 精抛光等 7 种）**没有调色板** → `stageTint` 全零 → shader 回落到满饱和 `rankHue` | 精抛光被染成紫刀 |

##### 实测证据（截图取证，非推测）

截图采集方式：真正推进到 **S5 阶段**再预览工艺（早前一次脚本停在 S1，拍到的是矿石，数据作废）。

**缺陷 2 的关键证据 —— 隔离对照：**

| 状态 | 画面 |
| --- | --- |
| A：S5 预览前（`finishId: null`，尚未淬火） | 刀身已呈强粉紫色 |
| B：预览 F01 精抛光后 | 变为暗蓝灰，粉紫明显减弱 |

→ 说明粉紫来自**上游 S1 材料 / S3 纹理叠加**，F01 只是把它压暗中和了；
而 F01 本身“只该提亮镜面”，却被 `rankHue` 染了色。

##### 修复

**修复 1：覆盖率收回规范内**（`src/render/v2/finishRecipe.js`）

本文件自己的规范（方案 §7）写的是「颜色覆盖起点 10–25%、局部上限 40%」，
但实际值全部超标。改为：

| 效果 | cover 旧 → 新 | ramp 旧 → 新 |
| --- | --- | --- |
| doppler | 0.74 → **0.38** | 1.00 → 0.70 |
| caseHardened | 0.88 → **0.40** | 0.95 → 0.72 |
| fade | 1.00 → **0.58** | 1.00 → 0.74 |
| fadeColdHot | 1.00 → **0.60** | 1.00 → 0.74 |
| auroraRibbon | 0.90 → **0.40** | 0.95 → 0.70 |
| iceFracture | 0.70 → **0.36** | 0.88 → 0.66 |
| midnightEmber | 0.62 → **0.34** | 0.86 → 0.64 |
| jadeRipple | 0.82 → **0.38** | 0.96 → 0.68 |
| rustPatina | 0.84 → **0.36** | 0.90 → 0.66 |
| obsidianPrism | 0.56 → **0.32** | 0.84 → 0.62 |
| abyssTide | 0.80 → **0.38** | 0.94 → 0.68 |

稀有模板同步下调；`film`（薄膜色散）也略微降低——它会把色散叠在已经很浓的色层上。

> `mode 3`（沿轴渐变，fade / fadeColdHot）保留较大覆盖率（0.58/0.60），
> 因为它们的语义本来就是“整刀一条色环”，压太小会读不出渐变。

**修复 2：中性工艺不再被 rankHue 染色**（`src/render/v2/programFamilies.js`）

```js
// 新增：没有调色板的表面处理类工艺（F01/F02/F03/F04/F09/F11/F12）
// 身份色设为刀身本色 —— 着色量非零（不回落 rankHue），但颜色就是钢
if (!op.palette && !op.noStageTint) {
  const baseCol = colorOf(u.uBladeBaseColor, '#9aa2ac');
  stageTint[4*3] = baseCol.r; stageTint[4*3+1] = baseCol.g; stageTint[4*3+2] = baseCol.b;
}
```

**修复 3：rankHue 降饱和 + 刃带着色减弱**

```glsl
// rankHue 原为满饱和 cos 波（S≈1），一回落就是彩漆
float rankLum = dot(rankHue, vec3(0.299, 0.587, 0.114));
rankHue = mix(vec3(rankLum), rankHue, 0.38);   // 降到 0.38
...
// 刃带着色：0.52→0.34，乘性压暗 0.34→0.22
col = col * (1.0 - 0.22 * wa) + accent * (0.34 * bandAccent * wa * m);
```

**修复 4：卡名与颜色不符（顺带修掉）**

`stageTint` 原来只在 `fp.hueShift != null` 时才写入，而 S5_20「蓝紫流界」的卡数据
`{strength, colorPhase, paletteShift:0.33}` **没有 hueShift** → stageTint 全零 →
回落 rankHue（rank 20 ≈ 115° 黄绿）→ **实测渲成绿色，与卡名相反**。
改为：只要 `op.palette` 存在就写入身份色，偏移优先 `hueShift`、其次 `paletteShift`。

##### 修复后定量测量

以截图取样（刀身竖条带，排除近白背景），计算高饱和像素占比：

| 卡 | 修复前 meanS / 高饱和% | 修复后 meanS / 高饱和% | Δ |
| --- | --- | --- | --- |
| S5_01 冷蓝幕层 | 0.520 / 90.4% | 0.482 / 82.6% | −7.8% |
| S5_05 盐浴定色 | 0.340 / 2.4% | 0.366 / 7.8% | +5.4% |
| S5_16 赤金临界 | 0.248 / 1.5% | 0.218 / 0.2% | −1.3% |
| **S5_21 神淬虹纹** | 0.410 / **64.0%** | 0.253 / **13.3%** | **−50.7%** |
| S5_23 冷热虹界 | 0.286 / 9.3% | 0.253 / 0.7% | −8.6% |
| S5_25 静镜留底 | 0.222 / 0% | 0.132 / 0% | 0% |
| **25 张平均** | **0.278 / 16.8%** | **0.252 / 10.5%** | **−6.3%** |

最关键的一张 `S5_21 神淬虹纹`：高饱和占比从 64% 降到 13.3%，从“整刀一块蓝”变为
金属底 + 局部色斑（符合它“表面淬火”的语义）。

`S5_05` 略升 5.4% 属预期：F07 回火彩原本被 `cover 0.24` 压得太窄几乎看不见，
本次统一后它有了可读的窄色带。

---

#### 二、切页 156ms —— 这是我的测量错误，不是产品问题

**必须更正**：我上一轮报告里的「切页均 156ms 偏高」是**我自己脚本的测量缺陷**。

原测量代码里每次切页后都有 `await page.waitForTimeout(60)`，一个来回 2×60=120ms
被算进了「切页往返」，于是得出 156ms。

**去掉 `waitForTimeout` 后的真实测量**（home ↔ forge，各 8 次，手机视口）：

```
[{toHome:8.5, toForge:26.1}, {toHome:34.1, toForge:25.8},
 {toHome:7.5, toForge:19.4}, {toHome:18.8, toForge:11.2},
 {toHome:10.4, toForge:11.4}, {toHome:10.8, toForge:11.0},
 {toHome:11.7, toForge:10.5}, {toHome:11.2, toForge:11.4}]
```

**热态稳定在 10–12ms**，前两次的 26–34ms 是首帧着色器/纹理准备的一次性成本。

单项拆解：

| 操作 | 耗时 |
| --- | --- |
| `stage.attachTo(host)` | **1.8–2.5ms** |
| `stage.resize()` | **0–0.2ms** |

→ 3D 舞台是**复用同一 viewer、只搬 canvas 容器**（`attachTo` 里 `appendChild`），
本来就没有“重挂载”。结论：**该项无需优化**，我之前的判断基于错误数据。

---

#### 三、阶段切换感知（这是真实缺陷，已修）

##### 问题

S1–S9 里玩家点卡就是**预览**——3D 已经是“选完的样子”。
再点「确认」进入下一阶段时，画面几乎不变，于是：
**玩家分不清“我在预览”和“我已经进入下一阶段了”。**

##### 修复

`src/ui/pages/forge.js` 新增 `lastStageIndex` 跟踪，阶段号**真的前进**时给一次明确回执：

1. 舞台徽标重播入场（`stageBadgeIn`：微位移 + 缩放）；
2. 题面滑入（`stageQuestionIn`）；
3. 进度条当前点亮起（`stageDotIn`）；
4. **舞台中央浮出「第 N 阶段 · 名称」，1.4s 自动淡出**。

细节：
- 只在 `idx > lastStageIndex` 时触发 → 首阶段（S1）不播，退阶段不误播；
- 连续推进用 `offsetWidth` 强制回流，保证动画可重播；
- `setTimeout` 句柄统一管理，连点不会残留 class；
- **尊重减少动效**：`prefers-reduced-motion` 下取消位移/缩放动画，仅保留可读文字。

##### 验证（真实浏览器）

```
S1（首阶段，不应有过渡）: {"advanceClass":false,"toast":false,"stage":"01原料1/10"}

点确认进 S2：
  之后: {"advanceClass":true,"toast":true,"toastText":"第 2 阶段熔炼",
         "stage":"02熔炼2/10","question":"如何处理原料","activeDot":"2"}

1.7s 后（过渡应已清理）: {"advanceClass":false,"toast":false,"stage":"02熔炼2/10"}

再推进到 S3（应可重复触发）: {"advanceClass":true,"toastText":"第 3 阶段锻打"}

阶段推进反馈生效 = true
```

可看到「第 2 阶段 熔炼」浮在舞台上、徽标变 `02 熔炼 2/10`、进度点 2 亮起。

---

#### 四、用户追报：进新阶段、还没选就有新效果覆盖上来

##### 现象

“我进锻刀新阶段，还没选就有个新效果覆盖上。”

##### 复现（纯逻辑，未选 S5 即 `finishId=1` / `amount=0`）

```
tier=0（普通） → 不介入（正确）
tier=2（稀有） → 介入 auroraRibbon：mode 0→2、palette 0→4、ramp→0.545
tier=3（史诗） → 同上
tier=4（传说） → 同上
```

##### 根因（**这是我的 bug**）

`src/render/v2/finishRecipe.js` 的稀有效果库：

```js
export function resolveS5Effect(finishId, tier, shift, seeds, extra = {}) {
  if (!(Number(tier) >= 2)) return null;   // ← 只看稀有度
```

它 **完全不检查玩家是否真的选过淬火**。而 `uCardTier` 在“进入新阶段、还没选卡”时
会回落到 `uVisualTier`（= 整局构筑的最高稀有档）。于是：

1. 你在 S1–S4 选到一张稀有/史诗卡 → 整局最高稀有档 ≥2；
2. 之后每进入一个新阶段（还没点任何卡），`tier` 就已经 ≥2；
3. 效果库直接接管，刀身被自动上一套淬火特效。

##### 修复

把“是否真的选过”变成**显式门槛**，且真源只有一处：

**① `finishOperators()` 返回 `chosen`（单一真源）**

```js
const out = { ..., chosen };   // chosen = finishId>1 || amount>0
if (!chosen) return out;
```

**② 效果库必须以此为前提**

```js
if (extra.chosen !== true) return null;   // 未选一律不接管
if (!(Number(tier) >= 2)) return null;
```

**③ 调用方把同一个 `chosen` 传进去**

```js
const op = finishOperators(finishId, fp, {...});
const s5 = resolveS5Effect(..., { ..., chosen: op.chosen === true });
```

→ 这样“没选就没有”的契约在**效果库这一层**也成立，不依赖稀有度间接推断。

##### 验证

**纯逻辑（新增永久断言 A25）**

```
稀有度=common/rare/epic/legend/mythic 且未选 → picked=null（全部 PASS）
已选 F05/F10/F07 + 史诗 → 正常介入（iceFracture / rustPatina / abyssTide）
已选但普通稀有度 → 不接管（保留卡自己的工艺）
```

**真实浏览器（S1–S4 故意选到稀有/史诗卡，再进 S5 不点任何卡）**

```
S1–S4 已选卡: 暗沉铁(普通) / 均质池(普通) / 矿屑锋面(稀有) / 马来剑(精良)
S5 未选卡状态: {"stageId":"S5","finishIdPending":null,"hasPreview":false}
```

截图对照：
- （截图已随项目整理移除） —— 刀身是**朴素钢色**，没有自动上色；
- （截图已随项目整理移除） —— 点了卡之后才出现对应工艺效果。

**广谱校验（每阶段刚进入时的 chosen 标记，确认只有 S5 这处泄露）**

```
S1 | finish:-   tex:-   wear:-   | variants=[]
S2 | finish:-   tex:-   wear:-   | variants=[]
S3 | finish:-   tex:-   wear:-   | variants=[melt]
S4 | finish:-   tex:YES wear:-   | variants=[melt,texture]
S5 | finish:-   tex:YES wear:-   | variants=[melt,texture]      ← 未选就是未选
S6 | finish:YES tex:YES wear:-   | variants=[melt,texture,finish] ← 上一阶段选过的正确继承
S7–S9 同理逐层累加
```

结论：各层的 `chosen` 状态本来就是诚实的，问题只在**渲染层忽略了它**；
修掉这一处后，没有其他阶段存在类似泄露。

---

#### 五、刀具鉴赏：开启拖动 + 一键复原

##### 用户反馈

1. 查看刀时「**有大小的问题**」；
2. 「**无法拖动**」；
3. 要求：默认位置就很好，把「拖动刀具 · 自由鉴赏」改成
   **「开启拖动」开关 + 「一键复原」**，平衡性能与可玩性。

##### 实测取证（先测再改）

| 页面 | canvas | 刀占屏 fillW / fillH | 拖动实际生效？ |
| --- | --- | --- | --- |
| 首页 | 390×410 | 12.6% / **85.1%** | 是（相机 -1.87 → 0.21） |
| 鉴定 | 390×310 | 12.8% / **86.5%** | 是（相机确实变化） |
| 实测 12 种刀型 | — | fillH **全部 85.1%** | — |

**结论：拖动其实一直是生效的，取景也是正常的。** 真正的问题是两件事：

- **“大小不对”的来源**：`controls.maxDistance = fitDistance × 3.2`，
  双指/滚轮缩到最远时刀只剩默认尺寸的约 1/3，而且**没有任何复原手段**；
- **“拖不动”的来源**：
  1. 刀是细长竖向物体（fillW 仅 12–13%），绕 Y 轴转时画面变化很小；
  2. 拖动一旦生效，OrbitControls 把 canvas 的 `touch-action` 写成 `none`（实测），
     页面在舞台上滚不动，手上就像“卡住了”；
  3. 没有“回到默认位置”的入口，拖歪了只能刷新。

##### 修复

**① 缩放范围收紧**（`src/render/legacy/viewer.js`）

```js
// 旧：maxDistance = fitDistance × 3.2  → 可缩到 1/3，像“刀变小了”
this.controls.maxDistance = this.fitDistance * 1.35;   // 仍能退后看全景，但不会缩成小点
```

**② 复原真正回到默认位置**（同一文件 `resetView()`）

修了两个实测出的偏差：

- `_stopCamTween()`：不先停进行中的相机补间，下一帧会把相机再推回中途位置；
- 显式清零 `controls._sphericalDelta / _panOffset / _scale`：只调 `update()` **清不掉**内部增量，
  实测复原后残留 `[0.42, 0.09, -1.86]`（应为 `[0, 0, -1.908]`）；
  并在 `update()` 之后**再写一次硬值**，保证逐位对齐默认机位。

**③ 门面新增两个接口**（`src/render/index.js`）

```js
setInteractive(on)   // 同时接管 enableRotate / enableZoom / touchAction
resetView()          // 一键回到默认机位
```

`_applyTouchAction()` 是这里的关键：

| 状态 | canvas `touch-action` | 效果 |
| --- | --- | --- |
| 开着拖动 | `none` | 拖拽时不带着页面滚 |
| 关掉拖动 | `auto` | **页面恢复正常滚动** |

旧实现的问题是：OrbitControls `connect()` 无条件写 `none`，
于是「不可交互」的页面反而被锁住滚动（实测）。现在默认关拖动 = 默认能滚页。

**④ 首页交互改造**（`src/ui/pages/home.js` + `css/pages/shell.css`）

把被动文案「拖动刀具 · 自由鉴赏」换成**右下角两个圆形图标按钮**（用户要求：做图标而不是文字按钮）：

| 图标 | 含义 | 行为 |
| --- | --- | --- |
| 四向箭头 | 开启/关闭拖动 | 开启后图标变**青色实心**，舞台加细边框提示；关闭时自动复原 |
| 回转箭头 | 复原到默认位置 | 一键回到基准机位 |

设计要点：
- 图标用**内联 SVG 描边**（与项目其他图标同一语言），不引入图片资源；
- 尺寸 **40×40 圆形**，超出 36px 触控下限；
- 文字只放 `title` / `aria-label`，不占舞台宽度、不遮刀；
- 距舞台右边 12px / 底边 10px，在主 CTA 上方，不压操作按钮；
- `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation`，移动端不闪蓝、不延迟。

默认**关**：舞台不响应指针、页面可正常滚动、无需持续重绘（性能）；
需要看细节时玩家自己开（可玩性）。关闭时会**自动复原**，
避免玩家被锁在“拖歪了”的视角里、误以为尺寸坏了。

##### 验证（真实浏览器，有断言）

```
1. 默认：两个 40×40 圆形图标、均含 SVG、无文字，距右 12px / 距底 10px
        enableRotate=false, enableZoom=false, touchAction=auto   ← 可滚动
2. 默认拖动：camPos 不变（moved=false）                          ← 拖不动（符合预期）
3. 点拖动图标：enableRotate=true, touchAction=none, aria-pressed=true（图标点亮）
4. 开启后拖动：[0,0,-1.87] → [1.768,0.61,-0.038]（moved=true）   ← 拖得动
5. 点复原图标：[0,0,-1.908]（回到中轴默认机位）
6. 关闭拖动：enableRotate=false, touchAction=auto，且相机自动回默认

图标版控制全部生效 = true
```

> 中途改过一版文字按钮（「开启拖动」/「复原」），按用户反馈改成了图标版；
> 旧的 `.showcase-caption` 被动文案已删除，不再保留死样式。

---

#### 六、四项后续微调（2026-10-24 第二轮）

##### 1) 选中时不要绿框

上一版在拖动开启时给舞台画了 `2px` 青色边框（`.home-showcase.is-interactive::after`），
用户反馈「选中的时候不要有绿框出现」——它看起来很像“被选中/聚焦”，也刺眼。

**处理**：整段规则删除。开关状态只由图标自身点亮（`aria-pressed`）表达，
**不再改舞台外观**。

实测：`::after` 的 `content=none`、`borderWidth=0px`。

##### 2) 锻刀阶段也要有图标

把图标从「首页私有」抽成共用模块 `src/ui/stageControls.js`：

```js
createStageInspect({ canDrag, blockReason })
  → { bar, setMode, sync, setBlocked, isOn }
```

首页与锻造页共用同一组图标与开关语义，避免两处各写一份而漂移。

**S4 锻打阶段禁用拖动**：锻打热区铺满整个舞台，拖动会与挥锤打架。
实现上直接设 `disabled` + `aria-disabled`，而不是只加 CSS 类 ——
因为类名挂在 `.page` 上时选择器链路太长、容易被后续规则盖掉（**上一版就是这么误判的**）。

实测：`{found:true, disabled:true, ariaDisabled:'true', cls:true}`。

##### 3) 3D 舞台占比 +10%（取整数 60%）

```css
/* 旧：flex: 0 0 50%   新：60%（用户说“再多 10% 左右”，取整到 60%） */
.page[data-page="forge"] .stage { flex: 0 0 60%; }
/* 卡片高度相应 25dvh → 23dvh，保证“舞台+卡片+操作栏”仍是一屏不溢出 */
```

实测：`pageH=782 / stageH=469 → 60.0%`，且在 844px 视口内不溢出（55.6% 视口高）。

##### 4) 各阶段镜头位置

**病象**：6 个预设里有 **5 个是 `polar:0, azim:0`** —— 同一个正面机位，只差 `dist` 约 6%；
再加上 `viewPresetForStage` 让相邻阶段**复用同一预设**，所以 S1→S2、S4→S5
这类切换**镜头完全不动**，玩家只能靠徽标知道换了阶段。

**修法**：S1–S9 每阶一个独立机位（用 `azim` 正负交替 + `polar` 微俯仰区分）：

| 阶段 | preset | dist | polar | azim | 意图 |
| --- | --- | ---: | ---: | ---: | --- |
| S1 原料 | `raw` | 1.10 | 0.03 | **+0.10** | 接近平视，看块体剖面 |
| S2 熔炼 | `melt` | 0.92 | 0.10 | **−0.12** | 略俯，熔融高光可读 |
| S3 锻打 | `billet` | 0.94 | 0.05 | **+0.24** | 右偏，看胚料走向 |
| S4 定型 | `forge` | 0.98 | 0.04 | **−0.18** | 左偏 3/4，看整刀轮廓 |
| S5 淬火 | `edge` | 1.00 | 0.03 | **+0.34** | 右偏最大，露刃线高光 |
| S6 回火 | `temper` | 1.00 | 0.06 | **−0.26** | 反向左偏，看回火色带 |
| S7 开刃 | `grind` | 0.96 | 0.02 | **+0.18** | 小幅右偏，聚焦刃口 |
| S8 装配 | `assemble` | 1.04 | 0.05 | **−0.10** | 接近平视，看柄与护手 |
| S9 调校 | `tune` | 1.06 | 0.07 | **+0.14** | 稍远收尾 |
| S10 鉴定 | `reveal` | 1.12 | 0.16 | −0.42 | 拉远 + 俯视 + 侧后 3/4 |

`viewPresetForStage` 改为 `[预览时, 平时]` 映射表，相邻阶段不再复用同一预设。

**修到一个连带缺陷**：`edge` 机位原用 `bladeFitBox`（**只框刃身**，不含刀柄）算距离，
再加侧偏后整刀投影出界（实测 fillH **112%**，刀柄被裁）。
改为用**整刀包围盒** `this.fitBox` 取景与对焦，系数 1.12。

**实测（每阶段相机与刀的占屏）**：

```
阶段 | preset   | 相机                        | fillW/fillH | 裁切
S1   | raw      | [ 0.285, 0.086, -2.839]     | 56.7/49.3   | no
S2   | raw      | [ 0.319, 0.096, -3.182]     | 49.6/43.1   | no
S3   | melt     | [-0.410, 0.344, -3.402]     | 61.8/53.4   | no
S4   | billet   | [ 0.650, 0.137, -2.657]     | 22.4/60.0   | no
S5   | forge    | [-0.334, 0.075, -1.835]     | 19.6/85.9   | no
S6   | edge     | [ 0.594, 0.053, -1.680]     | 20.5/90.9   | no
S7   | temper   | [-0.489, 0.114, -1.837]     | 19.4/84.5   | no
S8   | grind    | [ 0.327, 0.037, -1.799]     | 19.9/87.8   | no
S9   | assemble | [-0.198, 0.099, -1.969]     | 18.4/80.4   | no

不同机位 9 个 / 10 阶段；没有阶段裁刀
```

---

#### 七、单按钮化 + 锻造页拖动修复（2026-10-24 第三轮）

##### 1) 只留一个拖动按钮（用户：「拖动点掉会自动复原」）

既然关闭拖动已经自动复原，单独的「复原」按钮就是冗余入口。
处理：**删掉复原按钮**，只保留四向箭头一个图标。

| 状态 | 语义 |
| --- | --- |
| 关（默认） | 不响应指针，页面可正常滚动 |
| 开（`aria-pressed=true`，图标点亮） | 可拖拽旋转 / 缩放 |
| 再点一次 | 关闭 **并自动复原到本页默认机位** + 恢复页面滚动 |

删除的冗余：`ICON_RESET`、`.stage-inspect-reset` 以及对应 CSS（零残留）。

##### 2) 【真 bug】锻造页拖动完全不生效

**现象**：在锻造页点「开启拖动」，图标亮了（`aria-pressed=true`），但拖不动；
实测 `enableRotate` 恒为 `false`。

**根因**：`src/render/index.js#setInteractive` 残留了旧逻辑的页面门控：

```js
const fixed = pageKey === 'forge';
c.enableRotate = !!on && !fixed;   // ← 锻造页 fixed 恒为 true → 永远开不了
c.enableZoom  = !!on && !fixed;
```

旧逻辑的前提是「锻造页永远固定机位」，但本轮已改为**锻造页也有显式开关**
（S4 锻打阶段由 `stageControls.setBlocked()` 禁用），这个硬门控就成了 bug。

**修法**：开关成为**唯一真源** —— `on` 就开、`off` 就关，不再按页面名拦截：

```js
c.enableRotate = !!on;
c.enableZoom   = !!on;
```

S4 锻打阶段的保护改由 UI 层 `disabled` + `canDrag()` 守，语义更清楚。

##### 3) 顺带修到：关闭拖动后复原到的不是「本页默认视角」

**现象**：关闭拖动后相机回到**中性基准位** `[0,0,-fitDistance]`，
而各页真实默认视角是带机位偏移的（首页 `[-0.335,0.075,-1.839]`、
锻造页 `[0.285,0.086,-2.839]`），于是“关掉拖动”后刀会自己换个角度。

**修法**：`viewer.resetView()` 在摆正姿态并清零球面增量后，
如果当前有生效的机位 preset，就把它**重新应用一次**：

```js
const preset = this.viewPreset;
if (preset && Viewer.VIEW_PRESETS[preset]) {
  this.setViewPreset(preset, { duration: 0 });
}
```

（`setViewPreset` 内部不回调 `resetView`，无递归风险。）

##### 4) 【真 bug】页面重绘后按钮亮着却拖不动

**现象**：开着拖动时，只要页面重绘一次（切阶段、改状态都会），
按钮仍显示 `aria-pressed=true`，但 `enableRotate` 又变回 `false`。

**根因**：`attachTo()` 每次 render 都会被调一次，而它里面**按页面名无条件重置**
controls，把玩家刚打开的开关盖掉了。

**修法**：`attachTo` 增加 `this._interactive` 记忆——
用户显式开/关过之后，后续重绘一律尊重它，不再被页面默认值覆盖；
只有从未动过开关（`_interactive == null`）时才用页面默认值。
**换页则重置**（`pageChanged → _interactive = null`），否则会出现相反的错误：
首页开了拖动、进锻造页后按钮显示关，但画布实际还能拖。

##### 5) 【真 bug】切页后按钮状态与画布不一致

**现象**：首页开拖动 → 进锻造页 → 回首页，按钮显示 `pressed=true`，
画布却已回到默认关。

**根因**：状态有**两个真源**——按钮模块内的 `on` 变量、以及画布的 `controls`。
切页时 `attachTo` 只重置了画布，按钮模块不知道。

**修法**：把画布做成**可回读的唯一真源**：

```js
// render 门面
isInteractive() {
  const c = this.viewer && this.viewer.controls;
  return !!(c && (c.enableRotate || c.enableZoom));
}

// stageControls
function syncFromStage() {
  const live = getStage()?.isInteractive?.();
  if (typeof live === 'boolean') on = live;
  sync();
}
```

页面在 `attachTo()` 后调用 `syncFromStage()`；bootstrap 的 `onNavigate`
在挂载后调 `Home.syncInspect()` / `Forge.syncInspect()` 再校一次
（切页时 attachTo 发生在 `page.render()` 之后，页面自己那次同步是早的）。

##### 实测验证（全部通过）

```
A) 首页只有 1 个图标按钮              → count=1，无复原按钮
B) 首页：默认 [-0.335,0.075,-1.839] rotate=false touch=auto
   开启后          → rotate=true touch=none pressed=true
   拖动后          → [1.707,0.68,-0.349]（moved）
   关闭后          → [-0.335,0.075,-1.839]（回到本页默认视角，不再是 0,0,-1.908）
C) 锻造页：默认 [0.285,0.086,-2.839] rotate=false
   开启后          → rotate=**true** touch=none   ← 修复生效
   拖动后          → [2.691,0.899,-0.315]（moved）
   关闭后          → [0.319,0.096,-3.182] rotate=false touch=auto
D) S4 锻打阶段  → {disabled:true, ariaDisabled:'true'}

全部通过
```

跨页 / 重绘一致性（`_crosspage.mjs`、`_desync.mjs`）：

```
首页开启后    : pressed=true  rotate=true  zoom=true  touch=none
锻造页进入    : pressed=false rotate=false zoom=false touch=auto   ← 不串状态
锻造页重绘后  : pressed=true  rotate=true  zoom=true  touch=none   ← 不被盖掉
回首页        : pressed=false rotate=false zoom=false touch=auto   ← 按钮与画布一致
鉴定页        : rotate=true  zoom=false                            ← 保持原策略

状态失同步(pressed=true 但 rotate=false) = false
```

---

#### 改动文件

| 文件 | 改动 |
| --- | --- |
| `src/render/v2/finishRecipe.js` | 11 套效果 cover/ramp/film 收回规范；`finishOperators` 导出 `chosen`；效果库要求 `chosen===true` |
| `src/render/v2/programFamilies.js` | 中性工艺不染 rankHue；rankHue 降饱和；刃带着色减弱；卡名色修；把 `op.chosen` 传给效果库 |
| `src/ui/pages/forge.js` | 阶段推进检测 + 中央回执浮层 |
| `css/pages/forge.css` | 阶段推进动画（含 reduced-motion 降级） |
| `src/render/legacy/viewer.js` | `maxDistance` 3.2→**1.35**；`resetView` 停补间 + 清零球面增量 + **重放当前 preset**（回到本页默认视角）；**S1–S9 每阶独立机位**；`edge` 改用整刀 fitBox 取景（修裁刀） |
| `src/render/index.js` | 新增 `setInteractive()` / `resetView()` / `isInteractive()`；**删除 `!fixed` 硬门控（修锻造页拖不动）**；`attachTo` 尊重 `_interactive`（修重绘后被盖掉）、换页则重置；`_applyTouchAction()` 让关拖动时恢复页面滚动；home 默认不接管指针 |
| `src/app/bootstrap.js` | 切页后调 `Home.syncInspect()` / `Forge.syncInspect()`，把按钮对齐到画布真实状态 |
| `src/ui/pages/home.js` | 「拖动刀具 · 自由鉴赏」→ 右下角**单个图标**（四向箭头）；导出 `syncInspect()` |
| `src/ui/stageControls.js` | **新增**：图标版鉴赏控制共用模块（首页 + 锻造页共用）；只保留拖动开关，关闭即复原；新增 `syncFromStage()` 回读画布真值 |
| `src/ui/pages/forge.js` | 接入鉴赏图标；S4 锻打阶段 `setBlocked(true)` 禁用拖动；导出 `syncInspect()` |
| `css/pages/shell.css` | 图标按钮样式改为通用 `.stage-inspect`；**删除**拖动时的绿框规则 |
| `css/pages/forge.css` | 3D 舞台 50% → **60%**；卡片高度 25dvh → 23dvh |
| `docs/rework/2026-10-24/verify-rework.mjs` | 新增 A25 永久回归断言 |

#### 遗留与边界

1. **未做真机验证**：以上均为桌面 Chrome + 390×844@DPR3 视口。
2. **S5 仍可继续打磨**：本次只把“过艳/错色”收回到规范；`fadeColdHot` 这类仍依赖
   材质自渐变，观感是否达到用户预期需按其反馈再迭代。
3. `S5_05` 高饱和占比略升（+5.4%）是“从几乎看不见 → 窄色带可见”的结果，非退化。
4. **鉴定页仍默认“只能转不能缩”**：本轮只改了首页交互与全局缩放上限；
   鉴定页是否也要加同样的开关，可待用户反馈再定。


---

## 四、UI/UX 风格化打磨

> 本轮只做**零结构改动**的风格化与可用性硬化：不移动任何元素位置、
> 不改玩法规则、不改配色体系、不改存档。
>
> 依据：真实浏览器渲染取证（390×844 @DPR3）+ 机器度量，不靠读代码推断。
> 六个页面逐页截图评审，问题按「视觉 / 布局 / 交互 / 内容」四桶归类。

---

#### 一、本轮做了什么

| # | 改动 | 为什么改 | 证据 |
| --- | --- | --- | --- |
| 1 | `--font-num` 接入 **Bahnschrift** | 原链首的 `'DIN Alternate'`、`'Avenir Next'` 都是 **macOS 字体**，在这台 Windows 上**都不存在** → CR / 阶段号 / 六维 / 评分全部静默落到 Segoe UI，看起来像没做过字体设计 | `_fontfinal.mjs`：两字体 `exists=false` |
| 2 | 新增 `css/numeric.css`（最后加载） | Bahnschrift **默认数字是比例宽**（`1111111111`=133.02 vs `8888888888`=225.00，差 91.98px）。必须补 `tabular-nums`；但项目大量数字规则用 `font:` **简写**，简写会把 `font-variant-numeric` 重置为 `normal` | `_fontpick.mjs`、`_decide.mjs`：加 tabular 后 212.89 = 212.89 |
| 3 | `.stage-icon` 40px → **44px** | 项目自己的 `--tap` 令牌就写着 44px（触控最小热区），而这是**唯一**的拖动入口 | `_probe.mjs`：实测 40×40 |
| 4 | `.ap-skip` 36px → **44px** | 鉴定页**唯一**低于项目自身触控标准的可点控件 | `_probe.mjs`：实测 358×36 |
| 5 | `.risk-foot` 加 `gap: 2px 8px` + `flex-wrap` | 实测两段间距 `gapBetween = 0`，渲染成「本次断裂概率 3.2%下一锤 3.8%」贴在一起 | `_decide.mjs`：容器剩余宽度仅 ~5.6px |
| 6 | 令牌注释纠错 | `--fs-2xs` 注释写「=10px」，实际取值 11px；`--fs-sm` 与 `--fs-xs` 同值 12px 被误认为重复 | 实读 `tokens.css` |

##### 为什么选 Bahnschrift 而不是包里的 Baloo 2

| 候选 | 存在 | 默认等宽 | 判断 |
| --- | --- | --- | --- |
| **Bahnschrift** | ✅ Windows 自带 | 否（tabular 后等宽） | **采用**：DIN 1451 血统，正是 `'DIN Alternate'` 想表达却落空的德系工业铭牌感；**零下载** |
| Baloo 2（`K3D Num`，1224KB） | ✅ 随包 | 否（tabular 后等宽） | 弃用：圆角可爱风，与锻刀题材的硬朗钢感相反；且会新增 1.2MB 下载 |
| Segoe UI | ✅ | 是 | 弃用：当前实际落到的就是它，泛用、无性格 |
| DIN Alternate / Avenir Next | ❌ | — | 链上保留：macOS 用户会命中，各平台拿到同族工业感 |

**关键取舍**：Bahnschrift 不是随便换了个「好看的数字字体」，而是把原本
指向 DIN 系的意图，换成一个**在这台机器上真能命中**的同族字体。

##### 保留 `'DIN Alternate'` / `'Avenir Next'` 在字体链上的理由

它们是 macOS 字体。删掉会让 macOS 用户直接掉到 `ui-sans-serif`；
保留则让各平台都落到同族的工业无衬线里，而不是各用各的系统默认。

---

#### 二、验收（全部真实浏览器，有断言）

```
PASS  --font-num 解析到 Bahnschrift      Bahnschrift, "DIN Alternate", ...
PASS  Bahnschrift 在本机可用             {"bahn":true}
PASS  numeric.css 已加载                 ...workshop.css,numeric.css
PASS  数字等宽（改内容不跳）             jump=0px
PASS  tabular-nums 真的生效              tabular-nums
PASS  中文未被误伤（走 --font 栈）       "PingFang SC", "Microsoft YaHei", ...
      字体网络请求: （无 —— 系统字体，零新增下载）
PASS  首页拖动图标 ≥44px                 {"w":44,"h":44}
PASS  锻造页拖动图标 ≥44px               {"w":44,"h":44}
PASS  risk-foot 两段不再粘连             wrapped=true
PASS  阶段号数字也吃到了 tabular          tabular-nums
PASS  阶段号走 Bahnschrift                Bahnschrift, ...
PASS  跳过揭晓 ≥44px                     {"w":358,"h":44}
PASS  鉴定分值走 Bahnschrift              Bahnschrift, ...
PASS  无横向溢出                          null
PASS  赛事评分走 Bahnschrift / tabular     Bahnschrift / tabular-nums
PASS  无 console error                   0 条

=== 全部通过 ===
```

##### 覆盖完整性（防静默回归）

`numeric.css` 靠「最后加载 + 选择器清单」覆盖，**漏一个 selector 不会有任何报错**，
那个数字会静默变回比例宽（宽度随内容跳动）。因此加了机器比对 `_cover.mjs`：

第一轮查出 **2 个遗漏**，已补：

```
MISS .ap-details > summary::after     (appraise.css)
MISS .quick-reward b                  (arena.css)   ← 奖励 CR 数字，最该等宽的地方
→ 补齐后：✅ 全部覆盖 —— 30/30 选择器，没有数字会静默退回比例宽
```

（页面中共有 30 处规则使用 `var(--font-num)`；`numeric.css` 本身写了 31 条选择器，
多出的 `.topbar-cr` 是无后代前缀的兼容写法。）

##### 其它验证

```
npm run check   236 scripts / 764 refs / 0 errors
npm test        pass 10 / fail 0
verify-rework   26/26 项通过（A01–A25 无回归）
```

---

#### 三、我**推翻**的三个先前判断（如实更正）

审查阶段我基于截图提出过 3 个问题，实测后**不成立**，本轮没有动它们：

| 我先前的说法 | 实测结果 | 结论 |
| --- | --- | --- |
| 藏刀阁卡片渲染出 `[object Object]` | 我的测试夹具把 `traits` 传成了对象，真实存档存的是**特性 ID 字符串**。用真实格式复测：`hasObjectObject: false` | **夹具错误，非产品缺陷** |
| 鉴定页出现 `11.52px` / `23.424px` 是「令牌外混算」 | `11.52px` = `.ap-stat-mark` 的 `.72em`（相对字号）；`23.42px` = `.ap-title` 的 `clamp(22px, 6vw, 28px)`（刻意的流体尺寸） | **两者都是有意的，非缺陷** |
| 鉴定页六维被「跳过揭晓」压住 | `overlapPx: -143`、`coveredCells: []` —— 实际不重叠，六维在按钮上方 | **不成立** |

另有一条**代码 bug 嫌疑**也已排除：

```
getTrait('HT_precision') → null        ← 看着像漏配
但 hammerTierTraitId('precision', 0) → null
```

基础 `HT_*` id 永远不会被写入存档（只有 `HT_*_1..4` 会），所以 `INDEX` 里
没有基础 id 不影响任何真实数据流。**不是缺陷，未改动。**

---

#### 四、明确**未做**的部分

| 项 | 原因 |
| --- | --- |
| 首页两套目标合并、图鉴空态折叠、赛事双层 tab 扁平化 | 用户明确否决：「1 和 2 太极端了，整体设计不要大变」——这些属结构改动 |
| 纸面光照 / 接地投影 / 十色舞台底染 | 用户只选了「数字铸刻感」一项，另两个方向待需要时再做 |
| Baloo 2 的 1224KB 仍随包 | 本轮改用系统字体，没有删除字体文件（删资产属独立决策，避免顺手扩大改动面） |
| Android / iOS 真机 | 硬件条件限制；本轮全部为桌面 Chrome + 390×844@DPR3 视口模拟 |

##### 已知边界

1. **Bahnschrift 是 Windows 10+ 系统字体**。在更老的 Windows / Linux 上会落到
   链上的 `'DIN Alternate'`（无）→ `ui-sans-serif`，即行为与改动前一致，
   **不会变差**，但也不会获得新的数字质感。
2. `numeric.css` 是**清单式**覆盖：以后新增用 `var(--font-num)` 显示数字的规则，
   必须把选择器补进清单。`_cover.mjs` 可随时重跑做机器比对：

   ```powershell
   $env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
   node docs/rework/2026-10-24/_cover.mjs
   ```

---

#### 五、改动文件

| 文件 | 改动 |
| --- | --- |
| `css/tokens.css` | `--font-num` 链首 `'DIN Alternate'` → **`'Bahnschrift'`**（附完整决策注释）；`--fs-2xs` / `--fs-sm` 注释纠错 |
| `css/numeric.css` | **新增**：31 条选择器，统一补 `font-variant-numeric: tabular-nums` |
| `index.html` | 加载 `numeric.css`（**必须在所有页面样式之后**） |
| `css/pages/shell.css` | `.stage-icon` 40px → `var(--tap)`（44px） |
| `css/pages/appraise.css` | `.ap-skip` `min-height` 36px → `var(--tap)`（44px），padding 同步 |
| `css/components.css` | `.risk-foot` 加 `gap: 2px 8px` + `flex-wrap: wrap`，修文案粘连 |
| `docs/rework/2026-10-24/_audit.mjs` | 新增：六页面度量审查（HUD 占比 / 触控热区 / 字号分布 / 溢出） |
| `docs/rework/2026-10-24/_verify_style.mjs` | 新增：本轮改动的 17 项断言验收 |
| `docs/rework/2026-10-24/_cover.mjs` | 新增：`numeric.css` 覆盖完整性机器比对 |
| `docs/rework/2026-10-24/_verify_three.mjs` | 新增：本轮三项改动的 20 项断言验收 |

---

#### 六、三项界面精简（2026-10-24 第二轮）

用户提出三条，均已实现并实测：

| # | 需求 | 改法 |
| --- | --- | --- |
| 1 | 「还没有开始锻造。」可以删掉 | 删掉该文案与包着它的空 `.card` 块，只留「开始锻刀」按钮。幽灵刀 + 按钮已经说清状态，再补一句是重复陈述 |
| 2 | 首页没刀时：幽灵唐刀、通体半透明、随机材质 | `is-ghost` 的 `opacity` 从 `1` → **`.58`**；材质从写死 `M02/T02/F01` 改为**每次会话随机**（M01–M25 × T01–T24 × F01–F12） |
| 3 | 「今日目标」删掉，50 CR 全勤奖励也一起删 | 首页入口 + 抽屉 + `claimAllBonus` / `claimDailyBonus` / `DAILY_ALL_BONUS` / `save.daily.allBonusClaimed` / `.home-mission*` / `.goal*` 全部移除 |

##### 两个必须说清的设计判断

**① 为什么幽灵材质要缓存，不能每次 render 都随机**

`render()` 在首页会被反复调用（进度变化、CR 变化、切页回来）。
若每次都取新随机值，刀的材质会不停闪变。
所以只在**本次会话首次**取一次并缓存在 `Game._ghostSkin`：
效果是「每次刷新换一把」而不是「每次重绘换一把」。
实测：同一会话重绘 `M06T05 → M06T05`（不变）；6 次刷新得到 **7 种**不同组合。

**② 删「今日目标」前先核对了奖励是否会被一起吞掉**

- 单项任务 CR（40/40/50）由 `core/events.settle` **自动发放**，与这个 UI 无关 →
  删界面**不会少发任何一毛**；
- 全勤 50 CR 确实**只能**从那个抽屉领（`home.js:52` 是 `claimDailyBonus` 的唯一调用方），
  所以按用户要求**一并取消**，而不是删了界面、把奖励留成永远领不到的死数据。

> 旧存档里残留的 `daily.allBonusClaimed` 由 `saveSchema` 显式 `delete` 丢弃，
> 不报错、不影响任何已得权益（那 50 CR 本来也没领过，今后不再有）。

##### 验收（全部通过）

```
=== 3) 首页今日目标 ===
PASS  「今日目标」元素已移除
PASS  页面文本无「今日目标」   唐刀 · 待你锻造 开始锻刀 → 赛事 藏刀阁 工坊 图鉴 下一个目标 ...
PASS  页面文本无「全勤」
PASS  主 CTA 仍在 / 4 个入口仍在 / 「下一个目标」仍在 / 长期统计 4 项仍在

=== 2) 幽灵唐刀 ===
PASS  canvas 带 is-ghost 类
PASS  canvas 真的半透明（opacity < 1）     0.58
PASS  幽灵材质已随机生成                   M06/T05/F05
PASS  同一会话重绘不换材质（不闪变）       M06T05 -> M06T05
PASS  跨刷新材质确实随机（>1 种组合）      7 种

=== 1) 锻造页空态 ===
  空态文本: "开始锻刀"   按钮: ["开始锻刀"]
PASS  「还没有开始锻造。」已删除
PASS  不再有空卡片块
PASS  仍保留「开始锻刀」按钮
PASS  空态舞台仍显示幽灵刀

PASS  无 console error
=== 全部通过 ===
```

其它：`npm run check` 238 scripts / 763 refs / **0 errors**；
`npm test` **9/9**（原「每日奖励不锁定领取」用例随功能移除同步删除）；
`verify-rework` **26/26** 无回归；`_cover.mjs` 30/30 全覆盖。

##### 一处排查记录（不是缺陷）

首页截图中舞台中部有一道很淡的横向痕迹，看着像文字残影。
用 `_ghosttext.mjs` 遍历 `#homeStage` 全部文本节点核实：
**只有一个**文本节点（`唐刀 · 待你锻造`，top=81）。
那道痕迹是 `--showcase-surface` 的**地面径向渐变**，不是残留文字。**未改动。**

##### 本轮改动文件

| 文件 | 改动 |
| --- | --- |
| `src/app/game.js` | `showDefault()` 材质改随机 + 会话内缓存；新增模块级 `randomGhostSkin()` |
| `css/pages/forge.css` | `.is-ghost` opacity `1` → `.58`；删除 `.goal*` 系列 |
| `src/ui/pages/forge.js` | 空态删除「还没有开始锻造。」与空卡片块 |
| `src/ui/pages/home.js` | 删除「今日目标」入口与 `showGoals()` 抽屉 |
| `src/core/daily.js` | 删除 `claimAllBonus`、`allBonusClaimed`、`DAILY_ALL_BONUS` 导入 |
| `src/core/progress.js` | 删除 `claimDailyBonus` 及其导出 |
| `src/data/balance.js` | 删除 `DAILY_ALL_BONUS` 常量及导出 |
| `src/core/saveSchema.js` | 显式丢弃旧存档 `daily.allBonusClaimed` |
| `css/pages/shell.css` | 删除 `.home-mission*` 系列 |
| `css/numeric.css` | 清单中删除已无元素的 `.home-mission-title > span` |
| `tests/save.test.mjs` | 删除已失效的「每日奖励」用例（10 → 9 项全过） |


---

## 五、平衡与参数

本报告只列**本轮实测**的数字，不复用历史 GPU/性能报告。
所有样本均为固定种子、内存夹具，不读取浏览器存档。

#### 1. 六维标尺曲线

`data/balance.js` `STAT_CURVE = { KNEE: 100, SPAN: 60, TAU: 90 }`

| 永久六维 | 测试能力 |
| --- | --- |
| 0 | 0.00 |
| 50 | 50.00 |
| 80 | 80.00 |
| 100 | 100.00 |
| 124 | 114.04 |
| 150 | 125.57 |
| 180 | 135.33 |
| 200 | 140.25 |
| 233 | 146.31 |
| 256 | 149.40 |
| 280 | 151.88 |
| 300 | 153.50 |

- ≤100 段完全不变（靶具与旧手感无需重标）；
- 100→256 相差 49.4 点（约 +49%），差异明确；
- 渐近上限 160，配合永久上限 300，堆属性不会无限碾压。

**旧对比**：改造前 100 与 256 的切割参数**完全相同**（两处 `clamp(0,100)`）。

#### 2. 分项分曲线

`TEST_SCORE = { KNEE_RATIO: 1, SPAN: 24, TAU: 0.55 }`，`ratio = 有效能力 / TEST_REF(100)`

| ratio | 项目分 |
| --- | --- |
| 0.5 | 50.0 |
| 0.8 | 80.0 |
| 1.0 | 100.0 |
| 1.2 | 107.3 |
| 1.4 | 112.4 |
| 1.5 | 114.3 |
| 1.7 | 117.3 |

最终项目分 = `testScoreOfRatio(ratio) × 操作利用率`。
**零操作 = 0 分**（初版有 0.35 保底，浏览器实测零操作得 41.3 分，已修）。

#### 3. S4 逐锤策略分布

S4 门槛：`12 / 30 / 54 / 82`，逐锤成果 `progressGain × 0.55`。
样本：每档 800 个固定种子（`seed = 90000 + i`），仅 S4、从 Risk=0 入场、单一 `precision` 标签。

| 锤数 | 存活率 | 平均档位 | 平均六维成果 |
| --- | ---: | ---: | ---: |
| 0 | 100.00% | 0.00 | 0.0 |
| 1 | 97.50% | 0.00 | 5.5 |
| 2 | 94.38% | 1.00 | 10.6 |
| 4 | 86.13% | 2.00 | 19.5 |
| 7 | 68.50% | 3.00 | 30.4 |
| 13 | 16.63% | 4.00 | 45.5 |

##### 与旧基线对比

| 档位 | 旧门槛 | 旧首次达到 | 旧 S4 存活率 | 新门槛 | 新首次达到 | 新存活率 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 一档 | 18 | 2 锤 | 94.28% | 12 | 2 锤 | 94.38% |
| 二档 | 46 | 6 锤 | 74.61% | 30 | 4 锤 | 86.13% |
| 三档 | 82 | 13 锤 | 17.55% | 54 | 7 锤 | 68.50% |
| 四档 | 126 | 30 锤 | **0.00000836%**（约 1197 万次一次） | 82 | 13 锤 | 16.63% |

**关键结论**：最高档从「事实不可达」变为 16.63% 存活率；且第 1 锤起每锤都有可见六维成果，
中间锤不再只加 Risk（旧版第 3–5 锤仅增风险与进度，永久收益由档位读取）。

> 局限：本表是**纯 S4** 环境（不含 S2/S3/S5–S9 的阶段检查），因此是**存活率上界**，
> 完整一局的断裂率高于此表。整局成功率平衡未做（任务书标注为待平衡）。

#### 4. 九方向差异

旧版：`HAMMER_TRAITS` 九种方向在同档下 `statDelta` 与 `scoreMult` **完全一致**，只换名字。

新版：`HAMMER_DIRECTION_VECTORS` 每方向独立分配（示意，和为 1）：

| 方向 | 主项 | 次项 |
| --- | --- | --- |
| precision | craft 0.62 | design 0.20 / toughness 0.10 |
| stable | toughness 0.58 | craft 0.22 / strength 0.20 |
| flow | design 0.50 | spirit 0.30 / sharpness 0.20 |
| layer | strength 0.42 | toughness 0.40 / craft 0.18 |
| edge | sharpness 0.66 | craft 0.20 / strength 0.14 |
| heat | strength 0.48 | spirit 0.34 / toughness 0.18 |
| cold | toughness 0.44 | sharpness 0.40 / craft 0.16 |
| oxide | design 0.44 | spirit 0.40 / craft 0.16 |
| mixed | 六维均匀 0.15–0.18 | — |

#### 5. 刀型能力画像（12 型 × 5 项）

`KNIFE_PROFILES`，围绕 1.0 浮动（0.88–1.12）。抽样：

| 刀型 | 标签 | cutting | precision | strength | durability | extreme |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| folding | 精密便携 | 0.94 | **1.12** | 0.88 | 0.92 | 0.92 |
| machete | 宽刃劈砍 | **1.12** | 0.90 | 1.05 | 0.98 | 0.96 |
| survival | 结构冗余 | 1.00 | 0.97 | 1.04 | **1.12** | 1.06 |
| karambit | 弧刃内钩 | **1.12** | 0.98 | 0.92 | 0.93 | 0.95 |
| tangdao | 修长气道 | 1.04 | 1.06 | 0.97 | 0.98 | 1.02 |
| straight | 通用均衡 | 1.00 | 0.99 | 1.06 | 1.04 | 1.00 |

**反向占优实测（A09，固定操作质量 0.8、同种子 555）**：

|  | 精密赛（精度+切割） | 锻压赛（强度+耐久） |
| --- | ---: | ---: |
| 精密刀（折叠 + 精密6） | **90.0** | 74.8 |
| 结构刀（生存 + 层叠6） | 75.5 | **91.3** |

两把刀互为反向优势，且**不是**按鉴定分排序（两把刀 score 均设为 400）。

#### 6. 六流派赛事定义

| 流派 | 项目组合 | 权重 | 指纹 |
| --- | --- | --- | --- |
| 锻压 press | 强度 + 耐久 | 0.55 / 0.45 | strength+durability |
| 锋刃 edge | 切割 + 耐久 | 0.60 / 0.40 | cutting+durability |
| 精密 precise | 精度 + 切割 | 0.60 / 0.40 | precision+cutting |
| 淬彩 quench | 耐久 + 极限 | 0.55 / 0.45 | durability+extreme |
| 复合 composite | 切割 + 强度 + 精度 | 0.34 / 0.33 / 0.33 | cutting+strength+precision |
| 过载 overload | 强度 + 极限 | 0.50 / 0.50 | strength+extreme |

六流派指纹 **6/6 互不相同**（旧基线：同刀同种子六分支得到完全相同的目标分 3035/3570/4284 与首批靶具）。

五档：目标分 84 / 88 / 92 / 96 / 100；靶具硬度 ×1.00→×1.24；操作窗口 ×1.00→×0.80。

#### 7. 靶具三层（armor / health / damage）

| 靶具 | armor | health | damage | 破甲量(×0.6) |
| --- | ---: | ---: | ---: | ---: |
| 编织绳束 rope | 0 | 1.0 | 0.02 | 0 |
| 塑料泡棉 foam | 0 | 1.1 | 0.01 | 0 |
| 纹理木桩 wood | 0.45 | 1.5 | 0.30 | 0.27 |
| 工程塑料板 plastic | 0.60 | 1.7 | 0.38 | 0.36 |
| 透明冰块 ice | 0.62 | 1.4 | 0.26 | 0.372 |
| 金属管 metal | 1.00 | 1.3 | 0.72 | 0.60 |

实测（同种子 321，快速模式）：

| 能力 | 木桩击数 | 金属管击数 | 木桩反作用损伤 | 金属管反作用损伤 |
| --- | ---: | ---: | ---: | ---: |
| 全 60（低） | 3 | 2 | 5.5 | 5.6 |
| 全 250（高） | 2 | 2 | 2.0 | 3.5 |

软靶（绳束/泡棉）仍为**一击断**。

#### 8. S7 描线评价

权重：贴合 55% / 完成 30% / 稳定 15%；完成度门槛 `EDGE_COVERAGE_MIN = 0.55`。

| 路径 | 档位 | quality | 贴合 | 完成 | 稳定 |
| --- | --- | ---: | ---: | ---: | ---: |
| 未触摸 | MISS | 0.000 | 0 | 0 | 0 |
| 主动跳过 | MISS | 0.000 | 0 | 0 | 0 |
| 局部完美 30% | MISS | 0.340 | 1.00 | 0.33 | 1.00 |
| 完整稳定 | PERFECT | 1.000 | 1.00 | 1.00 | 1.00 |
| 完整抖动 ±0.10 | GREAT | 0.715 | 0.75 | 1.00 | 0.00 |
| 稀疏采样 1/3 | PERFECT | 0.946 | 0.99 | 0.92 | 0.86 |

**旧基线**：1000 种子默认（未触摸）路径得到 497 次 GOOD / 503 次 MISS —— 不操作也有约一半概率拿正向评价。

刀型刃线差异：`karambit` 与 `machete` 同种子基准线平均差 0.377（刀型不同 → 题目不同）；旧版题目与刀型无关。

#### 9. 纯逻辑耗时采样（桌面 Node，**不是**移动帧率）

脚本：`node docs/rework/2026-10-24/bench-logic.mjs`（可复现）
环境：Windows / Node.js v24.22.1 / 桌面 CPU。

| 场景 | n | avg | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 选卡抽取（3 张，含解锁加权） | 2000 | 0.007ms | 0.005ms | 0.011ms | 0.508ms |
| 成刀适配（六维 100） | 3000 | 0.004ms | 0.002ms | 0.006ms | 0.248ms |
| 成刀适配（六维 256） | 3000 | 0.004ms | 0.002ms | 0.007ms | 0.292ms |
| 分项计分（3 项 + 合成） | 1000 | 0.006ms | 0.005ms | 0.010ms | 0.238ms |
| 赛事构建（流派赛） | 1000 | 0.008ms | 0.007ms | 0.012ms | 0.395ms |
| 图鉴进度视图（460 项） | 300 | 0.024ms | 0.018ms | 0.032ms | 0.497ms |
| 全国赛五轮全通（逻辑） | 200 | 0.050ms | 0.041ms | 0.107ms | 0.383ms |

**结论（限定范围）**：所有新增规则层的开销都在 **0.1ms 以下（p95）**，
相对于一帧 16.7ms（60 FPS）可以忽略。
→ 如果发现卡顿，**原因不在这些规则计算**，应在渲染/布局/资源加载侧查。

**这份数据不能用来声称以下任何一项**：
- 移动设备帧率（需真机）；
- 首帧/着色器编译耗时（需浏览器 + WebGL）；
- P95 选卡预览延迟（包含布局与合成，需真实浏览器）。

#### 10. 浏览器实测采样（真实 Chrome，手机视口模拟）

脚本：`node docs/rework/2026-10-24/bench-browser.mjs`

| 项 | 值 |
| --- | --- |
| 浏览器 | Chrome（headed，真实 GPU 合成 + vsync） |
| GPU / 显示器 | NVIDIA RTX 5070 / 2560×1440 @ **180Hz** |
| 视口 | 390×844 @DPR3（手机视口模拟，**非真机**） |
| 存档 | 全新隔离 context，不碰用户存档 |
| 样本 | 预览 20 次；切卡 30 轮；切页 10 轮 |

| 指标 | 结果 |
| --- | --- |
| 冷启动 DOMContentLoaded | 705ms |
| 首页就绪（含着色器） | 约 0.7–1.0s（多次运行区间） |
| 选卡预览 p50 / p95 / max | **7.6ms / 27.4ms / 27.4ms** |
| 30 次卡预览往返 | 约 200ms（均 ~6.8ms） |
| 10 次切页往返 | 约 1560ms（均 ~156ms） |
| JS heap 初始 → 预览后 → 切页后 | **未观察到单调增长** |
| 空闲帧率（锻造页带 3D） | ~180 FPS（显示器 180Hz） |
| 控制台 error / pageerror | **0** |

##### 10.1 CPU 6× 限速（低端设备近似）

真机不可得，改用 CDP `Emulation.setCPUThrottlingRate` 做低端设备代理（业界通行做法）。

**先说说口径的变化（诚实记录）**：
第一次只用 n=20，得到 p95=113.9ms 且 p95==max —— 这实际上是**单次尖峰**，
不能代表稳态。任务书要求注明冷/热状态，因此扩到 **n=50 并分离冷/热**。

| 指标 | 不限速 | **6× 限速 (n=50)** | 任务书目标 | 结论 |
| --- | ---: | ---: | --- | --- |
| 选卡预览 p50 | 7.6ms | **55.5ms** | — | 可用 |
| 选卡预览 **p95** | 27.4ms | **90.2ms** | 约 100ms | ✅ **在目标内** |
| 选卡预览 max | 27.4ms | **97.7ms** | — | 未超 100ms |
| 空闲帧率 | 180 FPS | **138 FPS** | 争 60 FPS | ✅ 达标 |

冷/热分离：

| 阶段 | n | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| 冷（首次点每张卡） | 5 | 53.5ms | — | 55.6ms |
| 热（稳态重覆点击） | 45 | 55.7ms | **90.2ms** | 97.7ms |

**结论**：
- 6× CPU 限速下选卡预览 **p95 = 90.2ms，在任务书「约 100ms」目标内**，
  但余量不大（仅约 10%）。
- max 97.7ms 已接近上限，说明**存在偶发尖峰**；样本再大一些可能越线。
- 冷态反而比热态稳（53.5 vs 55.7ms p50）：因为冷态时视觉切换还没进稳态重绘，
  而热态的波动来自 GC 与布局抖动。
- 帧率仍有 138 FPS，说明**主循环不是瓶颈**；耗时集中在选卡预览的那一次同步更新
  （重建卡 DOM + 重新计算布局 + 预览视觉切换）。
- 复现：`FORGE_CPU_THROTTLE=6 node docs/rework/2026-10-24/bench-browser.mjs`

**仍存在的优化空间（本轮未实施）**：
1. 选卡预览时只更新必需的视觉层，不重建整张卡 DOM（当前 `mountedCards !== cardKey` 会整批重建）；
2. 把预览产生的布局变更限制在 `transform/opacity`（避免重排）；
3. 预热阶段预生成卡节点池，预览时只切换 class。

##### 解读与边界（不要当成已全达标）

1. **桌面不限速 p95 27.4ms、限速 p95 90.2ms**，均未超过 100ms 目标；
   但限速下 max 97.7ms 已贴边，**余量不大**，不应宣传为“性能优秀”。
2. **180 FPS 不是“性能远超需求”的证明** —— 显示器本身是 180Hz，
   这个数字只是 vsync 上限，说明**未掉帧**，不说明预算宽裕。
3. **手机视口模拟 ≠ 真机**：DPR3 + 390×844 只改变布局与像素量，
   真机的 GPU 限制、散热降频、内存压力均未覆盖。这是本项**最大未测风险**。
4. **heap 无增长**不能据此声称“零泄漏”；只能说本轮 30+10 轮操作
   **未观察到单调增长**。长时间（小时级）会话未测。
5. 切页均 156ms 偏高：主要来自 3D 舞台重新挂载与资源准备，属已有实现，本轮未优化。

#### 11. 已知局限（不冒充已完成）

1. S4 表是纯 S4 环境，**整局**断裂率未测；成功率整体平衡未做。
2. 目标分 84–100 是在「操作质量 0.8 + 两块专长夹具」下校准的，**未做全卡池大样本分布**，因此稀有度与目标分的联动仍属初版。
3. 靶具 `ARMOR_SCALE = 0.6` 是为了「总击数接近改造前」而选的，未做逐材料手感量表。
4. **无移动真机验证**：第 10 节是桌面 Chrome + 手机视口模拟 + CPU 限速代理，
   不能代替 Android/iOS 真机的帧率、发热与内存结论。
5. **选卡预览在低端近似下已进目标但余量不大**（6× 限速 p95 90.2ms、max 97.7ms，
   目标 100ms）；优化方向已写入 10.1，本轮未实施。
6. 未做真人留存与长期复玩验证。

