import * as fs from "fs";
import * as path from "path";
import { SecureFileSystem, FsPermission } from "./fs";
import {
  getCurrentInstructionPromptFile,
  getStylesFile,
  CLAUDE_DIR,
  CURSOR_DIR,
  BUNDLED_CATEGORIES,
  WORKSPACE_SKILLS_DIRS,
} from "./constants";
import { StyleManager } from "./styleManager";
import {
  PromptBlock,
  Group,
  PromptLibraryCategory,
  HistoryItem,
  SessionData,
} from "./interfaces";
import { AssociationManager } from "./associationManager";
import { LibraryManager } from "./libraryManager";
import { PromptCompiler } from "./promptCompiler";
import { SessionManager } from "./sessionManager";
import { createPatch } from "diff";

export class PromptManager {
  private _workspaceSkillsDir?: string;

  public setWorkspaceSkillsDir(dir: string | undefined) {
    this._workspaceSkillsDir = dir;
  }

  public getWorkspaceSkillsDir(): string | undefined {
    return this._workspaceSkillsDir;
  }

  public setCustomFolders(folders: string[]) {
    this._customFolders = folders;
    for (const folder of folders) {
      this._fs.trustPath(folder, FsPermission.Read);
    }
    this.reload();
  }

  public setCustomWorkspaceFolders(folders: { name: string; path: string }[]) {
    this._customWorkspaceFolders = folders;
    for (const folder of folders) {
      this._fs.trustPath(folder.path, FsPermission.Read);
    }
    this.reload();
  }

  private _mainInstruction: string = "";
  private _mainFileMap: Record<string, string> = {};
  private _mainCollidedNames: Record<string, boolean> = {};
  private _activeBlocks: PromptBlock[] = [];
  private _customFolders: string[] = [];
  private _customWorkspaceFolders: { name: string; path: string }[] = [];
  private _associationManager: AssociationManager;
  private _libraryManager: LibraryManager;
  private _compiler: PromptCompiler;
  private _sessionManager: SessionManager;
  private _fs: SecureFileSystem;

  public get mainInstruction(): string {
    return this._mainInstruction;
  }

  public setHistoryRetentionLimit(limit: number): void {
    this._sessionManager.setHistoryRetentionLimit(limit);
  }

  public getPromptBuilderDir(): string {
    return this._promptBuilderDir;
  }

  public get fs(): SecureFileSystem {
    return this._fs;
  }

  constructor(
    private _promptBuilderDir: string,
    private _styleManager: StyleManager,
    _fs: SecureFileSystem,
    private _extensionDir?: string,
    private _enableNativeWatcher: boolean = true,
  ) {
    this._fs = _fs;
    this._associationManager = new AssociationManager(this._promptBuilderDir, this._fs);
    this._libraryManager = new LibraryManager(
      this._promptBuilderDir,
      this._styleManager,
      this._fs,
      this._extensionDir,
    );
    this._compiler = new PromptCompiler(this._fs);
    this._sessionManager = new SessionManager(this._promptBuilderDir, this._fs);

    this.loadMainInstruction();
    this.reload();
    if (this._enableNativeWatcher) {
      this.setupNativeWatcher();
    }
  }

