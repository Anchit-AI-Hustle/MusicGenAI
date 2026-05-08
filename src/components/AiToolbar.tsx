/**
 * AiToolbar — the four-button per-field assist row.
 *
 * Single source of truth for what each icon means, what each tooltip says,
 * how each variant of "AI assist" is colored. Used by:
 *   - src/pages/CreateMusicPage.tsx (icon-only, dense)
 *   - src/components/AlbumTrackForm.tsx (with text labels)
 *
 * Behavior:
 *   1. Wand2  cyan   "AI Suggest" — fill from brief
 *   2. Zap    purple "Enhance"    — polish current value
 *   3. RotateCcw gray "Try another" — regenerate alternative
 *   4. Trash2 gray   "Clear"       — empty field
 *
 * Tooltips appear on hover with title + one-line description.
 * Aria-labels mirror the title for screen readers.
 */

import * as React from "react";
import { Wand2, Zap, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface AiToolbarProps {
  /** Field key passed back to each handler. */
  field: string;
  onSuggest: (field: string) => void;
  onEnhance: (field: string) => void;
  onRetry: (field: string) => void;
  onClear: (field: string) => void;
  isSuggesting?: boolean;
  isEnhancing?: boolean;
  isRetrying?: boolean;
  /**
   * "compact"  — icon-only square buttons (default; what CreateMusicPage uses).
   * "labeled"  — icon + short visible label (what AlbumTrackForm uses).
   * Tooltips are present in both variants — they explain the longer meaning.
   */
  variant?: "compact" | "labeled";
  className?: string;
}

interface ButtonSpec {
  key: "suggest" | "enhance" | "retry" | "clear";
  label: string;            // short visible label when variant="labeled"
  title: string;            // tooltip title (verb)
  description: string;      // tooltip body (one line)
  icon: React.ComponentType<{ className?: string }>;
  loadingFlag: keyof Pick<AiToolbarProps, "isSuggesting" | "isEnhancing" | "isRetrying"> | null;
  /** Tailwind classes for the compact (icon-only) variant. */
  compactClasses: string;
  /** Tailwind classes for the labeled variant. */
  labeledClasses: string;
}

const SPECS: ButtonSpec[] = [
  {
    key: "suggest",
    label: "AI",
    title: "AI Suggest",
    description: "Fill this field from your brief",
    icon: Wand2,
    loadingFlag: "isSuggesting",
    compactClasses:
      "p-1.5 rounded-lg border border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-black",
    labeledClasses:
      "text-xs h-7 px-2 inline-flex items-center rounded-md border border-primary/30 text-primary hover:bg-primary/10",
  },
  {
    key: "enhance",
    label: "Enhance",
    title: "Enhance",
    description: "Polish what's already in this field",
    icon: Zap,
    loadingFlag: "isEnhancing",
    compactClasses:
      "p-1.5 rounded-lg border border-accent/20 bg-accent/5 text-accent hover:bg-accent hover:text-black",
    labeledClasses:
      "text-xs h-7 px-2 inline-flex items-center rounded-md border border-accent/30 text-accent hover:bg-accent/10",
  },
  {
    key: "retry",
    label: "Try another",
    title: "Try another",
    description: "Generate a different alternative",
    icon: RefreshCw,
    loadingFlag: "isRetrying",
    compactClasses:
      "p-1.5 rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/20",
    labeledClasses:
      "text-xs h-7 px-2 inline-flex items-center rounded-md border border-muted-foreground/30 text-muted-foreground hover:bg-muted/50",
  },
  {
    key: "clear",
    label: "Clear",
    title: "Clear",
    description: "Empty this field",
    icon: Trash2,
    loadingFlag: null,
    compactClasses:
      "p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10",
    labeledClasses:
      "text-xs h-7 px-2 inline-flex items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10",
  },
];

export const AiToolbar: React.FC<AiToolbarProps> = ({
  field,
  onSuggest,
  onEnhance,
  onRetry,
  onClear,
  isSuggesting,
  isEnhancing,
  isRetrying,
  variant = "compact",
  className,
}) => {
  const isLoading = !!(isSuggesting || isEnhancing || isRetrying);
  const handlers: Record<ButtonSpec["key"], () => void> = {
    suggest: () => onSuggest(field),
    enhance: () => onEnhance(field),
    retry: () => onRetry(field),
    clear: () => onClear(field),
  };
  const flagValues: Record<NonNullable<ButtonSpec["loadingFlag"]>, boolean> = {
    isSuggesting: !!isSuggesting,
    isEnhancing: !!isEnhancing,
    isRetrying: !!isRetrying,
  };

  const iconSize = variant === "compact" ? "w-3.5 h-3.5" : "w-3 h-3";

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
        {SPECS.map(spec => {
          const showSpinner = spec.loadingFlag ? flagValues[spec.loadingFlag] : false;
          const Icon = spec.icon;
          const buttonClass = cn(
            "transition-all disabled:opacity-50",
            variant === "compact" ? spec.compactClasses : spec.labeledClasses,
          );
          const ariaLabel = `${spec.title} — ${spec.description}`;

          return (
            <Tooltip key={spec.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handlers[spec.key]}
                  disabled={isLoading}
                  aria-label={ariaLabel}
                  className={buttonClass}
                >
                  {showSpinner ? (
                    <Loader2 className={cn(iconSize, "animate-spin", variant === "labeled" && "mr-1")} />
                  ) : (
                    <Icon className={cn(iconSize, variant === "labeled" && "mr-1")} />
                  )}
                  {variant === "labeled" && <span>{spec.label}</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="font-medium">{spec.title}</div>
                <div className="text-xs text-muted-foreground">{spec.description}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
