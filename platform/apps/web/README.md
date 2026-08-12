# Platform web application

This directory owns the static React SPA. It consumes only the public HTTP API and never imports server, module, foundation, or engine implementation code.

The definition workspace uploads exact BPMN XML, reports accepted or rejected admission diagnostics, lists definitions and versions, retrieves the exact admitted source, renders that source through a viewer-only `bpmn-js` adapter, and starts the selected exact version. It also publishes one caller-identified Message Start against the selected version's complete operation-addressed capability and shows the public pending, accepted, or indeterminate receipt. A global Process-instance panel searches confirmed Product 2 starts by exact semantic instance, Process, version, or source digest, preserves submitted filters across opaque-cursor paging, and renders only the public identity plus exact definition fields. The global Human Work panel uses TanStack Query for bounded refresh and mutations, the platform React Aria kit for accessible controls, TanStack Table for native inbox structure, and a CSS Module for feature styling. It renders the engine-published string or Boolean form field without coercion and submits the exact task occurrence through the public Work API. Strict public-contract decoders, request-to-response identity binding, duplicate refusal, and source identity checks keep the browser from silently accepting a malformed or mismatched response; private Temporal identity and inferred lifecycle state are never part of this client.

The approved `bpmn-js` dependency's [bpmn.io license](public/third-party/bpmn-js.LICENSE.txt) requires the supplied bpmn.io watermark to remain unchanged, fully visible, linked to bpmn.io, and unobstructed. The exact notice is copied from `public/` into every static distribution. Modeling, editing, and any use of renderer parsing as an engine admission or semantic decision remain excluded.

Run the API and web client in separate terminals:

```sh
./scripts/pnpm.sh run platform:serve
./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite --host 127.0.0.1
```

The development server proxies `/api` to `http://127.0.0.1:3000`; `PLATFORM_API_ORIGIN` may select another local API origin for isolated automation. Build and test the distribution with `./scripts/pnpm.sh run test:platform-web`.

Required browser acceptance belongs to the independent [M1](../../../showcase/m1-definition-deployment/README.md), [M2 Process-instance search](../../../showcase/m2-process-instance-search/README.md), and [M3 Human Work](../../../showcase/m3-human-work/README.md) showcases, not this production web package. They compose the production server and Worker around the same static client while keeping Playwright, Chromium, and Temporal test infrastructure out of this package and its distribution.

See [the architecture](../../../docs/ARCHITECTURE.md#user-interface) and [the platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md#api-first-architecture) for the durable boundary.
