import { SecureFileSystem } from "./fs";
import * as path from "path";
import {
  EXCLUDED_FOLDERS,
  CLAUDE_SKILLS_DIR,
  CLAUDE_COMMANDS_DIR,
  CURSOR_RULES_DIR,
  getGroupsFile,
} from "./constants";
import { SPECIAL_TOOLS } from "./tools";
import { StyleManager } from "./styleManager";
import {
  PromptLibraryCategory,
  Group,
} from "./interfaces";

export class LibraryManager {
  constructor(
    private _promptBuilderDir: string,
    private _styleManager: StyleManager,
    private _fs: SecureFileSystem,
    private _extensionDir?: string,
  ) {}

  public getPromptLibrary(
    showClaudeCodePromptBlocks: boolean = false,
    showCursorRules: boolean = false,
  ): PromptLibraryCategory[] {
    const categories: PromptLibraryCategory[] = [];
    if (!this._fs.existsSync(this._promptBuilderDir)) {
      return categories;
    }

    // Add user folders
    const items = this._fs
      .readdirSync(this._promptBuilderDir, { withFileTypes: true })
      .filter(
        (item: any) => item.isDirectory() && !EXCLUDED_FOLDERS.includes(item.name) && !item.name.startsWith('.'),
      );
    
    for (const item of items) {
      if (item.name === 'AI-Contracts') continue;
      
      const folderPath = path.join(this._promptBuilderDir, item.name);
      const files = this.getPromptFiles(folderPath);
      this.addCategory(categories, item.name, folderPath, files, 'user', true);
    }

    // Explicitly add AI-Contracts as a system category
    const aiContractsPath = path.join(this._promptBuilderDir, 'AI-Contracts');
    if (this._fs.existsSync(aiContractsPath)) {
      const files = this.getPromptFiles(aiContractsPath);
      this.addCategory(categories, 'AI-Contracts', aiContractsPath, files, 'system', false);
    }
    // Add System Tools
    if (showClaudeCodePromptBlocks) {
      if (this._fs.existsSync(CLAUDE_SKILLS_DIR)) {
        const files = this.getPromptFiles(CLAUDE_SKILLS_DIR);
        if (files.length > 0) this.addCategory(categories, "Claude Skills", CLAUDE_SKILLS_DIR, files, "tool", false);
      }
      if (this._fs.existsSync(CLAUDE_COMMANDS_DIR)) {
        const files = this.getPromptFiles(CLAUDE_COMMANDS_DIR);
        if (files.length > 0) this.addCategory(categories, "Claude Commands", CLAUDE_COMMANDS_DIR, files, "tool", false);
      }
    }

    if (showCursorRules) {
      if (this._fs.existsSync(CURSOR_RULES_DIR)) {
        const files = this.getPromptFiles(CURSOR_RULES_DIR);
        if (files.length > 0) this.addCategory(categories, "Cursor", CURSOR_RULES_DIR, files, "tool", false);
      }
    }

    this.addCategory(categories, "Tools", "", SPECIAL_TOOLS.map(t => t.displayName), "tool", false);

    return categories;
  }

  public getGroupLibrary(): Group[] {
    const groupsFile = getGroupsFile(this._promptBuilderDir);
    if (!this._fs.existsSync(groupsFile)) {
      return [];
    }
    try {
      const content = this._fs.readFileSync(groupsFile, "utf8").toString();
      return JSON.parse(content) as Group[];
    } catch (e) {
      console.error("Failed to read groups file:", e);
      return [];
    }
  }

