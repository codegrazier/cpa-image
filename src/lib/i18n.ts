import { createElement, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULTS,
  DEFAULT_STRICT_PROMPT_TEXT,
  DEFAULT_STRICT_PROMPT_TEXT_EN,
  requestControlSummary as baseRequestControlSummary,
  type AppSettings,
  type RequestFilter,
  type RequestStatus,
} from "@/lib/image-console";

export type Language = "zh" | "en";
export type LanguageLocale = "zh-CN" | "en-US";

const LANGUAGE_STORAGE_KEY = "CPA-Image-language";
const LANGUAGE_QUERY_KEY = "lang";
export const SITE_ORIGIN = "https://cpa-image.site";
export const LANGUAGE_LOCALES: Record<Language, LanguageLocale> = {
  zh: "zh-CN",
  en: "en-US",
};
const LANGUAGE_FROM_LOCALE: Record<string, Language> = {
  zh: "zh",
  "zh-cn": "zh",
  en: "en",
  "en-us": "en",
};

const SEO_COPY: Record<
  Language,
  {
    title: string;
    description: string;
    ogLocale: string;
    ogLocaleAlternate: string;
    imageAlt: string;
  }
> = {
  zh: {
    title: "CPA Image | OpenAI 图像生成与编辑控制台",
    description: "CPA Image 是一个 OpenAI 兼容的图像生成与编辑控制台，支持 2K/4K 高清尺寸、批量请求、并发控制和本地缓存安全策略。",
    ogLocale: "zh_CN",
    ogLocaleAlternate: "en_US",
    imageAlt: "CPA Image OpenAI 图像生成与编辑控制台",
  },
  en: {
    title: "CPA Image | OpenAI Image Generation and Editing Console",
    description: "CPA Image is an OpenAI-compatible image generation and editing console with 2K/4K output, batch requests, concurrency control, and a local caching safety strategy.",
    ogLocale: "en_US",
    ogLocaleAlternate: "zh_CN",
    imageAlt: "CPA Image OpenAI image generation and editing console",
  },
};

export function getLanguageLocale(language: Language): LanguageLocale {
  return LANGUAGE_LOCALES[language];
}

export function getSeoMetadata(language: Language) {
  const locale = getLanguageLocale(language);
  const alternateLanguage = language === "zh" ? "en" : "zh";
  const alternateLocale = getLanguageLocale(alternateLanguage);
  const canonicalUrl = `${SITE_ORIGIN}/${locale}/`;

  return {
    locale,
    alternateLocale,
    title: SEO_COPY[language].title,
    description: SEO_COPY[language].description,
    imageAlt: SEO_COPY[language].imageAlt,
    canonicalUrl,
    alternateUrls: {
      zh: `${SITE_ORIGIN}/zh-CN/`,
      en: `${SITE_ORIGIN}/en-US/`,
      xDefault: SITE_ORIGIN,
    },
    ogLocale: SEO_COPY[language].ogLocale,
    ogLocaleAlternate: SEO_COPY[language].ogLocaleAlternate,
  };
}

function languageFromValue(value: string | null | undefined): Language | null {
  const normalized = String(value || "").trim().toLowerCase();
  return LANGUAGE_FROM_LOCALE[normalized] || null;
}

function languageFromBrowser(): Language {
  if (typeof navigator === "undefined") return "zh";

  const candidates = [navigator.language, ...(Array.isArray(navigator.languages) ? navigator.languages : [])]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (candidates.some((value) => value.startsWith("zh"))) return "zh";
  if (candidates.some((value) => value.startsWith("en"))) return "en";
  return "en";
}

function languageFromLocation(search: string): Language | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  return languageFromValue(params.get(LANGUAGE_QUERY_KEY));
}

function languageFromPathname(pathname: string): Language | null {
  const firstSegment = String(pathname || "")
    .split("/")
    .filter(Boolean)[0];
  return languageFromValue(firstSegment);
}

function initialLanguage(): Language {
  if (typeof window === "undefined") return "zh";

  return (
    languageFromPathname(window.location.pathname) ||
    languageFromLocation(window.location.search) ||
    languageFromValue(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) ||
    languageFromBrowser()
  );
}

function currentLanguageUrl(language: Language) {
  const url = new URL(`${SITE_ORIGIN}/${LANGUAGE_LOCALES[language]}/`);
  return url;
}

