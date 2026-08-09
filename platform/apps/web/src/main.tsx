import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import { App } from "./app";
import { DefinitionApiClient } from "./definitions-api";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("web application root is missing");
}

const api = new DefinitionApiClient(window.location.origin);
createRoot(container).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
