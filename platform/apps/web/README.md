# Platform web application

This directory owns the static React SPA. It consumes only the public HTTP API and never imports server, module, foundation, or engine implementation code.

The M1 definition workspace uploads exact BPMN XML, reports accepted or rejected admission diagnostics, lists definitions and versions, retrieves the exact admitted source, renders that source through a viewer-only `bpmn-js` adapter, and starts the selected exact version. Strict public-contract decoders, request-to-response definition binding, and source identity checks keep the browser from silently accepting a malformed or mismatched response.

The approved `bpmn-js` dependency's [bpmn.io license](public/third-party/bpmn-js.LICENSE.txt) requires the supplied bpmn.io watermark to remain unchanged, fully visible, linked to bpmn.io, and unobstructed. The exact notice is copied from `public/` into every static distribution. Modeling, editing, and any use of renderer parsing as an engine admission or semantic decision remain excluded.

Run the API and web client in separate terminals:

```sh
./scripts/pnpm.sh run platform:serve
./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite --host 127.0.0.1
```

The development server proxies `/api` to `http://127.0.0.1:3000`; `PLATFORM_API_ORIGIN` may select another local API origin for isolated automation. Build and test the distribution with `./scripts/pnpm.sh run test:platform-web`.

The required browser acceptance belongs to the [M1 showcase](../../../showcase/m1-definition-deployment/README.md), not this production web package. It composes the production server and Worker around the same static client while keeping Playwright, Chromium, and Temporal test infrastructure out of this package and its distribution.

See [the architecture](../../../docs/ARCHITECTURE.md#user-interface) and [the platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md#api-first-architecture) for the durable boundary.
