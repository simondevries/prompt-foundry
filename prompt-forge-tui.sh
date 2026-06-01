#!/usr/bin/env bash
set -euo pipefail

# Resolve the project dir relative to this script, regardless of where it's called from
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Utility ──────────────────────────────────────────────────────────────────

die() { echo "prompt-forge-tui: error: $*" >&2; exit 1; }

open_terminal() {
    local script="$1"
    case "$(uname -s)" in
        Darwin)
            open -a Terminal "$script"
            ;;
        Linux)
            # Prefer user's configured terminal, fall back through common options
            local term="${TERMINAL:-}"
            if [[ -z "$term" ]]; then
                for candidate in gnome-terminal xterm konsole xfce4-terminal kitty alacritty; do
                    if command -v "$candidate" &>/dev/null; then
                        term="$candidate"; break
                    fi
                done
            fi
            [[ -z "$term" ]] && die "No terminal emulator found. Set \$TERMINAL env var."
            case "$term" in
                gnome-terminal) "$term" -- bash "$script" ;;
                *) "$term" -e bash "$script" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            # Windows via Git Bash / WSL — try Windows Terminal, fall back to cmd
            if command -v wt.exe &>/dev/null; then
                wt.exe bash "$script"
            else
                cmd.exe /c start bash "$script"
            fi
            ;;
        *)
            die "Unsupported OS: $(uname -s)"
            ;;
    esac
}

# ─── --new-window mode (called by Claude Code / editor integration) ────────────

if [[ "${1:-}" == "--new-window" ]]; then
    shift
    ORIGINAL_FILE="${1:-}"

    # Temp dir scoped to TMPDIR (cross-platform), cleaned up automatically on EXIT
    TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/prompt-forge.XXXXXX")"
    TEMP_FILE="$TEMP_DIR/result"
    TEMP_FILE_ATOMIC="$TEMP_DIR/result.tmp"  # TUI writes here first, then mv → atomic
    LAUNCHER_SCRIPT="$TEMP_DIR/launcher.sh"
    SENTINEL="$TEMP_DIR/done"                # Touched by launcher on clean exit

    # Always clean up temp dir on script exit (normal, error, or signal)
    trap 'rm -rf "$TEMP_DIR"' EXIT

    cat > "$LAUNCHER_SCRIPT" << LAUNCHER
#!/usr/bin/env bash
cd "${PROJECT_DIR}"
clear
node --import tsx src/tui/index.tsx "${ORIGINAL_FILE}" "${TEMP_FILE_ATOMIC}"
# Atomic rename so the parent never reads a partial file
if [[ -s "${TEMP_FILE_ATOMIC}" ]]; then
    mv "${TEMP_FILE_ATOMIC}" "${TEMP_FILE}"
fi
# Signal completion to the waiting parent
touch "${SENTINEL}"
LAUNCHER
    chmod +x "$LAUNCHER_SCRIPT"

    open_terminal "$LAUNCHER_SCRIPT"

    # Wait for sentinel (TUI done) — sleep 0.3s is negligible for a human-speed flow
    elapsed=0
    while [[ ! -f "$SENTINEL" ]]; do
        sleep 0.3
        elapsed=$(( elapsed + 1 ))
        # 1 hour timeout (3600s / 0.3s = 12000 iterations)
        if (( elapsed > 12000 )); then
            break
        fi
    done

    # Copy result back to the original file (or print to stdout if no file given)
    if [[ -s "$TEMP_FILE" ]]; then
        if [[ -n "$ORIGINAL_FILE" ]]; then
            cp "$TEMP_FILE" "$ORIGINAL_FILE"
        else
            cat "$TEMP_FILE"
        fi
    fi

    exit 0
fi

# ─── Direct / same-window fallback ────────────────────────────────────────────
(cd "$PROJECT_DIR" && node --import tsx src/tui/index.tsx "$@") < /dev/tty
