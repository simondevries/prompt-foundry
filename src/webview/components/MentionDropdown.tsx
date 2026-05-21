import React, { useEffect, useRef } from 'react';

export interface MentionResult {
    type: 'block' | 'file';
    name: string;
    category?: string;
    path: string;
    fullPath: string;
    label: string;
    icon: string;
}

interface MentionDropdownProps {
    results: MentionResult[];
    selectedIndex: number;
    onSelect: (result: MentionResult) => void;
    anchorElement: HTMLElement | null;
}

const MentionDropdown: React.FC<MentionDropdownProps> = ({ 
    results, 
    selectedIndex, 
    onSelect, 
    anchorElement 
}) => {
    const listRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
            itemRefs.current[selectedIndex]?.scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }, [selectedIndex]);

    if (results.length === 0 || !anchorElement) return null;

    const rect = anchorElement.getBoundingClientRect();

    return (
        <div 
            className="history-overlay show" 
            style={{ 
                position: 'fixed', 
                top: rect.bottom + 2, 
                left: rect.left,
                width: rect.width,
                maxWidth: '400px',
                margin: 0,
                display: 'block',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                border: '1px solid var(--vscode-widget-border)',
                zIndex: 2000
            }}
        >
            <div style={{ 
                padding: '6px 10px', 
                fontSize: '10px', 
                opacity: 0.5, 
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--vscode-widget-border)',
                background: 'var(--vscode-menu-background)',
                fontWeight: 'bold'
            }}>
                Files
            </div>
            <div ref={listRef} style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {results.map((result, index) => (
                    <div 
                        key={`${result.type}:${result.path}`}
                        ref={el => { itemRefs.current[index] = el; }}
                        className="history-item"
                        style={{
                            background: index === selectedIndex ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                            color: index === selectedIndex ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
                            padding: '6px 10px',
                            minHeight: 'auto',
                            borderBottom: 'none'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(result);
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <span className={`codicon codicon-${result.icon}`} style={{ fontSize: '14px', flexShrink: 0 }}></span>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                                <strong>{result.name}</strong>{result.path && ` - `}<span style={{ opacity: 0.7, fontSize: '10px' }}>{result.path}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MentionDropdown;
