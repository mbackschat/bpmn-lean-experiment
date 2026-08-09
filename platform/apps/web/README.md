# Platform web application

This directory owns the static React SPA. It consumes only the public HTTP API and never imports server, module, foundation, or engine implementation code.

The M1 definition workspace uploads exact BPMN XML, reports accepted or rejected admission diagnostics, lists definitions and versions, retrieves the exact admitted source, and renders that source through a viewer-only `bpmn-js` adapter. Strict public-contract decoders and source identity checks keep the browser from silently accepting a malformed or mismatched response.

The approved `bpmn-js` dependency's [bpmn.io license](public/third-party/bpmn-js.LICENSE.txt) requires the supplied bpmn.io watermark to remain unchanged, fully visible, linked to bpmn.io, and unobstructed. The exact notice is copied from `public/` into every static distribution. Modeling, editing, and any use of renderer parsing as an engine admission or semantic decision remain excluded.

Run the API and web client in separate terminals:

```sh
./scripts/pnpm.sh run platform:serve
./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite --host 127.0.0.1
```

The development server proxies `/api` to `http://127.0.0.1:3000`; `PLATFORM_API_ORIGIN` may select another local API origin for isolated automation. Build and test the distribution with `./scripts/pnpm.sh run test:platform-web`.

The required browser acceptance is headless Chromium through development-only Playwright. Install its pinned browser once with `./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec playwright install chromium`, then run `./scripts/pnpm.sh run test:platform-web:e2e`. The test starts isolated API and Vite servers, creates exact BPMN bytes at runtime, and verifies admission, versioning, rendering, attribution, and rejection without using a registered scenario fixture. CI installs Chromium with its Linux host libraries and runs the same command; Playwright and its browser are absent from the production dependency graph and static distribution.

See [the architecture](../../../docs/ARCHITECTURE.md#user-interface) and [the platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md#api-first-architecture) for the durable boundary.
