# BPM platform failed Process specification

## Status

Implemented, independently closure-reviewed, and evidence-closed.

## Selected outcome and authority

The engine's existing terminal `failed` Process observation is available through Product 2's persisted execution publication, canonical export, Operations detail, and shared-mode projection lifecycle. The [Compensation failure account](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#runtime-and-public-failure-contract) owns its meaning; this specification adds no BPMN transition, source/profile admission, scheduling rule, CIB relationship, or Product 1 fact.

The exact source-to-result claim is that a Product 2-confirmed execution of the registered travel-cancellation model can reach semantic failure and retain that same public state and complete history through projection, restart, HTTP, browser inspection, and export. Treating the failure as unavailability, successful completion, cancellation, a retryable incident, or a native Workflow failure is wrong. The nearest unsupported claim is recovery of a failed Process; the engine publishes no such interaction.

## Public contract

Product 2 copies the existing engine failure shape into its own dependency-free public contract:

```ts
type CompensationHandlerFailure = Readonly<{
  kind: "compensationHandlerFailure";
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  effectId: OccurrenceId;
  code: string;
  message: string | null;
}>;
```

Each `OccurrenceId` retains the existing complete `{ processInstanceId: string; elementId: string; activation: number }` identity. A failed state requires this exact `failure` field. Running, completed, and cancelled states forbid it and retain their bytes. Not-started state remains outside committed publication. Every nested object is closed; IDs and code are nonempty well-formed Unicode strings, activation is a positive safe integer, and message is a well-formed string, including empty, or explicit null. All three failure Process-instance identities equal the published state instance. The decoder does not infer handler topology, dependency order, or any missing identity.

Every failed state has empty public wait, task, Message, Timer, effect, incident, interaction, and optional Multi-Instance collections. Existing Program-owned optional Multi-Instance presence remains unchanged. Existing definition, instance, revision, cursor, batch, canonical ordering, position-fold, and terminal-position validation continue to apply. Unknown failure kinds, omitted/null failure, failure attached to another status, malformed identities, extra host fields, and surviving live work reject the whole value.

Execution pages and `bpmn-lean.execution-publication.v1` exports preserve the exact failure without redaction under existing Operations authorization. No route or export format is added. A retained incident action resolved by an exact matching `processClosed` receipt may report `status: "failed"` as a definite rejected result; this does not create an incident, a new action, or a successful Retry/Cancel. Work's existing status-free `processClosed` result remains unchanged. Unknown delivery remains indeterminate.

## Persistence and projection rules

Local SQLite and shared PostgreSQL execution projections retain canonical failed-state bytes with the existing contiguous-suffix, exact-overlap, changed-overlap, gap, restart, and rebuild rules. PostgreSQL receives a forward-only checksum-bound migration that widens the existing status constraint and advances the exact application schema epoch. Existing migration bytes remain immutable; API and recovery-worker readiness refuse a mismatched epoch. No data reset, backfill-generated failure, mixed-version reader, or new table is selected.

Closed registration alone does not authorize terminal caching. A failed execution becomes eligible for the existing terminal freshness treatment only when its projection is healthy, current is present, and retained and producer heads agree. Its occurrence projection remains recovery work until it is healthy at that same final head with no open occurrences. A gap, unavailable row, incomplete suffix, or retained open occurrence remains unavailable and eligible for the applicable repair work. The existing single-statement database snapshot and database-clock freshness rules remain intact.

Flow-node metrics continue to consume only published occurrence dispositions. The reviewed failure account uses `cancelled` for the throw, active handlers, and their active bodies; pending handlers never start. Product 2 adds no failed-occurrence count, inferred cancellation, synthetic duration, or special denominator. Completed-duration samples remain completed-only.

## Source-grounded product decision

The [failed-Process preflight](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md#failed-process-inspection-preflight) records current official documentation and pristine CIB source inspection. Adopt exact instance-context failure detail and explicit lifecycle labels. Deliberately distinguish this terminal engine state from CIB/Camunda repairable incidents: show no repair action when none is published.

Operations Overview shows `failed` and a labelled Compensation failure detail with the exact published code, nullable message, and complete trigger, handler, and effect occurrence identities. Null message is labelled absent; an empty message remains empty. Render strings as text, never HTML. Keep History, canonical download, and Operator history accessible through their existing independent availability rules. Diagram uses the existing exact presentation contract and shows no invented live highlight; missing presentation remains an honest unavailable surface.

This outcome adds inspection of confirmed failed Processes, not a browser-start catalog entry for Compensation. Its real-host acceptance deploys exact retained bytes and starts through the existing public Definitions HTTP contract with explicit start data, drives metadata-free tasks through published Product 1 interactions using a labelled test actor, then inspects the same confirmed instance in the production browser. It introduces no canned production start values, new form, private test HTTP endpoint, or simulated human Work claim.

## Required, optional, and excluded

Required are strict public decoding, copied failure facts, both persistence modes, terminal recovery/freshness behavior, definite late-action closure classification, authorized History/export and Overview, and production-backed acceptance. Optional is another presentation of the same failure identity; it may not introduce new facts or actions.

Excluded are general failure kinds, exception stacks, host retries or causes, recovery/retry/cancellation of failed Processes, new BPMN/profile/IL/runtime/Lean behavior, altered handler scheduling or replay policy, Transaction admission, model-catalog eligibility, general start-data UI, new dependencies/packages, proof infrastructure, and production-scale or CIB compatibility claims.

## Hosting and assurance boundary

The existing [Compensation hosting preflight](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#temporal-hosting-and-refinement-preflight) and reviewed public registration own durable start, task ingress, handler effects, retries, cancellation drain, continuation, and replay. Product 2 reads the existing public execution and occurrence gateways and corroborated closed observations; it does not inspect trace, RuntimeState, Event History, native Workflow status, or platform differences to determine failure. The acceptance harness may inspect and replay history only as host evidence outside the product.

No new Lean lane is selected. Existing proved engine semantics remain the premise; Product 2 correctness is checked by boundary, database, and browser evidence. The smallest live witness must reach both successful and failed registered Compensation outcomes through public start, preserve published history and exact terminal facts across platform restart, and replay every actual Run. A technical handler failure or unavailable gateway must not manufacture semantic `failed`.

## Evidence and affected owners

| Boundary | Required discriminator | Existing owner |
|---|---|---|
| Public value | Exact failure survives page/export canonical round trip; each identity, kind, required field, status, live collection, and extra-key mutation rejects; old states remain byte-identical | [execution contract tests](../platform/contracts/test/execution-publication-contract.test.ts), [canonical export tests](../platform/contracts/test/execution-publication-canonical-json.test.ts), [producer vocabulary guard](../scripts/execution-publication-contract-coverage.test.ts) |
| Durable publication | Exact failed bytes survive overlap, suffix application, reopen and rebuild; changed failure at an accepted revision fails | [repository contract](../platform/modules/operate/test/support/execution-publication-repository-contract.ts), [projection tests](../platform/modules/operate/test/execution-publication-projection.test.ts) |
| Shared lifecycle | Old epoch migrates without rewriting retained data; failed final E1 exits recovery only when complete; E2 remains eligible until aligned and empty; healthy terminal evidence survives age expiry while running, gapped and incomplete evidence does not | [PostgreSQL freshness](../platform/modules/operate/test/postgresql/postgresql-projection-freshness.test.ts), [candidate selection](../platform/modules/operate/test/postgresql/postgresql-operate-recovery-candidates.test.ts), [migration tests](../platform/apps/postgresql-migrate/test/postgresql/postgresql-migrate.test.ts) |
| Late actions | Matching failed receipt is rejected, never committed or indeterminate; wrong Process identity remains indeterminate; retained result survives storage and HTTP decoding | [incident mutation service](../platform/modules/operate/src/incident-mutation-service.ts), [incident decoders](../platform/contracts/src/incident-decoders.ts), [stored incident values](../platform/modules/operate/src/incident-values.ts) |
| Product surface | Failed Overview, exact identities/message, readable History and byte-identical download; no Retry/Cancel; escaped text, null/empty distinction, keyboard navigation and no overflow at 1280/1600 | [execution detail](../platform/apps/web/src/process-instance-execution-detail.tsx), [UI-quality lane](../showcase/platform-ui-quality/README.md) |
| Complete journey | Public deployment/start to successful and failed publication; explicit actor, same confirmed instance, platform restart, unchanged completed/cancelled controls, exact terminal evidence and replay | [MUE showcase](../showcase/mue-preview-alpha/README.md), [registered Compensation evidence](capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#public-registration-implementation) |

The [execution publication specification](capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md), [incident operations specification](BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md), [shared-persistence contract](BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md), [flow-node metrics specification](capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md), and [UI design contract](BPM-PLATFORM-UI-DESIGN-SPEC.md) retain their respective meaning.

## Implemented outcome and epistemic closure

The downstream implementation now preserves the existing failure across SQLite/PostgreSQL publication storage, exact-head immutability, shared terminal freshness and recovery selection, definite late incident-action rejection, and Operations Overview, History and export. The checksum-bound migration advances epoch 11 to 12 without rewriting retained publication rows. A terminal execution cannot conceal an incomplete or still-open occurrence projection; closed registration without the publication pair proves no metrics coverage.

The [live journey](../showcase/mue-preview-alpha/e2e/failed-process.spec.ts) deploys the retained travel-cancellation bytes through public HTTP, starts both outcomes with explicit inputs, uses published task identities through a labelled actor, compares Product 2 export bytes with the complete Product 1 publication, restarts the platform, checks browser inspection/download, rejects a substituted failure identity, and replays every collected Run. The [UI witnesses](../showcase/platform-ui-quality/e2e/failed-process-ui-quality.spec.ts) separately distinguish null from empty messages, preserve hostile text and repeated element IDs with different activations, and retain independent History, Diagram and Operator-history availability. The actor is not a Human Work form. The later [RC catalog](BPM-PLATFORM-BROWSER-WALKTHROUGH.md#rc-process-showcase-catalog) supplies a guided successful travel-cancellation journey with simulated participants and services; this specification retains the separate failed-outcome witness.

The established claim is exact downstream preservation and inspection of the selected engine failure. The nearest unsupported claims remain failed-Process recovery, other failure families, general Transaction admission, and production-scale reliability. Producer receipt and publication share the engine account; their agreement cannot independently establish BPMN meaning. Literal failure identities, independent canonical-byte expectations, strict decoder mutations, both database adapters, and browser transport corruption challenge distinct consumer boundaries, while the previously reviewed engine evidence remains the semantic premise. No new Lean result or CIB compatibility result is claimed.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `fd1e18f07d96cc30627d1e3c9da5b7ce789fd492` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `152f3973a6c301ebac0f7012f2f426c518944c93` | `fork-turns-none` | `approve-with-required-edits` | `38afb3e989e59908492562e9070f41150ae9e785` |
| Closure | `d9ff8d16a6e047f0805fbaaacdc2d6c5c82ea601` | `checkpoint-reviewer-warm` | `approve-with-required-edits` | `e907e8cde1f0ac533471004ecc5e83d5ba183e7c` |

The semantic checkpoint used one correction audit. The same isolated reviewer approved `38afb3e9`, closing stale failed-ingress rejection claims without changing the selected contract. Product 1 verification and the ordinary platform gate passed at `152f3973`; its full integration stopped at a PostgreSQL fixture type error. After narrowing that fixture, the complete infrastructure gate and remaining clean-head PostgreSQL, showcase and UI gates passed at `38afb3e9`, including 83 browser tests. These checks establish the copied contract checkpoint; downstream outcome evidence remains separate.

The exact approved checkpoint reviewer approved the first closure correction at `e907e8cd`, closing history-evidence ownership and stale current-status claims. Continuity manifest SHA-256: `c66e3207e9b8b6574d464bc9fff21df456d4cb32b19ccf2ea390d8c47ebc3e0d`; original closure packet: `0f9c87d7e12c4a559332c8b7af56bc37db3cb918e24ffdbc5571d0dd370b6a12`; correction packet: `8c0220db6c728e1711790f9d8956b1f24d3e2de942dfe4e1eb923c5bf64c5ae5`. Selected account, contract, exclusion and evidence sections remained byte-identical through both targets. Clean path-selected integration passes at `b0f01593303e35abd8d40fc79c5dfe48dfaa38c7`; [the cost record](CAPSULE-COST-LEDGER.md#failed-process-product-outcome-2026-09-25) retains the earlier failed receipts and successful qualification. This result establishes no cause or repair for the earlier timing-margin failure.
