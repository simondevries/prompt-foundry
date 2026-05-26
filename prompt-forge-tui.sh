#!/bin/bash

# Path to the project
PROJECT_DIR="/Users/simondevries/dev/prompt-forge-public"

# Handle --new-window flag
if [[ "$1" == "--new-window" ]]; then
    shift
    # If there's an argument left, it's likely a file passed by an editor protocol (e.g. Gemini)
    ORIGINAL_FILE="$1"
    
    # Create a temporary file for the TUI to write to
    TEMP_FILE=$(mktemp /tmp/pf_result.XXXXXX)
    if [[ -z "$TEMP_FILE" ]]; then echo "Failed to create temp file"; exit 1; fi
    
    # Create a temporary launcher script
    LAUNCHER_SCRIPT=$(mktemp /tmp/pf_launcher.XXXXXX)
    if [[ -z "$LAUNCHER_SCRIPT" ]]; then echo "Failed to create launcher script"; exit 1; fi
    
    mv "$LAUNCHER_SCRIPT" "${LAUNCHER_SCRIPT}.sh"
    LAUNCHER_SCRIPT="${LAUNCHER_SCRIPT}.sh"
    chmod +x "$LAUNCHER_SCRIPT"
    
    cat <<EOF > "$LAUNCHER_SCRIPT"
#!/bin/bash
cd "$PROJECT_DIR"
clear
# Run using node import tsx directly
node --import tsx src/tui/index.tsx "$TEMP_FILE"
sleep 0.1
exit
EOF
    # Open the TUI in a new macOS terminal window
    open -a Terminal "$LAUNCHER_SCRIPT"
    
    # Wait for the TUI to finish or window to be closed
    while [[ ! -s "$TEMP_FILE" ]]; do
        # If launcher script is removed or process is terminated, break
        if [[ ! -f "$LAUNCHER_SCRIPT" ]]; then
            break
        fi
        # Check if the Terminal process is still running might be too complex here, 
        # so we rely on the TUI writing to the temp file or the user closing the window.
        sleep 0.3
    done
    
    # Handle output return
    if [[ -s "$TEMP_FILE" ]]; then
        if [[ -n "$ORIGINAL_FILE" ]]; then
            cp "$TEMP_FILE" "$ORIGINAL_FILE"
        else
            cat "$TEMP_FILE"
        fi
    fi
    
    # Clean up semaphores
    rm -f "$TEMP_FILE"
    rm -f "$LAUNCHER_SCRIPT"
    exit 0
fi

# Same window fallback execution
(cd "$PROJECT_DIR" && node --import tsx src/tui/index.tsx "$@") < /dev/tty
