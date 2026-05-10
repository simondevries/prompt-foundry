import * as fs from "fs";
import * as path from "path";
import { CLAUDE_DIR, CURSOR_DIR } from "./constants";

/**
 * A secure wrapper around Node.js 'fs' that enforces sandbox boundaries.
 * All paths are validated against allowed roots before any operation is performed.
 */
export enum FsPermission {
  Read = "read",
  ReadWrite = "read-write",
}

interface SandboxRoot {
  path: string;
  permission: FsPermission;
}

export class SecureFileSystem {
  private _roots: SandboxRoot[] = [];
  private _extensionDir: string | undefined;

  constructor(promptBuilderDir: string, extensionDir?: string) {
    this._extensionDir = extensionDir;
    this.updateRoots(promptBuilderDir);
  }

  public updateRoots(promptBuilderDir: string) {
    this._roots = [
      { path: path.resolve(promptBuilderDir), permission: FsPermission.ReadWrite }
    ];

    if (this._extensionDir) {
      this._roots.push({ path: path.resolve(this._extensionDir), permission: FsPermission.Read });
    }
  }

  public trustPath(filePath: string, permission: FsPermission = FsPermission.Read): void {
    const resolved = path.resolve(filePath);
    if (!this._roots.find(r => r.path === resolved)) {
      this._roots.push({ path: resolved, permission });
    }
  }

  public untrustPath(filePath: string): void {
    const resolved = path.resolve(filePath);
    this._roots = this._roots.filter(r => r.path !== resolved);
  }

  private validatePath(filePath: string, requiredPermission: FsPermission = FsPermission.Read): string {
    const absolutePath = path.resolve(filePath);
    
    const rootMatch = this._roots.find(root => {
      const relative = path.relative(root.path, absolutePath);
      return (relative === "" || !relative.startsWith("..")) && !path.isAbsolute(relative);
    });

    if (!rootMatch) {
      throw new Error(`Operation failed. Check you've setup the prompt library folder.`);
    }

    if (requiredPermission === FsPermission.ReadWrite && rootMatch.permission !== FsPermission.ReadWrite) {
      throw new Error(`Operation failed. Check you've setup the prompt library folder.`);
    }

    return absolutePath;
  }

  // --- Read Operations ---
  public readFileSync(filePath: string, options?: fs.ObjectEncodingOptions | BufferEncoding): string | Buffer {
    const safePath = this.validatePath(filePath, FsPermission.Read);
    return fs.readFileSync(safePath, options);
  }

  public existsSync(filePath: string): boolean {
    try {
      this.validatePath(filePath, FsPermission.Read);
      return fs.existsSync(path.resolve(filePath));
    } catch {
      return false;
    }
  }

  public readdirSync(filePath: string, options?: { withFileTypes?: boolean }): any[] {
    const safePath = this.validatePath(filePath, FsPermission.Read);
    return fs.readdirSync(safePath, options as any);
  }

  public statSync(filePath: string): fs.Stats {
    const safePath = this.validatePath(filePath, FsPermission.Read);
    return fs.statSync(safePath);
  }

  // --- Write Operations ---
  public writeFileSync(filePath: string, data: string | Uint8Array, options?: fs.WriteFileOptions): void {
    const safePath = this.validatePath(filePath, FsPermission.ReadWrite);
    const parentDir = path.dirname(safePath);
    this.validatePath(parentDir, FsPermission.ReadWrite);
    
    fs.writeFileSync(safePath, data, options);
  }

  public mkdirSync(filePath: string, options?: fs.MakeDirectoryOptions & { recursive: true }): string | undefined {
    const safePath = this.validatePath(filePath, FsPermission.ReadWrite);
    return fs.mkdirSync(safePath, options);
  }

  public renameSync(oldPath: string, newPath: string): void {
    const safeOld = this.validatePath(oldPath, FsPermission.ReadWrite);
    const safeNew = this.validatePath(newPath, FsPermission.ReadWrite);
    fs.renameSync(safeOld, safeNew);
  }

  public copyFileSync(src: string, dest: string): void {
    const safeSrc = this.validatePath(src, FsPermission.Read);
    const safeDest = this.validatePath(dest, FsPermission.ReadWrite);
    fs.copyFileSync(safeSrc, safeDest);
  }

  public unlinkSync(filePath: string): void {
    const safePath = this.validatePath(filePath, FsPermission.ReadWrite);
    fs.unlinkSync(safePath);
  }

  // --- Helpers ---
  
  public resolve(...pathSegments: string[]): string {
    const resolved = path.resolve(...pathSegments);
    return this.validatePath(resolved);
  }
}
