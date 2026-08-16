import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import "@bpmn-lean/platform-ui-kit/style.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("web application root is missing");
}

createRoot(container).render(
  <StrictMode>
    <App
      origin={window.location.origin}
      productVersion={__BPMN_LEAN_PRODUCT_VERSION__}
    />
  </StrictMode>,
);
