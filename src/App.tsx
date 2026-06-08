import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  FileJsonIcon,
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { FormEvent } from "react";

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
import { BACKGROUND_OPTIONS, DEFAULTS, OUTPUT_FORMAT_OPTIONS, QUALITY_OPTIONS, REQUEST_FILTER_EMPTY_TEXT, REQUEST_FILTER_LABELS, REQUEST_STATUS_LABELS, SIZE_OPTIONS, reusablePromptForRequest, type AppSettings, type ImageRequestRecord, type RequestFilter } from "@/lib/image-console";
import { cn } from "@/lib/utils";

const FILTERS: RequestFilter[] = ["all", "active", "done", "failed"];

function statusVariant(status: string) {
  if (status === "error" || status === "canceled") return "destructive" as const;
  if (status === "done") return "default" as const;
  return "secondary" as const;
}

function selectedRequestEmptyText(request: ImageRequestRecord | null) {
  if (!request) return "暂无图片";
  if (request.status === "queued") return "该请求正在排队";
  if (request.status === "running") return "该请求正在等待响应";
  if (request.status === "canceled") return request.error || "该请求已取消";
  if (request.status === "error") return request.error || "该请求失败";
  if (request.detailsMissing) return "历史已恢复，图片详情未能从本地缓存读取。";
  return "响应中没有找到图片";
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
  onSelect,
}: {
  request: ImageRequestRecord;
  selected: boolean;
  timing: string;
  imageCount: number;
  payloadSize: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-22 w-full items-stretch gap-3 rounded-md border bg-card p-3 text-left text-card-foreground shadow-xs transition-[border-color,box-shadow]",
        "hover:border-ring hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        selected && "border-ring ring-[3px] ring-ring/20",
      )}
      onClick={onSelect}
      aria-label={`查看 ${request.title} 的生成结果`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <strong className="truncate text-sm font-semibold">{request.title}</strong>
        <span className="truncate text-xs font-medium text-muted-foreground">{timing}</span>
        <span className="truncate text-xs text-muted-foreground">
          {request.status === "done"
            ? `${imageCount} 张图片`
            : request.error || `${request.method || "gpt-image-2"} · ${payloadSize} · n=1`}
        </span>
      </span>
      <span className="flex shrink-0 items-start">
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
  requestListCount,
  now,
  onSelectRequest,
  onFilterChange,
  onOpenClear,
  formatRequestTiming,
  requestImageCount,
  payloadSize,
}: ReturnType<typeof useImageConsole> & {
  onSelectRequest: (id: string) => void;
  onFilterChange: (filter: RequestFilter) => void;
  onOpenClear: () => void;
}) {
  const hasRequests = requestCounts.all > 0;

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card shadow-sm" aria-label="请求列表">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
        <div className="grid min-w-0 gap-1">
          <strong className="text-sm leading-none">请求列表</strong>
          <span className="truncate text-xs font-medium text-muted-foreground">{requestListCount}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasRequests}
              onClick={onOpenClear}
              aria-label="清空请求缓存"
            >
              <Trash2Icon data-icon="inline-start" />
              清空
            </Button>
          </TooltipTrigger>
          <TooltipContent>删除请求记录和本地图片详情</TooltipContent>
        </Tooltip>
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
            [...filteredRequests].reverse().map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                selected={request.id === selectedRequestId}
                timing={formatRequestTiming(request, now)}
                imageCount={requestImageCount(request)}
                payloadSize={payloadSize(request.payload)}
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

