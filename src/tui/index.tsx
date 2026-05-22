import React, { useState } from 'react';
import { render, Text, Box, useInput } from 'ink';
import clipboardy from 'clipboardy';
import MainInstruction from './components/MainInstruction.js';
import PromptBlocksPanel from './components/PromptBlocksPanel.js';
import { PromptCompiler } from '../core/promptCompiler.js';
import { SecureFileSystem } from '../core/fs.js';

// Simple TUI component to verify setup and core integration
const App = () => {
    const [instruction, setInstruction] = useState('');
    const [addedBlocks, setAddedBlocks] = useState([]);
    const [status, setStatus] = useState('');

    const compilePrompt = async () => {
        const fs = new SecureFileSystem(process.cwd());
        const compiler = new PromptCompiler(fs);
        
        // Convert UI state to PromptBlock structure required by compiler
        const blocks = addedBlocks.map(b => ({
            name: b.value,
            path: b.path || '', // Requires mapping path from value/metadata if available
            category: b.category,
            content: '', // Compiler will load content via FS
            isSpecial: false
        }));

        const fullPrompt = compiler.compilePrompt(instruction, blocks);
        await clipboardy.write(fullPrompt);
        setStatus('Prompt compiled and copied to clipboard!');
    };

    useInput((input, key) => {
        if (key.return) {
            compilePrompt();
        }
    });

    return (
        <Box flexDirection="column" padding={1}>
            <Text color="green">Prompt Forge TUI</Text>
            <MainInstruction onChange={setInstruction} />
            <Text>Added blocks: {addedBlocks.map(b => b.label).join(', ')}</Text>
            <PromptBlocksPanel onSelect={(block) => setAddedBlocks([...addedBlocks, block])} />
            <Text color="cyan">[Press ENTER to Compile]</Text>
            <Text color="yellow">{status}</Text>
        </Box>
    );
};

// [DEBUG] Rendering application
render(<App />);
