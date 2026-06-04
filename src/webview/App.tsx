import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVsCodeApi } from "./hooks/useVsCodeApi";
import { SectionHeader, IconButton } from "./components/Common";
import ActiveBlock from "./components/ActiveBlock";
import PromptBlocksPanel from "./components/PromptBlocksPanel";
import GroupList from "./components/GroupList";
import GitDiffForm from "./components/GitDiffForm";
import LiquidVariablesForm from "./components/LiquidVariablesForm";
import { SplitButton } from "./components/SplitButton";
import SuggestedBlock from "./components/SuggestedBlock";
import { FeaturesPermissionsPopover } from "./components/FeaturesPermissionsPopover";
import { Banner } from "./components/Banner";
import { TEMPLATES, Template } from "./constants/templates";
import { useMentions } from "./hooks/useMentions";
import { useSlashCommands } from "./hooks/useSlashCommands";
import { useAppActions } from "./hooks/useAppActions";
import CommandDropdown, { CommandResult } from "./components/CommandDropdown";
import { handleSelectionChange } from "../core/tagLogic";

const REFERENCE_LOCATIONS = [
  { value: "workflowBeforeEditing", label: "Before Editing", description: "Follow this instruction after planning but before writing any code. Best for validation steps." },
  { value: "workflowFirstTurn", label: "First Turn", description: "Only applies to the very first response in the conversation. Best for research or setup." },
  { value: "workflowEveryChange", label: "Every Change", description: "The AI will follow this every time it modifies a file. Best for linting or style rules." },
  { value: "workflowEndOfTask", label: "End of Task", description: "Follow this only when the entire task is finished. Best for final reports or cleanup." },
  { value: "workflow", label: "General Workflow", description: "General instructions that apply to the whole process. Placed at the top of the workflow." },
  { value: "remark", label: "Remark", description: "A side-note placed in a separate '# Remarks' section after the main instruction." },
  { value: "none", label: "Goal Only", description: "Does not appear in the workflow; only appears in the '# Key goals' section at the bottom." },
];

