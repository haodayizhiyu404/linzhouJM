@echo off
rem 发布设定.bat —— 双击：直读酒馆母本世界书 → 生成 content\manifest.json
rem 也可以把世界书 JSON 文件直接拖到本文件上（等价于指定文件）
chcp 65001 >nul
cd /d "%~dp0"
node tools\publish.js %1
echo.
pause