function syncMeta(nameOrProperty: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;
  const selector = `meta[${nameOrProperty}="${key}"]`;
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(nameOrProperty, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function syncLink(rel: string, href: string, hreflang?: string) {
  if (typeof document === "undefined") return;
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
  let element = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    if (hreflang) element.hreflang = hreflang;
    document.head.appendChild(element);
  }
  element.href = href;
}

function syncDocumentLanguage(language: Language) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const seo = getSeoMetadata(language);
  const url = currentLanguageUrl(language);

  document.documentElement.lang = seo.locale;
  document.title = seo.title;
  syncMeta("name", "description", seo.description);
  syncMeta("property", "og:type", "website");
  syncMeta("property", "og:site_name", "CPA Image");
  syncMeta("property", "og:locale", seo.ogLocale);
  syncMeta("property", "og:locale:alternate", seo.ogLocaleAlternate);
  syncMeta("property", "og:title", seo.title);
  syncMeta("property", "og:description", seo.description);
  syncMeta("property", "og:url", url.toString());
  syncMeta("property", "og:image", `${SITE_ORIGIN}/og-image.svg`);
  syncMeta("property", "og:image:alt", seo.imageAlt);
  syncMeta("name", "twitter:card", "summary_large_image");
  syncMeta("name", "twitter:title", seo.title);
  syncMeta("name", "twitter:description", seo.description);
  syncMeta("name", "twitter:image", `${SITE_ORIGIN}/og-image.svg`);
  syncMeta("name", "twitter:image:alt", seo.imageAlt);
  syncLink("canonical", seo.canonicalUrl);
  syncLink("alternate", seo.alternateUrls.zh, LANGUAGE_LOCALES.zh);
  syncLink("alternate", seo.alternateUrls.en, LANGUAGE_LOCALES.en);
  syncLink("alternate", seo.alternateUrls.xDefault, "x-default");

  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = `/${seo.locale}/`;
  nextUrl.searchParams.delete(LANGUAGE_QUERY_KEY);
  if (window.location.pathname !== nextUrl.pathname || window.location.search !== nextUrl.search) {
    window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }
}

