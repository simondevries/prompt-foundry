import React from 'react';
import { Block } from '../types';

interface SuggestedBlockProps {
  suggestion: Block;
  onAdd: () => void;
  onNext: () => void;
}

const SuggestedBlock: React.FC<SuggestedBlockProps> = ({ suggestion, onAdd, onNext }) => {
  const style = suggestion.style;

  return (
    <div 
      className="active-block-item suggested-block" 
      onClick={(e) => { e.stopPropagation(); onAdd(); }}
      style={{ 
        opacity: 0.6, 
        marginBottom: '4px', 
        cursor: 'pointer',
        transition: 'none' 
      }}
    >
      <div 
        className="block-header" 
        style={{ 
          borderLeft: `2px solid ${style?.borderColor || 'var(--vscode-widget-border)'}`,
          borderStyle: 'dashed',
          borderWidth: '0 0 0 2px',
          padding: '2px 8px',
          minHeight: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div className="block-title" style={{ fontSize: '0.9em', gap: '4px' }}>
          <span className="icon codicon codicon-lightbulb" style={{ 
            color: 'var(--vscode-notificationsSuggest-foreground)',
            fontSize: '12px'
          }}></span> 
          <span style={{ fontWeight: 500 }}>{suggestion.name}</span>
          <span className="chip" style={{ 
            backgroundColor: style?.color, 
            opacity: 0.7,
            fontSize: '0.75em',
            padding: '0px 4px',
            borderRadius: '4px'
          }}>
            {suggestion.category}
          </span>
        </div>
        <div className="actions">
          <button 
            className="suggestion-btn next" 
            title="Show next suggestion"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--vscode-foreground)',
              border: 'none',
              borderRadius: '3px',
              padding: '2px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              marginRight: '8px',
              transition: 'background 0.2s'
            }}
          >
            <span>Next</span>
            <span className="codicon codicon-arrow-right" style={{ fontSize: '10px' }}></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestedBlock;
