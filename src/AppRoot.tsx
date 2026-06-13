import { Toaster } from "sonner";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider, type Language } from "@/lib/i18n";

export function AppRoot({ initialLanguage }: { initialLanguage?: Language } = {}) {
  return (
    <TooltipProvider>
      <LanguageProvider initialLanguage={initialLanguage}>
        <App />
      </LanguageProvider>
      <Toaster richColors position="top-right" theme="light" />
    </TooltipProvider>
  );
}
