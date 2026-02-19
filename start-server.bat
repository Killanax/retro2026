@echo off
title RetroBoard - Server

cd /d "%~dp0"

echo Starting RetroBoard server...
node server.js

pause
