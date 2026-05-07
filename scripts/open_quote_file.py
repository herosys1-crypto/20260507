from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import win32com.client

try:
    import win32con
    import win32gui
except ImportError:  # pragma: no cover - pywin32 normally provides these on Windows.
    win32con = None
    win32gui = None


def bring_excel_forward(excel) -> None:
    try:
        excel.Visible = True
        excel.WindowState = -4143  # xlNormal
    except Exception:
        pass

    try:
        shell = win32com.client.Dispatch("WScript.Shell")
        shell.AppActivate(excel.Caption)
    except Exception:
        pass

    if win32gui is None or win32con is None:
        return

    try:
        hwnd = int(excel.Hwnd)
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        time.sleep(0.2)
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass


def open_quote(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(str(path))

    excel = win32com.client.Dispatch("Excel.Application")
    excel.Visible = True
    workbook = excel.Workbooks.Open(str(path.resolve()))
    workbook.Activate()

    try:
        excel.ActiveWindow.WindowState = -4137  # xlMaximized
    except Exception:
        pass

    bring_excel_forward(excel)


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "Usage: open_quote_file.py <xlsx>"}))
        return 2

    path = Path(sys.argv[1]).resolve()
    open_quote(path)
    print(json.dumps({"ok": True, "output": str(path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