  public saveGroup(group: Group): void {
    const groupsFile = getGroupsFile(this._promptBuilderDir);
    const groups = this.getGroupLibrary();

    // Create a cleaned version of the group with only essential fields and no emojis
    const cleanedGroup: Group = {
      name: this.stripEmojis(group.name).trim(),
      subPrompts: group.subPrompts.map((sp) => ({
        category: sp.category,
        name: sp.name,
        variables: sp.variables,
      })),
    };

    if (group.description) {
      cleanedGroup.description = this.stripEmojis(group.description).trim();
    }

    const existingIndex = groups.findIndex((g) => g.name === cleanedGroup.name);
    if (existingIndex !== -1) {
      groups[existingIndex] = cleanedGroup;
    } else {
      groups.push(cleanedGroup);
    }
    
    this._fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2), "utf8");
  }

  public deleteGroup(name: string): void {
    const groupsFile = getGroupsFile(this._promptBuilderDir);
    let groups = this.getGroupLibrary();
    groups = groups.filter((g) => g.name !== name);
    this._fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2), "utf8");
  }

  private addCategory(categories: PromptLibraryCategory[], name: string, folderPath: string, files: string[], type: 'user' | 'system' | 'tool', isRenameable: boolean = true) {
    // Determine if it's a system category based on whether it is inside the extension directory
    const resolvedPath = path.resolve(folderPath);
    const isBundled = this._extensionDir && resolvedPath.startsWith(path.resolve(this._extensionDir));
    const effectiveType = isBundled ? 'system' : type;
    
    categories.push({
      name,
      path: folderPath,
      files,
      style: this._styleManager.getStyle(name),
      isRenameable,
      type: effectiveType
    });
  }

  private getPromptFiles(folderPath: string): string[] {
    const files: string[] = [];
    if (!this._fs.existsSync(folderPath)) return files;
    
    const items = this._fs.readdirSync(folderPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      
      if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdc') || item.name.endsWith('.cursorrules'))) {
        files.push(item.name);
      } else if (item.isDirectory()) {
        const subfolderPath = path.join(folderPath, item.name);
        try {
          const subItems = this._fs.readdirSync(subfolderPath, { withFileTypes: true });
          for (const subItem of subItems) {
            if (subItem.isFile() && !subItem.name.startsWith('.') && (subItem.name.endsWith('.md') || subItem.name.endsWith('.mdc') || subItem.name.endsWith('.cursorrules'))) {
              files.push(`${item.name}/${subItem.name}`);
            }
          }
        } catch (e) {
          console.error(`Failed to read subfolder ${subfolderPath}`, e);
        }
      }
    }
    return files;
  }

  public getCategoryPath(category: string): string {
    if (category === "Claude Skills") {
      return CLAUDE_SKILLS_DIR;
    } else if (category === "Claude Commands") {
      return CLAUDE_COMMANDS_DIR;
    } else if (category === "Cursor") {
      return CURSOR_RULES_DIR;
    } else {
      return path.join(this._promptBuilderDir, category);
    }
  }

  public parseBlockMetadata(content: string): { variables: Record<string, any>; metadata: Record<string, any> } | null {
    const commentRegex = /(?:\{\%\s*comment\s*\%\}[\s\S]*?\{\%\s*endcomment\s*\%\}|<!--[\s\S]*?-->)/g;
    const matches = [...content.matchAll(commentRegex)];
    
    const variables: Record<string, any> = {};
    const metadata: Record<string, any> = {};

    const RESERVED_METADATA_KEYS = [
      'referencelocation',
      'reference',
      'goal',
      'alwaysgoal',
      'hasgoal',
      'isspecial'
    ];

    const RESERVED_VAR_NAMES = [
      'blockname',
      'referencelocation',
      'reference',
      'goal',
      'alwaysgoal',
      'hasgoal'
    ];

    for (const match of matches) {
      const commentContent = match[0]
        .replace(/(?:\{\%\s*comment\s*\%\}|\{\%\s*endcomment\s*\%\}|<!--|-->)/g, "")
        .trim();
      
      const lines = commentContent.split("\n");
      let currentVar: string | null = null;
      let inArray: string | null = null;
      let arrayLines: string[] = [];

      for (const line of lines) {
        let trimmed = line.trim();
        if (trimmed.startsWith("#")) {
          trimmed = trimmed.replace(/^#\s*/, "");
        }
        if (!trimmed || trimmed === "vars:") {
          continue;
        }

        const varMatch = trimmed.match(/^([a-zA-Z0-9_]+):$/);
        if (varMatch) {
          currentVar = varMatch[1].toLowerCase();
          variables[currentVar] = {};
          inArray = null;
          continue;
        }

        const propMatch = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
        if (propMatch) {
          const key = propMatch[1].toLowerCase();
          let val: any = propMatch[2].trim();

          if (val === "[") {
            inArray = key;
            arrayLines = [];
          } else if (val.startsWith("[") && val.endsWith("]")) {
            val = val
              .slice(1, -1)
              .split(",")
              .map((i: string) => i.trim().replace(/^['"]|['"]$/g, ""));
            if (currentVar) {
              variables[currentVar][key] = val;
            } else {
              metadata[key] = val;
            }
          } else {
            if (currentVar) {
              variables[currentVar][key] = val;
            } else {
              metadata[key] = val;
            }
          }
          continue;
        }

        if (currentVar && inArray) {
          if (trimmed.endsWith("]")) {
            const lastBit = trimmed.slice(0, -1).trim();
            if (lastBit) {
              arrayLines.push(lastBit.replace(/^['"]|['"]$|,$/g, "").trim());
            }
            variables[currentVar][inArray] = arrayLines.filter(l => l !== "");
            inArray = null;
            arrayLines = [];
          } else {
            arrayLines.push(trimmed.replace(/^['"]|['"]$|,$/g, "").trim());
          }
          continue;
        }
      }
    }

    // Strip comment blocks before scanning for {{ }} variables so metadata fields
    // like {{blockName}} inside comments don't create spurious form inputs
    const contentWithoutComments = content
      .replace(/\{\%\s*comment\s*\%\}[\s\S]*?\{\%\s*endcomment\s*\%\}/g, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    const varRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    const varMatches = [...contentWithoutComments.matchAll(varRegex)];
    for (const m of varMatches) {
      const varName = m[1];
      const lowerVarName = varName.toLowerCase();
      
      // Skip if it's already defined or if it's a reserved system variable
      if (!variables[varName] && !RESERVED_VAR_NAMES.includes(lowerVarName)) {
        variables[varName] = { type: "text" };
      }
    }

    return (Object.keys(variables).length > 0 || Object.keys(metadata).length > 0) 
      ? { variables, metadata } 
      : null;
  }

  private stripEmojis(str: string): string {
    return str.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      "",
    );
  }

  public setPromptBuilderDir(dir: string) {
    this._promptBuilderDir = dir;
  }

  public get promptBuilderDir(): string {
    return this._promptBuilderDir;
  }
}
