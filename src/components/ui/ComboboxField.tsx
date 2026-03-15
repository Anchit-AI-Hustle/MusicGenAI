import React, { useState, useRef, useEffect } from 'react';

interface ComboboxFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  suggestion?: { value: string, confidence: number };
  onApplySuggestion?: () => void;
  helpText?: string;
}

export function ComboboxField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select or type...",
  suggestion,
  onApplySuggestion,
  helpText
}: ComboboxFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filteredOptions = query === '' 
    ? options 
    : options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));

  // Allow custom values by using the query if no options match or user clicks away
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (option: string) => {
    setQuery(''); // Reset query since we've selected a defined option
    onChange(option);
    setIsOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full relative" ref={wrapperRef}>
      <label className="text-sm font-medium text-white/90 flex justify-between items-center">
        {label}
        {suggestion && onApplySuggestion && (
           <button 
             type="button" 
             onClick={onApplySuggestion}
             className="text-xs bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 px-2 py-0.5 rounded-full transition-colors flex items-center gap-1"
             title={`AI Suggestion (Confidence: ${Math.round(suggestion.confidence * 100)}%)`}
           >
             ✨ Suggests: {suggestion.value}
           </button>
        )}
      </label>
      
      <div className="relative">
        <input
          type="text"
          value={isOpen && query !== '' ? query : value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-white/30"
        />
        
        {/* Dropdown Chevron */}
        <div 
          className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <svg className={`h-5 w-5 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-[#1a1c23] border border-white/10 rounded-lg shadow-xl max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-white/50 italic">No exact matches. Press enter to use custom value.</div>
            ) : (
              <ul className="py-1">
                {filteredOptions.map((option) => (
                  <li
                    key={option}
                    onClick={() => handleSelect(option)}
                    className={`px-4 py-2 cursor-pointer hover:bg-white/10 text-sm transition-colors ${value === option ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/80'}`}
                  >
                    {option}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      
      {helpText && <p className="text-xs text-white/40 ml-1">{helpText}</p>}
    </div>
  );
}
