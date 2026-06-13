import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  ChevronDownIcon,
  FileJsonIcon,
  ImageIcon,
  ImagePlusIcon,
  Loader2Icon,
  MessageSquareIcon,
  LanguagesIcon,
  PinIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useImageConsole } from "@/hooks/use-image-console";
import { toast } from "sonner";
import {
  DEFAULTS,
  MAX_EDIT_INPUT_IMAGES,
  MAX_PROMPT_HISTORY,
  QUALITY_OPTIONS,
  SIZE_OPTIONS,
  formatCompletionTime,
  generationMethodDisplayName,
  isDefaultStrictPromptText,
  normalizeStrictPromptText,
  revisedPromptForResponse,
  reusablePromptForRequest,
  type AppSettings,
  type ConsoleMode,
  type EditInputImage,
  type ImageRequestRecord,
  type PromptHistoryEntry,
  type RequestFilter,
} from "@/lib/image-console";
import { getCopy, useI18n, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const FILTERS: RequestFilter[] = ["all", "active", "done", "failed"];

function statusVariant(status: string) {
  if (status === "error" || status === "canceled") return "destructive" as const;
  return "default" as const;
}

function statusBadgeClassName(status: string) {
  if (status === "running") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  }

  if (status === "queued") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
  }

  if (status === "done") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  }

  return "";
}

function selectedRequestEmptyText(request: ImageRequestRecord | null, loading = false, language: Language = "zh") {
  const copy = getCopy(language);
  if (!request) return copy.requestCardEmpty.noImage;
  if (request.status === "queued") return copy.requestCardEmpty.queued;
  if (request.status === "running") return copy.requestCardEmpty.running;
  if (request.status === "canceled") return request.error || copy.requestCardEmpty.canceled;
  if (request.status === "error") return request.error || copy.requestCardEmpty.error;
  if (loading) return copy.requestCardEmpty.loading;
  if (request.detailsMissing) return copy.requestCardEmpty.restored;
  return copy.requestCardEmpty.missing;
}

function selectedRequestImageResolution(request: ImageRequestRecord | null) {
  if (request?.imageResolution) return request.imageResolution;
  const image = request?.images?.[0];
  if (!image?.width || !image.height) return "";
  return `${image.width}x${image.height}`;
}

function ActionSlot({
  visible,
  label,
  children,
}: {
  visible: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="shrink-0">
      {visible ? (
        children
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="invisible pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        >
          {label}
        </Button>
      )}
    </div>
  );
}

