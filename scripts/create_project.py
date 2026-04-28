#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def copy_template(out_dir: Path, force: bool) -> None:
    root = Path(__file__).resolve().parents[1]
    template = root / "assets" / "frontend-template"
    if not template.exists():
        raise SystemExit(f"Missing template directory: {template}")

    if out_dir.exists():
        if not force:
            raise SystemExit(f"Output already exists: {out_dir}. Pass --force to replace it.")
        shutil.rmtree(out_dir)

    shutil.copytree(template, out_dir)
    print(f"Created interior preview project at {out_dir}")
    print("Next steps:")
    print(f"  cd {out_dir}")
    print("  npm install")
    print("  npm run build")
    print("  npm run dev")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a Three.js interior preview project from the bundled template.")
    parser.add_argument("--out", required=True, help="Output project directory")
    parser.add_argument("--force", action="store_true", help="Replace output directory if it already exists")
    args = parser.parse_args()
    copy_template(Path(args.out).expanduser().resolve(), args.force)


if __name__ == "__main__":
    main()
