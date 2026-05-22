import React, { useEffect, useRef } from 'react';

export interface CommandResult {
    type: 'block' | 'file' | 'action';
    name: string;
    category?: string;
    path?: string;
    fullPath?: string;
    label: string;
    icon: string;
}

interface CommandDropdownProps {
    results: CommandResult[];
    selectedIndex: number;
    onSelect: (result: CommandResult) => void;
    anchorElement: HTMLElement | null;
    title: string;
}

const CommandDropdown: React.FC<CommandDropdownProps> = ({ 
    results, 
    selectedIndex, 
    onSelect, 
    anchorElement,
    title
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
                zIndex: 2000,
                backgroundColor: 'var(--vscode-menu-background)',
                color: 'var(--vscode-menu-foreground)',
                borderRadius: '4px',
                overflow: 'hidden'
            }}
        >
            <div style={{ 
                padding: '6px 10px', 
                fontSize: '10px', 
                opacity: 0.5, 
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--vscode-widget-border)',
                background: 'var(--vscode-menu-background)',
                fontWeight: 'bold',
                letterSpacing: '0.5px'
            }}>
                {title}
            </div>
            <div ref={listRef} style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {results.map((result, index) => (
                    <div 
                        key={`${result.type}:${result.name}:${result.path || ''}:${index}`}
                        ref={el => { itemRefs.current[index] = el; }}
                        className="history-item"
                        style={{
                            background: index === selectedIndex ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                            color: index === selectedIndex ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
                            padding: '6px 10px',
                            minHeight: 'auto',
                            borderBottom: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            textAlign: 'left'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(result);
                        }}
                    >
                        <span className={`codicon codicon-${result.icon}`} style={{ fontSize: '14px', flexShrink: 0, opacity: index === selectedIndex ? 1 : 0.7 }}></span>
                        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', textAlign: 'left' }}>
                            <strong style={{ fontWeight: 600 }}>{result.label}</strong>
                            {result.path && (
                                <span style={{ opacity: 0.5, fontSize: '10px', marginLeft: '6px' }}>{result.path}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CommandDropdown;
