import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { PromptManager } from '../core/promptManager';
import { StyleManager } from '../core/styleManager';
import { SecureFileSystem } from '../core/fs';
import { DEFAULT_PROMPT_BUILDER_DIR } from '../core/constants';
import { PromptBlock, PromptLibraryCategory, Group } from '../core/interfaces';
import fs from 'fs';
import path from 'path';

interface AppProps {
  arg?: string;
}

type FocusSection = 'Library' | 'Groups' | 'ActiveStack';
type LeftView = 'Categories' | 'Blocks' | 'VariableInput' | 'Search';
type SearchFocus = 'input' | 'results';

export const App: React.FC<AppProps> = ({ arg }) => {
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
  const [searchFocusedElement, setSearchFocusedElement] = useState<SearchFocus>('input');
  
  // Focus index for Active Stack items (Section 3)
  const [selectedActiveIndex, setSelectedActiveIndex] = useState(0);

  // Liquid Variable Form State
  const [pendingBlock, setPendingBlock] = useState<{ category: string, name: string, content: string, vars: string[] } | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [currentVarIndex, setCurrentVarIndex] = useState(0);
  const [currentVarValue, setCurrentVarValue] = useState('');

  // External execution parameters
  const [tempFilePath, setTempFilePath] = useState<string | null>(null);
  const [initialMainInstruction, setInitialMainInstruction] = useState('');

  // 1. Initialize core managers
  useEffect(() => {
    let promptBuilderDir = DEFAULT_PROMPT_BUILDER_DIR;
    let tFilePath: string | null = null;
    let mainInstr = '';

    if (arg) {
      if (fs.existsSync(arg)) {
        const stats = fs.statSync(arg);
        if (stats.isFile()) {
          tFilePath = arg;
          mainInstr = fs.readFileSync(arg, 'utf8');
        } else if (stats.isDirectory()) {
          promptBuilderDir = arg;
        }
      }
    }

    setTempFilePath(tFilePath);
    setInitialMainInstruction(mainInstr);

    const sfs = new SecureFileSystem(promptBuilderDir);
    const styleManager = new StyleManager(promptBuilderDir, sfs);
    
    // Initialize without native watcher to prevent thread locks in TUI runs
    const pm = new PromptManager(promptBuilderDir, styleManager, sfs, undefined, false);
    
    if (mainInstr) {
      pm.updateMainInstruction(mainInstr);
    }
    
    setManager(pm);
    setCategories(pm.getPromptLibrary(true, true));
    setGroups(pm.getGroupLibrary());
    setActiveBlocks([...pm.activeBlocks]);
  }, [arg]);

  // Flattened blocks for search
  const allBlocks = useMemo(() => {
    const blocks: { label: string, value: { category: string, name: string } }[] = [];
    categories.forEach(cat => {
      cat.files.forEach(file => {
        blocks.push({ label: `[${cat.name}] ${file}`, value: { category: cat.name, name: file } });
      });
    });
    return blocks;
  }, [categories]);

  const filteredBlocks = useMemo(() => {
    if (!searchQuery) return [];
    return allBlocks.filter(b => b.label.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5);
  }, [allBlocks, searchQuery]);

  // Synchronize state with core Manager
  const refreshActiveBlocks = (pm: PromptManager) => {
    setActiveBlocks([...pm.activeBlocks]);
  };

  // 2. Action Handlers
  const handleSelectCategory = (item: { label: string, value: string }) => {
    const cat = categories.find(c => c.name === item.value);
    if (cat) {
      setSelectedCategory(cat);
      setLeftView('Blocks');
    }
  };

  const handleSelectBlock = (item: { label: string, value: { category: string, name: string } }) => {
    if (!manager) return;
    const { category, name } = item.value;
    try {
      const content = manager.getPromptBlockContent(category, name);
      const meta = manager.parseBlockMetadata(content);
      const vars = meta?.variables ? Object.keys(meta.variables) : [];

      if (vars.length > 0) {
        setPendingBlock({ category, name, content, vars });
        setVariableValues({});
        setCurrentVarIndex(0);
        setCurrentVarValue('');
        setLeftView('VariableInput');
      } else {
        manager.addActiveBlock(category, name);
        refreshActiveBlocks(manager);
      }
    } catch (e) {
      console.error('Failed to select block:', e);
    }
  };

  const handleSelectGroup = (item: { label: string, value: Group }) => {
    if (!manager) return;
    try {
      manager.addGroupToActiveBlocks(item.value);
      refreshActiveBlocks(manager);
      setFocusSection('ActiveStack');
    } catch (e) {
      console.error('Failed to select group:', e);
    }
  };

  const handleVariableSubmit = (value: string) => {
    if (!pendingBlock || !manager) return;
    const currentVar = pendingBlock.vars[currentVarIndex];
    const newValues = { ...variableValues, [currentVar]: value };
    setVariableValues(newValues);
    setCurrentVarValue('');

    if (currentVarIndex < pendingBlock.vars.length - 1) {
      setCurrentVarIndex(currentVarIndex + 1);
    } else {
      try {
        manager.addActiveBlock(pendingBlock.category, pendingBlock.name, newValues);
        refreshActiveBlocks(manager);
        setPendingBlock(null);
        setLeftView('Categories');
      } catch (e) {
        console.error('Failed to add block with variables:', e);
        setPendingBlock(null);
        setLeftView('Categories');
      }
    }
  };

  const handleToggleGoal = (index: number) => {
    if (!manager) return;
    const block = activeBlocks[index];
    if (block) {
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

  // Compile prompt and cleanly write to temp file or stdout
  const handleCompile = () => {
    if (!manager) return;
    try {
      const compiled = manager.compilePrompt();
      if (tempFilePath) {
        fs.writeFileSync(tempFilePath, compiled, 'utf8');
      } else {
        process.stdout.write(compiled);
      }
      setTimeout(() => exit(), 50);
    } catch (e) {
      console.error('Compilation failed:', e);
    }
  };

  // 3. Focus & Key Bindings
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();

    // Prevent navigation keys from firing during typing
    const isTyping = leftView === 'VariableInput' || (leftView === 'Search' && searchFocusedElement === 'input');

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
        setSearchFocusedElement('input');
        setLeftView('Search');
        setFocusSection('Library');
      }
      if (input === 'c') {
        handleCompile();
      }
    }

    // Active stack navigation
    if (focusSection === 'ActiveStack' && activeBlocks.length > 0) {
      if (key.upArrow) {
        setSelectedActiveIndex(prev => Math.max(0, prev - 1));
      }
      if (key.downArrow) {
        setSelectedActiveIndex(prev => Math.min(activeBlocks.length - 1, prev + 1));
      }
      if (input === 'x') {
        handleRemoveBlock(selectedActiveIndex);
      }
      if (input === 'g') {
        handleToggleGoal(selectedActiveIndex);
      }
    }

    // Search element navigation transition
    if (leftView === 'Search' && searchFocusedElement === 'input') {
      if (key.downArrow || key.return) {
        if (filteredBlocks.length > 0) {
          setSearchFocusedElement('results');
        }
      }
    }

    // Escape handles backing out
    if (key.escape) {
      if (leftView === 'Blocks') {
        setLeftView('Categories');
      } else if (leftView === 'VariableInput') {
        setPendingBlock(null);
        setLeftView('Categories');
      } else if (leftView === 'Search') {
        if (searchFocusedElement === 'results') {
          setSearchFocusedElement('input');
        } else {
          setLeftView('Categories');
        }
      }
    }
  });

  const compiledPreview = useMemo(() => {
    if (!manager) return '';
    try {
      return manager.compilePrompt();
    } catch {
      return '';
    }
  }, [activeBlocks, manager]);

  if (!manager) return <Text>Initializing Prompt Forge Backend...</Text>;

  return (
    <Box flexDirection="column" padding={1} height={24} width={100} borderStyle="round" borderColor="cyan">
      
      {/* Header Bar */}
      <Box justifyContent="space-between" paddingBottom={0} borderStyle="single" borderColor="cyan">
        <Text bold color="cyan">🔨 PROMPT FOUNDRY CLI</Text>
        <Box>
          <Text bg={focusSection === 'Library' ? 'green' : undefined} color={focusSection === 'Library' ? 'black' : 'white'}> [1] Library </Text>
          <Text bg={focusSection === 'Groups' ? 'green' : undefined} color={focusSection === 'Groups' ? 'black' : 'white'}> [2] Recipes </Text>
          <Text bg={focusSection === 'ActiveStack' ? 'green' : undefined} color={focusSection === 'ActiveStack' ? 'black' : 'white'}> [3] Stack ({activeBlocks.length}) </Text>
        </Box>
      </Box>

      {/* Main 2-Column Interface */}
      <Box flexGrow={1} flexDirection="row" marginTop={0}>
        
        {/* Left Column (50% Width) */}
        <Box width="50%" flexDirection="column" paddingRight={1}>
          
          {/* Section 1: Library Selector (70% height) */}
          <Box height="70%" borderStyle="single" borderColor={focusSection === 'Library' ? 'green' : 'gray'} flexDirection="column" paddingX={1}>
            {leftView === 'Categories' && (
              <Box flexDirection="column">
                <Text bold color="yellow">📁 Browse Categories</Text>
                <SelectInput 
                  items={categories.map(c => ({ label: ` ${c.name}`, value: c.name, key: c.name }))} 
                  onSelect={handleSelectCategory}
                  limit={4}
                />
              </Box>
            )}
            
            {leftView === 'Blocks' && selectedCategory && (
              <Box flexDirection="column">
                <Text bold color="yellow">📄 {selectedCategory.name}</Text>
                <SelectInput 
                  items={selectedCategory.files.map((f, idx) => ({ label: ` ${f}`, value: { category: selectedCategory.name, name: f }, key: `${selectedCategory.name}-${f}-${idx}` }))} 
                  onSelect={handleSelectBlock}
                  limit={4}
                />
                <Text color="gray" marginTop={0}>[Esc] Categories</Text>
              </Box>
            )}

            {leftView === 'VariableInput' && pendingBlock && (
              <Box flexDirection="column">
                <Text bold color="magenta">📝 Parameter: {pendingBlock.name}</Text>
                <Box marginTop={1}>
                  <Text>{pendingBlock.vars[currentVarIndex]}: </Text>
                  <TextInput 
                    value={currentVarValue} 
                    onChange={setCurrentVarValue}
                    onSubmit={handleVariableSubmit}
                  />
                </Box>
                <Text color="gray" marginTop={1}>({currentVarIndex + 1}/{pendingBlock.vars.length}) [Esc] Cancel</Text>
              </Box>
            )}

            {leftView === 'Search' && (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Text bold color="yellow">🔍 Query: </Text>
                  {searchFocusedElement === 'input' ? (
                    <TextInput value={searchQuery} onChange={setSearchQuery} />
                  ) : (
                    <Text color="green">{searchQuery || 'Type to search...'}</Text>
                  )}
                </Box>
                <Box marginTop={1}>
                  {searchFocusedElement === 'input' ? (
                    filteredBlocks.length === 0 ? (
                      <Text color="gray">No matches. Press Enter/Down to move.</Text>
                    ) : (
                      filteredBlocks.map((b, idx) => (
                        <Text key={idx} color="gray">  {b.label}</Text>
                      ))
                    )
                  ) : (
                    <SelectInput 
                      items={filteredBlocks.map((b, idx) => ({ ...b, key: `${b.value.category}-${b.value.name}-${idx}` }))} 
                      onSelect={handleSelectBlock}
                      limit={3}
                    />
                  )}
                </Box>
                {searchFocusedElement === 'results' && <Text color="gray">[Esc] Back to typing</Text>}
              </Box>
            )}
          </Box>

          {/* Section 2: Recipes Selector (30% height) */}
          <Box height="30%" borderStyle="double" borderColor={focusSection === 'Groups' ? 'green' : 'gray'} flexDirection="column" paddingX={1}>
            <Text bold color="yellow">⭐ Recipe Groups</Text>
            {focusSection === 'Groups' ? (
              groups.length === 0 ? <Text color="gray">No groups defined.</Text> : (
                <SelectInput 
                  items={groups.map((g, idx) => ({ label: ` ${g.name}`, value: g, key: `${g.name}-${idx}` }))} 
                  onSelect={handleSelectGroup}
                  limit={1}
                />
              )
            ) : (
              <Text color="gray">Press [2] to load groups</Text>
            )}
          </Box>
        </Box>

        {/* Right Column (50% Width) - Section 3: Active Stack & Live Compiler Preview */}
        <Box width="50%" flexDirection="column" paddingLeft={1}>
          
          {/* Active stack panel (45% height) */}
          <Box height="45%" borderStyle="single" borderColor={focusSection === 'ActiveStack' ? 'green' : 'gray'} flexDirection="column" paddingX={1}>
            <Text bold color="yellow">⚡ Active Prompt Stack</Text>
            <Box height={3} flexDirection="column">
              {activeBlocks.length === 0 ? (
                <Text color="gray"> Stack is currently empty.</Text>
              ) : (
                activeBlocks.slice(0, 3).map((b, i) => {
                  const isSelected = focusSection === 'ActiveStack' && i === selectedActiveIndex;
                  return (
                    <Text key={`${b.path}-${i}`} color={isSelected ? 'cyan' : 'white'} bold={isSelected} wrap="truncate-end">
                      {isSelected ? '▶' : ' '} {b.isGoal ? '★' : ' '} {b.name} <Text color="gray">({b.category})</Text>
                    </Text>
                  );
                })
              )}
              {activeBlocks.length > 3 && (
                <Text color="gray"> ...and {activeBlocks.length - 3} more blocks</Text>
              )}
            </Box>
          </Box>

          {/* Live Preview panel (55% height) */}
          <Box height="55%" borderStyle="classic" borderColor="gray" paddingX={1} flexDirection="column">
            <Text bold color="cyan">Live Render Preview:</Text>
            <Text color="gray" wrap="truncate-end" height={1}>
              {initialMainInstruction ? `[Main Instruction]: ${initialMainInstruction.replace(/\n/g, ' ')}` : '[Main Instruction]: blank'}
            </Text>
            <Text color="green" wrap="truncate-end" height={2}>
              {compiledPreview ? compiledPreview : '(Select blocks to compile preview)'}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Footer Instructions / Keyboard Shortcuts */}
      <Box marginTop={0} paddingX={1} borderStyle="classic" borderColor="gray">
        <Text color="gray">
          [1-3] Focus Panel | [s] Search | [Esc] Back | [g] Star Goal | [x] Delete | [c] Compile & Exit
        </Text>
      </Box>
    </Box>
  );
};
