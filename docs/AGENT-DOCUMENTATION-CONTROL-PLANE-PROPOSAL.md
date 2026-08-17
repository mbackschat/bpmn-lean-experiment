# Agent documentation control-plane proposal

## Status

Draft. Awaiting owner decision after the requested context-cold review. This proposal changes no current documentation role, startup instruction, implementation claim, product contract, semantic meaning, proof boundary, or verification gate until approved and implemented separately.

## Decision requested

Approve replacing the two monolithic agent-facing living documents with a compact execution control file, a compact implementation-routing map, and four cohesive detail maps. Preserve exact current claims and executable drift protection while reducing mandatory universal startup reading from 15,983 words to at most 4,000 words and ordinary active-area reading to at most 8,000 words.

The recommended decision is approval. The current ownership model protects truth effectively, but its physical layout now makes every agent session load unrelated closed work and makes each small implementation increment restate one status across several documents.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `be62f0c` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

This proposal is documentation governance rather than a material semantic proposal under [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate). It selects no BPMN meaning, semantic profile, CIB relationship, checked-source or Semantic Process representation, runtime or public observation, admission capability, transition family, proof boundary, or Temporal refinement claim. The owner nevertheless requested a context-cold proposal review because an inefficient control plane can repeatedly misroute implementation work.

## Problem and measured baseline

[PLAN.md](PLAN.md) correctly owns immediate work order and exact resume state, while [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) correctly owns exact live implementation, proof, evidence, and absence status. Their content ownership is sound. Their mandatory-read shape is not.

At proposal baseline `b5a2f1a`, `PLAN.md` contains 5,988 words against its 6,000-word backstop and `IMPLEMENTATION-MAP.md` contains 9,995 words against its 10,000-word backstop. Every session must therefore read 15,983 words before routing to the active proposal, specification, source, and tests.

The plan devotes 2,011 words to the closed M0 through M6 ladder, 851 to durable approved decisions, 818 to the general coverage program, and 518 to generic deferrals and stop conditions. Its operationally valuable checkpoint, ordered work, and resume sections contain about 1,400 words. Closed milestone narration and durable policy are not needed to choose or execute the next action.

The implementation map combines project foundation, Product 2, A12 adoption, wire contracts, profile, runtime data, scopes, IL, source, Lean, semantic core, CIB, Temporal, differential evidence, and conformance in one mandatory file. An agent changing Temporal capacity must load the Product 2, A12, CIB, source, and Lean inventories even when their boundaries are explicit non-requirements.

The six most recent capacity increments all edited `PLAN.md`, `IMPLEMENTATION-MAP.md`, and Temporal research; five also edited the active Workflow-chain proposal. The same implementation state is currently summarized in the plan checkpoint, plan resume, plan evidence, implementation-map current claim, implementation-map Temporal inventory, proposal status, and research. Both latest increments crossed a documentation backstop and required prose compression instead of an ownership correction.

