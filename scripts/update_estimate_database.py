from __future__ import annotations

import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROCESSED_ROOT = PROJECT_ROOT / "data" / "processed"
RAW_ROOT = PROJECT_ROOT / "data" / "raw_estimates"


def run_step(title: str, script_name: str) -> None:
    print(f"\n== {title} ==")
    sys.stdout.flush()
    command = [sys.executable, str(PROJECT_ROOT / "scripts" / script_name)]
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)


def main() -> None:
    if not RAW_ROOT.exists():
        raise SystemExit(f"원본 견적서 폴더가 없습니다: {RAW_ROOT}")

    run_step("견적서 원본에서 품목 데이터 추출", "extract_estimate_items.py")
    run_step("검색용 엑셀 파일 생성", "build_estimate_search_workbook.py")

    print("\n완료")
    print(f"- 품목 CSV: {PROCESSED_ROOT / 'estimate_items.csv'}")
    print(f"- 파일 CSV: {PROCESSED_ROOT / 'estimate_files.csv'}")
    print(f"- 검색 엑셀: {PROCESSED_ROOT / 'estimate_search.xlsx'}")


if __name__ == "__main__":
    main()