const CopyablePre: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          backgroundColor: "var(--vscode-editor-background)",
          padding: "8px",
          paddingRight: "36px",
          overflowX: "auto",
          fontSize: "0.8em",
          border: "1px solid var(--vscode-widget-border)",
        }}
      >
        <code>{content}</code>
      </pre>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: "4px",
          right: "4px",
          background: "var(--vscode-button-secondaryBackground, transparent)",
          border: "none",
          color: "var(--vscode-button-secondaryForeground, inherit)",
          cursor: "pointer",
          opacity: 0.8,
          padding: "4px",
          borderRadius: "3px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Copy to clipboard"
      >
        <span
          className={`codicon codicon-${copied ? "check" : "copy"}`}
          style={{ fontSize: "12px" }}
        ></span>
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const { state, postMessage, updateState, initialized } = useVsCodeApi();

  // UI Toggles
  const [copyStatus, setCopyStatus] = useState<"Copy" | "Copied!">("Copy");
  const [mainInstructionOpen, setMainInstructionOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const [groupModal, setGroupModal] = useState<{ open: boolean; name: string }>(
    { open: false, name: "" },
  );
  const [referenceModal, setReferenceModal] = useState<{
    open: boolean;
    blockPath: string;
    reference: string;
    location: string;
  }>({
    open: false,
    blockPath: "",
    reference: "",
    location: "workflowBeforeEditing",
  });
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = useState<
    Set<string>
  >(new Set());
  const [showSuggestionsGlobally, setShowSuggestionsGlobally] =
    useState<boolean>(false);
  const [mcpConfig, setMcpConfig] = useState("");
  const [diffOpenedId, setDiffOpenedId] = useState<string | null>(null);
  const prevActiveBlocksCount = useRef(state.activeBlocks.length);

  // Update visibility on block changes
  useEffect(() => {
    if (state.activeBlocks.length > prevActiveBlocksCount.current) {
      setDismissedSuggestionKeys(new Set());
      setShowSuggestionsGlobally(true);
    } else if (state.activeBlocks.length < prevActiveBlocksCount.current) {
      setShowSuggestionsGlobally(false);
    }
    prevActiveBlocksCount.current = state.activeBlocks.length;
  }, [state.activeBlocks.length]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "⌘" : "Ctrl";

  // Refs for auto-focusing
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const [showRestore, setShowRestore] = useState(false);

  const totalTokens = useMemo(() => {
    let totalLength = state.mainInstruction.length;

    // Add content from active blocks
    state.activeBlocks.forEach((block) => {
      if (block.content) {
        totalLength += block.content.length;
      }
      // Estimate overhead for tags and formatting
      totalLength += 50; // Headers/Tags
    });

    // Estimate overhead for prompt structure
    totalLength += 200;

    return Math.ceil(totalLength / 3.3);
  }, [state.mainInstruction, state.activeBlocks]);

  const {
    mentionState,
    mentionResults,
    selectedIndex,
    updateMentions,
    handleMentionKeyDown,
    closeMentions,
    insertMention,
    setMentionResults,
  } = useMentions(postMessage, (result, startIndex) => {
    const text = state.mainInstruction;
    const caretPos = promptInputRef.current?.selectionStart || startIndex;

    // 1. Remove the trigger and filter (from startIndex to caretPos)
    const textWithoutTrigger =
      text.substring(0, startIndex) + text.substring(caretPos);

    // 2. Use handleSelectionChange to insert the tag with smart name logic
    const result_ = handleSelectionChange({
      currentText: textWithoutTrigger,
      path: result.fullPath || result.name,
      lines: "",
      caretPos: startIndex,
      fileMap: state.fileMap || {},
      collidedNames: state.collidedNames || {},
      autoTagCount: state.autoTagCount || 0,
      forceInsert: true,
      activeTag: null,
    });

    updateState({
      mainInstruction: result_.newText,
      fileMap: result_.fileMap,
      collidedNames: result_.collidedNames,
      autoTagCount: result_.wasInserted
        ? state.autoTagCount + 1
        : state.autoTagCount,
    });

    postMessage({
      type: "updateMainInstruction",
      value: result_.newText,
      fileMap: result_.fileMap,
      collidedNames: result_.collidedNames,
    });

    setTimeout(() => {
      if (promptInputRef.current) {
        promptInputRef.current.selectionStart =
          promptInputRef.current.selectionEnd = result_.newCaretPos;
        promptInputRef.current.focus();
      }
    }, 0);
  });

  const {
    commandState,
    commandResults,
    selectedIndex: commandSelectedIndex,
    updateCommands,
    handleKeyDown: handleCommandKeyDown,
    closeCommands,
  } = useSlashCommands(postMessage, (result: CommandResult) => {
    const text = state.mainInstruction;
    const startIndex = commandState.startIndex!;
    const caretPos = promptInputRef.current?.selectionStart || text.length;

    // 1. Clear the command text
    const newText = text.substring(0, startIndex) + text.substring(caretPos);
    updateState({ mainInstruction: newText });
    postMessage({ type: "updateMainInstruction", value: newText });

    // 2. Execute the result
    if (result.type === "action") {
      if (result.name === "copy") handleCopy();
      else if (result.name === "send") handleSend();
      else if (result.name === "file") handleAddCurrentFile();
      else if (result.name === "clear") handleClear();
    } else if (result.isGroup || false) {
      handleAddGroup(result.name);
    } else {
      postMessage({
        type: "addBlock",
        category: result.category || "Tools",
        file: result.name,
      });
    }

    setTimeout(() => promptInputRef.current?.focus(), 0);
  });

  // Close overlays on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".history-overlay") && !target.closest(".icon-btn")) {
        setHistoryOpen(false);
        setTemplatesOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (
      state.activeBlocks.length > 0 ||
      state.mainInstruction.trim().length > 0
    ) {
      setShowRestore(false);
    }
  }, [state.activeBlocks.length, state.mainInstruction]);

  // Debounce helper for main instruction updates
  const debounceTimer = useRef<any>(null);
  const saveTimer = useRef<any>(null);
  const clearAutoSaveTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const {
    handleCopy,
    handleSend,
    handleAppend,
    handleClear,
    handleAddCurrentFile,
    handleAddGroup,
  } = useAppActions({
    postMessage,
    updateState,
    state,
    clearAutoSaveTimers,
    setShowRestore,
  });

  const handleMainInstructionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const newVal = e.target.value;
    const caretPos = e.target.selectionStart;
    updateState({ mainInstruction: newVal, autoTagCount: 0 });
    setShowRestore(false);

    updateMentions(newVal, caretPos);

    // Debounced sync for extension state (which also auto-saves to current_instruction_prompt.json)
    clearAutoSaveTimers();
    debounceTimer.current = setTimeout(() => {
      postMessage({
        type: "updateMainInstruction",
        value: newVal,
        fileMap: state.fileMap,
        collidedNames: state.collidedNames,
      });
    }, 1000);
  };

  const handleAddBlock = (category: string, file: string, path: string) => {
    if (checkPermission("folder", category)) {
      postMessage({ type: "addBlock", category, file, path });
    }
  };

  const handleSelectTemplate = (template: Template) => {
    const currentVal = state.mainInstruction;
    const separator = currentVal.trim().length > 0 ? "\n\n" : "";
    const newVal = currentVal + separator + template.content;

    updateState({ mainInstruction: newVal });
    postMessage({ type: "updateMainInstruction", value: newVal });
    setTemplatesOpen(false);

    // Focus the textarea
    if (promptInputRef.current) {
      promptInputRef.current.focus();
    }
  };
  // And update the MCP handler:

  const findAllTags = useCallback((text: string) => {
    const tags = [];
    const regex = /(\[@(?:"([^"]+)"|([^\s#\]]+))(#[0-9-]+)?\] )/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      tags.push({
        start: match.index,
        end: match.index + match[0].length,
        path: match[2] || match[3],
        lines: match[4] ? match[4].substring(1) : "",
      });
    }
    return tags;
  }, []);

  const checkAndSetCaret = useCallback(() => {
    if (!promptInputRef.current) return;
    const pos = promptInputRef.current.selectionStart;
    const text = promptInputRef.current.value;
    const tags = findAllTags(text);
    const currentTag = tags.find((tag) => pos >= tag.start && pos <= tag.end);

    updateState({
      lastCaretPosition: pos,
      activeTag: currentTag || null,
      autoTagCount: 0,
    });
  }, [updateState, findAllTags]); // Global click handler to close overlays
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".history-overlay") && !target.closest("#historyBtn"))
        setHistoryOpen(false);
      if (
        !target.closest(".history-overlay") &&
        !target.closest("#blocksMenuBtn")
      )
        setSettingsOpen(false);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Auto-grow logic for main instruction textarea
  useEffect(() => {
    if (promptInputRef.current && mainInstructionOpen) {
      const textarea = promptInputRef.current;
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 400);
      textarea.style.height = `${newHeight}px`;
    }
  }, [state.mainInstruction, mainInstructionOpen]);

  const reachMilestone = useCallback(
    (milestone: string) => {
      let newTooltip = state.activeTooltipId;
      const newMilestones = { ...(state.milestones || {}) };
      let shouldUpdate = false;

      if (!newMilestones[milestone]) {
        newMilestones[milestone] = true;
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        updateState({
          milestones: newMilestones,
          activeTooltipId: newTooltip !== undefined ? newTooltip : null,
        });
      }
    },
    [state.milestones, state.activeTooltipId, updateState],
  );

  const [permissionsModal, setPermissionsModal] = useState<{
    open: boolean;
    defaultExpanded?: string;
  }>({ open: false });

  const checkPermission = (scope: string, categoryName?: string) => {
    // If no specific category is provided, we default to requiring initialization.
    if (!categoryName) {
      if (state.isUserInitializedLibrary) return true;
      setPermissionsModal({ open: true, defaultExpanded: scope });
      return false;
    }

    // If a category is provided, check its specific type.
    const category = state.library.find((c) => c.name === categoryName);
    const isSpecialCategory =
      category && (category.type === "system" || category.type === "tool");

    // Bypass for system/tool categories.
    if (isSpecialCategory) return true;

    // Everything else (user categories) requires initialization.
    if (state.isUserInitializedLibrary) return true;

    setPermissionsModal({ open: true, defaultExpanded: scope });
    return false;
  };

  return (
    <div className="app-container">
      {state.proposedEdits && state.proposedEdits.length > 0 && (
        <div style={{ padding: "8px 12px", paddingBottom: 0 }}>
          {(() => {
            const edit = state.proposedEdits[0]; // Show the most recent edit (sorted in promptManager)
            const isOpened = diffOpenedId === edit.id;

            return (
              <div
                className="banner banner-attention"
                style={{
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span className="codicon codicon-git-pull-request"></span>
                  <span>
                    AI proposed an edit to <strong>{edit.name}</strong>
                  </span>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {!isOpened ? (
                    <button
                      className="banner-cta"
                      onClick={() => {
                        postMessage({
                          type: "openProposedDiff",
                          diffFile: edit.diffFile,
                          targetFile: edit.targetFile,
                        });
                        setDiffOpenedId(edit.id);
                      }}
                    >
                      Open Diff
                    </button>
                  ) : (
                    <>
                      <button
                        className="banner-cta"
                        style={{ backgroundColor: "#1e7e34", color: "white" }}
                        onClick={() => {
                          postMessage({
                            type: "commitProposedEdit",
                            id: edit.id,
                          });
                          setDiffOpenedId(null);
                        }}
                      >
                        Commit
                      </button>
                      <button
                        className="banner-cta"
                        style={{
                          backgroundColor: "transparent",
                          border: "1px solid var(--vscode-testing-iconFailed)",
                          color: "var(--vscode-testing-iconFailed)",
                        }}
                        onClick={() => {
                          postMessage({
                            type: "rejectProposedEdit",
                            id: edit.id,
                          });
                          setDiffOpenedId(null);
                        }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ASSEMBLY AREA: MAIN INSTRUCTION + ACTIVE BLOCKS + ACTIONS */}
      <div className="assembly-area">
        <SectionHeader title="MAIN INSTRUCTION">
          <div style={{ position: "relative", display: "inline-block" }}>
            <IconButton
              id="historyBtn"
              icon="history"
              title="Session History"
              onClick={() => {
                if (checkPermission("folder")) {
                  setHistoryOpen(!historyOpen);
                  setTemplatesOpen(false);
                  postMessage({ type: "getHistoryList" });
                }
              }}
            />
          </div>

          <div style={{ position: "relative", display: "inline-block" }}>
            <IconButton
              id="templatesBtn"
              icon="layout"
              title="Insert Template"
              onClick={() => {
                setTemplatesOpen(!templatesOpen);
                if (historyOpen) setHistoryOpen(false);
              }}
            />
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              backgroundColor:
                "var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.1))",
              border:
                "1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2))",
              borderRadius: "4px",
              marginLeft: "6px",
              marginRight: "2px",
              padding: "2px",
              gap: "2px",
            }}
          >
            <IconButton
              id="followBtn"
              icon={state.followActiveFile ? "record" : "zap"}
              title={
                state.followActiveFile
                  ? "Live Focus: Automatically add selected file in editor to prompt (ON - RECORDING)"
                  : "Live Focus: Automatically add selected file in editor to prompt (OFF)"
              }
              onClick={() =>
                updateState({ followActiveFile: !state.followActiveFile })
              }
              style={{
                backgroundColor: state.followActiveFile
                  ? "darkred"
                  : "transparent",
                color: state.followActiveFile ? "white" : "inherit",
                borderRadius: "2px",
              }}
            />
            <div
              style={{
                width: "1px",
                height: "14px",
                backgroundColor:
                  "var(--vscode-widget-border, rgba(128, 128, 128, 0.2))",
              }}
            />
            <IconButton
              id="cameraBtn"
              icon="device-camera"
              title="Add current file to prompt"
              onClick={handleAddCurrentFile}
              style={{
                borderRadius: "2px",
              }}
            />
          </div>
          <IconButton
            id="newPromptBtn"
            icon="new-file"
            title="New Prompt"
            onClick={() => {
              if (checkPermission("folder")) {
                setConfirmModal({
                  open: true,
                  title: "Start New Prompt?",
                  message:
                    "This will clear the current main instruction and remove all active blocks.",
                  onConfirm: () => {
                    handleClear();
                    setConfirmModal((prev) => ({ ...prev, open: false }));
                  },
                });
              }
            }}
          />
        </SectionHeader>

        {/* OVERLAY: HISTORY */}
        {historyOpen && (
          <div className="history-overlay show">
            {state.history.length > 0 && (
              <div
                style={{
                  padding: "10px",
                  borderBottom: "1px solid var(--vscode-widget-border)",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="secondary-btn"
                  style={{ fontSize: "0.85em", opacity: 0.7 }}
                  onClick={() => {
                    setConfirmModal({
                      open: true,
                      title: "Clear All History?",
                      message:
                        "This will permanently delete ALL saved sessions from your history. This cannot be undone.",
                      onConfirm: () => {
                        postMessage({ type: "deleteAllHistory" });
                        setConfirmModal((prev) => ({ ...prev, open: false }));
                      },
                    });
                  }}
                >
                  <span
                    className="codicon codicon-trash"
                    style={{ marginRight: "4px", fontSize: "12px" }}
                  ></span>
                  Clear All History
                </button>
              </div>
            )}
            {state.history.length === 0 ? (
              <div style={{ padding: "10px", opacity: 0.6 }}>
                <em>No saved sessions</em>
              </div>
            ) : (
              state.history.map((item) => (
                <div
                  key={item.filepath}
                  className="history-item history-session-item"
                  onClick={() => {
                    setHistoryOpen(false);
                    postMessage({
                      type: "loadSession",
                      filePath: item.filepath,
                    });
                  }}
                >
                  <div className="history-item-content">
                    <div className="history-item-filename">{item.preview}</div>
                    <div style={{ opacity: 0.5 }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="history-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      postMessage({
                        type: "deleteSession",
                        filePath: item.filepath,
                      });
                      setTimeout(
                        () => postMessage({ type: "getHistoryList" }),
                        100,
                      );
                    }}
                  >
                    <span className="codicon codicon-close"></span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {templatesOpen && (
          <div
            className="history-overlay show"
            style={{ left: "40px", right: "auto", width: "300px" }}
          >
            <div
              style={{
                padding: "10px 16px",
                fontSize: "10px",
                fontWeight: "700",
                opacity: 0.5,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                borderBottom: "1px solid var(--vscode-widget-border)",
                background: "var(--vscode-menu-background)",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              Select Template
            </div>
            {TEMPLATES.map((template) => (
              <div
                key={template.id}
                className="history-item"
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "10px 14px",
                }}
                onClick={() => handleSelectTemplate(template)}
              >
                <div
                  style={{
                    fontWeight: "600",
                    marginBottom: "2px",
                    color: "var(--vscode-foreground)",
                    fontSize: "13px",
                  }}
                >
                  {template.title}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    opacity: 0.5,
                    lineHeight: "1.4",
                  }}
                >
                  {template.description}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MAIN INSTRUCTION INPUT */}
        <div className="collapsible-wrapper">
          <div
            className={`collapsible ${mainInstructionOpen ? "active" : ""} main-prompt-collapsible`}
            onClick={() => setMainInstructionOpen(!mainInstructionOpen)}
          >
            <span className="block-title">
              <span
                className={`icon codicon codicon-chevron-${mainInstructionOpen ? "down" : "right"}`}
              ></span>
              Instruction Prompt
            </span>
            {showRestore && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  postMessage({ type: "restoreLastSession" });
                  setShowRestore(false);
                }}
                style={{
                  marginLeft: "8px",
                  fontSize: "0.7em",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  backgroundColor: "var(--vscode-button-secondaryBackground)",
                  color: "var(--vscode-button-secondaryForeground)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  userSelect: "none",
                  flexShrink: 0,
                }}
              >
                <span
                  className="codicon codicon-history"
                  style={{ fontSize: "12px" }}
                ></span>
                Restore Previous Prompt
              </span>
            )}
          </div>
          <div
            className={`collapsible-content ${mainInstructionOpen ? "show" : ""}`}
          >
            <div style={{ position: "relative" }}>
              <textarea
                ref={promptInputRef}
                id="mainInstructionInput"
                value={state.mainInstruction}
                onChange={handleMainInstructionChange}
                onClick={(e) => {
                  checkAndSetCaret();
                  updateMentions(
                    state.mainInstruction,
                    (e.target as HTMLTextAreaElement).selectionStart,
                  );
                }}
                onKeyUp={(e) => {
                  checkAndSetCaret();
                  updateMentions(
                    state.mainInstruction,
                    (e.target as HTMLTextAreaElement).selectionStart,
                  );
                  updateCommands(
                    state.mainInstruction,
                    (e.target as HTMLTextAreaElement).selectionStart,
                  );
                }}
                onFocus={checkAndSetCaret}
                onKeyDown={(e) => {
                  if (handleMentionKeyDown(e)) {
                    e.stopPropagation();
                    return;
                  }
                  if (handleCommandKeyDown(e)) {
                    e.stopPropagation();
                    return;
                  }

                  if (e.key === "Escape") {
                    closeMentions();
                    closeCommands();
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }

                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const currentActionType =
                      state.lastAction ||
                      (state.appName.toLowerCase().includes("cursor")
                        ? "send"
                        : "copy");
                    if (currentActionType === "send") {
                      handleSend();
                    } else {
                      handleCopy();
                    }
                  }
                }}
                placeholder="Type your main instructions here...\n '/' for commands, '@' to mention files."
              ></textarea>

              {state.mainInstruction && (
                <div className="token-counter">~{totalTokens} tokens</div>
              )}

              {mentionState.isActive && (
                <CommandDropdown
                  title="Files"
                  results={mentionResults as CommandResult[]}
                  selectedIndex={selectedIndex}
                  anchorElement={promptInputRef.current}
                  onSelect={(result) =>
                    insertMention(result as any, mentionState.startIndex!)
                  }
                />
              )}

              {commandState.isActive && (
                <CommandDropdown
                  title="Commands"
                  results={commandResults as CommandResult[]}
                  selectedIndex={commandSelectedIndex}
                  anchorElement={promptInputRef.current}
                  onSelect={(result) => {
                    if (result.type === "action") {
                      if (result.name === "copy") handleCopy();
                      else if (result.name === "send") handleSend();
                      else if (result.name === "file") handleAddCurrentFile();
                      else if (result.name === "clear") handleClear();
                    } else if (
                      result.icon === "list-tree" ||
                      result.label.startsWith("Group:")
                    ) {
                      // It's a group
                      postMessage({ type: "selectAgent", agent: result.name });
                    } else {
                      // It's a block
                      postMessage({
                        type: "addBlock",
                        category: result.category || "Tools",
                        file: result.name,
                      });
                    }

                    // Remove the command text from the textarea
                    const text = state.mainInstruction;
                    const startIndex = commandState.startIndex!;
                    const caretPos =
                      promptInputRef.current?.selectionStart || text.length;
                    const newText =
                      text.substring(0, startIndex) + text.substring(caretPos);
                    updateState({ mainInstruction: newText });
                    postMessage({
                      type: "updateMainInstruction",
                      value: newText,
                    });

                    closeCommands();
                    setTimeout(() => promptInputRef.current?.focus(), 0);
                  }}
                />
              )}

              {!state.milestones?.["used_hotkey"] && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "8px",
                    left: "12px",
                    fontSize: "10px",
                    opacity: 0.4,
                    pointerEvents: "none",
                    userSelect: "none",
                    textTransform: "none",
                  }}
                >
                  {modKey} + Enter to{" "}
                  {(state.lastAction ||
                    (state.appName.toLowerCase().includes("cursor")
                      ? "send"
                      : "copy")) === "send"
                    ? "Send"
                    : "Copy"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ACTIVE BLOCKS */}
        <div id="activeBlocksContainer">
          {state.activeBlocks.map((block) => (
            <ActiveBlock
              key={block.path}
              block={block}
              onEdit={(path) => postMessage({ type: "editFile", path })}
              onRemove={(path) => postMessage({ type: "removeBlock", path })}
              currentGoalCount={
                state.activeBlocks.filter((b) => b.isGoal).length
              }
              onToggleGoal={(path) => {
                const block = state.activeBlocks.find((b) => b.path === path);
                if (block && !block.isGoal && !block.reference) {
                  setReferenceModal({
                    open: true,
                    blockPath: path,
                    reference: `... as per the block "{{blockName}}"`,
                    location: "workflowBeforeEditing",
                  });
                } else {
                  postMessage({ type: "toggleGoal", path });
                }
              }}
              onEditReference={(path) => {
                const block = state.activeBlocks.find((b) => b.path === path);
                if (block) {
                  setReferenceModal({
                    open: true,
                    blockPath: path,
                    reference: block.reference || `... as per the block "{{blockName}}"`,
                    location: block.referenceLocation || "workflowBeforeEditing",
                  });
                }
              }}
            />
          ))}

          {/* SUGGESTED BLOCK */}
          {showSuggestionsGlobally &&
            (() => {
              const suggestion = state.suggestions.find(
                (s) => !dismissedSuggestionKeys.has(`${s.category}:${s.name}`),
              );
              if (!suggestion) return null;
              return (
                <SuggestedBlock
                  suggestion={suggestion}
                  onAdd={() =>
                    postMessage({
                      type: "addBlock",
                      category: suggestion.category,
                      file: suggestion.name,
                    })
                  }
                  onNext={() =>
                    setDismissedSuggestionKeys((prev) =>
                      new Set(prev).add(
                        `${suggestion.category}:${suggestion.name}`,
                      ),
                    )
                  }
                />
              );
            })()}
        </div>

        {/* FOOTER ACTIONS: COMBINED SPLIT BUTTON */}
        <div className="btn-group">
          {(() => {
            const currentActionType =
              state.lastAction ||
              (state.appName.toLowerCase().includes("cursor")
                ? "send"
                : "copy");

            const handleMcpInfo = () => {
              postMessage({ type: "getMcpConfig" });
              setPermissionsModal({ open: true, defaultExpanded: "mcp" });
            };

            const primaryAction =
              currentActionType === "send"
                ? {
                    label: "Send to AI plugin",
                    icon: "send",
                    onClick: handleSend,
                  }
                : currentActionType === "append"
                  ? {
                      label: "Append to File",
                      icon: "edit",
                      onClick: handleAppend,
                    }
                  : { label: "Copy Context", icon: "copy", onClick: handleCopy };

            const secondaryActions = [
              {
                id: "copy",
                label: "Copy Context",
                icon: "copy",
                onClick: () => {
                  updateState({ lastAction: "copy" });
                },
              },
              {
                id: "send",
                label: "Send to AI",
                icon: "send",
                onClick: () => {
                  updateState({ lastAction: "send" });
                },
              },
              {
                id: "append",
                label: "Append to File",
                icon: "edit",
                onClick: () => {
                  updateState({ lastAction: "append" });
                },
              },
              {
                id: "mcp",
                label: "Send via MCP",
                icon: "circuit-board",
                onClick: handleMcpInfo,
              },
            ].filter((a) => a.id !== currentActionType);

            return (
              <SplitButton
                primaryAction={primaryAction}
                secondaryActions={secondaryActions}
              />
            );
          })()}
        </div>
      </div>

      <div className="prompt-blocks-area">
        {/* SECTION: PROMPT BLOCKS */}
        <SectionHeader title="PROMPT BLOCK LIBRARY">
          <IconButton
            icon="add"
            title="Add New"
            onClick={() => {
              if (checkPermission("folder")) {
                if (state.selectedCategory) {
                  postMessage({
                    type: "createBlock",
                    category: state.selectedCategory,
                  });
                } else {
                  postMessage({ type: "createCategory" });
                }
              }
            }}
          />
          <IconButton
            icon="search"
            title="Search Blocks"
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 50);
              } else {
                setSearchQuery("");
              }
            }}
          />
          <IconButton
            icon="refresh"
            title="Reload from Disk"
            onClick={() => {
              updateState({ selectedCategory: null });
              postMessage({ type: "reloadData" });
            }}
          />
          <IconButton
            id="blocksMenuBtn"
            icon="gear"
            title="Settings"
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              if (!settingsOpen)
                postMessage({ type: "getPromptBlocksSettings" });
            }}
          />
        </SectionHeader>

        {!state.isUserInitializedLibrary && (
          <Banner
            mode="info"
            message="Prompt Library is in Read-Only mode. Set a library folder to enable Edit mode, groups and history features."
            ctaText="Set Folder"
            onCtaClick={() =>
              setPermissionsModal({ open: true, defaultExpanded: "folder" })
            }
            canClose={false}
            style={{ marginTop: "8px" }}
          />
        )}

        {searchOpen && (
          <div
            className="search-container"
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--vscode-widget-border)",
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <span
                className="codicon codicon-search"
                style={{
                  position: "absolute",
                  left: "8px",
                  opacity: 0.5,
                  fontSize: "14px",
                }}
              ></span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by file name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "4px 8px 4px 28px",
                  backgroundColor: "var(--vscode-input-background)",
                  color: "var(--vscode-input-foreground)",
                  border: "1px solid var(--vscode-input-border)",
                  borderRadius: "2px",
                  fontSize: "12px",
                }}
              />
              {searchQuery && (
                <span
                  className="codicon codicon-close"
                  style={{
                    position: "absolute",
                    right: "8px",
                    cursor: "pointer",
                    opacity: 0.5,
                  }}
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                ></span>
              )}
            </div>
          </div>
        )}

        {/* OVERLAY: SETTINGS */}
        {settingsOpen && (
          <div
            className="history-overlay show"
            style={{ top: "30px", right: "12px" }}
          >
            <div
              className="history-item"
              onClick={() => {
                setSettingsOpen(false);
                setConfirmModal({
                  open: true,
                  title: "Update Prompt Library?",
                  message: `This will update the built-in library templates to the latest version.\n\nYour own custom blocks and folders will remain completely untouched.\n\nWarning: Any direct modifications you made to built-in templates will be overwritten.\n\nWe strongly recommend committing your library to git before proceeding.`,
                  onConfirm: () => {
                    postMessage({ type: "updateBuiltInLibrary" });
                    setConfirmModal((prev) => ({ ...prev, open: false }));
                  },
                });
              }}
              style={{
                opacity: !state.settings.promptFolder || state.settings.promptFolder.includes("extension") ? 0.3 : 1,
                cursor: !state.settings.promptFolder || state.settings.promptFolder.includes("extension") ? 'not-allowed' : 'pointer'
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span className="codicon codicon-cloud-download"></span>
                <span>Update built-in prompt library</span>
              </div>
            </div>

            <div
              className="history-item"
              onClick={() => {
                postMessage({ type: "openPromptFolder" });
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexGrow: 1,
                }}
              >
                <span className="codicon codicon-folder-opened"></span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span>Open Prompt Folder</span>
                  <span
                    style={{
                      fontSize: "0.75em",
                      opacity: 0.7,
                      wordBreak: "break-all",
                    }}
                  >
                    {state.settings.promptFolder}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="history-item"
              onClick={() => {
                setSettingsOpen(false);
                postMessage({ type: "getMcpConfig" });
                setPermissionsModal({ open: true, defaultExpanded: "tui" });
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span className="codicon codicon-terminal"></span>
                <span>TUI Dashboard...</span>
              </div>
            </div>

            <div
              className="history-item"
              onClick={() => {
                setSettingsOpen(false);
                setPermissionsModal({ open: true, defaultExpanded: "folder" });
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span className="codicon codicon-shield"></span>
                <span>Features & Permissions...</span>
              </div>
            </div>
          </div>
        )}

        {state.activeForm === "gitdiff" ? (
          <GitDiffForm
            branches={state.gitDiffBranches}
            onConfirm={(variables) => {
              postMessage({ type: "addGitDiff", variables });
              updateState({ activeForm: null });
            }}
            onBack={() => updateState({ activeForm: null })}
          />
        ) : state.activeForm === "liquidVariables" && state.liquidFormData ? (
          <LiquidVariablesForm
            category={state.liquidFormData!.category}
            name={state.liquidFormData!.name}
            schema={state.liquidFormData!.schema}
            library={state.library}
            onBack={() =>
              updateState({ activeForm: null, liquidFormData: undefined })
            }
            onConfirm={(variables) => {
              updateState({ activeForm: null, liquidFormData: undefined });
              const type =
                state.liquidFormData!.name === "Add Active File Symbols"
                  ? "addActiveFileSymbols"
                  : "addBlockWithVariables";

              postMessage({
                type,
                category: state.liquidFormData!.category,
                file: state.liquidFormData!.name,
                variables,
              });
            }}
          />
        ) : (
          <PromptBlocksPanel
            library={state.library}
            activeBlocks={state.activeBlocks}
            selectedCategoryName={state.selectedCategory}
            searchQuery={searchQuery}
            onSelectCategory={(cat) => updateState({ selectedCategory: cat })}
            onAddBlock={(category, file, path) =>
              handleAddBlock(category, file, path)
            }
            onEditBlock={(path) => {
              if (checkPermission("folder"))
                postMessage({ type: "editFile", path });
            }}
            onDeleteBlock={(path, name) => {
              if (checkPermission("folder")) {
                setConfirmModal({
                  open: true,
                  title: "Delete Block?",
                  message: `Are you sure you want to delete "${name}"? This cannot be undone.`,
                  onConfirm: () => {
                    postMessage({ type: "deleteBlock", path });
                    setConfirmModal((prev) => ({ ...prev, open: false }));
                  },
                });
              }
            }}
            onAddSpecial={(type) => {
              if (checkPermission("folder")) {
                if (type === "problems")
                  postMessage({ type: "addProblemsContext" });
                else if (type === "symbols")
                  postMessage({ type: "addActiveFileSymbols" });
                else if (type === "gitdiff")
                  postMessage({ type: "addGitDiff" });
                else if (type === "gitcommit")
                  postMessage({ type: "gitcommit" });
              }
            }}
            onCreateCategory={() => {
              if (checkPermission("folder"))
                postMessage({ type: "createCategory" });
            }}
            onRenameCategory={(name) => {
              if (checkPermission("folder"))
                postMessage({ type: "renameCategory", name });
            }}
            onCreateBlock={(category) => {
              if (checkPermission("folder"))
                postMessage({ type: "createBlock", category });
            }}
            onMoveBlock={(path) => {
              if (checkPermission("folder"))
                postMessage({ type: "moveBlockPrompt", path });
            }}
            onUpdateBuiltInLibrary={() => {
              setConfirmModal({
                open: true,
                title: "Update Prompt Library?",
                message: "This will overwrite existing built-in prompts in your library with the latest versions from the extension. Any manual changes to these specific files will be lost. We strongly recommend you commit your current library to git before proceeding.",
                onConfirm: () => {
                  postMessage({ type: "updateBuiltInLibrary" });
                  setConfirmModal((prev) => ({ ...prev, open: false }));
                },
              });
            }}
            isReadOnly={!state.settings.promptFolder || state.settings.promptFolder.includes("extension")}
          />
        )}
      </div>

      <div className="groups-area">
        {/* SECTION: GROUPS */}
        <SectionHeader title="BLOCK GROUPS">
          <IconButton
            icon="add"
            title="Create New Group"
            onClick={() => {
              if (checkPermission("folder"))
                setGroupModal({ open: true, name: "" });
            }}
          />
        </SectionHeader>
        <GroupList
          groups={state.groupLibrary}
          onSelectGroup={(group) => {
            if (checkPermission("folder"))
              handleAddGroup(group.name);
          }}
          onDeleteGroup={(name) => {
            if (checkPermission("folder")) {
              setConfirmModal({
                open: true,
                title: "Delete Group?",
                message: `Are you sure you want to delete the group "${name}"? This cannot be undone.`,
                onConfirm: () => {
                  postMessage({ type: "deleteGroup", name });
                  setConfirmModal((prev) => ({ ...prev, open: false }));
                },
              });
            }
          }}
        />
      </div>

      {/* FEEDBACK BUTTON */}
      <div
        className="feedback-btn"
        title="Give Feedback"
        onClick={() =>
          postMessage({
            type: "openExternal",
            url: "https://form.typeform.com/to/hAc2CQ6A",
          })
        }
      >
        <span className="codicon codicon-feedback"></span>
        <span style={{ marginLeft: "8px" }}>Feedback valued (1 min)</span>
      </div>

      {/* MODAL: CONFIRMATION */}
      {confirmModal.open && (
        <div className="modal-overlay" style={{ display: "flex" }}>
          <div className="modal-content">
            <div className="modal-title">{confirmModal.title}</div>
            <div className="modal-message">{confirmModal.message}</div>
            <div className="modal-buttons">
              {confirmModal.title === "Prompt Foundry MCP Server" ? (
                <button
                  className="modal-btn modal-btn-confirm"
                  onClick={confirmModal.onConfirm}
                >
                  Got it!
                </button>
              ) : (
                <>
                  <button
                    className="modal-btn modal-btn-cancel"
                    onClick={() =>
                      setConfirmModal((prev) => ({ ...prev, open: false }))
                    }
                  >
                    Cancel
                  </button>
                  <button
                    className="modal-btn modal-btn-confirm"
                    onClick={confirmModal.onConfirm}
                  >
                    Confirm
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GROUP CREATION */}
      {groupModal.open && (
        <div className="modal-overlay" style={{ display: "flex" }}>
          <div className="modal-content">
            <div className="modal-title">Create New Group</div>
            <div className="modal-message">
              <p>Enter group name:</p>
              <input
                autoFocus
                type="text"
                value={groupModal.name}
                onChange={(e) =>
                  setGroupModal((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Bug Fix, Code Review"
                style={{
                  width: "100%",
                  padding: "8px",
                  marginBottom: "12px",
                  border: "1px solid var(--vscode-input-border)",
                  borderRadius: "4px",
                }}
              />
              <p>
                The currently selected prompt blocks will be saved as part of
                this group.
              </p>
            </div>
            <div className="modal-buttons">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={() => setGroupModal({ open: false, name: "" })}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-confirm"
                onClick={() => {
                  if (!groupModal.name.trim()) {
                    alert("Please enter a group name.");
                    return;
                  }
                  postMessage({
                    type: "createAgent",
                    name: groupModal.name,
                    subPrompts: state.activeBlocks,
                  });
                  setGroupModal({ open: false, name: "" });
                }}
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SET REFERENCE */}
      {referenceModal.open && (
        <div className="modal-overlay" style={{ display: "flex" }}>
          <div className="modal-content" style={{ maxWidth: "450px" }}>
            <div className="modal-title">Set Block Goal & Reference</div>
            <div className="modal-message">
              <p style={{ fontSize: "0.85em", opacity: 0.8, marginBottom: "16px", lineHeight: "1.4" }}>
                A reference directs the AI to use this block at a specific stage of your workflow. 
                It also provides the success criteria for the "Key Goal" section when the star is enabled.
                <br /><br />
                Example: "Perform a security audit of the proposed changes as per {"{{blockName}}"}"
              </p>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "0.85em",
                    opacity: 0.8,
                  }}
                >
                  Reference
                </label>
                <textarea
                  autoFocus
                  value={referenceModal.reference}
                  onChange={(e) =>
                    setReferenceModal((prev) => ({
                      ...prev,
                      reference: e.target.value,
                    }))
                  }
                  placeholder="e.g. Ensure all functions have type definitions"
                  style={{
                    width: "100%",
                    padding: "8px",
                    height: "80px",
                    backgroundColor: "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                    borderRadius: "4px",
                    resize: "none",
                  }}
                />
                <p style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '4px' }}>
                  Use <strong>{"{{blockName}}"}</strong> to automatically insert the name of this prompt block.
                </p>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "0.85em",
                    opacity: 0.8,
                  }}
                >
                  Workflow Location
                </label>
                <select
                  value={referenceModal.location}
                  onChange={(e) =>
                    setReferenceModal((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    backgroundColor: "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    border: "1px solid var(--vscode-input-border)",
                    borderRadius: "4px",
                  }}
                >
                  {REFERENCE_LOCATIONS.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label}
                    </option>
                  ))}
                </select>
                <p
                  style={{ fontSize: "0.75em", opacity: 0.6, marginTop: "6px" }}
                >
                  {
                    REFERENCE_LOCATIONS.find(
                      (l) => l.value === referenceModal.location,
                    )?.description
                  }
                </p>
              </div>
            </div>
            <div className="modal-buttons">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={() =>
                  setReferenceModal({
                    open: false,
                    blockPath: "",
                    reference: "",
                    location: "workflowBeforeEditing",
                  })
                }
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-confirm"
                onClick={() => {
                  if (!referenceModal.reference.trim()) {
                    alert("Please enter a goal description.");
                    return;
                  }
                  postMessage({
                    type: "setBlockReference",
                    path: referenceModal.blockPath,
                    reference: referenceModal.reference,
                    location: referenceModal.location,
                  });
                  setReferenceModal({
                    open: false,
                    blockPath: "",
                    reference: "",
                    location: "workflowBeforeEditing",
                  });
                }}
              >
                Save Goal
              </button>
            </div>
          </div>
        </div>
      )}

      <FeaturesPermissionsPopover
        isOpen={permissionsModal.open}
        onClose={() => setPermissionsModal({ open: false })}
        defaultExpanded={permissionsModal.defaultExpanded}
        items={[
          {
            id: "folder",
            title: "Folder Permissions",
            icon: "folder",
            content: (
              <div>
                <p>
                  <strong>Why is this needed?</strong> Prompt Foundry needs
                  access to a local folder to serve as your dedicated prompt
                  library workspace.
                </p>
                <p>
                  <strong>Benefits:</strong> By initializing a library, you gain
                  custom prompt blocks, session persistence, and full history
                  management directly within your IDE.
                </p>
                <p>
                  <strong>What gets created?</strong> We will create a "Prompt
                  Library" folder containing your Markdown-based prompt blocks
                  and JSON files for storing your extension metadata, group
                  recipes, and styles.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <button
                    className="main-btn"
                    onClick={() =>
                      postMessage({ type: "selectOnboardingFolder" })
                    }
                  >
                    Select location to create folder
                  </button>
                  <button
                    className="main-btn"
                    style={{
                      background: "var(--vscode-button-secondaryBackground)",
                      color: "var(--vscode-button-secondaryForeground)",
                    }}
                    onClick={() =>
                      postMessage({ type: "selectExistingFolder" })
                    }
                  >
                    Select existing folder
                  </button>
                </div>
              </div>
            ),
          },
          {
            id: "sources",
            title: "Custom library sources",
            icon: "library",
            content: (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <p style={{ margin: "0 0 8px 0" }}>Import prompts from external locations:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <button
                      className="main-btn"
                      style={{ flex: "1 1 auto", padding: "4px 8px", fontSize: "0.85em" }}
                      onClick={() => postMessage({ type: "openSettings", setting: "promptForge.showClaudeCodeBlocks" })}
                    >
                      Claude Code
                    </button>
                    <button
                      className="main-btn"
                      style={{ flex: "1 1 auto", padding: "4px 8px", fontSize: "0.85em" }}
                      onClick={() => postMessage({ type: "openSettings", setting: "promptForge.showCursorRules" })}
                    >
                      Cursor
                    </button>
                    <button
                      className="main-btn"
                      style={{ flex: "1 1 auto", padding: "4px 8px", fontSize: "0.85em" }}
                      onClick={() => postMessage({ type: "openSettings", setting: "promptForge.showWorkspaceSkills" })}
                    >
                      Workspace Skills
                    </button>
                  </div>
                </div>
                
                <div style={{ borderTop: "1px solid var(--vscode-widget-border)", paddingTop: "12px" }}>
                  <p style={{ margin: "0 0 8px 0" }}>Add your own custom external folders:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <button
                      className="main-btn"
                      style={{ flex: "1 1 auto", padding: "4px 8px", fontSize: "0.85em" }}
                      onClick={() => postMessage({ type: "openSettings", setting: "promptForge.customFolders" })}
                    >
                      Custom Folder (can be any folder with markdown files)
                    </button>
                    {/* 
                    <button
                      className="main-btn"
                      style={{ flex: "1 1 auto", padding: "4px 8px", fontSize: "0.85em" }}
                      onClick={() => postMessage({ type: "openSettings", setting: "promptForge.customWorkspaceFolders" })}
                    >
                      Workspace Folder
                    </button>
                    */}
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "tui",
            title: "TUI Dashboard",
            icon: "terminal",
            content: (
              <div>
                <p>
                  The Prompt Foundry TUI is a standalone terminal app that lets you
                  access your prompt library and compile a prompt from external tools.
                  Especially built for AI CLI tools like Claude Code.
                </p>

                <h4 style={{ margin: "16px 0 6px" }}>Run directly</h4>
                <p style={{ fontSize: "0.85em", opacity: 0.8 }}>
                  Use the following script to run the TUI:
                </p>
                <CopyablePre
                  content={`${state.tuiPath ? `"${state.tuiPath}"` : "/path/to/prompt-forge-tui.sh"}${state.settings.promptFolder ? ` --library "${state.settings.promptFolder}"` : ""}`}
                />

                <h4 style={{ margin: "12px 0 6px" }}>Setup for Claude Code</h4>
                <p style={{ fontSize: "0.85em", opacity: 0.8 }}>
                  To use Prompt Foundry as your primary prompt editor in Claude
                  Code, update your ~/.claude/settings.json:
                </p>
                <CopyablePre
                  content={`{
  "useExternalEditor": true,
  "externalEditor": "${state.tuiPath ? `\\"${state.tuiPath}\\"` : "/path/to/prompt-forge-tui.sh"} --new-window${state.settings.promptFolder ? ` --library \\"${state.settings.promptFolder}\\"` : ""}"
}`}
                />

                <h4 style={{ margin: "16px 0 6px" }}>Other CLI apps</h4>
                <p style={{ fontSize: "0.85em", opacity: 0.8 }}>
                    See if your CLI app supports a custom environmental variable or customer external editor app.
                    You can use the following env variable to set the editor to the TUI.
                </p>
                <CopyablePre
                  content={`export EDITOR="${state.tuiPath ? `\\"${state.tuiPath}\\"` : "/path/to/prompt-forge-tui.sh"} --new-window${state.settings.promptFolder ? ` --library \\"${state.settings.promptFolder}\\"` : ""}"`}
                />
              </div>
            ),
          },
          {
            id: "mcp",
            title: "MCP Server",
            icon: "circuit-board",
            content: (
              <div>
                <p>
                  The Prompt Foundry MCP Server powers a circular,
                  self-improving prompt library. AI agents can read and improve
                  your prompt blocks based on session learning.
                </p>
                <pre
                  style={{
                    backgroundColor: "var(--vscode-editor-background)",
                    padding: "8px",
                    overflowX: "auto",
                    fontSize: "0.8em",
                    border: "1px solid var(--vscode-widget-border)",
                  }}
                >
                  <code>
                    {state.mcpConfig || "// Loading dynamic configuration..."}
                  </code>
                </pre>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default App;
