import { SecureFileSystem } from "./fs";
import {
  getHistoryDir,
  getCurrentInstructionPromptFile,
} from "./constants";
import {
  HistoryItem,
  SessionData,
  PromptBlock,
} from "./interfaces";
import * as path from "path";

export class SessionManager {
  private _lastSessionPath: string | null = null;
  private _historyRetentionLimit: number = 50;

  constructor(
    private _promptBuilderDir: string,
    private _fs: SecureFileSystem,
  ) {}

  public setHistoryRetentionLimit(limit: number): void {
    this._historyRetentionLimit = limit;
  }

  public get lastSessionPath(): string | null {
    return this._lastSessionPath;
  }

  public saveCurrentSession(
    mainInstruction: string,
    activeBlocks: PromptBlock[],
    fileMap: Record<string, string>,
    collidedNames: Record<string, boolean>
  ): string {
    try {
      const historyDir = getHistoryDir(this._promptBuilderDir);
      if (!this._fs.existsSync(historyDir)) {
        this._fs.mkdirSync(historyDir, { recursive: true });
      }

      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const firstChars = mainInstruction
        .slice(0, 10)
        .replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `${timestamp}_${firstChars}.json`;
      const filepath = path.join(historyDir, filename);

      const sessionData: SessionData = {
        mainInstruction,
        activeBlocks: activeBlocks.map((b) => ({
          category: b.category,
          name: b.name,
          path: b.path,
          content: b.isSpecial ? b.content : undefined,
          isSpecial: b.isSpecial,
          contextFiles: b.contextFiles,
          variables: b.variables,
          isGoal: b.isGoal,
          hasGoal: b.hasGoal,
        })),
        timestamp: now.toISOString(),
        fileMap,
        collidedNames,
      };

      this._fs.writeFileSync(filepath, JSON.stringify(sessionData, null, 2), "utf8");
      this._lastSessionPath = filepath;
      this.pruneHistory();
      return filepath;
    } catch (e) {
      console.error("Failed to save session", e);
      return "";
    }
  }

  public pruneHistory(): void {
    if (this._historyRetentionLimit <= 0) {
      return;
    }

    try {
      const historyDir = getHistoryDir(this._promptBuilderDir);
      if (!this._fs.existsSync(historyDir)) {
        return;
      }

      const files = this._fs
        .readdirSync(historyDir)
        .filter((f: string) => f.endsWith(".json"))
        .map((filename: string) => {
          const filepath = path.join(historyDir, filename);
          const stats = this._fs.statSync(filepath);
          return { filepath, mtime: stats.mtime.getTime() };
        })
        .sort((a: any, b: any) => b.mtime - a.mtime);

      if (files.length > this._historyRetentionLimit) {
        const toDelete = files.slice(this._historyRetentionLimit);
        for (const file of toDelete) {
          this._fs.unlinkSync(file.filepath);
        }
        console.log(`Pruned ${toDelete.length} old history sessions`);
      }
    } catch (e) {
      console.error("Failed to prune history", e);
    }
  }

  public getHistoryList(): HistoryItem[] {
    try {
      const historyDir = getHistoryDir(this._promptBuilderDir);
      if (!this._fs.existsSync(historyDir)) {
        return [];
      }

      const files = this._fs
        .readdirSync(historyDir)
        .filter((f: string) => f.endsWith(".json"))
        .map((filename: string) => {
          const filepath = path.join(historyDir, filename);
          const stats = this._fs.statSync(filepath);
          return {
            filepath,
            filename,
            timestamp: stats.mtime.toISOString(),
          };
        })
        .sort(
          (a: any, b: any) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

      return files;
    } catch (e) {
      console.error("Failed to get history list", e);
      return [];
    }
  }

  public deleteAllHistory(): void {
    try {
      const historyDir = getHistoryDir(this._promptBuilderDir);
      if (!this._fs.existsSync(historyDir)) {
        return;
      }

      const files = this._fs
        .readdirSync(historyDir)
        .filter((f: string) => f.endsWith(".json"));
      for (const file of files) {
        const filePath = path.join(historyDir, file);
        this._fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error("Failed to delete all history", e);
    }
  }

  public saveMainInstruction(
    mainInstruction: string,
    activeBlocks: PromptBlock[],
    fileMap: Record<string, string>,
    collidedNames: Record<string, boolean>
  ) {
    const data: SessionData = {
      mainInstruction,
      activeBlocks: activeBlocks.map((b) => ({
        category: b.category,
        name: b.name,
        path: b.path,
        content: b.isSpecial ? b.content : undefined,
        isSpecial: b.isSpecial,
        contextFiles: b.contextFiles,
        variables: b.variables,
        isGoal: b.isGoal,
        hasGoal: b.hasGoal,
      })),
      timestamp: new Date().toISOString(),
      fileMap,
      collidedNames,
    };
    this._fs.writeFileSync(
      getCurrentInstructionPromptFile(this._promptBuilderDir),
      JSON.stringify(data, null, 2),
      "utf8",
    );
  }

  public setPromptBuilderDir(dir: string) {
    this._promptBuilderDir = dir;
  }
}

