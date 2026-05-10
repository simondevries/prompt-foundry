import React, { useState, useRef, useEffect } from 'react';

interface SplitButtonProps {
  primaryAction: {
    label: string;
    icon?: string;
    onClick: () => void;
  };
  secondaryActions: Array<{
    id: string;
    label: string;
    icon?: string;
    onClick: () => void;
  }>;
}

export const SplitButton: React.FC<SplitButtonProps> = ({ primaryAction, secondaryActions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="split-button" ref={dropdownRef}>
      <button 
        className="main-btn" 
        onClick={primaryAction.onClick}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        {primaryAction.icon && <span className={`codicon codicon-${primaryAction.icon}`}></span>}
        {primaryAction.label}
      </button>
      <button 
        className="split-button-arrow" 
        onClick={() => setIsOpen(!isOpen)}
        title="More Actions"
      >
        <span className={`codicon codicon-chevron-${isOpen ? 'down' : 'up'}`}></span>
      </button>

      {isOpen && (
        <div className="split-dropdown">
          {secondaryActions.map(action => (
            <div 
              key={action.id} 
              className="split-dropdown-item" 
              onClick={() => {
                action.onClick();
                setIsOpen(false);
              }}
            >
              {action.icon && <span className={`codicon codicon-${action.icon}`}></span>}
              {action.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
