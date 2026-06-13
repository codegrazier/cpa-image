import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { createJiti } from "jiti";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const templatePath = path.join(distDir, "index.html");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function replaceOrThrow(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`Prerender template mismatch: ${label}`);
  }
  return html.replace(pattern, replacement);
}

function buildPageHtml(template, seo, markup) {
  let html = template;

  html = replaceOrThrow(html, /<html lang="[^"]*">/, `<html lang="${seo.locale}">`, "html lang");
  html = replaceOrThrow(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(seo.title)}</title>`, "title");
  html = replaceOrThrow(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    "description",
  );
  html = replaceOrThrow(
    html,
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${seo.canonicalUrl}" />`,
    "canonical",
  );
  html = replaceOrThrow(
    html,
    /<link rel="alternate" hreflang="zh-CN" href="[^"]*" \/>/,
    `<link rel="alternate" hreflang="zh-CN" href="${seo.alternateUrls.zh}" />`,
    "zh alternate",
  );
  html = replaceOrThrow(
    html,
    /<link rel="alternate" hreflang="en-US" href="[^"]*" \/>/,
    `<link rel="alternate" hreflang="en-US" href="${seo.alternateUrls.en}" />`,
    "en alternate",
  );
  html = replaceOrThrow(
    html,
    /<link rel="alternate" hreflang="x-default" href="[^"]*" \/>/,
    `<link rel="alternate" hreflang="x-default" href="${seo.alternateUrls.xDefault}" />`,
    "x-default alternate",
  );
  html = replaceOrThrow(
    html,
    /<meta property="og:locale" content="[^"]*" \/>/,
    `<meta property="og:locale" content="${seo.ogLocale}" />`,
    "og locale",
  );
  html = replaceOrThrow(
    html,
    /<meta property="og:locale:alternate" content="[^"]*" \/>/,
    `<meta property="og:locale:alternate" content="${seo.ogLocaleAlternate}" />`,
    "og locale alternate",
  );
  html = replaceOrThrow(
    html,
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`,
    "og title",
  );
  html = replaceOrThrow(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`,
    "og description",
  );
  html = replaceOrThrow(
    html,
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${seo.canonicalUrl}" />`,
    "og url",
  );
  html = replaceOrThrow(
    html,
    /<meta property="og:image:alt" content="[^"]*" \/>/,
    `<meta property="og:image:alt" content="${escapeHtml(seo.imageAlt)}" />`,
    "og image alt",
  );
  html = replaceOrThrow(
    html,
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`,
    "twitter title",
  );
  html = replaceOrThrow(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`,
    "twitter description",
  );
  html = replaceOrThrow(
    html,
    /<meta name="twitter:image:alt" content="[^"]*" \/>/,
    `<meta name="twitter:image:alt" content="${escapeHtml(seo.imageAlt)}" />`,
    "twitter image alt",
  );
  html = replaceOrThrow(
    html,
    /<script type="application\/ld\+json">\s*[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "CPA Image",
        alternateName: "CPA-Image",
        applicationCategory: "GraphicsApplication",
        operatingSystem: "Web",
        url: seo.canonicalUrl,
        description: seo.description,
        inLanguage: [seo.locale],
        isAccessibleForFree: true,
      },
      null,
      2,
    )}</script>`,
    "json ld",
  );
  html = replaceOrThrow(html, /<div id="root"><\/div>/, `<div id="root">${markup}</div>`, "root markup");

  return html;
}

const jiti = createJiti(import.meta.url, {
  tsconfigPaths: path.join(rootDir, "tsconfig.json"),
  jsx: true,
});

const previousReact = globalThis.React;
globalThis.React = React;

try {
  const { renderPrerenderedPage } = await jiti.import(path.join(rootDir, "src/prerender-entry.tsx"));
  const template = await fs.readFile(templatePath, "utf8");

  const pages = [
    { language: "zh", output: path.join(distDir, "index.html") },
    { language: "zh", output: path.join(distDir, "zh-CN", "index.html") },
    { language: "en", output: path.join(distDir, "en-US", "index.html") },
  ];

  for (const page of pages) {
    const { seo, markup } = renderPrerenderedPage(page.language);
    const html = buildPageHtml(template, seo, markup);

    await fs.mkdir(path.dirname(page.output), { recursive: true });
    await fs.writeFile(page.output, html);
  }
} finally {
  if (previousReact === undefined) {
    delete globalThis.React;
  } else {
    globalThis.React = previousReact;
  }
}
