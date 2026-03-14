import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Command as CommandIcon, Loader2, PlayCircle, TestTube2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMusic } from '@/contexts/MusicContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { runSystemDemoTests, type DemoTestCaseResult, type DemoTestReport } from '@/lib/system-demo-tests';

const statusClasses: Record<DemoTestCaseResult['status'], string> = {
  pending: 'bg-secondary text-muted-foreground',
  running: 'bg-primary/20 text-primary',
  passed: 'bg-green-500/15 text-green-400',
  failed: 'bg-destructive/15 text-destructive',
};

export const SystemDemoDiagnostics: React.FC = () => {
  const { aiSuggest } = useMusic();
  const player = usePlayer();
  const [commandOpen, setCommandOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<DemoTestReport | null>(null);
  const [liveResults, setLiveResults] = useState<DemoTestCaseResult[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const upsertLiveResult = useCallback((result: DemoTestCaseResult) => {
    setLiveResults((previous) => {
      const index = previous.findIndex((item) => item.id === result.id);
      if (index >= 0) {
        const next = [...previous];
        next[index] = result;
        return next;
      }
      return [...previous, result];
    });
  }, []);

  const handleRun = useCallback(async () => {
    setCommandOpen(false);
    setPanelOpen(true);
    setIsRunning(true);
    setReport(null);
    setLiveResults([]);

    try {
      const nextReport = await runSystemDemoTests({
        aiSuggest,
        player: {
          audioElement: player.audioElement,
          play: player.play,
          pause: player.pause,
          clearQueue: player.clearQueue,
          setIsExpanded: player.setIsExpanded,
        },
        onUpdate: upsertLiveResult,
      });
      setReport(nextReport);
      setLiveResults(nextReport.results);
    } finally {
      setIsRunning(false);
    }
  }, [aiSuggest, player.audioElement, player.clearQueue, player.pause, player.play, player.setIsExpanded, upsertLiveResult]);

  const displayedResults = useMemo(() => report?.results || liveResults, [liveResults, report]);

  return (
    <>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search system commands..." />
        <CommandList>
          <CommandEmpty>No system commands found.</CommandEmpty>
          <CommandGroup heading="Diagnostics">
            <CommandItem onSelect={handleRun}>
              <TestTube2 className="mr-2 h-4 w-4" />
              <span>Run System Demo Tests</span>
              <CommandShortcut>Core</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <CommandIcon className="w-5 h-5 text-primary" />
                  Test Diagnostics
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Automated demo validation for generation, vocals, video, playback, lyrics, and uniqueness.
                </DialogDescription>
              </div>
              <Button onClick={handleRun} disabled={isRunning} variant="glow" size="sm">
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Run System Demo Tests
              </Button>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[calc(92vh-110px)] px-6 py-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
                <p className="text-lg font-semibold mt-2">{isRunning ? 'Running diagnostics…' : report ? 'Completed' : 'Idle'}</p>
              </div>
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Passed</p>
                <p className="text-lg font-semibold mt-2">{report?.passed ?? displayedResults.filter((result) => result.status === 'passed').length}</p>
              </div>
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Failed</p>
                <p className="text-lg font-semibold mt-2">{report?.failed ?? displayedResults.filter((result) => result.status === 'failed').length}</p>
              </div>
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Command</p>
                <p className="text-sm font-medium mt-2">Run System Demo Tests</p>
                <p className="text-xs text-muted-foreground mt-1">Open with `Ctrl/Cmd + K`.</p>
              </div>
            </div>

            <div className="space-y-3">
              {displayedResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  No diagnostics have been run yet.
                </div>
              ) : (
                displayedResults.map((result) => (
                  <div key={result.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          {result.status === 'passed' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : result.status === 'failed' ? <XCircle className="w-4 h-4 text-destructive" /> : <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                          <p className="font-medium">{result.name}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{result.summary}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusClasses[result.status]}`}>
                        {result.status}
                      </span>
                    </div>

                    {result.metrics && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Object.entries(result.metrics).map(([key, value]) => (
                          <span key={key} className="px-2.5 py-1 rounded-full bg-secondary text-xs text-secondary-foreground">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}

                    {result.details.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {result.details.map((detail) => (
                          <p key={detail} className="text-sm text-muted-foreground">
                            {detail}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {report && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-sm font-semibold">Detected System Issues</p>
                  <div className="mt-3 space-y-2">
                    {report.detectedIssues.length === 0 ? (
                      <p className="text-sm text-green-400">No issues detected in the current diagnostics run.</p>
                    ) : (
                      report.detectedIssues.map((issue) => (
                        <p key={issue} className="text-sm text-muted-foreground">{issue}</p>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-sm font-semibold">Recommended Fixes</p>
                  <div className="mt-3 space-y-2">
                    {report.recommendedFixes.length === 0 ? (
                      <p className="text-sm text-green-400">No follow-up fixes recommended.</p>
                    ) : (
                      report.recommendedFixes.map((fix) => (
                        <p key={fix} className="text-sm text-muted-foreground">{fix}</p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
