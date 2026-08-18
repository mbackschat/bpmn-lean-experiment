# Agent documentation control-plane proposal

## Status

Lifecycle: implemented-awaiting-closure
Review: approved-with-required-edits

## Current boundary

The root/detail split, shared live Markdown lexer, closed structural route grammar, four exact special-context parsers, root-table-derived targets, tracked-path routing, reciprocal capsule delegation, and live-reference migration are implemented. The focused control-plane, route, lexer, link, delegation, plan, reviewability, and binding guards are green, and a byte-level audit proves that every migrated document outside the explicit control-plane owners differs only in implementation-map link labels. Closure still requires an immutable target, the baseline-to-target claim matrix, the complete repository gate, and independent claim-preservation and route-guard reviews. The prior closure target `8c73c00` remains unapproved and Horizon 2 remains paused. This proposal changes no product contract, semantic meaning, proof boundary, runtime behavior, evidence claim, or Horizon 2 order.

## Decision

Replace the two monolithic agent-facing living documents with a compact execution control file, a compact implementation-routing map, and five cohesive detail maps. Preserve exact current claims and executable drift protection while reducing mandatory universal startup reading from 15,983 words to at most 4,000 words and ordinary active-area reading to at most 8,000 words. Represent implementation-status routing as closed machine-readable Markdown atoms rather than deriving ownership from natural-language prose.

The recommended decision is approval. The current ownership model protects truth effectively, but its physical layout now makes every agent session load unrelated closed work and makes each small implementation increment restate one status across several documents.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `59e0a2a` | `fork-turns-none` | `approve-with-required-edits` | `5ab6f1f` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The earlier proposal version used two correction rounds. The context-cold review found five required edits, which correction `871d500` closed; its audit exposed one packet-evidence integration defect introduced by that correction. Correction `3b58c68` made the migration matrix reviewer-visible and digest-bound in the closure packet contract, and the same reviewer approved that design.

The structural routing redesign used a new context-cold reviewer and three owner-authorized correction rounds. Proposal correction `e56d552` closed the three original findings; its audit found stale PLAN execution authority, correction `e55aa06` narrowed the resume action but retained one already-completed commit instruction, and correction `5ab6f1f` removed it. The same reviewer approved the final target with the proposal bytes unchanged.

The earlier closure stage used two ordinary correction rounds at `b67d048` and `ccf1a78`. The owner authorized correction `b98c3f8` for four residual stale consumers and their line-wide guard escape, then authorized final correction `8c73c00` when the same reviewer proved that the sentence-level replacement retained the same association defect between clauses. The final reviewers still found mechanism-level false negatives and false positives. The structural redesign is a new proposal boundary, not a fifth patch or audit round against that failed mechanism.

This proposal is documentation governance rather than a material semantic proposal under [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate). It selects no BPMN meaning, semantic profile, CIB relationship, checked-source or Semantic Process representation, runtime or public observation, admission capability, transition family, proof boundary, or Temporal refinement claim. The owner nevertheless requested a context-cold proposal review because an inefficient control plane can repeatedly misroute implementation work.

## Problem and measured baseline

[PLAN.md](PLAN.md) correctly owns immediate work order and exact resume state, while [`implementation-status-router`](IMPLEMENTATION-MAP.md) correctly owns exact live implementation, proof, evidence, and absence status. Their content ownership is sound. Their mandatory-read shape is not.

At proposal baseline `b5a2f1a`, `PLAN.md` contains 5,988 words against its 6,000-word backstop and `IMPLEMENTATION-MAP.md` contains 9,995 words against its 10,000-word backstop. Every session must therefore read 15,983 words before routing to the active proposal, specification, source, and tests.

The plan devotes 2,011 words to the closed M0 through M6 ladder, 851 to durable approved decisions, 818 to the general coverage program, and 518 to generic deferrals and stop conditions. Its operationally valuable checkpoint, ordered work, and resume sections contain about 1,400 words. The ladder remains a binding product decision and must move intact to a decision owner; the other durable policy and closed narration need not stay in the execution control file.

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

Closed milestone narratives, adopted durable decisions, general coverage policy, generic deferred lists, and repository-wide stop conditions leave `PLAN.md`. The binding M0 through M6 ladder moves intact to a new `SHOWCASE-MILESTONE-LADDER-DECISION.md`, and every inbound ladder link moves with it. A paragraph moves only after its current consequence is verified in its destination below. Redundant history is deleted because Git already owns it; it is not copied into a new archive.

