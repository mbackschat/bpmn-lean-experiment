# M2 exact-version definition scheduling

This private development package owns the live Temporal refinement, cancellation, and browser acceptance witnesses required by the [definition-scheduling specification](../../docs/BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md#required-evidence) for the [M2 showcase](../../docs/SHOWCASE-MILESTONE-LADDER-DECISION.md#m2--the-file-runs-its-real-shape). It contains test composition only and adds no production API or behavior.

The witness uses only the public platform server, platform contracts, Temporal host, and engine API package roots. It deploys three Timer Start versions of one Process through HTTP and schedules only occurrences the engine lists through `GET .../schedule-occurrences`, never an instant it computes itself: occurrences count from the version's engine registration, so a duration Timer Start has one. It witnesses the idempotent PUT retry and the refusals of a second Schedule ID for a bound occurrence (409), a rebinding (409), an unlisted or past instant (422), and that a refused PUT creates no Temporal Schedule. Version 2's registration supersedes version 1's Timer Start, so version 1's Schedule still fires and ends `refused` with the engine's `timer-start-superseded` and starts no Process, while version 2's Schedule ends `started` under the engine's `timer:` identity. The witness survives a platform restart, takes the Worker away before the first action so each firing Workflow (`runTimerStartFiring`) shows a start no Worker has taken, and lets the action win the cancellation race once the replacement Worker answers. It completes and replays the Process chain the population started and both firing Workflows, and proves durable pre-due cancellation of version 3's occurrence creates no firing and no Process. Registering a version and reading a Schedule query the population, so the Worker is present for those steps and absent only across the first action. Temporal Schedule, Workflow, and Run identities remain test-only evidence and are rejected from every captured public JSON response.

The browser witness composes the cached Temporal service, Temporal host Worker, production platform server, and production React client. Headless Chromium creates exact Timer Start BPMN bytes at runtime, deploys version 1, selects its one listed occurrence in the published UI's Occurrence picker and creates the schedule, then deploys version 2 before the due instant and schedules version 2's occurrence. It observes version 1's schedule show the engine refusal `timer-start-superseded` with no Process instance, and version 2's schedule start a Process instance bound to version 2. The browser sees only public definition, capability, occurrence, schedule, and instance facts.

Run the focused gate against the cached pinned Temporal CLI:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-definition-scheduling test
```

Install the pinned development-only browser once and run the browser gate:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-definition-scheduling exec playwright install chromium
./scripts/pnpm.sh run test:showcase:m2
```

Playwright, Chromium, and the `@bpmn-lean/temporal-host` and `@bpmn-lean/engine-api` test hosts are development-only dependencies of this acceptance package. They are absent from the web bundle and every production dependency graph.
