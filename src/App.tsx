import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  FileJsonIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareIcon,
  PinIcon,
  PlayIcon,
  RotateCcwIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useImageConsole } from "@/hooks/use-image-console";
import { BACKGROUND_OPTIONS, DEFAULTS, OUTPUT_FORMAT_OPTIONS, QUALITY_OPTIONS, REQUEST_FILTER_EMPTY_TEXT, REQUEST_FILTER_LABELS, REQUEST_STATUS_LABELS, SIZE_OPTIONS, formatCompletionTime, generationMethodDisplayName, requestControlSummary, revisedPromptForResponse, reusablePromptForRequest, type AppSettings, type ImageRequestRecord, type PromptHistoryEntry, type RequestFilter } from "@/lib/image-console";
import { cn } from "@/lib/utils";

const FILTERS: RequestFilter[] = ["all", "active", "done", "failed"];

function statusVariant(status: string) {
  if (status === "error" || status === "canceled") return "destructive" as const;
  if (status === "done") return "default" as const;
  return "secondary" as const;
}

function selectedRequestEmptyText(request: ImageRequestRecord | null, loading = false) {
  if (!request) return "暂无图片";
  if (request.status === "queued") return "该请求正在排队";
  if (request.status === "running") return "该请求正在等待响应";
  if (request.status === "canceled") return request.error || "该请求已取消";
  if (request.status === "error") return request.error || "该请求失败";
  if (loading) return "历史详情加载中";
  if (request.detailsMissing) return "历史已恢复，图片详情未能从本地缓存读取。";
  return "响应中没有找到图片";
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
  return <div className="w-32 shrink-0">{visible ? children : <Button className="invisible w-full pointer-events-none" size="sm" tabIndex={-1} aria-hidden="true" type="button" variant="outline">{label}</Button>}</div>;
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
  onKeyDown,
  onSelect,
}: {
  request: ImageRequestRecord;
  selected: boolean;
  timing: string;
  imageCount: number;
  payloadSize: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
}) {
  const requestSummary = `${generationMethodDisplayName(request.method)} · ${payloadSize}`;
  const requestDetail =
    request.error || (request.status === "done" ? `${formatCompletionTime(request.completedAt)} · ${imageCount} 张图片` : "");
  const thumbnail = request.thumbnail || null;

  return (
    <button
      type="button"
      className={cn(
        "grid min-h-22 w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-4 overflow-hidden rounded-md border bg-card p-2.5 text-left text-card-foreground shadow-xs transition-[border-color,box-shadow]",
        "hover:border-ring hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        selected && "border-ring ring-[3px] ring-ring/20",
      )}
      ref={buttonRef}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      aria-label={`查看 ${request.title} 的生成结果`}
    >
      <span className="flex size-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/20">
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
        <strong className="block min-w-0 truncate text-sm font-semibold">{request.title}</strong>
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
      <span className="flex shrink-0 items-start pt-0.5">
        <Badge variant={statusVariant(request.status)}>{REQUEST_STATUS_LABELS[request.status] || request.status}</Badge>
      </span>
    </button>
  );
}

