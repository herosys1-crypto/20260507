from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from openpyxl.cell.cell import MergedCell
from openpyxl import load_workbook


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = PROJECT_ROOT / "data" / "raw_estimates"
EXPORT_ROOT = PROJECT_ROOT / "data" / "exports"

LABEL_RECIPIENT = "\uc218\uc2e0"
LABEL_ATTENTION = "\ucc38\uc870"
LABEL_QUOTE_TITLE = "\uacac\uc801\uba85"
LABEL_QUOTE_DATE = "\uc77c\uc790"
LABEL_TOTAL = "\uc77c\uae08"


def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\xa0", " ").strip()


def to_number(value: Any) -> int:
    try:
        return int(float(str(value or "0").replace(",", "")))
    except ValueError:
        return 0


def safe_filename(value: str) -> str:
    text = re.sub(r'[\\/:*?"<>|]+', "_", value)
    text = re.sub(r"\s+", "_", text).strip("._")
    return text or "quote"


def find_header(ws) -> tuple[int, int] | None:
    for row in range(1, min(ws.max_row, 80) + 1):
        for col in range(1, min(ws.max_column, 25) + 1):
            if clean(ws.cell(row, col).value) == "No.":
                return row, col
    return None


def find_template() -> Path:
    explicit = PROJECT_ROOT / "data" / "templates" / "quote_template.xlsx"
    if explicit.exists():
        return explicit

    for path in sorted(RAW_ROOT.rglob("*.xlsx")):
        if path.name.startswith("~$"):
            continue
        try:
            wb = load_workbook(path, read_only=True, data_only=True)
            try:
                if any(find_header(ws) for ws in wb.worksheets):
                    return path
            finally:
                wb.close()
        except Exception:
            continue

    raise SystemExit("No usable .xlsx quote template found.")


def find_label_cell(ws, label: str, max_row: int = 20, max_col: int = 12):
    normalized = label.replace(" ", "")
    for row in range(1, min(ws.max_row, max_row) + 1):
        for col in range(1, min(ws.max_column, max_col) + 1):
            value = clean(ws.cell(row, col).value).replace(" ", "")
            if value == normalized:
                return row, col
    return None


def set_near_label(ws, label: str, value: Any, offset: int = 1) -> None:
    cell = find_label_cell(ws, label)
    if cell:
        row, col = cell
        ws.cell(row, col + offset).value = value


def clear_old_items(ws, header_row: int, no_col: int) -> None:
    for row in range(header_row + 1, min(ws.max_row, header_row + 80) + 1):
        for col in range(no_col, no_col + 7):
            cell = ws.cell(row, col)
            if not isinstance(cell, MergedCell):
                cell.value = None


def set_value(ws, row: int, col: int, value: Any) -> None:
    cell = ws.cell(row, col)
    if not isinstance(cell, MergedCell):
        cell.value = value


def write_items(ws, header_row: int, no_col: int, items: list[dict[str, Any]]) -> int:
    total = 0
    for index, item in enumerate(items, start=1):
        row = header_row + 1 + index
        qty = to_number(item.get("qty") or item.get("quantity") or 1)
        price = to_number(item.get("price") or item.get("quoted_unit_price") or 0)
        amount = qty * price
        total += amount

        set_value(ws, row, no_col, index)
        set_value(ws, row, no_col + 1, item.get("category") or item.get("item_category") or "")
        set_value(ws, row, no_col + 2, item.get("spec") or "")
        set_value(ws, row, no_col + 3, qty)
        set_value(ws, row, no_col + 4, item.get("unit") or "EA")
        set_value(ws, row, no_col + 5, price)
        set_value(ws, row, no_col + 6, amount)
    return total


def create_quote(payload: dict[str, Any]) -> Path:
    items = payload.get("items") or []
    if not items:
        raise SystemExit("Draft has no items.")

    template = find_template()
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    customer = safe_filename(str(payload.get("customer") or "customer"))
    title = safe_filename(str(payload.get("title") or "quote"))
    output = EXPORT_ROOT / f"{now:%Y%m%d_%H%M%S}_{customer}_{title}.xlsx"
    shutil.copy2(template, output)

    wb = load_workbook(output)
    ws = wb.active
    header = find_header(ws)
    if not header:
        wb.close()
        output.unlink(missing_ok=True)
        raise SystemExit("Template has no item table header.")

    header_row, no_col = header
    clear_old_items(ws, header_row, no_col)
    total = write_items(ws, header_row, no_col, items)

    today = now.date().isoformat()
    set_near_label(ws, LABEL_RECIPIENT, payload.get("customer") or "")
    set_near_label(ws, LABEL_ATTENTION, payload.get("attention") or "")
    set_near_label(ws, LABEL_QUOTE_TITLE, payload.get("title") or "")
    set_near_label(ws, LABEL_QUOTE_DATE, today)
    set_near_label(ws, LABEL_TOTAL, total)

    wb.save(output)
    wb.close()
    return output


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: create_quote_from_draft.py draft.json")

    payload_path = Path(sys.argv[1])
    with payload_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    output = create_quote(payload)
    print(json.dumps({"output": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
