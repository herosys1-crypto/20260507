from __future__ import annotations

import csv
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = PROJECT_ROOT / "data" / "raw_estimates"
PROCESSED_ROOT = PROJECT_ROOT / "data" / "processed"


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value).replace("\xa0", " ").replace("\n", " ").strip()


def parse_number(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        if float(value).is_integer():
            return str(int(value))
        return str(value)
    text = clean(value).replace(",", "")
    return text


def normalize_key(*parts: str) -> str:
    text = " ".join(p for p in parts if p)
    text = text.lower()
    text = re.sub(r"[^0-9a-zA-Z가-힣]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def date_from_filename(name: str) -> str:
    match = re.search(r"(20\d{2})[-_. ]?(\d{2})[-_. ]?(\d{2})", name)
    if not match:
        return ""
    year, month, day = match.groups()
    try:
        return datetime(int(year), int(month), int(day)).date().isoformat()
    except ValueError:
        return ""


def find_label_value(ws, label: str, max_row: int = 20, max_col: int = 10) -> str:
    normalized = label.replace(" ", "")
    for row in range(1, min(ws.max_row, max_row) + 1):
        for col in range(1, min(ws.max_column, max_col) + 1):
            value = clean(ws.cell(row, col).value).replace(" ", "")
            if value == normalized:
                for offset in range(1, 3):
                    candidate = clean(ws.cell(row, col + offset).value)
                    if candidate:
                        return candidate
    return ""


def find_quote_date(ws) -> str:
    for row in range(1, min(ws.max_row, 20) + 1):
        for col in range(1, min(ws.max_column, 10) + 1):
            value = clean(ws.cell(row, col).value).replace(" ", "")
            if value in {"일자", "일자:"}:
                for offset in range(1, 5):
                    candidate = ws.cell(row, col + offset).value
                    text = clean(candidate)
                    if text:
                        return text
    return ""


def find_header(ws) -> tuple[int, int] | None:
    for row in range(1, min(ws.max_row, 60) + 1):
        for col in range(1, min(ws.max_column, 20) + 1):
            value = clean(ws.cell(row, col).value)
            if value == "No.":
                return row, col
    return None


def extract_xlsx(path: Path) -> tuple[list[dict[str, str]], dict[str, str]]:
    rows: list[dict[str, str]] = []
    rel_path = str(path.relative_to(RAW_ROOT))
    folder_parts = path.relative_to(RAW_ROOT).parts[:-1]
    customer_hint = folder_parts[-1] if folder_parts else ""

    file_record = {
        "source_path": rel_path,
        "source_file": path.name,
        "source_folder": "\\".join(folder_parts),
        "customer_hint": customer_hint,
        "file_extension": path.suffix.lower(),
        "file_modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
        "status": "ok",
        "item_count": "0",
        "note": "",
    }

    try:
        workbook = load_workbook(path, data_only=True, read_only=True)
    except Exception as exc:
        file_record["status"] = "error"
        file_record["note"] = f"{type(exc).__name__}: {exc}"
        return rows, file_record

    try:
        for ws in workbook.worksheets:
            header = find_header(ws)
            if not header:
                continue

            header_row, no_col = header
            recipient = find_label_value(ws, "수신")
            attention = find_label_value(ws, "참조")
            quote_title = find_label_value(ws, "견적명")
            quote_date = find_quote_date(ws) or date_from_filename(path.name)

            for row_num in range(header_row + 1, min(ws.max_row, 300) + 1):
                item_no = clean(ws.cell(row_num, no_col).value)
                item_category = clean(ws.cell(row_num, no_col + 1).value)
                spec = clean(ws.cell(row_num, no_col + 2).value)
                quantity = parse_number(ws.cell(row_num, no_col + 3).value)
                unit = clean(ws.cell(row_num, no_col + 4).value)
                unit_price = parse_number(ws.cell(row_num, no_col + 5).value)
                amount = parse_number(ws.cell(row_num, no_col + 6).value)

                if not item_no.isdigit():
                    continue
                if not item_category and not spec:
                    continue

                rows.append(
                    {
                        "source_path": rel_path,
                        "source_file": path.name,
                        "source_folder": "\\".join(folder_parts),
                        "customer_hint": customer_hint,
                        "quote_date": quote_date,
                        "recipient": recipient,
                        "attention": attention,
                        "quote_title": quote_title,
                        "sheet_name": ws.title,
                        "item_no": item_no,
                        "item_category": item_category,
                        "part_name": spec,
                        "spec": spec,
                        "quantity": quantity,
                        "unit": unit,
                        "quoted_unit_price": unit_price,
                        "amount": amount,
                        "normalized_part_key": normalize_key(item_category, spec),
                    }
                )
    finally:
        workbook.close()

    file_record["item_count"] = str(len(rows))
    if not rows:
        file_record["status"] = "no_items"
    return rows, file_record


def main() -> None:
    PROCESSED_ROOT.mkdir(parents=True, exist_ok=True)

    item_fields = [
        "source_path",
        "source_file",
        "source_folder",
        "customer_hint",
        "quote_date",
        "recipient",
        "attention",
        "quote_title",
        "sheet_name",
        "item_no",
        "item_category",
        "part_name",
        "spec",
        "quantity",
        "unit",
        "quoted_unit_price",
        "amount",
        "normalized_part_key",
    ]
    file_fields = [
        "source_path",
        "source_file",
        "source_folder",
        "customer_hint",
        "file_extension",
        "file_modified_at",
        "status",
        "item_count",
        "note",
    ]

    all_items: list[dict[str, str]] = []
    file_records: list[dict[str, str]] = []

    for path in sorted(RAW_ROOT.rglob("*")):
        if not path.is_file() or path.name.startswith("~$"):
            continue
        suffix = path.suffix.lower()
        if suffix == ".xlsx":
            items, record = extract_xlsx(path)
            all_items.extend(items)
            file_records.append(record)
        elif suffix in {".xls", ".xlsm", ".csv"}:
            rel_path = str(path.relative_to(RAW_ROOT))
            folder_parts = path.relative_to(RAW_ROOT).parts[:-1]
            file_records.append(
                {
                    "source_path": rel_path,
                    "source_file": path.name,
                    "source_folder": "\\".join(folder_parts),
                    "customer_hint": folder_parts[-1] if folder_parts else "",
                    "file_extension": suffix,
                    "file_modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
                    "status": "unsupported_pending",
                    "item_count": "0",
                    "note": "1차 추출기는 .xlsx만 처리합니다.",
                }
            )

    with (PROCESSED_ROOT / "estimate_items.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=item_fields)
        writer.writeheader()
        writer.writerows(all_items)

    with (PROCESSED_ROOT / "estimate_files.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=file_fields)
        writer.writeheader()
        writer.writerows(file_records)

    print(f"files scanned: {len(file_records)}")
    print(f"items extracted: {len(all_items)}")
    print(f"output: {PROCESSED_ROOT}")


if __name__ == "__main__":
    main()
