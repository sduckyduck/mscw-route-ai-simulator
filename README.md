# MSCW 开荒路线 AI 模拟训练机器人

这是一个基于 MapleStory Classic World 数据 zip 的职业开荒路线模拟器原型。玩家选择职业、起始等级、目标等级和策略后，软件会自动从怪物、地图、传送门数据里构建候选训练点，并估算：

- 每个等级段推荐刷哪张图
- 主要打什么怪
- 预计 EXP/h
- 预计耗时
- 预计药耗
- 预计净金币/材料价值
- 跑图成本和风险评分

> 当前版本是 v0.1：规则模型 + 搜索优化。它不是直接让 LLM 瞎编路线，而是先让“AI 小人”用数据跑模拟。后面可以再接 GPT/LLM 只负责解释结果、生成攻略文案。

## 项目结构

```text
mscw-route-ai-simulator/
├─ public/data/app_metadata/   # 从 zip 导入的 monsters/maps/items/skills/quests 等 JSON
├─ scripts/import_metadata.py  # 后续更新 zip 数据用
├─ src/simulator/              # 核心模拟器
│  ├─ data.ts                  # 读取并整理怪物/地图/传送门
│  ├─ combat.ts                # 职业战斗效率、药耗、风险估算
│  ├─ optimizer.ts             # 路线搜索与等级段合并
│  ├─ jobs.ts                  # 各职业参数
│  ├─ travel.ts                # 地图连接/跑图成本
│  └─ expTable.ts              # 经验表，后续建议替换为准确表
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

## 创建 GitHub Repo

推荐新建 repo 名：

```text
mscw-route-ai-simulator
```

然后本地执行：

```bash
git init
git add .
git commit -m "Initial AI route simulator"
git branch -M main
git remote add origin https://github.com/sduckyduck/mscw-route-ai-simulator.git
git push -u origin main
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

- `monsters.json`：怪物等级、HP、EXP、伤害、所在地图、数量
- `maps.json`：地图名称、区域、是否城镇
- `portals.json`：地图连接关系，用来估算跑图成本

每张有怪的非城镇地图会变成一个 `TrainingSpot`。

### 2. 职业差异

每个职业有独立参数：

- DPS 成长
- 攻击距离
- 群攻能力
- 机动性
- 命中能力
- 生存能力
- 药耗倍率
- 推荐打怪等级差

所以同一张图对枪战士、牧师、刺客、弓箭手的评分会不同。

### 3. 路线策略

目前有四种：

- 最快冲级：EXP/h 权重最高
- 均衡开荒：EXP、药耗、金币、跑图成本都考虑
- 低药耗安全：风险和药耗惩罚更高
- 赚钱/材料优先：净金币和材料价值权重更高

### 4. 为什么不是直接照搬攻略

传统攻略通常是固定路线：1-10 某图，10-20 某图。这个项目会根据职业参数、怪物数据、地图密度、药耗、等级差、跑图成本重新计算。以后你补充掉落表、任务 EXP、装备升级后，同一个职业路线也会自动变化。

## 下一步建议

### 必做

1. 替换准确 EXP 表。
2. 把真实药水价格、MP/HP 消耗接进模型。
3. 从 items/crafting/drop 数据里建立材料价值表。
4. 给法师加入属性克制；给牧师加入 undead 加权。
5. 加入任务路线，不只刷怪。

### 进阶

1. 加“装备升级决策”：到某等级是否该做/买武器。
2. 加“背包容量和回城补给”模拟。
3. 加“多人抢图/地图拥挤”惩罚。
4. 加“国服/国际服版本选择”：国服加入海盗职业和海盗装备池。
5. 加 LLM 解释层：把模拟结果自动写成 B 站口播稿、图文攻略和路线表。

## 数据声明

当前数据来自你上传的 CBT patch zip 中的 `app_metadata`。模拟结果是算法估算，用来比较路线优劣，不等于游戏实测结果。真正发布攻略前建议用玩家实测数据校准参数。