type Copy = {
  appName: string;
  languageName: string;
  switchLanguageTooltip: string;
  requestList: string;
  requestSummary: (settings: Pick<AppSettings, "requestConcurrency" | "requestIntervalSeconds">) => string;
  clearAll: string;
  cancelRequests: string;
  clearCompleted: string;
  clearFailed: string;
  exportZip: {
    button: string;
    tooltip: string;
    title: string;
    description: (count: number) => string;
    confirm: string;
    progressTitle: string;
    progressDescription: string;
    progressStatus: (current: number, total: number) => string;
    success: (count: number) => string;
    failed: string;
    noImages: string;
  };
  requestListTooltips: {
    clearAll: string;
    cancelRequests: string;
    clearCompleted: string;
    clearFailed: string;
  };
  filterLabels: Record<RequestFilter, string>;
  filterEmptyText: Record<RequestFilter, string>;
  requestStatusLabels: Record<RequestStatus, string>;
  queueRunning: (settings: Pick<AppSettings, "requestConcurrency" | "requestIntervalSeconds">, counts: {
    running: number;
    queued: number;
    done: number;
    failed: number;
  }) => { state: string; detail: string };
  queueComplete: (
    settings: Pick<AppSettings, "requestConcurrency" | "requestIntervalSeconds">,
    counts: { done: number; failed: number; canceled: number; imageCount: number },
  ) => { state: string; detail: string };
  waitingGeneration: { state: string; detail: string };
  requestCardEmpty: {
    noImage: string;
    queued: string;
    running: string;
    canceled: string;
    error: string;
    loading: string;
    restored: string;
    missing: string;
  };
  requestCardStatus: {
    unselectedTitle: string;
    unselectedSubtitle: string;
    cancel: string;
    delete: string;
    deletedRequest: string;
    reusePrompt: string;
    responseJson: string;
    download: string;
    editImage: string;
    rotateCounterclockwise: string;
    resolution: string;
  };
  promptHistory: {
    title: string;
    empty: string;
    pinned: string;
    pin: string;
    unpin: string;
    delete: string;
    refilled: string;
  };
  promptEditor: {
    title: string;
    description: string;
    header: string;
    footer: string;
    defaultText: string;
    bodyLabel: string;
    cancel: string;
    restoreDefault: string;
    confirm: string;
  };
  generator: {
    generate: string;
    edit: string;
    settings: string;
    promptLabel: string;
    promptPlaceholder: string;
    editPromptPlaceholder: string;
    selectLocalImage: string;
    selectHistoricalImage: string;
    choose: string;
    noHistoricalImages: string;
    selectAtLeastOneImage: string;
    maxEditImages: (count: number) => string;
    size: string;
    quality: string;
    count: string;
    keepOriginalPrompt: string;
    keep: string;
    editOriginalPrompt: string;
    editOriginalPromptTooltip: string;
    promptRequired: string;
    requestNotCreated: string;
    connectionRequired: string;
    requestQueued: string;
    submissionSuccess: (count: number) => string;
    generations: string;
    responses: string;
    completions: string;
    edits: string;
  };
  settings: {
    title: string;
    description: string;
    apiUrl: string;
    apiKey: string;
    rememberKey: string;
    crossOriginProxy: string;
    crossOriginProxyConfirm: {
      title: string;
      description: string;
      confirm: string;
    };
    generationsModel: string;
    editsModel: string;
    responsesModel: string;
    completionsModel: string;
    concurrency: string;
    interval: string;
    endpointPreview: string;
    reset: string;
    save: string;
  };
  clearDialog: {
    cancel: string;
    clearAll: { title: string; description: string; confirm: string };
    cancelRequests: { title: string; description: string; confirm: string };
    clearFailed: { title: string; description: string; confirm: string };
    clearCompleted: { title: string; description: string; confirm: string };
  };
  responseJson: { title: string; description: string };
  historyImage: {
    selected: string;
    local: string;
    generated: string;
    buttonLabel: string;
    deleteButton: string;
    tooltip: string;
  };
  runtime: {
    editRequestMissingImages: string;
    missingHistoricalRequest: string;
    historicalImageExists: (requestTitle: string, imageIndex: number) => string;
    historicalImageFull: string;
    historicalRequestHasNoImage: string;
    historicalImageNotFound: string;
    historicalImageNotEditable: string;
    historicalImageAddedToEdit: (requestTitle: string, imageIndex: number) => string;
    historicalImageLoadFailed: string;
    requestCanceled: string;
    requestCanceledBeforeSend: string;
    requestsCanceled: (count: number) => string;
    allRequestsCleared: string;
    completedRequestsCleared: string;
    failedRequestsCleared: string;
    requestFailed: string;
    crossOriginRequestFailed: string;
    queuedRequestDetail: (method: string, count: number, summary: string, endpoint: string) => string;
  };
  tests: {
    test: string;
    connectionTesting: string;
    connectionNormal: string;
    connectionNormalDetail: string;
    connectionFailed: string;
    connectionSaved: string;
    connectionReset: string;
    connectionResetDetail: string;
  };
};

function englishRequestControlSummary(settings: Pick<AppSettings, "requestConcurrency" | "requestIntervalSeconds">) {
  return `Concurrency ${settings.requestConcurrency} · Interval ${settings.requestIntervalSeconds}s`;
}

