# M2 definition-scoped correlated Message ingress

This private development package owns the production-browser and real-Temporal acceptance witness for the definition-scoped correlated Message interaction selected in the [Product 2 UI/UX research](../../docs/research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md). It configures and drives production packages but adds no reusable production behavior or private alternative API.

The witness deploys the retained [Message-key correlation model](../../scenarios/message-key-correlation/process.bpmn), starts four exact-version Processes through the public platform, and uses an explicit showcase actor to deliver each prerequisite direct payload Message through Product 1's public operation. It then opens Definitions → Triggers and proves that the published definition capability needs only a caller-owned command ID and one bounded string value: no Process locator, business key, tenant, Workflow ID, Run ID, or subscription identity is accepted or exposed.

Headless Chromium sends the unique publication through the production server, discards its first committed HTTP response, and retries the byte-identical command and value. The retained result identifies exactly one public Process, and only that Process advances to the review task. Fresh commands then prove zero-match and ambiguous outcomes while all non-selected Processes remain at their exact correlated waits. The journey also queries the selected Process candidate through the real Temporal Workflow boundary, so a semantic wait without its durable registration cannot satisfy the gate.

Install the pinned development-only browser once, then run the focused gate:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-correlated-message-ingress exec playwright install chromium
./scripts/pnpm.sh run test:showcase:m2-correlated-message-ingress
```

Playwright, Chromium, the cached Temporal service, and `@bpmn-lean/temporal-testkit` are development-only acceptance dependencies. They are absent from the web bundle and every production dependency graph.
