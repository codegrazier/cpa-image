import {
  prepareImageForRuntime,
  sanitizeResponseForDisplay,
  type GeneratedImage,
  type ImageRequestRecord,
} from "@/lib/image-console";

export function imageSizeBytes(images: GeneratedImage[]) {
  return images.reduce((sum, image) => sum + (image.blob?.size || 0), 0);
}

export function imageResolution(images: GeneratedImage[]) {
  const [image] = images;
  if (!image?.width || !image.height) return "";
  return `${image.width}x${image.height}`;
}

export function runtimeImagesForRequest({
  localImages,
  detailImages,
  keepRuntimeDetails,
}: {
  localImages: GeneratedImage[];
  detailImages: GeneratedImage[];
  keepRuntimeDetails: boolean;
}) {
  if (!keepRuntimeDetails) return [];

  const runtimeSourceImages = detailImages.length === localImages.length && detailImages.length > 0 ? detailImages : localImages;
  return runtimeSourceImages.map(prepareImageForRuntime);
}

export function applyCompletedRequestResult(
  request: ImageRequestRecord,
  {
    rawResponse,
    displayResponse,
    extractedImageCount,
    localImages,
    detailImages,
    thumbnail,
    missingImageMessage,
    keepRuntimeDetails,
    endedAt,
    completedAt,
  }: {
    rawResponse: unknown;
    displayResponse: unknown;
    extractedImageCount: number;
    localImages: GeneratedImage[];
    detailImages: GeneratedImage[];
    thumbnail: GeneratedImage | null;
    missingImageMessage: string;
    keepRuntimeDetails: boolean;
    endedAt: number;
    completedAt: number;
  },
): ImageRequestRecord {
  return {
    ...request,
    thumbnail: thumbnail || request.thumbnail || null,
    response: keepRuntimeDetails ? displayResponse : null,
    rawResponse,
    images: runtimeImagesForRequest({ localImages, detailImages, keepRuntimeDetails }),
    imageCount: extractedImageCount,
    imageSizeBytes: request.imageSizeBytes || imageSizeBytes(detailImages),
    imageResolution: request.imageResolution || imageResolution(detailImages),
    hasCachedDetails: true,
    status: extractedImageCount ? "done" : "error",
    error: missingImageMessage,
    endedAt,
    completedAt: extractedImageCount ? completedAt : request.completedAt ?? null,
    editImages: [],
  };
}

export function applyFailedRequestResult(
  request: ImageRequestRecord,
  {
    error,
    requestCanceledMessage,
    endedAt,
  }: {
    error: Error & { responseBody?: unknown };
    requestCanceledMessage: string;
    endedAt: number;
  },
): ImageRequestRecord {
  const aborted = error.name === "AbortError";
  const responseBody = error.responseBody;

  return {
    ...request,
    status: aborted ? "canceled" : "error",
    error: aborted ? requestCanceledMessage : error.message,
    response: aborted ? request.response : responseBody == null ? null : sanitizeResponseForDisplay(responseBody),
    rawResponse: aborted ? request.rawResponse : responseBody == null ? null : responseBody,
    endedAt,
    editImages: [],
  };
}
