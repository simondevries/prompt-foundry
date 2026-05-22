import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import * as path from 'path';
import { LibraryManager } from '../../core/libraryManager.js';
import { StyleManager } from '../../core/styleManager.js';
import { SecureFileSystem } from '../../core/fs.js';

const PromptBlocksPanel = ({ onSelect }) => {
    const [blocks, setBlocks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initialize Core classes for CLI
        const rootDir = process.cwd();
        const fs = new SecureFileSystem(rootDir);
        const styleManager = new StyleManager(rootDir, fs);
        // Assuming current directory is the prompt library for now
        const libraryManager = new LibraryManager(rootDir, styleManager, fs);

        try {
            const categories = libraryManager.getPromptLibrary();
            const allBlocks = categories.flatMap(cat => 
                cat.files.map(file => ({
                    label: `${cat.name} / ${file}`,
                    value: file,
                    category: cat.name,
                    path: path.join(cat.path, file)
                }))
            );
            setBlocks(allBlocks);
        } catch (error) {
            console.error('Error loading library:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    if (loading) return <Text>Loading blocks from filesystem...</Text>;
    if (blocks.length === 0) return <Text>No blocks found.</Text>;

    return (
        <Box flexDirection="column">
            <Text>Select a block to add:</Text>
            <SelectInput 
                items={blocks} 
                onSelect={(item) => {
                    onSelect(item);
                }} 
            />
        </Box>
    );
};

export default PromptBlocksPanel;
