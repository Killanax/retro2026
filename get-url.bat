@echo off
title RetroBoard - Get Tunnel URL

echo ========================================
echo   RetroBoard - Tunnel URL
echo ========================================
echo.

if exist logs\tunnel.log (
    echo Tunnel URL:
    findstr /C:"trycloudflare.com" logs\tunnel.log | findstr /C:"https://"
) else (
    echo Tunnel log not found!
    echo Run start-tunnel.bat first
)
echo.
pause
