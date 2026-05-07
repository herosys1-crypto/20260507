from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from typing import Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ITEMS_CSV = PROJECT_ROOT / "data" / "processed" / "estimate_items.csv"


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^0-9a-zA-Z가-힣]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens_from_query(query: Iterable[str]) -> list[str]:
    text = normalize(" ".join(query))
    return [token for token in text.split(" ") if token]


def score_row(row: dict[str, str], tokens: list[str]) -> int:
    haystacks = {
        "spec": normalize(row.get("spec", "")),
        "category": normalize(row.get("item_category", "")),
        "customer": normalize(row.get("customer_hint", "")),
        "recipient": normalize(row.get("recipient", "")),
        "attention": normalize(row.get("attention", "")),
        "file": normalize(row.get("source_file", "")),
        "all": normalize(
            " ".join(
                [
                    row.get("spec", ""),
                    row.get("item_category", ""),
                    row.get("customer_hint", ""),
                    row.get("recipient", ""),
                    row.get("attention", ""),
                    row.get("source_file", ""),
                ]
            )
        ),
    }

    score = 0
    for token in tokens:
        if token in haystacks["spec"]:
            score += 50
        if token in haystacks["category"]:
            score += 20
        if token in haystacks["customer"]:
            score += 15
        if token in haystacks["recipient"] or token in haystacks["attention"]:
            score += 10
        if token in haystacks["file"]:
            score += 8
        if token not in haystacks["all"]:
            return 0
    return score


def numeric_price(row: dict[str, str]) -> int:
    value = row.get("quoted_unit_price", "").replace(",", "").strip()
    try:
        return int(float(value))
    except ValueError:
        return 0


def load_rows() -> list[dict[str, str]]:
    if not ITEMS_CSV.exists():
        raise SystemExit(f"Missing data file: {ITEMS_CSV}")
    with ITEMS_CSV.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def search(query: list[str], limit: int) -> list[dict[str, str]]:
    tokens = tokens_from_query(query)
    if not tokens:
        raise SystemExit("검색어를 입력하세요.")

    matches = []
    for row in load_rows():
        score = score_row(row, tokens)
        if score:
            row = dict(row)
            row["_score"] = str(score)
            matches.append(row)

    matches.sort(
        key=lambda row: (
            int(row["_score"]),
            row.get("quote_date", ""),
            numeric_price(row),
        ),
        reverse=True,
    )
    return matches[:limit]


def print_table(rows: list[dict[str, str]]) -> None:
    if not rows:
        print("검색 결과가 없습니다.")
        return

    fields = [
        ("quote_date", "견적일", 10),
        ("customer_hint", "폴더", 12),
        ("recipient", "수신", 12),
        ("attention", "참조", 12),
        ("item_category", "품목", 8),
        ("spec", "부품명/규격", 42),
        ("quantity", "수량", 5),
        ("quoted_unit_price", "단가", 10),
        ("source_file", "원본파일", 28),
    ]

    def clip(value: str, width: int) -> str:
        value = value or ""
        if len(value) <= width:
            return value
        return value[: max(width - 1, 0)] + "…"

    print(" | ".join(title.ljust(width) for _, title, width in fields))
    print("-" * 160)
    for row in rows:
        print(" | ".join(clip(row.get(key, ""), width).ljust(width) for key, _, width in fields))


def export_csv(rows: list[dict[str, str]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "quote_date",
        "customer_hint",
        "recipient",
        "attention",
        "item_category",
        "spec",
        "quantity",
        "unit",
        "quoted_unit_price",
        "amount",
        "source_file",
        "source_path",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})
    print(f"exported: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="과거 견적 품목과 견적단가를 검색합니다.")
    parser.add_argument("query", nargs="+", help="검색어. 예: 5060 케이제이씨")
    parser.add_argument("--limit", type=int, default=30, help="출력 개수")
    parser.add_argument("--export", type=Path, help="검색 결과를 CSV로 저장할 경로")
    args = parser.parse_args()

    rows = search(args.query, args.limit)
    print_table(rows)
    if args.export:
        export_csv(rows, args.export)


if __name__ == "__main__":
    main()

