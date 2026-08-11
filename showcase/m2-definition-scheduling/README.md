# M2 exact-version definition scheduling

This private development package owns the live Temporal refinement, cancellation, and browser acceptance witnesses required by the [definition-scheduling proposal](../../docs/BPM-PLATFORM-DEFINITION-SCHEDULING-PROPOSAL.md#required-evidence) for the [M2 showcase](../../docs/PLAN.md#m2--the-file-runs-its-real-shape). It contains test composition only and adds no production API or behavior.

The witness uses only the public platform server, platform contracts, and Temporal testkit package roots. It deploys two exact Timer Start versions through HTTP, survives a platform restart and Worker absence, proves the one Schedule action remains bound to version 1, completes and replays the resulting Process, exercises the action-wins cancellation race, and proves durable pre-start cancellation creates no Workflow. Temporal Schedule, Workflow, and Run identities remain test-only evidence and are rejected from every captured public JSON response.

The browser witness composes the cached Temporal service, production Worker, production platform server, and production React client. Headless Chromium creates exact Timer Start BPMN bytes at runtime, deploys version 1, schedules that exact version through the published UI, deploys a distinct version 2 before the due instant, and observes the started Process instance remain bound to version 1. The browser sees only public definition, capability, schedule, and instance facts.

Run the focused gate against the cached pinned Temporal CLI:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-definition-scheduling test
```

Install the pinned development-only browser once and run the browser gate:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-definition-scheduling exec playwright install chromium
./scripts/pnpm.sh run test:showcase:m2
```

Playwright, Chromium, and `@bpmn-lean/temporal-testkit` are development-only dependencies of this acceptance package. They are absent from the web bundle and every production dependency graph.
