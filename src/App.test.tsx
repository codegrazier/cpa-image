import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { STORAGE_KEY, type AppSettings } from "@/lib/image-console";

const PNG_BASE64 = "iVBORw0KGgoA" + "A".repeat(240);
const WEBP_BASE64 = "UklG" + "A".repeat(100);

function renderApp() {
  return render(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  );
}

function storeSettings(settings: Partial<AppSettings>) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      baseUrl: "http://localhost:8317/v1",
      model: "gpt-image-2",
      imageGenerationModel: "gpt-5.5",
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

    await user.click(screen.getByRole("button", { name: /配置/ }));
    expect(screen.getByRole("dialog", { name: "连接" })).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/images\/generations/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/responses/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/chat\/completions/)).toBeInTheDocument();
  });

  test("hydrates saved settings into the settings dialog", async () => {
    const user = userEvent.setup();
    storeSettings({
      baseUrl: "https://proxy.example.com/openai/v1",
      imageGenerationModel: "gpt-5.6",
      rememberKey: true,
      apiKey: "proxy-key",
    });

    renderApp();
    await user.click(await screen.findByRole("button", { name: /配置/ }));

    expect(screen.getByDisplayValue("https://proxy.example.com/openai/v1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-5.6")).toBeInTheDocument();
    expect(screen.getByText("LLM 模型")).toBeInTheDocument();
    expect(screen.getByDisplayValue("proxy-key")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));
    const requestList = screen.getByRole("complementary", { name: "请求列表" });
    expect(await within(requestList).findByText(/HTTP 500 first boom/)).toBeInTheDocument();

    await user.clear(prompt);
    await user.type(prompt, "second");
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));
    expect(await screen.findByAltText("Generated image 1")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /已失败\s*1/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空失败" }));
    const dialog = screen.getByRole("alertdialog", { name: "清空失败" });
    await user.click(within(dialog).getByRole("button", { name: "确认清空失败" }));

    expect(screen.getByRole("tab", { name: /已失败\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /已完成\s*1/ })).toBeInTheDocument();
  });

  test("rejects transparent jpeg generation before fetch", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    storeSettings({ background: "transparent", outputFormat: "jpeg" });

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "logo");
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));

    expect(await screen.findByText("请求未创建")).toBeInTheDocument();
    expect(screen.getByText("透明背景需要 png 或 webp 格式。")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("submits gpt-image-2 requests and renders extracted images", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }], revised_prompt: "glass jellyfish, soft rim light" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));

    expect(await screen.findByAltText("Generated image 1")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    expect(screen.getByText(/完成于 \d{2}:\d{2}:\d{2} · 1 张图片/)).toBeInTheDocument();
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
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("gpt-image-2");
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
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));
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
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));

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
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));

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
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));

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
    expect(screen.queryByText(/responses · auto · n=1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/image_generation · auto/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("生成方式：responses")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("生成方式：image_generation")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));
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
