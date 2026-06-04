@echo off
setlocal enabledelayedexpansion

:: Resolve the project dir
set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

:: Find Bundle
set "BUNDLE_PATH="
if exist "%PROJECT_DIR%\tui.bundle.mjs" (
    set "BUNDLE_PATH=%PROJECT_DIR%\tui.bundle.mjs"
) else if exist "%PROJECT_DIR%\dist\tui.bundle.mjs" (
    set "BUNDLE_PATH=%PROJECT_DIR%\dist\tui.bundle.mjs"
) else if exist "%PROJECT_DIR%\tui.bundle.js" (
    set "BUNDLE_PATH=%PROJECT_DIR%\tui.bundle.js"
) else if exist "%PROJECT_DIR%\dist\tui.bundle.js" (
    set "BUNDLE_PATH=%PROJECT_DIR%\dist\tui.bundle.js"
)

if not defined BUNDLE_PATH (
    echo prompt-forge-tui: error: tui.bundle.mjs not found.
    exit /b 1
)

:: Parse Args
set "NEW_WINDOW=false"
set "LIBRARY_PATH="
set "ORIGINAL_FILE="
set "ARGS="

:parse_loop
if "%~1"=="" goto parse_done
set "CUR_ARG=%~1"
if "!CUR_ARG!"=="--new-window" (
    set "NEW_WINDOW=true"
    shift
    goto parse_loop
)
if "!CUR_ARG!"=="--library" (
    set "LIBRARY_PATH=%~2"
    shift
    shift
    goto parse_loop
)
if "!CUR_ARG!"=="-l" (
    set "LIBRARY_PATH=%~2"
    shift
    shift
    goto parse_loop
)
if not defined ORIGINAL_FILE (
    set "ORIGINAL_FILE=%~1"
)
set "ARGS=!ARGS! %1"
shift
goto parse_loop
:parse_done

:: --new-window mode
if "%NEW_WINDOW%"=="true" (
    set "TUI_TMP=%PROJECT_DIR%\tmp"
    if not exist "!TUI_TMP!" mkdir "!TUI_TMP!"
    
    set "TEMP_DIR=!TUI_TMP!\prompt-forge.%RANDOM%"
    mkdir "!TEMP_DIR!"
    
    set "TEMP_FILE=!TEMP_DIR!\result"
    set "TEMP_FILE_ATOMIC=!TEMP_DIR!\result.tmp"
    set "LAUNCHER=!TEMP_DIR!\launcher.bat"
    set "SENTINEL=!TEMP_DIR!\done"

    set "LIB_ARG="
    if defined LIBRARY_PATH set "LIB_ARG=--library "!LIBRARY_PATH!""

    (
        echo @echo off
        echo cd /d "%PROJECT_DIR%"
        echo cls
        echo node "%BUNDLE_PATH%" "%ORIGINAL_FILE%" "!TEMP_FILE_ATOMIC!" %LIB_ARG%
        echo if exist "!TEMP_FILE_ATOMIC!" move /y "!TEMP_FILE_ATOMIC!" "!TEMP_FILE!" ^>nul
        echo echo done ^> "!SENTINEL!"
    ) > "!LAUNCHER!"

    start "" cmd /c "!LAUNCHER!"

    :wait_loop
    if not exist "!SENTINEL!" (
        timeout /t 1 /nobreak >nul
        goto wait_loop
    )

    if exist "!TEMP_FILE!" (
        if defined ORIGINAL_FILE (
            copy /y "!TEMP_FILE!" "%ORIGINAL_FILE%" >nul
        ) else (
            type "!TEMP_FILE!"
        )
    )
    
    rmdir /s /q "!TEMP_DIR!"
    exit /b 0
)

:: Direct / same-window fallback
set "LIB_ARG="
if defined LIBRARY_PATH set "LIB_ARG=--library "!LIBRARY_PATH!""
cd /d "%PROJECT_DIR%"
node "%BUNDLE_PATH%" !ARGS! !LIB_ARG!
