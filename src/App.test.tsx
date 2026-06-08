import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { STORAGE_KEY, type AppSettings } from "@/lib/image-console";

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

    expect(await screen.findByText("等待生成")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /配置/ }));
    expect(screen.getByRole("dialog", { name: "连接" })).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/images\/generations/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/localhost:8317\/v1\/responses/)).toBeInTheDocument();
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
    expect(screen.getByDisplayValue("proxy-key")).toBeInTheDocument();
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
      new Response(JSON.stringify({ data: [{ b64_json: "iVBOR" + "A".repeat(100) }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^gpt-image-2$/ }));

    expect(await screen.findByAltText("Generated image 1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8317/v1/images/generations",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("gpt-image-2");
  });

  test("submits image_generation requests to the responses endpoint", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output: [{ result: "UklGR" + "A".repeat(100), output_format: "webp" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await user.type(await screen.findByLabelText("Prompt"), "glass jellyfish");
    await user.click(screen.getByRole("button", { name: /^image_generation$/ }));

    expect(await screen.findByAltText("Generated image 1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8317/v1/responses", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-5.5");
    expect(body.tools[0].type).toBe("image_generation");
  });

  test("filters completed requests, reuses prompt, and opens response JSON", async () => {
    const user = userEvent.setup();
    storeSettings({ requestIntervalSeconds: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: "iVBOR" + "A".repeat(100) }] }), {
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
  });
});