This is the exact split trigger already stated by [the documentation discipline](DOC-DISCIPLINE.md#writing-and-linking): mandatory context has become impractical to read in full. Raising either word limit would preserve the mechanism that caused the pressure.

## Selected control-plane contract

### PLAN.md is execution state only

`PLAN.md` remains the sole owner of immediate execution order, blockers, the latest applicable measured verification result, and the exact resume action. It contains exactly four level-two sections:

1. `Current checkpoint`: one bounded statement of the active horizon and its owner link;
2. `Ordered work`: a compact ordered list whose entries use stable work IDs, lifecycle state, owner links, and required implementation-map routes;
3. `Current evidence`: the latest applicable complete gate plus any narrower gate that uniquely establishes the active checkpoint, each recorded as command, status, date, and immutable commit rather than a chronological run diary or temporary receipt path;
4. `Exact resume point`: active work ID, concrete next action, required oracle, and genuine stop condition.

Work IDs use stable uppercase kebab case such as `H2-QUERY-RESPONSE`. Reordering work does not rename an item or invalidate a prose ordinal. Exactly one item is active. Completed items leave ordered work after their current contract and implementation status are owned elsewhere.

Closed milestone narratives, adopted durable decisions, general coverage policy, generic deferred lists, and repository-wide stop conditions leave `PLAN.md`. A paragraph moves only after its current consequence is verified in its existing specification, decision, policy, requirement ledger, project design, testing specification, or implementation map. Redundant history is deleted because Git already owns it; it is not copied into a new archive.

`PLAN.md` has a 2,000-word whole-file backstop and a 250-word exact-resume backstop. These are maximums, not targets. The current 6,000 and 500 limits are lowered rather than raised.

### IMPLEMENTATION-MAP.md is universal routing only

`IMPLEMENTATION-MAP.md` remains the repository-wide implementation-status entry point, but no longer contains every detailed surface. It owns only:

- one cross-product current claim and non-conformance warning;
- a routing table with stable area ID, lifecycle state, detail-map link, and source-path families that require that map;
- cross-area invariants that genuinely have no narrower owner;
- the globally nearest unsupported claim.

The routing table carries no duplicate detailed implementation prose. A state cell is a closed enum such as `active`, `implemented`, or `deferred`; the linked detail map owns what that state means. The root map has a 2,000-word backstop. Its small routing table is an explicit exception to the current blanket table ban, with a per-cell word bound so dense prose cannot hide inside it.

### Four cohesive detail maps own exact status

The current inventory moves without semantic reinterpretation into four purpose-named maps:

| Detail map | Exact ownership |
|---|---|
| `ENGINE-SEMANTICS-IMPLEMENTATION-MAP.md` | wire contracts, semantic profiles, runtime data and scopes, checked source, Semantic Process IL, Lean, TypeScript semantic core, BPMN conformance, and cross-cutting source-admission boundaries |
| `TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md` | Product 1 protocol, client, Workflow, Worker, runner, testkit, durable-hosting evidence, replay, and Workflow-chain capacity |
| `BPM-PLATFORM-IMPLEMENTATION-MAP.md` | Product 2 modules, persistence, HTTP, UI, deployment composition, browser evidence, and platform exclusions |
| `ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md` | project foundation, CIB oracle, differential pipeline, executable evidence infrastructure, and optional A12 adoption boundary |

Each detail map has the same agent-readable shape: `Current boundary`, `Implemented`, `Explicitly absent`, `Evidence owners`, and `Nearest unsupported claim`. One exact implementation fact has one detail owner. Other documents link to that owner rather than restating the fact. Each detail map has a 4,000-word backstop and retains the existing 120-word review-unit ceiling. A map that cannot fit must split by a newly identified cohesive owner, not by equal size or chronology.

The normal mandatory startup path becomes `PLAN.md`, root `IMPLEMENTATION-MAP.md`, and only the detail maps named by the active work entry. Universal startup context is therefore at most 4,000 words, and a one-area active path is at most 8,000 words. Boundary-specific proposals, specifications, research, and source are still read completely when the existing routing rules require them.

### One implementation increment updates at most two status owners

An ordinary implementation increment updates:

1. `PLAN.md` when its next action or latest applicable measured result changes;
2. each affected detail implementation map when its implemented or absent surface changes.

The root implementation map changes only when an area state, route, cross-area invariant, or globally nearest unsupported claim changes. An approved proposal changes only when its selected contract changes, not when another implementation row becomes green. Research changes only for a new external finding, changed source interpretation, or changed recommendation, not to narrate repository progress. Human-facing README files link to current status and do not restate the active work item.

This rule intentionally permits two detail maps when one increment genuinely crosses two implementation owners. It forbids updating a nominally affected document merely to repeat status.

## Startup and routing contract

The implemented change updates the session-start instruction to this order:

1. read `PLAN.md` completely;
2. read root `IMPLEMENTATION-MAP.md` completely;
3. read every detail map linked by the active work entry;
4. inspect Git state and run the doctor as today;
5. read the boundary-specific owners routed by the existing change table;
6. run the applicable gate and take the active work item.

The active work entry must link every required detail map. A guard fails for an unknown map, duplicate work ID, zero or multiple active items, a missing resume ID, a resume ID that differs from the active item, or a source route that names no registered map.

The root routing table and plan links are navigation contracts rather than a second claim inventory. The documentation registry remains the human-facing registry of all maintained documents.

## Migration and claim preservation

Implementation proceeds as one documentation-governance increment with an immutable baseline and a separately reviewed closure target:

1. record the baseline section and word inventory for both current living documents;
2. create the four detail maps and move each existing implementation or absence fact to exactly one destination before deleting it from the root map;
3. verify every removed plan paragraph either has a current owner link or is redundant history recoverable from Git;
4. shrink the two roots, update the session-start routing, documentation discipline, registry, and executable guards atomically;
5. compare the baseline and target inventories during closure review, treating an unowned lost claim or exclusion as a required defect;
6. run the complete documentation and repository gates before closure.

The migration may improve headings and remove exact duplicates, but it must not broaden or narrow a product, semantic, proof, evidence, or absence claim. Any such change is split into its own governed work.

## Executable guard contract

The existing plan and document-reviewability guards are changed at the root mechanism rather than given exceptions:

- require the four `PLAN.md` sections, stable unique work IDs, exactly one active item, matching resume ID, valid owner and map links, no completed ordered entries, and the 2,000/250-word backstops;
- require the root implementation-map sections, exact registered detail-map set, unique area IDs, closed area states, bounded routing cells, valid paths, and the 2,000-word backstop;
- require every detail map to contain its five owner sections, remain at or below 4,000 words, retain the 120-word review-unit bound, and be registered exactly once by the root map and documentation registry;
- reject active-work status restatements in the repository root README and reject implementation-progress narration in proposal Status sections beyond lifecycle and review state;
- keep all current Markdown link, role, receipt, registry, and source-hygiene guards;
- add a focused fixture proving that a compact plan and routed map pass without closed history, and adversarial fixtures for a dangling work ID, missing detail route, duplicate detail registration, and oversized dense table cell.

No guard measures prose quality, rewards additional documents, or requires every implementation change to touch documentation. The same-change trigger remains conditional on an actual status change.

## Required, optional, and excluded scope

### Required if approved

- Implement the selected root and four-map ownership split without losing or changing a current claim.
- Lower the root word backstops and add the routing and stable-ID guards.
- Update `CLAUDE.md`, [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), [docs/README.md](README.md), and affected guard documentation in the same change.
- Remove closed or duplicated plan prose only after its current owner is verified.
- Perform a context-cold, read-only closure review of the migration because its principal risk is silent claim loss even though it changes no semantic contract.

### Optional

- Generate a diagnostic word and route report from the existing guards when it reuses their authoritative parser and creates no new status source.
- Split a detail map further when a measured cohesive owner cannot remain within 4,000 words.

### Excluded

- Raising the current plan, resume, implementation-map, or 600-nonblank-source limits.
- Changing Horizon 2 ordering, capacity policy, BPMN meaning, semantic profiles, CIB relationships, public contracts, proof boundaries, runtime behavior, or product scope.
- Creating a feature-history board, chronological gate diary, second backlog, generic index, or archive of text already retained by Git.
- Generating authoritative status from prose or requiring an external service, database, or model to resume work.
- Making the human-facing root README carry volatile implementation status.
- Rewriting capsule specifications, decisions, research, or requirement ledgers merely for stylistic uniformity.

## Acceptance criteria

The proposal implementation is complete only when:

- universal startup documents total at most 4,000 words and one active detail route totals at most 8,000 words;
- the plan identifies one active stable ID, one next action, its oracle, and its stop condition without a closed milestone narrative;
- every baseline implementation and absence fact has one verified root or detail-map destination, or an explicit deletion finding proves it was duplicate history;
- an ordinary single-area status change needs no proposal or research edit and changes no root-map prose;
- all routing, word-bound, review-unit, registry, link, receipt, and status-consistency adversarial fixtures pass;
- `node --test scripts/plan-status-consistency.test.ts scripts/document-reviewability.test.ts scripts/markdown-links.test.ts scripts/independent-review-policy.test.ts`, `./scripts/verify.sh`, and `git diff --check` pass within their existing command bounds;
- the closure reviewer confirms no semantic, product, proof, evidence, or absence claim changed and no required startup route became implicit;
- the implemented discipline is measured after one subsequent ordinary increment; if that increment still requires three or more status-document edits without crossing three genuine owners, the design reopens.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A split hides a relevant claim from the active agent. | The plan names required detail maps, the root map owns source-path routing, and dangling or absent routes fail executable guards. |
| Moving text silently loses an exclusion. | Migration compares the immutable baseline inventory with the closure target, and unowned loss blocks the cold closure review. |
| Four maps become four overlapping truth sources. | Each map has disjoint named ownership, one fact has one owner, and root/detail duplicate status prose is prohibited. |
| Stable IDs become another bureaucracy. | IDs exist only for active ordered work and implementation areas; completed work leaves the plan and no permanent per-task ledger is created. |
| Lower word bounds cause dense unreadable tables. | Routing tables have bounded cells, detail claims remain prose bullets, and the existing 120-word review-unit limit remains. |
| The proposal/status boundary stays ambiguous. | Proposals own selected future contracts, detail maps own current implementation, and the guard restricts proposal Status to lifecycle and review state. |
| The migration spends more than it saves. | Acceptance requires at least a 50 percent reduction in universal startup context and reopens after the first ordinary increment if edit churn remains. |

## Cold-review contract

The requested reviewer works read-only against the immutable proposal commit with no forked conversation. It reads this proposal completely, [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), the current [PLAN.md](PLAN.md), the current [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), the session-start instructions in [`CLAUDE.md`](../CLAUDE.md#start-every-session), and the current plan/map guards.

The review should answer:

1. Does the selected split preserve one authoritative owner for every current implementation, absence, execution-order, and measured-result fact?
2. Can an agent deterministically discover every required detail map from the active plan entry and root routes without already knowing the repository?
3. Are the four map boundaries cohesive, or does any fact require routine duplication or ambiguous ownership?
4. Are the 2,000/250/4,000-word bounds achievable without dense prose or loss of exact claims?
5. Do the migration and guard contracts make silent claim loss, dangling routes, duplicate status, and stale resume state observable?
6. Does any requirement create a new history board, status manifest, or bespoke source of truth that merely relocates the current problem?
7. Is the expected reduction in startup context and ordinary edit churn large enough to justify the migration cost?

Use the issue-first verdict format in [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate). Classify any route that can silently omit required context, any ambiguous owner, or any unguarded claim-loss path as required rather than advisory.
