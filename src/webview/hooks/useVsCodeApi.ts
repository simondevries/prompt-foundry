import { useState, useEffect, useCallback, useRef } from "react";
import { State, Block, Category, Group, HistoryItem } from "../types";
import { handleSelectionChange } from "../../core/tagLogic";

declare function acquireVsCodeApi(): any;
const vscodeApi = (() => {
  try {
    return acquireVsCodeApi();
  } catch (e) {
    // This happens if we're in a regular browser context or it's called again
    console.warn(
      "acquireVsCodeApi failed (might have been called already):",
      e,
    );
    return null;
  }
})();

export function useVsCodeApi() {
  const vscode = useRef<any>(vscodeApi);

  const [state, setState] = useState<State>(() => {
    const saved = vscode.current?.getState();
    const defaults: State = {
      hasCreatedLibraryFolder: false,
      isUserInitializedLibrary: false,
      library: [],
      activeBlocks: [],
      groupLibrary: [],
      selectedCategory: null,
      activeTag: null,
      lastCaretPosition: -1,
      activeForm: null,
      gitBranches: [],
      gitDiffBranches: [],
      mainInstruction: "",
      history: [],
      settings: {
        promptFolder: "",
        showClaudeCodeBlocks: false,
        showCursorRules: false,
        showWorkspaceSkills: false,
      },
      appName: "",
      lastAction: null,
      fileMap: {},
      collidedNames: {},
      followActiveFile: false,
      autoTagCount: 0,
      milestones: {},
      activeTooltipId: null,
      mcpConfig: "",
      suggestions: [],
      proposedEdits: [],
    };

    if (!saved) return defaults;

    // Merge saved state with defaults to ensure new settings properties exist
    return {
      ...defaults,
      ...saved,
      settings: {
        ...defaults.settings,
        ...(saved.settings || {}),
      },
    };
  });

  const [initialized, setInitialized] = useState(false);

  // Sync state to VS Code persistence whenever it changes
  useEffect(() => {
    if (vscode.current) {
      vscode.current.setState(state);
    }
  }, [state]);

  useEffect(() => {
    if (!vscode.current) {
      console.warn("useVsCodeApi: VSCode API not available.");
      return;
    }
    console.log("useVsCodeApi: Initializing message listener.");

    const messageListener = (event: MessageEvent) => {
      const message = event.data;
      console.log("Webview received message:", message.type, message);

      switch (message.type) {
        case "initialData":
          setState((prev) => ({
            ...prev,
            hasCreatedLibraryFolder: message.hasCreatedLibraryFolder,
            isUserInitializedLibrary: message.isUserInitializedLibrary,
            library: message.library || [],
            activeBlocks: message.activeBlocks || [],
            groupLibrary: message.groupLibrary || [],
            mainInstruction: message.mainInstruction || "",
            appName: message.appName || "",
            fileMap: message.fileMap || {},
            collidedNames: message.collidedNames || {},
            suggestions: message.suggestions || [],
            proposedEdits: message.proposedEdits || [],
          }));
          setInitialized(true);
          break;
        case "updateLibrary":
          setState((prev) => ({
            ...prev,
            library: message.library || [],
            activeBlocks: message.activeBlocks || [],
            groupLibrary: message.groupLibrary || [],
            mainInstruction:
              message.mainInstruction !== undefined
                ? message.mainInstruction
                : prev.mainInstruction,
            fileMap:
              message.fileMap !== undefined ? message.fileMap : prev.fileMap,
            collidedNames:
              message.collidedNames !== undefined
                ? message.collidedNames
                : prev.collidedNames,
            suggestions:
              message.suggestions !== undefined
                ? message.suggestions
                : prev.suggestions,
            proposedEdits:
              message.proposedEdits !== undefined
                ? message.proposedEdits
                : prev.proposedEdits,
          }));
          setInitialized(true);
          break;
        case "updateHistory":
          setState((prev) => ({ ...prev, history: message.history || [] }));
          break;
        case "updateMcpConfig":
          setState((prev) => ({ ...prev, mcpConfig: message.config || "" }));
          break;
        case "setMainInstruction":
          setState((prev) => ({
            ...prev,
            mainInstruction: message.value ?? "",
          }));
          break;
        case "updatePromptBlocksSettings":
          setState((prev) => ({ ...prev, settings: message.settings }));
          break;
        case "showGitDiffRefForm":
          setState((prev) => ({
            ...prev,
            activeForm: "gitdiffref",
            gitBranches: message.branches || [],
          }));
          break;
        case "showLiquidVariablesForm":
          setState((prev) => ({
            ...prev,
            activeForm: "liquidVariables",
            liquidFormData: message.data,
          }));
          break;
        case "showGitDiffForm":
          setState((prev) => ({
            ...prev,
            activeForm: "gitdiff",
            gitDiffBranches: message.branches || [],
          }));
          break;
        case "selectionChanged":
          setState((prev) => {
            if (!prev.followActiveFile) return prev;

            const result = handleSelectionChange({
              currentText: prev.mainInstruction || "",
              path: message.path,
              lines: message.lines,
              caretPos: prev.lastCaretPosition,
              activeTag: prev.activeTag,
              fileMap: prev.fileMap || {},
              collidedNames: prev.collidedNames || {},
              autoTagCount: prev.autoTagCount || 0,
            });

            // ... (sync with backend)
            if (vscode.current) {
              vscode.current.postMessage({
                type: "updateMainInstruction",
                value: result.newText,
                fileMap: result.fileMap,
                collidedNames: result.collidedNames,
              });
              vscode.current.postMessage({ type: "saveMainInstruction" });
            }

            return {
              ...prev,
              mainInstruction: result.newText,
              activeTag: result.newActiveTag,
              lastCaretPosition: result.newCaretPos,
              fileMap: result.fileMap,
              collidedNames: result.collidedNames,
              autoTagCount: result.wasInserted
                ? prev.autoTagCount + 1
                : prev.autoTagCount,
            };
          });
          break;
        case "insertFileTag":
          setState((prev) => {
            const result = handleSelectionChange({
              currentText: prev.mainInstruction || "",
              path: message.path,
              lines: message.lines,
              caretPos: prev.lastCaretPosition,
              activeTag: prev.activeTag,
              fileMap: prev.fileMap || {},
              collidedNames: prev.collidedNames || {},
              autoTagCount: prev.autoTagCount || 0,
              forceInsert: true,
            });

            if (vscode.current) {
              vscode.current.postMessage({
                type: "updateMainInstruction",
                value: result.newText,
                fileMap: result.fileMap,
                collidedNames: result.collidedNames,
              });
              vscode.current.postMessage({ type: "saveMainInstruction" });
            }

            return {
              ...prev,
              mainInstruction: result.newText,
              activeTag: result.newActiveTag,
              lastCaretPosition: result.newCaretPos,
              fileMap: result.fileMap,
              collidedNames: result.collidedNames,
              autoTagCount: result.wasInserted
                ? prev.autoTagCount + 1
                : prev.autoTagCount,
            };
          });
          break;
      }
    };

    window.addEventListener("message", messageListener);

    // Signal to extension that we are ready
    vscode.current.postMessage({ type: "webviewReady" });
    vscode.current.postMessage({ type: "getPromptBlocksSettings" });

    return () => window.removeEventListener("message", messageListener);
  }, []);

  const postMessage = useCallback((message: any) => {
    if (vscode.current) {
      vscode.current.postMessage(message);
    }
  }, []);

  const updateState = useCallback((updates: Partial<State>) => {
    setState((prev) => {
      const newState = { ...prev, ...updates };
      if (vscode.current) vscode.current.setState(newState);
      return newState;
    });
  }, []);

  return { state, postMessage, updateState, initialized };
}
