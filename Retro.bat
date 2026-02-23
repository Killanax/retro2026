@echo off

rem Ensure this Node.js and npm are first in the PATH
set "PATH=%APPDATA%\npm;%~dp0;%PATH%"

setlocal enabledelayedexpansion
pushd "%~dp0"

rem Figure out the Node.js version.
set print_version=.\node.exe -p -e "process.versions.node + ' (' + process.arch + ')'"
for /F "usebackq delims=" %%v in (`%print_version%`) do set version=%%v

rem Print message.
if exist npm.cmd (
  echo Your environment has been set up for using Node.js !version! and npm.
) else (
  echo Your environment has been set up for using Node.js !version!.
)

popd
endlocal

rem --- Добавленные строки ---
rem Переходим в директорию c:\retro
cd /d "c:\retro"

rem Запускаем команду qwen (предполагается, что она доступна через PATH)
rem Можно добавить конкретный путь к исполняемому файлу qwen, если нужно
qwen
rem --- Конец добавленных строк ---

rem If we're in the Node.js directory, change to the user's home dir.
rem Эта строка теперь не повлияет, так как мы уже изменили директорию
if "%CD%\"=="%~dp0" cd /d "%HOMEDRIVE%%HOMEPATH%"