function Gallery({ request }: { request: ImageRequestRecord | null }) {
  const images = request?.status === "done" && !request.detailsMissing ? request.images : [];

  if (!images?.length) {
    return (
      <Empty className="h-full min-h-90 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon />
          </EmptyMedia>
          <EmptyTitle>{selectedRequestEmptyText(request)}</EmptyTitle>
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
    statusMessage,
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

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card shadow-sm" aria-live="polite">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
        <strong className="shrink-0 text-sm">{statusMessage.state}</strong>
        <span className="min-w-0 truncate text-right text-xs font-medium text-muted-foreground">{statusMessage.detail}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
          <div className="grid min-w-0 flex-1 gap-1">
            <strong className="truncate text-sm font-semibold">{selectedRequest?.title || "未选择请求"}</strong>
            <span className="truncate text-xs font-medium text-muted-foreground">
              {selectedRequest
                ? `${REQUEST_STATUS_LABELS[selectedRequest.status] || selectedRequest.status} · ${selectedRequest.endpoint}`
                : "生成后点击请求查看结果。"}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canCancel && (
              <Button type="button" variant="outline" size="sm" onClick={() => cancelRequest(selectedRequest.id)}>
                <XIcon data-icon="inline-start" />
                取消请求
              </Button>
            )}
            {selectedRequest && (
              <Button type="button" variant="outline" size="sm" disabled={!canReuse} onClick={() => reusePrompt(selectedRequest)}>
                <CopyIcon data-icon="inline-start" />
                复用 Prompt
              </Button>
            )}
            {canDownload && (
              <Button asChild variant="outline" size="sm">
                <a href={selectedRequestDownload.href} download={selectedRequestDownload.download}>
                  <DownloadIcon data-icon="inline-start" />
                  下载
                </a>
              </Button>
            )}
            {selectedRequestJson && (
              <Button type="button" variant="outline" size="sm" onClick={() => setJsonDialogOpen(true)}>
                <FileJsonIcon data-icon="inline-start" />
                响应 JSON
              </Button>
            )}
            <span className="w-44 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{selectedRequestTiming}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-4">
          <Gallery request={selectedRequest} />
        </div>
      </div>
    </section>
  );
}

function GeneratorPanel(consoleState: ReturnType<typeof useImageConsole>) {
  const { settings, prompt, connectionStatus, setPrompt, updateSettings, setSettingsOpen, enqueueGeneration } = consoleState;

  function submitGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    enqueueGeneration("images");
  }

  return (
    <form onSubmit={submitGeneration} className="flex min-h-0 min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase text-primary">Text to Image</p>
          <h2 className="text-xl font-semibold leading-none">生成</h2>
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
            rows={8}
            maxLength={32000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="一只半透明玻璃质感的机械水母，漂浮在清晨的城市天台上，产品摄影，细节清晰"
            required
            className="min-h-48 resize-y"
          />
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="strictPrompt"
            checked={settings.strictPrompt}
            onCheckedChange={(checked) => updateSettings("strictPrompt", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="strictPrompt">保持原始 Prompt</FieldLabel>
          </FieldContent>
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
      </div>

      <div className="mt-auto grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="submit" size="lg">
          <PlayIcon data-icon="inline-start" />
          gpt-image-2
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => enqueueGeneration("responses")}>
          <ImageIcon data-icon="inline-start" />
          image_generation
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
            <FieldLabel htmlFor="imageGenerationModel">image_generation 模型</FieldLabel>
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
                max={10}
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
          <Field orientation="horizontal">
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
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={testConnection}>
              <CheckCircle2Icon data-icon="inline-start" />
              测试
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
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>清空请求缓存</AlertDialogTitle>
          <AlertDialogDescription>所有请求记录和图片详情缓存将被删除，进行中的请求会被取消。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
          >
            确认清空
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

  return (
    <>
      <main className="grid min-h-dvh min-w-0 grid-cols-1 gap-3 p-3 lg:h-dvh lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_minmax(310px,380px)] lg:overflow-hidden">
        <RequestListPanel
          {...consoleState}
          onSelectRequest={consoleState.setSelectedRequestId}
          onFilterChange={consoleState.setSelectedRequestFilter}
          onOpenClear={() => consoleState.setClearDialogOpen(true)}
        />
        <ResultPanel {...consoleState} />
        <GeneratorPanel {...consoleState} />
      </main>

      <SettingsDialog {...consoleState} />
      <ClearRequestsDialog
        open={consoleState.clearDialogOpen}
        onOpenChange={consoleState.setClearDialogOpen}
        onConfirm={() => {
          consoleState.setClearDialogOpen(false);
          consoleState.clearAllRequests();
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
