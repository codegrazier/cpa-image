import { createElement, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { DEFAULTS, requestControlSummary as baseRequestControlSummary, type AppSettings, type RequestFilter, type RequestStatus } from "@/lib/image-console";

export type Language = "zh" | "en";

const LANGUAGE_STORAGE_KEY = "CPA-Image-language";

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
    reusePrompt: string;
    responseJson: string;
    download: string;
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
    generationModel: string;
    llmModel: string;
    concurrency: string;
    interval: string;
    endpointPreview: string;
    reset: string;
    save: string;
  };
  clearDialog: {
    cancel: string;
    clearAll: { title: string; description: string; confirm: string };
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
      canceled: "已取消",
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
      reusePrompt: "复用 Prompt",
      responseJson: "响应 JSON",
      download: "下载",
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
      count: "数量",
      keepOriginalPrompt: "保持原始 Prompt",
      keep: "保持",
      editOriginalPrompt: "编辑原始 Prompt 文案",
      editOriginalPromptTooltip: "编辑原始 Prompt 文案",
      generations: "generations",
      responses: "responses",
      completions: "completions",
      edits: "edits",
    },
    settings: {
      title: "连接",
      description: "配置 CLIProxyAPI 的 OpenAI 兼容地址和代理 API Key。",
      apiUrl: "API URL",
      apiKey: "API Key",
      rememberKey: "在本浏览器记住 API Key",
      generationModel: "生图模型",
      llmModel: "对话模型",
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
    requestSummary: (settings) => `Concurrency ${settings.requestConcurrency} · Interval ${settings.requestIntervalSeconds}s`,
    clearAll: "Clear all",
    cancelRequests: "Cancel",
    clearCompleted: "Clear done",
    clearFailed: "Clear failed",
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
      detail: `${baseRequestControlSummary(settings)} · Running ${counts.running} · Queued ${counts.queued} · Done ${counts.done} · Failed ${counts.failed}`,
    }),
    queueComplete: (settings, counts) => ({
      state: `Queue done ${counts.imageCount} images`,
      detail: `${baseRequestControlSummary(settings)} · Done ${counts.done} · Failed ${counts.failed} · Canceled ${counts.canceled}`,
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
      reusePrompt: "Reuse prompt",
      responseJson: "Response JSON",
      download: "Download",
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
      count: "Count",
      keepOriginalPrompt: "Keep original prompt",
      keep: "Keep",
      editOriginalPrompt: "Edit strict prompt text",
      editOriginalPromptTooltip: "Edit strict prompt text",
      generations: "generations",
      responses: "responses",
      completions: "completions",
      edits: "edits",
    },
    settings: {
      title: "Connection",
      description: "Configure the OpenAI-compatible CLIProxyAPI base URL and proxy API key.",
      apiUrl: "API URL",
      apiKey: "API key",
      rememberKey: "Remember API key in this browser",
      generationModel: "Image model",
      llmModel: "Chat model",
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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "zh";
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "en" ? "en" : "zh";
  });

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language]);

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