| Current PLAN section | Required destination |
|---|---|
| `Current checkpoint` | retained and compressed in `Current checkpoint` |
| `Ordered work` | retained with stable IDs in `Ordered work` |
| `Showcase milestone ladder` | moved intact to `SHOWCASE-MILESTONE-LADDER-DECISION.md`, including the per-milestone Lean questions |
| `Approved decisions` | each unit moves to its linked decision, proposal, specification, project-design, architecture, testing, or experiment owner; a unit with no such owner receives a purpose-named decision before deletion |
| `Last verified baseline` | latest complete result and still-comparable performance baselines remain compactly in `Current evidence`; superseded run narration is deleted |
| `BPMN coverage program` | durable ordering rules move to `PROJECT-DESIGN.md`; requirement dispositions stay in `BPMN-REQUIREMENT-LEDGER.md`; corpus acceptance stays in the model-corpus owner; gate method stays in `TESTING-SPEC.md` |
| `Explicitly deferred` | each exclusion moves to its owning detail map or existing specification; a cross-area exclusion stays in root `IMPLEMENTATION-MAP.md` |
| `Stop conditions` | contributor-wide stops move to `CLAUDE.md`; assurance and gate stops move to `TESTING-SPEC.md`; boundary-specific stops move to their existing owner |
| `Exact resume point` | retained and compressed in `Exact resume point` |

`PLAN.md` has a 2,000-word whole-file backstop and a 250-word exact-resume backstop. These are maximums, not targets. The current 6,000 and 500 limits are lowered rather than raised.

### The root implementation map is universal routing only

`IMPLEMENTATION-MAP.md` remains the repository-wide implementation-status entry point, but no longer contains every detailed surface. It owns only:

- one cross-product current claim and non-conformance warning;
- a routing table with stable area ID, lifecycle state, detail-map link, and source-path families that require that map;
- cross-area invariants that genuinely have no narrower owner.

The routing table carries no duplicate detailed implementation prose. A state cell is a closed enum such as `active`, `implemented`, or `deferred`; the linked detail map owns what that state means. The root map has a 2,000-word backstop. Its small routing table is an explicit exception to the current blanket table ban, with a per-cell word bound so dense prose cannot hide inside it.

### Five cohesive detail maps own exact status

The current inventory moves without semantic reinterpretation into five purpose-named maps:

| Detail map | Exact ownership |
|---|---|
| `ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md` | wire contracts, semantic profiles, checked source, Semantic Process IL, and cross-cutting source-admission boundaries |
| `ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md` | runtime data and scopes, Lean, TypeScript semantic core, BPMN conformance, and capsule-delegated semantic-family status |
| `TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md` | Product 1 protocol, client, Workflow, Worker, runner, testkit, durable-hosting evidence, replay, and Workflow-chain capacity |
| `BPM-PLATFORM-IMPLEMENTATION-MAP.md` | Product 2 modules, persistence, HTTP, UI, deployment composition, browser evidence, and platform exclusions |
| `ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md` | project foundation, CIB oracle, differential pipeline, executable evidence infrastructure, and optional A12 adoption boundary |

Each detail map has the same agent-readable base shape: `Current boundary`, `Implemented`, `Explicitly absent`, `Evidence owners`, and `Nearest unsupported claims`. One exact implementation fact has one detail owner. Other documents link to that owner rather than restating the fact. Each detail map has a 4,000-word backstop and retains the existing 120-word review-unit ceiling. A map that cannot fit must split by a newly identified cohesive owner, not by equal size or chronology.

A capsule that delegates implemented and absent scope to a map retains a substantive capsule-specific level-two section in the applicable detail map. The section links back to the capsule, contains explicit `**Implemented.**` and `**Absent.**` halves, and retains the current 100-word minimum. The three boundary-Timer capsule links move from root `IMPLEMENTATION-MAP.md` to their exact sections in `ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md`. `map-scope-delegation.test.ts` searches the registered detail-map set, rejects root-only proxy sections, and retains its absent, empty, missing-half, and unclassified-delegation failures.

The baseline allocation demonstrates headroom before deduplication or framing:

| Detail map | Baseline assigned words |
|---|---:|
| Engine contracts and source | 2,174 |
| Engine runtime and proof, including all three delegated Timer sections | 2,172 |
| Temporal hosting | 1,164 |
| BPM platform | 977 |
| Assurance and adoption | 1,698 |

These figures allocate current level-two and level-three owners at baseline `b5a2f1a`; the claim-granular migration matrix remains the authority for every individual destination.

