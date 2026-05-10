export interface TagRange {
    start: number;
    end: number;
}

export interface SelectionChangedParams {
    currentText: string;
    path: string;
    lines: string; // e.g. "10-20" or ""
    caretPos: number;
    activeTag: TagRange | null;
    fileMap: Record<string, string>;
    collidedNames: Record<string, boolean>;
    autoTagCount: number; // Add this
}

export interface SelectionChangedResult {
    newText: string;
    newActiveTag: TagRange | null;
    newCaretPos: number;
    fileMap: Record<string, string>;
    collidedNames: Record<string, boolean>;
    wasInserted: boolean; // Add this
}

/**
 * Pure logic for handling a selection change from the IDE.
 * Decides whether to update an existing tag or insert a new one.
 */
export function handleSelectionChange(params: SelectionChangedParams): SelectionChangedResult {
    const { currentText, path: finalPath, lines, caretPos, activeTag, fileMap, collidedNames, autoTagCount } = params;
    
    // Rule: if no valid caret position (never clicked/focused), do nothing.
    if (caretPos < 0) {
        return {
            newText: currentText,
            newActiveTag: activeTag,
            newCaretPos: caretPos,
            fileMap,
            collidedNames,
            wasInserted: false
        };
    }
    
    let newText = currentText;
    let newFileMap = { ...fileMap };
    let newCollidedNames = { ...collidedNames };
    
    const hasSelection = !!lines;
    const fileName = finalPath.split(/[/\\]/).pop() || finalPath;
    
    let tagKey = fileName;

    // Handle name collisions (promotion to full path)
    if (newCollidedNames[fileName] || finalPath === fileName) {
        tagKey = finalPath;
    } else if (newFileMap[fileName] && newFileMap[fileName] !== finalPath) {
        const oldPath = newFileMap[fileName];
        delete newFileMap[fileName];
        newCollidedNames[fileName] = true;
        const oldEscaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const oldRegex = new RegExp(`\\[@${oldEscaped}(#[0-9-]+)?\\] `, 'g');
        newText = newText.replace(oldRegex, `[@${oldPath}$1] `);
        tagKey = finalPath;
    } else {
        newFileMap[fileName] = finalPath;
    }

    const tagPath = tagKey.includes(' ') ? `"${tagKey}"` : tagKey;
    const lineSuffix = hasSelection ? `#${lines}` : '';
    const newTagText = `[@${tagPath}${lineSuffix}] `;
    
    const escapedTagPath = tagPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingTagRegex = new RegExp(`\\[@${escapedTagPath}(#[0-9-]+)?\\] `, 'g');

    let matchToUpdate = null;
    let currentActiveTag = activeTag;
    let currentCaretPos = caretPos;

    // 1. Check if the currently active tag matches this file
    if (currentActiveTag) {
        const tagAtPos = newText.substring(currentActiveTag.start, currentActiveTag.end);
        if (tagAtPos.startsWith(`[@${tagPath}`) && tagAtPos.endsWith('] ')) {
            matchToUpdate = {
                start: currentActiveTag.start,
                end: currentActiveTag.end
            };
        }
    }

    // 2. If not, check if any tag for this file exists at the current caret position
    if (!matchToUpdate) {
        const matches = Array.from(newText.matchAll(existingTagRegex));
        const matchAtCaret = matches.find(m => {
            const start = m.index!;
            const end = start + m[0].length;
            return currentCaretPos >= start && currentCaretPos <= end;
        });
        
        if (matchAtCaret) {
            matchToUpdate = {
                start: matchAtCaret.index!,
                end: matchAtCaret.index! + matchAtCaret[0].length
            };
        }
    }

    if (matchToUpdate) {
        const oldLength = matchToUpdate.end - matchToUpdate.start;
        const newLength = newTagText.length;
        const diff = newLength - oldLength;

        newText = newText.substring(0, matchToUpdate.start) + newTagText + newText.substring(matchToUpdate.end);
        const updatedActiveTag = { start: matchToUpdate.start, end: matchToUpdate.start + newLength };
        
        if (currentCaretPos > matchToUpdate.end) {
            currentCaretPos += diff;
        } else if (currentCaretPos >= matchToUpdate.start) {
            currentCaretPos = updatedActiveTag.end;
        }

        return {
            newText,
            newActiveTag: updatedActiveTag,
            newCaretPos: currentCaretPos,
            fileMap: newFileMap,
            collidedNames: newCollidedNames,
            wasInserted: false
        };
    } else {
        // Insert fresh - BUT only if we haven't hit the limit
        if (autoTagCount >= 4) {
            return {
                newText: currentText,
                newActiveTag: activeTag,
                newCaretPos: caretPos,
                fileMap: newFileMap,
                collidedNames: newCollidedNames,
                wasInserted: false
            };
        }

        const insertAt = currentCaretPos;
        let prefix = "";
        if (insertAt > 0 && !/\s/.test(newText[insertAt - 1])) {
            prefix = " ";
        }

        const before = newText.substring(0, insertAt);
        const after = newText.substring(insertAt);
        const finalTagText = prefix + newTagText;
        newText = before + finalTagText + after;
        
        const newTagStart = insertAt + prefix.length;
        const newTagEnd = newTagStart + newTagText.length;

        return {
            newText,
            newActiveTag: { start: newTagStart, end: newTagEnd },
            newCaretPos: newTagEnd,
            fileMap: newFileMap,
            collidedNames: newCollidedNames,
            wasInserted: true
        };
    }
}
