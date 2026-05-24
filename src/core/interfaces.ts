export interface GroupSubPrompt {
  category: string;
  name: string;
  variables?: Record<string, string>;
}

export interface Group {
  name: string;
  subPrompts: GroupSubPrompt[];
  description?: string;
}

export interface ContextFileInfo {
  path: string;
  name: string;
  lines?: string;
}

export interface PromptBlock {
  category: string;
  name: string;
  path: string;
  content?: string;
  isSpecial?: boolean; // Added for special blocks
  contextFiles?: ContextFileInfo[];
  variables?: Record<string, string>;
  isGoal?: boolean;
  hasGoal?: boolean;
  referenceLocation?: 'workflowFirstTurn' | 'workflowEveryChange' | 'workflowBeforeEditing' | 'workflowEndOfTask' | 'workflow' | 'remark' | 'none';
  reference?: string;
}

export interface CategoryStyle {
  color: string;
  borderColor: string;
}

export interface PromptLibraryCategory {
  name: string;
  path: string;
  files: string[];
  style: CategoryStyle;
  isRenameable?: boolean;
  type: 'user' | 'system' | 'tool';
}

export interface HistoryItem {
  filepath: string;
  filename: string;
  timestamp: string;
}

export interface SessionData {
  mainInstruction: string;
  activeBlocks: Array<{
    category: string;
    name: string;
    path: string;
    content?: string;
    isSpecial?: boolean;
    contextFiles?: Array<{
      path: string;
      name: string;
      lines?: string;
    }>;
    variables?: Record<string, string>;
    isGoal?: boolean;
    hasGoal?: boolean;
    reference?: string;
    referenceLocation?: string;
  }>;
  timestamp: string;
  fileMap?: Record<string, string>;
  collidedNames?: Record<string, boolean>;
}