The normal mandatory startup path becomes `PLAN.md`, root `IMPLEMENTATION-MAP.md`, and only the detail maps named by the active work entry. Universal startup context is therefore at most 4,000 words, and a one-area active path is at most 8,000 words. Boundary-specific proposals, specifications, research, and source are still read completely when the existing routing rules require them.

### One implementation increment updates only genuine status owners

An ordinary implementation increment updates:

1. `PLAN.md` when its next action or latest applicable measured result changes;
2. each affected detail implementation map when its implemented or absent surface changes.

The root implementation map changes only when an area state, route, or cross-area invariant changes. Family-specific unsupported boundaries stay in their detail owners and do not create a second global work selector. An approved proposal changes only when its selected contract changes, not when another implementation row becomes green. Research changes only for a new external finding, changed source interpretation, or changed recommendation, not to narrate repository progress. Human-facing README files link to current status and do not restate volatile implementation state.

This rule intentionally permits two detail maps when one increment genuinely crosses two implementation owners. It forbids updating a nominally affected document merely to repeat status.

### Structural implementation-status routes

Implementation-status navigation is declared through one inline route atom with a closed source grammar. An atom is a regular inline Markdown link whose entire label is one exact inline-code role token, so it remains attached to the paragraph, list item, blockquote, or table cell whose local consequence needs the route.

