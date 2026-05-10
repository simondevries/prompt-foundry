import test from 'node:test';
import assert from 'node:assert';
import { handleSelectionChange } from './tagLogic.js';

test('Tag Logic: handleSelectionChange', async (t) => {
    
    await t.test('when i place caret it adds a tag (initial insertion)', () => {
        const result = handleSelectionChange({
            currentText: '',
            path: 'file.ts',
            lines: '',
            caretPos: 0,
            activeTag: null,
            fileMap: {},
            collidedNames: {},
            autoTagCount: 0
        });
        
        assert.strictEqual(result.newText, '[@file.ts] ');
        assert.deepStrictEqual(result.newActiveTag, { start: 0, end: 11 });
        assert.strictEqual(result.newCaretPos, 11);
        assert.strictEqual(result.wasInserted, true);
    });

    await t.test('when i place caret and select text it updates a tag', () => {
        const initial = handleSelectionChange({
            currentText: '',
            path: 'file.ts',
            lines: '',
            caretPos: 0,
            activeTag: null,
            fileMap: {},
            collidedNames: {},
            autoTagCount: 0
        });
        
        const result = handleSelectionChange({
            currentText: initial.newText,
            path: 'file.ts',
            lines: '1-10',
            caretPos: initial.newCaretPos,
            activeTag: initial.newActiveTag,
            fileMap: initial.fileMap,
            collidedNames: initial.collidedNames,
            autoTagCount: 1
        });
        
        assert.strictEqual(result.newText, '[@file.ts#1-10] ');
        assert.deepStrictEqual(result.newActiveTag, { start: 0, end: 16 });
        assert.strictEqual(result.wasInserted, false);
    });

    await t.test('a tag is active if the caret is in the tag', () => {
        const text = 'Some text [@file.ts] more text';
        const caretPos = 15; 
        
        const result = handleSelectionChange({
            currentText: text,
            path: 'file.ts',
            lines: '5-5',
            caretPos: caretPos,
            activeTag: null,
            fileMap: { 'file.ts': 'file.ts' },
            collidedNames: {},
            autoTagCount: 0
        });
        
        assert.strictEqual(result.newText, 'Some text [@file.ts#5-5] more text');
    });

    await t.test('adds a new tag if caret is elsewhere even if file exists earlier', () => {
        const text = '[@file.ts] some instruction ';
        const caretPos = text.length; 
        
        const result = handleSelectionChange({
            currentText: text,
            path: 'file.ts',
            lines: '10-20',
            caretPos: caretPos,
            activeTag: null,
            fileMap: { 'file.ts': 'file.ts' },
            collidedNames: {},
            autoTagCount: 1
        });
        
        assert.strictEqual(result.newText, '[@file.ts] some instruction [@file.ts#10-20] ');
        assert.strictEqual(result.wasInserted, true);
    });

    await t.test('adds a second tag at the end when caret is at the end even if file exists at start', () => {
        const text = '[@server.ts#87-91] [@"Highway env highway.md"#6-11] [@"Do preliminary research.md"#9-16] test';
        const caretPos = text.length; 
        
        const result = handleSelectionChange({
            currentText: text,
            path: 'src/mcp/server.ts', 
            lines: '90-95',
            caretPos: caretPos,
            activeTag: null,
            fileMap: { 
                'server.ts': 'src/mcp/server.ts', 
                'Highway env highway.md': 'path/to/Highway env highway.md', 
                'Do preliminary research.md': 'path/to/Do preliminary research.md' 
            },
            collidedNames: {},
            autoTagCount: 3
        });
        
        const expected = text + ' [@server.ts#90-95] ';
        assert.strictEqual(result.newText, expected);
        assert.strictEqual(result.wasInserted, true);
    });

    await t.test('circuit breaker: stops adding new tags after 4 in a row', () => {
        const text = '[@1] [@2] [@3] [@4] ';
        const caretPos = text.length;
        
        const result = handleSelectionChange({
            currentText: text,
            path: 'file5.ts',
            lines: '',
            caretPos: caretPos,
            activeTag: null,
            fileMap: {},
            collidedNames: {},
            autoTagCount: 4 
        });
        
        assert.strictEqual(result.newText, text);
        assert.strictEqual(result.wasInserted, false);
    });

    await t.test('circuit breaker: still allows updates even if limit hit', () => {
        const text = '[@file1.ts] [@2] [@3] [@4] ';
        const caretPos = 4; // inside [@file1.ts]
        
        const result = handleSelectionChange({
            currentText: text,
            path: 'file1.ts',
            lines: '10-20',
            caretPos: caretPos,
            activeTag: null,
            fileMap: { 'file1.ts': 'file1.ts' },
            collidedNames: {},
            autoTagCount: 4 
        });
        
        // Should STILL update [@file1.ts]
        assert.strictEqual(result.newText, '[@file1.ts#10-20] [@2] [@3] [@4] ');
        assert.strictEqual(result.wasInserted, false);
    });
});
