import { Toaster } from "sonner";

import App from "@/App";
import { SeoContent } from "@/components/seo-content";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useI18n, LanguageProvider, type Language } from "@/lib/i18n";

function SkipToContent() {
  const { copy } = useI18n();
  return (
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-background focus:px-3 focus:py-1 focus:shadow">
      {copy.skipToContent}
    </a>
  );
}

export function AppRoot({ initialLanguage }: { initialLanguage?: Language } = {}) {
  return (
    <TooltipProvider>
      <LanguageProvider initialLanguage={initialLanguage}>
        <SkipToContent />
        <SeoContent />
        <App />
      </LanguageProvider>
      <Toaster richColors position="top-right" theme="light" />
    </TooltipProvider>
  );
}