```md
[`implementation-status-router`](IMPLEMENTATION-MAP.md)
[`implementation-status-root-owner`](IMPLEMENTATION-MAP.md#cross-area-invariants)
[`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md#current-boundary)
[`implementation-status-delegation:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#interrupting-sub-process-boundary-timer)
```

The closed roles are:

- `implementation-status-router`, which resolves only to root `IMPLEMENTATION-MAP.md` without a fragment;
- `implementation-status-root-owner`, which resolves only to root `IMPLEMENTATION-MAP.md` with a mandatory existing level-two fragment other than `Routing`;
- `implementation-status-owner:<AREA-ID>`, which resolves only to the detail map registered for that area and may carry an existing fragment;
- `implementation-status-delegation:<AREA-ID>`, which resolves only to the detail map registered for that area and requires an existing level-two fragment.

The atom permits no title, angle-bracket destination, query, escaped role or destination character, or percent-encoded path separator. Its relative path is normalized against the containing document before exact target comparison. A fragment is decoded once and validated through the shared Markdown anchor resolver. Router and owner atoms may repeat where separate inline containers need local navigation; the same normalized atom may appear only once within one paragraph, list item, blockquote paragraph, or table cell. A delegation atom is unique per source document, area ID, and fragment.

A delegation atom replaces the prose word `restated` as the complete declaration that the named detail-map section solely carries that capsule's implemented and absent scope. It is valid only from a maintained capsule specification. The target must be a substantive level-two section that links back to the capsule and contains the guarded `**Implemented.**` and `**Absent.**` halves. The guard validates this reciprocal pair and rejects delegation downgraded to an owner atom, a missing or non-level-two fragment, a wrong area or map, a missing capsule backlink, a silent section, or duplicate delegation. A capsule map reference that does not delegate uses an owner atom and creates no reciprocal scope obligation; no prose classifier or maintained non-delegating filename list remains.

One shared dependency-free Markdown link lexer becomes the sole producer of live local-link spans for both the route guard and the existing link-resolution guard. It distinguishes fenced and indented code blocks, inline code spans by matching backtick-run length, HTML comments, escaped delimiters, images, inline links, and surrounding container boundaries. Atoms inside fenced or indented code, inline code, or HTML comments are examples rather than declarations. The live universe is every tracked or non-ignored pending project-authored Markdown file returned by `git ls-files --cached --others --exclude-standard`, excluding `docs/archived/`, `docs/reference/`, and registered external checkouts. This includes the active proposal until it is archived.

Every live link or bare path literal naming root or detail implementation maps must be either one route atom or part of one of four exact structural controls:

1. root `IMPLEMENTATION-MAP.md`'s `Routing` table parser requires the exact header, one row per area ID, one ordinary relative Markdown link in the detail-map cell, no fragment, and no map target in another cell;
2. `PLAN.md`'s ordered-work parser requires the complete field order `ID · state · Owner · Maps · Action`, isolates the `Maps` field before parsing its comma-separated ordinary detail-map links, and rejects a map target in another field or extra text after a map link;
3. `docs/README.md`'s `Registry` parser requires each root/detail map exactly once in the first cell of its own row and rejects a duplicate, a map target outside that cell, or a registry row outside the exact section;
4. `CLAUDE.md`'s `Start every session` parser requires the exact numbered step that links root `IMPLEMENTATION-MAP.md`, verifies its target, and rejects any additional map target in that step; every other map reference in `CLAUDE.md` uses a route atom.

The special contexts are syntax owners only, not semantic exemptions. Their parsers consume only their named field, cell, row, or numbered step, so a valid link elsewhere on the same line cannot satisfy them. The root routing table remains the only area-ID-to-detail-map registration. The executable source-path inventory maps paths to area IDs only; it does not copy map filenames, labels, or states. All owner and delegation targets are derived from the parsed root table, replacing the current hard-coded `detailMapContracts` file mapping.

A route atom owns navigation only. It does not copy an implementation, absence, evidence, or lifecycle fact from the destination. The implementation removes `isUnroutedRootImplementationMapStatusLine`, the prose-based delegation classifier, the non-delegating capsule list, and every natural-language status-word, ownership-verb, clause-boundary, and routing-phrase expression. No compatibility fallback interprets legacy prose, and the guard does not claim to detect semantically stale prose that contains no live map route.

## Startup and routing contract

The implemented change updates the session-start instruction to this order:

1. read `PLAN.md` completely;
2. read root `IMPLEMENTATION-MAP.md` completely;
3. determine whether the user request retains or overrides the active work item;
4. for retained work, read every detail map linked by the active entry; for overridden work, resolve every named path through the executable route inventory and every named area through the root routing table, reading every candidate map when the scope is ambiguous;
5. inspect Git state and run the doctor as today;
6. after discovering concrete target paths, resolve them through the route inventory and read any newly required detail map before editing;
7. read the boundary-specific owners routed by the existing change table;
8. run the applicable gate and take the selected work.

The active work entry must link every required detail map. An executable route inventory, stored in the guard rather than copied from the Markdown routing table, maps every tracked or non-ignored pending implementation-bearing path family to one or an explicit set of registered area IDs. It verifies workspace package roots derived from tracked manifests against explicit closed package routes, enumerates top-level engine, platform, assurance, adoption, showcase, and documentation roots, and requires explicit multi-area and excluded-path cases. The root routing table must match that independent inventory. A guard fails for an uncovered current path family, unknown map, unintended ambiguous route, duplicate work ID, zero or multiple active items, a missing resume ID, or a resume ID that differs from the active item.

The root routing table and plan links are navigation contracts rather than a second claim inventory. The documentation registry remains the human-facing registry of all maintained documents.

## Migration and claim preservation

Implementation proceeds as one documentation-governance increment with an immutable baseline and a separately reviewed closure target:

1. generate every baseline paragraph, list item, and table row from both current living documents as an immutable unit identified by source path, owning heading, ordinal, and SHA-256;
2. create the five detail maps and move each existing implementation or absence fact to exactly one destination before deleting it from the root map;
3. complete a baseline-to-target matrix in which every generated unit has exactly one destination or a justified `duplicate` or `history` deletion, with every non-byte-identical move separately visible;
4. shrink the two roots, update the session-start routing, documentation discipline, registry, and executable guards atomically;
5. run a dependency-free migration checker that derives the baseline side independently from Git, rejects a missing or duplicate unit, verifies unchanged destinations mechanically, and emits the changed/deleted rows for closure review;
6. run the complete documentation and repository gates before closure.

The matrix is review-only evidence, stored in temporary review input rather than retained as another status source. `semantic-review-packet.ts` gains an optional singleton `--migration-matrix <path>` input. For this closure it requires the matrix baseline and target to equal the packet commits, validates the complete structured rows, embeds their normalized reviewer-visible content plus exact-byte SHA-256 in the packet JSON, and includes both in `packetSha256`. The neutral reviewer prompt pastes that packet verbatim, so no unavailable temporary path or digest-only assertion substitutes for the matrix. The migration checker and its adversarial self-tests remain reusable. The migration may improve headings and remove exact duplicates, but it must not broaden or narrow a product, semantic, proof, evidence, or absence claim. Any such change is split into its own governed work.

## Executable guard contract

The existing plan and document-reviewability guards are changed at the root mechanism rather than given exceptions:

- require the four `PLAN.md` sections, stable unique work IDs, exactly one active item, matching resume ID, valid owner and map links, no completed ordered entries, and the 2,000/250-word backstops;
- require the root implementation-map sections, exact registered detail-map set, unique area IDs, closed area states, bounded routing cells, agreement with the independent executable route inventory, and the 2,000-word backstop;
- require every detail map to contain its five base owner sections, remain at or below 4,000 words, retain the 120-word review-unit bound, and be registered exactly once by the root map and documentation registry;
- migrate `map-scope-delegation.test.ts` to the registered detail maps and add valid detail-map delegation plus missing, empty, missing-half, root-proxy, and unclassified fixtures;
- remove the complete root README `Current state` table and its capability paragraph, replacing them with links to `PLAN.md`, root `IMPLEMENTATION-MAP.md`, the platform map, and the executable-corpus owner; replace the milestone and README status comparisons in `plan-status-consistency.test.ts` with link-only and no-volatile-status checks;
- require every active proposal Status section to contain exactly `Lifecycle: <closed-value>` and `Review: <closed-value>` lines, migrate every active proposal, and make `isOwnerApproved` recognize only the approved lifecycle values;
- extend `semantic-review-packet.ts` with the optional validated `--migration-matrix` input and add adversarial tests for an unknown flag, missing or malformed matrix, baseline or target substitution, duplicate or missing unit, byte mutation, normalized-content visibility, and packet-digest sensitivity;
- replace natural-language root-map ownership and capsule-delegation detection with the shared structural route-atom lexer, migrate every live implementation-map reference, derive owner targets from the parsed root table, and reject every map link or path literal outside a valid atom or exact structural control;
- keep all current Markdown link, role, receipt, registry, and source-hygiene guards;
- add a focused fixture proving that a compact plan and routed map pass without closed history, and adversarial fixtures for a dangling work ID, omitted current path family, user override to a different area, missing detail route, duplicate detail registration, oversized dense table cell, ordinary root/detail links, bare path literals, wrong role targets, unknown owner IDs, malformed or duplicate atoms, titles, escaping, encoded separators, wrong and missing fragments, fenced/indented/inline-code and HTML-comment non-declarations, delegation downgraded to ownership, missing reciprocity, a map link outside PLAN's `Maps` field, a wrong startup target with preserved prose, a registry link outside its row or duplicated, and an extra map reference inside every otherwise valid special-context line.

The proposal lifecycle values are `draft`, `owner-approved`, `implementation-in-progress`, `implemented-awaiting-closure`, `superseded`, and `archived`. The review values are `pending`, `approved`, `approved-with-required-edits`, `rejected`, and `not-required`. Dates, commits, findings, and implementation-row narration remain in the receipt, plan, or detail map rather than Status. `owner-approved`, `implementation-in-progress`, and `implemented-awaiting-closure` are the exact values that satisfy owner-approval detection.

No guard measures prose quality, parses English ownership, rewards additional documents, or requires every implementation change to touch documentation. The same-change trigger remains conditional on an actual status change.

## Required, optional, and excluded scope

### Required if approved

- Implement the selected root and five-map ownership split without losing or changing a current claim.
- Lower the root word backstops and add the routing and stable-ID guards.
- Update `CLAUDE.md`, [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), [docs/README.md](README.md), and affected guard documentation in the same change.
- Remove closed or duplicated plan prose only after its current owner is verified.
- Replace every live implementation-map reference with a valid structural route atom or one of the four exact structural controls, replace prose-based capsule delegation with the reciprocal delegation atom, and delete both natural-language classifiers without retaining a compatibility path.
- Perform a context-cold, read-only closure review of the migration because its principal risk is silent claim loss even though it changes no semantic contract.

### Optional

- Generate a diagnostic word and route report from the existing guards when it reuses their authoritative parser and creates no new status source.

### Excluded

- Raising the current plan, resume, implementation-map, or 600-nonblank-source limits.
- Changing Horizon 2 ordering, capacity policy, BPMN meaning, semantic profiles, CIB relationships, public contracts, proof boundaries, runtime behavior, or product scope.
- Creating a feature-history board, chronological gate diary, second backlog, generic index, or archive of text already retained by Git.
- Generating authoritative status from prose or requiring an external service, database, or model to resume work.
- Inferring status ownership from English words, clause boundaries, punctuation, link labels, or regular-expression exemptions for approved phrases.
- Adding a second area-to-map manifest, per-document copies of implementation facts, or a second Markdown link scanner alongside the shared lexer.
- Making the human-facing root README carry volatile implementation status.
- Rewriting capsule specifications, decisions, research, or requirement ledgers merely for stylistic uniformity.

## Acceptance criteria

The proposal implementation is complete only when:

- universal startup documents total at most 4,000 words and one active detail route totals at most 8,000 words;
- the plan identifies one active stable ID, one next action, its oracle, and its stop condition without a closed milestone narrative;
- every generated baseline paragraph, list item, and table row has one verified destination or an explicit reviewed duplicate/history deletion;
- an ordinary single-area status change needs no proposal or research edit and changes no root-map prose;
- all routing, delegated-scope, migration, word-bound, review-unit, registry, link, receipt, and status-consistency adversarial fixtures pass;
- every live implementation-map reference is either one valid route atom or a member of one exact structural control, every delegation is structurally reciprocal, all owner targets derive from the root table, and no natural-language ownership or delegation classifier remains in production code;
- the closure packet embeds the complete validated migration matrix, binds its exact bytes and normalized content to `packetSha256`, and its focused packet tests pass;
- `node --test scripts/plan-status-consistency.test.ts scripts/document-reviewability.test.ts scripts/markdown-links.test.ts scripts/independent-review-policy.test.ts`, `./scripts/verify.sh`, and `git diff --check` pass within their existing command bounds;
- the closure reviewer confirms no semantic, product, proof, evidence, or absence claim changed and no required startup route became implicit;
- the implemented discipline is measured after one subsequent ordinary single-area increment; if it needs more than `PLAN.md` plus its one affected detail map without another genuine owner change, the design reopens.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A split hides a relevant claim from the active agent. | The plan names active maps, user overrides resolve through an independent exhaustive route inventory, and uncovered or ambiguous paths fail executable guards. |
| Moving text silently loses an exclusion. | Git derives every baseline unit independently, the migration matrix accounts for each once, and unowned loss blocks the cold closure review. |
| Five maps become overlapping truth sources. | Each map has disjoint named ownership, one fact has one owner, and root/detail duplicate status prose is prohibited. |
| Structural route atoms become another status source. | Atoms contain only a role, registered area ID, and link; they carry no implementation fact, and owner targets are derived from the root routing table. |
| Fixed route syntax damages local evidence association. | The atom is an inline Markdown link and therefore remains inside its original paragraph, list item, blockquote, or table cell, including an exact anchor when that local claim needs one. |
| The shared lexer becomes a partial Markdown parser. | Its accepted and ignored forms are closed above, the existing link guard consumes the same tokens, and adversarial fixtures cover every block, inline-code, escape, destination, and container boundary the route contract distinguishes. |
| Stable IDs become another bureaucracy. | IDs exist only for active ordered work and implementation areas; completed work leaves the plan and no permanent per-task ledger is created. |
| Lower word bounds cause dense unreadable tables. | Routing tables have bounded cells, detail claims remain prose bullets, and the existing 120-word review-unit limit remains. |
| The proposal/status boundary stays ambiguous. | Proposals own selected future contracts, detail maps own current implementation, and the guard restricts proposal Status to lifecycle and review state. |
| The migration spends more than it saves. | Acceptance requires at least a 50 percent reduction in universal startup context and reopens after the first ordinary increment if edit churn remains. |

## Cold-review contract

The requested reviewer works read-only against the immutable proposal commit with no forked conversation. It reads this proposal completely, [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), the current [PLAN.md](PLAN.md), the current [`implementation-status-router`](IMPLEMENTATION-MAP.md), the session-start instructions in [`CLAUDE.md`](../CLAUDE.md#start-every-session), and the current plan/map guards.

The review should answer:

1. Does the selected split preserve one authoritative owner for every current implementation, absence, execution-order, and measured-result fact?
2. Can an agent deterministically discover every required detail map for both planned and user-overridden work without already knowing the repository?
3. Are the five map boundaries and delegated capsule sections cohesive, or does any fact require routine duplication or ambiguous ownership?
4. Are the 2,000/250/4,000-word bounds achievable without dense prose or loss of exact claims?
5. Do the migration and guard contracts make silent claim loss, dangling routes, duplicate status, and stale resume state observable?
6. Does the structural route-atom grammar eliminate all natural-language ownership and delegation inference while preserving anchored and table-local evidence, planned work, user overrides, registry navigation, and contributor startup?
7. Does any requirement create a new history board, status manifest, or bespoke source of truth that merely relocates the current problem?
8. Is the expected reduction in startup context and ordinary edit churn large enough to justify the migration cost?

Use the issue-first verdict format in [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate). Classify any route that can silently omit required context, any ambiguous owner, or any unguarded claim-loss path as required rather than advisory.
