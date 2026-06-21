import { useEffect, useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GeneratorPanel } from "@/components/generator-panel";
import { RequestListPanel } from "@/components/request-list-panel";
import { ResultPanel } from "@/components/result-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useImageConsole, type ExportZipProgress } from "@/hooks/use-image-console";
import { toast } from "sonner";
import {
  isDefaultStrictPromptText,
  normalizeStrictPromptText,
  type ConsoleMode,
} from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";

function StrictPromptEditorDialog({
  open,
  value,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string) => void;
}) {
  const { copy } = useI18n();
  const defaultText = copy.promptEditor.defaultText;
  const normalizeForLanguage = (input: unknown) =>
    isDefaultStrictPromptText(input) ? defaultText : normalizeStrictPromptText(input);
  const [draft, setDraft] = useState(() => normalizeForLanguage(value));

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeForLanguage(value));
  }, [defaultText, open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.promptEditor.title}</DialogTitle>
          <DialogDescription>{copy.promptEditor.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-md border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">{copy.promptEditor.header}</p>
            <Textarea
              id="strictPromptText"
              aria-label={copy.promptEditor.bodyLabel}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={8}
              className="mt-3 min-h-44 resize-none"
            />
            <p className="mt-3 text-xs font-medium text-muted-foreground">{copy.promptEditor.footer}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {copy.promptEditor.cancel}
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(defaultText)}>
              {copy.promptEditor.restoreDefault}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(normalizeStrictPromptText(draft));
                onOpenChange(false);
              }}
            >
              {copy.promptEditor.confirm}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClearRequestsDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const { copy } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExportZipConfirmDialog({
  open,
  completedCount,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  completedCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { copy } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.exportZip.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.exportZip.description(completedCount)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{copy.exportZip.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExportZipProgressDialog({
  open,
  progress,
}: {
  open: boolean;
  progress: ExportZipProgress;
}) {
  const { copy } = useI18n();
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{copy.exportZip.progressTitle}</DialogTitle>
          <DialogDescription>{copy.exportZip.progressDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>{copy.exportZip.progressStatus(progress.current, progress.total)}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResponseJsonDialog({
  open,
  json,
  onOpenChange,
}: {
  open: boolean;
  json: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { copy } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="min-w-0 border-b px-5 py-4">
          <DialogTitle>{copy.responseJson.title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.responseJson.description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 overflow-auto">
          <pre className="min-h-96 max-w-full whitespace-pre-wrap break-all bg-foreground p-5 text-xs leading-relaxed text-background">
            {json}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const { copy } = useI18n();
  const consoleState = useImageConsole();
  const [promptFocusSignal, setPromptFocusSignal] = useState(0);
  const [cancelRequestsDialogOpen, setCancelRequestsDialogOpen] = useState(false);
  const [clearFailedDialogOpen, setClearFailedDialogOpen] = useState(false);
  const [clearCompletedDialogOpen, setClearCompletedDialogOpen] = useState(false);
  const [strictPromptEditorOpen, setStrictPromptEditorOpen] = useState(false);
  const [exportZipConfirmOpen, setExportZipConfirmOpen] = useState(false);
  const [exportZipProgressOpen, setExportZipProgressOpen] = useState(false);
  const [exportZipProgress, setExportZipProgress] = useState<ExportZipProgress>({ current: 0, total: 0 });
  const extraModalOpen =
    cancelRequestsDialogOpen ||
    clearFailedDialogOpen ||
    clearCompletedDialogOpen ||
    strictPromptEditorOpen ||
    exportZipConfirmOpen ||
    exportZipProgressOpen;

  async function handleExportZipConfirm() {
    setExportZipConfirmOpen(false);
    setExportZipProgress({ current: 0, total: 0 });
    setExportZipProgressOpen(true);

    try {
      const result = await consoleState.exportCompletedImagesZip(setExportZipProgress);
      setExportZipProgressOpen(false);
      toast.success(copy.exportZip.success(result.count));
    } catch (error) {
      setExportZipProgressOpen(false);
      toast.error((error as Error).message || copy.exportZip.failed);
    }
  }

  function handleModeChange(mode: ConsoleMode) {
    const shouldFocusPrompt = consoleState.mode !== mode;
    consoleState.setMode(mode);

    if (shouldFocusPrompt) {
      setPromptFocusSignal((current) => current + 1);
    }
  }

  function handleEditImage(value: string) {
    handleModeChange("edit");
    void consoleState.addHistoricalEditImage(value);
  }

  return (
    <>
      <main className="grid min-h-dvh min-w-0 grid-cols-1 gap-4 bg-muted/30 p-4 lg:h-dvh lg:grid-cols-[380px_minmax(0,1fr)_400px] lg:overflow-hidden">
        <RequestListPanel
          filteredRequests={consoleState.filteredRequests}
          selectedRequestId={consoleState.selectedRequestId}
          selectedRequestFilter={consoleState.selectedRequestFilter}
          requestCounts={consoleState.requestCounts}
          now={consoleState.now}
          settings={consoleState.settings}
          settingsOpen={consoleState.settingsOpen}
          clearDialogOpen={consoleState.clearDialogOpen}
          jsonDialogOpen={consoleState.jsonDialogOpen}
          onSelectRequest={consoleState.setSelectedRequestId}
          onCancelRequest={consoleState.cancelRequest}
          onDeleteRequest={consoleState.deleteRequest}
          onFilterChange={consoleState.setSelectedRequestFilter}
          onOpenClearAll={() => consoleState.setClearDialogOpen(true)}
          onCancelRequests={() => setCancelRequestsDialogOpen(true)}
          onOpenClearCompleted={() => setClearCompletedDialogOpen(true)}
          onOpenClearFailed={() => setClearFailedDialogOpen(true)}
          onOpenExportZip={() => setExportZipConfirmOpen(true)}
          extraModalOpen={extraModalOpen}
        />
        <ResultPanel
          selectedRequest={consoleState.selectedRequest}
          selectedRequestDetailLoadingId={consoleState.selectedRequestDetailLoadingId}
          statusMessage={consoleState.statusMessage}
          selectedRequestJson={consoleState.selectedRequestJson}
          setJsonDialogOpen={consoleState.setJsonDialogOpen}
          reusePrompt={consoleState.reusePrompt}
          onEditImage={handleEditImage}
        />
        <GeneratorPanel
          mode={consoleState.mode}
          editImages={consoleState.editImages}
          historicalEditImageValue={consoleState.historicalEditImageValue}
          historicalEditImageOptions={consoleState.historicalEditImageOptions}
          settings={consoleState.settings}
          prompt={consoleState.prompt}
          promptHistory={consoleState.promptHistory}
          promptHistoryCount={consoleState.promptHistoryCount}
          promptHistoryPinnedCount={consoleState.promptHistoryPinnedCount}
          connectionStatus={consoleState.connectionStatus}
          promptFocusSignal={promptFocusSignal}
          setPrompt={consoleState.setPrompt}
          setEditImages={consoleState.setEditImages}
          updateSettings={consoleState.updateSettings}
          setSettingsOpen={consoleState.setSettingsOpen}
          enqueueGeneration={consoleState.enqueueGeneration}
          enqueueEditGeneration={consoleState.enqueueEditGeneration}
          selectPromptHistory={consoleState.selectPromptHistory}
          deletePromptHistory={consoleState.deletePromptHistory}
          togglePromptHistoryPin={consoleState.togglePromptHistoryPin}
          addHistoricalEditImage={consoleState.addHistoricalEditImage}
          onModeChange={handleModeChange}
          onOpenStrictPromptEditor={() => {
            setStrictPromptEditorOpen(true);
          }}
        />
      </main>

      <SettingsDialog
        settings={consoleState.settings}
        settingsOpen={consoleState.settingsOpen}
        endpointPreview={consoleState.endpointPreview}
        testConnectionStatus={consoleState.testConnectionStatus}
        setSettingsOpen={consoleState.setSettingsOpen}
        updateSettings={consoleState.updateSettings}
        saveCurrentSettings={consoleState.saveCurrentSettings}
        resetSettings={consoleState.resetSettings}
        testConnection={consoleState.testConnection}
      />
      <StrictPromptEditorDialog
        open={strictPromptEditorOpen}
        value={consoleState.settings.strictPromptText}
        onOpenChange={setStrictPromptEditorOpen}
        onSave={(value) => {
          consoleState.updateSettings("strictPromptText", value);
        }}
      />
      <ExportZipConfirmDialog
        open={exportZipConfirmOpen}
        completedCount={consoleState.requestCounts.done}
        onOpenChange={setExportZipConfirmOpen}
        onConfirm={handleExportZipConfirm}
      />
      <ExportZipProgressDialog open={exportZipProgressOpen} progress={exportZipProgress} />
      <ClearRequestsDialog
        open={consoleState.clearDialogOpen}
        onOpenChange={consoleState.setClearDialogOpen}
        title={copy.clearDialog.clearAll.title}
        description={copy.clearDialog.clearAll.description}
        confirmLabel={copy.clearDialog.clearAll.confirm}
        onConfirm={() => {
          consoleState.setClearDialogOpen(false);
          consoleState.clearAllRequests();
        }}
      />
      <ClearRequestsDialog
        open={cancelRequestsDialogOpen}
        onOpenChange={setCancelRequestsDialogOpen}
        title={copy.clearDialog.cancelRequests.title}
        description={copy.clearDialog.cancelRequests.description}
        confirmLabel={copy.clearDialog.cancelRequests.confirm}
        onConfirm={() => {
          setCancelRequestsDialogOpen(false);
          consoleState.cancelAllRequests();
        }}
      />
      <ClearRequestsDialog
        open={clearFailedDialogOpen}
        onOpenChange={setClearFailedDialogOpen}
        title={copy.clearDialog.clearFailed.title}
        description={copy.clearDialog.clearFailed.description}
        confirmLabel={copy.clearDialog.clearFailed.confirm}
        onConfirm={() => {
          setClearFailedDialogOpen(false);
          consoleState.clearFailedRequests();
        }}
      />
      <ClearRequestsDialog
        open={clearCompletedDialogOpen}
        onOpenChange={setClearCompletedDialogOpen}
        title={copy.clearDialog.clearCompleted.title}
        description={copy.clearDialog.clearCompleted.description}
        confirmLabel={copy.clearDialog.clearCompleted.confirm}
        onConfirm={() => {
          setClearCompletedDialogOpen(false);
          consoleState.clearCompletedRequests();
        }}
      />
      <ResponseJsonDialog
        open={consoleState.jsonDialogOpen}
        json={consoleState.selectedRequestJson}
        onOpenChange={consoleState.setJsonDialogOpen}
      />
    </>
  );
}
