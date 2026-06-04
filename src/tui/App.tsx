import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { PromptManager } from '../core/promptManager.js';
import { StyleManager } from '../core/styleManager.js';
import { SecureFileSystem } from '../core/fs.js';
import { DEFAULT_PROMPT_BUILDER_DIR } from '../core/constants.js';
import { PromptBlock, PromptLibraryCategory, Group } from '../core/interfaces.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface SafeSelectInputProps<V> {
  items: Array<{ key?: string; label: string; value: V; disabled?: boolean }>;
  onSelect: (item: { key?: string; label: string; value: V; disabled?: boolean }) => void;
  limit?: number;
  isFocused?: boolean;
}

function SafeSelectInput<V>({ items, onSelect, limit = 15, isFocused = true }: SafeSelectInputProps<V>) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keep selectedIndex in bounds when items change
  useEffect(() => {
    setSelectedIndex(prev => Math.max(0, Math.min(items.length - 1, prev)));
  }, [items]);

  useInput((input, key) => {
    if (!isFocused) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      const selectedItem = items[selectedIndex];
      if (selectedItem && !selectedItem.disabled) {
        onSelect(selectedItem);
      }
    }
  }, { isActive: isFocused });

  const visibleItems = items.slice(0, limit);

  return (
    <Box flexDirection="column">
      {visibleItems.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={item.key ?? String(index)}>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {isSelected ? '▶ ' : '  '}
              {item.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

interface AppProps {
  arg?: string;
  outputArg?: string;
  libraryPath?: string;
}

type FocusSection = 'Library' | 'Groups' | 'ActiveStack';
type LeftView = 'Categories' | 'Blocks' | 'VariableInput' | 'Search';

interface VariableDefinition {
  name: string;
  type?: 'text' | 'select';
  options?: string[];
  description?: string;
}

export const App: React.FC<AppProps> = ({ arg, outputArg, libraryPath }) => {
  const { exit } = useApp();
  const [manager, setManager] = useState<PromptManager | null>(null);
  
  // Loaded Data
  const [categories, setCategories] = useState<PromptLibraryCategory[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeBlocks, setActiveBlocks] = useState<PromptBlock[]>([]);
  
  // Navigation & View States
  const [focusSection, setFocusSection] = useState<FocusSection>('Library');
  const [leftView, setLeftView] = useState<LeftView>('Categories');
  
  // Category & Block selections
  const [selectedCategory, setSelectedCategory] = useState<PromptLibraryCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Focus index for Active Stack items (Section 3)
  const [selectedActiveIndex, setSelectedActiveIndex] = useState(0);

  // Status message for feedback
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Liquid Variable Form State
  const [pendingBlock, setPendingBlock] = useState<{ category: string, name: string, content: string, vars: VariableDefinition[] } | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [currentVarIndex, setCurrentVarIndex] = useState(0);

  // External execution parameters
  const [tempFilePath, setTempFilePath] = useState<string | null>(null);
  const [initialMainInstruction, setInitialMainInstruction] = useState('');

  // 1. Initialize core managers
  useEffect(() => {
    let promptBuilderDir = libraryPath || DEFAULT_PROMPT_BUILDER_DIR;
    let mainInstrFromFile = '';
    let savePath: string | null = outputArg || null;

    if (arg) {
      if (fs.existsSync(arg)) {
        const stats = fs.statSync(arg);
        if (stats.isFile()) {
          mainInstrFromFile = fs.readFileSync(arg, 'utf8').trim();
          if (!savePath) savePath = arg;
        } else if (stats.isDirectory() && !libraryPath) {
          promptBuilderDir = arg;
        }
      }
    }

    setTempFilePath(savePath);

    const sfs = new SecureFileSystem(promptBuilderDir);
    const styleManager = new StyleManager(promptBuilderDir, sfs);
    const pm = new PromptManager(promptBuilderDir, styleManager, sfs, undefined, false);
    
    setManager(pm);
    setCategories(pm.getPromptLibrary(true, true));
    setGroups(pm.getGroupLibrary());
    setActiveBlocks([...pm.getActiveBlocks()]);

    // Priority: 1. File content passed as arg, 2. Manager's session main instruction
    const baseInstruction = mainInstrFromFile || pm.mainInstruction || '';
    setInitialMainInstruction(baseInstruction);
    
    // Set it in the manager too so compilation uses it
    if (mainInstrFromFile) {
      pm.updateMainInstruction(mainInstrFromFile);
    }
  }, [arg, outputArg, libraryPath]);

  // Filter out blocks already in the active stack
  const activePaths = useMemo(() => new Set(activeBlocks.map(b => b.path)), [activeBlocks]);

  const isUnavailable = (category: string, name: string) => {
    if (category === 'Claude Skills' || category === 'Skills (workspace)') return true;
    if (category === 'Tools') return true;
    if (name.toLowerCase().includes('git tools')) return true;
    return false;
  };

  const truncateWords = (text: string, limit: number) => {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length > limit) {
      return words.slice(0, limit).join(' ') + '...';
    }
    return text;
  };

  // Flattened blocks for search - filtered
  const allBlocks = useMemo(() => {
    const blocks: { key: string, label: string, value: { category: string, name: string, path: string }, disabled?: boolean }[] = [];
    categories.forEach(cat => {
      cat.files.forEach(file => {
        const fullPath = path.join(cat.path, file);
        if (!activePaths.has(fullPath)) {
          const disabled = isUnavailable(cat.name, file);
          blocks.push({ 
            key: fullPath,
            label: disabled ? `[${cat.name}] ${file} (not available in TUI)` : `[${cat.name}] ${file}`, 
            value: { category: cat.name, name: file, path: fullPath },
            disabled
          });
        }
      });
    });
    return blocks;
  }, [categories, activePaths]);

  const filteredBlocks = useMemo(() => {
    if (!searchQuery) return [];
    return allBlocks.filter(b => b.label.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 15);
  }, [allBlocks, searchQuery]);

  const refreshActiveBlocks = (pm: PromptManager) => {
    setActiveBlocks([...pm.getActiveBlocks()]);
  };

  // 2. Action Handlers
  const handleSelectCategory = (item: { label: string, value: string }) => {
    const cat = categories.find(c => c.name === item.value);
    if (cat) {
      setSelectedCategory(cat);
      setLeftView('Blocks');
    }
  };

  const handleSelectBlock = (item: { label: string, value: { category: string, name: string, path: string }, disabled?: boolean }) => {
    if (!manager || item.disabled) return;
    const { category, name } = item.value;
    try {
      const content = manager.getPromptBlockContent(category, name);
      const meta = manager.parseBlockMetadata(content);
      
      const vars: VariableDefinition[] = [];
      if (meta?.variables) {
        for (const [varName, varDef] of Object.entries(meta.variables)) {
          vars.push({
            name: varName,
            type: varDef.options ? 'select' : 'text',
            options: varDef.options,
            description: varDef.description
          });
        }
      }

      if (vars.length > 0) {
        setPendingBlock({ category, name, content, vars });
        setVariableValues({});
        setCurrentVarIndex(0);
        setLeftView('VariableInput');
      } else {
        manager.addActiveBlock(category, name);
        refreshActiveBlocks(manager);
      }
    } catch (e) {
      // silenced
    }
  };

  const handleSelectGroup = (item: { label: string, value: Group }) => {
    if (!manager) return;
    try {
      manager.addGroupToActiveBlocks(item.value);
      refreshActiveBlocks(manager);
      setFocusSection('ActiveStack');
    } catch (e) {
      // silenced
    }
  };

  const handleVariableSubmit = (value: string) => {
    if (!pendingBlock || !manager) return;
    const currentVar = pendingBlock.vars[currentVarIndex];
    const newValues = { ...variableValues, [currentVar.name]: value };
    setVariableValues(newValues);

    if (currentVarIndex < pendingBlock.vars.length - 1) {
      setCurrentVarIndex(currentVarIndex + 1);
    } else {
      try {
        manager.addActiveBlock(pendingBlock.category, pendingBlock.name, newValues);
        refreshActiveBlocks(manager);
        setPendingBlock(null);
        setLeftView('Categories');
      } catch (e) {
        setPendingBlock(null);
        setLeftView('Categories');
      }
    }
  };

  const handleToggleGoal = (index: number) => {
    if (!manager) return;
    const block = activeBlocks[index];
    if (block) {
      // Prevent starring AI Contracts as requested
      if (block.category === 'AI-Contracts' || block.isSpecial) {
        return;
      }
      
      // Only allow starring if the block has a reference section
      if (!block.reference || block.referenceLocation === 'none') {
        setStatusMessage('Only blocks with a reference section can be goals.');
        setTimeout(() => setStatusMessage(null), 2000);
        return;
      }
      
      manager.toggleGoal(block.path);
      refreshActiveBlocks(manager);
    }
  };

  const handleRemoveBlock = (index: number) => {
    if (!manager) return;
    const block = activeBlocks[index];
    if (block) {
      manager.removeActiveBlock(block.path);
      refreshActiveBlocks(manager);
      setSelectedActiveIndex(prev => Math.max(0, Math.min(activeBlocks.length - 2, prev)));
    }
  };

  const handleCompile = () => {
    if (!manager) return;
    try {
      const compiled = manager.compilePrompt();
      if (tempFilePath) {
        fs.writeFileSync(tempFilePath, compiled, 'utf8');
      } else {
        process.stdout.write(compiled);
      }
      manager.clearCurrentSession();
      setTimeout(() => exit(), 50);
    } catch (e) {
      // silenced
    }
  };

  const handleCopyToClipboard = () => {
    if (!manager) return;
    try {
      const compiled = manager.compilePrompt();
      // Use pbcopy on macOS
      execSync('pbcopy', { input: compiled });
      
      setStatusMessage('Copied to clipboard!');
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (e) {
      setStatusMessage('Failed to copy to clipboard.');
      setTimeout(() => setStatusMessage(null), 2000);
    }
  };

  // 3. Focus & Key Bindings
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();

    const isTyping = leftView === 'VariableInput' || leftView === 'Search';

    if (!isTyping) {
      if (input === '1') {
        setFocusSection('Library');
        setLeftView('Categories');
      }
      if (input === '2') {
        setFocusSection('Groups');
      }
      if (input === '3') {
        setFocusSection('ActiveStack');
      }
      if (input === 's') {
        setSearchQuery('');
        setLeftView('Search');
        setFocusSection('Library');
      }
      if (input === 'c') {
        handleCompile();
      }
      if (input === 'y') {
        handleCopyToClipboard();
      }
    }

    if (focusSection === 'ActiveStack' && activeBlocks.length > 0) {
      if (key.upArrow) {
        setSelectedActiveIndex(prev => Math.max(0, prev - 1));
      }
      if (key.downArrow) {
        setSelectedActiveIndex(prev => Math.min(activeBlocks.length - 1, prev + 1));
      }
      if (input === 'd') {
        handleRemoveBlock(selectedActiveIndex);
      }
      if (input === 'g') {
        handleToggleGoal(selectedActiveIndex);
      }
    }

    if (key.escape) {
      if (leftView === 'Blocks') {
        setLeftView('Categories');
      } else if (leftView === 'VariableInput') {
        setPendingBlock(null);
        setLeftView('Categories');
      } else if (leftView === 'Search') {
        setLeftView('Categories');
      }
    }
  });

  if (!manager) return null;

  const filteredCategoryFiles = selectedCategory?.files.filter(f => !activePaths.has(path.join(selectedCategory.path, f))) || [];

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} flexGrow={1}>

      {/* Main 2-Column Interface */}
      <Box flexGrow={1} flexDirection="row">
        
        {/* Left Column (50% Width) - Tabs Style */}
        <Box width="50%" flexDirection="column" borderStyle="single" borderTop={false} borderBottom={false} borderLeft={false} borderRight={true} borderColor="gray" paddingX={1} paddingY={0}>
          
          {/* Tab Headers */}
          <Box marginBottom={0}>
              <Text color={focusSection === 'Library' ? 'green' : 'white'} bold={focusSection === 'Library'}>
                {focusSection === 'Library' ? '● ' : '○ '}
                [1] Library
              </Text>
             <Text>    </Text>
             <Text color={focusSection === 'Groups' ? 'green' : 'white'} bold={focusSection === 'Groups'}>
               {focusSection === 'Groups' ? '● ' : '○ '}
               [2] Groups
             </Text>
          </Box>

          <Box flexGrow={1} flexDirection="column" marginTop={0}>
            {focusSection === 'Library' && leftView === 'Categories' && (
              <Box flexDirection="column">
                <Box marginBottom={0}>
                  <Text bold color="gray">Browse Categories:</Text>
                </Box>
                <SafeSelectInput 
                  items={categories.map(c => ({ key: c.name, label: `📁 ${c.name}`, value: c.name }))} 
                  onSelect={handleSelectCategory}
                  limit={15}
                  isFocused={focusSection === 'Library'}
                />
              </Box>
            )}
            {focusSection === 'Library' && leftView === 'Blocks' && selectedCategory && (
              <Box flexDirection="column">
                <Box marginBottom={0}>
                  <Text bold color="gray">Blocks in {selectedCategory.name}:</Text>
                </Box>
                {filteredCategoryFiles.length === 0 ? (
                  <Text color="gray">All blocks from this category are already in the stack.</Text>
                ) : (
                  <SafeSelectInput 
                    items={filteredCategoryFiles.map((f: string) => {
                      const disabled = isUnavailable(selectedCategory.name, f);
                      const fullPath = path.join(selectedCategory.path, f);
                      return { 
                        key: fullPath,
                        label: disabled ? `📄 ${f} (not available in TUI)` : `📄 ${f}`, 
                        value: { category: selectedCategory.name, name: f, path: fullPath },
                        disabled
                      };
                    })} 
                    onSelect={handleSelectBlock}
                    limit={15}
                    isFocused={focusSection === 'Library'}
                  />
                )}
                <Box marginTop={0}>
                  <Text color="gray">[Esc] Return to categories</Text>
                </Box>
              </Box>
            )}
            {leftView === 'VariableInput' && pendingBlock && (
              <Box flexDirection="column" borderStyle="double" borderColor="magenta" paddingX={1} paddingY={0}>
                <Text bold color="magenta">📝 Variable Required: {pendingBlock.name}</Text>
                <Box marginTop={0} flexDirection="column">
                  <Text color="yellow" bold>{pendingBlock.vars[currentVarIndex].name}{pendingBlock.vars[currentVarIndex].description ? ` - ${pendingBlock.vars[currentVarIndex].description}` : ''}:</Text>
                  
                  {pendingBlock.vars[currentVarIndex].type === 'select' ? (
                    <Box marginTop={0}>
                      <SafeSelectInput 
                        items={(pendingBlock.vars[currentVarIndex].options || []).map((opt: string) => ({ key: opt, label: opt, value: opt }))}
                        onSelect={(item) => handleVariableSubmit(item.value)}
                        limit={10}
                        isFocused={leftView === 'VariableInput'}
                      />
                    </Box>
                  ) : (
                    <Box marginTop={0}>
                      <TextInput 
                        value={variableValues[pendingBlock.vars[currentVarIndex].name] || ''} 
                        onChange={(val) => setVariableValues(prev => ({ ...prev, [pendingBlock.vars[currentVarIndex].name]: val }))}
                        onSubmit={handleVariableSubmit}
                      />
                    </Box>
                  )}
                </Box>
                <Box marginTop={0}>
                  <Text color="gray">({currentVarIndex + 1}/{pendingBlock.vars.length}) [Esc] Cancel</Text>
                </Box>
              </Box>
            )}
            {leftView === 'Search' && (
              <Box flexDirection="column">
                <Box flexDirection="row" marginBottom={0}>
                  <Text bold color="yellow">🔍 Search: </Text>
                  <TextInput value={searchQuery} onChange={setSearchQuery} placeholder="start typing to search..." />
                </Box>
                {searchQuery.length === 0 && <Text color="gray" italic>start typing to search...</Text>}
                <Box>
                  {searchQuery.length > 0 && filteredBlocks.length === 0 ? <Text color="gray">No blocks match.</Text> : (
                    <SafeSelectInput 
                      items={filteredBlocks} 
                      onSelect={handleSelectBlock}
                      isFocused={leftView === 'Search'}
                    />
                  )}
                </Box>
              </Box>
            )}
            {focusSection === 'Groups' && (
              <Box flexDirection="column">
                <Box marginBottom={0}>
                  <Text bold color="gray">Available Groups:</Text>
                </Box>
                {groups.length === 0 ? <Text color="gray">No groups defined.</Text> : (
                  <SafeSelectInput 
                    items={groups.map(g => ({ key: g.name, label: `  ${g.name}`, value: g }))} 
                    onSelect={handleSelectGroup}
                    limit={15}
                    isFocused={focusSection === 'Groups'}
                  />
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* Right Column (50% Width) - Active Prompt */}
        <Box width="50%" flexDirection="column" paddingX={1} paddingY={0} marginLeft={1}>
          
          <Box marginBottom={0}>
            <Text color={focusSection === 'ActiveStack' ? 'green' : 'white'} bold={focusSection === 'ActiveStack'}>
              {focusSection === 'ActiveStack' ? '● ' : '○ '}
              [3] Active Prompt ({activeBlocks.length})
            </Text>
          </Box>

          {/* Main Instruction Section */}
          <Box paddingX={0} paddingY={0} flexDirection="column" marginTop={0} marginBottom={1}>
            <Text bold color="cyan">Main Instruction:</Text>
            <Box paddingY={0}>
              <Text color="white" wrap="wrap">
                {initialMainInstruction ? truncateWords(initialMainInstruction, 50) : <Text color="gray" italic>None. Tip: You can type your main instructional prompt in the AI input after closing.</Text>}
              </Text>
            </Box>
          </Box>

          <Box flexGrow={1} flexDirection="column" marginY={0}>
            {activeBlocks.length === 0 ? (
              <Box flexGrow={1} justifyContent="center" alignItems="center">
                <Text color="gray">Prompt is empty. Add blocks from [1] or [2].</Text>
              </Box>
            ) : (
              activeBlocks.map((b, i) => (
                <Box key={b.path} justifyContent="space-between">
                  <Text color={focusSection === 'ActiveStack' && i === selectedActiveIndex ? 'cyan' : (b.isGoal ? 'yellow' : 'white')} bold={i === selectedActiveIndex}>
                    {focusSection === 'ActiveStack' && i === selectedActiveIndex ? '▶ ' : '  '}
                    {b.isGoal ? '★ ' : '  '}{b.name} <Text color="gray">({b.category})</Text>
                  </Text>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>

      {/* Footer Instructions / Keyboard Shortcuts */}
      <Box marginTop={0} paddingX={1} flexDirection="column">
        <Box flexGrow={1}>
          {statusMessage ? (
            <Text color="green" bold>{statusMessage}</Text>
          ) : (
            <Text color="gray">
              [1-3] Focus
              {focusSection === 'Library' && ' | [s] Search | [Esc] Back'}
              {focusSection === 'ActiveStack' && activeBlocks.length > 0 && ' | [↑/↓] Navigate | [g] Toggle Goal | [d] Delete Block'}
              {' | [y] Copy | [c] Compile & Exit | [Ctrl+C] Quit'}
            </Text>
          )}
        </Box>
        <Text color="gray" dimColor>Path: {manager?.promptBuilderDir}</Text>
      </Box>
    </Box>
  );
};
