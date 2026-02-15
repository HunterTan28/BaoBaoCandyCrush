@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在安装依赖...
call "C:\Program Files\nodejs\npm.cmd" install
if errorlevel 1 pause
echo.
echo 正在启动开发服务器...
call "C:\Program Files\nodejs\npm.cmd" run dev
pause
