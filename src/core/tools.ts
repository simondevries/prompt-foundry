export interface ToolDefinition {
  id: string;
  displayName: string;
  icon: string;
}

export const SPECIAL_TOOLS: ToolDefinition[] = [
  { id: "problems", displayName: "Add IDE Problems (Current file)", icon: "error" },
  { id: "symbols", displayName: "Add Active File Symbols", icon: "symbol-class" },
  { id: "gitdiff", displayName: "Git Diff", icon: "diff" },
  { id: "gitcommit", displayName: "Git Specific Commit", icon: "git-commit" },
];
