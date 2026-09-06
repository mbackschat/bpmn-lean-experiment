# Temporal adapter subsystem

`packages/temporal-adapter/` contains the packages that durably host the pure [TypeScript semantic core](../semantic-core/README.md) on Temporal. The subsystem separates client, Workflow, Worker, product runner, protocol, and test-only dependencies so Temporal mechanisms never define BPMN behavior.

## What you can do

Run an admitted BPMN Process against an existing Temporal service, observe current semantic waits, submit occurrence-bound commands, and recover or replay the durable execution through the same product boundary.

The runner compiles BPMN before it opens a network connection. Temporal records delivery and Workflow decisions, while the semantic core remains the owner of BPMN-visible transitions and canonical observations.

The lazy client runtime exposes an explicit connection handshake for application readiness without coupling construction to network availability.

The [production lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract) owns the Workflow-chain contract:

- Start without an SDK handle, recover content-bound User Task, Message, Retry, and Cancel commands through the latest Run, and read the closed public v1 terminal receipt.
- Traverse paired execution and occurrence publication pages across retained Runs while Workflow/Run identities and segment descriptors remain private.
- Keep Event History, continuation, recovery, publication, pending work, and terminal results inside their independently checked budgets. The [Temporal evidence map](../../docs/TEMPORAL-TEST-EVIDENCE-MAP.md) locates exact-bound, overflow, forced-rollover, and replay witnesses.
- Run immutable bundle-derived native deployment versions with `PINNED` Process and ingress chains. Explicit fresh-Namespace initialization establishes the first Current; ordinary Worker startup registers a candidate without promotion. Creation requires native enrollment readiness, and retained Run Queries require the original version's Workers throughout retention. The [deployment repair](../../docs/TEMPORAL-WORKER-DEPLOYMENT-REPAIR-SPEC.md) records the closure-reviewed contract and its exclusions.
- Preserve the admitted Message subscription, Timer occurrence, or Service Task effect across forced rollover. Deployment changes create no BPMN transition.

The registered sequential Multi-Instance User Task profile reuses that Workflow-chain boundary with one managed outer-lifetime Timer. Its natural and interrupted witnesses cross the pre-arming continuation boundary, preserve the same semantic Timer through task turnover, replace the Worker, recover an accepted Update result, compare production histories with the independently measured capacity envelope, validate exact E1/E2 publication and terminal receipts, and replay every Run. The interrupted schedule reaches a third Run only after the original Timer callback is reduced, rejects the stale inner task, and exposes no partial output collection.

The interrupting Activity boundary Message specification has one Workflow-owned Signal/Update readiness scheduler. It admits only the isolated operation-addressed payload-free pair, preserves either callback as the sole winner, excludes ledger-suppressed callbacks from semantic contention, and fails nonretryably when the exact Message and task completion share one Workflow activation instead of deriving BPMN order from SDK job order. A pending scheduler callback blocks Continue-As-New until it is reduced; an idle committed pair remains eligible to cross a Run boundary.

Message key correlation has eight private hosting primitives: canonical complete-address ingress, content-bound candidate registration, Process-side staged commit with an exact candidate Query, barrier-linearized candidate fanout, publication admission with a fixed future-result reservation, complete-vector semantic settlement, same-target delivery/recovery, and strict correlation-ingress continuation. Pending registration blocks scan begin without withholding the already assigned publication ordinal; an installed barrier makes prepare return `deferredByScan` without recording; and only a complete ordered vector from running Process Workflows can reach the pure exact-cardinality matcher. Publication validators reserve the bounded payload queue and ledger atomically, while the main loop alone assigns contiguous FIFO ordinals and starts one scan. Missing, closed, malformed, or changed Query state fails the whole Activity and retains the barrier. Zero or ambiguity replaces the current reservation and releases only its exact barrier before the next ordinal; uniqueness retains the sole target and barrier for one bounded Activity and exact Process Update. Response loss resolves against that same Process without another Update or rematch. Commit removes the exact locator; semantic refusal or a closed/unknown contradiction quarantines it in place, later admission consumes no queue or ledger slot, and an already accepted queued publication settles against the retained quarantined target instead of losing its reserved result. The continuation owner carries the complete registration and publication states with an explicit fanout-or-target phase, validates their combined identity relation including assigned publication state blocked before barrier installation, enforces the exact 896 KiB separately encoded aggregate and 128-Run ceiling, and rolls over only after handler drain with no Activity result or backoff Timer in flight. Live forced pending-registration, fanout-failure, and target-delivery-failure cases retain accepted state across exact two-Run chains, replace the Worker, preserve FIFO ordinals, avoid rematching a selected target, and replay every Run. The independently approved public client ensures that ingress, resolves retained status before Update submission, preserves an explicit private identity-conflict status, and returns only the approved semantic, admission-capacity, or infrastructure union; a selected target crosses only in a settled semantic or target-inconsistent result. The registered profile admits only its isolated two-catch program, and the product runner publishes the target-free definition-scoped command through that public operation. Four answer-free population schedules compare Lean and the pure core, while the real-service refinement witness proves unique, zero, ambiguous, and cross-definition outcomes, Worker replacement, identical same-target retry after post-commit response loss, and replay of every Process and ingress history.

