import { useState, useCallback, useRef } from 'react';
import { ParsedSuggestion } from '@/lib/suggestionParser';

export function useSuggestion() {
  const [suggestions, setSuggestions] = useState<ParsedSuggestion[]>([]);
  const [isInferring, setIsInferring] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();
  // Use a context ref to prevent race conditions during typing
  const latestContextRef = useRef<string>('');

  const inferSuggestions = useCallback((description: string) => {
    latestContextRef.current = description;
    
    if (!description || description.trim().length < 5) {
      setSuggestions([]);
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    debounceTimer.current = setTimeout(async () => {
      // If the user changed the text while we were waiting, don't infer for the old text
      if (latestContextRef.current !== description) return;

      setIsInferring(true);
      try {
        const { inferContextFromDescription } = await import('@/lib/contextInference');
        const { parseSuggestionResponse } = await import('@/lib/suggestionParser');
        
        const rawInference = await inferContextFromDescription(description);
        
        if (!rawInference) throw new Error("Failed to infer");
        
        // Convert raw JSON inference to our safe parsed suggestion format
        const suggestions = parseSuggestionResponse(JSON.stringify(rawInference));
        
        // Only update if this is still the latest request we care about
        if (latestContextRef.current === description && suggestions) {
            setSuggestions(suggestions);
        }
      } catch (err) {
        console.error("Inference failed", err);
      } finally {
        if (latestContextRef.current === description) {
            setIsInferring(false);
        }
      }
    }, 800); // 800ms debounce
  }, []);

  const clearSuggestions = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    latestContextRef.current = '';
    setSuggestions([]);
    setIsInferring(false);
  }, []);

  const applySuggestion = useCallback((field: string, onApply: (val: any) => void) => {
    const suggestion = suggestions.find(s => s.field === field);
    if (suggestion) {
        onApply(suggestion.value);
        // Remove applied suggestion
        setSuggestions(prev => prev.filter(s => s.field !== field));
    }
  }, [suggestions]);

  return { 
      suggestions, 
      isInferring, 
      inferSuggestions, 
      clearSuggestions, 
      applySuggestion 
  };
}
