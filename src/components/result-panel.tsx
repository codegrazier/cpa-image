import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileJsonIcon,
  ImageIcon,
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimedConfirmation } from "@/hooks/use-timed-confirmation";
import {
  imageDownloadName,
  payloadSize,
  requestStatusDisplayLabel,
  revisedPromptForResponse,
  reusablePromptForRequest,
  type EditInputImage,
  type GeneratedImage,
  type ImageRequestRecord,
} from "@/lib/image-console";
import { getCopy, useI18n, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const REQUEST_ERROR_PREVIEW_LIMIT = 240;
const DELETE_CONFIRMATION_TIMEOUT_MS = 3000;

function galleryGridLayout(count: number) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 8) return { cols: 4, rows: 2 };
  return { cols: 5, rows: 2 };
}

function galleryGridColsClass(cols: number) {
  switch (cols) {
    case 2:
      return "grid-cols-2";
    case 3:
      return "grid-cols-3";
    case 4:
      return "grid-cols-4";
    case 5:
      return "grid-cols-5";
    default:
      return "grid-cols-1";
  }
}

interface StatusMessage {
  state: string;
  detail: string;
}

function truncateDisplayText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function downloadRequestImage(
  request: Pick<ImageRequestRecord, "images" | "payload" | "title" | "method">,
  index: number,
) {
  const image = request.images?.[index];
  if (!image?.src) return;

  const isRemoteUrlFallback = /^https?:\/\//i.test(image.src);
  const anchor = document.createElement("a");
  anchor.href = image.src;
  anchor.rel = "noopener";
  if (isRemoteUrlFallback) {
    anchor.target = "_blank";
  } else {
    anchor.download = imageDownloadName(request, index);
  }
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadRequestImages(request: Pick<ImageRequestRecord, "images" | "payload" | "title" | "method">) {
  for (const [index, image] of (request.images || []).entries()) {
    if (!image?.src) continue;
    downloadRequestImage(request, index);
  }
}

function selectedRequestEmptyText(request: ImageRequestRecord | null, loading = false, language: Language = "zh") {
  const copy = getCopy(language);
  if (!request) return copy.requestCardEmpty.noImage;
  if (request.status === "queued") return copy.requestCardEmpty.queued;
  if (request.status === "running") return copy.requestCardEmpty.running;
  if (request.status === "canceled") return truncateDisplayText(request.error || copy.requestCardEmpty.canceled, REQUEST_ERROR_PREVIEW_LIMIT);
  if (request.status === "error") return truncateDisplayText(request.error || copy.requestCardEmpty.error, REQUEST_ERROR_PREVIEW_LIMIT);
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

function selectedRequestImageSize(request: ImageRequestRecord | null) {
  const bytes = Number(request?.imageSizeBytes || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function ActionSlot({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("shrink-0", !visible && "hidden")}
      aria-hidden={!visible}
      {...(!visible ? { inert: true } : {})}
    >
      {children}
    </div>
  );
}

function Gallery({
  request,
  loading,
  onEditImage,
}: {
  request: ImageRequestRecord | null;
  loading: boolean;
  onEditImage: (value: string) => void;
}) {
  const { copy, language } = useI18n();
  const images = request?.status === "done" && !request.detailsMissing ? request.images : [];
  const requestId = request?.id || "";
  const [rotationByImageKey, setRotationByImageKey] = useState<Record<string, number>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const isDetailLoading = Boolean(
    request &&
      request.status === "done" &&
      !request.detailsMissing &&
      !images.length &&
      (loading || request.hasCachedDetails),
  );
  const displayImageCount = request?.status === "done" && !request.detailsMissing ? images.length : 0;

  useEffect(() => {
    setRotationByImageKey({});
    setPreviewIndex(null);
  }, [requestId]);

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

  const { cols, rows } = galleryGridLayout(displayImageCount);

  return (
    <>
      <div
        className={cn("grid h-full min-h-0 overflow-hidden gap-3", galleryGridColsClass(cols))}
        style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        data-testid="result-gallery"
      >
        {Array.from({ length: displayImageCount }, (_, index) => {
          const image = (images[index] || null) as GeneratedImage | null;
          const imageKey = `${requestId || "empty"}-${index}`;
          const rotation = rotationByImageKey[imageKey] || 0;
          const altSize = payloadSize(request?.payload);
          const altMode = request?.method || "";
          return (
            <article
              key={imageKey}
              className="image-checkerboard group relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg border"
            >
              {image ? (
                <>
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-xs"
                          aria-label={copy.requestCardStatus.downloadImage}
                          className="border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                          onClick={() => request && downloadRequestImage(request, index)}
                        >
                          <DownloadIcon data-icon="inline-start" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>{copy.requestCardStatus.downloadImage}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-xs"
                          aria-label={copy.requestCardStatus.editImage}
                          className="border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                          onClick={() => onEditImage(`${requestId}:${index}`)}
                        >
                          <PencilIcon data-icon="inline-start" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>{copy.requestCardStatus.editImage}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-xs"
                          aria-label={copy.requestCardStatus.rotateCounterclockwise}
                          className="border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                          onClick={() =>
                            setRotationByImageKey((current) => ({
                              ...current,
                              [imageKey]: (current[imageKey] || 0) - 90,
                            }))
                          }
                        >
                          <RotateCcwIcon data-icon="inline-start" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>{copy.requestCardStatus.rotateCounterclockwise}</TooltipContent>
                    </Tooltip>
                  </div>
                  <button
                    type="button"
                    className="block h-full w-full cursor-zoom-in"
                    aria-label={`${copy.requestCardStatus.previewGeneratedImage} ${index + 1}`}
                    onClick={() => setPreviewIndex(index)}
                  >
                    <img
                      src={image.src}
                      alt={copy.generatedImageAlt(index, { size: altSize, mode: altMode })}
                      loading="lazy"
                      className="block h-full w-full object-contain transition-transform duration-200"
                      style={{ transform: `rotate(${rotation}deg)` }}
                    />
                  </button>
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {loading ? <Loader2Icon className="size-5 animate-spin text-muted-foreground" /> : <ImageIcon className="size-6 text-muted-foreground" />}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <ImagePreviewDialog
        images={images}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        title={copy.requestCardStatus.previewGeneratedImage}
        previousLabel={copy.generator.previewPreviousImage}
        nextLabel={copy.generator.previewNextImage}
      />
    </>
  );
}

export function ResultPanel({
  selectedRequest,
  selectedRequestDetailLoadingId,
  statusMessage,
  selectedRequestJson,
  setJsonDialogOpen,
  reusePrompt,
  onEditImage,
  onDeleteRequest,
}: {
  selectedRequest: ImageRequestRecord | null;
  selectedRequestDetailLoadingId: string | null;
  statusMessage: StatusMessage;
  selectedRequestJson: string;
  setJsonDialogOpen: (open: boolean) => void;
  reusePrompt: (request: ImageRequestRecord) => void;
  onEditImage: (value: string) => void;
  onDeleteRequest: (id: string) => void;
}) {
  const { copy, language } = useI18n();
  const { pendingKey: pendingDeleteRequestId, requestConfirmation } = useTimedConfirmation(DELETE_CONFIRMATION_TIMEOUT_MS);
  const canDelete = Boolean(
    selectedRequest && selectedRequest.status !== "queued" && selectedRequest.status !== "running",
  );
  const isConfirmingDelete = Boolean(canDelete && selectedRequest && pendingDeleteRequestId === selectedRequest.id);
  const deleteLabel = copy.requestCardStatus.delete;
  const deleteAriaLabel = selectedRequest
    ? language === "en"
      ? `Delete ${selectedRequest.title}`
      : `删除 ${selectedRequest.title}`
    : copy.requestCardStatus.delete;
  const canDownload = selectedRequest?.status === "done";
  const canReuse = Boolean(selectedRequest && reusablePromptForRequest(selectedRequest));
  const canShowResponseJson = Boolean(selectedRequest && selectedRequest.status !== "queued" && selectedRequest.status !== "running");
  const responseJsonDisabled = !selectedRequestJson;
  const selectedRequestDetailLoading = selectedRequestDetailLoadingId === selectedRequest?.id;
  const selectedRequestResolution = selectedRequestImageResolution(selectedRequest);
  const selectedRequestSize = selectedRequestImageSize(selectedRequest);
  const selectedRequestStatusText = selectedRequest
    ? `${requestStatusDisplayLabel(copy.requestStatusLabels, selectedRequest.status)}${selectedRequestResolution ? ` · ${selectedRequestResolution}` : ""}${selectedRequestSize ? ` · ${selectedRequestSize}` : ""}`
    : copy.requestCardStatus.unselectedSubtitle;
  const inputPromptTooltip = selectedRequest?.sourcePrompt?.trim() || (language === "en" ? "No input Prompt" : "暂无输入 Prompt");
  const revisedPromptTooltip = revisedPromptForResponse(selectedRequest?.response) || (language === "en" ? "No revised_prompt found" : "未找到 revised_prompt");

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card shadow-none"
      aria-live="polite"
      aria-label={copy.resultSectionLabel}
    >
      <h2 className="sr-only">{copy.resultSectionLabel}</h2>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
        <strong className="shrink-0 text-sm">{statusMessage.state}</strong>
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
            <ActionSlot visible={canDelete}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={isConfirmingDelete ? "text-destructive hover:text-destructive" : undefined}
                aria-label={deleteAriaLabel}
                onClick={() => {
                  if (!selectedRequest) return;
                  if (!requestConfirmation(selectedRequest.id)) return;
                  onDeleteRequest(selectedRequest.id);
                }}
              >
                {isConfirmingDelete ? <CheckIcon data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                {deleteLabel}
              </Button>
            </ActionSlot>
            <ActionSlot visible={Boolean(canDownload)}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedRequest?.images?.length}
                onClick={() => {
                  if (!selectedRequest?.images?.length) return;
                  downloadRequestImages(selectedRequest);
                }}
              >
                <DownloadIcon data-icon="inline-start" />
                {copy.requestCardStatus.download}
              </Button>
            </ActionSlot>
            <ActionSlot visible={canShowResponseJson}>
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
            <ActionSlot visible={Boolean(selectedRequest)}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canReuse}
                    onClick={() => {
                      if (!selectedRequest) return;
                      reusePrompt(selectedRequest);
                    }}
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

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="flex h-full min-h-90 min-w-0 overflow-hidden gap-3">
            <RequestInputImageRail request={selectedRequest} />
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <Gallery request={selectedRequest} loading={selectedRequestDetailLoading} onEditImage={onEditImage} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function requestInputImages(request: ImageRequestRecord | null) {
  if (request?.method !== "edit") return [];
  return (request.editImages || []).filter((image) => image.src);
}

function RequestInputImageRail({ request }: { request: ImageRequestRecord | null }) {
  const { copy } = useI18n();
  const inputImages = requestInputImages(request);
  const requestId = request?.id || "";
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    setPreviewIndex(null);
  }, [requestId]);

  if (!inputImages.length) return null;

  return (
    <>
      <div
        className="flex w-16 shrink-0 flex-col gap-1.5 overflow-y-auto"
        data-testid="request-input-image-rail"
      >
        {inputImages.map((image, index) => (
          <RequestInputImageThumb
            key={`${image.sourceKey || image.name}-${index}`}
            image={image}
            index={index}
            label={`${copy.requestCardStatus.previewInputImage} ${index + 1}`}
            onPreview={() => setPreviewIndex(index)}
          />
        ))}
      </div>
      <ImagePreviewDialog
        images={inputImages}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        title={copy.requestCardStatus.previewInputImage}
        previousLabel={copy.generator.previewPreviousImage}
        nextLabel={copy.generator.previewNextImage}
      />
    </>
  );
}

function RequestInputImageThumb({
  image,
  index,
  label,
  onPreview,
}: {
  image: EditInputImage;
  index: number;
  label: string;
  onPreview: () => void;
}) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-muted/30">
      <button
        type="button"
        className="block h-full w-full cursor-zoom-in"
        aria-label={label}
        data-testid={`request-input-image-${index + 1}`}
        onClick={onPreview}
      >
        <img
          src={image.src}
          alt=""
          aria-hidden="true"
          className="block h-full w-full object-cover object-center"
        />
      </button>
    </div>
  );
}
