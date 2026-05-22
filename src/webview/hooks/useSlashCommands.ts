import { useState, useCallback, useRef, useEffect } from 'react';
import { TriggerLogic, TriggerLogicState } from '../../core/TriggerLogic';
import { CommandResult } from '../components/CommandDropdown';

export function useSlashCommands(
    postMessage: (msg: any) => void,
    onExecute: (result: CommandResult) => void
) {
    const [commandState, setCommandState] = useState<TriggerLogicState>({
        isActive: false,
        filterString: '',
        startIndex: null,
        triggerChar: null
    });
    const [commandResults, setCommandResults] = useState<CommandResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const didUserClose = useRef(false);
    
    const triggerRef = useRef(new TriggerLogic(['/']));
    const debounceTimer = useRef<any>(null);
    const lastRequestId = useRef<number>(0);

    const closeCommands = useCallback(() => {
        setCommandState({ isActive: false, filterString: '', startIndex: null, triggerChar: null });
        setCommandResults([]);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }, []);

    const executeCommand = useCallback((result: CommandResult) => {
        onExecute(result);
        closeCommands();
    }, [onExecute, closeCommands]);

    const updateCommands = useCallback((text: string, caretPos: number) => {
        // If the menu is currently active, we don't care about the close flag
        if (commandState.isActive) {
            didUserClose.current = false;
        }

        // Rule: If the user explicitly typed the trigger character (it changed at the caret position),
        // we reset the "close" flag to allow it to open again.
        if (caretPos > 0 && text[caretPos - 1] === '/') {
             // We only reset if the previous state wasn't already at this position
             // This is a bit tricky without previous text, but we can assume if they
             // just typed it, they want the menu.
             // For now, let's just only open if didUserClose is false.
        }

        if (didUserClose.current) {
            // Check if the character at caret is STILL the trigger. 
            // If the user moves away or deletes it, we can reset.
            if (caretPos === 0 || text[caretPos - 1] !== '/') {
                didUserClose.current = false;
            }
            return;
        }

        const newState = triggerRef.current.update(text, caretPos, commandResults.length);
        
        const wasInactive = !commandState.isActive;
        setCommandState(newState);

        if (newState.isActive && newState.triggerChar === '/') {
            if (wasInactive) {
                setSelectedIndex(0);
            }

            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            
            const requestId = ++lastRequestId.current;
            
            debounceTimer.current = setTimeout(() => {
                postMessage({ 
                    type: 'searchSlashCommands', 
                    filterString: newState.filterString,
                    requestId 
                });
            }, 150); // Faster response for commands
        } else {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            setCommandResults([]);
        }
    }, [commandState.isActive, commandResults.length, postMessage]);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'slashCommandSearchResults') {
                if (message.requestId === lastRequestId.current) {
                    setCommandResults(message.results);
                }
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!commandState.isActive || commandState.triggerChar !== '/') return false;

        if (e.key === 'ArrowDown') {
            if (commandResults.length > 0) {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % commandResults.length);
            }
            return true;
        } else if (e.key === 'ArrowUp') {
            if (commandResults.length > 0) {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + commandResults.length) % commandResults.length);
            }
            return true;
        } else if (e.key === 'Enter') {
            if (commandResults.length > 0) {
                e.preventDefault();
                executeCommand(commandResults[selectedIndex]);
                return true;
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            didUserClose.current = true;
            closeCommands();
            return true;
        }
        return false;
    }, [commandState, commandResults, selectedIndex, executeCommand, closeCommands]);

    return {
        commandState,
        commandResults,
        selectedIndex,
        updateCommands,
        handleKeyDown,
        closeCommands
    };
}
