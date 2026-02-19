@echo off
title RetroBoard - Stop

cd /d "%~dp0"

echo Stopping all processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1

echo Done!
timeout /t 2 /nobreak >nul
