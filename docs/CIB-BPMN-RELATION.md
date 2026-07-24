# CIB Seven and BPMN 2.0.2 relationship register

**Status:** Active central register

**Scope:** CIB Seven behavior reviewed by this project against OMG BPMN 2.0.2 Process Execution requirements

This document owns the classification of CIB Seven behavior relative to BPMN 2.0.2. It keeps ordinary conformance, operational interpretations, extensions, configuration-specific realizations, limitations, and deviations distinct.

## Working presumption

CIB Seven is treated as a mature, compliance-oriented BPMN execution reference. The default expectation is that it implements BPMN 2.0.2 faithfully, makes underspecified or inconsistent parts operational, and adds explicit engine capabilities around the standard.

CIB being more concrete than the standard is not a deviation. A CIB extension is not a deviation merely because BPMN does not define its protocol. A deviation is recorded only when a clear normative requirement and separating evidence establish incompatible behavior.

This presumption guides investigation; it does not replace evidence or authorize an unbounded conformance claim.

## Current dashboard

The counts below cover only entries reviewed and recorded by this project. Zero does not mean that the complete CIB Seven engine has been proven free of deviations.

| Lane | Recorded entries | Open candidates | Meaning |
|---|---:|---:|---|
| Reviewed normative agreements | 2 | 0 | A bounded BPMN requirement and pinned CIB observation agree |
| Permitted operational details | 1 | 0 | CIB or the oracle adapter chooses host mechanics without changing required BPMN observations |
| Confirmed normative deviations | 0 | 0 | Clear BPMN requirement and pinned CIB evidence establish incompatible behavior |
| CIB interpretations of BPMN gaps or inconsistencies | 0 | 0 | CIB selects an operational meaning where BPMN does not uniquely settle it |
| Selected CIB extensions | 0 | 1 research hint | Project profile deliberately includes behavior beyond bare BPMN execution |
| Configuration-specific realizations | 1 | 0 | Behavior is permitted or meaningful only under a declared CIB environment |
| Known CIB limitations within reviewed scope | 0 | 0 | Unsupported or incomplete behavior that is not yet classified as a normative deviation |

The current sequential User Task capsule has no recorded CIB deviation. That statement is bounded to its clauses, pinned environment, witnesses, and observation surface; it is not a general CIB conformance result.

## Prominent deviation register

### Confirmed deviations

None recorded.

### Candidate deviations requiring classification

None recorded.

A candidate must appear here immediately when evidence suggests conflict with a clear BPMN requirement. It remains a candidate until the evidence threshold below is satisfied. Implementation of the disputed profile-dependent behavior pauses unless the capsule explicitly preserves competing accounts as an unresolved experiment.

The repository-wide audit on 2026-07-24 found no previously visited observation that satisfies the candidate or confirmed-deviation threshold. The recorded PVM facts, generated IDs, history-TTL requirement, task-service mapping, and provisional join-representation question are classified below instead of being silently left open or mislabeled.

## Normative agreement register

### CIB-AGR-0001 — sequential Process and User Task lifecycle

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 13.2 and 13.3 require an instantiated executable Process to progress along Sequence Flows, activate an Activity, wait while the User Task is active, and complete after the task and downstream None End Event complete.

**Pinned CIB observation:** CIB Seven `2.2.0` deploys and starts the exact plain BPMN fixture, exposes exactly one active `UserTask_Approve`, completes it through the public task service, and reports the Process complete at unchanged controlled logical time.

**Evidence:** [BPMN fixture and scenarios](../scenarios/user-task-discovery-completion/README.md), [exact-completion CIB evidence](../scenarios/user-task-discovery-completion/cibseven-evidence.json), [oracle runner test](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScenarioRunnerTest.java), and [the current draft profile](../profiles/cibseven-2.2.0-user-task-draft/README.md).

**Boundary:** This establishes agreement only for one private executable `None Start Event → User Task → None End Event` Process and its declared observation surface. It says nothing yet about assignment, variables, repeated activation, concurrency, errors, or general Process Execution Conformance.

### CIB-AGR-0002 — active User Task discovery and basic completion

**Status:** Reviewed bounded agreement

**BPMN basis:** BPMN 2.0.2 Clauses 10.7.3, 13.3.2, and 13.3.3 describe User Task activation, task-manager lifecycle, performance of the human work, and completion before outgoing control proceeds.

**Pinned CIB observation:** The public CIB task query exposes the active task and its BPMN definition key and name; completing the corresponding live host task removes the wait and completes the admitted Process.

**Evidence:** [User Task interaction capsule](capsules/USER-TASK-INTERACTION.md), [exact-completion evidence](../scenarios/user-task-discovery-completion/cibseven-evidence.json), [interaction scenarios](../scenarios/user-task-discovery-completion/README.md), and [the current draft profile](../profiles/cibseven-2.2.0-user-task-draft/README.md).

