# Rewrite-2 proposal

## Status

Checkpoint 1 of the rewrite-2 preparation ([owner intents](OWNER-INTENTS-REGISTER.md), 2026-11-17): the full disclosure of every costly topic between the current state (`main` `87d27def2`) and the goal, Product 2 used by a third party on their own models. This proposal does not yet select a design, a calibration or a plan. Those follow in checkpoints 2 to 5 ([PLAN](PLAN.md#exact-resume-point)): design, measured calibration, cold review, and a plan the owner approves.

Every cost below is an estimate, in agent-days of 8 agent-hours, and is unmeasured until a calibration spike measures it. The anchor is the first rewrite, about 7 agent-days. The proof wave that followed it took about 6 to 16 agent-days, and P6's budget ran 6 to 11 times over.

## Method and verification

Three read-only domain audits found the topics: kernel core (K), engine boundary, hosting and evidence (E), and Product 2 (P). None of them spawned agents of its own.

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

1. **P6 is not on the goal's path under the profile a third party can use.**
   - `SchedulesAgree` applies only under `branchSchedule = orderInvariant` (`Kernel/Proofs/Concurrency.lean:146-147`), which only `bpmn-2.0.2` selects.
   - `cibseven-2.2.0` selects the deterministic `declarationDepthFirst`.
   - `bpmn-2.0.2` evaluates Simple Boolean only (`Kernel/IL/Types/Options.lean:404`). It refuses `${…}` conditions, Scripts, output mappings, interrupting Event Sub-Processes and Terminate inside a Sub-Process.
   - Product 2's structured forms, however, exist only under `bpmn-2.0.2`.
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

| # | Topic | Blocks | Current | Rewrite | Owner decision |
|---|---|---|---|---|---|
| T1 | Third-party model admission: about 30 classification and breadth items inside the CIB7 ceiling, an inert-metadata tier, and admission that reports every refusal with its element [P1, E1, E12, K4] | yes | 25–45 | 20–38 | vendor-metadata policy |
| T2 | Value domain: Double, Date, negative integers, and bounds such as 32 members and 1 KiB strings [K5, E3] | yes | 4–15 | 2–6 | numeric tower |
| T3 | Third-party profile: which profile Product 2 offers; forms coupled to the standards profile [K6, P6] | yes | 0.5–2 | 0.5–2 | **yes** |
| T4 | P6 together with admission ⇒ premises, the narrow statement and footprints [K1, K2, K9, K11] | only if the standards profile is a goal profile | 40–74 | 20–40 | follows T3 |
| T5 | Rewrite reopens the closed lanes [K3] | no | 0 | 5–12 | — |
| T6 | Identity scheme: internal, public, called and cascade identities (#126) [K7, E9] | partly | 4–15 | 0 if the public identity is kept, 5–8 if it changes | public identity |
| T7 | Closure order: #120, #75, rollback points [K8] | no | 5–10 | 3–6 | imitate CIB on #75 |
| T8 | Eight law families proved only on witness states [K10] | no (assurance) | 8–24 | 8–24 | — |
| T9 | Admitted models can stop mid-run with one of 66 `unsupported` codes [K12] | partly | 1–2, plus 0.5–3 per code | same | production policy |
| T10 | Module-shape pressure and dual transcription [K13, K14] | no | 1–3 per growth episode | 0.5–1 | budgets |
| T11 | Effect contract an adopter can implement, plus Script isolation (TD-005) [P2, E7] | yes | 2–12 | 1.5–8 | — |
| T12 | Per-request identity, authorization of deploy, start and search, and a security minimum [P3, P4] | yes | 1.5–5 | 1.5–5 | — |
| T13 | Public publication contract without internal ids [P5] | no, but it multiplies every kernel change | 1.5–3 | 0.5 + 1–1.5 | — |
| T14 | Profile bound in definition storage [P6] | yes | 1–2 | 0.5–1 | — |
| T15 | Population ingress: one Workflow, about 536 waiting instances per population, append-only registry, Timer ledger [E4] | yes | 10–20 | 6–12 | sharding or a store |
| T16 | Per-chain bounds: 32 pending Activities, a 64 KiB batch (#125), a 192 KiB program of about 100–180 elements, state growth (#169) [E5] | yes, for larger models | 6–12 | 4–8 | — |
| T17 | Engine API gaps: general cancellation, DMN resources, variable commands, Signal and Conditional entry points (#91), cross-deployment Calls (#94) [E8, P9] | yes | 8–15 | 6–12 | — |
| T18 | Milestone gates and the cross-product agreement test [P10] | no (assurance) | 1.5–5 | same | — |
| T19 | Start lifecycle convergence (#136, #131, #124) [P11] | yes | 1–1.5 | same | — |
| T20 | Human work for Camunda models: `formKey`, `formData`, assignee expressions [P12] | yes | 2–3 | same | passive form metadata |
| T21 | Adopter documentation and API reference [P13] | yes | 1–2 | same | — |
| T22 | Evidence re-retention multiplier per rebase [E10] | no | 1–3 per rebase | same | — |
| T23 | Upstream blocks: Temporal SDK (#123), Node (TD-005) [E11] | production only | external | external | — |
| T24 | Workflow versioning and upgrades [P7, E6] | decided out | — | — | decided |
| T25 | Deferred families: listeners, Java delegates, external tasks, connectors [E2] | decided out | — | — | settled |

**T24 was decided by the root (premise checked against the [platform proposal](BPM-PLATFORM-PROPOSAL.md#explicit-exclusions)).** The goal is an evaluation-grade, single-organization deployment from published images.
- **In scope:** per-request identity (T12) and a security minimum.
- **Excluded by the proposal:** production packaging, high availability and upgrade compatibility. Wipe-on-upgrade is documented until a durable baseline exists.

**T25 follows the settled documents.**
- The [practical target](PRACTICAL-CIB7-COVERAGE-TARGET.md#optional-integrations-and-exclusions) and the [compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) keep these families optional and deferred.
- The cost of that choice is disclosed, not hidden: CIB's own invoice demo uses a task listener. Listeners would cost 8–15 agent-days on the current code and 4–8 designed in.

## Remaining-to-goal ledger, not costly

About 10 agent-days in total, all independent of the kernel design. The issues are #133, #93, #171, #134, #137, #142, #124, #152, #169, #170, #167, #188, #77, #100, #106, #114, #119, #107, #101, #92, #110, #112 and #67, plus the CIB harness gaps (#89, #127–#130, #105), small Product 2 surfaces (value arms, search filters, profile selection, a published bundle) and documentation corrections. Each item is costed in the domain reports.

## What the verified findings imply, before design

- **With T3 decided as recommended, most of the cost to the goal is not kernel-core work.** The recommendation: `cibseven-2.2.0` as Product 2's default, and `bpmn-2.0.2` as a conformance profile outside the goal.
  - T4 leaves the path.
  - T1, T2, T11–T21 are reader, admission, host, engine-API and platform work. Their cost barely changes with a kernel rewrite.
  - The kernel-core drivers that remain are T6, T7 and T8, together about 15–40 agent-days, against a rewrite's own T5 cost of 5–12. Checkpoint 2 has to compare targeted kernel fixes with a core rewrite on exactly these.
- **The total to the goal is large either way.**
  - About 75–185 agent-days by these estimates. This takes T1 at its broad count and excludes T4.
  - Most of it is T1: breadth inside the ceiling that a third party's own models need.
  - The calibrations of checkpoint 3 replace these ranges with measured numbers before any plan is approved.

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