const COPY: Record<Language, Copy> = {
  zh: {
    appName: "CPA Image",
    languageName: "中文",
    switchLanguageTooltip: "切换到 English",
    requestList: "请求列表",
    requestSummary: (settings) => baseRequestControlSummary(settings),
    clearAll: "清空全部",
    cancelRequests: "取消请求",
    clearCompleted: "清空完成",
    clearFailed: "清空失败",
    exportZip: {
      button: "导出 ZIP",
      tooltip: "批量导出全部已完成图片",
      title: "导出全部已完成图片？",
      description: (count) => `将把当前 ${count} 个已完成请求中的可用图片打包为 ZIP 下载。`,
      confirm: "确认导出",
      progressTitle: "正在导出 ZIP",
      progressDescription: "正在读取本地图片详情并打包，请不要关闭页面。",
      progressStatus: (current, total) => (total > 0 ? `已处理 ${current}/${total} 张图片` : "正在准备图片"),
      success: (count) => `已成功导出 ${count} 张图片。`,
      failed: "导出 ZIP 失败。",
      noImages: "没有可导出的已完成图片。",
    },
    requestListTooltips: {
      clearAll: "删除所有请求记录和本地图片详情",
      cancelRequests: "取消所有进行中和排队请求",
      clearCompleted: "删除已完成请求和本地图片详情",
      clearFailed: "删除失败和已取消请求",
    },
    filterLabels: {
      all: "全部",
      active: "进行中",
      done: "已完成",
      failed: "已失败",
    },
    filterEmptyText: {
      all: "暂无请求",
      active: "暂无进行中请求",
      done: "暂无已完成请求",
      failed: "暂无失败或取消请求",
    },
    requestStatusLabels: {
      queued: "排队中",
      running: "生成中",
      done: "完成",
      error: "失败",
      canceled: "取消",
    },
    queueRunning: (settings, counts) => ({
      state: "队列运行中",
      detail: `${baseRequestControlSummary(settings)} · 运行 ${counts.running} · 排队 ${counts.queued} · 完成 ${counts.done} · 失败 ${counts.failed}`,
    }),
    queueComplete: (settings, counts) => ({
      state: `队列完成 ${counts.imageCount} 张`,
      detail: `${baseRequestControlSummary(settings)} · 完成 ${counts.done} · 失败 ${counts.failed} · 取消 ${counts.canceled}`,
    }),
    waitingGeneration: { state: "等待生成", detail: "配置 URL 和 API Key 后即可开始。" },
    requestCardEmpty: {
      noImage: "暂无图片",
      queued: "该请求正在排队",
      running: "该请求正在等待响应",
      canceled: "该请求已取消",
      error: "该请求失败",
      loading: "历史详情加载中",
      restored: "历史已恢复，图片详情未能从本地缓存读取。",
      missing: "响应中没有找到图片",
    },
    requestCardStatus: {
      unselectedTitle: "未选择请求",
      unselectedSubtitle: "生成后点击请求查看结果。",
      cancel: "取消请求",
      delete: "删除",
      deletedRequest: "已删除请求",
      reusePrompt: "复用 Prompt",
      responseJson: "响应 JSON",
      download: "下载",
      editImage: "编辑图片",
      rotateCounterclockwise: "逆时针旋转图片",
      resolution: "响应分辨率",
    },
    promptHistory: {
      title: "历史 Prompt",
      empty: "暂无历史 Prompt",
      pinned: "已置顶",
      pin: "置顶",
      unpin: "取消置顶",
      delete: "删除",
      refilled: "历史 Prompt 已回填",
    },
    promptEditor: {
      title: "编辑原始 Prompt",
      description: "首尾两行固定不可修改，只编辑中间正文。开启此功能也不能保证完全保持原始 Prompt。",
      header: "请把下面的原始 Prompt 当作最终图像指令执行。",
      footer: "原始 Prompt:",
      defaultText: DEFAULT_STRICT_PROMPT_TEXT,
      bodyLabel: "原始 Prompt 正文",
      cancel: "取消",
      restoreDefault: "恢复默认",
      confirm: "确定",
    },
    generator: {
      generate: "生图",
      edit: "编辑",
      settings: "配置",
      promptLabel: "Prompt",
      promptPlaceholder: "一只半透明玻璃质感的机械水母，漂浮在清晨的城市天台上，产品摄影，细节清晰",
      editPromptPlaceholder: "例如：保留原图主体，只调整光影和风格",
      selectLocalImage: "选择本地图片",
      selectHistoricalImage: "选择已生成图片",
      choose: "请选择",
      noHistoricalImages: "暂无可选图片",
      selectAtLeastOneImage: "请选择一张或多张图片。",
      maxEditImages: (count) => `编辑模式最多选择 ${count} 张图片。`,
      size: "尺寸",
      quality: "质量",
      count: "请求次数",
      keepOriginalPrompt: "保持原始 Prompt",
      keep: "保持",
      editOriginalPrompt: "编辑原始 Prompt 文案",
      editOriginalPromptTooltip: "编辑原始 Prompt 文案",
      promptRequired: "请先输入 Prompt。",
      requestNotCreated: "请求未创建",
      connectionRequired: "请先配置 API URL 和 API Key。",
      requestQueued: "请求已加入队列",
      submissionSuccess: (count) => `成功提交 ${count} 个请求。`,
      generations: "generations",
      responses: "responses",
      completions: "completions",
      edits: "edits",
    },
    settings: {
      title: "连接",
      description: "配置 OpenAI 兼容地址和 API Key。",
      apiUrl: "API URL",
      apiKey: "API Key",
      rememberKey: "在本浏览器记住 API Key",
      crossOriginProxy: "启用跨域请求代理",
      crossOriginProxyConfirm: {
        title: "启用跨域请求代理？",
        description:
          "启用后，API 请求会先通过代理服务转发，用于绕过浏览器跨域限制。代理服务可能会接触到您的 API URL、请求头、Prompt、图片等请求内容。请仅在您信任此代理服务时启用。",
        confirm: "启用",
      },
      generationsModel: "generations 模型",
      editsModel: "edits 模型",
      responsesModel: "responses 模型",
      completionsModel: "completions 模型",
      concurrency: "并发",
      interval: "间隔（秒）",
      endpointPreview: "请求地址",
      reset: "重置",
      save: "保存",
    },
    clearDialog: {
      cancel: "取消",
      clearAll: {
        title: "清空全部",
        description: "所有请求记录和图片详情缓存将被删除，进行中的请求会被取消。",
        confirm: "确认清空全部",
      },
      cancelRequests: {
        title: "取消请求",
        description: "所有进行中和排队请求将被取消。",
        confirm: "确认取消请求",
      },
      clearFailed: {
        title: "清空失败",
        description: "失败和已取消的请求记录将被删除，进行中的请求会保留。",
        confirm: "确认清空失败",
      },
      clearCompleted: {
        title: "清空完成",
        description: "已完成的请求记录和图片详情将被删除，进行中的请求会保留。",
        confirm: "确认清空完成",
      },
    },
    responseJson: { title: "响应 JSON", description: "当前选中请求的 JSON 响应。" },
    historyImage: {
      selected: "选择已生成图片",
      local: "选择本地图片",
      generated: "选择已生成图片",
      buttonLabel: "请选择",
      deleteButton: "删除输入图片",
      tooltip: "切换到历史图片输入",
    },
    runtime: {
      editRequestMissingImages: "编辑请求缺少输入图片。",
      missingHistoricalRequest: "未找到对应的历史请求。",
      historicalImageExists: (requestTitle, imageIndex) => `${requestTitle} · 图片 ${imageIndex + 1}`,
      historicalImageFull: "历史图片已满",
      historicalRequestHasNoImage: "该历史请求没有可用图片。",
      historicalImageNotFound: "未找到该历史图片。",
      historicalImageNotEditable: "该历史图片暂不支持加入编辑。",
      historicalImageAddedToEdit: (requestTitle, imageIndex) => `${requestTitle} · 图片 ${imageIndex + 1}`,
      historicalImageLoadFailed: "历史图片加载失败。",
      requestCanceled: "已取消请求",
      requestCanceledBeforeSend: "请求已取消，未发送。",
      requestsCanceled: (count) => `${count} 个请求已取消。`,
      allRequestsCleared: "所有请求缓存已清空。",
      completedRequestsCleared: "已完成请求已删除。",
      failedRequestsCleared: "失败和已取消请求已删除。",
      requestFailed: "请求失败",
      crossOriginRequestFailed: "浏览器阻止了跨域请求，请检查上游代理的 CORS 配置。",
      queuedRequestDetail: (method, count, summary, endpoint) => `${method} · ${count} 个新请求 · ${summary} · ${endpoint}`,
    },
    tests: {
      test: "测试",
      connectionTesting: "测试中",
      connectionNormal: "连接正常",
      connectionNormalDetail: "模型列表接口已返回。",
      connectionFailed: "连接失败",
      connectionSaved: "已保存",
      connectionReset: "配置",
      connectionResetDetail: "默认 URL 已恢复。",
    },
  },
  en: {
    appName: "CPA Image",
    languageName: "English",
    switchLanguageTooltip: "Switch to 中文",
    requestList: "Requests",
    requestSummary: (settings) => englishRequestControlSummary(settings),
    clearAll: "Clear all",
    cancelRequests: "Cancel",
    clearCompleted: "Clear done",
    clearFailed: "Clear failed",
    exportZip: {
      button: "Export ZIP",
      tooltip: "Export all completed images as a ZIP",
      title: "Export all completed images?",
      description: (count) => `Available images from ${count} completed request${count === 1 ? "" : "s"} will be packaged into a ZIP file.`,
      confirm: "Export",
      progressTitle: "Exporting ZIP",
      progressDescription: "Reading local image details and packaging the ZIP. Keep this page open.",
      progressStatus: (current, total) => (total > 0 ? `Processed ${current}/${total} images` : "Preparing images"),
      success: (count) => `Exported ${count} image${count === 1 ? "" : "s"}.`,
      failed: "Failed to export ZIP.",
      noImages: "No completed images are available to export.",
    },
    requestListTooltips: {
      clearAll: "Delete all request records and local image details",
      cancelRequests: "Cancel all running and queued requests",
      clearCompleted: "Delete completed requests and local image details",
      clearFailed: "Delete failed and canceled requests",
    },
    filterLabels: {
      all: "All",
      active: "Active",
      done: "Done",
      failed: "Failed",
    },
    filterEmptyText: {
      all: "No requests",
      active: "No active requests",
      done: "No completed requests",
      failed: "No failed or canceled requests",
    },
    requestStatusLabels: {
      queued: "Queued",
      running: "Generating",
      done: "Done",
      error: "Failed",
      canceled: "Canceled",
    },
    queueRunning: (settings, counts) => ({
      state: "Queue running",
      detail: `${englishRequestControlSummary(settings)} · Running ${counts.running} · Queued ${counts.queued} · Done ${counts.done} · Failed ${counts.failed}`,
    }),
    queueComplete: (settings, counts) => ({
      state: `Queue done ${counts.imageCount} images`,
      detail: `${englishRequestControlSummary(settings)} · Done ${counts.done} · Failed ${counts.failed} · Canceled ${counts.canceled}`,
    }),
    waitingGeneration: { state: "Waiting", detail: "Configure URL and API Key to begin." },
    requestCardEmpty: {
      noImage: "No image",
      queued: "This request is queued",
      running: "This request is waiting for a response",
      canceled: "This request was canceled",
      error: "This request failed",
      loading: "Loading history details",
      restored: "History restored, image details were not available in local cache.",
      missing: "No image found in the response",
    },
    requestCardStatus: {
      unselectedTitle: "No request selected",
      unselectedSubtitle: "Click a request after generation to view results.",
      cancel: "Cancel",
      delete: "Delete",
      deletedRequest: "Deleted request",
      reusePrompt: "Reuse prompt",
      responseJson: "Response JSON",
      download: "Download",
      editImage: "Edit image",
      rotateCounterclockwise: "Rotate image counterclockwise",
      resolution: "Resolution",
    },
    promptHistory: {
      title: "Prompt history",
      empty: "No prompt history",
      pinned: "Pinned",
      pin: "Pin",
      unpin: "Unpin",
      delete: "Delete",
      refilled: "Prompt refilled",
    },
    promptEditor: {
      title: "Edit strict prompt",
      description: "The first and last lines are fixed. Only the middle body can be edited, and this feature cannot guarantee a fully preserved original prompt.",
      header: "Please treat the following original Prompt as the final image instruction.",
      footer: "Original Prompt:",
      defaultText: DEFAULT_STRICT_PROMPT_TEXT_EN,
      bodyLabel: "Strict prompt body",
      cancel: "Cancel",
      restoreDefault: "Restore default",
      confirm: "Confirm",
    },
    generator: {
      generate: "Generate",
      edit: "Edit",
      settings: "Settings",
      promptLabel: "Prompt",
      promptPlaceholder: "A translucent glass mechanical jellyfish floating on a city rooftop at dawn, product photography, crisp detail",
      editPromptPlaceholder: "For example: keep the original subject and only adjust lighting and style",
      selectLocalImage: "Choose local images",
      selectHistoricalImage: "Choose generated images",
      choose: "Choose",
      noHistoricalImages: "No selectable images",
      selectAtLeastOneImage: "Please choose one or more images.",
      maxEditImages: (count) => `Edit mode supports up to ${count} images.`,
      size: "Size",
      quality: "Quality",
      count: "Request count",
      keepOriginalPrompt: "Keep original prompt",
      keep: "Keep",
      editOriginalPrompt: "Edit strict prompt text",
      editOriginalPromptTooltip: "Edit strict prompt text",
      promptRequired: "Enter a prompt first.",
      requestNotCreated: "Request not created",
      connectionRequired: "Configure the API URL and API key before generating.",
      requestQueued: "Request queued",
      submissionSuccess: (count) => `Successfully submitted ${count} request${count === 1 ? "" : "s"}.`,
      generations: "generations",
      responses: "responses",
      completions: "completions",
      edits: "edits",
    },
    settings: {
      title: "Connection",
      description: "Configure the OpenAI-compatible base URL and API key.",
      apiUrl: "API URL",
      apiKey: "API key",
      rememberKey: "Remember API key in this browser",
      crossOriginProxy: "Enable cross-origin request proxy",
      crossOriginProxyConfirm: {
        title: "Enable cross-origin request proxy?",
        description:
          "Once enabled, API requests will be forwarded through a proxy service to bypass browser cross-origin restrictions. The proxy service may access your API URL, request headers, prompt, images, and other request content. Only enable this if you trust the proxy service.",
        confirm: "Enable",
      },
      generationsModel: "Generations model",
      editsModel: "Edits model",
      responsesModel: "Responses model",
      completionsModel: "Completions model",
      concurrency: "Concurrency",
      interval: "Interval (sec)",
      endpointPreview: "Request endpoint",
      reset: "Reset",
      save: "Save",
    },
    clearDialog: {
      cancel: "Cancel",
      clearAll: {
        title: "Clear all",
        description: "All request records and image detail cache will be deleted, and active requests will be canceled.",
        confirm: "Confirm clear all",
      },
      cancelRequests: {
        title: "Cancel requests",
        description: "All running and queued requests will be canceled.",
        confirm: "Confirm cancel requests",
      },
      clearFailed: {
        title: "Clear failed",
        description: "Failed and canceled requests will be deleted, while active requests are kept.",
        confirm: "Confirm clear failed",
      },
      clearCompleted: {
        title: "Clear done",
        description: "Completed requests and image details will be deleted, while active requests are kept.",
        confirm: "Confirm clear done",
      },
    },
    responseJson: { title: "Response JSON", description: "JSON response for the currently selected request." },
    historyImage: {
      selected: "Choose generated images",
      local: "Choose local images",
      generated: "Choose generated images",
      buttonLabel: "Choose",
      deleteButton: "Delete input image",
      tooltip: "Use historical images as input",
    },
    runtime: {
      editRequestMissingImages: "Edit request is missing input images.",
      missingHistoricalRequest: "No matching historical request was found.",
      historicalImageExists: (requestTitle, imageIndex) => `${requestTitle} · Image ${imageIndex + 1}`,
      historicalImageFull: "Historical image limit reached",
      historicalRequestHasNoImage: "This historical request has no available images.",
      historicalImageNotFound: "Could not find that historical image.",
      historicalImageNotEditable: "That historical image cannot be added to edit mode yet.",
      historicalImageAddedToEdit: (requestTitle, imageIndex) => `${requestTitle} · Image ${imageIndex + 1}`,
      historicalImageLoadFailed: "Failed to load the historical image.",
      requestCanceled: "Request canceled",
      requestCanceledBeforeSend: "Request canceled before sending.",
      requestsCanceled: (count) => `${count} requests canceled.`,
      allRequestsCleared: "All request cache cleared.",
      completedRequestsCleared: "Completed requests deleted.",
      failedRequestsCleared: "Failed and canceled requests deleted.",
      requestFailed: "Request failed",
      crossOriginRequestFailed: "The browser blocked a cross-origin request. Check the upstream proxy CORS settings.",
      queuedRequestDetail: (method, count, summary, endpoint) => `${method} · ${count} new request${count === 1 ? "" : "s"} · ${summary} · ${endpoint}`,
    },
    tests: {
      test: "Test",
      connectionTesting: "Testing",
      connectionNormal: "Connected",
      connectionNormalDetail: "The models endpoint returned successfully.",
      connectionFailed: "Connection failed",
      connectionSaved: "Saved",
      connectionReset: "Settings",
      connectionResetDetail: "Default URL restored.",
    },
  },
};

const I18N_CONTEXT = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  copy: Copy;
} | null>(null);

export function LanguageProvider({
  children,
  initialLanguage: initialLanguageProp,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(() => initialLanguageProp || initialLanguage());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
    syncDocumentLanguage(language);
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromLocation = () => {
      setLanguage(initialLanguage());
    };

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage((current) => (current === "zh" ? "en" : "zh")),
      copy: COPY[language],
    }),
    [language],
  );

  return createElement(I18N_CONTEXT.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18N_CONTEXT);
  if (context) return context;
  return {
    language: "zh" as Language,
    setLanguage: () => undefined,
    toggleLanguage: () => undefined,
    copy: COPY.zh,
  };
}

export function getCopy(language: Language) {
  return COPY[language];
}

export function requestSummaryForLanguage(
  settings: Pick<AppSettings, "requestConcurrency" | "requestIntervalSeconds">,
  language: Language = "zh",
) {
  return getCopy(language).requestSummary(settings);
}
