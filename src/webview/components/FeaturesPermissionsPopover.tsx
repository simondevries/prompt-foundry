import React, { useState } from 'react';

interface AccordionItem {
  id: string;
  title: string;
  icon: string;
  content: React.ReactNode;
}

interface FeaturesPermissionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  defaultExpanded?: string;
  items: AccordionItem[];
}

export const FeaturesPermissionsPopover: React.FC<FeaturesPermissionsPopoverProps> = ({ 
  isOpen, onClose, defaultExpanded, items 
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(defaultExpanded || null);

  React.useEffect(() => {
    setExpandedId(defaultExpanded || null);
  }, [defaultExpanded]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
        <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Features & Permissions</span>
          <span className="codicon codicon-close" onClick={onClose} style={{ cursor: 'pointer' }}></span>
        </div>
        
        <div style={{ marginTop: '16px' }}>
          {items.map(item => (
            <div key={item.id} style={{ border: '1px solid var(--vscode-widget-border)', borderRadius: '4px', marginBottom: '8px' }}>
              <div 
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                style={{ 
                  padding: '12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  cursor: 'pointer',
                  backgroundColor: 'var(--vscode-sideBar-background)'
                }}
              >
                <span className={`codicon codicon-${item.icon}`}></span>
                <span style={{ flexGrow: 1, fontWeight: 600 }}>{item.title}</span>
                <span className={`codicon codicon-chevron-${expandedId === item.id ? 'up' : 'down'}`}></span>
              </div>
              
              {expandedId === item.id && (
                <div style={{ padding: '16px', borderTop: '1px solid var(--vscode-widget-border)' }}>
                  {item.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
