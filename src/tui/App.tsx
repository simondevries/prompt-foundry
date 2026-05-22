import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import clipboardy from 'clipboardy';
import { PromptCompiler } from '../core/promptCompiler';
import { SecureFileSystem } from '../core/fs';
import { PromptBlock } from '../core/interfaces';
import { DEFAULT_PROMPT_BUILDER_DIR, EXCLUDED_FOLDERS } from '../core/constants';
import path from 'path';

export const App = () => {
    const [mainInstruction, setMainInstruction] = useState('');
    const [availableBlocks, setAvailableBlocks] = useState<PromptBlock[]>([]);
    const [activeBlocks, setActiveBlocks] = useState<PromptBlock[]>([]);
    const [focused, setFocused] = useState<'instruction' | 'blocks'>('instruction');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [status, setStatus] = useState('Use Arrows to navigate, "x" to toggle, Enter to compile.');

    useEffect(() => {
        const libraryPath = DEFAULT_PROMPT_BUILDER_DIR;
        const fs = new SecureFileSystem(libraryPath);
        
        const scanDir = (dir: string, category: string) => {
            let found: PromptBlock[] = [];
            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                for (const item of items) {
                    if (item.isDirectory()) {
                        if (!EXCLUDED_FOLDERS.includes(item.name)) {
                            found = found.concat(scanDir(path.join(dir, item.name), item.name));
                        }
                    } else if (item.name.endsWith('.md')) {
                        found.push({
                            category,
                            name: item.name.replace('.md', ''),
                            path: path.join(dir, item.name)
                        });
                    }
                }
            } catch (e) {
                // Ignore errors
            }
            return found;
        };

        const blocks = scanDir(libraryPath, 'Library');
        setAvailableBlocks(blocks);
    }, []);

    useInput((input, key) => {
        if (key.downArrow && focused === 'instruction') setFocused('blocks');
        if (key.upArrow && focused === 'blocks') setFocused('instruction');
        
        if (focused === 'blocks') {
            if (key.upArrow && selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
            if (key.downArrow && selectedIndex < availableBlocks.length - 1) setSelectedIndex(selectedIndex + 1);
            if (input === 'x' && availableBlocks.length > 0) {
                const block = availableBlocks[selectedIndex];
                if (activeBlocks.find(b => b.path === block.path)) {
                    setActiveBlocks(activeBlocks.filter(b => b.path !== block.path));
                } else {
                    setActiveBlocks([...activeBlocks, block]);
                }
            }
        }

        if (key.return) {
            handleCompile();
        }
    });

    const handleCompile = () => {
        try {
            const fs = new SecureFileSystem(DEFAULT_PROMPT_BUILDER_DIR);
            const compiler = new PromptCompiler(fs);
            const compiled = compiler.compilePrompt(mainInstruction, activeBlocks);
            clipboardy.writeSync(compiled);
            setStatus('Compiled & Copied to clipboard!');
        } catch (e) {
            setStatus('Error: ' + (e as Error).message);
        }
    };

    return (
        <Box flexDirection="column" padding={1} borderStyle="round">
            <Text bold>Prompt Forge TUI</Text>
            <Text>{status}</Text>
            
            <Box marginTop={1} flexDirection="column">
                <Text color={focused === 'instruction' ? 'green' : undefined}>
                    {focused === 'instruction' ? '> ' : '  '}Main Instruction:
                </Text>
                {focused === 'instruction' && (
                    <TextInput value={mainInstruction} onChange={setMainInstruction} />
                )}
            </Box>

            <Box marginTop={1} flexDirection="column">
                <Text bold color={focused === 'blocks' ? 'green' : undefined}>
                    {focused === 'blocks' ? '> ' : '  '}Library Blocks (Arrows to select, "x" to toggle, Enter to compile):
                </Text>
                {availableBlocks.map((b, i) => (
                    <Text key={i} dimColor={focused !== 'blocks'}>
                        {focused === 'blocks' && i === selectedIndex ? '  -> ' : '     '}
                        {activeBlocks.find(ab => ab.path === b.path) ? '[x]' : '[ ]'} {b.category}: {b.name}
                    </Text>
                ))}
            </Box>
        </Box>
    );
};
