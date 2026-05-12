import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width?: number;
    effectiveDirection: 'down' | 'up';
    maxHeight: number;
  }>({ top: 0, left: 0, effectiveDirection: 'down', maxHeight: 240 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PADDING = 8;
    const MAX_DESIRED_HEIGHT = 240; // matches max-h-60

    // Decide direction: prefer the requested one; flip if there isn't enough
    // room. "Enough" = at least 160px so the dropdown isn't a tiny sliver.
    const spaceBelow = vh - rect.bottom - PADDING;
    const spaceAbove = rect.top - PADDING;
    let effectiveDirection: 'down' | 'up' = direction;
    if (direction === 'down' && spaceBelow < 160 && spaceAbove > spaceBelow) {
      effectiveDirection = 'up';
    } else if (direction === 'up' && spaceAbove < 160 && spaceBelow > spaceAbove) {
      effectiveDirection = 'down';
    }
    const availableHeight = effectiveDirection === 'down' ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(160, Math.min(MAX_DESIRED_HEIGHT, availableHeight));

    const top = effectiveDirection === 'down' ? rect.bottom + 4 : rect.top - 4;

    // Horizontal: clamp so the dropdown stays inside the viewport even when
    // the trigger is near the edge.
    const desiredWidth = matchTriggerWidth ? rect.width : Math.max(minWidth, rect.width);
    let left = align === 'right' ? rect.right : rect.left;
    if (align === 'left') {
      const overflowRight = left + desiredWidth - (vw - PADDING);
      if (overflowRight > 0) left = Math.max(PADDING, left - overflowRight);
    } else {
      const overflowLeft = (left - desiredWidth) - PADDING;
      if (overflowLeft < 0) left = Math.min(vw - PADDING, left - overflowLeft);
    }

    setPos({
      top,
      left,
      width: matchTriggerWidth ? rect.width : undefined,
      effectiveDirection,
      maxHeight,
    });
  }, [triggerRef, align, direction, matchTriggerWidth, minWidth]);

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

  // Close on outside mousedown — does NOT block clicks from reaching other elements
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking inside the dropdown itself
      if (dropdownRef.current?.contains(target)) return;
      // Don't close if clicking inside the trigger
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    // Use mousedown so the click still propagates to the target element
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [open, onClose, triggerRef]);

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: pos.effectiveDirection === 'down' ? 8 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: pos.effectiveDirection === 'down' ? 8 : -8 }}
          transition={{ duration: 0.15 }}
          className={`fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg py-1 overflow-y-auto ${className}`}
          style={{
            top: pos.effectiveDirection === 'down' ? pos.top : undefined,
            bottom: pos.effectiveDirection === 'up' ? window.innerHeight - pos.top : undefined,
            left: align === 'left' ? pos.left : undefined,
            right: align === 'right' ? window.innerWidth - pos.left : undefined,
            minWidth,
            width: pos.width,
            maxHeight: pos.maxHeight,
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
