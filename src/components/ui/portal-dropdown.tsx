import React, { useRef, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface PortalDropdownProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  align?: 'left' | 'right';
  direction?: 'down' | 'up';
  className?: string;
  minWidth?: number;
  matchTriggerWidth?: boolean;
}

export const PortalDropdown: React.FC<PortalDropdownProps> = ({
  open,
  onClose,
  triggerRef,
  children,
  align = 'left',
  direction = 'down',
  className = '',
  minWidth = 160,
  matchTriggerWidth = false,
}) => {
  const [pos, setPos] = useState<{ top: number; left: number; width?: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const top = direction === 'down' ? rect.bottom + 4 : rect.top - 4;
    const left = align === 'right' ? rect.right : rect.left;
    setPos({ top, left, width: matchTriggerWidth ? rect.width : undefined });
  }, [triggerRef, align, direction, matchTriggerWidth]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: direction === 'down' ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction === 'down' ? 8 : -8 }}
            transition={{ duration: 0.15 }}
            className={`fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto ${className}`}
            style={{
              top: direction === 'down' ? pos.top : undefined,
              bottom: direction === 'up' ? window.innerHeight - pos.top : undefined,
              left: align === 'left' ? pos.left : undefined,
              right: align === 'right' ? window.innerWidth - pos.left : undefined,
              minWidth,
              width: pos.width,
            }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
