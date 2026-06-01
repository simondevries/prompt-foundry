export interface Block {
  category: string;
  file: string;
  path: string;
  name: string;
  content?: string;
  isSpecial?: boolean;
  isGoal?: boolean;
  hasGoal?: boolean;
  reference?: string;
  referenceLocation?: string;
  style?: {
    color: string;
    borderColor: string;
  };
}

export interface Category {
  name: string;
  path: string;
  files: any[];
  style: {
    color: string;
    borderColor: string;
  };
  isRenameable?: boolean;
  type: 'user' | 'system' | 'tool';
}

export interface Group {
  name: string;
  subPrompts: Block[];
}

export interface HistoryItem {
  timestamp: string;
  filepath: string;
  preview: string;
}

export interface ProposedEdit {
  id: string;
  category: string;
  name: string;
  targetFile: string;
  tempFile: string;
  diffFile: string;
  timestamp: string;
}

export interface State {
  hasCreatedLibraryFolder: boolean;
  isUserInitializedLibrary: boolean;
  library: Category[];
  activeBlocks: Block[];
  groupLibrary: Group[];
  selectedCategory: string | null;
  activeTag: any | null;
  lastCaretPosition: number;
  activeForm: "liquidVariables" | "gitdiffref" | "gitdiff" | null;
  gitBranches: string[];
  gitDiffBranches: string[];
  liquidFormData?: {
    category: string;
    name: string;
    schema?: Record<string, { type: string, options?: string[] }>;
  };
  mainInstruction: string;
  history: HistoryItem[];
  settings: {
    promptFolder: string;
    showClaudeCodeBlocks: boolean;
    showCursorRules: boolean;
    showWorkspaceSkills: boolean;
  };
  appName: string;
  lastAction: 'copy' | 'send' | 'append' | null;
  fileMap: Record<string, string>;
  collidedNames: Record<string, boolean>;
  followActiveFile: boolean;
  autoTagCount: number;
  milestones: Record<string, boolean>;
  activeTooltipId: string | null;
  mcpConfig: string;
  tuiPath?: string;
  suggestions: Block[];
  proposedEdits: ProposedEdit[];
}
