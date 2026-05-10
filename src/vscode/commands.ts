import * as vscode from "vscode";
import * as path from "path";
import { PromptManager } from "../core/promptManager";

export function registerCommands(
  context: vscode.ExtensionContext,
  promptManager: PromptManager,
) {
  // Command to send a prompt to VSCode AI Chat input
  const sendPromptCommand = vscode.commands.registerCommand(
    "prompt-forge.sendToAI",
    async (prompt: string) => {
      try {
        const promptWithContext = prompt;
        const appName = vscode.env.appName.toLowerCase();
        const isCursor = appName.includes("cursor");

        if (isCursor) {
          // Cursor-specific chat command
          await vscode.commands.executeCommand("workbench.action.chat.open", {
            query: promptWithContext,
            isPartialQuery: true,
          });
        } else {
          // VS Code: Try to use the modern chat command if available
          try {
            await vscode.commands.executeCommand(
              "vscode.openWith",
              "chat",
              "vscode-chat",
              {
                isPartialQuery: true,
                query: promptWithContext,
              },
            );
          } catch (e) {
            // Fallback for VS Code without Copilot Chat
            await vscode.commands.executeCommand("workbench.action.chat.open", {
              query: promptWithContext,
              isPartialQuery: true,
            });
          }
        }

        vscode.window.showInformationMessage("Prompt sent to AI!");
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error opening chat: ${error.message}`);
      }
    },
  );

  // Command to edit a prompt (opens the file)
  const editPromptCommand = vscode.commands.registerCommand(
    "prompt-forge.editPrompt",
    async (filePath: string) => {
      if (promptManager.fs.existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `Opened: ${path.basename(filePath)}`,
        );
      } else {
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
      }
    },
  );

  context.subscriptions.push(sendPromptCommand, editPromptCommand);
}

export function setupFileWatcher(
  directoryPath: string,
  onFileChange: (filePath: string) => void,
): vscode.FileSystemWatcher {
  // Watch for .md, .json, and .yaml files
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(directoryPath, "**/*.{md,json,yaml,yml,diff}"),
  );

  const handleChange = (uri: vscode.Uri) => {
    const fsPath = uri.fsPath;
    // Ignore changes in the history directory — session saves would otherwise
    // trigger a full refresh() that re-renders the webview and resets state.
    if (
      fsPath.includes(`${path.sep}history${path.sep}`) ||
      fsPath.endsWith(`${path.sep}history`)
    ) {
      return;
    }
    console.log(`File changed: ${fsPath}`);
    onFileChange(fsPath);
  };

  watcher.onDidChange(handleChange);
  watcher.onDidCreate(handleChange);
  watcher.onDidDelete(handleChange);

  return watcher;
}

export function setupEditorListeners(
  onEditorChange: () => void,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Listen for active editor changes to update context
  disposables.push(vscode.window.onDidChangeActiveTextEditor(onEditorChange));

  // Listen for selection changes
  disposables.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === vscode.window.activeTextEditor) {
        onEditorChange();
      }
    }),
  );

  return disposables;
}