function OptionSelect({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function RequestRow({
  request,
  selected,
  timing,
  imageCount,
  payloadSize,
  buttonRef,
  onCancelRequest,
  onSelect,
}: {
  request: ImageRequestRecord;
  selected: boolean;
  timing: string;
  imageCount: number;
  payloadSize: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onCancelRequest?: (id: string) => void;
  onSelect: () => void;
}) {
  const { copy, language } = useI18n();
  const requestSummary = `${generationMethodDisplayName(request.method)} · ${payloadSize}`;
  const requestDetail = request.error || (request.status === "done" ? formatCompletionTime(request.completedAt) : "");
  const thumbnail = request.thumbnail || null;
  const canCancel = request.status === "queued" || request.status === "running";

  return (
    <div
      className={cn(
        "grid min-h-22 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-4 overflow-hidden rounded-xl border border-border bg-card p-3 text-card-foreground transition-[border-color,background-color,box-shadow]",
        "hover:border-foreground/15 hover:bg-muted/40",
        selected && "border-foreground/20 bg-[oklch(0.985_0.006_255)]",
      )}
    >
      <button
        type="button"
        className="grid min-w-0 cursor-pointer grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4 text-left focus:outline-none"
        ref={buttonRef}
        onClick={onSelect}
        aria-label={language === "en" ? `View ${request.title} result` : `查看 ${request.title} 的生成结果`}
      >
        <span className="flex size-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
          {thumbnail ? (
            <img
              src={thumbnail.src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover object-center"
            />
          ) : (
            <ImageIcon aria-hidden="true" className="size-6 text-muted-foreground" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1 overflow-hidden py-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <Badge variant={statusVariant(request.status)} className={statusBadgeClassName(request.status)}>
              {copy.requestStatusLabels[request.status] || request.status}
            </Badge>
            <strong className="min-w-0 truncate text-sm font-semibold">{request.title}</strong>
          </span>
          <span className="block min-w-0 truncate text-xs font-medium text-muted-foreground">{timing}</span>
          <span className="block min-w-0 truncate text-xs text-muted-foreground" title={requestSummary}>
            {requestSummary}
          </span>
          {requestDetail ? (
            <span className="block min-w-0 truncate text-xs text-muted-foreground" title={requestDetail}>
              {requestDetail}
            </span>
          ) : null}
        </span>
      </button>
      <span className="flex shrink-0 items-start pt-0.5">
        {canCancel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={copy.requestCardStatus.cancel}
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelRequest?.(request.id);
                }}
              >
                <XIcon data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.requestCardStatus.cancel}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </div>
  );
}

function RequestListPanel({
  filteredRequests,
  selectedRequestId,
  selectedRequestFilter,
  requestCounts,
  now,
  settings,
  settingsOpen,
  clearDialogOpen,
  jsonDialogOpen,
  extraModalOpen,
  onSelectRequest,
  onCancelRequest,
  onFilterChange,
  onOpenClearAll,
  onCancelRequests,
  onOpenClearCompleted,
  onOpenClearFailed,
  formatRequestTiming,
  requestImageCount,
  payloadSize,
}: ReturnType<typeof useImageConsole> & {
  onSelectRequest: (id: string) => void;
  onCancelRequest: (id: string) => void;
  onFilterChange: (filter: RequestFilter) => void;
  onOpenClearAll: () => void;
  onCancelRequests: () => void;
  onOpenClearCompleted: () => void;
  onOpenClearFailed: () => void;
  extraModalOpen: boolean;
}) {
  const { copy } = useI18n();
  const hasRequests = requestCounts.all > 0;
  const hasActiveRequests = requestCounts.active > 0;
  const hasDoneRequests = requestCounts.done > 0;
  const hasFailedRequests = requestCounts.failed > 0;
  const requestSummary = copy.requestSummary(settings);
  const requestButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  function focusRequest(id: string) {
    requestButtonRefs.current.get(id)?.focus();
  }

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;

      const tagName = target.tagName;
      return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
    }

    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (settingsOpen || clearDialogOpen || jsonDialogOpen || extraModalOpen) return;
      if (isEditableTarget(event.target)) return;
      if (!filteredRequests.length) return;

      event.preventDefault();

      const currentIndex = filteredRequests.findIndex((request) => request.id === selectedRequestId);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const nextRequest =
        currentIndex >= 0
          ? filteredRequests[currentIndex + step] || filteredRequests[currentIndex]
          : event.key === "ArrowDown"
            ? filteredRequests[0]
            : filteredRequests[filteredRequests.length - 1];

      if (!nextRequest) return;

      onSelectRequest(nextRequest.id);
      focusRequest(nextRequest.id);
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [clearDialogOpen, extraModalOpen, filteredRequests, jsonDialogOpen, onSelectRequest, selectedRequestId, settingsOpen]);

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card shadow-none" aria-label={copy.requestList}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
        <strong className="min-w-0 flex-1 truncate text-sm leading-none">{copy.requestList}</strong>
        <span className="shrink-0 whitespace-nowrap text-right text-xs font-medium tabular-nums text-muted-foreground">
          {requestSummary}
        </span>
      </div>

      <div className="border-b border-border bg-muted/30 px-3 py-2">
        <div className="grid grid-cols-4 gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full justify-center gap-0.5 px-1.5 text-[10px] leading-none"
                disabled={!hasRequests}
                onClick={onOpenClearAll}
              >
                <Trash2Icon data-icon="inline-start" />
                {copy.clearAll}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.requestListTooltips.clearAll}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 w-full justify-center gap-0.5 px-1.5 text-[10px] leading-none"
                disabled={!hasActiveRequests}
                onClick={onCancelRequests}
              >
                <XIcon data-icon="inline-start" />
                {copy.cancelRequests}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.requestListTooltips.cancelRequests}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full justify-center gap-0.5 px-1.5 text-[10px] leading-none"
                disabled={!hasDoneRequests}
                onClick={onOpenClearCompleted}
              >
                <CheckCircle2Icon data-icon="inline-start" />
                {copy.clearCompleted}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.requestListTooltips.clearCompleted}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full justify-center gap-0.5 px-1.5 text-[10px] leading-none"
                disabled={!hasFailedRequests}
                onClick={onOpenClearFailed}
              >
                <AlertCircleIcon data-icon="inline-start" />
                {copy.clearFailed}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.requestListTooltips.clearFailed}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="border-b border-border px-3 py-2">
        <Tabs value={selectedRequestFilter} onValueChange={(value) => onFilterChange(value as RequestFilter)}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 xl:grid-cols-4">
            {FILTERS.map((filter) => (
              <TabsTrigger key={filter} value={filter} className="min-w-0 gap-1 text-xs">
                <span className="truncate">{copy.filterLabels[filter]}</span>
                <span className="shrink-0 tabular-nums">{requestCounts[filter]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-2 p-3">
          {!hasRequests ? (
            <Empty className="min-h-40 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImageIcon />
              </EmptyMedia>
              <EmptyTitle>{copy.filterEmptyText.all}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : filteredRequests.length ? (
            filteredRequests.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                selected={request.id === selectedRequestId}
                timing={formatRequestTiming(request, now)}
                imageCount={requestImageCount(request)}
                payloadSize={payloadSize(request.payload)}
                buttonRef={(element) => {
                  if (element) {
                    requestButtonRefs.current.set(request.id, element);
                  } else {
                    requestButtonRefs.current.delete(request.id);
                  }
                }}
                onCancelRequest={onCancelRequest}
                onSelect={() => {
                  onSelectRequest(request.id);
                }}
              />
            ))
          ) : (
            <Empty className="min-h-40 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AlertCircleIcon />
              </EmptyMedia>
              <EmptyTitle>{copy.filterEmptyText[selectedRequestFilter]}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function Gallery({ request, loading }: { request: ImageRequestRecord | null; loading: boolean }) {
  const { language } = useI18n();
  const images = request?.status === "done" && !request.detailsMissing ? request.images : [];
  const isDetailLoading = Boolean(
    request &&
      request.status === "done" &&
      !request.detailsMissing &&
      !images.length &&
      (loading || request.hasCachedDetails),
  );
  const displayImageCount = request?.status === "done" && !request.detailsMissing ? images.length : 0;

  if (isDetailLoading) {
    return (
      <div className="grid h-full min-h-90 place-items-center rounded-lg border border-border bg-card">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-6 animate-spin" />
          <span className="text-sm">{selectedRequestEmptyText(request, true, language)}</span>
        </div>
      </div>
    );
  }

  if (!displayImageCount) {
    return (
      <div className="grid h-full min-h-90 grid-cols-1 gap-3">
        <Empty className="min-h-90 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {loading ? <Loader2Icon className="animate-spin" /> : <ImageIcon />}
            </EmptyMedia>
            <EmptyTitle>{selectedRequestEmptyText(request, loading, language)}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const gridClass =
    displayImageCount === 1 ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(220px,1fr))]";

  return (
    <div
      className={cn(
        "grid h-full min-h-90 gap-3",
        gridClass,
      )}
    >
      {Array.from({ length: displayImageCount }, (_, index) => {
        const image = images[index] || null;
        return (
          <article
            key={`${request?.id || "empty"}-${index}`}
            className="image-checkerboard relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg border"
          >
            {image ? (
              <img
                src={image.src}
                alt={`Generated image ${index + 1}`}
                loading="lazy"
                className="block max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {loading ? <Loader2Icon className="size-5 animate-spin text-muted-foreground" /> : <ImageIcon className="size-6 text-muted-foreground" />}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ResultPanel(consoleState: ReturnType<typeof useImageConsole>) {
  const { copy, language } = useI18n();
  const {
    selectedRequest,
    selectedRequestDetailLoadingId,
    statusMessage,
    selectedRequestJson,
    selectedRequestDownload,
    setJsonDialogOpen,
    reusePrompt,
  } = consoleState;

  const canDownload = selectedRequest?.status === "done";
  const canReuse = Boolean(selectedRequest && reusablePromptForRequest(selectedRequest));
  const canShowResponseJson = Boolean(selectedRequest && selectedRequest.status !== "queued" && selectedRequest.status !== "running");
  const responseJsonDisabled = !selectedRequestJson;
  const selectedRequestDetailLoading = selectedRequestDetailLoadingId === selectedRequest?.id;
  const selectedRequestResolution = selectedRequestImageResolution(selectedRequest);
  const selectedRequestStatusText = selectedRequest
    ? `${copy.requestStatusLabels[selectedRequest.status] || selectedRequest.status}${selectedRequestResolution ? ` · ${selectedRequestResolution}` : ""}`
    : copy.requestCardStatus.unselectedSubtitle;
  const inputPromptTooltip = selectedRequest?.sourcePrompt?.trim() || (language === "en" ? "No input Prompt" : "暂无输入 Prompt");
  const revisedPromptTooltip =
    revisedPromptForResponse(selectedRequest?.response) || (language === "en" ? "No revised_prompt found" : "未找到 revised_prompt");
  const statusHeading = statusMessage.state;

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card shadow-none" aria-live="polite">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
        <strong className="shrink-0 text-sm">{statusHeading}</strong>
        <span className="min-w-0 truncate text-right text-xs font-medium text-muted-foreground">{statusMessage.detail}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0 flex-1">
            <strong className="block min-w-0 truncate text-sm font-semibold">
              {selectedRequest?.title || copy.requestCardStatus.unselectedTitle}
            </strong>
            <span className="truncate text-xs font-medium text-muted-foreground">{selectedRequestStatusText}</span>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 self-center">
            <ActionSlot visible={Boolean(canDownload)} label={copy.requestCardStatus.download}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedRequestDownload}
                onClick={() => {
                  if (!selectedRequestDownload) return;
                  const anchor = document.createElement("a");
                  anchor.href = selectedRequestDownload.href;
                  anchor.download = selectedRequestDownload.download;
                  anchor.rel = "noopener";
                  anchor.click();
                }}
              >
                <DownloadIcon data-icon="inline-start" />
                {copy.requestCardStatus.download}
              </Button>
            </ActionSlot>
            <ActionSlot visible={canShowResponseJson} label={copy.requestCardStatus.responseJson}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={responseJsonDisabled}
                    onClick={() => setJsonDialogOpen(true)}
                  >
                    <FileJsonIcon data-icon="inline-start" />
                    {copy.requestCardStatus.responseJson}
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                  {revisedPromptTooltip}
                </TooltipContent>
              </Tooltip>
            </ActionSlot>
            <ActionSlot visible={Boolean(selectedRequest)} label={copy.requestCardStatus.reusePrompt}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canReuse}
                    onClick={() => reusePrompt(selectedRequest!)}
                  >
                    <CopyIcon data-icon="inline-start" />
                    {copy.requestCardStatus.reusePrompt}
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                  {inputPromptTooltip}
                </TooltipContent>
              </Tooltip>
            </ActionSlot>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-4">
          <Gallery request={selectedRequest} loading={selectedRequestDetailLoading} />
        </div>
      </div>
    </section>
  );
}

function PromptHistoryPanel({
  promptHistory,
  promptHistoryCount,
  promptHistoryPinnedCount,
  onSelectPrompt,
  onDeletePrompt,
  onTogglePromptPin,
}: {
  promptHistory: PromptHistoryEntry[];
  promptHistoryCount: number;
  promptHistoryPinnedCount: number;
  onSelectPrompt: (value: string) => void;
  onDeletePrompt: (value: string) => void;
  onTogglePromptPin: (value: string) => void;
}) {
  const { copy, language } = useI18n();
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label={copy.promptHistory.title}>
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>{copy.promptHistory.title}</FieldTitle>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {promptHistoryCount}/{MAX_PROMPT_HISTORY}
          {promptHistoryPinnedCount ? ` · ${promptHistoryPinnedCount} ${copy.promptHistory.pinned}` : ""}
        </span>
      </div>

      {promptHistory.length ? (
        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <div className="flex w-full min-w-0 flex-col">
            {promptHistory.map((item) => (
              <div
                key={item.prompt}
                className="grid w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 overflow-hidden border-b last:border-b-0"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn("shrink-0", item.pinned ? "text-primary" : "text-muted-foreground")}
                  aria-pressed={item.pinned}
                  aria-label={item.pinned ? `${copy.promptHistory.unpin}：${item.prompt}` : `${copy.promptHistory.pin} Prompt：${item.prompt}`}
                  title={item.pinned ? copy.promptHistory.unpin : copy.promptHistory.pin}
                  onClick={() => onTogglePromptPin(item.prompt)}
                >
                  <PinIcon fill={item.pinned ? "currentColor" : "none"} data-icon="inline-start" />
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full min-w-0 cursor-pointer items-center overflow-hidden px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                      onClick={() => onSelectPrompt(item.prompt)}
                    >
                      <span className="block min-w-0 flex-1 truncate">{item.prompt}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                    {item.prompt}
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mr-1 shrink-0"
                  aria-label={
                    language === "en"
                      ? `${copy.promptHistory.delete} history Prompt：${item.prompt}`
                      : `${copy.promptHistory.delete}历史 Prompt：${item.prompt}`
                  }
                  onClick={() => onDeletePrompt(item.prompt)}
                >
                  <Trash2Icon data-icon="inline-start" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="min-h-0 flex-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {copy.promptHistory.empty}
        </div>
      )}
    </section>
  );
}

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

function GeneratorPanel({
  onOpenStrictPromptEditor,
  ...consoleState
}: ReturnType<typeof useImageConsole> & {
  onOpenStrictPromptEditor: () => void;
}) {
  const { copy, toggleLanguage } = useI18n();
  const {
    mode,
    setMode,
    editImages,
    setEditImages,
    historicalEditImageValue,
    historicalEditImageOptions,
    addHistoricalEditImage,
    settings,
    prompt,
    promptHistory,
    promptHistoryCount,
    promptHistoryPinnedCount,
    connectionStatus,
    setPrompt,
    updateSettings,
    setSettingsOpen,
    enqueueGeneration,
    enqueueEditGeneration,
    selectPromptHistory,
    deletePromptHistory,
    togglePromptHistoryPin,
  } = consoleState;
  const editImagesInputRef = useRef<HTMLInputElement>(null);
  const generationButtonFeedbackClassName = "transition-all duration-100 active:translate-y-px active:scale-[0.99] active:brightness-95";

  function submitGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "edit") {
      enqueueEditGeneration();
      return;
    }

    enqueueGeneration("images");
  }

  function handleEditImagesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    if (!files.length) return;

    if (files.length > MAX_EDIT_INPUT_IMAGES) {
      toast.error(copy.generator.maxEditImages(MAX_EDIT_INPUT_IMAGES));
    }

    const nextImages: EditInputImage[] = files.slice(0, MAX_EDIT_INPUT_IMAGES).map((file) => ({
      src: URL.createObjectURL(file),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      file,
    }));

    setEditImages(nextImages);
    event.currentTarget.value = "";
  }

  return (
    <form onSubmit={submitGeneration} className="flex min-h-0 min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(value) => setMode(value as ConsoleMode)}>
          <TabsList className="h-10 rounded-full border border-border bg-muted/40 p-1">
            <TabsTrigger value="generate" className="rounded-full px-4 text-xs">
              {copy.generator.generate}
            </TabsTrigger>
            <TabsTrigger value="edit" className="rounded-full px-4 text-xs">
              {copy.generator.edit}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={toggleLanguage}
                aria-label={copy.switchLanguageTooltip}
              >
                <LanguagesIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.switchLanguageTooltip}</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant={connectionStatus.tone === "ok" ? "secondary" : connectionStatus.tone === "error" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            {connectionStatus.tone === "busy" ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SettingsIcon data-icon="inline-start" />}
            {connectionStatus.label}
          </Button>
        </div>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="prompt">{copy.generator.promptLabel}</FieldLabel>
          <Textarea
            id="prompt"
            name="prompt"
            rows={4}
            maxLength={32000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={mode === "edit" ? copy.generator.editPromptPlaceholder : copy.generator.promptPlaceholder}
            required
            className="h-[114px] resize-none overflow-y-auto md:h-[98px]"
          />
        </Field>
        {mode === "edit" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="editImages">{copy.generator.selectLocalImage}</FieldLabel>
              <button
                type="button"
                className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"
                onClick={() => editImagesInputRef.current?.click()}
              >
                <span className="min-w-0 flex-1 truncate text-left">{copy.generator.choose}</span>
                <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
              </button>
              <Input
                id="editImages"
                ref={editImagesInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleEditImagesChange}
                className="sr-only"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="historicalEditImages">{copy.generator.selectHistoricalImage}</FieldLabel>
              <Select
                value={historicalEditImageValue}
                onValueChange={(value) => {
                  void addHistoricalEditImage(value);
                }}
              >
                <SelectTrigger id="historicalEditImages" className="w-full" disabled={!historicalEditImageOptions.length}>
                  <SelectValue placeholder={copy.generator.choose} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {historicalEditImageOptions.length ? (
                      historicalEditImageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="min-h-14 items-center py-2 pr-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                              {option.thumbnail?.src ? (
                                <img
                                  src={option.thumbnail.src}
                                  alt=""
                                  aria-hidden="true"
                                  className="h-full w-full object-cover object-center"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <ImageIcon className="size-4" />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 truncate">{option.label}</span>
                          </span>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__empty" disabled>
                        {copy.generator.noHistoricalImages}
                      </SelectItem>
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}
        {mode === "edit" ? (
          <div className="grid gap-2">
            {editImages.length ? (
              <div className="grid gap-2">
                <div
                  className="grid grid-cols-5 gap-1.5 overflow-hidden pb-1"
                  data-testid="edit-image-preview-strip"
                >
                  {editImages.map((image, index) => (
                    <div
                      key={`${image.sourceKey || image.name}-${index}`}
                      className="relative aspect-square min-w-0 overflow-hidden rounded-md border border-border bg-muted/30"
                    >
                      <img
                        src={image.src}
                        alt=""
                        aria-hidden="true"
                        className="block h-full w-full object-cover object-center"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-xs"
                        className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-background/90 shadow-none"
                        aria-label={`删除输入图片 ${index + 1}`}
                        onClick={() => {
                          setEditImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
                        }}
                      >
                        <XIcon data-icon="inline-start" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {copy.generator.selectAtLeastOneImage}
              </div>
            )}
          </div>
        ) : null}
      </FieldGroup>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OptionSelect
          label={copy.generator.size}
          value={String(settings.size)}
          options={SIZE_OPTIONS}
          onValueChange={(value) => updateSettings("size", value as AppSettings["size"])}
        />
        <OptionSelect
          label={copy.generator.quality}
          value={String(settings.quality)}
          options={QUALITY_OPTIONS}
          onValueChange={(value) => updateSettings("quality", value as AppSettings["quality"])}
        />
        <Field>
          <FieldLabel htmlFor="n">{copy.generator.count}</FieldLabel>
          <Input
            id="n"
            name="n"
            type="number"
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            value={settings.n}
            onChange={(event) => updateSettings("n", event.target.value)}
          />
        </Field>
        <Field className="gap-2 self-end">
          <FieldTitle>{copy.generator.keepOriginalPrompt}</FieldTitle>
          <div className="flex min-h-9 items-center justify-between gap-3 rounded-md border px-3 py-1">
            <label htmlFor="strictPrompt" className="flex min-w-0 cursor-pointer items-center gap-2">
              <Checkbox
                id="strictPrompt"
                checked={settings.strictPrompt}
                onCheckedChange={(checked) => updateSettings("strictPrompt", checked === true)}
              />
              <span className="min-w-0 leading-none">{copy.generator.keep}</span>
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={copy.generator.editOriginalPromptTooltip}
                  onClick={onOpenStrictPromptEditor}
                >
                  <PencilIcon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copy.generator.editOriginalPromptTooltip}</TooltipContent>
            </Tooltip>
          </div>
        </Field>
      </div>

      <PromptHistoryPanel
        promptHistory={promptHistory}
        promptHistoryCount={promptHistoryCount}
        promptHistoryPinnedCount={promptHistoryPinnedCount}
        onSelectPrompt={selectPromptHistory}
        onDeletePrompt={deletePromptHistory}
        onTogglePromptPin={togglePromptHistoryPin}
      />

      <div className="grid grid-cols-1 gap-2">
        {mode === "edit" ? (
          <Button type="submit" size="lg" className={generationButtonFeedbackClassName}>
            <ImagePlusIcon data-icon="inline-start" />
            {copy.generator.edits}
          </Button>
        ) : (
          <>
            <Button type="submit" size="lg" className={generationButtonFeedbackClassName}>
              <PlayIcon data-icon="inline-start" />
              {copy.generator.generations}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className={generationButtonFeedbackClassName}
              onClick={() => enqueueGeneration("responses")}
            >
              <ImageIcon data-icon="inline-start" />
              {copy.generator.responses}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={generationButtonFeedbackClassName}
              onClick={() => enqueueGeneration("completions")}
            >
              <MessageSquareIcon data-icon="inline-start" />
              {copy.generator.completions}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function SettingsDialog(
  consoleState: ReturnType<typeof useImageConsole>,
) {
  const { copy } = useI18n();
  const {
    settings,
    settingsOpen,
    endpointPreview,
    testConnectionStatus,
    setSettingsOpen,
    updateSettings,
    saveCurrentSettings,
    resetSettings,
    testConnection,
  } = consoleState;

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy.settings.title}</DialogTitle>
          <DialogDescription>{copy.settings.description}</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="baseUrl">{copy.settings.apiUrl}</FieldLabel>
            <Input
              id="baseUrl"
              type="url"
              spellCheck={false}
              autoComplete="url"
              placeholder={DEFAULTS.baseUrl}
              value={settings.baseUrl}
              onChange={(event) => updateSettings("baseUrl", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="apiKey">{copy.settings.apiKey}</FieldLabel>
            <Input
              id="apiKey"
              type="password"
              spellCheck={false}
              autoComplete="off"
              placeholder="CLIProxyAPI api-key"
              value={settings.apiKey}
              onChange={(event) => updateSettings("apiKey", event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="model">{copy.settings.generationModel}</FieldLabel>
              <Input
                id="model"
                type="text"
                spellCheck={false}
                value={settings.model}
                onChange={(event) => updateSettings("model", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="llmModel">{copy.settings.llmModel}</FieldLabel>
              <Input
                id="llmModel"
                type="text"
                spellCheck={false}
                value={settings.llmModel}
                onChange={(event) => updateSettings("llmModel", event.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="requestConcurrency">{copy.settings.concurrency}</FieldLabel>
              <Input
                id="requestConcurrency"
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={settings.requestConcurrency}
                onChange={(event) => updateSettings("requestConcurrency", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="requestIntervalSeconds">{copy.settings.interval}</FieldLabel>
              <Input
                id="requestIntervalSeconds"
                type="number"
                min={0}
                max={3600}
                step={1}
                inputMode="numeric"
                value={settings.requestIntervalSeconds}
                onChange={(event) => updateSettings("requestIntervalSeconds", event.target.value)}
              />
            </Field>
          </div>
          <Field orientation="horizontal" className="!items-center">
            <Checkbox
              id="rememberKey"
              checked={settings.rememberKey}
              onCheckedChange={(checked) => updateSettings("rememberKey", checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="rememberKey">{copy.settings.rememberKey}</FieldLabel>
            </FieldContent>
          </Field>
          <FieldSet>
            <FieldTitle>{copy.settings.endpointPreview}</FieldTitle>
            <pre className="min-w-0 whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              {endpointPreview}
            </pre>
          </FieldSet>
        </FieldGroup>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={resetSettings}>
            <RotateCcwIcon data-icon="inline-start" />
            {copy.settings.reset}
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant={
                testConnectionStatus.tone === "ok"
                  ? "secondary"
                  : testConnectionStatus.tone === "error"
                    ? "destructive"
                    : "outline"
              }
              className="w-28 justify-center"
              onClick={testConnection}
            >
              {testConnectionStatus.tone === "busy" ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <CheckCircle2Icon data-icon="inline-start" />
              )}
              {testConnectionStatus.label}
            </Button>
            <Button type="button" onClick={saveCurrentSettings}>
              {copy.settings.save}
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
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{copy.responseJson.title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.responseJson.description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(100vh-8rem)]">
          <pre className="min-h-96 whitespace-pre-wrap break-words bg-foreground p-5 text-xs leading-relaxed text-background">
            {json}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const { copy } = useI18n();
  const consoleState = useImageConsole();
  const [cancelRequestsDialogOpen, setCancelRequestsDialogOpen] = useState(false);
  const [clearFailedDialogOpen, setClearFailedDialogOpen] = useState(false);
  const [clearCompletedDialogOpen, setClearCompletedDialogOpen] = useState(false);
  const [strictPromptEditorOpen, setStrictPromptEditorOpen] = useState(false);

  return (
    <>
      <main className="grid min-h-dvh min-w-0 grid-cols-1 gap-4 bg-muted/30 p-4 lg:h-dvh lg:grid-cols-[380px_minmax(0,1fr)_400px] lg:overflow-hidden">
        <RequestListPanel
          {...consoleState}
          onSelectRequest={consoleState.setSelectedRequestId}
          onCancelRequest={consoleState.cancelRequest}
          onFilterChange={consoleState.setSelectedRequestFilter}
          onOpenClearAll={() => consoleState.setClearDialogOpen(true)}
          onCancelRequests={() => setCancelRequestsDialogOpen(true)}
          onOpenClearCompleted={() => setClearCompletedDialogOpen(true)}
          onOpenClearFailed={() => setClearFailedDialogOpen(true)}
          extraModalOpen={cancelRequestsDialogOpen || clearFailedDialogOpen || clearCompletedDialogOpen || strictPromptEditorOpen}
        />
        <ResultPanel {...consoleState} />
        <GeneratorPanel
          {...consoleState}
          onOpenStrictPromptEditor={() => {
            setStrictPromptEditorOpen(true);
          }}
        />
      </main>

      <SettingsDialog {...consoleState} />
      <StrictPromptEditorDialog
        open={strictPromptEditorOpen}
        value={consoleState.settings.strictPromptText}
        onOpenChange={setStrictPromptEditorOpen}
        onSave={(value) => {
          consoleState.updateSettings("strictPromptText", value);
        }}
      />
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
