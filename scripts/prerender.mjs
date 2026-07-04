import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import React from "react";
import { createJiti } from "jiti";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const templatePath = path.join(distDir, "index.html");

// SITE_ORIGIN 来源：硬编码常量，与 src/lib/i18n.ts 中的 SITE_ORIGIN 保持一致。
// i18n.ts 导出 SITE_ORIGIN="https://cpa-image.site"；为避免 jiti 反向读取 i18n 模块的副作用（syncDocumentLanguage 在浏览器外跳过实现安全）
// 这里直接定义字符串常量并在注释标明来源。如修改 origin，请同步 i18n.ts。
const SITE_ORIGIN = "https://cpa-image.site";

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

function readGitDates() {
  let datePublished = null;
  let dateModified = null;
  let isShallow = false;

  try {
    const shallowOutput = execSync("git rev-parse --is-shallow-repository", { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    isShallow = shallowOutput === "true";
  } catch {
    isShallow = false;  // 取不到说明无 git 或 git 缺失，按非 shallow 但 dates 仍会 null
  }

  try {
    if (!isShallow) {
      // 首条提交 ISO8601；浅仓库下 --reverse 会得到浅边伪造提交，跳过保证可信
      datePublished = execSync("git log --reverse --format=%cI", { cwd: rootDir, encoding: "utf8" }).split(/\s+/).find(Boolean) || null;
    }
    dateModified = execSync("git log -1 --format=%cI", { cwd: rootDir, encoding: "utf8" }).trim() || null;
  } catch {
    datePublished = null;
    dateModified = null;
  }

  return { datePublished, dateModified };
}

// 从 i18n 取 noscriptProse（与 BUILD 同源，防止维护两份 HTML 模板字符串）
let seoNoscriptProseByLocale;

function buildPageHtml(template, seo) {
  let html = template;

  html = replaceOrThrow(
    html,
    /<html\s+lang="[^"]+"\s+dir="[^"]+"/,
    `<html lang="${seo.locale}" dir="ltr"`,
    "html lang+dir",
  );
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

  return html;
}

function buildJsonLd(seo, langName, dates) {
  const { datePublished, dateModified } = dates;
  const seoBaseUrl = `${SITE_ORIGIN}/`;
  const webApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CPA Image",
    alternateName: "CPA-Image",
    applicationCategory: "GraphicsApplication",
    operatingSystem: "Cross-platform",
    url: seo.canonicalUrl,
    description: seo.description,
    inLanguage: ["zh-CN", "en-US"],
    isAccessibleForFree: true,
    image: `${SITE_ORIGIN}/og-image.svg`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    author: { "@type": "Organization", name: "codegrazier", url: "https://github.com/codegrazier" },
    publisher: {
      "@type": "Organization",
      name: "codegrazier",
      url: "https://github.com/codegrazier",
      logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/favicon.svg` },
    },
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "CPA Image", item: seoBaseUrl },
      { "@type": "ListItem", position: 2, name: langName, item: seo.canonicalUrl },
    ],
  };
  return JSON.stringify([webApp, breadcrumb], null, 2);
}

function buildNoscriptBlock(seo) {
  const prose = seoNoscriptProseByLocale[seo.locale];
  if (!prose) throw new Error(`Missing noscriptProse for locale ${seo.locale}`);
  return `<noscript data-i18n="seo-noscript-fallback"><p>${escapeHtml(prose)}</p></noscript>`;
}

async function overwriteSitemapLastmod(dateModified) {
  if (!dateModified) return;
  const lastmodDate = dateModified.split("T")[0];
  if (!lastmodDate) return;
  const sitemapPath = path.join(distDir, "sitemap.xml");
  if (!await fs.stat(sitemapPath).then(() => true).catch(() => false)) return;
  let sitemap = await fs.readFile(sitemapPath, "utf8");
  sitemap = sitemap.replaceAll(/<lastmod>[^<]+<\/lastmod>/g, `<lastmod>${lastmodDate}</lastmod>`);
  await fs.writeFile(sitemapPath, sitemap);
}

const jiti = createJiti(import.meta.url, {
  tsconfigPaths: path.join(rootDir, "tsconfig.json"),
  jsx: true,
});

const previousReact = globalThis.React;
globalThis.React = React;

try {
  // 同步导入 i18n 拿 noscriptProse 与 languageName 字段（避开 syncDocumentLanguage 副作用：仅取数据）
  const i18nModule = await jiti.import(path.join(rootDir, "src/lib/i18n.ts"));
  const { getSeoMetadata, getCopy, LANGUAGE_LOCALES } = i18nModule;
  seoNoscriptProseByLocale = {
    "zh-CN": LANGUAGE_LOCALES.zh ? getCopy("zh").seoContent.noscriptProse : undefined,
    "en-US": LANGUAGE_LOCALES.en ? getCopy("en").seoContent.noscriptProse : undefined,
  };
  const languageNameByLocale = {
    "zh-CN": getCopy("zh").languageName,    // "中文"
    "en-US": getCopy("en").languageName,    // "English"
  };

  // 在 jiti import 业务模块前要先把 noscriptProse 钉好；上面已设。
  const { renderPrerenderedPage } = await jiti.import(path.join(rootDir, "src/prerender-entry.tsx"));
  const template = await fs.readFile(templatePath, "utf8");
  const dates = readGitDates();

  const pages = [
    { language: "zh", output: path.join(distDir, "index.html") },
    { language: "zh", output: path.join(distDir, "zh-CN", "index.html") },
    { language: "en", output: path.join(distDir, "en-US", "index.html") },
  ];

  for (const page of pages) {
    const { seo, markup } = renderPrerenderedPage(page.language);
    let html = buildPageHtml(template, seo);

    const langName = languageNameByLocale[seo.locale];
    const jsonLdString = buildJsonLd(seo, langName, dates);
    html = replaceOrThrow(
      html,
      /<script type="application\/ld\+json">\s*[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${jsonLdString}</script>`,
      "json ld",
    );

    html = replaceOrThrow(
      html,
      /<noscript data-i18n="seo-noscript-fallback">[\s\S]*?<\/noscript>/,
      buildNoscriptBlock(seo),
      "noscript block",
    );
    html = replaceOrThrow(html, /<div id="root"><\/div>/, `<div id="root">${markup}</div>`, "root markup");

    await fs.mkdir(path.dirname(page.output), { recursive: true });
    await fs.writeFile(page.output, html);
  }

  await overwriteSitemapLastmod(dates.dateModified);
} finally {
  if (previousReact === undefined) {
    delete globalThis.React;
  } else {
    globalThis.React = previousReact;
  }
}
