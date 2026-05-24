import React, { useState } from 'react';
import { IconButton } from '../components/Common';
import { Block } from '../types';

interface ActiveBlockProps {
  block: Block;
  onEdit: (path: string) => void;
  onRemove: (path: string) => void;
  onToggleGoal: (path: string) => void;
  onEditReference: (path: string) => void;
  currentGoalCount: number;
}

const ActiveBlock: React.FC<ActiveBlockProps> = ({ block, onEdit, onRemove, onToggleGoal, onEditReference, currentGoalCount }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMaxError, setShowMaxError] = useState(false);
  
  const isGroupMainPrompt = block.path.startsWith("group:");
  const blockCategory = isGroupMainPrompt ? "Group" : block.category;
  const style = isGroupMainPrompt
    ? {
        emoji: "",
        color: "hsla(200, 70%, 50%, 0.05)",
        borderColor: "hsla(200, 70%, 40%, 0.3)",
      }
    : block.style;

  return (
    <div className="active-block-item">
      <div 
        className={`collapsible block-collapsible ${isOpen ? 'active' : ''}`} 
        style={{ borderLeft: `3px solid ${style?.borderColor}` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="block-header">
          <div className="block-title">
            <span className={`icon codicon codicon-chevron-${isOpen ? 'down' : 'right'}`}></span> 
            {block.name.includes('/') ? block.name.split('/').pop() : block.name}
            <span className="chip" style={{ 
              backgroundColor: style?.color, 
              border: `1px solid ${style?.borderColor}` 
            }}>
              {blockCategory}
            </span>
            {block.hasGoal && (
              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                <span 
                  className={`icon codicon codicon-references`}
                  title="Set or edit the workflow reference for this block"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditReference(block.path);
                  }}
                  style={{ 
                    marginLeft: '8px', 
                    fontSize: '12px',
                    color: block.reference ? '#3794ef' : 'inherit',
                    cursor: 'pointer',
                    opacity: block.reference ? 1 : 0.4
                  }}
                ></span>
                <span 
                  className={`icon codicon codicon-star-${block.isGoal ? 'full' : 'empty'}`}
                  title="Add this to the prompts key goals to signal important blocks"
                  onClick={(e) => {
                    e.stopPropagation();
                    const willBeGoal = !block.isGoal;
                    if (willBeGoal) {
                      if (currentGoalCount >= 5) {
                        setShowMaxError(true);
                        setTimeout(() => setShowMaxError(false), 2000);
                        return;
                      }
                      
                      // Only show immediate feedback if it won't open a modal
                      if (block.reference) {
                        setShowFeedback(true);
                        setTimeout(() => setShowFeedback(false), 2000);
                      }
                    }
                    onToggleGoal(block.path);
                  }}
                  style={{ 
                    marginLeft: '8px', 
                    fontSize: '12px',
                    color: block.isGoal ? '#FFD700' : 'inherit',
                    cursor: 'pointer',
                    opacity: block.isGoal ? 1 : 0.4
                  }}
                ></span>
                {showFeedback && (
                  <span style={{ 
                    fontSize: '10px', 
                    marginLeft: '4px', 
                    color: '#FFD700',
                    animation: 'fadeIn 0.2s'
                  }}>
                    Goal added
                  </span>
                )}
                {showMaxError && (
                  <span style={{ 
                    fontSize: '10px', 
                    marginLeft: '4px', 
                    color: '#f48771',
                    animation: 'fadeIn 0.2s'
                  }}>
                    Max goals reached
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="actions">
            {!block.isSpecial && (
              <IconButton 
                icon="edit" 
                title="Edit" 
                onClick={(e) => { e.stopPropagation(); onEdit(block.path); }} 
                className="edit-block-btn" 
              />
            )}
            <IconButton 
              icon="close" 
              title="Remove" 
              onClick={(e) => { e.stopPropagation(); onRemove(block.path); }} 
              className="remove-block-btn" 
            />
          </div>
        </div>
      </div>
      <div className={`collapsible-content ${isOpen ? 'show' : ''}`}>
        <div className="block-content-preview">
          {block.content || <em>(Empty or failed to load)</em>}
        </div>
      </div>
    </div>
  );
};

export default ActiveBlock;
