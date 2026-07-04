import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

let gitAvailable = false;
let isShallow = true;
try {
  execSync("git rev-parse --is-inside-work-tree", { cwd: rootDir, stdio: "ignore" });
  gitAvailable = true;
  const shallow = execSync("git rev-parse --is-shallow-repository", { cwd: rootDir, encoding: "utf8" }).trim();
  isShallow = shallow === "true";
} catch {
  gitAvailable = false;
}
const dateAssertionsEnabled = gitAvailable && !isShallow;

const failed = [];
const locales = ["zh-CN", "en-US"];

function assert(condition, label) {
  if (!condition) {
    failed.push(label);
    console.error("✘ FAIL: " + label);
  } else {
    console.log("✓ PASS: " + label);
  }
}

function readHtml(locale) {
  return fs.readFileSync(path.join(distDir, locale, "index.html"), "utf8");
}

for (const locale of locales) {
  const html = readHtml(locale);

  // h1 至少 1 个
  assert((html.match(/<h1/g) || []).length >= 1, `${locale}: <h1> exists`);

  // OG 尺寸/类型
  assert(html.includes('property="og:image:width" content="1200"'), `${locale}: og:image:width=1200`);
  assert(html.includes('property="og:image:type" content="image/svg+xml"'), `${locale}: og:image:type`);
  assert(html.includes('property="og:image:secure_url" content="https://cpa-image.site/og-image.svg"'), `${locale}: og:image:secure_url`);

  // x-default 尾斜杠
  assert(html.includes('hreflang="x-default" href="https://cpa-image.site/"'), `${locale}: x-default trailing slash`);

  // JSON-LD inLanguage 双语
  assert(
    /"inLanguage"\s*:\s*\[[\s\S]*?"zh-CN"[\s\S]*?"en-US"[\s\S]*?\]/.test(html),
    `${locale}: JSON-LD inLanguage contains zh-CN and en-US`,
  );

  // JSON-LD @type=WebApplication
  assert(/"@type"\s*:\s*"WebApplication"/.test(html), `${locale}: JSON-LD WebApplication`);

  // JSON-LD BreadcrumbList + image
  assert(/"@type"\s*:\s*"BreadcrumbList"/.test(html), `${locale}: JSON-LD BreadcrumbList`);
  assert(/"image"\s*:\s*"[^"]+og-image\.svg"/.test(html), `${locale}: JSON-LD image field`);

  // datePublished/dateModified（仅在 git 可用且非 shallow）
  if (dateAssertionsEnabled) {
    assert(/"datePublished"\s*:\s*"\d{4}-\d{2}-\d{2}/.test(html), `${locale}: JSON-LD datePublished (git non-shallow)`);
  } else {
    console.log(`SKIP: ${locale}: datePublished assertion (git shallow or unavailable)`);
  }

  // html dir=ltr
  assert(new RegExp(`<html\\s+lang="${locale}"\\s+dir="ltr">`).test(html), `${locale}: html lang+dir=ltr`);

  // noscript 单语言、无占位残留
  assert(/<noscript[^>]*data-i18n="seo-noscript-fallback"/.test(html), `${locale}: noscript block`);
  assert(!html.includes("JS_REQUIRED_PLACEHOLDER"), `${locale}: noscript no placeholder residue`);
  assert(/<noscript[^>]*>[\s\S]*?<\/noscript>/.test(html) && (html.match(/<noscript[^>]*>[\s\S]*?<\/noscript>/) || [""])[0].trim().length > 0, `${locale}: noscript non-empty`);

  // 单语言检测：zh dist 不应含 en noscript prose 关键短语；反之亦然
  if (locale === "zh-CN") {
    assert(!html.includes("enable JavaScript in a modern browser"), `${locale}: zh dist excludes en noscript prose`);
  } else {
    assert(!html.includes("启用 JavaScript 的现代浏览器"), `${locale}: en dist excludes zh noscript prose`);
  }
}

// robots.txt
const robots = fs.readFileSync(path.join(distDir, "robots.txt"), "utf8");
assert(robots.includes("User-agent: GPTBot"), "robots: GPTBot Allow");
assert(robots.includes("User-agent: ClaudeBot"), "robots: ClaudeBot Allow");

// llms.txt / llms-full.txt / manifest.webmanifest 存在且非空
for (const file of ["robots.txt", "llms.txt", "llms-full.txt", "manifest.webmanifest"]) {
  const p = path.join(distDir, file);
  if (!fs.existsSync(p)) {
    assert(false, `${file} exists`);
    continue;
  }
  const stat = fs.statSync(p);
  assert(stat.size > 0, `${file} non-empty`);
}

// sitemap lastmod 重写（反向护栏）
const sitemap = fs.readFileSync(path.join(distDir, "sitemap.xml"), "utf8");
assert(!sitemap.includes("2026-06-13"), "sitemap: lastmod overwritten (not 2026-06-13)");
assert((sitemap.match(/<lastmod>/g) || []).length === 3, "sitemap: 3 lastmod entries");

if (failed.length) {
  console.error("\nSEO assert failed: " + failed.length + " assertion(s)");
  process.exit(1);
} else {
  console.log("\nAll SEO assertions passed.");
}
