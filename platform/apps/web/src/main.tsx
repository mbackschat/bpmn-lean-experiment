import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./app";
import { DefinitionApiClient } from "./definitions-api";
import { WorkApiClient } from "./work-tasks-api";
import "@bpmn-lean/platform-ui-kit/style.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("web application root is missing");
}

const api = new DefinitionApiClient(window.location.origin);
const workApi = new WorkApiClient(window.location.origin);
const queryClient = new QueryClient();
createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App
        api={api}
        origin={window.location.origin}
        productVersion={__BPMN_LEAN_PRODUCT_VERSION__}
        workApi={workApi}
      />
    </QueryClientProvider>
  </StrictMode>,
);
