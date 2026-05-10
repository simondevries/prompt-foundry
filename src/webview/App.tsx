import React, { useState, useEffect, useRef, useCallback } from "react";
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

  // Close overlays on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.history-overlay') && !target.closest('.icon-btn')) {
        setHistoryOpen(false);
        setTemplatesOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
  const clearAutoSaveTimers = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
  };

  const handleMainInstructionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const newVal = e.target.value;
    updateState({ mainInstruction: newVal, autoTagCount: 0 });
    setShowRestore(false);

    // Debounced sync for extension state (which also auto-saves to current_instruction_prompt.json)
    clearAutoSaveTimers();
    debounceTimer.current = setTimeout(() => {
      postMessage({ type: "updateMainInstruction", value: newVal });
      console.log("Syncing and auto-saving main instruction");
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
  }, [updateState, findAllTags]);  // Global click handler to close overlays
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
        <div style={{ padding: '8px 12px', paddingBottom: 0 }}>
          {(() => {
            const edit = state.proposedEdits[0]; // Show the most recent edit (sorted in promptManager)
            const isOpened = diffOpenedId === edit.id;
            
            return (
              <div className="banner banner-attention" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="codicon codicon-git-pull-request"></span>
                  <span>AI proposed an edit to <strong>{edit.name}</strong></span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {!isOpened ? (
                    <button 
                      className="banner-cta"
                      onClick={() => {
                        postMessage({ type: "openProposedDiff", diffFile: edit.diffFile, targetFile: edit.targetFile });
                        setDiffOpenedId(edit.id);
                      }}
                    >
                      Open Diff
                    </button>
                  ) : (
                    <>
                      <button 
                        className="banner-cta"
                        style={{ backgroundColor: '#1e7e34', color: 'white' }}
                        onClick={() => {
                          postMessage({ type: "commitProposedEdit", id: edit.id });
                          setDiffOpenedId(null);
                        }}
                      >
                        Commit
                      </button>
                      <button 
                        className="banner-cta"
                        style={{ backgroundColor: 'transparent', border: '1px solid var(--vscode-testing-iconFailed)', color: 'var(--vscode-testing-iconFailed)' }}
                        onClick={() => {
                          postMessage({ type: "rejectProposedEdit", id: edit.id });
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
              borderRadius: "4px",
              marginLeft: "4px",
            }}
          />
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
                    updateState({ mainInstruction: "" });
                    postMessage({ type: "updateMainInstruction", value: "" });
                    postMessage({ type: "deleteAllPrompts" });
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
                onClick={checkAndSetCaret}
                onKeyUp={checkAndSetCaret}
                onFocus={checkAndSetCaret}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const currentActionType =
                      state.lastAction ||
                      (state.appName.toLowerCase().includes("cursor")
                        ? "send"
                        : "copy");
                    if (currentActionType === "send") {
                      postMessage({
                        type: "updateMainInstruction",
                        value: state.mainInstruction,
                      });
                      postMessage({ type: "sendPrompt" });
                      updateState({ lastAction: "send" });
                      reachMilestone("copied_or_sent");
                      reachMilestone("used_hotkey");
                    } else {
                      postMessage({
                        type: "updateMainInstruction",
                        value: state.mainInstruction,
                      });
                      postMessage({ type: "copyPrompt" });
                      updateState({ lastAction: "copy" });
                      reachMilestone("copied_or_sent");
                      reachMilestone("used_hotkey");
                    }
                    clearAutoSaveTimers();
                    if (state.isUserInitializedLibrary) {
                      postMessage({ type: "clearAndResetUI" });
                      setShowRestore(true);
                    }
                  }
                }}
                placeholder="Type your main instructions here..."
              ></textarea>
              {!state.milestones?.["used_hotkey"] && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "8px",
                    right: "12px",
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
                postMessage({ type: "toggleGoal", path });
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
            const handleCopy = () => {
              postMessage({
                type: "updateMainInstruction",
                value: state.mainInstruction,
              });
              postMessage({ type: "copyPrompt" });
              updateState({ lastAction: "copy" });
              reachMilestone("copied_or_sent");
              clearAutoSaveTimers();
              if (state.isUserInitializedLibrary) {
                postMessage({ type: "clearAndResetUI" });
                setShowRestore(true);
              }
            };

            const handleSend = () => {
              postMessage({
                type: "updateMainInstruction",
                value: state.mainInstruction,
              });
              postMessage({ type: "sendPrompt" });
              updateState({ lastAction: "send" });
              reachMilestone("copied_or_sent");
              clearAutoSaveTimers();
              if (state.isUserInitializedLibrary) {
                postMessage({ type: "clearAndResetUI" });
                setShowRestore(true);
              }
            };

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
            onCtaClick={() => setPermissionsModal({ open: true, defaultExpanded: "folder" })}
            canClose={false}
            style={{ marginTop: '8px' }}
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
              onClick={() => postMessage({ type: "openPromptFolder" })}
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
                setPermissionsModal({ open: true, defaultExpanded: "folder" });
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span className="codicon codicon-settings"></span>
                <span>Change Prompt Folder...</span>
              </div>
            </div>

            <div
              className="history-item"
              onClick={() => {
                setSettingsOpen(false);
                postMessage({ type: "getMcpConfig" });
                setPermissionsModal({ open: true, defaultExpanded: "mcp" });
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span className="codicon codicon-circuit-board"></span>
                <span>Setup MCP Server...</span>
              </div>
            </div>

            <div
              className="history-item"
              onClick={() => {
                postMessage({
                  type: "openSettings",
                  setting: "promptForge.showClaudeCodeBlocks",
                });
                setSettingsOpen(false);
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  className={`codicon codicon-${state.settings.showClaudeCodeBlocks ? "check" : "blank"}`}
                ></span>
                <span>Show Claude Code Items</span>
              </div>
            </div>

            <div
              className="history-item"
              onClick={() => {
                postMessage({
                  type: "openSettings",
                  setting: "promptForge.showCursorRules",
                });
                setSettingsOpen(false);
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  className={`codicon codicon-${state.settings.showCursorRules ? "check" : "blank"}`}
                ></span>
                <span>Show Cursor Items</span>
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
              postMessage({ type: "selectAgent", agent: group });
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
        onClick={() => postMessage({ type: 'openExternal', url: 'https://form.typeform.com/to/hAc2CQ6A' })}
      >
        <span className="codicon codicon-feedback"></span>
        <span style={{ marginLeft: '8px' }}>Feedback valued (1 min)</span>
      </div>

      {/* MODAL: CONFIRMATION */}
      {confirmModal.open && (
        <div className="modal-overlay" style={{ display: "flex" }}>
          <div className="modal-content">
            <div className="modal-title">{confirmModal.title}</div>
            <div className="modal-message">{confirmModal.message}</div>
            <div className="modal-buttons">
              {confirmModal.title === "Prompt Forge MCP Server" ? (
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

      <script>console.log("Hello")</script>

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
                  <strong>Why is this needed?</strong> Prompt Forge needs access
                  to a local folder to serve as your dedicated prompt library
                  workspace.
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
            id: "claude",
            title: "Claude Integration",
            icon: "claude",
            content: (
              <div>
                <p>Allow Prompt Forge to read Claude Code skills and commands.</p>
                <button
                  className="main-btn"
                  onClick={() =>
                    postMessage({
                      type: "openSettings",
                      setting: "promptForge.showClaudeCodeBlocks",
                    })
                  }
                >
                  Configure Claude Settings
                </button>
              </div>
            ),
          },
          {
            id: "cursor",
            title: "Cursor Integration",
            icon: "cursor",
            content: (
              <div>
                <p>Allow Prompt Forge to read Cursor rules.</p>
                <button
                  className="main-btn"
                  onClick={() =>
                    postMessage({
                      type: "openSettings",
                      setting: "promptForge.showCursorRules",
                    })
                  }
                >
                  Configure Cursor Settings
                </button>
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
                  The Prompt Forge MCP Server powers a circular, self-improving
                  prompt library. AI agents can read and improve your prompt
                  blocks based on session learning.
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
