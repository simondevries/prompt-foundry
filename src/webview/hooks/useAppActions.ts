import { useCallback } from 'react';

interface AppActionsProps {
    postMessage: (msg: any) => void;
    updateState: (delta: any) => void;
    state: any;
    clearAutoSaveTimers: () => void;
    setShowRestore: (show: boolean) => void;
}

export function useAppActions({
    postMessage,
    updateState,
    state,
    clearAutoSaveTimers,
    setShowRestore
}: AppActionsProps) {
    
    const handleCopy = useCallback(() => {
        postMessage({
            type: "updateMainInstruction",
            value: state.mainInstruction,
        });
        postMessage({ type: "copyPrompt" });
        updateState({ lastAction: "copy" });
        clearAutoSaveTimers();
        if (state.isUserInitializedLibrary) {
            postMessage({ type: "clearAndResetUI" });
            setShowRestore(true);
        }
    }, [state.mainInstruction, state.isUserInitializedLibrary, postMessage, updateState, clearAutoSaveTimers, setShowRestore]);

    const handleSend = useCallback(() => {
        postMessage({
            type: "updateMainInstruction",
            value: state.mainInstruction,
        });
        postMessage({ type: "sendPrompt" });
        updateState({ lastAction: "send" });
        clearAutoSaveTimers();
        if (state.isUserInitializedLibrary) {
            postMessage({ type: "clearAndResetUI" });
            setShowRestore(true);
        }
    }, [state.mainInstruction, state.isUserInitializedLibrary, postMessage, updateState, clearAutoSaveTimers, setShowRestore]);

    const handleAppend = useCallback(() => {
        postMessage({
            type: "updateMainInstruction",
            value: state.mainInstruction,
        });
        postMessage({ type: "appendPrompt" });
        updateState({ lastAction: "append" });
        clearAutoSaveTimers();
        if (state.isUserInitializedLibrary) {
            postMessage({ type: "clearAndResetUI" });
            setShowRestore(true);
        }
    }, [state.mainInstruction, state.isUserInitializedLibrary, postMessage, updateState, clearAutoSaveTimers, setShowRestore]);

    const handleClear = useCallback(() => {
        updateState({ mainInstruction: "" });
        postMessage({ type: "updateMainInstruction", value: "" });
        postMessage({ type: "deleteAllPrompts" });
    }, [updateState, postMessage]);

    const handleAddCurrentFile = useCallback(() => {
        postMessage({ type: "addCurrentFileTag" });
    }, [postMessage]);

    const handleAddGroup = useCallback((groupName: string) => {
        postMessage({ type: "selectAgent", agent: groupName });
    }, [postMessage]);

    return {
        handleCopy,
        handleSend,
        handleAppend,
        handleClear,
        handleAddCurrentFile,
        handleAddGroup
    };
}
