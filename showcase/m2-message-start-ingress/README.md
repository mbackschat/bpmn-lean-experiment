# M2 exact-version Message Start ingress

This private development package owns the live Temporal refinement and browser acceptance witnesses required by the [Message Start ingress proposal](../../docs/BPM-PLATFORM-MESSAGE-INGRESS-PROPOSAL.md#stable-rules-and-evidence) for the [M2 showcase](../../docs/PLAN.md#m2--the-file-runs-its-real-shape). It contains test composition only and adds no production API or behavior.

The live witness deploys two versions of one Process with the same Message and Interface but different Interface Operations and first User Tasks. It publishes version 1 only after version 2 exists, discards the first HTTP response, restarts the production platform server against the same SQLite store, and proves that the one accepted publication retains the same public Process instance and starts exactly one version-1 Workflow while no Worker polls. A replacement production Worker reaches and completes only the version-1 User Task. Test-only Temporal inspection verifies Worker-independent creation, zero Schedules and fanout, exact terminal state, replay, and absence of Signal, Schedule, Child Workflow, and Activity mechanisms. A direct Workflow-start mutation creates no publication resource.

The browser witness composes the cached Temporal service, production Worker, production platform server, and production React client. Headless Chromium creates exact version-1 bytes, deploys a distinct version 2, reselects version 1, verifies the complete operation-addressed capability, publishes the generated caller-owned UUID, refreshes the accepted publication, and sees only the version-1 public Process identity.

Run the focused live gate against the cached pinned Temporal CLI:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-message-start-ingress test
```

Install the pinned development-only browser once and run the browser gate:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-message-start-ingress exec playwright install chromium
./scripts/pnpm.sh run test:showcase:m2-message-start-ingress
```

Playwright, Chromium, and `@bpmn-lean/temporal-testkit` are development-only dependencies of this acceptance package. They are absent from the web bundle and every production dependency graph.
