import React from 'react';
import { IconButton } from './Common';

interface BannerProps {
  mode: 'info' | 'attention';
  message: string;
  ctaText?: string;
  onCtaClick?: () => void;
  onDismiss?: () => void;
  canClose?: boolean;
  style?: React.CSSProperties;
}

export const Banner: React.FC<BannerProps> = ({ 
  mode, 
  message, 
  ctaText, 
  onCtaClick, 
  onDismiss, 
  canClose = true,
  style
}) => {
  return (
    <div className={`banner banner-${mode}`} style={style}>
      <div style={{ flex: 1 }}>{message}</div>
      {ctaText && onCtaClick && (
        <button 
          className="banner-cta"
          onClick={onCtaClick}
        >
          {ctaText}
        </button>
      )}
      {canClose && onDismiss && (
        <IconButton 
          icon="close" 
          title="Dismiss" 
          onClick={onDismiss}
          style={{ color: 'inherit', padding: 0, width: '20px', height: '20px' }}
        />
      )}
    </div>
  );
};
