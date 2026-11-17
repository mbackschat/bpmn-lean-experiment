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

**Topics found after checkpoint 1 (2026-11-17), disclosed when found:**

| # | Topic | Blocks | Evidence | Cost |
|---|---|---|---|---|
| T9 (revised) | 14 runtime `unsupported` sites are semantic gaps: an admitted model reaches an interpretation that was never selected. 11 are in Propagation and Compensation; 3 are closure rollback and interruption in `Step/Jobs.lean:24,36` and `Step/Stale.lean:66` | yes, for models that reach them | root census of the 60 `dynamic-only` marks (`q/r2/spikes/T9-result.md`): 17 Java-host fidelity, 3 capacity, 20 caller data, 6 value domain, 14 semantic gaps | each needs an interpretation, a cold review, Lean and TypeScript, scenarios and CIB evidence. Unmeasured per code; spike T9b resolves one end to end |
| T26 | **Data volume per instance:** process data lives in the Temporal Workflow state, under bounds of 32 members per container, 16 KiB per value and 256 KiB per state. An order with 100 lines is refused (`value-outside-domain`). CIB stores variables in its database without such bounds | potentially, for data-heavy third-party processes | the bounds are at `kernel/semantics/DATA-SEMANTICS-SPEC.md` (Values) and in the [lifecycle capacity table](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-capacity). The [scalability proposal](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md) bounds chains by design but never sizes the bounds against real data | unmeasured. The design options: raise the bounds within Temporal's payload limits (an owner bound decision), or externalize large values by claim check (a store dependency, an owner decision). Research and a spike follow |

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

### Admission and breadth: T1, T2, T9, T20

**AD1. A profile-selected inert tier (T1).**
- The reader classifies every extension attribute and element as exactly one of three things:
  - **consumed:** read into the IL;
  - **inert:** retained in exact source evidence and published nowhere, or published as passive metadata;
  - **refused:** with a code.
- The inert list is profile data, with one register entry per item. Each entry states why the item has no effect at the observation boundary; for example, `historyTimeToLive` drives only CIB's history cleanup.
- **Premise:** the reader refuses every unconsumed extension (`bpmn-source/src/kernel-reader/model.ts:352,361`, `requireCarried`), and 50 of the 55 CIB examples carry `historyTimeToLive`.
- **Scope check:** "Camunda/CIB extension syntax is admitted only through exact profile-selected BPMN contexts" (`PROJECT-DESIGN.md`, CIB compatibility).
- **Rejected:** ignoring the whole `camunda:` namespace. That would silently drop meaning such as `asyncBefore` or `failedJobRetryTimeCycle`.

