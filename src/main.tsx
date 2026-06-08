import { createRoot } from "react-dom/client";

import App from "@/App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <App />
    <Toaster richColors position="top-right" theme="light" />
  </TooltipProvider>,
);
