# Rewrite-2 proposal

## Status

Checkpoint 1 of the rewrite-2 preparation ([owner intents](OWNER-INTENTS-REGISTER.md), 2026-11-17): the full disclosure of every costly topic between the current state (`main` `87d27def2`) and the goal, Product 2 used by a third party on their own models. This proposal does not yet select a design, a calibration or a plan. Those follow in checkpoints 2 to 5 ([PLAN](PLAN.md#exact-resume-point)): design, measured calibration, cold review, and a plan the owner approves.

Every cost below is an estimate, in agent-days of 8 agent-hours, and is unmeasured until a calibration spike measures it. The anchor is the first rewrite, about 7 agent-days. The proof wave that followed it took about 6 to 16 agent-days, and P6's budget ran 6 to 11 times over.

## Method and verification

Three read-only domain audits found the topics: kernel core (K), engine boundary, hosting and evidence (E), and Product 2 (P). None of them spawned agents of its own.

Every decision this proposal raises, and every owner mark, was also checked against the settled scope documents, which are listed in the [owner intents](OWNER-INTENTS-REGISTER.md). A question those documents already answer is not raised. Labels from the audits are never carried over unchecked.

The root then checked every topic's premise against the code at `87d27def2`. It re-ran the measurements on a fresh build and recorded corrections; it did not take the audits' word for any finding. The reproduced measurements:

- **CIB Seven's 55 non-test models through the public `compileBpmnDefinition`.**
  - **As shipped:** 2 are admitted under both profiles, and both are dummies. 35 stop first at `reader.factNotCarried`, and 50 of the 55 carry `camunda:historyTimeToLive`.
  - **With that one attribute stripped:** 9 are admitted under `bpmn-2.0.2` and 12 under `cibseven-2.2.0`.
- **The model corpus** admits none of its 7 exact external candidates ([corpus map](../model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md)).
- **Population ingress capacity.**
  - One chain registration with one Message wait takes 489 canonical bytes.
  - The population ingress's admission room is 262,121 bytes, so one population holds about 536 waiting instances.
  - The audit's figure of 550 to 650 is corrected here.

## Headline findings

1. **P6 is on the goal's path and is the costliest topic (T4).**
   - Both profiles are in the settled scope. Product 2 compiles "against a selected profile" ([platform proposal](BPM-PLATFORM-PROPOSAL.md)), and the profiles are a standards profile and cumulative CIB Seven profiles ([PROJECT-DESIGN](PROJECT-DESIGN.md)).
   - `SchedulesAgree` is the concurrency lane of the standards profile, `branchSchedule = orderInvariant` (`Kernel/Proofs/Concurrency.lean:146-147`). It is an architecture promise.
   - `cibseven-2.2.0` selects the deterministic `declarationDepthFirst`, so P6 has nothing to prove there.
   - The standards profile's Simple Boolean evaluator is settled ([conformance target](BPMN-CONFORMANCE-TARGET.md)). Its refusals of `${…}`, Scripts and output mappings are therefore correct, not a gap.
   - **Defect:** Product 2's structured forms are bound to the `bpmn-2.0.2` identifier (`human-task-catalog-projection.ts:23`), so they are unavailable under the CIB profile (T14).
2. **A third party's own models do not get past deployment today.** See the reproduced numbers above. The barriers are classification work inside the CIB7 ceiling: vendor metadata, expression-valued task fields, numeric types, structured parameters and similar.
3. **A kernel rewrite reopens the closed proof lanes.** About 27,000 of the 37,481 proof lines are lemmas about the bodies of `State`, `Step` and `Hooks`.
4. **The proofs are not yet connected to admitted models.** That admission establishes the lane premises is unproved, and [PLAN](PLAN.md) left it out of the proof wave.
5. **Several architecture promises are unkept and unguarded.**
   - Per-feature footprints (`kernel/ARCHITECTURE-SPEC.md` "Commutation is proved once over the footprints each feature declares").
   - "No IL or state type is a nested inductive", broken by `State/Slots.lean:71`.
   - No-op hook defaults; the defaults refuse instead.
   - The JUEL levels Task fields (M3) and Events (M6), never delivered although `EXPRESSION-SEMANTICS-SPEC` line 204 claims them.
   - Product 2's cross-product agreement test (`PROJECT-DESIGN.md:92`), which no test implements.

## Costly topics

The table consolidates the audits' 40 topics; the source IDs are in brackets. "Current" is the cost on the current code, and "Rewrite" the cost designed into a rewrite. "Blocks" says whether the topic blocks the goal.

The "Owner" column marks only the items on the owner's ask list: dependencies, licensing, SDK work, workarounds, scope changes and removing an architecture promise. The root decides every other design choice and records it in the design.

| # | Topic | Blocks | Current | Rewrite | Owner |
|---|---|---|---|---|---|
| T1 | Third-party model admission: about 30 classification and breadth items inside the CIB7 ceiling, an inert-metadata tier, and admission that reports every refusal with its element [P1, E1, E12, K4] | yes | 25–45 | 20–38 | — |
| T2 | Value domain: Double, Date, negative integers, and bounds such as 32 members and 1 KiB strings [K5, E3] | yes | 4–15 | 2–6 | — |
| T3 | Withdrawn: the profile is selected per deployment by the settled scope, so there is nothing to decide. Its remaining defect, forms bound to one profile identifier, moved to T14 | — | — | — | — |
| T4 | P6 together with admission ⇒ premises, the narrow statement and footprints [K1, K2, K9, K11] | yes (standards-profile assurance) | 40–74 | 20–40 | — |
| T5 | Rewrite reopens the closed lanes [K3] | no | 0 | 5–12 | — |
| T6 | Identity scheme: internal, public, called and cascade identities (#126) [K7, E9] | partly | 4–15 | 0 if the public identity is kept, 5–8 if it changes | — |
| T7 | Closure order: #120, #75, rollback points [K8] | no | 5–10 | 3–6 | — |
| T8 | Eight law families proved only on witness states [K10] | no (assurance) | 8–24 | 8–24 | — |
| T9 | Admitted models can stop mid-run with one of 66 `unsupported` codes [K12] | partly | 1–2, plus 0.5–3 per code | same | — |
| T10 | Module-shape pressure and dual transcription [K13, K14] | no | 1–3 per growth episode | 0.5–1 | — |
| T11 | Effect contract an adopter can implement: a public handler package, a separate effect queue, idempotency, and mapping retries to incidents. Script isolation is excluded, because the [compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) defers untrusted scripts; authorized deploy (T12) is what keeps Scripts trusted model content [P2, E7] | yes | 2–6 | 1.5–4 | — |
| T12 | Per-request identity, authorization of deploy, start and search, and a security minimum [P3, P4] | yes | 1.5–5 | 1.5–5 | — |
| T13 | Public publication contract without internal ids [P5] | no, but it multiplies every kernel change | 1.5–3 | 0.5 + 1–1.5 | — |
| T14 | Profile bound in definition storage by digest; Product 2 features keyed to profile capabilities, never to a profile identifier (forms today) [P6, K6] | yes | 1.5–3 | 1–2 | — |
| T15 | Population ingress: one Workflow, about 536 waiting instances per population, append-only registry, Timer ledger [E4] | yes | 10–20 | 6–12 | only if the design needs a new store (dependency) |
| T16 | Per-chain bounds: 32 pending Activities, a 64 KiB batch (#125), a 192 KiB program of about 100–180 elements, state growth (#169) [E5] | yes, for larger models | 6–12 | 4–8 | — |
| T17 | Engine API gaps: general cancellation, DMN resources, variable commands, Signal and Conditional entry points (#91), cross-deployment Calls (#94) [E8, P9] | yes | 8–15 | 6–12 | — |
| T18 | Milestone gates and the cross-product agreement test [P10] | no (assurance) | 1.5–5 | same | — |
| T19 | Start lifecycle convergence (#136, #131, #124) [P11] | yes | 1–1.5 | same | — |
| T20 | Human work for Camunda models: `formKey`, `formData`, assignee expressions, admitted as passive profile data as the [platform proposal](BPM-PLATFORM-PROPOSAL.md) settles (E2) [P12] | yes | 2–3 | same | — |
| T21 | Adopter documentation and API reference [P13] | yes | 1–2 | same | — |
| T22 | Evidence re-retention multiplier per rebase [E10] | no | 1–3 per rebase | same | — |
| T23 | Upstream blocks: Temporal SDK (#123), Node (TD-005) [E11] | production only | external | external | SDK work |
| T24 | Workflow versioning and upgrades [P7, E6] | decided out | — | — | decided |
| T25 | Deferred families: listeners, Java delegates, external tasks, connectors [E2] | decided out | — | — | settled |

**T24 follows the settled documents.**
- The [platform proposal](BPM-PLATFORM-PROPOSAL.md#explicit-exclusions) is "a product, not a demonstration". It excludes the following:
  - authentication providers;
  - multi-tenancy, clustering and high availability;
  - production release packaging;
  - migration of running instances between definition versions.
- [PROJECT-DESIGN](PROJECT-DESIGN.md#pre-release-evolution-policy) allows no migration reader or compatibility switch before a durable release baseline. Until then, an upgrade replaces stored state, and the adopter documentation (T21) says so.
- **In scope:** the identity boundary and authorization (T12).

**T25 follows the settled documents.**
- The [practical target](PRACTICAL-CIB7-COVERAGE-TARGET.md#optional-integrations-and-exclusions) and the [compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) keep these families optional and deferred.
- The cost of that choice is disclosed, not hidden: CIB's own invoice demo uses a task listener. Listeners would cost 8–15 agent-days on the current code and 4–8 designed in.

## Remaining-to-goal ledger, not costly

About 10 agent-days in total, all independent of the kernel design. The issues are #133, #93, #171, #134, #137, #142, #124, #152, #169, #170, #167, #188, #77, #100, #106, #114, #119, #107, #101, #92, #110, #112 and #67, plus the CIB harness gaps (#89, #127–#130, #105), small Product 2 surfaces (value arms, search filters, profile selection, a published bundle) and documentation corrections. Each item is costed in the domain reports.

## What the verified findings imply, before design

- **The rewrite decision turns on the kernel core.**
  - T1, T2 and T11–T21 are reader, admission, host, engine-API and platform work. Their cost barely changes with a kernel rewrite.
  - The kernel-core drivers are T4, T6, T7 and T8. On the current code they cost about 55–115 agent-days; designed into a rewrite, about 30–70, plus the rewrite's own T5 of 5–12.
  - T4 is where the two options differ most: C1–C5 are state and step shapes that a rewrite removes and a retrofit has to work around. T4 is therefore calibrated first.
- **The total to the goal is large either way.**
  - About 95–225 agent-days by these estimates, with T1 at its broad count.
  - The first rewrite took about 7.
  - The calibrations of checkpoint 3 replace these ranges with measured numbers before any plan is approved.
- **Correction (2026-11-17):** the first version of this checkpoint took P6 off the path by recommending a third-party default profile. That re-derived settled scope and is withdrawn.

## Design

Checkpoint 2. Each decision records the following:
- its premise, verified in code or the documents;
- its scope check against the settled documents;
- the alternative it rejects.

Where a calibration has to choose between two candidates, both are named, together with the spike that decides.

### Kernel core: T4, T5, T6, T7, T8

The design removes P6's causes C1–C6 by construction instead of proving around them. It keeps the IL, the expression evaluator, Decision, Correlation, Starts, admission apart from its concurrency walk, and the rule-only laws.

**KD1. Identity without a global counter (C1, C2; T6).**
- Every internal identity is structural:
  - **occurrence key:** the enclosing scope occurrence's key, the element and an arrival discriminator;
  - **open-item key:** the occurrence key, the item role and a per-occurrence ordinal.
- `State.nextIssue` and its 6 issue sites go.
- The public `OccurrenceRef` keeps CIB's numbering, `(instance, element, activation)` with activations per element in begin order. A per-element begin count, read only by publication, computes it.
- Two candidate arrival discriminators. Spike T4a decides between them:
  - **(i)** A per-scope ordinal. Two schedules then differ only by a permutation of sibling activations of one element, and the proof carries that local renaming.
  - **(ii)** Provenance: the incoming flow and the emitting occurrence's key. This needs no renaming, but keys grow with loop depth, as #126 does, and need a bounded encoding.
- **Premise:**
  - Canonical waits are keyed by the public reference (`Kernel/Run.lean:256`), so retained CIB evidence is unaffected.
  - Internal identities do leak into the publication JSON (`owner` and `idle.scope`, `Kernel/Run.lean:236-250`). That is fixed with T13 in the same shape commit.
- **Scope check:**
  - `CLAUDE.md` keeps definition identity, semantic instance identity and host identity distinct.
  - The public identity and CIB-OP-0018 stay unchanged.
- **Rejected:** keeping the counter and proving equivalence up to a bijection over about 60 positions. That is option B on the current kernel, estimated at 25–44 agent-days.

**KD2. Hooks see a footprint, not the whole state (C3, C5; T4, T10).**
- Today all 50 `Hooks` fields take and return the whole `State` (`Kernel/Hooks.lean:333-444`).
- In the new design, a hook receives a view of the regions its arguments name and returns a delta over the same regions. The regions are an occurrence subtree, the variable scopes on its scope chain, and that occurrence's feature-slot entries. `Step` applies the delta.
- Footprint soundness then holds by typing, with no lemma per hook. The architecture's promise, "Commutation is proved once over the footprints each feature declares" (`kernel/ARCHITECTURE-SPEC.md`, module rules), becomes true.
- Order-reading hooks (C3: `ownReceivers`, `offerWrites`, the stale check) read structural keys. Under KD1 (ii) those keys are schedule-independent; under (i) they are independent up to the sibling renaming.
- **Premise:** `Hooks.lean`, `Registry.lean` and `Laws/Hooks.lean` contain no footprint (root grep, 0 occurrences).
- **Rejected:** declaring footprints as laws beside unchanged full-state hooks. That needs a soundness lemma per hook, about 30 closure hooks, which is P6R's O3 at 40–80 h.

**KD3. The closure is a set of units (C4; T4, T7).**
- `settle`'s fixed phase loop (`Kernel/Step.lean:352`) becomes a choice among enabled units: token arrivals, raised signals, idle-scope checks, re-offers and finishes.
- Only an order that BPMN or a register entry fixes stays a priority. #120, signals before tokens, is classified in the register before KD3 is coded.
- The schedule input picks among units of equal priority. `orderInvariant` admits any pick; `declarationDepthFirst` fixes it.
- One generic diamond lemma covers units with disjoint footprints. Overlapping footprints are either refused by admission (`Apart`) or are joins, whose confluence is proved once per join kind (Parallel, Inclusive).
- **Premise:** C4 was measured by P6R, and #120 and #75 are open closure-order findings (K8).
- **Scope check:** `CLAUDE.md` requires that scheduler choices stay explicit inputs, and the conformance target fixes no token order. Rejected option E, a canonical schedule for the standards profile, stays rejected.

**KD4. One declarative walk for admission and runtime (C6, K2; T4).**
- `Laws.Flow.Walk` becomes the only account of what a closure can reach: an inductive relation over the IL.
- Admission's concurrency check is a decision procedure, proved sound against `Walk`.
- The runtime side is a provenance invariant: every enabled unit is `Walk`-reachable from its closure's origin. It is proved per feature as "each hook emits only `Walk` successors", which KD2's delta types make local.
- This merges the two separate readings that produced #162, #187, #188 and the raw-flag class.
- The [module table](kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape) changes: `Laws.Flow` may state `Walk` over IL queries. It still never names the admission evaluator. The decision procedure's soundness lives in `Proofs.Admission`.
- **Premise:** `PLAN.md:97` excludes admission ⇒ premises, and `Concurrent` has 10 constructors over 9 mechanisms.
- **Rejected:** keeping two walks and proving their agreement after the fact. That is P6R's O4, estimated at 80–120 h.

**KD5. Statement (K11; T4).** `SchedulesAgree` concludes equal committed publication and equal state up to KD1's renaming (none under (ii)). Parked joins and scope order are included. This closes the gap that the strong `Sim` closes in K11.

**KD6. Proofs re-established on the new core (T5, T8).**
- The lane statements of P2–P5 and P7 carry over.
- Their body lemmas about `State`, `Step` and `Hooks`, about 27,000 lines, are re-proved against the view and delta operations. Spike T5 measures the rate.
- The eight witness-only law families (K10) are proved in the same pass against the registered hooks. Spike T8 measures one family.

**KD7. Guards for the promises the first rewrite broke (T4, T10).**
- **Nested inductives:** an environment scan fails on any nested or mutual inductive in IL or state types. `State/Slots.lean:71` is rewritten flat.
- **Footprints:** a type-level scan fails on a `Hooks` field whose type mentions `State`.
- **Raw flags:** only `eventStart` and `eventSubProcess?` may bind the IL's interrupting flag.
- **Queuing sites:** the queuing mechanisms are one data list (P1 census, 22 sites), and a scan fails on a queuing site outside it.
- **Hook defaults:** the architecture's "no-op default" promise is restated as "refuse default". Refusing is the safer contract, and the code already does it (`Hooks.lean:412-416`). Restating a promise needs owner approval, so it is listed under owner items.

## Reuse and document verdicts

The domain reports give a verdict per component. The sections below summarize them.

**Kernel**
- **Keep:** the IL table, the expression evaluator, Decision, Correlation, Starts, admission apart from its concurrency walk, the rule-only laws (3,058 lines), and most guards.
- **Rewrite, if the core is rewritten:** State, Hooks and Step, together with their body lemmas and all proof bodies (about 27,000 lines). Lane statements carry over.

**Engine boundary**
- **Keep:** profiles, register, scenarios, differential and ledger.
- **Adapt:** reader, schemas, Temporal process chain, engine API and the CIB runner. The CIB runner changes only on a public identity change.
- **Rewrite:** the population ingress.
- **Retained CIB evidence** survives a kernel rewrite byte for byte, as long as scenario and profile bytes, the canonical result shape and the public activation numbering stay unchanged. The CIB comparison excludes every internal identity.

**Product 2**
- **Keep:** most modules.
- **Adapt:** contracts, server, web, the engine gateway (replace its casts with decoders) and identity policy.
- **Retire:** the empty JUEL Worker.

**Documents**
- **Revise:** `kernel/ARCHITECTURE-SPEC.md`, `kernel/IL-SPEC.md`, `kernel/KERNEL-STATUS-MAP.md`, the admission, expression, compensation and publication semantics specs, the platform proposal, implementation map and milestone ladder, the scalability proposal, the lifecycle spec and seven Product 2 specs (vocabulary of the retired engine).
- **Retire:** `kernel/ROW-TRACEABILITY-MAP.md`, `TEMPORAL-WORKER-DEPLOYMENT-REPAIR-SPEC.md`, `INTERCHANGE-ADMISSION-SPEC.md`, `PRESERVE-ONLY-ADMISSION-SPEC.md` and `RUNNABLE-TEMPORAL-MVP-SPEC.md`.
- **Keep:** the other semantics specs, with passage revisions where identities change.

## Suspected, not established

These are listed so that none becomes a surprise later. Each is tracked into the design or a calibration.

- A #155 variant: one handler, two concurrent records of one subject.
- Fuel adequacy of 18 fuel-recursive kernel files.
- More double readings between admission and runtime.
- Lean/TypeScript divergence on states the corpus never reaches.
- Witness-only laws that may be false.
- Scale of list-based state and the closure cost.
- Ingress throughput.
- `vm` escapes.
- Mocked UI fixtures drifting from engine output.
- Release-lane time against its timeout.
- Business-key support.
- Versioning in SDK 1.21.0.
- The real third-party barrier distribution beyond the first diagnostic.