**AD2. Admission reports every refusal (T1).**
- Admission returns every refusal, each with its element identity, instead of the first one.
- The checks that today carry `element: null` (`kernel/src/admission-registry.ts:643-659`) name their element, or name the definition when the check is model-wide.
- **Premise:** one diagnostic per compile (`engine-api/src/definition.ts:63-67`).
- **Scope check:** "report acceptance or rejection with the offending element identity and reason" ([platform proposal](BPM-PLATFORM-PROPOSAL.md#deployment-and-definitions)), and M1's exit gate.
- **Rejected:** an engine-API loop that strips each refusal and recompiles. It masks dependent refusals and multiplies compile time.

**AD3. Breadth items are coverage rows with their IL fields present (T1, T20).**
- The items that third-party models hit become rows of the coverage target. The [compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) already places them in scope:
  - form metadata, assignees, candidates and dates, with Task-field expressions at the JUEL Task-fields level;
  - Call binding, version and business key;
  - Multi-Instance extensions;
  - retry-cycle extensions, selected per profile.
- Their missing IL fields (E12: initiator, retry cycle, structured parameters, `formRef`, `exclusive`, `Subscription.outputs.itemRef` from #114) enter in one shape commit, per the forward-compatible rule.
- The JUEL levels the architecture promised and never delivered, Task fields (M3) and Events (M6), are delivered as rows, not restated.
- **Premise:** the K4, E1 and P1 inventories. Spike T1a measures the full barrier distribution beyond the first diagnostic.
- **Rejected:** admitting these fields through a generic pass-through, which the forward-compatible rule forbids.

**AD4. The value domain widens inside the ceiling (T2).**
- `Value` gains Double, negative Integer and Date.
  - **Double** is IEEE binary64, carried as its bit pattern so that equality stays lawful, and computed through the platform double in both kernels.
  - **Negative Integer** stays within the wire's magnitude bound.
  - **Date** is an instant in epoch milliseconds, as CIB's `java.util.Date` holds it.
- EL coercion follows the EL specification, and the pinned `cibseven-juel` stays the oracle.
- The size bounds stay: 1,024 B strings, 32 members per container, 256 nodes, 16 KiB. Raising them is an owner item, listed below with a recommendation.
- **Premise:** `Value` has no Double or Date (`Kernel/IL/Types/Expression.lean:17-25`). Division and float literals are refused (`Kernel/Admission/Data.lean:100,130`), and CIB's invoice example uses `typeRef="double"`.
- **Scope check:** the Core JUEL level is "EL coercion over the portable value domain" ([architecture](kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step)), and Double is within CIB7's breadth.
- **Rejected:** Lean `Float` as the stored representation. Its `BEq` is IEEE equality (NaN differs from itself), which breaks lawful equality of `Value`.
- Spike T2 measures the change.

**AD5. Every runtime `unsupported` code is classified (T9).**
- Guard 20 already pairs each runtime `unsupported` code with an admission refusal, or marks it dynamic-only.
- The design adds an inventory of the dynamic-only codes, each classified as either:
  - a **capacity restriction**, a host bound with a stable code, which is legitimate; or
  - a **semantic gap**, which becomes a row or an admission refusal.
- **Premise:** 66 distinct runtime codes (root grep of the executable Lean files). Spike T9 measures the inventory.

### Engine boundary and hosting: T11, T15, T16, T17, T19, T22, T23

**HD1. A public effect contract (T11).**
- A published package carries the following:
  - the effect request and result types;
  - a Worker factory that registers handlers by protocol and operation;
  - the mapping from a handler's business failure, technical failure and retry exhaustion to the kernel's effect outcomes and incidents.
- Effect Activities run on a task queue per handler protocol, separate from the Workflow's own queue. The Activity identity is the effect's identity, which the handler uses as its idempotency key.
- **Premise:** effect Activities have no `taskQueue` (`temporal-host/src/workflow-host.ts:473,542`), the engine packages are private, and the evaluation Worker is canned (`compose.yaml:74`).
- **Scope check:** "Project-owned effect protocol and handler identifier: in scope" ([compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md)). A JVM Worker is separately approved and stays out.
- **Rejected:** letting adopters fork the private host.
- Spike T11 calibrates it.

**HD2. Population ingress scale-out by the documented path (T15).**
- The architecture names option O2 as the scale-out path: a fan-out Workflow per command beside address-keyed registries ([population ingress](kernel/ARCHITECTURE-SPEC.md#population-ingress)). It is triggered: one population holds about 536 waiting instances (measured, see Method).
- The design follows O2:
  - registrations shard by address digest into registry Workflows;
  - each command runs in its own fan-out Workflow;
  - the ingress keeps only numbering, the command ledger and deployments;
  - the deployment registry and the Timer-start ledger are pruned by currency, not only on redeploy.
- No new store: PostgreSQL belongs to the platform, and the engine must not depend on it.
- **Premise:** the bounds are at `temporal-host/src/population.ts:27-34`, and the registry is append-only.
- **Rejected:** a database-backed registry. It would be a new engine dependency and needs owner approval.
- **Throughput is unmeasured.** The reason: no Temporal server may run locally, so the plan's first hosted lane measures it. Spike T15 measures only the implementation rate.

**HD3. Per-chain bounds become host scheduling, not refusals (T16).**
- **Pending service Activities beyond 32** wait in the host's own queue. Effect completion order is already an explicit kernel input, so the meaning does not change.
- **The 64 KiB batch (#125)** becomes segmented publication.
- **The program** is read from the deployment Workflow by digest, not carried in the chain's continuation.
- **State growth (#169)** is removed by KD1's bounded keys.
- **Premise:** the owner-ratified bounds are at `TEMPORAL-PROCESS-LIFECYCLE-SPEC.md:83-104` and `capacity.ts:24`. The median IL is 1,082 B per element (E5's measurement).
- **Scope check:** the bounds themselves stay as ratified. Only their effect changes, from refusal to waiting.
- Spike T16 measures it.

**HD4. The engine API closes its gaps through existing kernel mechanisms (T17, T19).**
- **General cancellation** is a kernel command over the existing generic subtree removal.
- **Compilation** accepts BPMN plus DMN resources (#132).
- **Variable commands** expose `setVariables` and `removeVariables`, which the kernel and runner already have.
- **The #91 entry points** (Signal broadcast, Conditional start evaluation, fan-out observation) are ingress commands that already exist.
- **Cross-deployment Calls (#94)** assemble the stamped callee copies at deployment.
- **Start lifecycle (#136, #131, #124):** every client wait has a deadline and cancels what it raced.
- **Premise:** the engine API offers only `retryIncident` and `cancelIncidentProcess` (`engine-api/src/process-operations.ts`), and the hosting gap is recorded in the architecture.
- Spike T17 calibrates on general cancellation, end to end. T19 is calibrated by transfer from it, and is marked as such.

**HD5. Evidence survives the rewrite; profile changes are batched (T22).**
- KD1 keeps the public identity, so retained CIB evidence stays valid byte for byte. Its sha256 binding covers the scenario and the profile, never the kernel.
- Profile byte changes, for example AD1's inert tier, invalidate the evidence bound to that profile. So they are batched as one profile commit per track, with one re-retention each: three shards of 4.5–6.5 minutes, measured in hosted CI (E10), plus reclassification of the affected entries.

**HD6. Upstream (T23).**
- The Temporal SDK stays pinned at 1.21.0 until #123's defects are released upstream.
- SDK work stays prohibited, and TD-005 stays an upstream Node defect.
- No cost is planned for either; the owner decides on SDK work.

### Product 2: T12, T13, T14, T18, T21

**PD1. Identity per request through the pluggable boundary (T12).**
- `resolveActor` takes the request. The default fake implementation stays, as the platform proposal settles: "a pluggable identity boundary with a fake implementation by default".
- Every route authorizes through the policy module:
  - deploy;
  - start;
  - schedule;
  - Message start and publication;
  - search;
  - definitions;
  - operations.
- An adopter's resolver is the adopter's code, and the adopter documentation says how to write one.
- Deploy authorization is what keeps Scripts trusted model content (T11).
- **Premise:** the resolver takes no request (`identity-policy/src/fake-actor-resolver.ts`), and the route files listed in the verification table carry no authorization.
- **Rejected:** an authentication provider, which the proposal excludes.

**PD2. A public publication schema (T13).**
- The engine publishes only public fields: element identity, source element type, transition role and `OccurrenceRef`. Its revisions count committed inputs, not micro-steps.
- The platform decodes publications with a decoder generated from the schema instead of casts.
- **Premise:** `transitionJson` publishes `owner` and `idle.scope` (`Kernel/Run.lean:236-250`), and the gateway casts at `process-publication-gateway.ts:92,98,115`.
- **Scope check:** the architecture's own contract says "Semantic publication: element identity, source element type and transition role; no IL kinds" ([contracts](kernel/ARCHITECTURE-SPEC.md#contracts)), so today's leak breaks a promise. It is listed in the promise register.

**PD3. The profile is bound by digest; features are keyed to capabilities (T14).**
- A definition's identity stores the profile's sha256, and recompilation verifies it.
- Product 2's features ask `definitionCapabilities` what a definition admits, for example structured forms, and never compare a profile identifier.
- **Premise:** `engine-api/src/common.ts:36-40` stores only the profile id. `"bpmn-2.0.2"` literals appear at `human-task-catalog-projection.ts:23` and `definition-deployment-service.ts:41`.
- **Scope check:** "No code compares a profile identifier" ([architecture](kernel/ARCHITECTURE-SPEC.md#profiles)). Guard 7 does not scan the platform; it will.

**PD4. The cross-product agreement test (T18).**
- For every registered scenario, the platform's projection of the kernel runner's committed publications must equal the engine's published open User Tasks. This is the requirement at `PROJECT-DESIGN.md:92`.
- It runs on the kernel runner's output in the fast lane, with no Temporal.
- The engine gate also runs with the platform tree absent, as M1's exit gate requires.
- **Premise:** no test implements it (root check).

**PD5. Adopter documentation (T21).**
- Three guides: deploying and operating, writing an effect handler and an identity resolver, and modeling inside the admitted surface.
- Plus an API reference generated from the HTTP contract.
- **Unmeasured,** with the reason: documentation is not calibrated by a spike. Its risk is low, and it is priced by transfer from this proposal's own writing rate.

### Promise register

This register lists every promise of the [kernel architecture](kernel/ARCHITECTURE-SPEC.md) and the architecture promises of [PROJECT-DESIGN](PROJECT-DESIGN.md) and the [platform proposal](BPM-PLATFORM-PROPOSAL.md). Each one names what enforces it in the rewrite-2 design.

The root checked, on 2026-11-17 at `87d27def2`:
- **The 24 guardrails:** each has an enforcing script, found by grepping its number across `scripts/`, plus the self-test of guard 23. The Lean side of guards 1, 2 and 17 is in `scripts/kernel-dispatch.lean` and `scripts/kernel-effects.lean`.
- **The "Missing" rows:** each was confirmed by a grep that found no enforcing artifact.

| Promise | Source | Enforced by | State at `87d27def2` | In the design |
|---|---|---|---|---|
| The IL fixes the shape for every row; a field outside the surface is refused, never omitted | architecture, IL | guards 12, 19, 21 | enforced | kept |
| No IL or state type is a nested or mutual inductive | architecture, IL | — | **broken**: `State/Slots.lean:71` | flattened; new environment guard (KD7) |
| An element is a header plus one payload; slots are fixed, so the codec never varies by program | architecture, IL and state | guards 9, 11 | enforced | kept |
| Cancellation is one generic subtree removal; one writer per effect | architecture, state | guard 17 | enforced | kept |
| `Step` is pure and total | architecture, step | Lean totality (`partial` only in codecs, root grep) and the lane proofs that unfold `Step` | enforced | kept |
| Every evaluation runs inside the kernel, with one evaluator per profile | architecture, evaluation | guard 13 | enforced | kept |
| JUEL levels Task fields (M3) and Events (M6) | architecture, evaluation | rows | **undelivered** | delivered as rows (AD3) |
| Each `Hooks` field has a no-op default | architecture, hooks | — | **broken**: defaults refuse | restated as "refuse default"; **owner item 1** |
| `Step` alone owns hook order; cross-owner matches go through `Hooks`; at most three files per feature | architecture, hooks | guards 1, 4, 10 | enforced | kept |
| `Laws.F` rules are proved against `Step` in the proof wave | architecture, hooks; lane | lane proofs | **partly**: 8 families witness-only (K10) | proved in the rewrite pass (KD6) |
| Commutation is proved once over the footprints each feature declares | architecture, modules | — | **broken**: no footprints | footprints by typing (KD2); new type-level guard (KD7) |
| P6, `SchedulesAgree` | architecture, lane; PLAN | lane proof | **open** (#163) | KD1–KD5 |
| The host sees the kernel only through `hostRequirements`, `definitionCapabilities` and `hostView` | architecture, host | guard 4 | enforced | kept |
| An admitted program the host cannot schedule is refused before a Workflow starts | architecture, host | `engine-api/test/definition-compilation.test.ts` | enforced | kept, with HD3's waiting instead of refusing |
| Module table, rebuild cones, no `@[expose]`, bodies seen only by their own `Laws` | architecture, modules | guards 4, 5, 15, 22 | enforced | module table amended for `Walk` (KD4) |
| No theorems in executable modules; laws are independent of `Step`'s code | architecture, modules; lane | guard 6 | enforced | kept |
| Lean options are pinned | architecture, modules | `scripts/verification-entrypoint.test.ts` | enforced | kept |
| TypeScript transcribes Lean, module by module | architecture, TypeScript | guards 8, 16 | enforced | kept |
| No proof-motivated TypeScript code | architecture, TypeScript | track review only | review-enforced | **owner item 2**: move to the review checklist |
| `bpmn-source` refuses only parse, preservation and unknown-element cases; every semantic refusal lives in admission | architecture, TypeScript | — | **broken**: `reader.factNotCarried` decides extension meaning in the reader | AD1 moves the classification to profile data; guard 12 extended to restrict reader codes |
| No code compares a profile identifier | architecture, profiles | guard 7 (kernel and boundary packages) | **broken in the platform**: `human-task-catalog-projection.ts:23` | PD3; guard 7 extended to `platform/` |
| Semantic publication carries element identity, source type and transition role, no IL internals | architecture, contracts | — | **broken**: `owner`, `idle.scope` (P5) | PD2; schema guard |
| Schemas are the wire authority | architecture, contracts | guard 11 | enforced | kept |
| Lean, TypeScript and retained CIB evidence agree on every scenario | architecture, lane | guard 16 | enforced | kept |
| Hosted mechanisms are witnessed: chain handoff, capacity, replay, the population witnesses | architecture, hosting | hosted test suites | enforced | HD2 replaces the ingress witnesses |
| The TypeScript and Temporal solution never depends on a JVM | CLAUDE.md; PROJECT-DESIGN | dependency approval only | policy-enforced | new manifest guard over the engine and platform packages |
| For every registered scenario, the platform's task set equals the engine's open User Tasks | PROJECT-DESIGN (one repository) | — | **missing** | PD4 |
| The engine gate passes with the platform tree absent | milestone ladder, M1 | — | **missing** | PD4 |
| The platform consumes only the engine's published contract and never constructs an occurrence identity | PROJECT-DESIGN; platform proposal | `scripts/platform-product-boundary.test.ts` (10 tests) | enforced; stale `BpmnSemantics` root at `platform-product-boundary.ts:8` | kept; stale root removed |
| Review, definition of done and register-in-commit rules | architecture, review | review receipts | process | **owner item 3**: move to the engineering policy |

## Owner items

These are only items on the owner's ask list. Each was checked against the settled documents.

1. **Restate the hook-default promise** as "each `Hooks` field defaults to refusal". This changes an architecture promise.
   - **Recommendation:** accept. A refusing default makes an unregistered behavior fail loudly. A no-op default would make it silently skip meaning.
2. **Remove "no proof-motivated TypeScript code" as an architecture promise** and move it to the track review's checklist.
   - **Why it is an ask:** no guard, test or proof can enforce it. A scan cannot tell proof-motivated code from executable structure, and a name deny-list would pass by matching nothing.
   - **Recommendation:** move it.
3. **Remove the review and definition-of-done rules from the architecture's promises** and keep them as process rules in the [engineering policy](kernel/ENGINEERING-POLICY.md), enforced by review receipts.
   - **Why it is an ask:** they govern how work is accepted, not what the code guarantees, so no guard, test or proof applies.
   - **Recommendation:** move them.

**Disclosure, not an ask.** The value size bounds stay as they are: 1,024 B strings, 32 members per container, 256 nodes and 16 KiB. They become an owner item only if spike T1a measures third-party models that exceed them.

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
