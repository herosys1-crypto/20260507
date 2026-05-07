@echo off
setlocal
cd /d "%~dp0"
"C:\Users\user\AppData\Local\Programs\Python\Python314\python.exe" scripts\update_estimate_database.py
pause

