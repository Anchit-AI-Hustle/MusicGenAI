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
  /** Hide the trailing chevron (e.g. when used inline). */
  hideChevron?: boolean;
  /** Allow typing a value not in `options` and pressing Enter to commit. */
  allowCustom?: boolean;
}

/**
 * Combo-box style autocomplete.
 *
 * UX rules:
 *   1. Click / focus opens the dropdown showing all options (minus anything
 *      already selected in multi-select mode).
 *   2. Typing a single character filters by substring match.
 *   3. The current selected value is shown as the input *placeholder*
 *      (single-select) or as chips above (multi-select). The search field
 *      is the **query**, never the value — so external value changes never
 *      clobber what the user is typing.
 *   4. Selecting closes the dropdown (single) or clears the search (multi).
 *      Pressing Enter on a non-matching query commits a custom value when
 *      `allowCustom` is true.
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
  const reactId = React.useId();

  const values = useMemo(
    () => Array.isArray(value) ? value : (value ? [value] : []),
    [value],
  );
  const singleValue = !multiSelect && typeof value === "string" ? value : "";

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? options.filter(o => o.toLowerCase().includes(q))
      : options.slice();
    if (multiSelect) return base.filter(o => !values.includes(o));
    return base;
  }, [options, search, values, multiSelect]);

  const showCustomCommit =
    allowCustom &&
    search.trim().length > 0 &&
    !options.some(o => o.toLowerCase() === search.trim().toLowerCase()) &&
    !values.some(v => v.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (val: string) => {
    if (multiSelect) {
      if (!values.includes(val)) onChange([...values, val]);
      setSearch("");
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
      setIsOpen(true);
    }
  };

  // Single-select mode shows the current value as a bright Badge ABOVE the
  // search input (mirroring the multi-select chip pattern) so the filled
  // value never looks like a faded placeholder. The search input below is a
  // pure query field — typing filters, the badge shows what's selected.
  const inputPlaceholder = multiSelect
    ? (values.length > 0 ? "Add more…" : placeholder)
    : (singleValue ? "Type to change selection…" : placeholder);

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

      {!multiSelect && singleValue && (
        <div className="flex flex-wrap gap-1.5 mb-2 min-w-0">
          <Badge
            variant="secondary"
            className="bg-primary/20 text-primary border-primary/30 flex items-center gap-1 pr-1 max-w-full min-w-0 whitespace-normal"
            title={singleValue}
          >
            <span className="truncate min-w-0 max-w-[calc(100%-1.5rem)]">{singleValue}</span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="hover:bg-primary/20 rounded-full p-0.5 transition-colors flex-shrink-0"
              aria-label="Clear selection"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
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
          // Disable native browser autofill / autocomplete suggestions so they
          // don't overlay our custom dropdown. A randomized name + role=combobox
          // tells Chrome/Safari this is a custom widget, not a credit card field.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name={`smart-search-${reactId}`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="smart-search-listbox"
          className={cn(
            "bg-input border-border text-foreground placeholder:text-muted-foreground",
            !hideChevron && "pr-10",
          )}
        />

        {!hideChevron && (
          <button
            type="button"
            onMouseDown={(e) => {
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

        {/* Single-select clear is now in the badge above; no inline X here. */}

        <PortalDropdown
          open={isOpen}
          onClose={() => setIsOpen(false)}
          triggerRef={containerRef as React.RefObject<HTMLElement>}
          matchTriggerWidth
        >
          <div className="py-1">
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