function RequestListPanel({
  filteredRequests,
  selectedRequestId,
  selectedRequestFilter,
  requestCounts,
  now,
  onSelectRequest,
  onFilterChange,
  onOpenClearAll,
  onOpenClearFailed,
  formatRequestTiming,
  requestImageCount,
  payloadSize,
}: ReturnType<typeof useImageConsole> & {
  onSelectRequest: (id: string) => void;
  onFilterChange: (filter: RequestFilter) => void;
  onOpenClearAll: () => void;
  onOpenClearFailed: () => void;
}) {
  const hasRequests = requestCounts.all > 0;
  const hasFailedRequests = requestCounts.failed > 0;
  const requestButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  function focusRequest(id: string) {
    requestButtonRefs.current.get(id)?.focus();
  }

  function moveSelection(currentId: string, direction: -1 | 1) {
    const currentIndex = filteredRequests.findIndex((request) => request.id === currentId);
    if (currentIndex < 0) return;

    const nextRequest = filteredRequests[currentIndex + direction];
    if (!nextRequest) return;

    onSelectRequest(nextRequest.id);
    focusRequest(nextRequest.id);
  }

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card shadow-sm" aria-label="请求列表">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <strong className="min-w-0 shrink-0 truncate text-sm leading-none">请求列表</strong>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={!hasRequests} onClick={onOpenClearAll}>
                <Trash2Icon data-icon="inline-start" />
                清空全部
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除所有请求记录和本地图片详情</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasFailedRequests}
                onClick={onOpenClearFailed}
              >
                <AlertCircleIcon data-icon="inline-start" />
                清空失败
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除失败和已取消请求</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="border-b px-3 py-2">
        <Tabs value={selectedRequestFilter} onValueChange={(value) => onFilterChange(value as RequestFilter)}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 xl:grid-cols-4">
            {FILTERS.map((filter) => (
              <TabsTrigger key={filter} value={filter} className="min-w-0 gap-1 text-xs">
                <span className="truncate">{REQUEST_FILTER_LABELS[filter]}</span>
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
                <EmptyTitle>暂无请求</EmptyTitle>
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
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveSelection(request.id, 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveSelection(request.id, -1);
                  }
                }}
                onSelect={() => onSelectRequest(request.id)}
              />
            ))
          ) : (
            <Empty className="min-h-40 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertCircleIcon />
                </EmptyMedia>
                <EmptyTitle>{REQUEST_FILTER_EMPTY_TEXT[selectedRequestFilter]}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function Gallery({ request, loading }: { request: ImageRequestRecord | null; loading: boolean }) {
  const images = request?.status === "done" && !request.detailsMissing ? request.images : [];

  if (!images?.length) {
    return (
      <Empty className="h-full min-h-90 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {loading ? <Loader2Icon className="animate-spin" /> : <ImageIcon />}
          </EmptyMedia>
          <EmptyTitle>{selectedRequestEmptyText(request, loading)}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div
      className={cn(
        "grid h-full min-h-90 gap-3",
        images.length === 1 ? "grid-cols-1" : "grid-cols-[repeat(auto-fit,minmax(220px,1fr))]",
      )}
    >
      {images.map((image, index) => (
        <article key={`${image.src}-${index}`} className="image-checkerboard flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg border">
          <img
            src={image.src}
            alt={`Generated image ${index + 1}`}
            loading="lazy"
            className="block max-h-full max-w-full object-contain"
          />
        </article>
      ))}
    </div>
  );
}

function ResultPanel(consoleState: ReturnType<typeof useImageConsole>) {
  const {
    selectedRequest,
    selectedRequestDetailLoadingId,
    statusMessage,
    settings,
    selectedRequestTiming,
    selectedRequestJson,
    selectedRequestDownload,
    setJsonDialogOpen,
    cancelRequest,
    reusePrompt,
  } = consoleState;

  const canCancel = selectedRequest?.status === "queued" || selectedRequest?.status === "running";
  const canDownload = selectedRequest?.status === "done" && !selectedRequest.detailsMissing && selectedRequestDownload;
  const canReuse = Boolean(selectedRequest && reusablePromptForRequest(selectedRequest));
  const selectedRequestDetailLoading = selectedRequestDetailLoadingId === selectedRequest?.id;
  const inputPromptTooltip = selectedRequest?.sourcePrompt?.trim() || "暂无输入 Prompt";
  const revisedPromptTooltip = revisedPromptForResponse(selectedRequest?.response) || "未找到 revised_prompt";
  const statusHeading =
    statusMessage.state === "等待生成"
      ? `${statusMessage.state} · ${requestControlSummary(settings)}`
      : statusMessage.state;

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card shadow-sm" aria-live="polite">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
        <strong className="shrink-0 text-sm">{statusHeading}</strong>
        <span className="min-w-0 truncate text-right text-xs font-medium text-muted-foreground">{statusMessage.detail}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
          <div className="grid min-w-0 flex-1 gap-1">
            <strong className="min-w-0 truncate text-sm font-semibold">{selectedRequest?.title || "未选择请求"}</strong>
            <span className="truncate text-xs font-medium text-muted-foreground">
              {selectedRequest ? `${REQUEST_STATUS_LABELS[selectedRequest.status] || selectedRequest.status}` : "生成后点击请求查看结果。"}
            </span>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
            <ActionSlot visible={Boolean(canCancel)} label="取消请求">
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => cancelRequest(selectedRequest!.id)}>
                <XIcon data-icon="inline-start" />
                取消请求
              </Button>
            </ActionSlot>
            <ActionSlot visible={Boolean(selectedRequest)} label="复用 Prompt">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={!canReuse}
                    onClick={() => reusePrompt(selectedRequest!)}
                  >
                    <CopyIcon data-icon="inline-start" />
                    复用 Prompt
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                  {inputPromptTooltip}
                </TooltipContent>
              </Tooltip>
            </ActionSlot>
            <ActionSlot visible={Boolean(selectedRequestJson)} label="响应 JSON">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setJsonDialogOpen(true)}>
                    <FileJsonIcon data-icon="inline-start" />
                    响应 JSON
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                  {revisedPromptTooltip}
                </TooltipContent>
              </Tooltip>
            </ActionSlot>
            <ActionSlot visible={Boolean(canDownload)} label="下载">
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href={selectedRequestDownload?.href || "#"} download={selectedRequestDownload?.download}>
                  <DownloadIcon data-icon="inline-start" />
                  下载
                </a>
              </Button>
            </ActionSlot>
            <span className="w-44 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{selectedRequestTiming}</span>
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
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label="历史 Prompt">
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>历史 Prompt</FieldTitle>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {promptHistoryCount}/20{promptHistoryPinnedCount ? ` · ${promptHistoryPinnedCount} 已置顶` : ""}
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
                  aria-label={item.pinned ? `取消置顶：${item.prompt}` : `置顶 Prompt：${item.prompt}`}
                  title={item.pinned ? "取消置顶" : "置顶"}
                  onClick={() => onTogglePromptPin(item.prompt)}
                >
                  <PinIcon fill={item.pinned ? "currentColor" : "none"} data-icon="inline-start" />
                </Button>
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center overflow-hidden px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
                  title={item.prompt}
                  onClick={() => onSelectPrompt(item.prompt)}
                >
                  <span className="block min-w-0 flex-1 truncate">{item.prompt}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mr-1 shrink-0"
                  aria-label={`删除历史 Prompt：${item.prompt}`}
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
          暂无历史 Prompt
        </div>
      )}
    </section>
  );
}

