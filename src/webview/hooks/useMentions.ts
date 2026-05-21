import { useState, useCallback, useRef, useEffect } from 'react';
import { TriggerLogic, TriggerLogicState } from '../../core/TriggerLogic';
import { MentionResult } from '../components/MentionDropdown';

export function useMentions(
    postMessage: (msg: any) => void,
    onInsert: (result: MentionResult, startIndex: number) => void
) {
    const [mentionState, setMentionState] = useState<TriggerLogicState>({
        isActive: false,
        filterString: '',
        startIndex: null
    });
    const [mentionResults, setMentionResults] = useState<MentionResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    const triggerRef = useRef(new TriggerLogic());
    const debounceTimer = useRef<any>(null);
    const lastRequestId = useRef<number>(0);

    const closeMentions = useCallback(() => {
        setMentionState({ isActive: false, filterString: '', startIndex: null });
        setMentionResults([]);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }, []);

    const insertMention = useCallback((result: MentionResult, startIndex: number) => {
        onInsert(result, startIndex);
        closeMentions();
    }, [onInsert, closeMentions]);

    const updateMentions = useCallback((text: string, caretPos: number, textarea: HTMLTextAreaElement) => {
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