**Boundary:** People assignment, ownership, authorization, forms, input/output data, and general User Task lifecycle are excluded. The project’s structured activation ordinal and refusal of a mismatched semantic occurrence are an operational mapping under `CIB-OP-0001`, not a claim that BPMN prescribes that identity representation.

## Interpretation register

No CIB gap resolution has yet been approved as a project semantic-profile decision.

An interpretation belongs here when BPMN is ambiguous, inconsistent, non-operational, or leaves several permitted behaviors and the pinned CIB engine supplies one concrete meaning. It is not labeled a deviation.

The [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md#import-and-admission-policy) already records specification questions involving omitted `Process.isExecutable`, import/export wording, `Import.location`, incomplete interchange versus executable admission, and multi-instance wording. Those are BPMN-source issues awaiting feature-specific CIB probes, not CIB deviations and not yet approved `CIB-INT` entries.

## Extension register

No CIB extension has yet been selected into an approved project profile.

### Research queue

| Hint | Status | Required investigation |
|---|---|---|
| External-worker execution associated with a BPMN Service Task | Owner-supplied research hint; not yet an adopted extension record | Identify the exact CIB Seven BPMN extension attributes and worker protocol at the pinned revision, distinguish standard Service Task meaning from topic/fetch-lock/complete/fail/retry/incident behavior, and add separating evidence before profile selection |

The research queue is not evidence and does not authorize implementation. It prevents a useful extension candidate from being conflated with a deviation or silently entering the semantic core.

## Permitted operational-detail register

### CIB-OP-0001 — CIB host task identity mapped to project semantic task identity

**Status:** Reviewed operational mapping

CIB creates a generated task ID and addresses completion through `TaskService.complete(taskId)`. BPMN does not prescribe that database identity, Java API, or a portable encoding for one task occurrence.

The oracle adapter therefore maps the one live CIB task to project-owned identity `(Process instance, BPMN element, activation ordinal)` and keeps the generated CIB ID local to the query/complete call. A wrong activation is rejected by this mapping before calling CIB; after completion, absence of a matching live CIB task supports stale-occurrence rejection. The upstream CIB unknown-task-ID test is a behavioral precedent, but it does not turn the project activation ordinal into a raw CIB engine concept.

This mapping preserves the BPMN-visible lifecycle under `CIB-AGR-0002` while avoiding false identity equivalence across CIB, Lean, TypeScript, and Temporal. Evidence and exact exclusions are in the [User Task interaction capsule](capsules/USER-TASK-INTERACTION.md) and [CIB runner documentation](../runners/cibseven/README.md).

## Configuration-specific register

### CIB-CFG-0001 — pinned Milestone 0 oracle environment

**Status:** Reviewed configuration dependency

The current draft profile pins CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017`, Java 21, H2 `2.3.232`, disabled automatic job execution, an explicit logical clock, audit history, and default history TTL `P180D`. CIB deployment required the TTL in this environment; audit history remains outside the canonical observation boundary, while controlled time and scheduling prevent accidental host nondeterminism from entering the current capsule.

This is a profile constraint, not evidence that CIB differs from BPMN. It does not claim that another database, history level, scheduler setting, plugin set, or engine configuration produces the same observations. The machine-readable declarations are in the [current profile](../profiles/cibseven-2.2.0-user-task-draft/profile.json).

## Audit of previously visited findings

| Previously visited finding | Classification | Reason |
|---|---|---|
| Plain sequential Process deploys, waits at one User Task, and completes | `CIB-AGR-0001` | Bounded observed agreement with the applicable BPMN lifecycle |
| Active task discovery and completion through CIB public services | `CIB-AGR-0002` | Bounded observed agreement for the selected User Task surface |
| Generated CIB task IDs and `TaskService` calls | `CIB-OP-0001` | Host identity and API mechanics are more concrete than BPMN but do not conflict with it |
| Java/H2/history-TTL/job-executor/clock settings | `CIB-CFG-0001` | Required reproducibility and admission configuration, with non-semantic history excluded from comparison |
| PVM ordered topology, `null` event scope on ordinary flow nodes, and internal `noneEndEvent` type | Diagnostic internal representation; no relationship entry | These are implementation diagnostics, not public BPMN behavior or compatibility keys |
| Model API DOM, deployment parse tree, PVM definition graph, and runtime execution tree differ | Diagnostic architecture; no relationship entry | Separate authoring, compilation, and runtime representations do not imply a semantic difference |
| Count-only versus incoming-edge-provenance join state | Unresolved representation experiment; no deviation candidate | The project has a separating abstract witness but has not yet run the feature-specific normative analysis and pristine CIB probe needed to classify CIB behavior |
| External-worker execution | Extension research hint only | The exact CIB BPMN attributes and worker lifecycle have not yet been researched or selected |

## Classification order

Classify an observed CIB behavior in this order:

1. **Normative agreement:** BPMN is sufficiently clear and CIB behaves accordingly. This is the expected case.
2. **Permitted operational detail:** CIB chooses implementation detail that does not alter required BPMN observations.
3. **BPMN gap resolution:** BPMN is ambiguous, inconsistent, or incomplete and CIB selects an operational interpretation.
4. **CIB extension:** CIB adds a namespaced construct, protocol, lifecycle, or public capability beyond bare BPMN.
5. **Configuration-specific realization:** the behavior depends materially on a declared database, history, expression, scheduler, plugin, listener, or other profile choice.
6. **Limitation or unsupported surface:** CIB does not implement the examined capability, but the normative conformance consequence is not yet established.
7. **Candidate deviation:** evidence suggests conflict with a clear BPMN requirement but review is incomplete.
8. **Confirmed normative deviation:** the evidence threshold is satisfied and owner review confirms the classification.

Do not jump directly from a differential mismatch to “deviation.” First exclude fixture, import, configuration, scheduler, observation, canonicalization, and harness errors.

## Evidence threshold for a confirmed deviation

A confirmed deviation record requires:

- a stable `CIB-DEV-NNNN` identifier;
- the exact BPMN 2.0.2 clause, applicable figure/table, normative machine-readable fact where relevant, and open-issue disposition;
- a concise statement of the normative requirement and why it is not merely ambiguous;
- the smallest separating BPMN model and answer-free scenario;
- the exact CIB Seven release, source revision, environment, configuration, and observation boundary;
- immutable raw or recoverable producer evidence plus a mutation-sensitive canonical projection;
- reproduction through the pristine pinned oracle lane;
- exclusion of parser, harness, configuration, scheduling, projection, and instrumentation explanations;
- impact on BPMN conformance, CIB compatibility, executable IR, Lean, TypeScript, Temporal, replay, and public claims;
- the applicable capsule and stable semantic rule identifiers;
- an explicit owner decision and review status.

An unconfirmed concern is recorded prominently as a candidate rather than omitted or prematurely promoted.

## Entry template

```text
ID:
Status: candidate | confirmed | resolved-not-a-deviation | superseded
Summary:
BPMN requirement:
BPMN sources and issues:
CIB release and configuration:
Separating model and scenario:
CIB observation:
Expected normative behavior:
Alternative explanations excluded:
Classification rationale:
Profile decision:
Capsule and semantic rule IDs:
Lean evidence:
TypeScript evidence:
Temporal/refinement/replay impact:
Conformance and compatibility impact:
Owner decision:
Last reviewed:
```

Reviewed agreements use `CIB-AGR-NNNN`; permitted operational details use `CIB-OP-NNNN`; gap resolutions use `CIB-INT-NNNN`; selected extensions use `CIB-EXT-NNNN`; configuration-specific records use `CIB-CFG-NNNN`; limitations use `CIB-LIM-NNNN`; candidate and confirmed deviations use `CIB-DEV-NNNN`. Identifiers are never renumbered or reused.

## Mandatory capsule workflow

Before Lean or TypeScript implements profile-dependent behavior, the capsule must:

1. identify the applicable BPMN requirements and open issues;
2. probe pinned CIB Seven with the smallest observation capable of separating relevant accounts;
3. classify the relationship using this register;
4. add or link the required interpretation, extension, configuration, limitation, or deviation entry;
5. state the selected profile behavior and whether it is normative BPMN, a CIB interpretation, or a CIB extension;
6. keep an unresolved candidate deviation visible and implementation-blocking unless the owner approves a bounded competing-account experiment;
7. link the classification to stable capsule rule IDs and independent evidence lanes.

CIB therefore contributes twice: before Lean as reviewed profile evidence and after implementation as the executable differential oracle. Raw CIB results are never transformed automatically into Lean semantic authority.

## Profile consequences

Normative agreement normally needs no special override, but its requirement and evidence remain traceable through the capsule.

A gap resolution becomes an explicit interpretation in the CIB compatibility profile. A selected extension is separately named and scoped so it cannot inflate a BPMN conformance claim.

If a normative deviation is confirmed, the project must discuss and choose among:

- implement normative BPMN behavior and report the CIB incompatibility;
- implement CIB behavior under an explicitly named compatibility profile and report the normative deviation;
- support separate BPMN and CIB profiles.

One conflicting behavior cannot honestly be advertised as both exact CIB compatibility and BPMN conformance.

## Completeness boundary

This register is complete only relative to reviewed requirements, supported features, pinned CIB environments, maintained scenarios, and declared observation boundaries. Unknown or unreviewed areas remain unknown; absence from the register is not proof of agreement.

The [BPMN conformance target](BPMN-CONFORMANCE-TARGET.md) owns the normative goal, [semantic capsules](capsules/README.md) own bounded project meaning, [profiles](../profiles/README.md) own selected compatibility contracts, [the implementation map](IMPLEMENTATION-MAP.md) owns current coverage, and [the testing guide](TESTING.md) owns evidence procedure.