function GeneratorPanel(consoleState: ReturnType<typeof useImageConsole>) {
  const {
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
    selectPromptHistory,
    deletePromptHistory,
    togglePromptHistoryPin,
  } = consoleState;

  function submitGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    enqueueGeneration("images");
  }

  return (
    <form onSubmit={submitGeneration} className="flex min-h-0 min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold leading-none">CPA Image</h2>
        </div>
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

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="prompt">Prompt</FieldLabel>
          <Textarea
            id="prompt"
            name="prompt"
            rows={4}
            maxLength={32000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="一只半透明玻璃质感的机械水母，漂浮在清晨的城市天台上，产品摄影，细节清晰"
            required
            className="min-h-24 resize-y"
          />
        </Field>

      </FieldGroup>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OptionSelect
          label="尺寸"
          value={String(settings.size)}
          options={SIZE_OPTIONS}
          onValueChange={(value) => updateSettings("size", value as AppSettings["size"])}
        />
        <OptionSelect
          label="质量"
          value={String(settings.quality)}
          options={QUALITY_OPTIONS}
          onValueChange={(value) => updateSettings("quality", value as AppSettings["quality"])}
        />
        <Field>
          <FieldLabel htmlFor="n">数量</FieldLabel>
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
        <OptionSelect
          label="背景"
          value={String(settings.background)}
          options={BACKGROUND_OPTIONS}
          onValueChange={(value) => updateSettings("background", value as AppSettings["background"])}
        />
        <OptionSelect
          label="格式"
          value={String(settings.outputFormat)}
          options={OUTPUT_FORMAT_OPTIONS}
          onValueChange={(value) => updateSettings("outputFormat", value as AppSettings["outputFormat"])}
        />
          <Field orientation="horizontal" className="h-9 self-end !items-center rounded-md border px-3 py-1">
            <Checkbox
              id="strictPrompt"
              checked={settings.strictPrompt}
              onCheckedChange={(checked) => updateSettings("strictPrompt", checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="strictPrompt" className="leading-none">
                保持原始 Prompt
              </FieldLabel>
            </FieldContent>
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
        <Button type="submit" size="lg">
          <PlayIcon data-icon="inline-start" />
          gpt-image-2
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => enqueueGeneration("responses")}>
          <ImageIcon data-icon="inline-start" />
          responses
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => enqueueGeneration("completions")}>
          <MessageSquareIcon data-icon="inline-start" />
          completions
        </Button>
      </div>
    </form>
  );
}

