import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppRoot } from "@/AppRoot";
import { getSeoMetadata, type Language } from "@/lib/i18n";

export function renderPrerenderedPage(language: Language) {
  const seo = getSeoMetadata(language);
  const markup = renderToStaticMarkup(<AppRoot initialLanguage={language} />);

  return { seo, markup };
}