  private setupNativeWatcher() {
    if (!this._fs.existsSync(this._promptBuilderDir)) {
      return;
    }

    try {
      fs.watch(
        this._promptBuilderDir,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) {
            return;
          }

          if (filename.includes("history/") || filename.startsWith("history")) {
            return;
          }

          if (
            filename.endsWith(".md") ||
            filename.endsWith(".json") ||
            filename.endsWith(".yaml") ||
            filename.endsWith(".yml")
          ) {
            console.log(`Native watcher detected changes in: ${filename}`);

            if (filename.endsWith("current_instruction_prompt.json")) {
              this.loadMainInstruction();
            }

            this._styleManager.reload();
            this.reloadLibraryOnly();
          }
        },
      );
    } catch (e) {
      console.error(
        `Failed to start native watcher for ${this._promptBuilderDir}:`,
        e,
      );
    }
  }

  public get promptBuilderDir(): string {
    return this._promptBuilderDir;
  }

  public hasCreatedLibraryFolder(): boolean {
    return this._fs.existsSync(this._promptBuilderDir);
  }

  public canModifyCategory(category?: string): boolean {
    if (!category) return false;
    if (BUNDLED_CATEGORIES.includes(category)) {
      return false;
    }
    if (category === "Skills (workspace)" || category === "Special" || category === "Tools") {
      return false;
    }

    const categoryPath = this._libraryManager.getCategoryPath(category);
    if (!this._isInside(this._promptBuilderDir, categoryPath)) {
      return false;
    }

    // If it's not a bundled category, it requires an initialized user library
    return this.isUserInitializedLibrary();
  }

  public isUserInitializedLibrary(): boolean {
    if (!this._extensionDir) return true;
    
    const resolvedPath = path.resolve(this._promptBuilderDir);
    const resolvedExtensionPath = path.resolve(this._extensionDir);
    
    // If we are currently pointing inside the extension directory, it's NOT a user initialized library.
    // Everything else is considered an initialized user library.
    return !resolvedPath.startsWith(resolvedExtensionPath);
  }

  public initializePromptFolder(targetDir: string, sampleDir: string): void {
    if (!this._fs.existsSync(targetDir)) {
      this._fs.mkdirSync(targetDir, { recursive: true });
    }

    const copyRecursiveSync = (src: string, dest: string) => {
      // Security: src (sampleDir) might be outside sandbox, dest must be inside.
      const stats = fs.existsSync(src) ? fs.statSync(src) : null;
      if (stats && stats.isDirectory()) {
        if (!this._fs.existsSync(dest)) {
          this._fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach((childItemName) => {
          copyRecursiveSync(
            path.join(src, childItemName),
            path.join(dest, childItemName),
          );
        });
      } else {
        const safeDest = this._fs.resolve(dest);
        fs.copyFileSync(src, safeDest);
      }
    };

    if (fs.existsSync(sampleDir)) {
      const items = fs.readdirSync(sampleDir);
      for (const item of items) {
        copyRecursiveSync(
          path.join(sampleDir, item),
          path.join(targetDir, item),
        );
      }
    }

    const currentPromptFile = getCurrentInstructionPromptFile(targetDir);
    const systemDir = path.dirname(currentPromptFile);
    if (!this._fs.existsSync(systemDir)) {
      this._fs.mkdirSync(systemDir, { recursive: true });
    }

    const oldStylesFile = path.join(targetDir, "styles.json");
    const newStylesFile = getStylesFile(targetDir);
    if (this._fs.existsSync(oldStylesFile) && !this._fs.existsSync(newStylesFile)) {
      this._fs.renameSync(oldStylesFile, newStylesFile);
    }

    if (!this._fs.existsSync(currentPromptFile)) {
      const initialData: SessionData = {
        mainInstruction:
          "# My First Prompt\n\nWelcome to Prompt Foundry! Select blocks below to build your prompt.",
        activeBlocks: [],
        timestamp: new Date().toISOString(),
        fileMap: {},
        collidedNames: {},
      };
      this._fs.writeFileSync(
        currentPromptFile,
        JSON.stringify(initialData, null, 2),
        "utf8",
      );
    }

    this.setPromptBuilderDir(targetDir);
    if (this._enableNativeWatcher) {
      this.setupNativeWatcher();
    }
  }

  public setPromptBuilderDir(dir: string) {
    this._promptBuilderDir = dir;
    this._fs.updateRoots(dir);
    
    // Re-trust custom folders after updating roots
    for (const folder of this._customFolders) {
      this._fs.trustPath(folder, FsPermission.Read);
    }
    for (const folder of this._customWorkspaceFolders) {
      this._fs.trustPath(folder.path, FsPermission.Read);
    }

    this._associationManager.setPromptBuilderDir(dir);
    this._libraryManager.setPromptBuilderDir(dir);
    this._sessionManager.setPromptBuilderDir(dir);
    this.reload();
  }

  private _isInside(parent: string, child: string): boolean {
    const parentResolved = path.resolve(parent);
    const childResolved = path.resolve(child);
    const relative = path.relative(parentResolved, childResolved);
    return (
      (relative === "" || !relative.startsWith("..")) &&
      !path.isAbsolute(relative)
    );
  }

  public isPathSafe(filePath: string): boolean {
    return this._fs.existsSync(filePath);
  }

  public proposeBlock(
    category: string,
    name: string,
    content: string,
  ): { id: string; oldContent: string; newContent: string; diffFile: string } {
    const folderPath = this._libraryManager.getCategoryPath(category);

    const parsedName = path.parse(name);
    let fileName = name;
    if (
      !parsedName.ext ||
      ![".md", ".mdc", ".cursorrules"].includes(parsedName.ext)
    ) {
      const defaultExt = category === "Cursor" ? ".mdc" : ".md";
      fileName = parsedName.dir ? path.join(parsedName.dir, `${parsedName.name}${defaultExt}`) : `${parsedName.name}${defaultExt}`;
    }
    const targetFile = path.join(folderPath, fileName);
    
    // Security: Validated internally by this._fs.readFileSync
    const oldContent = this._fs.existsSync(targetFile)
      ? this._fs.readFileSync(targetFile, "utf8").toString()
      : "";

    const proposedDir = path.join(this._promptBuilderDir, "_proposed_edits");
    if (!this._fs.existsSync(proposedDir)) {
      this._fs.mkdirSync(proposedDir, { recursive: true });
    }

    const id = Date.now().toString();
    const tempFile = path.join(proposedDir, `${id}.md`);
    this._fs.writeFileSync(tempFile, content, "utf8");

    const diffContent = createPatch(
      fileName,
      oldContent,
      content,
      "current version",
      "proposed version"
    );
    const diffFile = path.join(proposedDir, `${id}.diff`);
    this._fs.writeFileSync(diffFile, diffContent, "utf8");

    const metaFile = path.join(proposedDir, `${id}.json`);
    const metadata = {
      id,
      category,
      name: fileName,
      targetFile,
      tempFile,
      diffFile,
      timestamp: new Date().toISOString(),
    };
    this._fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), "utf8");

    return { id, oldContent, newContent: content, diffFile };
  }

  public commitBlock(id: string): void {
    const proposedDir = path.join(this._promptBuilderDir, "_proposed_edits");
    const metaFile = path.join(proposedDir, `${id}.json`);

    // Security: Validate the ID is a simple timestamp/string and metaFile is inside proposedDir
    if (!this._isInside(proposedDir, metaFile) || !/^\d+$/.test(id)) {
      throw new Error("Invalid proposed edit ID.");
    }

    if (!this._fs.existsSync(metaFile)) {
      throw new Error(`Proposed edit ${id} not found.`);
    }

    const metadataStr = this._fs.readFileSync(metaFile, "utf8").toString();
    const metadata = JSON.parse(metadataStr);

    if (!this._fs.existsSync(metadata.tempFile)) {
      throw new Error("Temporary proposed file is missing!");
    }

    // copyFileSync is now secure
    this._fs.copyFileSync(metadata.tempFile, metadata.targetFile);

    this._fs.unlinkSync(metadata.tempFile);
    if (metadata.diffFile && this._fs.existsSync(metadata.diffFile)) {
      this._fs.unlinkSync(metadata.diffFile);
    }
    this._fs.unlinkSync(metaFile);
  }

  public rejectBlock(id: string): void {
    const proposedDir = path.join(this._promptBuilderDir, "_proposed_edits");
    const metaFile = path.join(proposedDir, `${id}.json`);

    if (!this._isInside(proposedDir, metaFile) || !/^\d+$/.test(id)) {
      throw new Error("Invalid proposed edit ID.");
    }

    if (!this._fs.existsSync(metaFile)) {
      throw new Error(`Proposed edit ${id} not found.`);
    }

    const metadataStr = this._fs.readFileSync(metaFile, "utf8").toString();
    const metadata = JSON.parse(metadataStr);

    if (this._fs.existsSync(metadata.tempFile)) {
      this._fs.unlinkSync(metadata.tempFile);
    }
    if (metadata.diffFile && this._fs.existsSync(metadata.diffFile)) {
      this._fs.unlinkSync(metadata.diffFile);
    }
    this._fs.unlinkSync(metaFile);
  }

  public getPendingProposedEdits(): any[] {
    const proposedDir = path.join(this._promptBuilderDir, "_proposed_edits");
    if (!this._fs.existsSync(proposedDir)) return [];

    const files = this._fs.readdirSync(proposedDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const edits = [];
    for (const f of jsonFiles) {
      try {
        const metaPath = path.join(proposedDir, f);
        const metadataStr = this._fs.readFileSync(metaPath, "utf8").toString();
        const metadata = JSON.parse(metadataStr);
        edits.push(metadata);
      } catch (e) {
        console.error(`Failed to read proposed edit metadata: ${f}`, e);
      }
    }
    
    // Sort descending by id (timestamp)
    edits.sort((a, b) => Number(b.id) - Number(a.id));
    return edits;
  }

  public createPromptBlock(
    category: string,
    name: string,
    content: string = "",
  ): string {
    let fileName = name;
    if (!fileName.toLowerCase().endsWith(".md")) {
      fileName += ".md";
    }

    const catDir = path.join(this._promptBuilderDir, category);
    const filePath = path.join(catDir, fileName);

    // Validation is now internal to writeFileSync and mkdirSync
    if (!this._fs.existsSync(catDir)) {
      this._fs.mkdirSync(catDir, { recursive: true });
    }

    if (this._fs.existsSync(filePath)) {
      throw new Error(
        `Prompt block "${fileName}" already exists in "${category}"`,
      );
    }

    this._fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  }

  public appendPromptBlock(
    category: string,
    name: string,
    contentToAppend: string,
  ): void {
    const folderPath = this._libraryManager.getCategoryPath(category);

    let fileName = name;
    if (!fileName.toLowerCase().endsWith(".md")) {
      fileName += ".md";
    }
    const targetFile = path.join(folderPath, fileName);

    if (!this._fs.existsSync(targetFile)) {
      throw new Error(
        `Prompt block "${fileName}" does not exist in "${category}". Use create_prompt_block first.`,
      );
    }

    const currentContent = this._fs.readFileSync(targetFile, "utf8").toString();
    const newContent = currentContent.endsWith("\n")
      ? currentContent + contentToAppend
      : currentContent + "\n" + contentToAppend;
    this._fs.writeFileSync(targetFile, newContent, "utf8");

    // Refresh active blocks if this block is active
    const activeBlock = this._activeBlocks.find((b) => b.path === targetFile);
    if (activeBlock) {
      activeBlock.content = newContent;
    }
  }

  public getPromptBlockContent(category: string, fileName: string): string {
    // Virtual categories don't have files on disk
    if (category === "Claude Skills" || category === "Skills (workspace)") {
        const skillName = fileName.replace(/\.md$/, "");
        return `You must use the ${skillName} skill.`;
    }

    if (category === "Tools") {
      return "(System Tool)";
    }

    let filePath: string;

    if (category === "Special" && fileName === "config.md") {
      filePath = path.join(this._promptBuilderDir, fileName);
    } else {
      filePath = path.join(
        this._libraryManager.getCategoryPath(category),
        fileName,
      );
    }

    try {
      if (this._fs.existsSync(filePath)) {
        return this._fs.readFileSync(filePath, "utf8").toString();
      } else if (category === "Skills (workspace)" && this._workspaceSkillsDir) {
          // Fallback resolution for aggregated workspace skills
          for (const dirName of WORKSPACE_SKILLS_DIRS) {
              const altPath = path.join(this._workspaceSkillsDir, dirName, fileName);
              if (this._fs.existsSync(altPath)) {
                  return this._fs.readFileSync(altPath, "utf8").toString();
              }
          }
      }
    } catch (e) {
      console.error(`Failed to read block content: ${category}/${fileName}`, e);
    }

    return "";
  }

  public reload() {
    this.loadMainInstruction();
    this.reloadLibraryOnly();
  }

  private reloadLibraryOnly() {
    this._styleManager.reload();

    for (const block of this._activeBlocks) {
      if (block.isSpecial) {
        continue;
      }

      try {
        if (this._fs.existsSync(block.path)) {
          const content = this._fs.readFileSync(block.path, "utf8").toString();
          block.content = content;
          const result = this.parseBlockMetadata(content);
          this.applyMetadataToBlock(block, result?.metadata);
        }
      } catch (e) {
        console.error(`Failed to reload active block ${block.path}`, e);
      }
    }
  }

  private applyMetadataToBlock(block: PromptBlock, metadata: any) {
    block.isGoal = block.isGoal ?? false;
    // A star is visible for all user prompts except special blocks and AI-Contracts.
    block.hasGoal = !block.isSpecial && block.category !== "AI-Contracts";
    block.referenceLocation = metadata?.referencelocation as any || 'none';
    block.reference = metadata?.reference as any || '';
  }

  private loadMainInstruction() {
    try {
      const currentPromptFile = getCurrentInstructionPromptFile(
        this._promptBuilderDir,
      );
      if (this._fs.existsSync(currentPromptFile)) {
        const content = this._fs.readFileSync(currentPromptFile, "utf8").toString();
        const data: SessionData = JSON.parse(content);
        this._mainInstruction = data.mainInstruction || "";
        this._activeBlocks = data.activeBlocks || [];
        this._mainFileMap = data.fileMap || {};
        this._mainCollidedNames = data.collidedNames || {};
      }
    } catch (e) {
      console.error("Failed to load current prompt JSON", e);
      this._mainInstruction = "";
    }
  }

  public getMainInstruction(): string {
    return this._mainInstruction;
  }

  public updateMainInstruction(
    content: string,
    fileMap?: Record<string, string>,
    collidedNames?: Record<string, boolean>,
  ) {
    this._mainInstruction = content;
    if (fileMap) {
      this._mainFileMap = fileMap;
    }
    if (collidedNames) {
      this._mainCollidedNames = collidedNames;
    }
    this.saveMainInstruction();
  }

  public saveMainInstruction() {
    if (!this.isUserInitializedLibrary()) return;
    this._sessionManager.saveMainInstruction(
      this._mainInstruction,
      this._activeBlocks,
      this._mainFileMap,
      this._mainCollidedNames,
    );
  }

  public getPromptLibrary(
    showClaudeCodePromptBlocks: boolean = false,
    showCursorRules: boolean = false,
    customFolders: string[] = [],
    customWorkspaceFolders: { name: string; path: string }[] = [],
  ): PromptLibraryCategory[] {
    return this._libraryManager.getPromptLibrary(
      showClaudeCodePromptBlocks,
      showCursorRules,
      this._workspaceSkillsDir,
      customFolders,
      customWorkspaceFolders,
    );
  }

  public getGroupLibrary(): Group[] {
    return this._libraryManager.getGroupLibrary();
  }

  public saveGroup(group: Group): void {
    this._libraryManager.saveGroup(group);
  }

  public deleteGroup(name: string): void {
    this._libraryManager.deleteGroup(name);
  }

  public renderTemplate(
    content: string,
    variables: Record<string, string>,
  ): string {
    return this._compiler.renderTemplate(content, variables);
  }

  public parseBlockMetadata(content: string): { variables: Record<string, any>; metadata: Record<string, any> } | null {
    return this._libraryManager.parseBlockMetadata(content);
  }

  public addActiveBlock(
    category: string,
    filename: string,
    variables?: Record<string, string>,
  ) {
    const folderPath = this._libraryManager.getCategoryPath(category);
    const filePath = path.join(folderPath, filename);

    if (!this._activeBlocks.find((b) => b.path === filePath)) {
      let content = "";
      let isSpecial = false;

      if (category === "Claude Skills" || category === "Skills (workspace)") {
        const skillName = filename.replace(/\.md$/, "");
        content = `You must use the ${skillName} skill.`;
        isSpecial = true;
      } else {
        try {
          if (this._fs.existsSync(filePath)) {
            content = this._fs.readFileSync(filePath, "utf8").toString();
          }
        } catch (e) {
          console.error(`Failed to read block ${filePath}`, e);
        }
      }

      const result = this.parseBlockMetadata(content);

      const block: PromptBlock = {
        category,
        name: filename,
        path: filePath,
        content: variables ? this.renderTemplate(content, variables) : content,
        variables,
        isSpecial,
        contextFiles: [],
      };

      this.applyMetadataToBlock(block, result?.metadata);

      if (category === "AI-Contracts") {
        this._activeBlocks.unshift(block);
      } else {
        this._activeBlocks.push(block);
      }

      if (!isSpecial) {
        const newKey = `${category}:${filename}`;
        const activeKeys = this._activeBlocks
          .filter((b) => !b.isSpecial)
          .map((b) => `${b.category}:${b.name}`);
        this._associationManager.recordAddition(newKey, activeKeys);
      }

      // Only save to disk if it's a user-initialized library
      if (this.isUserInitializedLibrary()) {
        this.saveMainInstruction();
      }
    }
  }

  public addGroupToActiveBlocks(group: Group) {
    for (const subPrompt of group.subPrompts) {
      const categoryPath = this._libraryManager.getCategoryPath(
        subPrompt.category,
      );
      if (!this._fs.existsSync(categoryPath)) {
        continue;
      }
      this.addActiveBlock(
        subPrompt.category,
        subPrompt.name,
        subPrompt.variables,
      );
    }
  }

  public removeActiveBlock(filePath: string) {
    this._activeBlocks = this._activeBlocks.filter((b) => b.path !== filePath);
    this.saveMainInstruction();
  }
  
  public toggleGoal(filePath: string): boolean {
    const block = this._activeBlocks.find(b => b.path === filePath);
    if (!block) return false;
    
    // Cannot mark as goal if it does not have a reference section
    if (!block.reference || block.referenceLocation === 'none') {
      return false;
    }
    
    // Max 5 goals limit
    if (!block.isGoal) {
      const currentGoalCount = this._activeBlocks.filter(b => b.isGoal).length;
      if (currentGoalCount >= 5) {
        return false;
      }
    }
    
    block.isGoal = !block.isGoal;
    this.saveMainInstruction();
    return true;
  }

  public updateBlockReference(path: string, reference: string, location: string) {
    const block = this._activeBlocks.find(b => b.path === path);
    if (block) {
      block.reference = reference;
      block.referenceLocation = location as any;
      block.isGoal = true;
      this.saveMainInstruction();

      // Update the actual file on disk if it's in a writeable category
      if (this.canModifyCategory(block.category) && this._fs.existsSync(block.path)) {
        try {
          const content = this._fs.readFileSync(block.path, "utf8").toString();
          const updatedContent = this.updateContentMetadata(content, {
            Reference: reference,
            ReferenceLocation: location,
          });
          this._fs.writeFileSync(block.path, updatedContent, "utf8");
          block.content = block.variables ? this.renderTemplate(updatedContent, block.variables) : updatedContent;
        } catch (e) {
          console.error(`Failed to update block metadata on disk: ${block.path}`, e);
        }
      }
    }
  }

  private updateContentMetadata(content: string, metadata: Record<string, string>): string {
    const commentRegex = /(?:\{\%\s*comment\s*\%\}[\s\S]*?\{\%\s*endcomment\s*\%\}|<!--[\s\S]*?-->)/g;
    const matches = [...content.matchAll(commentRegex)];
    
    let updated = false;
    let newContent = content;

    // 1. Try to update existing metadata keys in ANY comment block
    for (const match of matches) {
      const fullComment = match[0];
      const isHtml = fullComment.startsWith("<!--");
      let commentBody = fullComment.replace(/(?:\{\%\s*comment\s*\%\}|\{\%\s*endcomment\s*\%\}|<!--|-->)/g, "");
      
      let lines = commentBody.split("\n");
      let changedAnyInThisBlock = false;

      for (const [key, value] of Object.entries(metadata)) {
        const keyRegex = new RegExp(`^\\s*#\\s*${key}\\s*:.*`, "i");
        const index = lines.findIndex(line => keyRegex.test(line));
        if (index !== -1) {
          lines[index] = `# ${key}: ${value}`;
          changedAnyInThisBlock = true;
        }
      }

      if (changedAnyInThisBlock) {
        const newCommentBody = lines.join("\n");
        const newFullComment = isHtml ? `<!--${newCommentBody}-->` : `{% comment %}${newCommentBody}{% endcomment %}`;
        newContent = newContent.replace(fullComment, newFullComment);
        updated = true;
        // Continue to check other blocks in case keys are split, but usually they are together
      }
    }

    // 2. If keys weren't found/updated, append them to the FIRST HTML comment block (if it exists and isn't a liquid vars block)
    if (!updated) {
      const firstHtmlComment = matches.find(m => m[0].startsWith("<!--"));
      if (firstHtmlComment) {
        const fullComment = firstHtmlComment[0];
        let commentBody = fullComment.replace(/<!--|-->/g, "");
        if (!commentBody.endsWith("\n") && commentBody.trim().length > 0) commentBody += "\n";
        for (const [key, value] of Object.entries(metadata)) {
          commentBody += `# ${key}: ${value}\n`;
        }
        newContent = newContent.replace(fullComment, `<!--${commentBody}-->`);
        updated = true;
      }
    }

    // 3. Absolute fallback: prepend a new HTML comment block
    if (!updated) {
      let newComment = "<!--\n";
      for (const [key, value] of Object.entries(metadata)) {
        newComment += `# ${key}: ${value}\n`;
      }
      newComment += "-->\n";
      newContent = newComment + newContent;
    }

    return newContent;
  }

  public addSpecialBlock(
    name: string,
    content: string,
    category: string = "Special",
  ) {
    const virtualPath = `special://${category}/${name}`;
    const existing = this._activeBlocks.find((b) => b.path === virtualPath);
    if (!existing) {
      this._activeBlocks.push({
        category: category,
        name: name,
        path: virtualPath,
        content: content,
        isSpecial: true,
        isGoal: false,
        hasGoal: false,
        contextFiles: [],
      });
    } else {
      existing.content = content;
    }
    this.saveMainInstruction();
  }

  public getActiveBlocks() {
    return this._activeBlocks.map((b) => ({
      ...b,
      style: this._styleManager.getStyle(b.category),
    }));
  }

  public getUserFolders(): string[] {
    return this._libraryManager
      .getPromptLibrary()
      .filter((c) => c.type === "user" || c.name === "AI-Contract")
      .map((c) => c.name);
  }

  public moveBlock(sourcePath: string, targetCategoryName: string): void {
    const validFolders = this.getUserFolders();
    if (!validFolders.includes(targetCategoryName)) {
      throw new Error(`Invalid target folder: ${targetCategoryName}`);
    }

    const absoluteSource = path.resolve(sourcePath);
    const fileName = path.basename(sourcePath);
    const targetDir = path.join(this._promptBuilderDir, targetCategoryName);
    const targetPath = path.join(targetDir, fileName);

    // Security: Validate both ends of the move
    if (!this.isPathSafe(absoluteSource) || !this.isPathSafe(targetPath)) {
      throw new Error("Access denied: Invalid source or target path.");
    }

    // Double check it's not a special system path for target (extra safety)
    if (
      this._isInside(CLAUDE_DIR, targetPath) ||
      this._isInside(CURSOR_DIR, targetPath)
    ) {
      throw new Error("Cannot move blocks to system-protected directories.");
    }

    if (sourcePath.includes("://")) {
      throw new Error(
        "Special context blocks cannot be moved between folders.",
      );
    }

    if (this._fs.existsSync(targetPath)) {
      throw new Error(
        `A block named "${fileName}" already exists in "${targetCategoryName}".`,
      );
    }

    this._fs.renameSync(sourcePath, targetPath);

    for (const block of this._activeBlocks) {
      if (block.path === sourcePath) {
        block.path = targetPath;
        block.category = targetCategoryName;
      }
    }

    this.reload();
  }

  public compilePrompt(workspaceRoot: string | null = null): string {
    return this._compiler.compilePrompt(
      this._mainInstruction,
      this._activeBlocks,
      this._mainFileMap,
    );
  }

  public saveCurrentSession(): string {
    if (!this.isUserInitializedLibrary()) return "";
    return this._sessionManager.saveCurrentSession(
      this._mainInstruction,
      this._activeBlocks,
      this._mainFileMap,
      this._mainCollidedNames,
    );
  }

  public loadLatestSession(): void {
    const historyList = this.getHistoryList();
    if (historyList.length > 0) {
      this.loadSession(historyList[0].filepath);
    }
  }

  public restoreLastSession(): void {
    const lastPath = this._sessionManager.lastSessionPath;
    if (lastPath) {
      this.loadSession(lastPath);
    }
  }

  public loadSession(filePath: string): void {
    try {
      // Security: Validated internally by readFileSync
      if (!this._fs.existsSync(filePath)) {
        throw new Error(`Session file not found: ${filePath}`);
      }

      const data: SessionData = JSON.parse(this._fs.readFileSync(filePath, "utf8").toString());
      this._mainInstruction = data.mainInstruction || "";
      this._mainFileMap = data.fileMap || {};
      this._mainCollidedNames = data.collidedNames || {};
      this._activeBlocks = [];
      if (data.activeBlocks && Array.isArray(data.activeBlocks)) {
        for (const block of data.activeBlocks) {
          if (block.isSpecial) {
            this._activeBlocks.push({
              category: block.category,
              name: block.name,
              path: block.path,
              content: block.content,
              isSpecial: true,
              contextFiles: block.contextFiles || [],
            });
          } else {
            this.addActiveBlock(block.category, block.name, block.variables);
          }
        }
      }

      this.saveMainInstruction();
    } catch (e) {
      console.error("Failed to load session", e);
      throw e;
    }
  }

  public getFileMap(): Record<string, string> {
    return this._mainFileMap;
  }

  public getCollidedNames(): Record<string, boolean> {
    return this._mainCollidedNames;
  }

  public getHistoryList(): HistoryItem[] {
    return this._sessionManager.getHistoryList();
  }

  public deleteAllHistory(): void {
    this._sessionManager.deleteAllHistory();
  }

  public clearCurrentSession(): void {
    this._mainInstruction = "";
    this._activeBlocks = [];
    this._mainFileMap = {};
    this._mainCollidedNames = {};
    this.saveMainInstruction();
  }

  public deleteSession(filePath: string): void {
    try {
      // Security: Validated internally by unlinkSync
      if (this._fs.existsSync(filePath)) {
        this._fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error("Failed to delete session", e);
    }
  }

  public getSuggestions(): Array<{
    category: string;
    name: string;
    path: string;
    style: any;
  }> {
    const activeKeys = this._activeBlocks
      .filter((b) => !b.isSpecial)
      .map((b) => `${b.category}:${b.name}`);

    const library = this.getPromptLibrary() || [];
    const availableBlocks: { category: string; name: string }[] = [];
    for (const cat of Array.isArray(library) ? library : []) {
      if (!cat.path) {
        continue;
      }
      for (const file of cat.files) {
        availableBlocks.push({ category: cat.name, name: file });
      }
    }

    const rawSuggestions = this._associationManager.getSuggestions(
      activeKeys,
      availableBlocks,
    );
    return rawSuggestions.map((s) => ({
      ...s,
      path: path.join(this._promptBuilderDir, s.category, s.name),
      style: this.getStyle(s.category),
    }));
  }

  public searchPrompts(
    query: string,
  ): Array<{ category: string; name: string; content: string }> {
    const results: Array<{ category: string; name: string; content: string }> =
      [];
    const library = this.getPromptLibrary(true, true);
    const lowerQuery = query.toLowerCase();

    for (const category of library) {
      if (!category.path) {
        continue;
      }

      for (const fileName of category.files) {
        const filePath = path.join(category.path, fileName);
        try {
          if (this._fs.existsSync(filePath)) {
            const content = this._fs.readFileSync(filePath, "utf8").toString();
            if (
              content.toLowerCase().includes(lowerQuery) ||
              fileName.toLowerCase().includes(lowerQuery) ||
              category.name.toLowerCase().includes(lowerQuery)
            ) {
              results.push({
                category: category.name,
                name: fileName,
                content: content,
              });
            }
          }
        } catch (e) {
          console.error(`Failed to read block ${filePath} during search`, e);
        }
      }
    }
    return results;
  }

  public getStyle(category: string) {
    return this._styleManager.getStyle(category);
  }

  public renameCategory(oldName: string, newName: string): void {
    if (
      path.join(this._promptBuilderDir, oldName) ===
      path.join(this._promptBuilderDir, newName)
    ) {
      return;
    }

    const oldPath = path.join(this._promptBuilderDir, oldName);
    const newPath = path.join(this._promptBuilderDir, newName);

    // Security: Validated internally by renameSync
    if (!this._fs.existsSync(oldPath)) {
      throw new Error(`Category '${oldName}' does not exist.`);
    }

    if (this._fs.existsSync(newPath)) {
      throw new Error(`Category '${newName}' already exists.`);
    }

    this._fs.renameSync(oldPath, newPath);

    this._activeBlocks = this._activeBlocks.filter((block) => {
      if (
        block.isSpecial ||
        BUNDLED_CATEGORIES.includes(block.category)
      ) {
        return true;
      }

      return block.category !== oldName;
    });

    const items = this._fs
      .readdirSync(newPath)
      .filter((f) => f.endsWith(".md") || f.endsWith(".mdc"));
    for (const item of items) {
      this._associationManager.renameKey(
        `${oldName}:${item}`,
        `${newName}:${item}`,
      );
    }

    this.reload();
  }
}
