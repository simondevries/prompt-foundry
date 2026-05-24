import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { PromptManager } from "../core/promptManager";
import { getPromptBuilderDir } from "./utils";
import { isValidCommitHash } from "../core/gitUtils";
import { FsPermission } from "../core/fs";
import { PromptLibraryCategory } from "../core/interfaces";

export class MainPromptWebviewProvider implements vscode.WebviewViewProvider {
  public view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _promptManager: PromptManager,
  ) {
    this._fs = _promptManager.fs;
  }

  private _fs: any; // We'll use this for all file operations

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken,
  ) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "dist"),
        vscode.Uri.joinPath(this._extensionUri, "resources"),
      ],
    };

    // Always render standard view; UI will handle editing state based on hasCreatedLibraryFolder
    this._promptManager.loadLatestSession();
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      console.log("Received a message from webview:", data);
      const promptBuilderDir = this._promptManager.getPromptBuilderDir();

      switch (data.type) {
        case "selectExistingFolder":
          const existingFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Existing Folder",
          });
          if (existingFolders && existingFolders.length > 0) {
            try {
              const targetDir = existingFolders[0].fsPath;

              // Security: Trust this path as it's user-selected
              this._fs.trustPath(targetDir, FsPermission.ReadWrite);

              // Update configuration directly
              const config = vscode.workspace.getConfiguration("promptForge");
              await config.update(
                "promptFolder",
                targetDir,
                vscode.ConfigurationTarget.Global,
              );

              // Ensure we re-init the FS roots
              this._promptManager.fs.updateRoots(targetDir);

              vscode.window.showInformationMessage(
                "Prompt Library updated successfully!",
              );
              this._promptManager.reload();
              this.refreshView();

              vscode.window.showInformationMessage(
                "Existing folder selected as Prompt Library!",
              );
              this._promptManager.reload();
              this.refreshView();
            } catch (e: any) {
              console.error(e);
              vscode.window.showErrorMessage(
                `Failed to select folder: ${e.message}`,
              );
            }
          }
          break;
        case "selectOnboardingFolder":
          const folders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Prompt Folder",
          });
          if (folders && folders.length > 0) {
            try {
              const baseDir = folders[0].fsPath;
              const targetDir = path.join(baseDir, "Prompt Library");

              // Security: Trust this path before initializing
              this._fs.trustPath(targetDir, FsPermission.ReadWrite);
              this._promptManager.fs.trustPath(
                targetDir,
                FsPermission.ReadWrite,
              );

              const sampleDir = path.join(this._extensionUri.fsPath, "prompts");

              console.log(
                `Initializing library at ${targetDir} from ${sampleDir}`,
              );
              this._promptManager.initializePromptFolder(targetDir, sampleDir);

              const config = vscode.workspace.getConfiguration("promptForge");
              await config.update(
                "promptFolder",
                targetDir,
                vscode.ConfigurationTarget.Global,
              );

              vscode.window.showInformationMessage(
                "Prompt Foundry initialized successfully!",
              );
              this._promptManager.reload();
              this.refreshView();
            } catch (e: any) {
              console.error(e);
              vscode.window.showErrorMessage(
                `Failed to initialize: ${e.message}`,
              );
            }
          }
          break;
        case "openSettings":
          if (data.setting) {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              data.setting,
            );
          }
          break;
        case "updateBuiltInLibrary":
          try {
            const targetDir = this._promptManager.promptBuilderDir;
            const sampleDir = path.join(this._extensionUri.fsPath, "prompts");

            console.log(`Updating library at ${targetDir} from ${sampleDir}`);
            this._promptManager.initializePromptFolder(targetDir, sampleDir);

            vscode.window.showInformationMessage(
              "Prompt library updated successfully!",
            );
            this._promptManager.reload();
            this.refreshView();
          } catch (e: any) {
            console.error(e);
            vscode.window.showErrorMessage(
              `Failed to update library: ${e.message}`,
            );
          }
          break;
        case "webviewReady":
          console.log("Webview is ready, sending initial state.");
          this.sendInitialData();
          break;
        case "updateMainInstruction":
          // Updates in-memory state and auto-saves to current_instruction_prompt.json
          this._promptManager.updateMainInstruction(
            data.value,
            data.fileMap,
            data.collidedNames,
          );
          break;
        case "addBlock":
          try {
            const blockContent = this._promptManager.getPromptBlockContent(
              data.category,
              data.file,
            );
            const result = this._promptManager.parseBlockMetadata(blockContent);

            if (result && Object.keys(result.variables).length > 0) {
              this.view?.webview.postMessage({
                type: "showLiquidVariablesForm",
                data: {
                  category: data.category,
                  name: data.file,
                  schema: result.variables,
                },
              });
            } else {
              this._promptManager.addActiveBlock(data.category, data.file);
              this.sendBlocksUpdate();
            }
          } catch (e: any) {
            console.error(`[addBlock] Failed: ${e.message}`, e);
            // Fallback for special/virtual blocks that don't have files
            this._promptManager.addActiveBlock(data.category, data.file);
            this.sendBlocksUpdate();
          }
          break;
        case "addBlockWithVariables":
          if (data.file === "Git Specific Commit") {
            const { hash, summary } = data.variables;
            const isSummary = summary === "true";
            if (!isValidCommitHash(hash)) {
              vscode.window.showErrorMessage("Invalid commit hash format.");
              return;
            }
            if (isSummary) {
              // Custom summary for specific commit
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (workspaceFolders && workspaceFolders.length > 0) {
                const rootPath = workspaceFolders[0].uri.fsPath;
                execFile(
                  "git",
                  [
                    "show",
                    "--name-only",
                    "--format=Commit %H %ad %s",
                    hash,
                    "--",
                  ],
                  { cwd: rootPath },
                  (err, stdout) => {
                    this._promptManager.addSpecialBlock(
                      `Commit Summary ${hash}`,
                      stdout?.trim() || "No changes.",
                    );
                    this.refresh();
                  },
                );
              }
            } else {
              await this._addGitCommitDiffToPrompt(hash);
            }
            this.sendBlocksUpdate();
          } else {
            this._promptManager.addActiveBlock(
              data.category,
              data.file,
              data.variables,
            );
            this.sendBlocksUpdate();
          }
          break;

        case "removeBlock":
          this._promptManager.removeActiveBlock(data.path);
          this.sendBlocksUpdate();
          break;
        case "toggleGoal":
          const success = this._promptManager.toggleGoal(data.path);
          if (!success) {
            vscode.window.showWarningMessage(
              "Maximum of 5 key goals allowed per prompt.",
            );
          }
          this.sendBlocksUpdate();
          break;
        case "setBlockReference":
          this._promptManager.updateBlockReference(
            data.path,
            data.reference,
            data.location,
          );
          this.sendBlocksUpdate();
          break;
        case "sendPrompt":
          console.log("Send prompted triggered");
          const prompt = await this._compileCurrentPrompt();
          try {
            this._promptManager.saveCurrentSession();
          } catch (e) {
            console.error("Failed to auto-save session after sendPrompt", e);
          }
          vscode.commands.executeCommand("prompt-forge.sendToAI", prompt);
          break;
        case "copyPrompt":
          const copyText = await this._compileCurrentPrompt();
          vscode.env.clipboard.writeText(copyText);
          vscode.window.showInformationMessage("Prompt copied to clipboard!");
          try {
            this._promptManager.saveCurrentSession();
            this.sendHistoryUpdate();
          } catch (e) {
            console.error("Failed to auto-save session after copyPrompt", e);
          }
          break;
        case "restoreLastSession":
          this._promptManager.restoreLastSession();
          this.refresh();
          if (this.view) {
            this.view.webview.postMessage({
              type: "setMainInstruction",
              value: this._promptManager.getMainInstruction(),
            });
          }
          break;
        case "saveSession":
          try {
            this._promptManager.saveCurrentSession();
            vscode.window.showInformationMessage("Session saved successfully!");
            this.sendHistoryUpdate();
          } catch (e: any) {
            vscode.window.showErrorMessage(
              `Failed to save session: ${e.message}`,
            );
          }
          break;
        case "loadSession":
          try {
            this._promptManager.loadSession(data.filePath);
            vscode.window.showInformationMessage(
              "Session loaded successfully!",
            );
            this.refresh();
            if (this.view) {
              this.view.webview.postMessage({
                type: "setMainInstruction",
                value: this._promptManager.getMainInstruction(),
              });
            }
          } catch (e: any) {
            vscode.window.showErrorMessage(
              `Failed to load session: ${e.message}`,
            );
          }
          break;
        case "deleteSession":
          try {
            this._promptManager.deleteSession(data.filePath);
            vscode.window.showInformationMessage(
              "Session deleted successfully!",
            );
            this.sendHistoryUpdate();
          } catch (e: any) {
            vscode.window.showErrorMessage(
              `Failed to delete session: ${e.message}`,
            );
          }
          break;
        case "getHistoryList":
          this.sendHistoryUpdate();
          break;
        case "getPromptBlocksSettings":
          this.sendPromptBlocksSettings();
          break;
        case "toggleClaudeCodeBlocks":
          await this.toggleClaudeCodeBlocks();
          this.refresh();
          this.sendPromptBlocksSettings();
          break;
        case "toggleCursorRules":
          await this.toggleCursorRules();
          this.refresh();
          this.sendPromptBlocksSettings();
          break;
        case "clearAndResetUI":
          this._promptManager.clearCurrentSession();
          this.refresh();
          // Explicitly tell the webview to clear its prompt text,
          // since refresh()'s updateLibrary no longer carries mainPrompt.
          if (this.view) {
            this.view.webview.postMessage({
              type: "setMainInstruction",
              value: "",
            });
          }
          break;
        case "deleteAllHistory":
          this._promptManager.deleteAllHistory();
          this.sendHistoryUpdate();
          break;
        case "deleteAllPrompts":
          try {
            this._promptManager.clearCurrentSession();
            this.refresh();
          } catch (e) {
            console.error("Failed to delete all prompts", e);
          }
          break;
        case "deleteBlock":
          if (data.path && this._fs.existsSync(data.path)) {
            try {
              this._fs.unlinkSync(data.path);
              vscode.window.showInformationMessage(
                `Deleted: ${path.basename(data.path)}`,
              );
              this.refresh();
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to delete file: ${e}`);
            }
          }
          break;
        case "editFile":
          if (data.path) {
            // Validated internally by resolve or exists
            if (this._fs.existsSync(data.path)) {
              vscode.commands.executeCommand(
                "prompt-forge.editPrompt",
                data.path,
              );
            }
          }
          break;
        case "openPromptFolder":
          vscode.commands.executeCommand(
            "revealFileInOS",
            vscode.Uri.file(promptBuilderDir),
          );
          break;
        case "changePromptFolder":
          const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Prompt Folder",
          });
          if (uri && uri.length > 0) {
            const config = vscode.workspace.getConfiguration("promptForge");
            await config.update(
              "promptFolder",
              uri[0].fsPath,
              vscode.ConfigurationTarget.Global,
            );
            this._promptManager.reload();
            this.refresh();
            vscode.window.showInformationMessage(
              `Prompt folder changed to: ${uri[0].fsPath}`,
            );
          }
          break;
        case "addProblemsContext":
          await this._addProblemsContextToPrompt();
          break;
        case "addActiveFileSymbols":
          if (data.variables && data.variables.kind_filter) {
            await this._addActiveFileSymbolsToPrompt(
              data.variables.kind_filter,
            );
          } else {
            await this._addActiveFileSymbolsToPrompt("PromptForm");
          }
          break;
        case "gitcommit":
          this.view?.webview.postMessage({
            type: "showLiquidVariablesForm",
            data: {
              category: "Tools",
              name: "Git Specific Commit",
              schema: {
                hash: { type: "text" },
                summary: { type: "checkbox" },
              },
            },
          });
          break;
        case "addGitDiff":
          if (data.variables && data.variables.diff_type) {
            const {
              diff_type,
              branch,
              manual_ref,
              summary_only,
              staged,
              unstaged,
            } = data.variables;
            const isSummary = summary_only === true;
            const finalRef =
              (diff_type === "commit" ? manual_ref : branch) || "HEAD";

            if (diff_type === "working_tree") {
              await this._addWorkingTreeDiff(staged, unstaged, isSummary);
            } else if (diff_type === "branch") {
              await this._addGitDiffRefToPromptWithRef(finalRef, isSummary);
            } else if (diff_type === "commit") {
              if (!isValidCommitHash(manual_ref)) {
                vscode.window.showErrorMessage(
                  "Invalid commit hash format. Please provide a valid hex hash (min 4 chars).",
                );
                return;
              }
              await this._addGitDiffRefToPromptWithRef(manual_ref, isSummary);
            }
          } else {
            // Request branches first, then show the custom form
            const branches = await this._getGitBranches();
            this.view?.webview.postMessage({
              type: "showGitDiffForm",
              branches,
            });
          }
          break;
        case "addGitDiffRefWithRef":
          await this._addGitDiffRefToPromptWithRef(data.ref, data.summaryOnly);
          break;
        case "reloadData":
          this._promptManager.reload();
          this.refresh();
          break;
        case "createCategory":
          const categoryName = await vscode.window.showInputBox({
            prompt: "Enter new category name",
            placeHolder: "e.g. Logic, Styling, Context",
          });
          if (categoryName) {
            const promptBuilderDir = this._promptManager.getPromptBuilderDir();
            const dirPath = path.join(promptBuilderDir, categoryName);

            try {
              if (!this._fs.existsSync(dirPath)) {
                this._fs.mkdirSync(dirPath, { recursive: true });
                vscode.window.showInformationMessage(
                  `Category "${categoryName}" created.`,
                );
                this.refresh();
              } else {
                vscode.window.showErrorMessage(
                  `Category "${categoryName}" already exists.`,
                );
              }
            } catch (e: any) {
              vscode.window.showErrorMessage(e.message);
            }
          }
          break;
        case "createBlock":
          const blockName = await vscode.window.showInputBox({
            prompt: `Enter new prompt name for category "${data.category}"`,
            placeHolder: "e.g. system-rules",
          });
          if (blockName) {
            let fileName = blockName;
            const defaultExt = data.category === "Cursor" ? ".mdc" : ".md";
            if (
              !fileName.toLowerCase().endsWith(".md") &&
              !fileName.toLowerCase().endsWith(".mdc") &&
              !fileName.toLowerCase().endsWith(".cursorrules")
            ) {
              fileName += defaultExt;
            }
            const promptBuilderDir = this._promptManager.getPromptBuilderDir();
            const categoryPath = path.join(promptBuilderDir, data.category);
            const filePath = path.join(categoryPath, fileName);

            try {
              if (!this._fs.existsSync(categoryPath)) {
                this._fs.mkdirSync(categoryPath, { recursive: true });
              }

              if (!this._fs.existsSync(filePath)) {
                this._fs.writeFileSync(filePath, "", "utf8");
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc);
              } else {
                vscode.window.showErrorMessage(
                  `Prompt "${fileName}" already exists in "${data.category}".`,
                );
              }
            } catch (e: any) {
              vscode.window.showErrorMessage(e.message);
            }
          }
          break;
        case "selectAgent":
          if (data.agent) {
            // Find the group by name
            const groups = this._promptManager.getGroupLibrary();
            const group = groups.find((g: any) => g.name === data.agent);
            if (group) {
              this._promptManager.addGroupToActiveBlocks(group);
              this.refresh();
            } else {
              vscode.window.showErrorMessage(`Group "${data.agent}" not found.`);
            }
          }
          break;
        case "createAgent":
          if (data.name) {
            console.log("Creating agent with data:", data);

            const groupData = {
              name: data.name,
              subPrompts: data.subPrompts || [],
              description: `Group created via Prompt Forge extension`,
            };

            try {
              this._promptManager.saveGroup(groupData);
              this.refresh();
              vscode.window.showInformationMessage(
                `Group "${data.name}" created successfully!`,
              );
            } catch (e: any) {
              vscode.window.showErrorMessage(
                `Failed to save group: ${e.message}`,
              );
            }
          }
          break;
        case "deleteGroup":
          if (data.name) {
            this._promptManager.deleteGroup(data.name);
            this.refresh();
            vscode.window.showInformationMessage(
              `Group "${data.name}" deleted.`,
            );
          }
          break;
        case "renameCategory":
          if (data.name) {
            const newName = await vscode.window.showInputBox({
              prompt: `Rename category "${data.name}" to:`,
              value: data.name,
            });
            if (newName && newName !== data.name) {
              try {
                this._promptManager.renameCategory(data.name, newName);
                vscode.window.showInformationMessage(
                  `Category renamed to "${newName}"`,
                );
                this.refresh();
              } catch (e: any) {
                vscode.window.showErrorMessage(
                  `Failed to rename category: ${e.message}`,
                );
              }
            }
          }
          break;
        case "getMcpConfig":
          if (this.view) {
            const mcpPath = path.join(
              this._extensionUri.fsPath,
              "dist",
              "mcp.bundle.js",
            );
            const promptRoot = this._promptManager.getPromptBuilderDir();
            const config = {
              mcpServers: {
                "prompt-forge": {
                  command: "node",
                  args: [mcpPath],
                  env: {
                    PROMPT_ROOT: promptRoot,
                  },
                },
              },
            };
            this.view.webview.postMessage({
              type: "updateMcpConfig",
              config: JSON.stringify(config, null, 2),
            });
          }
          break;
        case "openExternal":
          if (data.url) {
            vscode.env.openExternal(vscode.Uri.parse(data.url));
          }
          break;
        case "moveBlockPrompt":
          if (data.path) {
            const folders = this._promptManager.getUserFolders();
            const selected = await vscode.window.showQuickPick(folders, {
              placeHolder: `Move "${path.basename(data.path)}" to folder...`,
              title: "Move Prompt Block",
            });
            if (selected) {
              try {
                this._promptManager.moveBlock(data.path, selected);
                vscode.window.showInformationMessage(
                  `Moved "${path.basename(data.path)}" to folder "${selected}".`,
                );
                this.refresh();
              } catch (e: any) {
                vscode.window.showErrorMessage(
                  `Failed to move block: ${e.message}`,
                );
              }
            }
          }
          break;
        case "openProposedDiff":
          if (data.targetFile && data.diffFile) {
            if (this._fs.existsSync(data.diffFile)) {
              vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.file(data.diffFile),
                { preview: true },
              );
            } else {
              vscode.window.showErrorMessage("Diff file not found.");
            }
          }
          break;
        case "addCurrentFileTag":
          const editorForCamera = vscode.window.activeTextEditor;
          if (editorForCamera) {
            let filePath = editorForCamera.document.uri.fsPath;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(
              editorForCamera.document.uri,
            );
            if (workspaceFolder) {
              filePath = path.relative(workspaceFolder.uri.fsPath, filePath);
            }
            const selection = editorForCamera.selection;
            let lines = "";
            if (!selection.isEmpty) {
              const startLine = selection.start.line + 1;
              const endLine = selection.end.line + 1;
              lines =
                startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
            }
            this.view?.webview.postMessage({
              type: "insertFileTag",
              path: filePath,
              lines: lines,
            });
          } else {
            vscode.window.showInformationMessage("No active editor found to add.");
          }
          break;
        case "commitProposedEdit":
          try {
            this._promptManager.commitBlock(data.id);
            vscode.window.showInformationMessage(
              "Edit committed successfully.",
            );
            this.refresh();
          } catch (e: any) {
            vscode.window.showErrorMessage(
              `Failed to commit edit: ${e.message}`,
            );
          }
          break;
        case "rejectProposedEdit":
          try {
            this._promptManager.rejectBlock(data.id);
            vscode.window.showInformationMessage("Edit rejected.");
            this.refresh();
          } catch (e: any) {
            vscode.window.showErrorMessage(
              `Failed to reject edit: ${e.message}`,
            );
          }
          break;
        case "showError":
          if (data.message) {
            vscode.window.showErrorMessage(data.message);
          }
          break;
        case "searchSlashCommands":
          if (data.filterString !== undefined) {
            const results = await this._searchSlashCommands(data.filterString);
            this.view?.webview.postMessage({
              type: "slashCommandSearchResults",
              results: results,
              requestId: data.requestId,
            });
          }
          break;
        case "searchMentions":
          if (data.filterString !== undefined) {
            const results = await this._searchMentions(data.filterString);
            this.view?.webview.postMessage({
              type: "mentionSearchResults",
              results: results,
              requestId: data.requestId,
            });
          }
          break;
        case "showInputBox":
          const input = await vscode.window.showInputBox({
            prompt: data.prompt,
            placeHolder: data.placeHolder,
            value: data.value,
          });
          if (input !== undefined) {
            this.view?.webview.postMessage({
              type: "inputBoxResult",
              requestId: data.requestId,
              value: input,
            });
          }
          break;
      }
    });
  }

  private async _searchSlashCommands(filterString: string) {
    const results: any[] = [];
    const lowerFilter = filterString.toLowerCase().trim();

    // 1. Built-in Actions
    const actions = [
      { name: "file", label: "Current File", icon: "file" },
      { name: "copy", label: "Copy Prompt", icon: "copy" },
      { name: "send", label: "Send Prompt", icon: "send" },
      { name: "clear", label: "Clear Session", icon: "trash" },
    ];

    for (const action of actions) {
      if (action.name.startsWith(lowerFilter) || action.label.toLowerCase().includes(lowerFilter)) {
        results.push({
          type: "action",
          name: action.name,
          label: action.label,
          icon: action.icon,
        });
      }
    }

    // 2. Search Blocks
    const library = this._promptManager.getPromptLibrary(true, true) as PromptLibraryCategory[];
    const searchContent = lowerFilter.replace(/^(block|group)\s*/, "");

    for (const category of library) {
      for (const block of category.files) {
        const label = `${category.name}: ${block}`;
        if (lowerFilter === "" || label.toLowerCase().includes(searchContent)) {
          results.push({
            type: "block",
            name: block,
            category: category.name,
            label: label,
            icon: "file-code",
          });
        }
      }
    }

    // 3. Search Groups
    const groups = this._promptManager.getGroupLibrary();
    for (const group of groups) {
      if (lowerFilter === "" || group.name.toLowerCase().includes(searchContent)) {
        results.push({
          type: "block",
          name: group.name,
          label: `Group: ${group.name}`,
          icon: "list-tree",
          isGroup: true,
        });
      }
    }

    return results.slice(0, 20);
  }

  private async _searchMentions(filterString: string) {
    const results: any[] = [];

    // Search Workspace Files
    if (filterString.length >= 1) {
      // Create a case-insensitive glob pattern: readme -> [rR][eE][aA][dD][mM][eE]
      const caseInsensitiveFilter = filterString
        .split("")
        .map((char) => {
          if (/[a-zA-Z]/.test(char)) {
            return `[${char.toLowerCase()}${char.toUpperCase()}]`;
          }
          return char;
        })
        .join("");

      const searchPattern = `**/*${caseInsensitiveFilter}*`;

      // Get excluded folders from settings
      const config = vscode.workspace.getConfiguration("promptForge");
      const excludedFolders = config.get<string[]>("mentionExcludeFolders", [
        "node_modules",
        "dist",
        "out",
        ".git",
        ".pnpm-store",
      ]);

      const excludePattern = `{${excludedFolders.map((f) => `**/${f}/**`).join(",")}}`;

      const files = await vscode.workspace.findFiles(
        searchPattern,
        excludePattern,
        50,
      );

      const lowerFilter = filterString.toLowerCase();
      for (const file of files) {
        const relativePath = vscode.workspace.asRelativePath(file);
        if (relativePath.toLowerCase().includes(lowerFilter)) {
          const fileName = path.basename(file.fsPath);
          const dirPath = path.dirname(relativePath);

          results.push({
            type: "file",
            name: fileName,
            path: dirPath === "." ? "" : dirPath,
            fullPath: relativePath,
            label: relativePath,
            icon: "file",
          });
        }
        if (results.length >= 20) break;
      }
    }

    return results;
  }

  private async _addProblemsContextToPrompt() {
    const diagnostics = vscode.languages.getDiagnostics();
    let problemContext = "";

    if (diagnostics.length === 0) {
      problemContext = "No problems found in the workspace.";
    } else {
      problemContext = "";
      diagnostics.forEach((diagnosticCollection) => {
        diagnosticCollection[1].forEach((diagnostic) => {
          const fileUri = diagnosticCollection[0];
          const filePath = vscode.workspace.asRelativePath(fileUri);
          problemContext += `File: ${filePath}\n`;
          problemContext += `Line: ${diagnostic.range.start.line + 1}\n`;
          problemContext += `Severity: ${vscode.DiagnosticSeverity[diagnostic.severity]}\n`;
          problemContext += `Message: ${diagnostic.message}\n`;
          problemContext += "---\n";
        });
      });
    }

    const fileName = vscode.window.activeTextEditor
      ? path.basename(vscode.window.activeTextEditor.document.fileName)
      : "Workspace";
    this._promptManager.addSpecialBlock(
      `IDE Problems (${fileName})`,
      problemContext,
    );
    this.refresh();
  }

  private async _addActiveFileSymbolsToPrompt(kindFilter: string = "All") {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("No active editor found.");
      return;
    }

    // If no filter provided, show the form
    if (kindFilter === "PromptForm") {
      this.view?.webview.postMessage({
        type: "showLiquidVariablesForm",
        data: {
          category: "Tools",
          name: "Add Active File Symbols",
          schema: {
            kind_filter: {
              type: "select",
              options: ["All", "Class", "Method", "Property", "Variable"],
            },
          },
        },
      });
      return;
    }

    try {
      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[]
      >("vscode.executeDocumentSymbolProvider", editor.document.uri);

      if (!symbols || symbols.length === 0) {
        vscode.window.showInformationMessage(
          "No symbols found in the current file.",
        );
        return;
      }

      let symbolInfo = `Symbols for ${path.basename(
        editor.document.uri.fsPath,
      )} (Filter: ${kindFilter}):\n`;

      const formatSymbols = (
        syms: vscode.DocumentSymbol[],
        indent: string = "",
      ): string => {
        let output = "";
        for (const symbol of syms) {
          const kindName = vscode.SymbolKind[symbol.kind];
          const matches = kindFilter === "All" || kindName === kindFilter;

          const childOutput = symbol.children
            ? formatSymbols(symbol.children, indent + "  ")
            : "";

          if (matches) {
            output += `${indent}- [${kindName}] ${symbol.name}\n${childOutput}`;
          } else {
            output += childOutput;
          }
        }
        return output;
      };

      symbolInfo += formatSymbols(symbols);

      const title = `Symbols (${path.basename(editor.document.fileName)})`;
      this._promptManager.addSpecialBlock(title, symbolInfo);
      this.sendBlocksUpdate();
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to fetch symbols: ${e}`);
    }
  }

  private async _compileCurrentPrompt(): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders
      ? workspaceFolders[0].uri.fsPath
      : null;
    return this._promptManager.compilePrompt(workspaceRoot);
  }

  public sendSelectionUpdate() {
    if (this.view) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        let filePath = editor.document.uri.fsPath;

        // Try to make path relative to workspace root
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          editor.document.uri,
        );
        if (workspaceFolder) {
          filePath = path.relative(workspaceFolder.uri.fsPath, filePath);
        }

        const selection = editor.selection;
        let lines = "";

        if (!selection.isEmpty) {
          const startLine = selection.start.line + 1;
          const endLine = selection.end.line + 1;
          lines =
            startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
        }

        this.view.webview.postMessage({
          type: "selectionChanged",
          path: filePath,
          lines: lines,
        });
      }
    }
  }

  public refresh() {
    if (this.view) {
      console.log("Refreshing webview...");
      this._promptManager.reload();

      const config = vscode.workspace.getConfiguration("promptForge");
      const showClaudeCodeBlocks = config.get<boolean>(
        "showClaudeCodeBlocks",
        false,
      );

      const showCursorRules = config.get<boolean>("showCursorRules", false);

      const library = this._promptManager.getPromptLibrary(
        showClaudeCodeBlocks,
        showCursorRules,
      );
      const activeBlocks = this._promptManager.getActiveBlocks();
      const mainInstruction = this._promptManager.getMainInstruction();
      const groupLibrary = this._promptManager.getGroupLibrary();
      const fileMap = this._promptManager.getFileMap();
      const collidedNames = this._promptManager.getCollidedNames();

      const suggestions = this._promptManager.getSuggestions();
      const proposedEdits = this._promptManager.getPendingProposedEdits();

      this.view.webview.postMessage({
        type: "updateLibrary",
        library: library,
        activeBlocks: activeBlocks,
        groupLibrary: groupLibrary,
        fileMap: fileMap,
        collidedNames: collidedNames,
        suggestions: suggestions,
        proposedEdits: proposedEdits,
      });
    }
  }

  private sendBlocksUpdate() {
    if (this.view) {
      const config = vscode.workspace.getConfiguration("promptForge");
      const showClaudeCodeBlocks = config.get<boolean>(
        "showClaudeCodeBlocks",
        false,
      );
      const showCursorRules = config.get<boolean>("showCursorRules", false);
      const library = this._promptManager.getPromptLibrary(
        showClaudeCodeBlocks,
        showCursorRules,
      );
      const activeBlocks = this._promptManager.getActiveBlocks();
      const groupLibrary = this._promptManager.getGroupLibrary();
      const fileMap = this._promptManager.getFileMap();
      const collidedNames = this._promptManager.getCollidedNames();
      const suggestions = this._promptManager.getSuggestions();
      const proposedEdits = this._promptManager.getPendingProposedEdits();

      // Deliberately omit mainInstruction — the webview owns that state
      // and sending it here would overwrite whatever the user has typed
      this.view.webview.postMessage({
        type: "updateLibrary",
        library: library,
        activeBlocks: activeBlocks,
        groupLibrary: groupLibrary,
        fileMap: fileMap,
        collidedNames: collidedNames,
        suggestions: suggestions,
        proposedEdits: proposedEdits,
      });
    }
  }

  public sendInitialData() {
    if (this.view) {
      console.log("Sending initial data package to webview...");
      const config = vscode.workspace.getConfiguration("promptForge");
      const showClaudeCodeBlocks = config.get<boolean>(
        "showClaudeCodeBlocks",
        false,
      );
      const showCursorRules = config.get<boolean>("showCursorRules", false);

      const library = this._promptManager.getPromptLibrary(
        showClaudeCodeBlocks,
        showCursorRules,
      );
      const activeBlocks = this._promptManager.getActiveBlocks();
      const mainInstruction = this._promptManager.getMainInstruction();
      const groupLibrary = this._promptManager.getGroupLibrary();
      const fileMap = this._promptManager.getFileMap();
      const collidedNames = this._promptManager.getCollidedNames();

      const suggestions = this._promptManager.getSuggestions();
      const proposedEdits = this._promptManager.getPendingProposedEdits();

      this.view.webview.postMessage({
        type: "initialData",
        hasCreatedLibraryFolder: this._promptManager.hasCreatedLibraryFolder(),
        isUserInitializedLibrary:
          this._promptManager.isUserInitializedLibrary(),
        library: library,
        activeBlocks: activeBlocks,
        mainInstruction: mainInstruction,
        groupLibrary: groupLibrary,
        appName: vscode.env.appName,
        fileMap: fileMap,
        collidedNames: collidedNames,
        suggestions: suggestions,
        proposedEdits: proposedEdits,
      });

      this.sendHistoryUpdate();
      this.sendPromptBlocksSettings();
    }
  }

  private sendHistoryUpdate() {
    if (this.view) {
      const history = this._promptManager.getHistoryList();
      this.view.webview.postMessage({
        type: "updateHistory",
        history: history.map((item) => {
          try {
            const data = JSON.parse(
              this._fs.readFileSync(item.filepath, "utf8").toString(),
            );
            return {
              filepath: item.filepath,
              filename: item.filename,
              timestamp: item.timestamp,
              preview: data.mainInstruction?.slice(0, 50) || "(Empty)",
            };
          } catch {
            return {
              filepath: item.filepath,
              filename: item.filename,
              timestamp: item.timestamp,
              preview: "(Failed to load)",
            };
          }
        }),
      });
    }
  }

  private sendPromptBlocksSettings() {
    if (this.view) {
      const config = vscode.workspace.getConfiguration("promptForge");
      const showClaudeCodeBlocks = config.get<boolean>(
        "showClaudeCodeBlocks",
        false,
      );
      const showCursorRules = config.get<boolean>("showCursorRules", false);
      this.view.webview.postMessage({
        type: "updatePromptBlocksSettings",
        settings: {
          promptFolder: this._promptManager.getPromptBuilderDir(),
          showClaudeCodeBlocks,
          showCursorRules,
        },
      });
    }
  }

  private async toggleClaudeCodeBlocks() {
    const config = vscode.workspace.getConfiguration("promptForge");
    const current = config.get<boolean>("showClaudeCodeBlocks", false);
    await config.update(
      "showClaudeCodeBlocks",
      !current,
      vscode.ConfigurationTarget.Global,
    );
  }

  private async toggleCursorRules() {
    const config = vscode.workspace.getConfiguration("promptForge");
    const current = config.get<boolean>("showCursorRules", false);
    console.log(`Toggling showCursorRules from ${current} to ${!current}`);
    await config.update(
      "showCursorRules",
      !current,
      vscode.ConfigurationTarget.Global,
    );
  }

  private refreshView() {
    if (this.view) {
      this.view.webview.html = this._getHtmlForWebview(this.view.webview);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.bundle.js"),
    );

    // Construct the path to the HTML file in dist/resources
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "dist",
      "resources",
      "webview.html",
    );

    let htmlTemplate = "";
    try {
      htmlTemplate = this._fs.readFileSync(htmlPath, "utf8").toString();
    } catch (e) {
      console.error(`Failed to read webview.html from ${htmlPath}`, e);
      // Fallback for development if not yet built to dist
      const devHtmlPath = path.join(
        this._extensionUri.fsPath,
        "resources",
        "webview.html",
      );
      try {
        htmlTemplate = this._fs.readFileSync(devHtmlPath, "utf8").toString();
      } catch (devError) {
        throw new Error(`Failed to load webview template from ${htmlPath}`);
      }
    }

    // Generate a nonce for CSP
    const nonce = this._getNonce();

    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "dist",
        "codicons",
        "codicon.css",
      ),
    );

    // Inject CSP and local assets
    return htmlTemplate
      .replace(/<script/g, `<script nonce="${nonce}"`)
      .replace("{{{WEBVIEW_BUNDLE_URI}}}", scriptUri.toString())
      .replace(
        "<head>",
        `<head>
        <meta http-equiv="Content-Security-Policy" content="
          default-src 'none';
          img-src ${webview.cspSource};
          font-src ${webview.cspSource};
          style-src ${webview.cspSource} 'unsafe-inline';
          script-src 'nonce-${nonce}';
          connect-src ${webview.cspSource};
        ">
        <link href="${codiconsUri}" rel="stylesheet" />`,
      );
  }
  private async _addWorkingTreeDiff(
    staged: boolean,
    unstaged: boolean,
    summaryOnly: boolean,
  ) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;
    const rootPath = workspaceFolders[0].uri.fsPath;

    if (!staged && !unstaged) {
      vscode.window.showInformationMessage(
        "Please select at least one of Staged or Unstaged.",
      );
      return;
    }

    const execFilePromise = promisify(execFile);
    try {
      let combinedDiff = "";

      if (staged) {
        const args = ["diff", "--cached"];
        if (summaryOnly) args.push("--name-only");
        args.push("--");
        const { stdout } = await execFilePromise("git", args, {
          cwd: rootPath,
        });
        combinedDiff += stdout;
      }

      if (unstaged) {
        // 1. Get tracked unstaged changes
        const args = ["diff"];
        if (summaryOnly) args.push("--name-only");
        args.push("--");
        const { stdout: trackedStdout } = await execFilePromise("git", args, {
          cwd: rootPath,
        });
        combinedDiff +=
          (combinedDiff && trackedStdout ? "\n" : "") + trackedStdout;

        // 2. Get untracked files
        try {
          const { stdout: untrackedStdout } = await execFilePromise(
            "git",
            ["ls-files", "--others", "--exclude-standard"],
            { cwd: rootPath },
          );

          if (untrackedStdout.trim()) {
            const untrackedFiles = untrackedStdout.trim().split("\n");
            if (summaryOnly) {
              combinedDiff +=
                (combinedDiff ? "\n" : "") + untrackedFiles.join("\n");
            } else {
              for (const file of untrackedFiles) {
                try {
                  // git diff --no-index returns 1 if there's a diff (which there is for a new file)
                  await execFilePromise(
                    "git",
                    ["diff", "--no-index", "/dev/null", "--", file],
                    {
                      cwd: rootPath,
                    },
                  );
                } catch (e: any) {
                  if (e.stdout) {
                    combinedDiff += (combinedDiff ? "\n" : "") + e.stdout;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to fetch untracked files", e);
        }
      }

      const diff = combinedDiff.trim();
      const title = `Git Diff (${staged ? "Staged" : ""}${staged && unstaged ? " + " : ""}${unstaged ? "Unstaged" : ""}${summaryOnly ? " Summary" : ""})`;

      this._promptManager.addSpecialBlock(
        title,
        diff || "No changes detected.",
      );
      this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Git diff failed: ${error.stderr || error.message}`,
      );
    }
  }

  private async _addGitDiffToPrompt() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showInformationMessage("No workspace folder open.");
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    execFile(
      "git",
      ["diff", "--", "HEAD"],
      { cwd: rootPath },
      (error, stdout, stderr) => {
        if (error) {
          vscode.window.showErrorMessage(
            `Git diff failed: ${stderr || error.message}`,
          );
          return;
        }

        const diff = stdout.trim();
        if (!diff) {
          vscode.window.showInformationMessage(
            "No changes detected in the workspace.",
          );
          this._promptManager.addSpecialBlock(
            "Git Diff",
            "No changes detected (Clean working tree).",
          );
        } else {
          this._promptManager.addSpecialBlock("Git Diff", diff);
        }
        this.refresh();
      },
    );
  }
  private async _getGitBranches(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return [];
    const rootPath = workspaceFolders[0].uri.fsPath;

    return new Promise((resolve) => {
      execFile(
        "git",
        ["branch", "--format=%(refname:short)"],
        { cwd: rootPath },
        (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const branches = stdout
            .split("\n")
            .map((b: string) => b.trim())
            .filter((b: string) => b);
          resolve(branches);
        },
      );
    });
  }

  private async _addGitDiffRefToPromptWithRef(
    ref: string,
    summaryOnly: boolean,
  ) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showInformationMessage("No workspace folder open.");
      return;
    }

    const branches = await this._getGitBranches();
    const isBranch = branches.includes(ref);
    const isCommit = isValidCommitHash(ref);
    const isHead = ref === "HEAD";

    if (!ref || (!isBranch && !isCommit && !isHead)) {
      vscode.window.showErrorMessage(
        `Invalid or non-existent git reference: ${ref}`,
      );
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const execFilePromise = promisify(execFile);

    try {
      let combinedDiff = "";
      let untrackedPart = "";

      // 1. Get untracked files (common to both modes)
      try {
        const { stdout: untrackedStdout } = await execFilePromise(
          "git",
          ["ls-files", "--others", "--exclude-standard"],
          { cwd: rootPath },
        );
        if (untrackedStdout.trim()) {
          if (summaryOnly) {
            untrackedPart = untrackedStdout.trim().split("\n").join(", ");
          } else {
            const untrackedFiles = untrackedStdout.trim().split("\n");
            for (const file of untrackedFiles) {
              try {
                await execFilePromise(
                  "git",
                  ["diff", "--no-index", "/dev/null", file],
                  {
                    cwd: rootPath,
                  },
                );
              } catch (e: any) {
                if (e.stdout) {
                  untrackedPart += (untrackedPart ? "\n" : "") + e.stdout;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch untracked files", e);
      }

      if (summaryOnly) {
        const { stdout: logStdout } = await execFilePromise(
          "git",
          [
            "log",
            "-n",
            "1",
            "--format=Commit %H %ad %s",
            "--date=short",
            ref,
            "--",
          ],
          { cwd: rootPath },
        );
        const { stdout: diffStdout } = await execFilePromise(
          "git",
          ["diff", ref, "--name-only", "--"],
          { cwd: rootPath },
        );

        const stdout = logStdout + "\n" + diffStdout;
        const lines = stdout.split("\n");
        let formatted = "Summary of changes:\n";

        let logPart = [];
        let filePart = [];

        for (const line of lines) {
          if (line.startsWith("Commit ")) {
            logPart.push(line);
          } else if (line.trim().length > 0) {
            filePart.push(line.trim());
          }
        }

        if (untrackedPart) {
          filePart.push(...untrackedPart.split(", "));
        }

        formatted +=
          logPart.join("\n") + "\n\nFiles changed:\n" + filePart.join(", ");

        this._promptManager.addSpecialBlock(`Diff Summary (${ref})`, formatted);
      } else {
        // Full diff logic
        const { stdout } = await execFilePromise("git", ["diff", ref, "--"], {
          cwd: rootPath,
          maxBuffer: 1024 * 1024 * 10,
        });

        combinedDiff = stdout.trim();
        if (untrackedPart) {
          combinedDiff += (combinedDiff ? "\n" : "") + untrackedPart;
        }

        if (!combinedDiff) {
          vscode.window.showInformationMessage(
            `No differences found compared to '${ref}'.`,
          );
          this._promptManager.addSpecialBlock(
            `Diff (${ref})`,
            `No differences found compared to ${ref}.`,
          );
        } else {
          const wordCount = combinedDiff.split(/\s+/).length;
          if (wordCount > 3000) {
            const proceed = await vscode.window.showWarningMessage(
              `The diff compared to '${ref}' is very large (${wordCount} words). This may consume a lot of token context. Do you still want to include it?`,
              { modal: true },
              "Yes, include it",
            );
            if (proceed !== "Yes, include it") {
              return;
            }
          }
          this._promptManager.addSpecialBlock(`Diff (${ref})`, combinedDiff);
        }
      }
      this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Git operation failed for '${ref}': ${error.stderr || error.message}`,
      );
    }
  }

  private async _addGitCommitDiffToPrompt(hash: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    execFile(
      "git",
      ["show", hash, "--"],
      { cwd: rootPath, maxBuffer: 1024 * 1024 * 10 },
      async (error, stdout, stderr) => {
        if (error) {
          vscode.window.showErrorMessage(
            `Git show failed for '${hash}': ${stderr || error.message}`,
          );
          return;
        }
        this._promptManager.addSpecialBlock(`Commit ${hash}`, stdout.trim());
        this.refresh();
      },
    );
  }
  private _getNonce() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
