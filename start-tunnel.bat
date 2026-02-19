@echo off
title Cloudflare Tunnel

cd /d "%~dp0"

if not exist logs mkdir logs

echo Starting tunnel...
cloudflared.exe tunnel --url http://localhost:3000 > logs\tunnel.log 2>&1
