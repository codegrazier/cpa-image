import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  DownloadIcon,
  ImageIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimedConfirmation } from "@/hooks/use-timed-confirmation";
import {
  REQUEST_FILTERS,
  formatCompletionTime,
  formatRequestTiming,
  generationMethodDisplayName,
  payloadSize,
  requestStatusDisplayLabel,
  type AppSettings,
  type ImageRequestRecord,
  type RequestFilter,
} from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DELETE_CONFIRMATION_TIMEOUT_MS = 3000;

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

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function RequestRow({
  request,
  selected,
  timing,
  payloadSizeText,
  buttonRef,
  onCancelRequest,
  onDeleteRequest,
  onSelect,
}: {
  request: ImageRequestRecord;
  selected: boolean;
  timing: string;
  payloadSizeText: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onCancelRequest?: (id: string) => void;
  onDeleteRequest?: (id: string) => void;
  onSelect: () => void;
}) {
  const { copy, language } = useI18n();
  const { pendingKey: pendingDeleteRequestId, requestConfirmation } = useTimedConfirmation(DELETE_CONFIRMATION_TIMEOUT_MS);
  const requestSummary = `${generationMethodDisplayName(request.method)} · ${payloadSizeText}`;
  const requestDetail =
    request.error || (request.status === "done" ? formatCompletionTime(request.completedAt, language === "en" ? "en" : "zh") : "");
  const thumbnail = request.thumbnail || null;
  const isActive = request.status === "queued" || request.status === "running";
  const isConfirmingDelete = !isActive && pendingDeleteRequestId === request.id;
  const actionLabel = isActive
    ? copy.requestCardStatus.cancel
    : isConfirmingDelete
      ? copy.requestCardStatus.confirmDelete
      : copy.requestCardStatus.delete;
  const actionAriaLabel = isActive
    ? copy.requestCardStatus.cancel
    : isConfirmingDelete
      ? `${copy.requestCardStatus.confirmDelete} ${request.title}`
      : language === "en"
        ? `Delete ${request.title}`
        : `删除 ${request.title}`;
  const ActionIcon = isActive ? XIcon : isConfirmingDelete ? CheckIcon : Trash2Icon;

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
              {requestStatusDisplayLabel(copy.requestStatusLabels, request.status)}
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 text-muted-foreground hover:text-foreground",
                isConfirmingDelete && "text-destructive hover:text-destructive",
              )}
              aria-label={actionAriaLabel}
              onClick={(event) => {
                event.stopPropagation();
                if (isActive) {
                  onCancelRequest?.(request.id);
                  return;
                }
                if (!requestConfirmation(request.id)) return;
                onDeleteRequest?.(request.id);
              }}
            >
              <ActionIcon data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{actionLabel}</TooltipContent>
        </Tooltip>
      </span>
    </div>
  );
}

export function RequestListPanel({
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
  onDeleteRequest,
  onFilterChange,
  onOpenClearAll,
  onCancelRequests,
  onOpenClearCompleted,
  onOpenClearFailed,
  onOpenExportZip,
}: {
  filteredRequests: ImageRequestRecord[];
  selectedRequestId: string | null;
  selectedRequestFilter: RequestFilter;
  requestCounts: Record<RequestFilter, number>;
  now: number;
  settings: AppSettings;
  settingsOpen: boolean;
  clearDialogOpen: boolean;
  jsonDialogOpen: boolean;
  extraModalOpen: boolean;
  onSelectRequest: (id: string) => void;
  onCancelRequest: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onFilterChange: (filter: RequestFilter) => void;
  onOpenClearAll: () => void;
  onCancelRequests: () => void;
  onOpenClearCompleted: () => void;
  onOpenClearFailed: () => void;
  onOpenExportZip: () => void;
}) {
  const { copy, language } = useI18n();
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
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (settingsOpen || clearDialogOpen || jsonDialogOpen || extraModalOpen) return;
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <strong className="shrink-0 text-sm leading-none">{copy.requestList}</strong>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 truncate text-xs font-medium tabular-nums text-muted-foreground">
                {requestSummary}
              </span>
            </TooltipTrigger>
            <TooltipContent>{requestSummary}</TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              disabled={!hasDoneRequests}
              onClick={onOpenExportZip}
            >
              <DownloadIcon data-icon="inline-start" />
              {copy.exportZip.button}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copy.exportZip.tooltip}</TooltipContent>
        </Tooltip>
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
            {REQUEST_FILTERS.map((filter) => (
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
                timing={formatRequestTiming(request, now, language === "en" ? "en" : "zh")}
                payloadSizeText={payloadSize(request.payload)}
                buttonRef={(element) => {
                  if (element) {
                    requestButtonRefs.current.set(request.id, element);
                  } else {
                    requestButtonRefs.current.delete(request.id);
                  }
                }}
                onCancelRequest={onCancelRequest}
                onDeleteRequest={onDeleteRequest}
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
