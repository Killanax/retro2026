@echo off
title RetroBoard - Start

cd /d "%~dp0"

echo Starting server...
start "Retro Server" cmd /c "node server.js"

timeout /t 3 /nobreak >nul

echo Starting tunnel...
start "Cloudflare Tunnel" cmd /c "cloudflared.exe tunnel --url http://localhost:3000"

timeout /t 5 /nobreak >nul

echo Done!
echo Server: http://localhost:3000
echo See tunnel_url.txt for public URL
pause
