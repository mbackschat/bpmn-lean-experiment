import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import { App } from "./app";
import { DefinitionScheduleApiClient } from "./definition-schedule-api";
import { DefinitionApiClient } from "./definitions-api";
import { MessageStartPublicationApiClient } from "./message-start-publication-api";
import { IncidentOperationsApiClient } from "./incident-operations-api";
import { ProcessInstanceSearchApiClient } from "./process-instance-search-api";
import { ProcessExecutionApiClient } from "./process-execution-api";
import { WorkApiClient } from "./work-tasks-api";
import "@bpmn-lean/platform-ui-kit/style.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("web application root is missing");
}

const api = new DefinitionApiClient(window.location.origin);
const messageStartPublicationApi = new MessageStartPublicationApiClient(window.location.origin);
const incidentOperationsApi = new IncidentOperationsApiClient(window.location.origin);
const processInstanceSearchApi = new ProcessInstanceSearchApiClient(window.location.origin);
const processExecutionApi = new ProcessExecutionApiClient(window.location.origin);
const scheduleApi = new DefinitionScheduleApiClient(window.location.origin);
const workApi = new WorkApiClient(window.location.origin);
const queryClient = new QueryClient();
createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App
        api={api}
        incidentOperationsApi={incidentOperationsApi}
        messageStartPublicationApi={messageStartPublicationApi}
        processInstanceSearchApi={processInstanceSearchApi}
        processExecutionApi={processExecutionApi}
        scheduleApi={scheduleApi}
        workApi={workApi}
      />
    </QueryClientProvider>
  </StrictMode>,
);
