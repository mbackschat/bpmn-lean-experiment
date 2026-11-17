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

**Topics found by the independent showstopper hunt (2026-11-17).**
- The hunt was read-only, at `5fdfcd941`. Its report is `q/r2/hunt-report.md` in the session scratchpad.
- In the "Root check" column, "verified" means the root read the cited code or document lines; "hypothesis" means nobody has run it.
- These topics are not yet designed or calibrated. They join checkpoints 2 and 3.

| # | Topic | Root check | Owner |
|---|---|---|---|
| T27 (F1) | **Product 2 stops working after about 100 instances.** Work, Incidents and Metrics each build an all-or-nothing snapshot with one Temporal Query per instance, capped at 100: closed instances count in `work-service.ts:117`, Incidents are hard-coded at 100 (`shared-composition.ts:120`), Metrics at 100 per version (`flow-node-metrics-aggregation-service.ts:62`) | verified | — |
| T28 (F2) | **An instance that halts looks completed.** A halt ends the Workflow (`workflow-host.ts:583,641`), and observation reports it as `Closed` (`engine-api/src/process-observation.ts:55`). Nothing in `platform/` handles halts. One trigger: any technical failure under `bpmn-2.0.2` is `unsupported` (`kernel/src/feature/work.ts:559-561`) | verified | — |
| T29 (F3) | **A rejected effect result is dropped.** The host deletes the effect's Activity handle and keeps going (`workflow-host.ts:608-616`), for example on `value-outside-domain` (`work.ts:467`) | verified that it is dropped; that the task then stays stuck is a hypothesis | — |
| T30 (F4) | **History is lost when the projector falls behind a Continue-As-New.** A Run keeps only its own batches, and an older cursor is a permanent `gap` (`temporal-host/src/publication.ts:7-10,104`) | verified that the gap is permanent; that recovery starves past 1,000 candidates is a hypothesis (the limit exists in `postgresql-*-recovery-candidates.ts:8`) | — |
| T31 (F5) | **One lost chain disables Work for every instance.** An `unknown` registration fails the whole snapshot again on every call (`work-service.ts:135-141`), and no operator action retires it | verified | — |
| T32 (F6) | **A recurring Timer start never fires by itself.** Product 2 offers only one-shot schedules (`BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md:19`) | verified | scope: the scheduling spec excludes recurrence |
| T33 (F7) | **Instances the engine starts itself, for example by Signal cascades, are invisible in Product 2** (`BPM-PLATFORM-HUMAN-WORK-SPEC.md:27`) | verified | — |
| T34 (F8) | **Service Tasks bound by `class`, `delegateExpression`, `expression` or `external` are refused.** This blocks 46 of the 109 census models. Generic binding and external tasks are deferred in the [compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md), with reopen conditions that name a consumer, and Product 2 is that consumer | verified (census data) | **scope**: reopen a deferred family |
| T35 (F9) | **A third party's User Tasks cannot be completed with data.** Structured forms come only from the project's rendering extension; 19 of 65 models with User Tasks use `formKey` | verified (root re-count over the 109 models, 2026-11-17: 65 with User Tasks, 19 with `formKey`: 17 `embedded:`, 1 `app:`, 1 `camunda-forms:`; 2 with `formData`) | Camunda Forms would be a **dependency** |
| T36 (F10) | **The 128-Run lifetime cap halts long-running instances** (`TEMPORAL-PROCESS-LIFECYCLE-SPEC.md:102`) | verified that the bound exists; the time to reach it is an estimate | **owner-ratified bound** |
| T24 (corrected, F11) | Persisted production history needs five owner approvals first (`PROJECT-DESIGN.md:253-259`), and a third party's use creates it. "Wipe on upgrade" is therefore **not settled**; the earlier "decided out" is withdrawn | verified | **five owner approvals listed in PROJECT-DESIGN** |
| T37 (F12) | **`Value` is a nested inductive** (`Kernel/IL/Types/Expression.lean:24-25`), so KD7's planned guard fails on it as well as on `Slots` | verified | **architecture promise**: restate it, or flatten `Value` (non-local) |
| T38 (F13) | **Nothing designs failure handling under the standards profile.** Incidents exist only under the CIB profiles, and a technical failure halts (T28) | verified through T28 | — |
| T39 (F14) | Cron runs in UTC only, as the owner decided on 2026-11-08 | verified (architecture owner decisions) | disclosure; changing it reverses an owner decision |
| T40 (F16) | **No mechanism finds Lean/TypeScript divergence beyond the corpus**, while production runs only the TypeScript kernel | hypothesis (no generator found) | — |
| T42 | **Commutation complications P6 had not priced** (found on the owner's hint, 2026-11-17): the closure work bound depends on the schedule (`Step.lean:355`); `SchedulesAgree` assumes both schedules settle, which is weaker than the order-invariance promise (`ENGINEERING-POLICY.md:36`); provenance pairing is per mechanism and nests (`Concurrent.lean:411-415`). Designed in KD8 | verified (root read of each cited line) | — |
| T43 | **The reader silently drops source it does not carry** (found by inventory I2, root-reproduced on 2026-11-17 against the built reader of `tracks-integration`): `requireAllCarried` checks extension attributes only on Processes, flows, nodes, Event Definitions and loop characteristics (`kernel-reader/index.ts:223-232`), and nothing checks standard BPMN children. Read without refusal or `notCarried` entry: `potentialOwner` and `humanPerformer` on a User Task, which CIB turns into candidates and the assignee (`BpmnParse.java:2890-2930`); `bpmn:property` on a User Task, which CIB turns into a variable declaration and makes the task a scope (`BpmnParse.java:2801,4238-4248`); any `camunda:` attribute on `definitions`, root Messages, Signals and Errors, Lanes and Participants. (Corrected by spike T43: `camunda:errorMessage` is carried for a thrown Error, `kernel-reader/events.ts:271-274`, and dropped only for a catch, where CIB does not read it either.) This breaks the reader's own contract (`kernel-reader/index.ts:1-5`) and regresses the owner-approved closed recursive classifier of the retired registry ([PRESERVE-ONLY-ADMISSION-SPEC](PRESERVE-ONLY-ADMISSION-SPEC.md) D2). Census of the 109 models: resource roles, `ioSpecification` and `errorMessage` 0; `bpmn:property` 2 (the Modeler's `__targetRef_placeholder`); Lanes 1; Collaborations 4. Designed in AD6 | verified (root probe and CIB source) | unmeasured; spike T43 |
| T44 | **The Activiti extension namespace is refused** where CIB reads it as an alias of the Camunda namespace (`BpmnParse.java:258`; the reader knows only `camundaNamespace`, `kernel-reader/model.ts:254`). Fail-closed, so a breadth gap, not a defect: of the 109 models, 35 declare `http://activiti.org/bpmn`, 15 bind the `camunda:` prefix to it, and 8 declare no Camunda namespace (root grep, 2026-11-17). No document or register entry mentions it. Designed in AD6 | verified | minutes in the reader (T1b's breadth rate), plus one register entry |
| T45 | **Admission accepts forms that BPMN or CIB declares invalid, and some then fail or diverge at run time** (found by inventory I1's 307 probes; root re-ran two and read each cited line, 2026-11-17). (1) A triggered Start Event in an embedded Sub-Process or Transaction: BPMN allows only None there (BPMN 2.0.2 Table 10.85, "only one type of Start Event for Sub-Processes … None"), CIB refuses it (`BpmnParse.java:1153-1179`), and admission treats every nested start as an Event Sub-Process start (`AdmissionRegistry.lean:301`); the admitted model fails its first `start` with `semanticFailure:scope-without-start-event`. (2) An intermediate throw with an Error or Terminate definition: Table 10.89 admits neither in normal flow, CIB runs it as None (`BpmnParse.java:1603-1672`), and the kernel raises the Error or clears the scope, so a boundary's User Task opens where CIB passes the token on. (3) A sequence flow into or out of an Event Sub-Process, a second incoming flow on an Event-Based Gateway arm, and `camunda:elementVariable` without a collection: CIB deployment errors (`BpmnParse.java:4346-4355,1881-1884`) that the kernel admits. No coverage row or register entry names any of them | verified | about 6 refusal rules at T1b's breadth rate, plus the variant-matrix guard (unmeasured) |
| T46 | **Two operator capabilities CIB adopters use are silent in Product 2** (inventory I3, 156 service capabilities and 80 webapp features against the 14 platform documents; root-checked by grep, 2026-11-17): deleting a deployment (`RepositoryService.deleteDeployment`, used in 2 of 40 example projects; the only platform `DELETE` route cancels a schedule, `BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md:115`), and navigating from a Call to its called instance and back (Cockpit's called-instances tab; its underlying queries are used in 7 of 8 projects). Adding either is a scope change (OD13). Disclosed without a recommendation to add: historic variable queries (3 of 3), job queries (3 of 3; this architecture has no jobs, and Timers and async continuations appear as open waits), batch operations and page statistics. The value types the kernel cannot hold are already settled: serialized Java objects and arbitrary JSON are outside the value contract (`kernel/semantics/DATA-SEMANTICS-SPEC.md:13`), and Double, Date and negative integers are T2 | verified (grep of the platform documents) | unmeasured |
| T47 | **The effect boundary has four defects an adopter's handler can trigger** (spike T11, root-verified, 2026-11-17): the idempotency key collides across populations, because it is the bare effect key (`activities.ts:41`, `host-machine.ts:69-71`, `population-address.ts:26-28`), so a handler that deduplicates on it can drop a second population's effect; a thrown error is retried forever with no incident (`transportRetry` is unbounded by design, `workflow-host.ts:148-154`); malformed outputs throw inside Workflow code (`kernel-port.ts:55-66`), so the Workflow Task is retried forever and the chain wedges; and an effect whose descriptor no Worker serves waits forever. Designed in HD1 | verified | inside HD1's 3–4 h |
| T41 (F17, F18) | Audit suspicions dropped from this list: the proof cost per breadth item and replay CPU. Also the fidelity of Java's `Double.toString` for AD4. The third suspicion, models admitted that then fail at start, is established as T45 | carried | — |

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
- **Arrival discriminator, decided by spike T4a: (ii) provenance keys inside a closure, compacted at commit.**
  - Inside a closure, a key is the incoming flow and the emitting occurrence's key. Footprints are then computable from a hook's arguments, and no hook needs an equivariance proof.
  - At commit, every occurrence begun in the closure is re-keyed to (scope key, element, per-(scope, element) ordinal), with ordinals assigned in canonical key order above the existing maximum. Compaction is a function of the end state, so equal end states stay equal. It costs one generic re-key lemma over the roughly 60 identity positions.
  - **Why compaction:** uncompacted provenance keys grow with the whole causal chain since the scope's entry, not only with loop depth. A 4-element loop iterated 1,000 times gives a key of about 4,000 segments, about 80 KB of JSON (T4a F2).
  - **Consequence:** anything persisted outside the state that names an occurrence uses the public reference, never an internal key. That covers host references, timers, effect identities and the publication's `owner` and `idle.scope`, which T13 already removes.
- **Counters and their pruning (spike T5, finding 2).** Compaction's per-(scope, element) ordinals, and the per-occurrence item ordinals, need counters.
  - T5 measured three placements:
    - **On the owning record:** three operations become partial, and every "scopes unchanged" frame weakens to "unchanged up to counters".
    - **A separate list that is never pruned:** frames stay equalities, but the state grows with every loop iteration for the instance's whole life, the #169 class again.
    - **A separate map pruned with the removed subtree:** freshness holds, because a removed key's ordinal came from a parent counter that persists.
  - **Design:** the third, pruned by the same removal primitive that removes the subtree.
  - Its cost: `Step.stale` (`Kernel/Step/Stale.lean:43-44`) is a seventh `nextIssue` reader, beyond the six issue sites. It can then say only "issued below the deepest surviving ancestor" for a removed target.
  - **Checked by spike T4d** (`Counters.lean`, root-recompiled): pruning keeps freshness (`removed_never_recurs`, under the invariant that an ordinal is below its standing parent's counter), and the restated check covers every case `Kernel/Laws/Step/Stale.lean` needs (an issued absent target reads stale; a fresh target stands; a never-issued key under a standing parent still fails).
  - **One designated change at parity:** a never-issued key below a removed subtree now reads as stale (`unsupported "interrupted-before-wait"`) instead of an invariant failure (`lost_case`). No law states that direction, but the documented contract (`Kernel/Step/Stale.lean:35-38`) changes and gets its own red/green witness. Only a host defect or a forged input can name a never-issued key.
  - **Unpriced:** the laws' `issued` premise and `QueueSound` (`Kernel/Laws/State/Invariant.lean:169`) can no longer be read from the pruned state; they need a ghost issue history, which spike T4e prices with the ghost key.
- **Public numbering is assigned at commit, and no hook reads it** (root check, 2026-11-17).
  - "Read only by publication" is the target, not today's code. Today hooks read activations in four places:
    - to identify a thrower (`Feature/Propagation.lean:46,242`);
    - to build a handler's reference (`Feature/Compensation.lean:331-337`);
    - in the public references stored with open items and failures (`Feature/Work.lean:315`, `Feature/Propagation/Throws.lean:102`);
    - in a called instance's identity, fixed when the Call is entered (`State.lean:455,469`).
  - Spike T4c (root-verified) found more readers inside a closure: the compensation run's identity compares a public `OccurrenceRef` (`Feature/Compensation.lean:162-163`, runs keyed by public references at `:99-101` and `Throws.lean:29-30,39`); Signal receivers are sorted by the public instance string (`Feature/Propagation/Throws.lean:93-96`); correlation by process instance reads it (`Feature/Correlation.lean:54`); and an input's public reference is resolved at entry (`Hooks.lean:283-288`, `Step.lean:383-386`).
  - In the new core, these hooks compare structural keys.
  - **The log records issues, not begins** (T4c finding 10). A reservation is numbered when it is armed (`State.reserve`, `Kernel/State.lean:366-371`), and its occurrence keeps that number when it begins. So each closure records, in order, every arming and every fresh begin. At commit that log assigns the activations, the public references and the called instances' public identifiers. Internally a called instance is keyed structurally. `atCommit_eq_sequential` (T4c) proves commit-time numbering equal to today's counter for a log in issue order.
  - **The activation counter is keyed structurally too.** Today it is keyed by the public instance string (`State.lean:367`), which embeds the calling Call's activation (`:455-456`).
  - Issue order is today's order, so the numbers stay the same, and so does retained CIB evidence. Between schedules they differ only within the activation bijection KD5 keeps.
  - **Open (KD1):** the Signal receiver order compares public instance strings, and a called instance's string is assigned only at commit. The closure needs a structural surrogate whose order equals the committed strings' order, including the lexicographic order of decimal activations. A surrogate is designed with T4d's counter item; until then this is a design risk.
  - Inputs that address an item or instance by public reference resolve it through a table written at commit.
  - **Cost (T4c, measured on the real kernel):** moving the two thrower checks to the key took 8 min and touched 13 proof files, a net −22 lines, because `Raisable` loses its counter clause. About 12 readers and producers at about 4 min each is about 0.8 h raw. Moving the public instance string out of state touches up to 64 proof files, about 40 min more at the measured churn, which is rough.
  - **Rejected:**
    - (i) a per-scope ordinal read from state. A begin's footprint then has to cover all siblings, a fourth region kind at every begin site (T4a F8), and all 53 units need an equivariance proof (P6R's O2, 32–64 h).
    - Interning keys in state, because first-appearance order brings C1's schedule dependence back.
    - Hashing keys, because collisions make injectivity an unprovable assumption.
- **Premise:**
  - Canonical waits are keyed by the public reference (`Kernel/Run.lean:256`), so retained CIB evidence is unaffected.
  - Internal identities do leak into the publication JSON (`owner` and `idle.scope`, `Kernel/Run.lean:236-250`). That is fixed with T13 in the same shape commit.
- **Scope check:**
  - `CLAUDE.md` keeps definition identity, semantic instance identity and host identity distinct.
  - The public identity and CIB-OP-0018 stay unchanged.
- **Rejected:** keeping the counter and proving equivalence up to a bijection over about 60 positions. That is option B on the current kernel, estimated at 25–44 agent-days.

**KD2. Hooks see a footprint, not the whole state (C3, C5; T4, T10).**
- Today 36 of the 41 `Hooks` fields take the whole `State` (`Kernel/Hooks.lean:333-444`): 28 closure hooks, 6 input hooks and 2 queries. About 9 callback sub-record fields wired in `Kernel/Registry.lean` and `Ctx.scopeRole` (`Hooks.lean:209`) do too, and with `Step`'s 10 closure operations and the 6 removal primitives that makes 53 units to restate (T4a, method in its report).
- In the new design, a hook receives a view of the regions its arguments name and returns a delta over the same regions. `Step` applies the delta.
- **Region kinds (T4a):**
  - an occurrence subtree, where "subtree" means ownership through a nesting segment of the key, not a key prefix;
  - variables **per name** on the scope chain. Whole-frame regions would always overlap, because two branches in one scope both touch the root frame, so the diamond would never apply (T4a F1). `Apart` already certifies disjointness per name;
  - that occurrence's feature-slot entries;
  - name-indexed instance regions, computable from the IL: a Signal name, a Conditional's variable name, an error code. These serve the E3 units below;
  - an enumerating view, for JUEL and Script evaluation, which counts as reading every name (`IL/Footprint.lean:42`, 26 `evalContext` and `visible` users), and for the Inclusive join's reads of a whole occurrence. State maps are `Std.ExtTreeMap` keyed by `List Nat`, which gives map equality and enumeration (T4a F7).
- Footprint soundness then holds by typing, with no lemma per hook (T4a, proved: `view_frame`, `apply_comm`, `diamond`). The architecture's promise, "Commutation is proved once over the footprints each feature declares" (`kernel/ARCHITECTURE-SPEC.md`, module rules), becomes true.
- Order-reading hooks (C3: `ownReceivers`, `offerWrites`, the stale check) read structural keys, which KD1 makes schedule-independent.
- **Premise:** `Hooks.lean`, `Registry.lean` and `Laws/Hooks.lean` contain no footprint (root grep, 0 occurrences).
- **Conflict with two architecture promises (root re-check, 2026-11-17).**
  - The architecture says "Commutation is proved once over the footprints each feature declares through its `Hooks` laws", and "TypeScript … no proof-motivated code (footprints, commutation helpers)" (`kernel/ARCHITECTURE-SPEC.md:119,121`).
  - Typed views and deltas move the footprints into the executable hook types. The TypeScript transcription, paired module by module, would have to carry them too. So this design restates both promises, which waits for the owner (OD10).
  - **The alternative the architecture names (KD2′):** footprints declared in `Laws.Hooks` beside unchanged whole-state hooks, with one soundness lemma per hook ("reads only its footprint, writes only its footprint").
    - It keeps both promises and leaves the TypeScript kernel untouched.
    - It was rejected earlier on P6R's O3 estimate, 40–80 h, which was never measured. The narrower frame lemmas T4b proved on the current kernel took about 0.6 min per hook.
    - Spike T4c measures a full footprint-soundness lemma for three real hooks.
  - **Recommendation, after double-checking both sides:** KD2′ keeps the architecture and needs no owner decision, so it is the default. Typed KD2 is recommended to the owner only if T4c measures KD2′'s lemmas at more than twice KD2's typed cost over the 53 units. Either way the regions above (per name, name-indexed, enumerating) are the same.
  - **T4c's measurement (root-recompiled, 2026-11-17):** three real hooks (`outflow`, `writeOutputs`, the User Task branch of `arriveActivity`) got full footprint-soundness lemmas at about 3.7 min and 296 lines each. Over 53 units that is about 3.2 h raw and 15,700 lines, against typed KD2's 1.7–1.8 h and 5,400 lines: **1.8× in time and 2.9× in lines**. The three hooks are among the simplest, so this is a lower bound. Upkeep: 2 of 3 hook changes broke a footprint lemma, at about 0.5 min each, and a behavior-neutral helper extraction also broke an existing law (`Laws/Flow.lean:518`), the unfold coupling of the architecture's cause 2. Typed KD2 has no such upkeep.
  - **Decision: KD2′ stays the default**, because the criterion fixed beforehand was cost, and time is 1.8×, under 2×. OD10 carries the line and upkeep figures to the owner, who may still choose typed KD2.
  - **KD2′ needs one restructuring first** (T4c finding 1, root-verified): five scope-chain readers recurse with fuel `scopes.length` (`Kernel/State.lean:336,493,512,525,538`), so every variable footprint reads the scope count and overlaps every hook that adds or removes a scope. They become structurally recursive over the parent chain, a behavior-neutral change that is not proof-motivated code in the architecture's sense (no footprint or commutation helper enters the kernel).

**KD3. The closure is a set of units (C4; T4, T7).**
- `settle`'s fixed phase loop (`Kernel/Step.lean:352`) becomes a choice among enabled units: token arrivals, raised signals, idle-scope checks, re-offers and finishes.
- Only an order that BPMN or a register entry fixes stays a priority. #120, signals before tokens, is classified in the register before KD3 is coded.
- **Measured by spike T7T8** (a TypeScript copy of `settle` as a choice among units, swept over 1,914 retained cases with 4–8 random seeds; root read each cited line):
  - **The unit for raised signals is the batch one micro-step queues, run in queue order.** Letting single signals run in any order changes 448 cases, mostly as `queued-work-*-gone`, because the kernel relies on each queued write running while its target stands (`packages/kernel/src/step/stale.ts:38-46`). With batches as units, every other free choice changes 0 of the 195 standards-profile cases.
  - **Idle-scope completion, the finish and re-offers are enabledness conditions that read other queues.** `busyScopes` ignores `state.signals` (`Kernel/State.lean:340-342`); only the fixed phase order keeps them from running early. Enabling them freely changes 813, 149 and 4 cases. An idle check gated by queued work that names the scope, its owner occurrence or a Raise origin leaves 23 (7 standards-profile, all compensation), so its footprint includes those queue entries and the compensation run (E1). That gate is a measured hypothesis, not a proof.
  - **#120:** no standards-profile scenario needs signals before tokens. Under the CIB profiles, retained evidence fixes the current order in all 4 scenarios it changes (CIB-OP-0016, CIB-LIM-0055), which is the basis for the register entry. Under `declarationDepthFirst`, 12 CIB-profile scenarios depend on the order; 8 have evidence, and all 8 agree with today's order.
  - **Settle-agreement takes a layered form:** L0 holds signal batches, tokens and the gated idle checks, under the generic diamond; L1 holds re-offers, enabled only when L0 is empty, with its own argument (run L0 to quiescence, then the Inclusive join's count-based confluence); L2 is the finish, enabled only when nothing else is. No standards-profile scenario exercises L1's order, so its argument is untested by evidence.
- The schedule input picks among units of equal priority. `orderInvariant` admits any pick; `declarationDepthFirst` fixes it.
- One generic diamond lemma covers units with disjoint footprints (proved in T4a). Overlapping footprints are refused by admission (`Apart`), or belong to one of the 12 units T4a listed, each with its own confluence argument:
  - **E1, a slot shared by siblings:** the Parallel and Inclusive joins (`arriveGateway`), Multi-Instance completion (`instanceCompleted`), and the compensation run (`compensate`, `handlerCompleted`, `handlerEnded`, `failCompensation`). Each gets one confluence lemma per mechanism.
  - **E2, reads of a whole scope occurrence:** the Inclusive join's `positions`, `completeIdleScope`, `reoffer?`. These read through the enumerating view.
  - **E3, instance-wide indexes:** Signal receivers (`arriveThrow`), Conditional items (`written`), catchers on the ancestor chain (`raise`), `endInstance`. These use name-indexed regions, so `Apart` plus the diamond apply.
- **The Inclusive join** is confluent once its readiness is stated over counts, not identities, provided every position-creating mechanism stays inside `Reach` (T4a F6, proved in a count model, with `spawn_breaks` as the counterexample). Under `inclusiveJoinReach = outgoingOnly` it is not confluent, because a boundary token outside the reach fires the join a second time. Only the CIB profiles select `outgoingOnly`, and they schedule by `declarationDepthFirst`. The standards profile reads `withBoundaries` ([FLOW-SEMANTICS-SPEC](kernel/semantics/FLOW-SEMANTICS-SPEC.md)). So P6 takes `orderInvariant ⇒ withBoundaries` as a premise, and a catalog guard checks it for every profile.
- **Joins: two choices are order-dependent today** (`Kernel/Feature/Flow.lean:180-206`).
  - **Which arrivals a join consumes.** The first parked on each flow is consumed. This stays as it is, in every profile. Re-checked 2026-11-17: changing it to the least key would change, under the CIB profiles too, which excess arrival publicly ends, and so break retained evidence. It would also gain nothing, because the residue differs between schedules either way (T4a F3).
  - **The internal key of the continuation.** It is derived from the arriving occurrence, which fires. It becomes (scope key, join element, the join's firing ordinal in that scope occurrence). The number of firings depends only on the multiset of arrivals, so the key is the same in every schedule. A key derived from the consumed set would not be: with excess arrivals, the consumed set itself differs between schedules (T4a F3), and every downstream key would inherit the difference. Then the only difference left is which excess arrival stays parked.
  - **Readers of a parked arrival's identity (root grep of `slots.parked`, 2026-11-17):**
    - the join itself (`Feature/Flow.lean:180-206`);
    - `Step.reoffer?`, which walks parked arrivals in parking order and offers each join its most recently parked occurrence (`Step.lean:328-344`). That choice is order-dependent too.
    - The other readers see only flow and scope: `positions` and `filled` (`Flow.lean:169,178`) and scope removal (`State/Slots.lean:128-133`).
  - `reoffer?` also stays as it is. The state keeps each parked arrival's parking order, a schedule-dependent datum that only the join and `reoffer?` read. The difference between two schedules is then a permutation of the parked entries in one join slot. That permutation is absorbed by the join's confluence lemma and by `reoffer?`'s own unit, with no behavior change in any profile.
  - **Unchanged: the public choice.** The arriving occurrence still completes with the flows and the others with none, as CIB continues the arriving execution. Between schedules this differs only within the activation bijection KD5 allows.
  - Spike T4c checks that this suffices without equivariance proofs downstream. If it does not, the public choice changes only with a register entry, and the change per profile is disclosed here.
- **Premise:** C4 was measured by P6R, and #120 and #75 are open closure-order findings (K8).
- **Scope check:** `CLAUDE.md` requires that scheduler choices stay explicit inputs, and the conformance target fixes no token order. Rejected option E, a canonical schedule for the standards profile, stays rejected.

**KD4. One declarative walk for admission and runtime (C6, K2; T4).**
- The existing `Laws.Flow.Reaches` (`Kernel/Laws/Flow/Walk.lean`) becomes the only account of what a closure can reach. It is already an inductive relation over the IL covering all 9 queuing mechanisms (T4b D1). What was missing was a proof that admission establishes it, and runtime provenance.
- **Admission's concurrency check is an untrusted search whose answer a proved checker accepts** (T4b D2). Admission's existing `closureWalk` stays as the search, unproved. The checker is proved sound by induction on `Reaches` against a membership and closure check, with no fuel or termination argument: fuel exhaustion yields a set that fails the check, so admission refuses. That also neutralizes the fail-open fuel functions in `Admission/Flow/Closure.lean` (`ancestors`, `reaches`, `catchers`, `declaredIn`, `closureWalk.go`) and `Admission/Flow/Concurrency.lean` (`removesElement`), which T4b listed. T4b proved this shape for Parallel, Exclusive and Inclusive splits, Scope entry against a Conditional Event Sub-Process with the removal part of `Interferes`, the `Follows` exclusion, and the #162 widening on the admission side.
- **The search and the law must state the same relation.** When they drift apart, the result is silent over-refusal, never unsoundness. A corpus guard checks that the checker never rejects the search's answer on an admitted model (T4b R4).
- **Where the checker's soundness lives (T4b U3, U6; root check against the [module table](kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape) and guards 1, 5 and 6).**
  - The proof has to see admission's bodies and case on the kinds admission reads: gateway, trigger and scope kind.
  - **No module may do both under today's rules:**
    - an `Admission.<F>` module may match but holds no theorems (guard 6) and imports only `IL.Types`;
    - a `Laws.<F>` module may `import all` only its own `Feature.<F>`;
    - `Proofs` may neither `import all` nor match.
  - The earlier text, "soundness lives in `Proofs.Admission`", broke those rules and is withdrawn. So is a first fix, Bool twins exported by each feature, because admission cannot import features.
  - **Design:** add a `Laws.Admission.<F>` layer. It may `import all` its own `Admission.<F>` and match the types that `Admission.<F>` may already match. This gives admission's bodies their own `Laws` module, as every other executable body has.
  - **Why it is flagged:** it adds a row to the module table and to the dispatch-owner table. That is an extension in the rules' own pattern, not an exemption, but it changes the architecture text. The cold review judges whether that restates a promise. If it does, it waits for the owner, together with KD4's proof work, which it blocks.
- **Call recursion** (`Catcher.outward`, `Removes.called`, `RaisesError.call`) needs its own account in the checker. The spike refused called processes under a removal, which is sound but not shippable (T4b U4).
- The runtime side is a provenance invariant: every enabled unit is `Reaches`-reachable from its closure's origin. T4b proved the one-step half, that each Parallel and Inclusive hook emits only `Reaches` successors (`parallel_emits_walk_successors`, `arriveInclusive_queues`), and the `Step.complete` glue. The invariant across `Step.settle` needs an origin per queued unit, ghost or real, and is the dominant unmeasured part of T4 (spike T4c).
- This merges the two separate readings that produced #162, #187, #188 and the raw-flag class.
- **Law correction:** `Laws.Flow.Interrupts` (`Kernel/Laws/Flow/Walk.lean:129-130`) binds the declared interrupting flag directly, while admission and runtime read it through `startInterrupts` (`Admission/Subscriptions.lean:363`, `Registry.lean:85`), which exempts a Compensation start (BPMN 2.0.2 Table 10.87). The law therefore removes a parent's interior for a Compensation Event Sub-Process declared interrupting, and admission does not, so the soundness proof would fail there (T4b D3; read in code, no witness model built). `Interrupts` is restated through the same accessor, in the lane review, as P5's statement corrections were.
- **#162 widened:** a synchronizing Parallel join ends a branch walk. The admission side was proved in under a minute (T4b O5). The runtime side needs `Concurrent` to pair the join's continuation with an enclosing split, and tokens after the join to trace back to it; that is part of T4c's invariant.
- The [module table](kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape) changes: `Laws.Flow` may state `Reaches` over IL queries, and it still never names the admission evaluator. The checker's soundness lives in the `Laws.Admission.<F>` layer, as set out below.
- **Premise:** `PLAN.md:97` excludes admission ⇒ premises, and `Concurrent` has 10 constructors over 9 mechanisms.
- **Rejected:** keeping two walks and proving their agreement after the fact. That is P6R's O4, estimated at 80–120 h.

**KD5. Statement (K11; T4).**
- `SchedulesAgree` keeps its current form (`Kernel/Proofs/Concurrency.lean:146`): two schedules that both settle commit results alike up to a bijection of the identities and activations issued from that state on. Parked joins and scope order are included. This closes the gap that the strong `Sim` closes in K11.
- Under KD1, the bijection is the identity except in two places, both found by T4a:
  - **Activations of one element begun in one closure.** They swap with begin order (T4a F4), as public numbering keeps CIB's begin order.
  - **Excess arrivals parked on one flow.** Three arrivals at a two-way join, two on one flow, leave a different one parked depending on the schedule, and no canonical choice repairs that, because at the firing only one of the two has arrived (T4a F3, `excess_leftover_differs`). Excess arrivals are admitted (`Laws/Flow.lean:89`).
- **Rejected:** numbering activations in canonical key order at commit under `orderInvariant` (T4a F4's proposal). That would make every equality exact, but it is a new public-identity rule for the standards profile, a choice of observation boundary, and the statement does not need it.
- **Premises:**
  - both schedules settle, since two failing units report a schedule-dependent failure (T4a F9);
  - `orderInvariant ⇒ withBoundaries` (KD3), stated in the theorem, because `options` is free IL data. Today every catalog profile meets it: `bpmn-2.0.2` selects neither CIB-INT-0020 nor CIB-OP-0016, and both CIB profiles select both (`profiles/*/profile.json`, `kernel-reader/wire.ts:150-151`);
  - `Apart`, as today.

**KD8. Commutation without a pairwise proof estate (T42; found 2026-11-17 by a commutation hunt on the owner's hint).**
- **The history this guards against.** The architecture's cause 2 of the slowdown was "proof estate shaped per variant and per pair; … commutation stacks copied per wait kind; … September's output went into pairwise proofs" (`kernel/ARCHITECTURE-SPEC.md:16`): about 78,000 lines, and 100 commutation commits between August and November (`git log --grep=commut`).
- **Finding 1: the closure-bound outcome depends on the schedule.**
  - `Step.settle` charges each micro-step the size of the whole state (`work < state.entryCount`, `Kernel/Step.lean:355`). `entryCount` is the sum of tokens, occurrences, open items, scopes and signals (`Kernel/State.lean:351`).
  - Intermediate sizes depend on the order. So under `orderInvariant`, one schedule can answer `unsupported "closure-bound"` while another commits.
  - That breaks the promise that "every state with several enabled internal steps is order-invariant, … or refused alike" (`kernel/ENGINEERING-POLICY.md:36`). Every unit reading this global counter would also overlap every other unit's footprint.
  - **Design:** charge each micro-step the entries it creates, not the size of the whole state. The quantity the bound exists to cap, a burst that grows its state with every step (CIB-LIM-0016), is still capped. Under the diamond, each unit's created entries depend only on its own reads, so the total and the micro-step count are the same in every schedule. One measure serves every profile, with no profile switch.
  - **Consequence:** CIB-LIM-0016's twin witnesses `automatic-loop-waiting-branch-at-work-bound` and `…-beyond-work-bound` are placed again for the new measure. Their kernel answers are regenerated; CIB's retained answers are unchanged.
  - **Rejected:** keeping the measure and excluding `closure-bound` from the order-invariance claim. That restates a promise, which is the owner's decision, and it weakens the claim where a schedule-independent measure exists.
- **Finding 2: P6's statement is weaker than the promise.**
  - `SchedulesAgree` assumes that both schedules settle (`Kernel/Proofs/Concurrency.lean:146`). So "one order commits, another fails or hits the bound" is outside it, while the engineering policy and the coverage target ("that the admitted standards surface is order-invariant") claim more.
  - **Design:** the statement adds settle-agreement: if one schedule settles within the bounds, every schedule does, and they agree.
  - The added proof is generic: the diamond extended to failing units (a unit that fails on a state fails alike after an independent unit, since its reads are unchanged), and the invariance of micro-step count and created entries from finding 1. This strengthens a lane statement to match its promise, so it needs no owner decision.
- **Finding 3: pairing is per mechanism, and pairs nest.**
  - P6 needs a provenance-pairing lemma: two items queued together at a reachable closure state lie in distinct units of one `Concurrent` case (`Kernel/Laws/Flow/Concurrent.lean:411-415`). There are 10 cases over 9 mechanisms, and real pairs compose them, as a split inside a parallel Multi-Instance instance inside an entered scope does.
  - **Design (corrected by spike T4d, root-recompiled):** the pairing comes from a **ghost provenance key**, a proof-only key carried beside the state in the proof layer, never in `Kernel.State` or the TypeScript kernel. KD1's real keys cannot serve: KD3's join continuation key (scope key, join, ordinal) loses the segment that decides a pair against a third branch of the same split (`canonical_unlocated`, while the pair is still a `Concurrent .split` pair, `canonical_still_pairs`), and a resumed item's compacted real key holds none of its thrower's history (`real_key_unlocated`, `real_key_still_pairs`; the law's walk follows the Signal, `Kernel/Laws/Flow/Walk.lean:365-366`).
    - Every queued item's ghost key hangs under the unit that queued it; a resumption hangs under its thrower. A throw is then an ordinary fan-out (`nested_throw_pairs`), so the earlier split between fan-out and resumption mechanisms, and its last-segment rule, are withdrawn: `last_segment_moves` shows the deciding segment is not the last once a resumed item moves on.
    - The two items' longest common ghost-key prefix names their nearest common fan-out. `nested_pairing` proves this for a split inside a parallel Multi-Instance instance inside an entered scope, with four generic lemmas that name no mechanism and one lemma per mechanism; no step named two mechanisms.
    - Units whose real key is not under their emitter (the Parallel and Inclusive join continuations, `reoffer?`, idle-scope completion, Multi-Instance completion, Call return; about 5) take one ghost re-rooting rule each (`ghostStep_inv`, measured once at 1.3 min).
    - The ghost is either carried by a proof-layer step with an erasure lemma to the real `Step`, or derived from the micro-step derivation of the closure relation with no second step function. The second avoids duplicating `Step`'s case analysis, which the one-dispatch-owner guardrail resists, so it is preferred if it costs no more. **Unmeasured**; spike T4e measures both.
  - The bridge from `Apart` to the diamond is one lemma per `Account` field (footprint, begins, completes, withdraws, resumes, compensates, exposed), never per mechanism or pair.
  - **Guard (KD7):** a Lean environment scan fails on a theorem whose statement names two distinct `QueuingMechanism` constructors or two distinct wait kinds. This catches a pairwise estate structurally, before it grows.
- **Measured by spike T4d (23.5 min, 883 lines, root-recompiled; raw model rates):**
  - Finding 1 is reproduced on the real kernel: a Parallel split under `orderInvariant` with its two flows declared in either order needs a work bound of 17 in one schedule and 18 in the other, so at 17 one commits and the other answers `closure-bound`. The created-entries total is schedule-independent in the model (`settle_agree`), provided each unit's charge is a function of its own view.
  - Finding 2 is generic: `diamond_fail` and `settle_agree` (if one schedule settles, every complete schedule settles to the same state in the same number of micro-steps; none fails), with `partial_extends` for the bounds. The premise needs more than independence: neither unit writes where the other is enabled (`Apart'`).
  - Finding 3: the generic pairing core is about 5 min once; each mechanism's pairing lemma 1–2.5 min, so 9–10 mechanisms cost 10–23 min raw. The `Apart`-to-diamond bridge per `Account` field (7) and the ghost-erasure lemma are **unmeasured** (T4e).
  - **Not represented, and costlier:** the real `Concurrent` premises (paths and wakes, the three instance variants, armed, write and run pairs), the walk's stopping at awaited stimuli and its ascent, and **closure priorities and removal units**, which make enabledness depend on other queues and break the diamond's premise that a unit stays enabled. Spike T7T8 confirmed the layered form (KD3): three layers, with the generic diamond inside L0 and separate arguments for re-offers and the finish, which are **unmeasured**.
- The lane statements of P2–P5 and P7 carry over.
- Their body lemmas about `State`, `Step` and `Hooks`, about 27,000 lines, are re-proved against the view and delta operations. Spike T5 measures the rate.
- The eight witness-only law families (K10) are proved in the same pass against the registered hooks. **Spike T7T8 proved `Laws.Correlation`** against the registered hooks (root-recompiled: no `sorry`, standard axioms only) in about 13 min and 364 lines, about 1 min and 28 lines per rule definition. Two of its 13 rules (`StartInstallsOnly`) speak about the state a start produces and need the whole start path, which is unmeasured.
  - The census that reproduces "witness-only" is "rule names no Proofs file names": `Correlation`, `Decision`, `Population.Timers`, `Subscriptions.Timers` and `Subscriptions.Rules` have none proved; `Flow.Walk` is KD4's checker (priced by T4b and T4c); `MultiInstance.Entering` and `Propagation.Rules` are partly proved; `Flow.Sources` is not witness-only (14 of 15 rules appear in Proofs).
  - The pure-function families (22 rules) project to about 25–35 min raw. `Subscriptions.Rules` (closure and population order) and the partly proved remainders are **unmeasured**.
  - `Accepts` holds only if instance data is kept once per instance root, which `WellFormed` does not state (`Kernel/Laws/State/Invariant.lean:425-447`); the invariant gains that field. Two notions of instance root exist (`Laws/Correlation.lean:32-39`, `Laws/State/Chain.lean:29-31`) and are merged.

**KD7. Guards for the promises the first rewrite broke (T4, T10).**
- **Nested inductives:** an environment scan fails on any nested or mutual inductive in IL or state types. `State/Slots.lean:71` is rewritten flat.
- **`Value` and `JVal` become guarded types** (spike T2): a catch-all over them hid two semantic sites a new arm should have forced. `Feature/Correlation.lean:34` (`_, _ => false`) would make a Double criterion never match, and the Multi-Instance count fallthrough would read a Double as `notANumber`, where CIB takes `intValue`. The existing rule, no catch-all over a guarded type, then applies to them.
- **Footprints:**
  - Under KD2′: a scan fails on a registered transition hook, callback or `Ctx` state reader that has no footprint declaration and soundness theorem in its `Laws` module.
  - Under typed KD2: a type-level scan fails on a `Hooks` field, a callback sub-record field or a `Ctx` field whose type mentions `State`.
  - Either way, `Ctx.scopeRole` (`Hooks.lean:209`) is in scope, which a scan of `Hooks` fields alone would miss (T4a F10).
- **Raw flags:** only `eventStart` and `eventSubProcess?` may bind the IL's interrupting flag, in `Laws` as well as in admission and runtime (T4b D3).
- **Profile premise:** every catalog profile with `orderInvariant` selects `inclusiveJoinReach = withBoundaries` (KD3).
- **Search and checker:** the corpus guard of KD4.
- **No pairwise proof estate:** a theorem whose statement names two distinct `QueuingMechanism` constructors or two distinct wait kinds fails the environment scan (KD8).
- **Queuing sites:** the queuing mechanisms are one data list (P1 census, 22 sites), and a scan fails on a queuing site outside it.
- **Hook defaults (re-checked 2026-11-17).**
  - **The code today** (`Kernel/Hooks.lean:333-445`, `Kernel/Registry.lean:36-85`):
    - the 34 transition and input hooks default to refusal, and the registry fills every one;
    - the notifications `cancelled` and `written` default to a no-op. The registry leaves `cancelled` unfilled, so its no-op runs in production;
    - the queries default to what an absent feature answers (`catches` none, `eventStart` none, `competes` false, `startsFired` empty, `evaluate` a failure), and `select`, `correlates` and `delivered` fail with an invariant error.
  - **The architecture's wording**, "each field with a no-op default", therefore matches neither the code nor its intent.
  - **Recommended restatement:** transition hooks default to refusal; notifications default to a no-op; queries default to the absent feature's answer.
  - **Guard:** a scan that `Registry.hooks` fills every transition and input field, so a refusal default never runs in production.
  - This is OD2 (1) and awaits the owner.

### Admission and breadth: T1, T2, T9, T20

**AD1. A profile-selected inert tier (T1).**
- The reader classifies every extension attribute and element as exactly one of three things:
  - **consumed:** read into the IL;
  - **inert:** retained in exact source evidence and published nowhere, or published as passive metadata;
  - **refused:** with a code.
- The inert list is profile data, with one register entry per item. Each entry states why the item has no effect at the observation boundary.
- **Shape (spike T1b, root-verified):**
  - The reader "never branches on a profile" (`kernel-reader/index.ts:1-5`). One typed IL field per inert item would therefore mean a `kernel-shape` commit, about 110 regenerated fixtures and every hand-written program literal, for each item.
  - **Design:** the IL carries one generic list of retained extension attributes, each with its expanded name, element type and value. Admission holds a per-name table selected by the profile, which decides inert or refused.
  - The list holds only items whose register entry classifies them as without effect at the observation boundary. Anything with meaning stays a typed IL field (AD3). So the list is not the generic pass-through the forward-compatible rule forbids.
  - Entries are per element type: CIB ignores `historyTimeToLive` on a Sub-Process.
  - A pre-existing defect is fixed with it: the overlay reader drops `inertAttributes[].elementType` (`bpmn-source/src/kernel-reader/source.ts`).
- **An inert item can still have a value check.** CIB fails a deployment whose `historyTimeToLive` is neither `P<n>D` nor a non-negative integer (`ParseUtil.java:37` in the pinned source, found by T1b and re-checked by the root). So its entry carries the exact spelling, the value check with a refusal code, and the consequence: it drives only CIB's history cleanup.
- That is exactly what [INTERCHANGE-ADMISSION-SPEC](INTERCHANGE-ADMISSION-SPEC.md) line 93 requires before it lifts its explicit refusal: "a separate classified requirement selects its exact source spelling, value, and consequence". The spec's line is amended in the same commit.
- **Premise:** the reader refuses every unconsumed extension (`bpmn-source/src/kernel-reader/model.ts:352,361`, `requireCarried`), and 50 of the 55 CIB examples carry `historyTimeToLive`.
- **Scope check:** "Camunda/CIB extension syntax is admitted only through exact profile-selected BPMN contexts" (`PROJECT-DESIGN.md`, CIB compatibility).
- **Rejected:** ignoring the whole `camunda:` namespace. That would silently drop meaning such as `asyncBefore` or `failedJobRetryTimeCycle`.

**AD2. Admission reports every refusal (T1).**
- Admission returns every refusal, each with its element identity, instead of the first one.
- The checks that today carry `element: null` (`kernel/src/admission-registry.ts:643-659`) name their element, or name the definition when the check is model-wide.
- The checks run in dependency order, references and membership first. A check whose prerequisite refused is skipped and reported as not run. It never runs on a program that lacks the guarantee it relies on.
- The public result `diagnostics: readonly [EngineDiagnostic]` (`engine-api/src/definition.ts:63`) becomes a non-empty list. It is replaced atomically with every producer and consumer, under the pre-release rule.
- **Premise:** one diagnostic per compile (`engine-api/src/definition.ts:63-67`).
- **Scope check:** "report acceptance or rejection with the offending element identity and reason" ([platform proposal](BPM-PLATFORM-PROPOSAL.md#deployment-and-definitions)), and M1's exit gate.
- **Rejected:** an engine-API loop that strips each refusal and recompiles. It masks dependent refusals and multiplies compile time.

**AD3. Breadth items are coverage rows with their IL fields present (T1, T20).**
- The items that third-party models hit become rows of the coverage target. The [compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) already places them in scope:
  - form metadata, assignees, candidates and dates, with Task-field expressions at the JUEL Task-fields level;
  - Call binding, version and business key;
  - Multi-Instance extensions;
  - retry-cycle extensions, selected per profile.
- Form metadata includes the start form: CIB reads `formKey` and `formData` only on the process's initial Start Event (`BpmnParse.java:1050-1075`), the reader refuses both on every Start Event, and 14 and 2 of the 109 models carry them there (root count, 2026-11-17). Product 2's start form renders them as OD6 renders a User Task's.
- Their missing IL fields (E12: initiator, retry cycle, structured parameters, `formRef`, `exclusive`, `Subscription.outputs.itemRef` from #114) enter in one shape commit, per the forward-compatible rule.
- The JUEL levels the architecture promised and never delivered, Task fields (M3) and Events (M6), are delivered as rows, not restated.
- **Premise:** the K4, E1 and P1 inventories. Spike T1a measures the full barrier distribution beyond the first diagnostic.
- **Rejected:** admitting these fields through a generic pass-through, which the forward-compatible rule forbids.

**AD4. The value domain widens inside the ceiling (T2).**
- `Value` gains Double, negative Integer and Date.
  - **Double** is IEEE binary64, carried as its bit pattern so that equality stays lawful, and computed through the platform double in both kernels.
  - **Negative Integer** is a domain widening, not a new arm. `Value.int` is already `Int` (`Expression.lean:19`), but the domain is `0..9007199254740991` and the wire grammar is unsigned, `0|[1-9][0-9]*` ([DATA-SEMANTICS-SPEC](kernel/semantics/DATA-SEMANTICS-SPEC.md) lines 14 and 16). Both widen to the symmetric range, and the codecs follow. `Decimal` already carries a signed coefficient.
  - **Date** is an instant in epoch milliseconds, as CIB's `java.util.Date` holds it.
- EL coercion follows the EL specification, and the pinned `cibseven-juel` stays the oracle.
- The size bounds (1,024 B strings, 32 members per container, 256 nodes, 16 KiB) stay until the owner decides OD3, the recommendation to raise them within Temporal's payload limits to the values spike T26 measures.
- **Premise:** `Value` has no Double or Date (`Kernel/IL/Types/Expression.lean:17-25`). Division and float literals are refused (`Kernel/Admission/Data.lean:100,130`), and CIB's invoice example uses `typeRef="double"`.
- **Scope check:** the Core JUEL level is "EL coercion over the portable value domain" ([architecture](kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step)), and Double is within CIB7's breadth.
- **Rejected:** Lean `Float` as the stored representation. Its `BEq` is IEEE equality (NaN differs from itself), which breaks lawful equality of `Value`.
- **Measured by spike T2** (about 70 working minutes; root compared its division result with the retained CIB evidence):
  - Double end to end in both kernels: a `Value` arm with the wire form `{"kind":"double","bits":"<16 hex>"}`, codecs, schema, JUEL coercions and arithmetic, float literals, and Decimal division. Lean and TypeScript agree byte for byte, and the retained `juel-core-forms/division` scenario now commits with CIB's values (4.0, 3.5, 2.5, 2.5).
  - Java's `Double.toString` and a correctly rounded `Double.valueOf` are computed exactly over integers, matching JDK 21 on 45,059 cases in both kernels. Neither Lean's `Float.ofScientific` nor JavaScript's `String` reproduces Java.
  - **Rate:** one new arm costs about 30 min in both kernels (14 forced `Value` sites and 10 `JVal` sites per language, 5 proof sites). It also makes 11 guards fail and changes the meaning of 7 tests. AD4 is a `kernel-shape` commit of 13 modules, so it is root work.
  - **Projection:** the AD4 core about 1.5 h, measured. The ripple (guards, tests, 8 non-kernel TypeScript files carrying the Decimal kind, the oracle runner's value projection, register and hosted evidence) is **unmeasured**; T2's 15–30 h for it is a guess at 10–15 min per unit, not a measurement.
  - Still open in Double: `%`, hex, NaN, Infinity and suffixed number text, a Multi-Instance count from a Double, and DMN `typeRef="double"` (a new `TypeRef` arm, so an IL shape change). Negative Integer (about 10 sites, plus the non-negative wire parser read by 11 files) and Date were not prototyped.
- **Design consequences (T2):**
  - **NaN:** results are canonicalized to `0x7ff8000000000000`, because x86-64 and ARM64 produce different NaNs and Java's `Double.equals` canonicalizes. `0.0 == -0.0` is false in JUEL (`BooleanOperations.java:148-149`), which bit equality reproduces. `NaN <= 1` is true in Java (`:116-134`), which the existing `relational` reproduces when an unordered pair reads as equal.
  - **Placement:** Double numerics serve JUEL, Decision, Multi-Instance and Correlation, and features never import each other, so they live at the `IL/Types/Lexical` level.
  - **JVM version:** `Double.toString` differs between JDK 17 and JDK 21 on 0.31% of doubles. The oracle runs JDK 21 (`verify.yml:283`), and the profile does not record the JVM, so the profile's environment gains a JVM item and a register entry.
  - **Proof risk:** Lean's `Float` is opaque, so a law cannot state a Double result. The proof tax is low today only because JUEL has no laws (a KD6 scope risk).

**AD5. Every runtime `unsupported` code is classified (T9).**
- Guard 20 already pairs each runtime `unsupported` code with an admission refusal, or marks it dynamic-only.
- The design adds an inventory of the dynamic-only codes, each classified as either:
  - a **capacity restriction**, a host bound with a stable code, which is legitimate; or
  - a **semantic gap**, which becomes a row or an admission refusal.
- **Premise:** 66 distinct runtime codes (root grep of the executable Lean files). Spike T9 measures the inventory.

**AD6. The reader classifies every element and property it is given, recursively (T43, T44).**
- Every element reachable from `definitions` and every own property of it (standard attribute, standard child, extension attribute, extension element) is exactly one of consumed, inert or refused, as AD1 already requires for extensions. Refused is the default.
- The classification of standard properties is one table keyed by element type and property, checked for completeness against the parser's metamodel (`bpmn-2.0.2-schema-table.json`, 135 types). A container is inert only when its whole descendant set is, which is D2's rule from the [preserve-only specification](PRESERVE-ONLY-ADMISSION-SPEC.md), reinstated rather than reinvented.
- **Extension content keeps the existing dynamic tracker** (spike T43): consumption can depend on the referrer, as `camunda:errorMessage` is carried for a thrown Error and not for a caught one, which a static (type, property) row cannot express. The table adds only inert foreign names. What changes is the reach: a containment walk from `definitions` applies the tracker to every element, replacing `requireAllCarried`'s hand-named owner list.
- **Walk mechanics (T43):** `bpmn-moddle` stores reference properties (`processRef`, `sourceRef`, `outgoing`, …) as non-enumerable own properties, so the walk enumerates with `Object.getOwnPropertyNames`; `Object.keys` elsewhere (`moddle-graph.ts:35`, `admission-diagnostics.ts:73`) has the same blind spot. A value equal to a declared default carries no information, which today is recognized for Booleans only (`metamodel-defaults.ts:53`); `startQuantity="1"` would otherwise refuse. Diagram interchange and `Documentation` need rows before the walk is closed.
- **`ioSpecification` on a User Task** is never read by the reader, and CIB parses `ioSpecification` nowhere (no reference in `BpmnParse.java`). Under the standards profile it has meaning, so it is carried to admission through AD1's retained list: refused under `bpmn-2.0.2`, inert under the CIB profiles.
- **`name`** stays inert in the kernel. Whether publication or history carries element names is decided with the history contract (OD7).
- Inert standard content (Lanes, Collaborations, documentation, diagram interchange) needs one register entry each, stating why it has no effect at the observation boundary. Content with CIB meaning, such as resource roles and `bpmn:property` on a User Task, is refused until a coverage row consumes it; CIB-EXT-0011 already defers standard `potentialOwner`.
- The Activiti namespace is resolved as an alias of the Camunda namespace for extension names only, as CIB does, with a register entry. Not in `namespaceOf`, which also resolves `xsd:QName` values and `xsi:type` (`model.ts:287`, `data.ts:75`), where an alias would corrupt a document whose target namespace is the Activiti one (T43).
- **Guards:** a metamodel-completeness test over the table, and a corpus check that no fixture or census model reads with a present property the table does not classify.
- **Rejected:** (1) extending `requireAllCarried`'s owner list, which fixes this instance and misses the next owner kind and every standard child; (2) recording which keys the reader touched through a proxy, because touching a key is not carrying it.
- **Consequence:** models that read today with silently dropped content are refused instead; in the census that is the 2 models with `__targetRef_placeholder`, unless their data-association reading consumes the property.
- **Measured by spike T43** (MEDIUM, about 33 working minutes): an 11-type slice (150 type–property pairs) with the walk, the completeness guard and the alias; the package's 176 existing tests unchanged and green, 36 new. On the 109 models: the walk changed no shipped result (107 are already refused on `camunda:` content); with extension content peeled off, exactly the 2 `__targetRef_placeholder` models are newly refused, as predicted; the alias lets the barrier peel admit 6 more models (71 → 77). Two of the 150 slice rows were wrong and were caught by existing tests or the corpus (`ioSpecification`, `isImmediate`, which 9 models carry). Projection for the remaining 110 types: 1.5–2.5 h raw for the table, a lower bound; the semantic choices per row and about 15 register entries for the inert rows the corpus hits are unmeasured.

**AD7. Admission is closed against BPMN validity and CIB's deployment errors (T45).**
- Every form BPMN 2.0.2 does not define (the event-type tables 10.84 to 10.86, 10.88, 10.89 and 10.90) is refused under every profile with a stable code. Where CIB runs such a form as something else (Error and Terminate intermediate throws as None), the register records CIB's reading as not selected; BPMN stays the authority and CIB is not imitated.
- Every CIB deployment error over a form BPMN does allow is classified in the register and refused under the CIB profiles through a profile option, never through a profile identifier.
- A nested start is an Event Sub-Process start only when its container is one (`triggeredByEvent`); admission reads that, not `header.parent.isSome`.
- **Guard:** the inventory's variant matrix (209 variants, 307 probes) enters the repository as a test of the standing contract "every variant is admitted with a row, or refused with a code", so a form that BPMN or CIB rejects can no longer be admitted silently.
- **Premise:** inventory I1, with the root's re-run of `start.subprocess.message` and `throw.error.divergence`, and the cited BPMN and CIB lines.

### Engine boundary and hosting: T11, T15, T16, T17, T19, T22, T23

**HD1. A public effect contract (T11).**
- A published package carries the following:
  - the effect request and result types;
  - a Worker factory that registers handlers by protocol and operation;
  - the mapping from a handler's business failure, technical failure and retry exhaustion to the kernel's effect outcomes and incidents.
- Effect Activities run on a task queue per handler protocol, separate from the Workflow's own queue.
- **The idempotency key is a digest of the Namespace, the chain's Workflow ID and the effect key** (corrected by spike T11, root-verified, T47). Neither the Activity ID, which the SDK generates because the effect key can exceed Temporal's identifier limit (`workflow-host.ts:471-472`), nor the bare effect key can serve. The effect key names only instance, element, activation and failure count (`host-machine.ts:69-71`), and instance identities are unique only within a population (`population-address.ts:26-28`).
- **Failures a handler can cause are bounded and visible.** A thrown error is retried within a per-handler transport budget, then becomes a technical failure (an incident). A handler's malformed outputs become an `unsupported` outcome instead of failing the Workflow Task. A handler's own non-retryable failure becomes a technical failure. Each needs a register entry. A hung handler or an unreachable Worker is an infrastructure condition, and `CLAUDE.md` keeps those separate from semantic outcomes: it surfaces as a host-visible stall that operators see in Product 2, never as an incident or a technical failure. Only a hosted run verifies the timeout behavior.
- **Deployment checks a Worker exists for every descriptor**, or the platform shows the effect as waiting for a Worker. Today admission accepts any nonempty descriptor (`kernel/src/admission/work.ts:492`), and an effect on a queue nobody polls waits forever.
- **Queues:** every built-in binding uses one protocol (`binding.ts:7,11-15`), so one queue per protocol would put every handler on one queue. The contract lets the adopter map protocols to queues.
- **Two package entries:** an SDK-free root, and `./temporal` for the engine's own host. A guard test with a positive control pins it, since declarations that name the Temporal SDK fail adopters' library checks.
- **Premise:** effect Activities have no `taskQueue` (`temporal-host/src/workflow-host.ts:473,542`), the engine packages are private, and the evaluation Worker is canned (`compose.yaml:74`).
- **Scope check:** "Project-owned effect protocol and handler identifier: in scope" ([compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md)). A JVM Worker is separately approved and stays out.
- **Rejected:** letting adopters fork the private host.
- **Measured by spike T11** (12.3 working minutes): the package with the registry, failure mapping and Worker factory; per-protocol routing in the host; a stand-alone example Worker that type-checks without private packages; 207 of 207 host and package tests pass, and the memory host covers success, business failure, technical failure with incident retry, and a token-registered handler. About 100 lines per minute, the rate T27 measured. Remaining code about 0.6–0.8 h at near-measured rates; documentation, about 5 register entries and about 6 hosted witnesses about 2 h, **unmeasured**. HD1 about 3–4 h raw, without OD1's `expression` and `topic`. No kernel or Lean change.

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
- **Scope check, corrected 2026-11-17:** the bound values stay as ratified, but the consequence column is part of the table the owner approved and ratified on 2026-11-13 ([lifecycle spec](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), lines 104-114). Changing "candidate refused" to "waits" for pending Activities, and segmenting the publication batch, changes that approved contract. Both wait for the owner as OD11. Two parts do not touch the table and need no owner decision: reading the program by digest instead of carrying it, and KD1's bounded keys.
- Spike T17 (item 2) measures the queuing.

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

### Operating Product 2 at scale: T27–T33, T36, T38, T40

**PD6. Change-driven publication and incremental read models (T27, T30, T31, T33).**
- Each process chain keeps its unacknowledged publication batches across Continue-As-New, up to a bounded backlog. The consumer acknowledges by cursor, so a rollover never loses history (T30).
- Each committed input also hands a small change notice, `(instance, revision)`, to a population-level change feed with a cursor. The platform's recovery worker reads the feed and pulls only the instances that changed. This replaces one Query per instance per freshness window (T27).
- Instances the population starts, by Signal, Message or Conditional cascades, enter the feed like any other, so Product 2 registers them (T33).
- **Work, Incidents and Metrics become incremental projections**, never all-or-nothing snapshots.
  - Each instance carries its own freshness.
  - A lost instance (`unknown`) is marked for that instance only. An operator action, "retire instance", removes it after confirmation (T31).
  - Closed instances leave the active set.
- **Premise:**
  - all-or-nothing snapshots behind 100-instance caps (verified, T27);
  - per-Run batch retention (`publication.ts:7-10`);
  - the `unknown` row that blocks every snapshot (`work-service.ts:135-141`).
- **Scope check (re-checked 2026-11-17):**
  - The owner-approved [shared-persistence proposal](BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md) says: "Reopen the ingestion design if measured polling load or lag prevents the declared freshness bound; prefer a revisioned, idempotent change-driven publication" (line 218).
  - What is measured is not load or lag but a failure: past 100 instances the snapshot is unavailable (T27's red test), which also prevents the freshness bound. The condition is met by that failure.
  - The feed's cursor is an engine-side cursor the recovery worker reads. Product 2's API exposes no private lease or cursor, which line 220 would otherwise reopen.
  - Feed and acknowledgement fall under "observe committed canonical state", so no consumption operation is added ([platform proposal](BPM-PLATFORM-PROPOSAL.md#the-engine-boundary)).
  - [HUMAN-WORK-SPEC](BPM-PLATFORM-HUMAN-WORK-SPEC.md) line 27, "Instances started outside Product 2 remain absent", limits the M3 producer set. The settled [platform proposal](BPM-PLATFORM-PROPOSAL.md) promises "Task rows across all instances" (line 80). Revising the spec line therefore follows settled scope; it is not a scope change.
- **Spike T27 findings (root-verified 2026-11-17):**
  - **The continuation has no room to carry batches.** `continuationBytes` (448 KiB) is exactly `programBytes` (192 KiB) plus `stateBytes` (256 KiB) (`temporal-host/src/capacity.ts:26,31,39`). So history survives a rollover in one of two ways:
    - (a) carry unacknowledged batches, which raises a ratified bound;
    - (b) hold the due rollover until the consumer acknowledges, refusing caller inputs meanwhile with a new stable code. That adds a row to the ratified table and ties the instance's liveness to the consumer.
  - Either way the owner decides (OD12). A third option, dropping after a deadline, loses history that `PROJECT-DESIGN.md:92` requires to be complete.
  - **Notices must be ordered by committed-input ordinal, not by publication revision.** An input with an empty journal moves no revision but can change the observation.
  - **Acknowledgement is feed-wide.** So one platform change intake acknowledges only after Work, Incidents and Metrics have all recorded a notice.
  - **Shared mode has the same cap defect:** `population_head <= $2` (`platform/modules/work/src/postgresql-work-snapshot-reader.ts:102`). `population_head` counts every registration ever made.
  - **The memory host keeps a halted chain running, while Temporal ends it.** The memory host therefore cannot witness PD7 until a parity guard exists, which is added with PD7.
  - **Close call, decided:** apply Work policy before the engine read in both modes, so that no engine read reveals a task the caller may not see. [HUMAN-WORK-SPEC](BPM-PLATFORM-HUMAN-WORK-SPEC.md) line 123 does not settle the order.
  - **Close call, decided:** the kernel classifies a stale host arrival with its own flag, a Lean and TypeScript pair. The host does not mirror the kernel's code strings, which would be a mirror enumeration.
- **Rejected:**
  - raising the caps, which keeps N Queries per window;
  - a database shared with the engine, which breaks the dependency direction.

**PD7. A halt suspends the instance visibly; it never ends it (T28, T29, T36, T38).**
- A chain that cannot commit stays open, suspended, with its halt record: the code, the command and the offending arrival.
- Observation reports `suspended`, a host fact, never a semantic outcome. Product 2 lists suspended instances in Operations, with cancel (HD4's general cancellation) and resume. Resume re-offers the arrival once the cause is gone, for example after a bound was raised.
- A host arrival the kernel rejects, such as an effect result outside the value domain, suspends the instance. It is never dropped as stale (T29).
- Under the standards profile, a technical failure of an effect suspends the instance. BPMN defines no incident, so this is host behavior, not BPMN meaning (T38).
- The 128-Run cap is removed (OD3), so age never halts (T36).
- **Premise:**
  - a halt ends the Workflow (`workflow-host.ts:583,641`), and observation reads it as `Closed` (verified);
  - rejected arrivals are dropped (`workflow-host.ts:608-616`).
- **Scope check:** `CLAUDE.md` keeps harness and infrastructure failures separate from semantic outcomes, which suspension preserves.
- **Rejected:** retrying a technical failure without end, which hides a broken handler.

**PD8. Generator-driven differential (T40).**
- A model and schedule generator feeds the existing paired batch path (`lean-paired` into `kernelRun --batch`). It covers sequence, Exclusive, Parallel, Inclusive, scopes, boundaries and Multi-Instance up to small bounds.
- It runs in the fast lane at a fixed seed, and in the hosted lane over a widening seed range.
- Divergences fail the build.
- **Premise:** no generator or fuzzing exists in the repository (hunt F16, root grep).
- **Rejected:** relying on the hand-written corpus. Production runs only the TypeScript kernel.

**PD9. Model-declared Timer-start cycles are activated at deployment (T32, OD5).** Deployment registers one recurring host schedule per root Timer-start cycle. A redeploy supersedes it (CIB-INT-0029). The ingress prunes the ledger by currency (HD2).

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
| Each `Hooks` field has a no-op default | architecture, hooks | — | **broken**: transition and input hooks refuse; the notifications are no-ops; the queries answer as if their feature were absent | restated per field class, with a guard that the registry fills every transition field (KD7); **OD2 (1)**, awaiting the owner |
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
| No proof-motivated TypeScript code | architecture, TypeScript | track review only | review-enforced | **OD2 (2)**, awaiting the owner: move to the review checklist |
| `bpmn-source` refuses only parse, preservation and unknown-element cases; every semantic refusal lives in admission | architecture, TypeScript | — | **broken**: `reader.factNotCarried` decides extension meaning in the reader; and the reader silently drops what it does not carry (T43) | AD1 moves the classification to profile data; guard 12 extended to restrict reader codes; AD6's completeness and corpus guards |
| No code compares a profile identifier | architecture, profiles | guard 7 (kernel and boundary packages) | **broken in the platform**: `human-task-catalog-projection.ts:23` | PD3; guard 7 extended to `platform/` |
| Semantic publication carries element identity, source type and transition role, no IL internals | architecture, contracts | — | **broken**: `owner`, `idle.scope` (P5) | PD2; schema guard |
| Schemas are the wire authority | architecture, contracts | guard 11 | enforced | kept |
| Lean, TypeScript and retained CIB evidence agree on every scenario | architecture, lane | guard 16 | enforced | kept |
| Hosted mechanisms are witnessed: chain handoff, capacity, replay, the population witnesses | architecture, hosting | hosted test suites | enforced | HD2 replaces the ingress witnesses |
| The TypeScript and Temporal solution never depends on a JVM | CLAUDE.md; PROJECT-DESIGN | dependency approval only | policy-enforced | new manifest guard over the engine and platform packages |
| For every registered scenario, the platform's task set equals the engine's open User Tasks | PROJECT-DESIGN (one repository) | — | **missing** | PD4 |
| The engine gate passes with the platform tree absent | milestone ladder, M1 | — | **missing** | PD4 |
| The platform consumes only the engine's published contract and never constructs an occurrence identity | PROJECT-DESIGN; platform proposal | `scripts/platform-product-boundary.test.ts` (10 tests) | enforced; stale `BpmnSemantics` root at `platform-product-boundary.ts:8` | kept; stale root removed |
| Review, definition of done and register-in-commit rules | architecture, review | review receipts | process | **OD2 (3)**, awaiting the owner: move to the engineering policy |

## Calibration (checkpoint 3)

**Ground rules.**
- Each spike ran on a local clone for at most 3 working hours. Heavy jobs went one at a time through a shared lock.
- Working time excludes lock waits and pauses. Every figure comes from the spike's timestamped log, and its report states the method of every count.
- The root re-checked each cited file and line before folding a result in here. Logs and reports are in the session scratchpad under `q/r2/spikes/`.
- **Rates are lower bounds.** They come from one agent on a focused slice. Production work adds the TypeScript pair, scenarios, review and integration, and the factor for that is measured separately (spike T4c, item 2), never assumed.

| Spike | Topic | Built and proved | Working time | Measured rate | Projection (rate × count) | Not represented, unmeasured |
|---|---|---|---|---|---|---|
| T1a (root) | T1 | the barrier distribution of 109 third-party models (54 public Camunda examples, 55 CIB Seven models) by peeling barriers one at a time | about 5 min of tool time | — | coverage 2 → 23 (inert tier) → 53 (plus binding registry) → 69 (plus 16 breadth rows) of 109; 38 stay refused at a terminal barrier, with a mean of 3.1 barriers per model; about 20 substantive breadth items, not 30 | the barriers hidden behind each of the 38 terminal ones |
| T9 (root) | T9 | a census of the 60 `dynamic-only` runtime marks | about 5 min | — | 14 semantic gaps, 17 Java-host fidelity, 3 capacity, 20 caller data, 6 value domain | the cost per semantic gap (spike T9b) |
| T4a | T4, T6 (KD1–KD3, KD5) | the generic diamond (`diamond`, `view_frame`, `apply_comm`); exact commutation under provenance keys for split and implicit merge; the counterexamples `excess_leftover_differs` and `spawn_breaks`; the diamond over `Std.ExtTreeMap`. 972 lines, no `sorry`, axioms only `propext`, `Quot.sound`, `Classical.choice` | 32 min, with 2.5 min of lock wait on top | about 2 min and 35 lines per hook, 27 proved lines per min | 53 units in view/delta form plus the core: about 4.5 h raw | the 12 E-units (T4c, item 2), the lifting through the closure, the key-freshness invariant, the TypeScript pair |
| T4b | T4 (KD4) | the declarative walk over the real IL; checked decision procedures with soundness proofs (`splitApart_sound`, `armApart_sound`, `follows_sound`, the #162 widening); the one-step runtime half for Parallel and Inclusive; `Step.complete` glue with its frame lemmas. 1,381 lines, 54 theorems, no `sorry` | 25 min, with 2 min of lock wait on top | 0.37 min and 25 lines per law constructor or definition; 0.5 min per runtime queuing site; 1.8 min per `Step` operation | 161 law units, 61 runtime sites, 10 `Step` operations: about 2.3 h raw, about 8,000 lines | U1, the origin invariant across `Step.settle` (proxy: the placement lane, 4,226 lines) (T4c, item 1); Call recursion in the checker; the 14 `Reading` bridges |
| T5 | T5 (KD6) | the real `Kernel/Laws/State` subtree, 16 of 17 modules and 6,608 lines, ported to structural identities and compiling with no `sorry` (root re-run 2026-11-17: 0 errors). The KD1 variant ported was the per-scope ordinal, KD1 (i) | 33.6 min, with 3.2 min of lock wait on top | 9,391 lines/h for identity-touching proof lines, 23,752 for the rest; 7.7 `nextIssue` sites/min | the remaining 11,319 + 17,205 proof lines: about 2 h raw; planning figure about 1 agent-day for KD1's proof layer (unmeasured doubling for changed feature bodies) | the executable port of `Step`, features and hooks; the TypeScript pair; lemmas restated for the KD2′ footprints; re-splitting into modules; KD1 (ii)'s different freshness argument |
| T1b | T1 (AD1–AD3) | three breadth items end to end in both kernels: inert `historyTimeToLive` and `isStartableInTasklist` with CIB's value check; `camunda:class` as a handler key; `camunda:assignee="${…}"`. Proof tax 0 lines; the peel corpus went from 2 to 22 of 109 admitted | 43 min, with 2.5 min of lock wait on top | 3–17 min per item | the measured classes (inert, binding, expression level, about 15 items): about 2 h of core time | about 7 items that add state or runtime (`initiator`, async positions, retry cycle, structured parameters, `expression` with `resultVariable`, start-event forms): 7–28 h, unmeasured; one hosted CIB evidence replay per profile change, since all 1,583 evidence files bind the profile's digest (`scripts/contract-artifacts.ts:252`); reviews |
| T27 | T27, T31, T30 (PD6, PD7) | both defects reproduced red and fixed in local mode (Work suite 90/90); engine feed and acknowledgement on the memory host (temporal-host 188/188); `suspended` observation kind in engine-api | 25 min, with 4.2 min of lock wait on top | about 100 changed lines per min | PD6 coding about 100 agent-min, of which shared mode is about 5,000 lines at the measured rate; PD7 about 26 agent-min | the hosted lanes (Temporal, PostgreSQL); contracts, UI and audit; review; the factor from coding time to delivered cost (no multiplier given; T4c measures one for the kernel) |
| T4c | T4, T6 (KD1, KD2′, KD3, KD4) | KD2′ footprint-soundness lemmas for 3 real hooks; the U1 origin invariant for 6 sites (Flow and the plain Task); the Parallel join on an ExtTreeMap model with excess arrivals, `reoffer` and compaction; commit-time numbering (`atCommit_eq_sequential`); the Signal throw as an E3 unit; the thrower check moved to the key on the real kernel. Root rebuilt the kernel imports at HEAD and recompiled all 9 modules: no errors, no `sorry`, standard axioms only | 62 min, 10 s of lock wait | KD2′: about 3.7 min and 296 lines per hook (typed KD2: 2 min and 35 lines); U1: about 2.2 min and 127 lines per site; E1: 12.2 min per unit, ×3.0 T4a's prototype time per unit at an unchanged line rate; KD1 thrower move: 8 min for 2 sites and 13 proof files | KD2′ over 53 units about 3.2 h raw, 1.8× typed time and 2.9× its lines; U1's remaining 55 sites about 2.0 h; 12 E-units about 2.4 h; KD1 public numbering about 1.3 h (rough) | the U1 mechanisms that need freshness invariants (reservations, catchers, Signal, scopes, MI, compensation); the join and Signal are models, not `Kernel.State`; the thrower change is not built across all importers and has no scenario run; the TypeScript pair; the upkeep of existing laws |
| T4d | T42 (KD8), KD1 counters | the nested pairing over ghost provenance keys (`nested_pairing`, `nested_throw_pairs`); the counterexamples to pairing over real keys (`canonical_unlocated`, `real_key_unlocated`, `last_segment_moves`); `diamond_fail`, `settle_agree`, `partial_extends`; the pruned counter map with the restated stale check; the work-bound witness on the real kernel. Root recompiled all 9 modules at kernel HEAD: no `sorry`, standard axioms only | 23.5 min, 10 s of lock wait | pairing core about 5 min once; 1–2.5 min per mechanism; 1.3 min per ghost re-rooting rule; settle-agreement about 2 min once | pairing 15–30 min raw over 9–10 mechanisms and 5 re-rooting units | the ghost-erasure lemma, the 7 `Account` bridges, the ghost issue history, layered settle-agreement under priorities, the real `Concurrent` premises, the production factor (T4c's ×3 applies) |
| T2 | T2, T26 (AD4, OD3) | Double end to end in both kernels, Java's `Double.toString`/`valueOf` exactly, the bounds lifted for measurement, data-volume measurements | about 70 min | about 30 min per new `Value` arm in both kernels; 3 min to lift the Lean bounds | the AD4 core about 1.5 h | the ripple (guards, tests, non-kernel packages, oracle runner, hosted evidence), Negative Integer and Date, `%`, DMN Double, Temporal payload overhead and replay CPU |
| T4e | T4 (KD8, KD1) | queued: the ghost-erasure lemma over the real `Step` for the split and the Parallel join; one `Account` field's bridge from `Apart` to the diamond; the ghost issue history behind `QueueSound` | | | | |
| T43 (MEDIUM) | T43, T44 (AD6) | the containment walk, an 11-type classification table, the completeness guard, the alias, red/green tests (212 pass, `tsc` clean) | about 33 min (lock wait 15.8 min, overlapping) | about 8 min per 150 type–property pairs, after a one-time 8 min | the remaining 110 types about 1.5–2.5 h raw (lower bound) | the semantic choice per row, the register entries for inert rows, DI and `Documentation`, non-Boolean defaults, a witness per consumed row. T45's refusal rules are priced at T1b's breadth rate |
| T7T8 | T7, T8 (KD3, KD6) | the closure as a choice among units in TypeScript, an 11-variant sweep over 1,914 cases; `Laws.Correlation` proved against the registered hooks | about 57 min | sweep about 10–17 s per variant and seed; about 1 min and 28 lines per law rule | the pure-function law families about 25–35 min | the L1 and L2 arguments, `Subscriptions.Rules`, rules stated over a start's result, the Lean kernel under any order but today's |
| T11 | T11 (HD1, OD1) | the public effect package, per-protocol routing, a stand-alone example Worker | 12.3 min, 4.2 min of lock wait | about 100 lines per min | HD1 about 3–4 h raw | queue routing, retries and timeouts on a real server; packaging; OD1 `expression` and `topic` |
| T17, T12 | round 3 | running | | | | |
| T9b, T12, T15, T40, T2b | round 3; T2b measures the ripple of one `Value` arm (guards, tests, packages) | queued | | | | |

**Process calibration from the proof wave (root, from git, 2026-11-17).**
- **Elapsed time.** P1 to P8 ran from P0's closure (`4cc234abf`, 11-14 05:19) to P8's (`bca882990`, 11-16 09:46): 52.5 calendar hours, against budgets totalling 24.5 agent-days.
  - The local lanes closed in 3.7 to 18 hours each, against budgets of 0.5 to 8 days: P1 3.8 h, P2 and P3 together 10.5 h, P4 6.5 h, P5 5.3 h, P8 3.7 h.
  - P6, the one proof that crosses features, stopped after 4.75 h with its theorem open. Its design table had estimated 23–33 agent-days.
- **Lesson for every budget below.** Day budgets were 5–10× too high for local work, and unbounded for a proof that crosses features. So the plan budgets local stages from measured rates, and calibrates each cross-feature proof (P6's KD4, KD5 and KD8) by spike before it gets a budget.
- **Module-shape pressure (causes 3 and 6).** Of the wave's 229 commits, 133 are `feat`, 50 `refactor`, 27 `fix` and 15 `docs` (`git log 4cc234abf..bca882990`). The refactors are mostly module splits forced by the 800-line target and guard 15's five-importer rule. That is about one split for every 2.7 feature commits.
  - Rewrite-2 adds an estimated 15,000 or more proof lines (T4a, T4b), so the plan prices about 20 new modules and their splits at that measured ratio.
  - It places the new `Laws` modules before writing them, instead of splitting under pressure.

**What T4a and T4b already settle.**
- P6R's O4, "soundness of two walks", was priced at 80–120 h. Its measured part comes to about 1 h raw. The remaining cost of T4 sits in two places, U1 and the E-units, and T4c measures both on the real kernel before any budget is set.
- The design changed in five places on spike evidence: KD1 chose provenance keys compacted at commit; KD2 made variable regions per name and added name-indexed and enumerating regions; KD3 listed the 12 units outside the generic diamond; KD4 adopted search plus checker and found a law defect; KD5 kept the current statement form.
- T4a's own projection for KD1–KD3 and KD5 is 11–22 agent-days. Most of that rests on an unmeasured production factor of 5–10, which T4c replaces with a measured one.

## Recommendations awaiting the owner

These items are on the owner's ask list. Each waits for the owner, and implementation covers only work that none of them blocks. For each one, the root checked the premise in code or documents, the framing against the settled scope and `CLAUDE.md`, and the recommendation against the rejected alternative. OD4 and OD9 are not owner items: they only apply `CLAUDE.md`.

| # | Recommendation | Premise checked | Framing checked | Rejected |
|---|---|---|---|---|
| OD1 | **T34: reopen generic Service Task binding as a project handler registry.** `class`, `delegateExpression`, `expression` and external-task `topic` tokens become opaque handler keys. The adopter maps them to handlers through the public effect contract (HD1). There is no Java execution, no field injection and no fetch-and-lock | census T1a: 23 of 109 models deploy with inert metadata alone, and 53 with inert metadata plus a binding map. Today only fixed built-in pairs bind (`kernel-reader/binding.ts:12-14`) | Re-checked 2026-11-17: the [compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) differs by family, and "changing an exact Service Task binding pair" is itself a reopen trigger (line 176). (a) Bean and `delegateExpression` binding is a "future candidate" ("Prefer a project handler registry first", line 62): Product 2 adopters are its consumer, and the recommendation fits its wording. (b) `camunda:class` is deferred until "a real Java-delegate migration consumer" (line 61). A class name used as an opaque key executes no Java, which is a CIB difference to classify in the register, but it is still a reopen. (c) An external-task `topic` is deferred until "an external-worker consumer" (line 73). Pushing it to a handler drops CIB's fetch-and-lock, leases and worker identity, a behavioral difference the register must classify; the alternative is to keep `topic` deferred. Recommendation: (a) and (b) as opaque keys with register entries; (c) only if the owner accepts that difference, otherwise deferred (T1a: 3 of 109 models use `topic`). If the owner agrees, the rows are amended in the implementation commit | keeping all four families deferred: third-party Service Tasks would need hand editing |
| OD2 | **Architecture promises, to restate.** (1) Hook defaults per field class: transition and input hooks refuse, notifications are no-ops, queries give the absent feature's answer, and a guard checks that the registry fills every transition field (KD7). (2) "No proof-motivated TypeScript" moves to the track review's checklist. (3) The review and definition-of-done rules move to the [engineering policy](kernel/ENGINEERING-POLICY.md). (4) Keep "no nested inductive", with one exception: the bounded value tree `Value`. Withdraw that exception, and flatten `Value`, if spike T2 shows that `Value`'s nesting costs proof work. **T2 showed it does not:** no law inducts over `Value`; nesting costs 6 structural mutual theorems (about 200 lines) and 6 measure definitions, and a new leaf arm added 2 cases (11 lines). Flattening would touch every consumer (467 TypeScript lines name a `ValueTag`). So the recommendation stays: keep the exception. `State/Slots.lean` is flattened in every case; that needs no owner decision, since it restores the promise | `Hooks.lean:333-445` and `Registry.lean:36-85`, re-checked 2026-11-17: the registry fills 40 of 41 fields, not `cancelled`; no guard can detect proof-motivated code; `Value` is nested (`Expression.lean:24-25`) | each promise then names its enforcement (promise register) | no-op defaults for transition hooks, which would skip meaning silently when a registry misses one; flattening `Value` without measured need, a non-local change |
| OD3 | **Ratified bounds.** Remove the 128-Run cap. Raise the value and state bounds within Temporal's payload limits; stable refusal codes stay above them. **Spike T2 measured them:** about 182 B of state and 221 B of stimulus per order line, and a 1,000-line order costs 3 ms per step. It proposes 256 KiB strings, 10,000 members, 65,536 nodes, 512 KiB per value, start and effect payloads at Temporal's 512 KB warning, 1 MiB committed state and a 1.5 MiB Continue-As-New argument, below the 2 MB payload error. The bounds are also hard-coded in the schema and the oracle runner. Today's binding limit is the 64 KiB stimulus, about 290 order lines | only `successorRun` reads the Run count (`capacity.ts:170`, `workflow-host.ts:571`). The object the cap bounded, the publication segment directory, was retired on 2026-11-13, but the owner kept the row explicitly ("the 128-Run row stays", [lifecycle spec](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) line 113). No other reader or bounded object was found, so the row now only halts instances by age. Each closed Run's history expires under the namespace retention, so the chain's stored history does not grow with its length | the bounds stay host restrictions with codes, never meaning | keeping a cap that halts long-running instances of old age |
| OD4 | **Hosted measurement spikes are not pushed to branches.** T15 throughput, T27 Query load and T30 rollover behavior stay **unmeasured**. The reason: no Temporal server may run locally, and `CLAUDE.md` Rule 3 keeps one-off code out of the repository. They are measured in the implementation's first hosted lane, by maintained capacity witnesses with stop conditions | `CLAUDE.md` Rule 3 and Verification | a witness that protects a standing capacity contract is not a one-off test | `spike/*` branches, which would breach Rule 3 |
| OD5 | **T32 (scope): Product 2 should activate a deployed definition's Timer-start cycles at deployment**, as CIB does (CIB-INT-0029). The [scheduling spec](BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md)'s exclusion of recurrence would be lifted for model-declared cycles; manual one-shot schedules would stay | an admitted cycle never fires today (`DEFINITION-SCHEDULING-SPEC.md:19`) | it is BPMN meaning the engine already implements; the platform only activates it | leaving admitted models that silently never start |
| OD6 | **T35: add no forms dependency.** Product 2 renders `camunda:formData` and offers a generic variable-entry form. Embedded HTML forms and Camunda Forms (`form-js`) are disclosed as unsupported | 17 of the 19 `formKey` models in the census are `embedded:` HTML, which the adopter's application hosts; 1 uses `camunda-forms:` | an adopter's HTML would run inside the platform, a security surface outside scope | adding `@bpmn-io/form-js` for 1 of 109 models |
| OD7 | **T24: take the five persisted-history approvals at the plan's last gate, before the first release or the first third-party production use, whichever comes first.** Until then, Worker versioning by build identity and the replay-fixture lane are designed, not built. Until then the adopter documentation states that an upgrade replaces state | `PROJECT-DESIGN.md:253-259` requires the approvals "before the first immutable release or persisted production history"; `CLAUDE.md` (pre-release evolution) forbids retained Event History fixtures and deployment fallbacks before an approved baseline. Re-checked 2026-11-17: the earlier text said these mechanisms would be built before the approvals, which contradicted that rule | the approvals bind a release, which the plan reaches at its end | approving baselines before the rewrite exists; building replay fixtures before the approvals |
| OD8 | **Add no new store dependency** for T15 or T26 | **not yet established** (re-checked 2026-11-17): HD2 needs none by design, but spike T15 has not measured it. Whether data within Temporal's payload limits is enough for third-party processes is what spike T2 measures; if it is not, a claim-check store becomes the alternative this recommendation rejects, and the recommendation is revised | — | a database-backed registry or a claim-check store |
| OD10 | **Measured by T4c: KD2′ costs 1.8× typed KD2's time and 2.9× its lines, and 2 of 3 sampled hook changes broke a footprint lemma; by the time criterion fixed beforehand, nothing is asked.** The owner may still choose, on the line and upkeep figures, to restate two architecture promises, "footprints each feature declares through its `Hooks` laws" and "no proof-motivated TypeScript (footprints, commutation helpers)", so that hooks take typed views and return deltas in Lean and TypeScript alike. The recommendation stays KD2′ | `kernel/ARCHITECTURE-SPEC.md:119,121`; KD2 and KD2′ in this proposal | it restates promises, so the owner decides | restating them without measured need |
| OD11 | **HD3: change two consequences in the ratified capacity table.** A pending service Activity beyond 32 waits in the host's queue instead of being refused, and a publication beyond 64 KiB is segmented instead of refused. Both values stay | the consequences are rows of the table the owner ratified on 2026-11-13 ([lifecycle spec](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) lines 83-114). Effect completion order is already an explicit kernel input, so waiting changes no meaning | a ratified table changes, so the owner decides | keeping the refusals: a parallel Multi-Instance of more than 32 Service Tasks, ordinary in third-party models, is refused |
| OD12 | **PD6: hold a due rollover until Product 2's change intake acknowledges** (option b), with a new capacity row whose stable code refuses caller inputs while a rollover is held. Acknowledgement is enabled only where Product 2 runs its intake, and held chains are listed in Operations | `capacity.ts:26,31,39` leaves no room to carry batches; T27 built and tested (b) on the memory host | the capacity table changes, so the owner decides | (a) carrying batches, which raises the ratified 448 KiB continuation bound; dropping after a deadline, which loses history that `PROJECT-DESIGN.md:92` requires complete |
| OD13 | **T46 (scope): add two operator capabilities to Product 2.** (1) Delete a deployment that no instance references, refused otherwise; a cascading delete waits for general cancellation (HD4). (2) Show, in instance detail, the called instance of each Call and the calling instance of a called one, read-only. Both are needed by an adopter running Call Activity models or iterating on deployments, and CIB's Cockpit offers both | inventory I3; `BPM-PLATFORM-PROPOSAL.md:88-92`; T33 (engine-started instances invisible) | a scope change, so the owner decides | leaving both silent; adding the other silent capabilities, which no adopter path in the settled scope needs |
| OD9 | **No SDK work** (#123 waits upstream). **Cron stays UTC** (owner decision of 2026-11-08; disclosed to adopters) | `CLAUDE.md` SDK rule; architecture owner decisions | — | — |

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
