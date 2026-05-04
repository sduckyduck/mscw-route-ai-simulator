"""Import app_metadata/*.json from a game-data zip into public/data/app_metadata.

Usage:
  python scripts/import_metadata.py /path/to/cbt-patch.zip

The script intentionally copies only app_metadata, not the huge raw dump. The simulator
uses normalized monsters/maps/portals/items/skills/quests JSON files from app_metadata.
"""
from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "data" / "app_metadata"


def normalize_zip_name(name: str) -> str:
    return name.replace("\\", "/")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/import_metadata.py /path/to/data.zip", file=sys.stderr)
        return 2

    zip_path = Path(sys.argv[1]).expanduser().resolve()
    if not zip_path.exists():
        print(f"Zip not found: {zip_path}", file=sys.stderr)
        return 1

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    copied = 0
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            normalized = normalize_zip_name(info.filename)
            if not normalized.startswith("app_metadata/") or not normalized.endswith(".json"):
                continue
            target = OUT_DIR / Path(normalized).name
            with zf.open(info) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            copied += 1

    print(f"Copied {copied} JSON files to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
