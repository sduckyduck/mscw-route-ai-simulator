# MSCW 开荒路线 AI 模拟训练机器人

这是一个基于 MapleStory Classic World 数据 zip 的职业开荒路线模拟器原型。玩家选择职业、起始等级、目标等级和策略后，软件会自动从怪物、地图、传送门数据里构建候选训练点，并估算：

- 每个等级段推荐刷哪张图
- 主要打什么怪
- 预计 EXP/h
- 预计耗时
- 预计药耗
- 预计净金币/材料价值
- 跑图成本和风险评分

> 当前版本是 v0.2：准确 Lv.1–51 EXP 表 + 公式化战斗模型 + 路线搜索优化。它不是直接让 LLM 瞎编路线，而是先让“AI 小人”用数据跑模拟。后面可以再接 GPT/LLM 只负责解释结果、生成攻略文案。

## 项目结构

```text
mscw-route-ai-simulator/
├─ public/data/app_metadata/   # 从 zip 导入的 monsters/maps/items/skills/quests 等 JSON
├─ scripts/import_metadata.py  # 后续更新 zip 数据用
├─ src/simulator/              # 核心模拟器
│  ├─ data.ts                  # 读取并整理怪物/地图/传送门
│  ├─ combat.ts                # 每击伤害、命中、药耗、风险估算
│  ├─ damageFormula.ts         # 物理/魔法伤害公式、防御、等级差、暴击、命中近似
│  ├─ optimizer.ts             # 路线搜索与等级段合并
│  ├─ jobs.ts                  # 各职业参数
│  ├─ travel.ts                # 地图连接/跑图成本
│  └─ expTable.ts              # Lv.1–51 准确经验表 + 高等级外推
├─ src/App.tsx                 # 前端交互界面
└─ vite.config.ts              # Cloudflare Pages 使用 base: '/'
```

## 本地运行

```bash
npm install
npm run dev
```

打开终端给出的本地地址，一般是：

```text
http://localhost:5173/
```

## 更新数据

把新的游戏数据 zip 放到本地后运行：

```bash
python scripts/import_metadata.py "D:/你的路径/cbt-patch.zip"
```

这个脚本只会复制 `app_metadata/*.json` 到：

```text
public/data/app_metadata/
```

## 部署到 Cloudflare Pages

Cloudflare Pages 设置：

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
```

`vite.config.ts` 已经设置：

```ts
base: '/'
```

所以部署到 Cloudflare Pages 或自定义域名时不需要像 GitHub Pages 那样写 `/repo-name/`。

## 当前模拟模型逻辑

### 1. 地图候选点生成

模拟器读取：

- `monsters.json`：怪物等级、HP、EXP、伤害、物防、魔防、命中、回避、所在地图、数量
- `maps.json`：地图名称、区域、是否城镇
- `portals.json`：地图连接关系，用来估算跑图成本

每张有怪的非城镇地图会变成一个 `TrainingSpot`。

### 2. EXP 表

Lv.1–51 使用你提供的 CBT 经验表，来源说明：

```text
Experience Table
Reverse engineered by @wolffy on Discord
```

`expToNextLevel(level)` 返回当前等级升到下一级所需经验。`accumulatedExpAtLevel(level)` 返回到达该等级的累计经验。

Lv.51 之后当前使用外推曲线，前端/模拟结果会提示 warning。等你拿到更高等级准确表之后，只需要继续补 `src/simulator/expTable.ts`。

### 3. 战斗公式

`damageFormula.ts` 目前包含：

- 物理伤害 MIN/MAX
- 魔法伤害 MIN/MAX
- Weapon Min/Max multipliers
- 防御削减：`Damage × 100 / (Defense + 100)`
- 元素倍率：immune / resistant / neutral / weak 的结构已预留
- 等级差惩罚：只在怪物等级高于玩家时生效
- 基础暴击：5% crit rate，20% crit damage
- Iron Arrow falloff 结构后续可加，目前未接技能多目标细节
- Damage clamp：1 到 700,000,000,000

命中/回避部分目前是可调近似，因为你给的资料里还没有最终准确 ACC/EVA 公式。代码已经把它独立封装成 `estimateHitChance()`，后面拿到真实公式可以直接替换，不影响路线搜索逻辑。

### 4. 职业差异

每个职业有独立参数：

- 主属性/副属性估算
- 武器类型和 weapon multiplier
- 技能倍率/魔法技能伤害估算
- 攻击间隔
- 攻击距离
- 群攻能力
- 机动性
- 命中能力
- 生存能力
- 药耗倍率
- 推荐打怪等级差

所以同一张图对枪战士、牧师、刺客、弓箭手的评分会不同。

### 5. 路线策略

目前有四种：

- 最快冲级：EXP/h 权重最高
- 均衡开荒：EXP、药耗、金币、跑图成本都考虑
- 低药耗安全：风险和药耗惩罚更高
- 赚钱/材料优先：净金币和材料价值权重更高

### 6. 为什么不是直接照搬攻略

传统攻略通常是固定路线：1-10 某图，10-20 某图。这个项目会根据职业参数、怪物数据、地图密度、药耗、等级差、跑图成本重新计算。以后你补充掉落表、任务 EXP、装备升级后，同一个职业路线也会自动变化。

## 下一步建议

### 必做

1. 补 Lv.52+ 准确 EXP 表。
2. 把真实药水价格、MP/HP 消耗接进模型。
3. 从 items/crafting/drop 数据里建立材料价值表。
4. 给法师加入真实属性克制；给牧师加入 undead 加权。
5. 加入任务路线，不只刷怪。
6. 用实测击杀时间校准 `damageFormula.ts` 里的 physical/magic calibration。

### 进阶

1. 加“装备升级决策”：到某等级是否该做/买武器。
2. 加“背包容量和回城补给”模拟。
3. 加“多人抢图/地图拥挤”惩罚。
4. 加“国服/国际服版本选择”：国服加入海盗职业和海盗装备池。
5. 加 LLM 解释层：把模拟结果自动写成 B 站口播稿、图文攻略和路线表。

## 数据声明

当前数据来自你上传的 CBT patch zip 中的 `app_metadata`。模拟结果是算法估算，用来比较路线优劣，不等于游戏实测结果。真正发布攻略前建议用玩家实测数据校准参数。
