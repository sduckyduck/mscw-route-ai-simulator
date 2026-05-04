# MSCW Opening AI Python Lab

Python-first training and validation pipeline for MapleStory Classic World opening-route AI.

This project separates the heavy AI work from the browser UI:

- ETL: normalize WZ/exported JSON data into ML-ready tables.
- Simulator: fast numerical environment for leveling, AP/SP, accuracy, potion cost, gear, deaths, map transitions.
- RL: train a single-objective new-server opening agent.
- Supervised/imitation learning: learn from hand-written route guides or scraped community strategies.
- Guide generator: export structured JSON/Markdown for the guidebook site.

## Goal

The AI has only one core objective:

> Find the best new-server opening route under low-resource constraints.

It should not learn vague objectives such as comfort or fun. Reward is based on:

- lower time to target level;
- lower death risk;
- lower potion cost;
- lower equipment cost;
- no bankruptcy;
- stable hit rate;
- valid AP/SP/equipment constraints;
- efficient map transition timing.

## Project layout

```text
python_ai/
  pyproject.toml
  README.md
  configs/
    opening_default.yaml
  data/
    raw/
    processed/
    labels/
  outputs/
    guides/
    models/
    reports/
  scripts/
    build_dataset.py
    train_rl.py
    train_supervised.py
    generate_guide.py
    validate_guide.py
  mscw_ai/
    etl/
      wz_loader.py
      meowdb_scraper.py
      dataset_builder.py
    sim/
      accuracy.py
      exp_table.py
      equipment.py
      combat.py
      environment.py
    rl/
      rewards.py
      dqn.py
      ppo_stub.py
    guide/
      schema.py
      generator.py
    utils/
      io.py
```

## Quick start

```bash
cd python_ai
python -m venv .venv
.venv\Scripts\activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e .

python scripts/build_dataset.py --source ../public/data/app_metadata --out data/processed
python scripts/train_rl.py --config configs/opening_default.yaml
python scripts/generate_guide.py --model outputs/models/opening_q_table.json --out outputs/guides/sample_guide.json
```

## Output guide JSON

```json
{
  "job": "spearman",
  "target": "new_server_opening",
  "segments": [
    {
      "level_range": "10-15",
      "recommended_map": "Damp Forest",
      "primary_mobs": ["Slime", "Octopus"],
      "ap_distribution": "Add DEX only when hit rate falls below threshold; otherwise STR.",
      "sp_priority": ["Precise Strikes if hit rate is low", "Power Strike for kill speed"],
      "gear_policy": "Do not buy expensive gear unless it improves hit-rate or kill-time enough to offset cost.",
      "reasoning": "Stable hit rate and low potion burn make this map better than higher-level alternatives."
    }
  ]
}
```
