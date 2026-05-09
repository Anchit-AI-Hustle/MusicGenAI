import React, { useState, useRef, useMemo } from 'react';
import { ChevronDown, X } from 'lucide-react';
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
<<<<<<< Updated upstream
  /** Hide the trailing chevron (e.g. when used inline). */
  hideChevron?: boolean;
  /** Allow typing a value not in `options` and pressing Enter to commit. */
=======
  hideChevron?: boolean;
>>>>>>> Stashed changes
  allowCustom?: boolean;
}

/**
<<<<<<< Updated upstream
 * Combo-box style autocomplete.
 *
 * UX rules — match user expectation, do not deviate:
 *   1. Clicking the input opens the dropdown showing **all** options (minus
 *      anything already selected in multi-select mode).
 *   2. Typing the first letter immediately filters the dropdown by substring
 *      match. Empty search = show everything.
 *   3. The user's current selection is shown as the input *placeholder*
 *      (single-select) or as chips above (multi-select). The search field
 *      is the **query**, never the value — so clicking never wipes context
 *      and typing never has to clear a pre-filled value first.
 *   4. Selecting closes the dropdown (single-select) or clears the search
 *      and stays open (multi-select). Pressing Enter on a non-matching
 *      query commits a custom value when `allowCustom` is true.
=======
 * Combo-box autocomplete.
 *
 * Rules:
 *   1. Click / focus opens the dropdown showing **all** options (minus
 *      anything already selected in multi-select mode).
 *   2. Typing a single character filters by substring match.
 *   3. The current selected value is shown as the input *placeholder*
 *      (single-select) or as chips above (multi-select). The search field
 *      is the **query**, never the value — so external value changes never
 *      clobber what the user is typing.
 *   4. Selecting closes the dropdown (single) or clears the search (multi).
>>>>>>> Stashed changes
 */
export const SmartSearchInput: React.FC<SmartSearchInputProps> = ({
  value,
  onChange,
  options,
  placeholder = "Search or pick…",
  multiSelect = false,
  className = "",
  hideChevron = false,
  allowCustom = true,
}) => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const values = useMemo(
    () => Array.isArray(value) ? value : (value ? [value] : []),
    [value],
  );
  const singleValue = !multiSelect && typeof value === "string" ? value : "";

  // Filter the option list. Empty search → show all available options. Always
  // exclude options already selected (in multi-select) so the user can't
  // re-add the same chip twice. For single-select we still show the current
  // value as a non-selectable hint at the top.
  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? options.filter(o => o.toLowerCase().includes(q))
      : options.slice();
    if (multiSelect) return base.filter(o => !values.includes(o));
    return base;
  }, [options, search, values, multiSelect]);

<<<<<<< Updated upstream
  // Whether the trailing "Add custom: «typed»" line should appear
=======
>>>>>>> Stashed changes
  const showCustomCommit =
    allowCustom &&
    search.trim().length > 0 &&
    !options.some(o => o.toLowerCase() === search.trim().toLowerCase()) &&
    !values.some(v => v.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (val: string) => {
    if (multiSelect) {
      if (!values.includes(val)) onChange([...values, val]);
      setSearch("");
<<<<<<< Updated upstream
      // Keep the dropdown open so user can quickly add more
=======
>>>>>>> Stashed changes
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      onChange(val);
      setSearch("");
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleRemove = (val: string) => {
    if (multiSelect) {
      onChange(values.filter(v => v !== val));
    } else {
      onChange("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const q = search.trim();
      if (q && allowCustom) {
        e.preventDefault();
<<<<<<< Updated upstream
        // Prefer an exact-match option if one exists (case-insensitive)
=======
>>>>>>> Stashed changes
        const exact = options.find(o => o.toLowerCase() === q.toLowerCase());
        handleSelect(exact ?? q);
      } else if (filteredOptions.length > 0) {
        e.preventDefault();
        handleSelect(filteredOptions[0]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Backspace" && !search && multiSelect && values.length > 0) {
      handleRemove(values[values.length - 1]);
    } else if (e.key === "ArrowDown") {
<<<<<<< Updated upstream
      // Open the dropdown if a user starts arrow-keying
=======
>>>>>>> Stashed changes
      setIsOpen(true);
    }
  };

<<<<<<< Updated upstream
  // Placeholder shows current single-select value so the user can see
  // what's already chosen without us poisoning the search field.
=======
>>>>>>> Stashed changes
  const inputPlaceholder = multiSelect
    ? (values.length > 0 ? "Add more…" : placeholder)
    : (singleValue || placeholder);

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
                type="button"
                onClick={() => handleRemove(v)}
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                aria-label={`Remove ${v}`}
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
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder}
          className={cn("bg-input border-border", !hideChevron && "pr-10")}
        />

        {!hideChevron && (
          <button
            type="button"
            onMouseDown={(e) => {
<<<<<<< Updated upstream
              // mousedown so we toggle BEFORE the input's onFocus → setIsOpen(true)
=======
>>>>>>> Stashed changes
              e.preventDefault();
              if (isOpen) {
                setIsOpen(false);
                inputRef.current?.blur();
              } else {
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary/60 transition-colors"
            aria-label={isOpen ? "Close options" : "Open options"}
          >
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                isOpen && "rotate-180",
              )}
            />
          </button>
        )}

<<<<<<< Updated upstream
        {/* Inline clear when single-select has a value and the search is empty */}
=======
>>>>>>> Stashed changes
        {!multiSelect && singleValue && !search && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="absolute right-9 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary/60 transition-colors"
            aria-label="Clear selection"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}

        <PortalDropdown
          open={isOpen}
          onClose={() => setIsOpen(false)}
          triggerRef={containerRef as React.RefObject<HTMLElement>}
          matchTriggerWidth
        >
          <div className="py-1">
<<<<<<< Updated upstream
            {/* Single-select hint: current value shown at top of list */}
=======
>>>>>>> Stashed changes
            {!multiSelect && singleValue && !search && (
              <div className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                Current: <span className="text-foreground">{singleValue}</span>
              </div>
            )}

            {filteredOptions.length === 0 && !showCustomCommit && (
              <div className="px-4 py-2 text-sm text-muted-foreground italic">
                No matches
              </div>
            )}

            {filteredOptions.slice(0, 50).map(opt => {
              const isCurrent = !multiSelect && opt === singleValue;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "w-full text-left px-4 py-2 hover:bg-secondary transition-smooth text-sm flex items-center justify-between gap-2",
                    isCurrent ? "text-primary" : "text-foreground",
                  )}
                >
                  <span>{opt}</span>
                  {isCurrent && <span className="text-[10px] uppercase tracking-wider opacity-70">selected</span>}
                </button>
              );
            })}

            {showCustomCommit && (
              <button
                type="button"
                onClick={() => handleSelect(search.trim())}
                className="w-full text-left px-4 py-2 hover:bg-secondary transition-smooth text-primary text-sm flex items-center gap-2 border-t border-border"
              >
                <span>Add custom:</span>
                <span className="font-semibold italic">"{search.trim()}"</span>
              </button>
            )}
          </div>
        </PortalDropdown>
      </div>
    </div>
  );
};
