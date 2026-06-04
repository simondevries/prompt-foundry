import * as vscode from "vscode";
import { MainPromptWebviewProvider } from "./webviewProvider";
import { PromptManager } from "../core/promptManager";
import { StyleManager } from "../core/styleManager";
import { SecureFileSystem, FsPermission } from "../core/fs";
import { 
  CLAUDE_DIR,
  CURSOR_DIR,
  WORKSPACE_SKILLS_DIRS,
} from "../core/constants";
import { getPromptBuilderDir } from "./utils";
import {
  registerCommands,
  setupFileWatcher,
  setupEditorListeners,
} from "./commands";
import { deployBinaries, updateTuiConfig } from "./deploy";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export async function activate(context: vscode.ExtensionContext) {

  // Deploy binaries to global storage
  const storageUri = await deployBinaries(context);

  // Fallback to extension-bundled prompts if no custom folder configured
  const config = vscode.workspace.getConfiguration("promptForge");
  const customPath = config.get<string>("promptFolder");

  let currentDirCandidate =
    customPath &&
    customPath.trim() !== ""
      ? customPath
      : "";

  // If no custom path, we need to find bundled prompts to determine currentDir
  if (currentDirCandidate === "") {
     const bundledPromptsRaw = path.join(context.extensionPath, "dist", "prompts");
     currentDirCandidate = fs.existsSync(bundledPromptsRaw)
       ? bundledPromptsRaw
       : path.join(context.extensionPath, "prompts");
  }

  if (currentDirCandidate.startsWith("~")) {
    currentDirCandidate = path.join(os.homedir(), currentDirCandidate.slice(2));
  }

  const secureFs = new SecureFileSystem(currentDirCandidate, context.extensionPath);
  const currentDir = currentDirCandidate;
  
  // Explicitly trust the prompt library directory with ReadWrite access
  secureFs.trustPath(currentDir, FsPermission.ReadWrite);
  
  // Enable system paths if configured (Read-Only)
  if (config.get<boolean>("showClaudeCodeBlocks")) {
    secureFs.trustPath(CLAUDE_DIR, FsPermission.Read);
  }
  if (config.get<boolean>("showCursorRules")) {
    secureFs.trustPath(CURSOR_DIR, FsPermission.Read);
  }

  const ensureDirectoryExists = () => {
    const dir = getPromptBuilderDir();
    if (dir && !secureFs.existsSync(dir)) {
      secureFs.mkdirSync(dir, { recursive: true });
    }
  };

  const styleManager = new StyleManager(currentDir, secureFs);
  const promptManager = new PromptManager(
    currentDir,
    styleManager,
    secureFs,
    context.extensionPath,
    false, // Disable native watcher in VS Code; use vscode.FileSystemWatcher instead
  );
  
  const workspaceRoot = vscode.workspace.workspaceFolders
  ? vscode.workspace.workspaceFolders[0].uri.fsPath
  : undefined;

  const trustWorkspaceSkills = (shouldTrust: boolean) => {
      if (!workspaceRoot) return;
      for (const dirName of WORKSPACE_SKILLS_DIRS) {
          const skillsDir = path.join(workspaceRoot, dirName);
          if (shouldTrust) {
            secureFs.trustPath(skillsDir, FsPermission.Read);
          } else {
            secureFs.untrustPath(skillsDir);
          }
      }
  };

  if (config.get<boolean>("showWorkspaceSkills") && workspaceRoot) {
    trustWorkspaceSkills(true);
    promptManager.setWorkspaceSkillsDir(workspaceRoot);
  }

  // Initialize custom folders
  const customFoldersRaw = config.get<string[]>("customFolders", []);
  const customFolders = customFoldersRaw.map((p) => {
    if (p.startsWith("~")) {
      return path.join(os.homedir(), p.slice(2));
    }
    return p;
  });
  promptManager.setCustomFolders(customFolders);

  const customWorkspaceFolders = config.get<string[]>("customWorkspaceFolders", []);
  promptManager.setCustomWorkspaceFolders(customWorkspaceFolders);

  const webviewProvider = new MainPromptWebviewProvider(
    context.extensionUri,
    promptManager,
    context.globalStorageUri,
  );

  // Register commands
  registerCommands(context, promptManager);

  // Register webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "prompt-forge.mainPrompt",
      webviewProvider,
    ),
  );

  let fileWatcher: vscode.FileSystemWatcher | undefined;

  const initFileWatcher = () => {
    if (fileWatcher) {
      fileWatcher.dispose();
    }
    fileWatcher = setupFileWatcher(getPromptBuilderDir(), () => {
      webviewProvider.refresh();
    });

    context.subscriptions.push(fileWatcher);
  };

  initFileWatcher();

  // Setup editor listeners
  context.subscriptions.push(
    ...setupEditorListeners(() => {
      webviewProvider.sendSelectionUpdate();
    }),
  );

  // Handle configuration changes
  const updateSettings = () => {
    const config = vscode.workspace.getConfiguration("promptForge");
    const limit = config.get<number>("historyRetentionLimit", 50);
    promptManager.setHistoryRetentionLimit(limit);
  };
  updateSettings();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      updateTuiConfig(context);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Update TUI config if any promptForge settings changed
      if (e.affectsConfiguration("promptForge")) {
        updateTuiConfig(context);
      }

      if (e.affectsConfiguration("promptForge.showClaudeCodeBlocks")) {
        const config = vscode.workspace.getConfiguration("promptForge");
        if (config.get<boolean>("showClaudeCodeBlocks")) {
          secureFs.trustPath(CLAUDE_DIR, FsPermission.Read);
        } else {
          secureFs.untrustPath(CLAUDE_DIR);
        }
        webviewProvider.refresh();
      }

      if (e.affectsConfiguration("promptForge.showCursorRules")) {
        const config = vscode.workspace.getConfiguration("promptForge");
        if (config.get<boolean>("showCursorRules")) {
          secureFs.trustPath(CURSOR_DIR, FsPermission.Read);
        } else {
          secureFs.untrustPath(CURSOR_DIR);
        }
        webviewProvider.refresh();
      }

      if (e.affectsConfiguration("promptForge.showWorkspaceSkills")) {
        const config = vscode.workspace.getConfiguration("promptForge");
        if (config.get<boolean>("showWorkspaceSkills") && workspaceRoot) {
          trustWorkspaceSkills(true);
          promptManager.setWorkspaceSkillsDir(workspaceRoot);
        } else if (workspaceRoot) {
          trustWorkspaceSkills(false);
          promptManager.setWorkspaceSkillsDir(undefined);
        }
        webviewProvider.refresh();
      }

      if (e.affectsConfiguration("promptForge.customFolders") || e.affectsConfiguration("promptForge.customWorkspaceFolders")) {
        const config = vscode.workspace.getConfiguration("promptForge");
        
        const customFoldersRaw = config.get<string[]>("customFolders", []);
        const customFolders = customFoldersRaw.map((p) => {
          if (p.startsWith("~")) {
            return path.join(os.homedir(), p.slice(2));
          }
          return p;
        });
        promptManager.setCustomFolders(customFolders);

        const customWorkspaceFolders = config.get<string[]>("customWorkspaceFolders", []);
        promptManager.setCustomWorkspaceFolders(customWorkspaceFolders);

        webviewProvider.refresh();
      }

      if (e.affectsConfiguration("promptForge.promptFolder")) {
        const config = vscode.workspace.getConfiguration("promptForge");
        const customPath = config.get<string>("promptFolder");
        
        const bundledPrompts = secureFs.existsSync(
          path.join(context.extensionPath, "dist", "prompts"),
        )
          ? path.join(context.extensionPath, "dist", "prompts")
          : path.join(context.extensionPath, "prompts");

        let newDir =
          customPath && customPath.trim() !== ""
            ? customPath
            : bundledPrompts;
        if (newDir.startsWith("~")) {
          newDir = path.join(os.homedir(), newDir.slice(2));
        }

        secureFs.updateRoots(newDir);

        // Re-trust system paths after updating roots
        if (config.get<boolean>("showClaudeCodeBlocks")) {
          secureFs.trustPath(CLAUDE_DIR, FsPermission.Read);
        }
        if (config.get<boolean>("showCursorRules")) {
          secureFs.trustPath(CURSOR_DIR, FsPermission.Read);
        }

        ensureDirectoryExists();
        initFileWatcher();

        styleManager.setPromptBuilderDir(newDir);
        promptManager.setPromptBuilderDir(newDir);
        webviewProvider.refresh();
      }
      if (e.affectsConfiguration("promptForge.historyRetentionLimit")) {
        updateSettings();
      }
    }),
  );

}

export function deactivate() {}
