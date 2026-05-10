import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";

export function getPromptBuilderDir(): string {
  const config = vscode.workspace.getConfiguration("promptForge");
  const customPath = config.get<string>("promptFolder");
  if (customPath) {
    if (customPath.startsWith("~")) {
      return path.join(os.homedir(), customPath.slice(2));
    }
    return customPath;
  }
  return "";
}
