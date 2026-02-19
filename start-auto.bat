@echo off
title RetroBoard - Auto Start

cd /d "%~dp0"

start "Retro Server" cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start "Cloudflare Tunnel" cmd /c "cloudflared.exe tunnel --url http://localhost:3000"

exit
