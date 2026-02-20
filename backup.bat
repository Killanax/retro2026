@echo off
setlocal

REM Supabase connection details
set DB_HOST=aws-1-eu-west-3.pooler.supabase.com
set DB_PORT=6543
set DB_NAME=postgres
set DB_USER=postgres.hcrptymibbiryvxhmjjh
set DB_PASS=E8fReBp7Mp!

REM Backup folder
set BACKUP_DIR=%~dp0backups
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Timestamp for filename
set TIMESTAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set TIMESTAMP=%TIMESTAMP::=%

REM Backup filename
set BACKUP_FILE=%BACKUP_DIR%\retro_backup_%TIMESTAMP%.sql

REM Run pg_dump
echo Creating backup...
set PGPASSWORD=%DB_PASS%
pg_dump -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -F p -f "%BACKUP_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo Backup successful: %BACKUP_FILE%
    echo Keeping last 7 backups...
    
    REM Delete old backups (keep last 7)
    forfiles /p "%BACKUP_DIR%" /m retro_backup_*.sql /d -7 /c "cmd /c del @path"
    
    echo Opening backup folder...
    explorer "%BACKUP_DIR%"
) else (
    echo Backup failed!
    echo Make sure PostgreSQL is installed: winget install PostgreSQL.PostgreSQL
)

pause
endlocal
