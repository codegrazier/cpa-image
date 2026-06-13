import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/i18n";
import {
  DEFAULT_STRICT_PROMPT_TEXT,
  DEFAULT_STRICT_PROMPT_TEXT_EN,
  STORAGE_KEY,
  STRICT_PROMPT_FOOTER,
  STRICT_PROMPT_HEADER,
  type AppSettings,
} from "@/lib/image-console";
import * as storage from "@/lib/storage";

const PNG_BASE64 = "iVBORw0KGgoA" + "A".repeat(240);
const WEBP_BASE64 = "UklG" + "A".repeat(100);

if (!HTMLElement.prototype.hasPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
}

if (!HTMLElement.prototype.setPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
}

if (!HTMLElement.prototype.releasePointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  });
}

if (!HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  });
}

function renderApp() {
  return render(
    <TooltipProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </TooltipProvider>,
  );
}

function storeSettings(settings: Partial<AppSettings>) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      baseUrl: "http://localhost:8317/v1",
      model: "gpt-image-2",
      llmModel: "gpt-5.5",
      rememberKey: false,
      strictPrompt: true,
      requestConcurrency: 2,
      requestIntervalSeconds: 0,
      size: "auto",
      quality: "auto",
      n: 1,
      background: "auto",
      outputFormat: "png",
      ...settings,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("App", () => {
  test("renders the default workbench and endpoint preview", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText(/等待生成/)).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("一只半透明玻璃质感的机械水母，漂浮在清晨的城市天台上，产品摄影，细节清晰")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "生图" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑原始 Prompt 文案" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /配置/ }));
    expect(screen.getByRole("dialog", { name: "连接" })).toBeInTheDocument();
    expect(screen.getByText(/generations \(gpt-image-2\)/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/images\/generations/)).toBeInTheDocument();
    expect(screen.getByText(/edits \(gpt-image-2\)/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/images\/edits/)).toBeInTheDocument();
    expect(screen.getByText(/responses \(gpt-5.5\)/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/responses/)).toBeInTheDocument();
    expect(screen.getByText(/completions \(gpt-5.5\)/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/chat\/completions/)).toBeInTheDocument();
  });

  test("hydrates saved settings into the settings dialog", async () => {
    const user = userEvent.setup();
    storeSettings({
      baseUrl: "https://proxy.example.com/openai/v1",
      model: "gpt-image-3",
      llmModel: "gpt-5.6",
      rememberKey: true,
      apiKey: "proxy-key",
    });

    renderApp();
    await user.click(await screen.findByRole("button", { name: /配置/ }));

    expect(screen.getByDisplayValue("https://proxy.example.com/openai/v1")).toBeInTheDocument();
    expect(screen.getByLabelText("生图模型")).toHaveValue("gpt-image-3");
    expect(screen.getByLabelText("对话模型")).toHaveValue("gpt-5.6");
    expect(screen.getByDisplayValue("proxy-key")).toBeInTheDocument();
  });

  test("keeps strict prompt head and tail fixed while editing the body", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await user.click(screen.getByRole("button", { name: "编辑原始 Prompt 文案" }));

    const editor = screen.getByRole("dialog", { name: "编辑原始 Prompt" });
    expect(within(editor).getByText(STRICT_PROMPT_HEADER)).toBeInTheDocument();
    expect(within(editor).getByText(STRICT_PROMPT_FOOTER)).toBeInTheDocument();

    const body = within(editor).getByLabelText("原始 Prompt 正文");
    expect(body).toHaveValue(DEFAULT_STRICT_PROMPT_TEXT);
    await user.clear(body);
    await user.type(body, "只保留主体和光影");
    await user.click(within(editor).getByRole("button", { name: "确定" }));
    await user.click(screen.getByRole("button", { name: /配置/ }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    expect(await screen.findByAltText("Generated image 1")).toBeInTheDocument();
    const bodyJson = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || "{}")) as { prompt?: string };
    expect(bodyJson.prompt).toContain(STRICT_PROMPT_HEADER);
    expect(bodyJson.prompt).toContain("只保留主体和光影");
    expect(bodyJson.prompt).toContain(`${STRICT_PROMPT_FOOTER}\nglass jellyfish`);
  });

  test("uses the language default strict prompt body and preserves custom text across language switches", async () => {
    localStorage.setItem("CPA-Image-language", "en");
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await user.click(screen.getByRole("button", { name: "Edit strict prompt text" }));

    const englishEditor = screen.getByRole("dialog", { name: "Edit strict prompt" });
    const englishBody = within(englishEditor).getByLabelText("Strict prompt body");
    expect(englishBody).toHaveValue(DEFAULT_STRICT_PROMPT_TEXT_EN);

    await user.clear(englishBody);
    await user.type(englishBody, "Keep only the subject and lighting");
    await user.click(within(englishEditor).getByRole("button", { name: "Confirm" }));

    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const bodyJson = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || "{}")) as { prompt?: string };
    expect(bodyJson.prompt).toContain("Keep only the subject and lighting");

    cleanup();
    localStorage.setItem("CPA-Image-language", "zh");
    renderApp();
    await user.click(screen.getByRole("button", { name: "编辑原始 Prompt 文案" }));

    const chineseEditor = screen.getByRole("dialog", { name: "编辑原始 Prompt" });
    expect(within(chineseEditor).getByLabelText("原始 Prompt 正文")).toHaveValue("Keep only the subject and lighting");
  });

  test("replaces the test button text with the latest connection result", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp();
    await user.click(screen.getByRole("button", { name: /配置/ }));
    const dialog = screen.getByRole("dialog", { name: "连接" });
    const testButton = within(dialog).getByRole("button", { name: "测试" });
    await user.click(testButton);

    expect(await within(dialog).findByRole("button", { name: "连接正常" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
  });

  test("switches to edit mode, uploads images, and submits edit requests", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:preview"),
      });
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    }

    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn(),
      });
    } else {
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    }

    renderApp();
    await user.click(screen.getByRole("tab", { name: "编辑" }));
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "glass jellyfish");

    const file = new File(["image-bytes"], "input.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("选择本地图片"), file);
    expect(screen.queryByText("input.png")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除输入图片 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^edits$/ }));

    expect(await screen.findByAltText("Generated image 1")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8317/v1/images/edits",
      expect.objectContaining({ method: "POST" }),
    );
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(Array.from(body.entries()).filter(([key]) => key === "image[]")).toHaveLength(1);
    expect(String(body.get("prompt"))).toContain("glass jellyfish");
    expect(body.get("model")).toBe("gpt-image-2");
  });

  test("limits edit image previews to five thumbnails in a single row", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp();
    await user.click(screen.getByRole("tab", { name: "编辑" }));

    const files = Array.from({ length: 5 }, (_, index) => new File([`image-${index}`], `input-${index + 1}.png`, { type: "image/png" }));
    await user.upload(screen.getByLabelText("选择本地图片"), files);

    expect(screen.queryByText("input-1.png")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /删除输入图片 \d+/ })).toHaveLength(5);

    const previews = screen.getByTestId("edit-image-preview-strip");
    expect(previews).toHaveClass("grid");
    expect(previews).toHaveClass("grid-cols-5");
    expect(previews).toHaveClass("overflow-hidden");
  });

  test("adds historical completed request images into edit inputs", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(storage, "loadRequestDetails").mockResolvedValue({
      images: [
        {
          src: `data:image/png;base64,${PNG_BASE64}`,
          kind: "base64",
          path: "$.data[0].b64_json",
          mimeType: "image/png",
        },
      ],
      response: null,
      thumbnail: null,
      savedAt: Date.now(),
    });

    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:history-preview"),
      });
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:history-preview");
    }

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const requestButton = await screen.findByRole("button", { name: /查看 .* 的生成结果/ });
    const requestTitle = requestButton.getAttribute("aria-label")!.match(/^查看 (.+) 的生成结果$/)?.[1] || "";
    await user.click(screen.getByRole("tab", { name: "编辑" }));

    const historicalSelect = screen.getByLabelText("选择已生成图片");
    await user.click(historicalSelect);
    await user.click(await screen.findByRole("option", { name: `${requestTitle} · 图片 1` }));

    expect(screen.queryByText(`${requestTitle}-image-1.png`)).not.toBeInTheDocument();
    expect(screen.getByTestId("edit-image-preview-strip")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /删除输入图片 \d+/ })).toHaveLength(1);
  });

  test("keeps generate and edit prompt histories separate", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "generate prompt");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));
    expect(await screen.findByRole("button", { name: "generate prompt" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "编辑" }));
    expect(screen.getByText("暂无历史 Prompt")).toBeInTheDocument();
  });

  test("shows the full prompt history content in a tooltip", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "温泉写真，俯拍视角");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const historyButton = await screen.findByRole("button", { name: "温泉写真，俯拍视角" });
    await user.hover(historyButton);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("温泉写真，俯拍视角")).toBeInTheDocument();
  });

  test("keeps generate and edit prompt drafts separate", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "generate draft");
    expect(prompt).toHaveValue("generate draft");

    await user.click(screen.getByRole("tab", { name: "编辑" }));
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.getByPlaceholderText("例如：保留原图主体，只调整光影和风格")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Prompt"), "edit draft");
    expect(screen.getByLabelText("Prompt")).toHaveValue("edit draft");

    await user.click(screen.getByRole("tab", { name: "生图" }));
    expect(screen.getByLabelText("Prompt")).toHaveValue("generate draft");

    await user.click(screen.getByRole("tab", { name: "编辑" }));
    expect(screen.getByLabelText("Prompt")).toHaveValue("edit draft");
  });

  test("keeps generate and edit generation settings separate", async () => {
    const user = userEvent.setup();
    renderApp();

    const generationSize = screen.getAllByRole("combobox")[0];
    expect(generationSize).toHaveTextContent("auto");

    await user.click(generationSize);
    await user.click(await screen.findByRole("option", { name: "1024x1024" }));
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("1024x1024");

    await user.click(screen.getByRole("tab", { name: "编辑" }));
    const editSize = screen.getAllByRole("combobox")[1];
    expect(editSize).toHaveTextContent("auto");

    await user.click(editSize);
    await user.click(await screen.findByRole("option", { name: "2048x2048" }));
    expect(screen.getAllByRole("combobox")[1]).toHaveTextContent("2048x2048");

    await user.click(screen.getByRole("tab", { name: "生图" }));
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("1024x1024");

    await user.click(screen.getByRole("tab", { name: "编辑" }));
    expect(screen.getAllByRole("combobox")[1]).toHaveTextContent("2048x2048");
  });

  test("clears failed requests while keeping successful ones", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "first boom" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "first");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));
    const requestList = screen.getByRole("complementary", { name: "请求列表" });
    expect(await within(requestList).findByText(/HTTP 500 first boom/)).toBeInTheDocument();

    await user.clear(prompt);
    await user.type(prompt, "second");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));
    expect(await screen.findAllByRole("button", { name: /查看 .* 的生成结果/ })).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /已失败\s*1/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空失败" }));
    const dialog = screen.getByRole("alertdialog", { name: "清空失败" });
    await user.click(within(dialog).getByRole("button", { name: "确认清空失败" }));

    expect(screen.getByRole("tab", { name: /已失败\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /已完成\s*1/ })).toBeInTheDocument();
  });

  test("clears completed requests from the request list toolbar", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "completed");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const requestList = screen.getByRole("complementary", { name: "请求列表" });
    expect(await screen.findByRole("button", { name: /查看 .* 的生成结果/ })).toBeInTheDocument();

    await user.click(within(requestList).getByRole("button", { name: "清空完成" }));
    const dialog = screen.getByRole("alertdialog", { name: "清空完成" });
    await user.click(within(dialog).getByRole("button", { name: "确认清空完成" }));

    expect(screen.getByRole("tab", { name: /已完成\s*0/ })).toBeInTheDocument();
    expect(within(requestList).getByText("暂无请求")).toBeInTheDocument();
  });

  test("hides background and format controls and keeps default generation options", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    storeSettings({ background: "transparent", outputFormat: "jpeg" });

    renderApp();
    expect(screen.queryByLabelText("背景")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("格式")).not.toBeInTheDocument();

    await user.type(await screen.findByLabelText("Prompt"), "logo");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.background).toBe("auto");
    expect(body.output_format).toBe("png");
  });

  test("submits image generation requests and renders extracted images", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0, model: "gpt-image-custom" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }], revised_prompt: "glass jellyfish, soft rim light" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    expect(await screen.findByAltText("Generated image 1")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    expect(screen.getByText(/完成于 \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    const completedPanel = document.querySelector('section[aria-live="polite"]');
    expect(completedPanel).not.toBeNull();
    expect(
      [...(completedPanel as HTMLElement).querySelectorAll("button,a")]
        .map((element) => (element.textContent || "").trim())
        .filter((text) => ["复用 Prompt", "响应 JSON", "下载"].includes(text)),
    ).toEqual(["复用 Prompt", "响应 JSON", "下载"]);

    const reusePromptButton = screen.getByRole("button", { name: /复用 Prompt/ });
    await user.hover(reusePromptButton);
    const reuseTooltip = await screen.findByRole("tooltip");
    expect(within(reuseTooltip).getByText("glass jellyfish")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8317/v1/images/generations",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("gpt-image-custom");
  });

  test("keeps the selected request unchanged after starting another generation", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "first prompt");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    await user.clear(prompt);
    await user.type(prompt, "second prompt");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const requestButtons = await screen.findAllByRole("button", { name: /查看 .* 的生成结果/ });
    const secondTitle = requestButtons[1].getAttribute("aria-label")!.match(/^查看 (.+) 的生成结果$/)?.[1] || "";
    await user.click(requestButtons[1]);

    const resultPanel = document.querySelector('section[aria-live="polite"]') as HTMLElement;
    expect(within(resultPanel).getByText(secondTitle)).toBeInTheDocument();

    await user.clear(prompt);
    await user.type(prompt, "third prompt");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    expect(within(resultPanel).getByText(secondTitle)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("moves between request cards with global arrow keys outside dialogs", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0, n: 2 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: WEBP_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const requestButtons = await screen.findAllByRole("button", { name: /查看 .* 的生成结果/ });
    expect(requestButtons).toHaveLength(2);

    const secondTitle = requestButtons[1].getAttribute("aria-label")!.match(/^查看 (.+) 的生成结果$/)?.[1] || "";
    const resultPanel = document.querySelector('section[aria-live="polite"]') as HTMLElement;
    prompt.blur();
    await user.keyboard("{ArrowDown}");
    expect(requestButtons[1]).toHaveFocus();
    expect(await within(resultPanel).findByText(secondTitle)).toBeInTheDocument();
  });

  test("shows revised_prompt tooltip on the response JSON button", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }], revised_prompt: "glass jellyfish, soft rim light" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));
    expect(await screen.findByAltText("Generated image 1")).toBeInTheDocument();

    const responseJsonButton = screen.getByRole("button", { name: /响应 JSON/ });
    await user.hover(responseJsonButton);
    const responseTooltip = await screen.findByRole("tooltip");
    expect(within(responseTooltip).getByText("glass jellyfish, soft rim light")).toBeInTheDocument();
  });

  test("records prompt history, refills prompt, and deletes history rows", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    expect(await screen.findByRole("button", { name: "glass jellyfish" })).toBeInTheDocument();
    await user.clear(prompt);
    await user.click(screen.getByRole("button", { name: "glass jellyfish" }));
    expect(prompt).toHaveValue("glass jellyfish");

    await user.click(screen.getByRole("button", { name: "删除历史 Prompt：glass jellyfish" }));
    expect(screen.queryByRole("button", { name: "glass jellyfish" })).not.toBeInTheDocument();
    expect(screen.getByText("暂无历史 Prompt")).toBeInTheDocument();
  });

  test("pins prompt rows to the top and keeps them above newer prompts", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "alpha prompt");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const history = screen.getByRole("region", { name: "历史 Prompt" });
    const pinButton = within(history).getByRole("button", { name: "置顶 Prompt：alpha prompt" });
    expect(pinButton).toHaveAttribute("aria-pressed", "false");
    await user.click(pinButton);
    expect(within(history).getByRole("button", { name: "取消置顶：alpha prompt" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.clear(prompt);
    await user.type(prompt, "beta prompt");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    const promptButtons = within(history).getAllByRole("button", { name: /^(alpha prompt|beta prompt)$/ });
    expect(promptButtons[0]).toHaveTextContent("alpha prompt");
    expect(promptButtons[1]).toHaveTextContent("beta prompt");
  });

  test("submits responses requests to the responses endpoint", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output: [{ result: WEBP_BASE64, output_format: "webp" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^responses$/ }));

    expect(await screen.findByAltText("Generated image 1")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8317/v1/responses", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-5.5");
    expect(body.tools[0].type).toBe("image_generation");
  });

  test("shows responses labels for running response requests", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^responses$/ }));

    expect(await screen.findByText("responses · auto")).toBeInTheDocument();
    const runningPanel = document.querySelector('section[aria-live="polite"]');
    expect(runningPanel).not.toBeNull();
    expect(
      [...(runningPanel as HTMLElement).querySelectorAll("button,a")]
        .map((element) => (element.textContent || "").trim())
        .filter((text) => ["取消请求", "复用 Prompt"].includes(text)),
    ).toEqual(["取消请求", "复用 Prompt"]);

    const requestList = screen.getByRole("complementary", { name: "请求列表" });
    await user.click(within(requestList).getByRole("button", { name: "取消请求" }));
    const cancelDialog = screen.getByRole("alertdialog", { name: "取消请求" });
    expect(within(cancelDialog).getByText("所有进行中和排队请求将被取消。")).toBeInTheDocument();
    await user.click(within(cancelDialog).getByRole("button", { name: "确认取消请求" }));
    expect(await within(requestList).findByText("请求已取消")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /已失败\s*1/ })).toBeInTheDocument();
    expect(screen.queryByText(/responses · auto · n=1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/image_generation · auto/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("生成方式：responses")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("生成方式：image_generation")).not.toBeInTheDocument();
  });

  test("cancelling a request selects the adjacent visible request", async () => {
    const user = userEvent.setup();
    storeSettings({ requestConcurrency: 1, requestIntervalSeconds: 0 });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    const requestList = screen.getByRole("complementary", { name: "请求列表" });
    const resultPanel = document.querySelector('section[aria-live="polite"]') as HTMLElement;

    await user.type(prompt, "first request");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));
    await user.clear(prompt);
    await user.type(prompt, "second request");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));
    await user.clear(prompt);
    await user.type(prompt, "third request");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));

    await waitFor(() =>
      expect(within(requestList).getAllByRole("button", { name: /查看 .* 的生成结果/ })).toHaveLength(3),
    );
    const [thirdCard, secondCard, firstCard] = within(requestList).getAllByRole("button", { name: /查看 .* 的生成结果/ });

    await user.click(within(resultPanel).getByRole("button", { name: "取消请求" }));
    await waitFor(() => {
      const buttons = within(requestList).getAllByRole("button", { name: /查看 .* 的生成结果/ });
      expect(buttons[1]).toHaveClass("border-primary/60", "bg-primary/5");
      expect(buttons[2]).not.toHaveClass("border-primary/60", "bg-primary/5");
    });

    await user.click(thirdCard);
    await waitFor(() => {
      const buttons = within(requestList).getAllByRole("button", { name: /查看 .* 的生成结果/ });
      expect(buttons[0]).toHaveClass("border-primary/60", "bg-primary/5");
    });
    await user.click(within(resultPanel).getByRole("button", { name: "取消请求" }));
    await waitFor(() => {
      const buttons = within(requestList).getAllByRole("button", { name: /查看 .* 的生成结果/ });
      expect(buttons[1]).toHaveClass("border-primary/60", "bg-primary/5");
    });
    expect(firstCard).not.toHaveClass("border-primary/60", "bg-primary/5");
  });

  test("keeps request method and size visible when responses requests fail", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "upstream returned a very long failure detail ".repeat(6),
            },
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^responses$/ }));

    expect(await screen.findByText("responses · auto")).toBeInTheDocument();
    expect(screen.getAllByText(/HTTP 500 upstream returned a very long failure detail/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/responses · auto · n=1/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("生成方式：responses")).not.toBeInTheDocument();
  });

  test("submits completions requests to the chat completions endpoint", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { image_base64: PNG_BASE64, output_format: "png" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^completions$/ }));

    expect(await screen.findByAltText("Generated image 1")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8317/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-5.5");
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toMatch(/原始 Prompt:\nglass jellyfish/);
    expect(body.tools[0].type).toBe("image_generation");
  });

  test("filters completed requests, reuses prompt, and opens response JSON", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp();
    const prompt = await screen.findByLabelText("Prompt");
    await user.type(prompt, "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^generations$/ }));
    expect(await screen.findByAltText("Generated image 1")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /已完成/ }));
    expect(screen.getByRole("button", { name: /查看 .* 的生成结果/ })).toBeInTheDocument();

    await user.clear(prompt);
    await user.click(screen.getByRole("button", { name: /复用 Prompt/ }));
    expect(prompt).toHaveValue("glass jellyfish");

    await user.click(screen.getByRole("button", { name: /响应 JSON/ }));
    const dialog = screen.getByRole("dialog", { name: "响应 JSON" });
    expect(within(dialog).getByText(/b64_json/)).toBeInTheDocument();
    expect(within(dialog).getByText(/\[image data omitted,/)).toBeInTheDocument();
  });
});
