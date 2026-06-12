import { createRoot } from "react-dom/client";

import App from "@/App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/i18n";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <LanguageProvider>
      <App />
    </LanguageProvider>
    <Toaster richColors position="top-right" theme="light" />
  </TooltipProvider>,
);
