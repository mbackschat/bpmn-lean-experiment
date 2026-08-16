# BPM platform web application

This is the browser application for the BPM platform. It is a static React app that talks only to the platform's public HTTP API.

## What you can do

- **Definitions:** upload BPMN XML, review admission diagnostics, inspect versions, view or download a diagram, and start an exact version.
- **Work:** find priority-ordered tasks visible to the current actor, claim one, complete either its legacy typed field or its exact-catalog-bound structured form, choose among declared resolution actions, and inspect its Process context. An unclaimed task exposes Claim but cannot enter the completion flow.
- **Operations:** search Process instances, inspect committed execution history and current diagram positions, review and download the independently ordered operator audit for one confirmed instance, retry or cancel incidents, review incident audit events, and view definition-version flow-node metrics.
- **About:** inspect the exact build version and all currently registered executable BPMN element variants, their restrictions, and their separately classified CIB Seven evidence.

The About table is built from the same canonical capability catalog that the retained-model guard checks against registered pipeline XML. It is a bounded evidence disclosure, not a BPMN conformance percentage or a claim that every CIB Seven behavior is compatible. The UI never receives Temporal Workflow IDs, Run IDs, Task Queues, Event History, or private engine locators. Diagrams are presentation only and never decide whether a model is executable.

The production bundle loads the Work shell first. The complete Work workspace, Definitions, Operations, About, their workspace-only HTTP clients, the structured-form surface, and the bpmn-js viewer runtime and styles load only when their workspace or detail boundary is opened. The production-bundle guard keeps the initial JavaScript graph below 500 kB and rejects an eager bpmn-js runtime.

## Run locally

Start the platform API and the web development server in separate terminals:

```sh
./scripts/pnpm.sh run platform:serve
./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite --host 127.0.0.1
```

The development server proxies `/api` to `http://127.0.0.1:3000`. Set `PLATFORM_API_ORIGIN` only when an isolated local harness needs a different API origin.

## Test locally

Run the web package tests:

```sh
./scripts/pnpm.sh run test:platform-web
```

Run the production-built headless-Chromium functional journeys at 1280 and 1600 pixels:

```sh
./scripts/pnpm.sh run test:ui-quality
```

Before pushing a UI-facing commit, run the exact local GitHub entry point described by the [three-level verification policy](../../../docs/TESTING-SPEC.md#three-level-verification-policy).

## Learn more

- [Source map](SOURCE-MAP.md) maps features to their main source owners.
- [Human-work walkthrough](../../../docs/HUMAN-WORK-WALKTHROUGH.md) is the maintained guided task journey.
- [Structured Human Work proposal](../../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-PROPOSAL.md) owns the implemented M6 form and action boundary until closure graduation.
- [UI design specification](../../../docs/BPM-PLATFORM-UI-DESIGN-SPEC.md) owns interaction, accessibility, responsive behavior, and browser evidence.
- [Architecture](../../../docs/ARCHITECTURE.md#user-interface) owns package boundaries.

## bpmn-js license

The bundled viewer keeps the required bpmn.io watermark visible and unmodified. See the included [bpmn-js license](public/third-party/bpmn-js.LICENSE.txt). The application uses bpmn-js for viewing and overlays, not for engine admission or BPMN semantics.
