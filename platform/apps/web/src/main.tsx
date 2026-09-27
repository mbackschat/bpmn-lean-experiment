import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "./navigation/router.tsx";
import "@bpmn-lean/platform-ui-kit/style.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("web application root is missing");
}

const queryClient = new QueryClient();
const router = createAppRouter({ origin: window.location.origin, productVersion: __BPMN_LEAN_PRODUCT_VERSION__, queryClient });

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
