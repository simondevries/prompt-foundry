import React from 'react';

interface SectionHeaderProps {
  title: string;
  children?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, children }) => (
  <div className="section-header">
    <span>{title}</span>
    <div className="header-icons">
      {children}
    </div>
  </div>
);

interface IconButtonProps {
  id?: string;
  icon: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const IconButton: React.FC<IconButtonProps> = ({ id, icon, title, onClick, className = '', style }) => (
  <button 
    id={id}
    className={`icon-btn ${className}`} 
    title={title} 
    onClick={onClick}
    style={style}
  >
    <span className={`codicon codicon-${icon}`} aria-hidden="true"></span>
  </button>
);