function SettingsDialog(consoleState: ReturnType<typeof useImageConsole>) {
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
          <DialogTitle>连接</DialogTitle>
          <DialogDescription>配置 CLIProxyAPI 的 OpenAI 兼容地址和代理 API Key。</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="baseUrl">API URL</FieldLabel>
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
            <FieldLabel htmlFor="apiKey">API Key</FieldLabel>
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
          <Field>
            <FieldLabel htmlFor="imageGenerationModel">LLM 模型</FieldLabel>
            <Input
              id="imageGenerationModel"
              type="text"
              spellCheck={false}
              value={settings.imageGenerationModel}
              onChange={(event) => updateSettings("imageGenerationModel", event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="requestConcurrency">并发</FieldLabel>
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
              <FieldLabel htmlFor="requestIntervalSeconds">间隔（秒）</FieldLabel>
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
              <FieldLabel htmlFor="rememberKey">在本浏览器记住 API Key</FieldLabel>
            </FieldContent>
          </Field>
          <FieldSet>
            <FieldTitle>请求地址</FieldTitle>
            <pre className="min-w-0 whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              {endpointPreview}
            </pre>
          </FieldSet>
        </FieldGroup>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={resetSettings}>
            <RotateCcwIcon data-icon="inline-start" />
            重置
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
              保存
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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>响应 JSON</DialogTitle>
          <DialogDescription className="sr-only">当前选中请求的 JSON 响应。</DialogDescription>
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
  const consoleState = useImageConsole();
  const [clearFailedDialogOpen, setClearFailedDialogOpen] = useState(false);

  return (
    <>
      <main className="grid min-h-dvh min-w-0 grid-cols-1 gap-3 p-3 lg:h-dvh lg:grid-cols-[380px_minmax(0,1fr)_minmax(310px,380px)] lg:overflow-hidden">
        <RequestListPanel
          {...consoleState}
          onSelectRequest={consoleState.setSelectedRequestId}
          onFilterChange={consoleState.setSelectedRequestFilter}
          onOpenClearAll={() => consoleState.setClearDialogOpen(true)}
          onOpenClearFailed={() => setClearFailedDialogOpen(true)}
        />
        <ResultPanel {...consoleState} />
        <GeneratorPanel {...consoleState} />
      </main>

      <SettingsDialog {...consoleState} />
      <ClearRequestsDialog
        open={consoleState.clearDialogOpen}
        onOpenChange={consoleState.setClearDialogOpen}
        title="清空全部"
        description="所有请求记录和图片详情缓存将被删除，进行中的请求会被取消。"
        confirmLabel="确认清空全部"
        onConfirm={() => {
          consoleState.setClearDialogOpen(false);
          consoleState.clearAllRequests();
        }}
      />
      <ClearRequestsDialog
        open={clearFailedDialogOpen}
        onOpenChange={setClearFailedDialogOpen}
        title="清空失败"
        description="失败和已取消的请求记录将被删除，进行中的请求会保留。"
        confirmLabel="确认清空失败"
        onConfirm={() => {
          setClearFailedDialogOpen(false);
          consoleState.clearFailedRequests();
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
