import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export const DEFAULT_PROMPT_BUILDER_DIR = path.join(
  os.homedir(),
  "Prompt Library",
);

export function getCurrentInstructionPromptFile(root: string): string {
  return path.join(root, "system", "current_instruction_prompt.json");
}

export function getStylesFile(root: string): string {
  const systemPath = path.join(root, "system", "styles.json");
  return fs.existsSync(systemPath) ? systemPath : path.join(root, "styles.json");
}

export function getAssociationsFile(root: string): string {
  return path.join(root, "system", "associations.json");
}

export function getHistoryDir(root: string): string {
  return path.join(root, "system", "history");
}

export function getGroupsFile(root: string): string {
  return path.join(root, "system", "groups.json");
}

export const EXCLUDED_FOLDERS = [
  "system",
  "System",
  "config",
  "Config",
  "logs",
  "Logs",
  ".git",
  "node_modules",
  "_proposed_edits",
];
export const EXTENSION_ID = "prompt-forge";

export const BUNDLED_CATEGORIES = [
  "Claude Skills",
  "Claude Commands",
  "Cursor",
  "AI-Contracts",
  "Tools",
  "Skills (workspace)",
  "Special",
];

// Claude Code paths
export const CLAUDE_DIR = path.join(os.homedir(), ".claude");
export const CLAUDE_SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
export const CLAUDE_COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
// Cursor paths
export const CURSOR_DIR = path.join(os.homedir(), ".cursor");
export const CURSOR_RULES_DIR = path.join(CURSOR_DIR, "rules");

export const WORKSPACE_SKILLS_DIRS = [".skills", "skills"];