The Compensation semantic checkpoint extends strict Workflow continuation decoding across all four optional retention, snapshot, trigger, and handler-effect-wait collections, including the exact frozen context of a deferred Event Sub-Process handler before scheduling. Protocol publication validation and Workflow continuation preserve the private Compensation trigger and handler occurrence anchors produced by the pure core, and a typed failed Process result is terminal through the protocol, Workflow receipt, client, and runner surfaces. The checkpoint-only source compiler reaches Product 1 with its exact lowered Program and one required Program-derived String Process-start binding. Malformed or snapshot/execution-capacity-exceeding starts are rejected as semantic-process unsupported before `client.start`; the exact valid program is admitted to a dedicated Workflow scheduler. That scheduler preflights and starts a complete maximal frontier before observing results, binds each Activity to definition, trigger, handler, effect, descriptor, and arguments, canonicalizes callbacks from one activation, fences Continue-As-New while any Activity is unreconciled, and drains sibling cancellation before terminal return. Its Compensation-only one-second heartbeat timeout makes cancellation delivery possible while `WAIT_CANCELLATION_COMPLETED` holds terminal return; an implementation that may remain live must heartbeat. Live exact-source evidence proves a pre-schedule Continue-As-New boundary, Worker replacement, same-key retry after one mutation, frozen input, concurrent B/C with A after B, typed failure publication before sibling cancellation drain, exact completed and failed receipts, and replay of all eleven Runs across both paths. Registration and public capability remain absent.

The containerized evaluation distribution uses the `bpmn-evaluation-worker` entry point. It connects to the caller-selected Temporal address, Namespace, and Task Queue from `BPMN_TEMPORAL_ADDRESS`, `BPMN_TEMPORAL_NAMESPACE`, and `BPMN_TEMPORAL_TASK_QUEUE`; uses `BPMN_WORKER_IDENTITY` as the fleet instance component of an exact bundle-bound poller identity; and exposes internal `/healthz` liveness and `/readyz` native enrollment readiness on `BPMN_WORKER_HEALTH_PORT`. All five values are required. Readiness requires a live poller and the selected fleet's exact Current/no-ramp/queue-registration contract; it never promotes this Worker.

The explicit `bpmn-evaluation-worker initialize-fresh-namespace --retention-seconds 86400` command creates the configured Namespace, registers the bundle, establishes its first Current, shuts down, and exits. An existing Namespace is refused without fallback or conversion. Run initialization only for fresh setup; ordinary startup and restart connect without selecting Current. The [evaluation setup](../../README.md#use-the-bpm-platform-in-a-browser) and demo preparation invoke this command before starting the full Compose stack.

For the evaluation incident journey only, that entry point supplies a process-local host simulation which reports one technical failure for the first Activity invocation of each exact effect idempotency key and succeeds with an empty local patch on later invocations. This exercises the existing retry and incident mechanism. It defines neither BPMN meaning nor a production integration contract, and it does not change the configured host-effect implementation used by the maintained engine example.

## Quick start

Start a local Temporal service in one terminal:

```sh
temporal server start-dev --headless
```

Build the runtime packages in another terminal:

```sh
./scripts/pnpm.sh run build:temporal-adapter
```

Copy [the maintained example](../../examples/temporal-mvp/user-task-discovery-completion.json) to `/tmp/bpmn-mvp.json`. In that copy, set `temporal.namespace` to the unused name `bpmn-mvp-fresh` and make `bpmn.file` the absolute path to [its BPMN model](../../scenarios/user-task-discovery-completion/process.bpmn). Preserve the other fields. The example selects `localhost:7233` and Task Queue `bpmn-mvp`.

Initialize that fresh Namespace once, with the same queue and executable bundle:

```sh
BPMN_TEMPORAL_ADDRESS=localhost:7233 \
BPMN_TEMPORAL_NAMESPACE=bpmn-mvp-fresh \
BPMN_TEMPORAL_TASK_QUEUE=bpmn-mvp \
BPMN_WORKER_IDENTITY=bpmn-mvp-initializer \
BPMN_WORKER_HEALTH_PORT=8081 \
node packages/temporal-adapter/runner/dist/evaluation-worker-main.js initialize-fresh-namespace --retention-seconds 86400
./scripts/pnpm.sh run mvp:run -- /tmp/bpmn-mvp.json
```

An existing Namespace, including the development server's pre-created `default`, is refused. For later runs in this enrolled Namespace, retain its original Worker bundle, choose a fresh semantic Process-instance ID in the copied configuration, and run only `mvp:run`. Preserve existing unversioned environments with their original Workers; initialization performs no conversion.

Run the focused adapter gate with:

```sh
./scripts/pnpm.sh run test:temporal
```

## Learn more

- [Source map](SOURCE-MAP.md) explains package and execution-environment ownership.
- [Runnable Temporal MVP specification](../../docs/RUNNABLE-TEMPORAL-MVP-SPEC.md) owns the command contract, supported runner surface, and exit behavior.
- [Production lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns durable ingress, recovery, retry, and lifecycle distinctions.
- [Temporal execution research](../../docs/research/TEMPORAL-EXECUTION-RESEARCH.md) records the source-grounded hosting analysis.
- [Temporal test evidence map](../../docs/TEMPORAL-TEST-EVIDENCE-MAP.md) maps exact witnesses and mutations to the focused gate.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the closure-reviewed two-order replacement, stale-refusal, replay, and Query-mutation witness.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 typed-value transport, content identity, replacement, conflict, history, and replay boundary.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the exact managed-deadline and production-refinement boundary.
- [Activity boundary Message specification](../../docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md) owns the closure-reviewed exact Message/completion race and its real-service refinement evidence.
- [`implementation-status-owner:TEMPORAL-HOSTING`](../../docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) records current hosting and replay evidence without turning Event History into BPMN state.

The rejection demonstration `./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/unsupported.json` performs source admission without connecting to Temporal. The optional time-skipping lane is `./scripts/pnpm.sh run test:timer-time-skipping`.
