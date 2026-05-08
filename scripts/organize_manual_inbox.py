from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INBOX_ROOT = PROJECT_ROOT / "data" / "manual_inbox"
ARCHIVE_ROOT = PROJECT_ROOT / "data" / "raw_estimates" / "견적서" / "수동정리"
SUPPORTED_SUFFIXES = {".xlsx", ".xls", ".xlsm", ".csv"}


def month_from_file(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m")


def unique_destination(path: Path) -> Path:
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    for index in range(2, 1000):
        candidate = path.with_name(f"{stem}_{index}{suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Too many duplicate filenames for {path.name}")


def organize() -> tuple[int, Path]:
    INBOX_ROOT.mkdir(parents=True, exist_ok=True)
    ARCHIVE_ROOT.mkdir(parents=True, exist_ok=True)

    moved = 0
    for path in sorted(INBOX_ROOT.iterdir()):
        if not path.is_file() or path.name.startswith("~$"):
            continue
        if path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue

        month_dir = ARCHIVE_ROOT / month_from_file(path)
        month_dir.mkdir(parents=True, exist_ok=True)
        destination = unique_destination(month_dir / path.name)
        shutil.move(str(path), str(destination))
        moved += 1

    return moved, INBOX_ROOT


def main() -> None:
    moved, inbox = organize()
    print(f"manual inbox: {inbox}")
    print(f"manual files organized: {moved}")


if __name__ == "__main__":
    main()
