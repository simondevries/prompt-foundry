import { useState, useCallback, useRef, useEffect } from 'react';
import { TriggerLogic, TriggerLogicState } from '../../core/TriggerLogic';
import { CommandResult } from '../components/CommandDropdown';

export function useMentions(
    postMessage: (msg: any) => void,
    onInsert: (result: CommandResult, startIndex: number) => void
) {
    const [mentionState, setMentionState] = useState<TriggerLogicState>({
        isActive: false,
        filterString: '',
        startIndex: null,
        triggerChar: null
    });
    const [mentionResults, setMentionResults] = useState<CommandResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const didUserClose = useRef(false);
    
    const triggerRef = useRef(new TriggerLogic(['@']));
    const debounceTimer = useRef<any>(null);
    const lastRequestId = useRef<number>(0);

    const closeMentions = useCallback(() => {
        setMentionState({ isActive: false, filterString: '', startIndex: null, triggerChar: null });
        setMentionResults([]);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }, []);

    const insertMention = useCallback((result: CommandResult, startIndex: number) => {
        onInsert(result, startIndex);
        closeMentions();
    }, [onInsert, closeMentions]);

    const updateMentions = useCallback((text: string, caretPos: number) => {
        if (mentionState.isActive) {
            didUserClose.current = false;
        }

        if (didUserClose.current) {
            if (caretPos === 0 || text[caretPos - 1] !== '@') {
                didUserClose.current = false;
            }
            return;
        }

        const newState = triggerRef.current.update(text, caretPos, mentionResults.length);
        
        const wasInactive = !mentionState.isActive;
        setMentionState(newState);

        if (newState.isActive) {
            if (wasInactive) {
                setSelectedIndex(0);
            }

            // Debounce the search request
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            
            const requestId = ++lastRequestId.current;
            
            debounceTimer.current = setTimeout(() => {
                postMessage({ 
                    type: 'searchMentions', 
                    filterString: newState.filterString,
                    requestId 
                });
            }, 350); // 350ms debounce for performance in large repos
        } else {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            setMentionResults([]);
        }
    }, [mentionState.isActive, mentionResults.length, postMessage]);

    // Listen for results and handle cancellation/stale requests
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'mentionSearchResults') {
                // Only update if this is the latest request we sent
                if (message.requestId === lastRequestId.current) {
                    setMentionResults(message.results);
                }
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    const handleMentionKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!mentionState.isActive) return false;

        if (e.key === 'ArrowDown') {
            if (mentionResults.length > 0) {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % mentionResults.length);
            }
            return true;
        } else if (e.key === 'ArrowUp') {
            if (mentionResults.length > 0) {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + mentionResults.length) % mentionResults.length);
            }
            return true;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (mentionResults.length > 0) {
                e.preventDefault();
                insertMention(mentionResults[selectedIndex], mentionState.startIndex!);
                return true;
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            didUserClose.current = true;
            closeMentions();
            return true;
        }
        return false;
    }, [mentionState, mentionResults, selectedIndex, insertMention, closeMentions]);

    return {
        mentionState,
        mentionResults,
        selectedIndex,
        updateMentions,
        handleMentionKeyDown,
        closeMentions,
        insertMention,
        setMentionResults
    };
}
