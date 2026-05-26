#!/bin/bash

# Path to the project
PROJECT_DIR="/Users/simondevries/dev/prompt-forge-public"

# If first arg is --zsh-widget, print Zsh config snippet for user
if [[ "$1" == "--zsh-widget" ]]; then
    echo "Add the following snippet to your ~/.zshrc or source it in your active shell:"
    echo ""
    echo "# Prompt Forge Zsh Integration Widget"
    echo "prompt-forge-widget() {"
    echo "  local result=\$(\"$PROJECT_DIR/prompt-forge-tui.sh\" --new-window)"
    echo "  if [[ -n \"\$result\" ]]; then"
    echo "    LBUFFER+=\"\$result\""
    echo "    zle reset-prompt"
    echo "  fi"
    echo "}"
    echo "zle -N prompt-forge-widget"
    echo "bindkey '^G' prompt-forge-widget"
    exit 0
fi

# Handle --new-window flag
if [[ "$1" == "--new-window" ]]; then
    shift
    # If there's an argument left, it's likely a file passed by an editor protocol (e.g. Gemini)
    ORIGINAL_FILE="$1"
    
    # Create a temporary file for the TUI to write to
    TEMP_FILE=$(mktemp /tmp/pf_result.XXXXXX)
    if [[ -z "$TEMP_FILE" ]]; then echo "Failed to create temp file"; exit 1; fi
    
    if [[ -n "$ORIGINAL_FILE" && -f "$ORIGINAL_FILE" ]]; then
        cp "$ORIGINAL_FILE" "$TEMP_FILE"
    fi
    
    # Create a temporary launcher script
    LAUNCHER_SCRIPT=$(mktemp /tmp/pf_launcher.XXXXXX)
    if [[ -z "$LAUNCHER_SCRIPT" ]]; then echo "Failed to create launcher script"; exit 1; fi
    
    mv "$LAUNCHER_SCRIPT" "${LAUNCHER_SCRIPT}.sh"
    LAUNCHER_SCRIPT="${LAUNCHER_SCRIPT}.sh"
    chmod +x "$LAUNCHER_SCRIPT"
    
    # Write launcher script which writes its own PID to a tracking file
    cat <<EOF > "$LAUNCHER_SCRIPT"
#!/bin/bash
echo \$\$ > "${TEMP_FILE}.pid"
cd "$PROJECT_DIR"
# Clear the new terminal for a clean start
clear
if [[ -f "dist/tui.mjs" ]]; then
    node dist/tui.mjs "$TEMP_FILE"
else
    node --import tsx src/tui/index.tsx "$TEMP_FILE"
fi
# Clean up pid file on successful compile/exit
rm -f "${TEMP_FILE}.pid"
# Small delay to ensure the file write is flushed before the window might close
sleep 0.2
exit
EOF

    # Open the TUI in a new macOS terminal window
    open -a Terminal "$LAUNCHER_SCRIPT"
    
    # Wait for the TUI to write the PID file (give it up to 1.5 seconds to spawn)
    PID=""
    for i in {1..15}; do
        if [[ -f "${TEMP_FILE}.pid" ]]; then
            PID=$(cat "${TEMP_FILE}.pid" 2>/dev/null)
            if [[ -n "$PID" ]]; then
                break
            fi
        fi
        sleep 0.1
    done
    
    # Wait for the TUI to finish (when it writes to TEMP_FILE or the window is closed)
    while [[ ! -s "$TEMP_FILE" ]]; do
        # Check if the terminal shell process is still alive using kill -0
        if [[ -n "$PID" ]]; then
            if ! kill -0 "$PID" 2>/dev/null; then
                break
            fi
        else
            # Fallback check if pid was never written
            if [[ ! -f "$LAUNCHER_SCRIPT" ]]; then
                break
            fi
        fi
        sleep 0.2
    done
    
    # Handle the result
    if [[ -s "$TEMP_FILE" ]]; then
        if [[ -n "$ORIGINAL_FILE" ]]; then
            # CASE 1: Used as an EDITOR (e.g. Gemini Edit). 
            # Write to the target file and be quiet.
            cp "$TEMP_FILE" "$ORIGINAL_FILE"
        else
            # CASE 2: Used as a HOTKEY (Ctrl+G).
            # Output to stdout for shell capture.
            cat "$TEMP_FILE"
        fi
    fi
    
    # Cleanup semaphores and scripts
    rm -f "$TEMP_FILE"
    rm -f "${TEMP_FILE}.pid"
    rm -f "$LAUNCHER_SCRIPT"
    exit 0
fi

# Standard (same window) execution
if [[ -f "$PROJECT_DIR/dist/tui.mjs" ]]; then
    (cd "$PROJECT_DIR" && node dist/tui.mjs "$@") < /dev/tty
else
    (cd "$PROJECT_DIR" && node --import tsx src/tui/index.tsx "$@") < /dev/tty
fi
