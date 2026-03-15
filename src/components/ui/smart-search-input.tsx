import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Input } from './input';
import { PortalDropdown } from './portal-dropdown';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

interface SmartSearchInputProps {
  value: string | string[];
  onChange: (value: any) => void;
  options: string[];
  placeholder?: string;
  multiSelect?: boolean;
  className?: string;
  onEnterCustom?: (value: string) => void;
}

export const SmartSearchInput: React.FC<SmartSearchInputProps> = ({
  value,
  onChange,
  options,
  placeholder = "Search or type custom...",
  multiSelect = false,
  className = "",
}) => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const values = Array.isArray(value) ? value : [value].filter(Boolean);

  const filteredOptions = useMemo(() => {
    return options.filter(opt => 
      opt.toLowerCase().includes(search.toLowerCase()) && 
      !values.includes(opt)
    );
  }, [options, search, values]);

  // Sync the `search` state directly with `value` if it updates externally without typing
  // This solves Bug 1: AI SUGGESTIONS APPEAR BUT NEVER APPLY TO FIELDS
  useEffect(() => {
    if (!multiSelect && typeof value === 'string' && value !== undefined) {
      setSearch(value);
    }
  }, [value, multiSelect]);

  const handleSelect = (val: string) => {
    if (multiSelect) {
      if (!values.includes(val)) {
        onChange([...values, val]);
      }
    } else {
      onChange(val);
      setIsOpen(false);
    }
    setSearch("");
  };

  const handleRemove = (val: string) => {
    if (multiSelect) {
      onChange(values.filter(v => v !== val));
    } else {
      onChange("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      handleSelect(search.trim());
    } else if (e.key === 'Backspace' && !search && values.length > 0) {
      handleRemove(values[values.length - 1]);
    }
  };

  return (
    <div className={cn("space-y-2", className)} ref={containerRef}>
      {multiSelect && values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.map(v => (
            <Badge 
              key={v} 
              variant="secondary" 
              className="bg-primary/20 text-primary border-primary/30 flex items-center gap-1 pr-1"
            >
              {v}
              <button 
                onClick={() => handleRemove(v)} 
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={multiSelect ? (values.length === 0 ? placeholder : "Add more...") : ((value as string) || placeholder)}
          className="bg-input border-border pr-10"
        />
        <ChevronDown 
          className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )} 
        />
        
        <PortalDropdown 
          open={isOpen && (filteredOptions.length > 0 || search.trim().length > 0)} 
          onClose={() => setIsOpen(false)} 
          triggerRef={containerRef as React.RefObject<HTMLElement>} 
          matchTriggerWidth
        >
          <div className="py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.slice(0, 10).map(opt => (
                <button
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  className="w-full text-left px-4 py-2 hover:bg-secondary transition-smooth text-foreground text-sm"
                >
                  {opt}
                </button>
              ))
            ) : search.trim() ? (
              <button
                onClick={() => handleSelect(search.trim())}
                className="w-full text-left px-4 py-2 hover:bg-secondary transition-smooth text-primary text-sm flex items-center gap-2"
              >
                <span>Add custom:</span>
                <span className="font-semibold italic">"{search.trim()}"</span>
              </button>
            ) : null}
          </div>
        </PortalDropdown>
      </div>
    </div>
  );
};
