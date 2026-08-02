# Bounded called-Process Call Activity proposal

## Status

**Owner-approved for implementation in the exact bounded profile below. Independent review of immutable target `8f796f4` returned APPROVE WITH REQUIRED EDITS, and the same reviewer passed correction audit target `3e17a05` without a material redesign. Review of first green semantic checkpoint `5cb7b54` returned APPROVE WITH REQUIRED EDITS; correction target `0148592` is awaiting audit by that same reviewer. Artifact, differential, and durable Temporal lanes remain blocked.**

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `8f796f4` | `fork-turns-none` | `approve-with-required-edits` | `3e17a05` |
| Semantic checkpoint | `5cb7b54` | `fork-turns-none` | `approve-with-required-edits` | `0148592` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

This receipt follows the [independent cold-review gate](../TESTING-SPEC.md#independent-cold-review-gate). The context-cold sub-agents inherited the root model and effort. The proposal reviewer required command-outcome, QName, graph, identity, evidence, profile-metadata, and extraction-boundary corrections and passed correction audit target `3e17a05` without a material redesign. The checkpoint reviewer required caller-root, full tuple-identity, and owner-document corrections at `0148592`; its same-thread audit remains pending.

## Exact question

Should the project admit one Call Activity that resolves an exact in-document global Process, creates a distinct semantic called Process instance, withholds the caller continuation until that instance completes normally, and hosts the whole bounded lifecycle durably without treating a Temporal Child Workflow as BPMN identity?

The recommended answer is yes. The smallest complete account adds one definition forest, a paired Process-invocation and return operation, and one hidden occurrence-owned call record. It reuses None Start/End behavior, User Task waits and completion Updates, scope quiescence, canonical observation, result recovery, and replay. It does not reinterpret an embedded definition scope as a called Process instance.

## Normative and compatibility basis

BPMN 2.0.2 Clause 10.3.6 defines Call Activity as a wrapper whose activation transfers control to a called global Process or Global Task. Table 10.23 gives `calledElement : CallableElement [0..1]`; the selected executable profile strengthens that optional association to one resolved Process target. CMOF carries `CallActivity.calledElementRef : CallableElement [0..1]`, and `Semantic.xsd` represents `calledElement` as an optional `xsd:QName`.

Clause 13.3.4 gives a global Process called through Call Activity the same instantiation and termination semantics as a Sub-Process. A normally completed instance therefore has no remaining token and no active Activity before the wrapper continues. The same clause permits non-empty Start Events on a global Process but ignores them when the Process is called; this profile instead requires one empty Start Event and excludes every alternative trigger. Clause 10.5 permits that None Start Event to invoke the top-level called Process.

Clause 10.3.6 also requires the Call Activity and CallableElement data requirements to match and return data, and permits overrides plus propagated Errors and Escalations. Both selected elements have no `ioSpecification`, Data Inputs, Data Outputs, mappings, Resource Roles, or exceptional constructs, so the data contracts match vacuously and no result mapping is claimed.

The registered local issue material contains no mirrored Call-Activity-specific disposition that changes this account. Closure must recheck that local set, adopt no unrecorded disposition, and make no claim about live issue status.

This is a vendor-neutral BPMN profile. Pinned CIB Seven `CallActivityTest#testCallSimpleSubProcess` is a feasibility seed, but CIB resolves `calledElement` through separately deployed definitions, version selection, and optional tenant policy. Those are excluded here, so no new Call-Activity CIB relationship, execution target, or evidence lane is selected. The future semantic profile retains `CIB-AGR-0001` and `CIB-OP-0001` only for the already-implemented User Task interaction surface; those metadata entries do not provide Call Activity evidence. A later project-owned CIB probe may classify only exact public facts it observes; source prevalence and one engine test are not compatibility evidence.

## Exact source profile and QName resolution

One BPMN `Definitions` document contains exactly two distinct executable Process roots and no other root element:

- caller: None Start Event → Call Activity → caller User Task → None End Event;
- called Process: None Start Event → called User Task → None End Event.

Both Process IDs, all node IDs, and all Sequence Flow IDs are globally distinct and nonempty. Each node has exact one-in/one-out arity where applicable. Both User Tasks have no performer, form, data, loop, boundary, extension, or implementation surface. The Call Activity has no loop characteristics, boundary Events, data specification or association, mappings, Resource Roles, properties, extensions, or Collaboration association.

The document uses the existing plain `Definitions` surface: no imports, extensions, relationships, BPMN Diagram Interchange, or other unprojected document structures. Both Processes are private and carry explicit `isExecutable="true"`; every other Process property outside the selected names and Flow Elements is absent.

The Call Activity requires a prefixed lexical QName such as `tns:CalledProcess`. Its lexical form contains exactly one U+003A colon, with no whitespace or normalization, and both the prefix and local part are valid XML NCNames under the pinned XML/XSD rules. Source admission validates this independently of `bpmn-moddle`, which may retain malformed QName text without a parser warning. Admission then resolves the value structurally:

1. split the lexical QName into one nonempty prefix and local part;
2. resolve that prefix through the `Definitions` namespace declarations;
3. require the namespace URI to equal the exact `Definitions.targetNamespace`;
4. require exactly one root Process whose ID equals the local part;
5. require that Process to differ from the caller and to have the exact called shape above.

Omitted, empty, whitespace-bearing, extra-colon, invalid-NCName, unprefixed, unknown-prefix, foreign-namespace, unresolved, duplicate, self-referential, imported, Global-Task, Collaboration, and non-Process targets reject. The nearest source discriminator is a foreign namespace bound to a QName with the correct local Process ID: a local-name-only implementation would wrongly admit it.

Reversing the two Process declarations, their flow-element declarations, and every incoming/outgoing reference order must preserve the complete checked graph and Semantic Process program modulo only the source digest. A second fixture changes the called Process ID and the QName together and must change the checked and lowered binding, proving that the target is reference-derived rather than a fixture constant.

## Selected rules

`CALL-RESOLVE-01` — Admission resolves the required QName to exactly one distinct in-document Process definition. No deployment, version, tenant, import, or local-name fallback participates.

`CALL-INVOKE-01` — One caller-owned token at the Call Activity is consumed atomically. One hidden call occurrence and one distinct called root scope occurrence are created, and exactly one called-owned token is placed after the called None Start Event. No caller output token exists while the call is live.

`CALL-RETURN-01` — Normal return is enabled only for the exact linked called instance after its root is quiescent. It removes that root and call record and produces exactly one token on the Call Activity's caller output. Missing, duplicate, mismatched, still-active, or already-returned calls do not continue the caller.

`CALL-IDENTITY-01` — The called Process instance has a deterministic semantic identity distinct from the caller instance. Definition identity, caller/called semantic instance identity, and Temporal Workflow/Run identity remain separate.

`CALL-REFUSE-01` — A completion addressed with the caller ID instead of the called task ID, a duplicate or stale called completion, and nonempty start or task data are rejected with exact state preservation. A malformed or ambiguous call association instead disables `invokeProcess` or `returnProcess` with exact preservation of that internal step's input; it does not retroactively reject or roll back an already committed external completion, and the resulting synthetic stranded state is non-resumable.

`CALL-OBSERVE-01` — Start closure exposes only the called User Task under the called semantic instance ID. Only after called completion and normal return does observation expose the caller User Task under the original caller ID. The terminal state is the ordinary empty completed observation; hidden definition and call records are never projected.

## Checked graph and Semantic Process IL

The checked graph adds one closed node arm:

```ts
type CheckedCallActivityNode = DeepReadonly<{
  kind: "callActivity";
  id: string;
  calledProcessId: string;
}>;
```

`definitionScopes` becomes a canonical forest. Exactly two scopes have `parentScopeId: null`: the caller root whose `originElementId` equals `processId`, and the called root whose `originElementId` equals `calledProcessId`. The caller remains the sole startable entry definition and is selected by exact `processId`/root-definition equality, never by taking the first parentless definition. Existing embedded scopes, when used by other profiles, remain ordinary descendants under one Process root; this profile admits none.

The IL adds two explicit operations rather than weakening `enterScope` or `completeScope`:

```ts
type InvokeProcessOperation = DeepReadonly<{
  id: string;
  kind: "invokeProcess";
  origin: BpmnElementOrigin;
  input: string;
  calledProcessId: string;
  calledRootScopeId: string;
  calledEntry: string;
  returnOperationId: string;
}>;

type ReturnProcessOperation = DeepReadonly<{
  id: string;
  kind: "returnProcess";
  origin: BpmnElementOrigin;
  calledProcessId: string;
  calledRootScopeId: string;
  callerOutput: string;
}>;
```

The invoke operation uses the existing node-operation ID and is owned by the caller root; return uses `operation:return-process:<CallActivity ID>` and is owned by the called root even though both origins identify the caller's Call Activity. `returnOperationId` binds one invoke to one return. Standalone program admission allows this exact cross-definition pair and requires one caller entry root, one non-entry called root, one exact pair, common origin and called definition, a called entry owned by the called root, caller input/output owned by the caller root, no root-definition cycle, and no `completeScope` for the called root. The caller root retains its ordinary `completeScope`.

Generic graph admission selects the unique entry root by exact `processId`/`originElementId` equality and assigns every parentless definition exactly one completion strategy: the entry root terminates through its unique root `completeScope`, while the called root terminates through its unique paired `returnProcess`. In addition to the ordinary control-place edges, validation adds one virtual structural edge from the called root's unique `reachNoneEnd` to that `returnProcess`, analogous to the existing root-completion edge. `invokeProcess` crosses only from caller input to called entry, and `returnProcess` crosses only from called completion to caller output. Ordinary reachability, co-reachability, and acyclicity then run over the complete graph; no Call-profile bypass may waive them.

Checked-definition binding additionally requires the called Process/root/None-Start entry and caller input/output to match the exact checked source. Lowering emits exactly one `initiate`, owned by the caller root. The called None Start is represented by `invokeProcess.calledEntry` and produces no independently startable `initiate`. Swapping the target root or called entry while retaining a structurally valid forest and operation pair must fail checked-definition binding and independent Lean lowering equality.

The existing `enterScope` continues to create an embedded child definition scope under the same Process instance. The existing `completeScope` continues to close embedded scopes or the caller root. Neither acquires a hidden called-Process mode.

## Runtime-only call record and semantic identity

Runtime state adds one hidden canonical collection and one activation counter:

```ts
type CalledProcessOccurrence = DeepReadonly<{
  id: OccurrenceId;
  caller: ScopeOccurrenceId;
  calledProcessId: string;
  calledRoot: ScopeOccurrenceId;
  returnOperationId: string;
}>;
```

The call occurrence ID is the caller Process instance, Call Activity element, and call activation. The called root uses the called definition scope with activation `1` and a distinct `processInstanceId` derived from the caller ID, Call Activity ID, and call activation. The derivation is a fixed ASCII-tagged, decimal UTF-8-byte-length-prefixed tuple encoding with no leading-zero lengths:

```text
call:<callerByteLength>:<callerId>:<activityByteLength>:<activityId>:<activation>
```

The UTF-8 lengths make the encoding injective even when either input contains the delimiter. Lean and TypeScript must implement the same Unicode-scalar-to-UTF-8 byte count and exact bytes. A delimiter-only concatenation and a UTF-16-code-unit length implementation are nearest checked non-laws. The derived identity is semantic data; it is not a Temporal Workflow ID, Run ID, Child Workflow ID, or deployment key.

Invocation atomically consumes the caller token, increments the call activation, creates the record and a parentless called root occurrence, and places the called token. Parentless here means a distinct Process root; the call record, not `RuntimeScopeOccurrence.parent`, links it to the caller. Runtime code identifies the hosting caller root by the program's entry definition and root `processId`, never by assuming that the only parentless runtime occurrence is the caller. Return requires the unique immutable return operation plus exactly one matching record and called root, verifies called quiescence, removes both, and emits one caller-owned token.

A live call record blocks quiescence of its caller scope. A called root blocks return while it owns any token, wait, selected set, race, nested scope, or other live runtime object. Existing owner interruption must remove call records and every runtime object whose owner belongs to the recorded called `processInstanceId` subtree; it cannot rely only on `RuntimeScopeOccurrence.parent`, because the called root is parentless. This class guard is required although cancellation is unreachable and excluded in this profile. Canonical collection order is caller Process instance, caller definition scope, caller activation, Call Activity element, then call activation.

Wait occurrence identity must derive `processInstanceId` from the wait owner's `ScopeOccurrenceId`, not from root `RuntimeState.control`. Existing root-owned waits remain byte-identical. A synthetic called-owner wait must expose the called identity in Lean and TypeScript, guarding the class rather than only the representative User Task.

## Data and public-boundary constraints

The current runtime owns one Process-variable scope, not one scope per semantic Process instance. This capsule therefore admits only empty start variables and empty User Task completion patches. Nonempty data at the caller or called task rejects without mutation. A called-task detail reports no caller Process variables. General per-instance variables, Call Activity input/output matching or mapping, and called-result propagation require a later data capsule.

Canonical `StateObservation` remains unchanged. `StateObservation.instanceId` and the hosting Workflow address remain the caller/root semantic instance identity throughout. Terminal `CompletedProcessReceipt.processId` remains the caller Process definition ID, while `CompletedProcessReceipt.processInstanceId` and `ProcessCommandResult`'s `processUnknown.processInstanceId` remain the caller/root semantic instance ID. Process status describes the aggregate caller execution, including a live called instance. The called identity appears only on called-owned occurrence IDs and hidden called-root state; it never replaces the top-level identity. The hidden definition forest and call occurrence are not new fields. The first stable observation contains one called User Task whose task ID carries the derived called Process-instance ID. The second contains one caller User Task whose task ID carries the original start instance ID. The final observation is the ordinary caller-root completed state with no wait or interaction.

Temporal Workflow address and semantic task address become explicitly separate inputs at the client boundary. The caller/root ID selects the one hosting Workflow; the completion stimulus retains the called task's distinct semantic Process-instance ID. The client may validate both shapes but must not require their equality. The core remains the authority that accepts only the exact live task occurrence, so an unrelated instance ID reaches semantic rejection rather than another Workflow.

## Separating witnesses and proof boundary

One answer-free schedule starts with empty variables, completes the called User Task by its derived ID, completes the caller User Task by the original caller ID, and reaches terminal state. The two intermediate observations separate this account from embedded-scope identity, early caller continuation, and terminal-only agreement.

Internal closure is exactly three steps at start (`initiate`, `invokeProcess`, called `awaitUserTask`), three after called-task completion (`reachNoneEnd`, `returnProcess`, caller `awaitUserTask`), and two after caller-task completion (`reachNoneEnd`, caller-root `completeScope`). Limits `2`, `2`, and `1` respectively must report bound exhaustion and publish no stable state; each successful closure remains below `semanticProcessClosureLimit = 8`.

Every reachable admitted prefix has at most one enabled internal operation. Duplicate invoke/return definitions reject at structural admission. Two matching call records or two matching called roots disable the applicable internal invoke/return transition rather than inherit evaluator order. That internal refusal preserves its direct input state, but a valid external completion committed before closure remains committed; an orphan call record, orphan called root, ambiguous association, or stranded caller token is non-resumable rather than a command rollback.

Lean requires separate declarative invoke and return relations, evaluator soundness for both, a quantified injectivity/distinctness theorem for derived called identity, exact caller/called ownership, nonquiescent-return refusal, and exactly-once return under unique binding. Finite `by decide` fixtures establish the 3/3/2 traces, smaller-bound exhaustion, concrete wrong-ID/data/stale command refusals, and malformed-record internal no-successor cases; they do not establish recursion, liveness, arbitrary call graphs, data mapping, or cross-implementation equivalence.

## Temporal hosting/refinement preflight

The bounded profile uses one Temporal Workflow addressed by the caller/root identity. The complete immutable definition forest, call record, caller and called semantic identities, both tasks, and all transitions remain core state. No Child Workflow, Activity, Signal, Timer, effect, cancellation command, retry policy, or new public handler is needed. User Task completion reuses the existing content-bound Update and result/receipt ledger. Implementation atomically replaces the production lifecycle's current singular “one Workflow, one semantic Process instance” statement with the exact aggregate-hosting rule above; this proposal does not silently widen that owner contract.

Host admission classifies `invokeProcess` and `returnProcess` exhaustively as internal, non-splitting, non-host-wait operations. A mutation omitting either kind must fail the exhaustive classification guard. No data-dependent multiple-enabled state or host race is introduced.

The live witness starts the caller Workflow, pins the called-task Query and derived semantic ID, commits called completion, stops the Worker, recovers that accepted result plus the caller-only Query under a replacement Worker, completes the caller task, checks the terminal receipt, and replays the disposable history. The history contains zero Child Workflow, Signal, Timer, Activity, effect, or cancellation events.

A separately bundled bypass resumes the caller while the called task remains live; exact Query/result reconciliation must expose both the retained called task and forged caller task instead of accepting the bypass. An identity-erasure mutation that replaces the called task ID with the caller ID must diverge at the first canonical observation and invert which completion can commit.

Pre-release policy remains in force: histories are produced, replayed, and discarded in one gate. No Workflow patch, retained history, migration reader, deployment fallback, or compatibility arm is introduced.

## Evidence and cross-target invariant matrix

| Rule | Normative/profile | Lean | CIB Seven | Independent TypeScript | Temporal | Negative or mutation |
|---|---|---|---|---|---|---|
| `CALL-RESOLVE-01` | Clauses 10.3.6/13.3.4, Table 10.23, CMOF/XSD QName | checked `calledProcessId`/root/entry binding and independent lowering equality | Call-specific lane deliberately absent; inherited User Task metadata only | namespace-aware source admission and exact binding | admitted definition forest is Workflow input | malformed QName, foreign namespace, self-call, target/root/entry permutation |
| `CALL-INVOKE-01` / `CALL-IDENTITY-01` | control transfer to one global Process | invoke relation/soundness, injective identity, exact ownership | deliberately absent | atomic call/root creation and owner-derived wait identity | called-task Query and identity-erasure detection | embedded-scope/root-ID reuse, UTF-16 length, duplicate record |
| `CALL-RETURN-01` | normal called completion before wrapper continuation | return relation/soundness, quiescence and exactly-once laws | deliberately absent | exact linked return and 3/3/2 bounds | replacement recovery and caller-only Query | early-return bypass, missing/mismatched record/root |
| `CALL-REFUSE-01` | bounded profile exclusion | state-preserving wrong-ID/data/stale laws plus internal no-successor laws | Call-specific lane deliberately absent; inherited User Task metadata only | command refusals distinct from non-resumable malformed internal state | wrong-ID and duplicate Update results | nonempty data, stale child, unrelated instance, duplicate record/root |
| `CALL-OBSERVE-01` | public consequence of distinct invocation | exact called/caller/terminal observations | deliberately absent | independent unchanged projection | Query, receipt, zero-host-mechanism history, replay | future-command projection and identity erasure |

Lean and TypeScript must agree on exactly these facts after source admission: two root definitions with one caller entry; checked `calledProcessId`/root/entry binding; paired operations and virtual completion edge; injective called identity; exact caller/called link; owner-derived wait identity; caller-root top-level identity; no caller continuation before called quiescence; one return; 3/3/2 closure bounds; at most one enabled internal step on admitted states; empty-data, wrong-ID, and stale command preservation; malformed/duplicate internal no-successor preservation; hidden-state non-projection; and non-resumable orphan/stranded states. Lexical QName and namespace resolution belong to the TypeScript source-admission lane and are not independently verified by Lean.

They explicitly need not establish a CIB result, Temporal Child Workflow identity, imports, Global Tasks, mappings, Process-instance data, version/tenant selection, Errors or Escalations, cancellation, recursion, repetition, concurrency, arbitrary definition graphs, fairness, liveness, or a new public stimulus, wait, interaction, or outcome kind. Neither implementation may add an extra topology, counter, or scope premise not present in this matrix.

## Required, optional, and excluded surface

Required are the exact two-Process source profile and QName algorithm; checked definition forest and generic virtual completion edge; one closed Call Activity node; paired invoke/return operations; one hidden call record and activation counter; injective called semantic identity; owner-derived wait identity; empty-data guard; caller-root top-level public identity; unchanged observation shape; exact 3/3/2 and smaller-bound witnesses; Lean relations and useful laws; independent TypeScript semantics; root-Workflow/child-task address separation; one-Workflow Worker replacement, result recovery, bypass mutation, history assertion, and replay; inherited profile metadata `CIB-AGR-0001` and `CIB-OP-0001` for the existing User Task surface only; and same-change artifact/differential registration after the semantic checkpoint passes. Those reused relationship IDs provide no Call Activity CIB claim or evidence lane.

Optional only after this capsule closes is a separately reviewed CIB agreement probe. Ordinary CIB behavioral construction should use its pinned Java Model API builder and public task/runtime queries. Literal XML remains appropriate for project source admission because QName prefix/namespace resolution, exact omission, declaration order, and unsupported attributes are discriminators.

Excluded are unprefixed or external QNames; imports; Global Tasks; more than two Processes; more than one Call Activity; multiple None Starts; non-empty Starts; data or IO specifications, associations, mappings, or variables; overrides and Resource Roles; deployment/version/tenant selection; recursion and longer call graphs; repeated or concurrent invocation; loops and Multi-Instance; Boundary Events; Errors, Escalations, cancellation, termination, and compensation; Collaborations; general scopes inside the called Process; CIB compatibility; A12 adoption; Temporal Child Workflows; BPMN conformance; and production Event History compatibility.

## Versioning, common-mode risk, and cost boundary

This pre-release change replaces the current checked graph, definition-scope tree, Semantic Process operations, runtime state, wait identity derivation, decoders, schemas, source admission, lowering, structural/profile/definition binding, scope quiescence/interruption, host admission, client address validation, artifacts, differential catalogs, tests, the production lifecycle specification, and other owner documents atomically. No optional field, legacy reader, format counter, compatibility switch, migration function, Workflow patch, retained history, or fallback target resolver is permitted.

Before extending the near-limit general modules, implementation extracts cohesive owners for Call-specific source/QName projection, call graph/lowering admission, runtime invoke/return mechanics, and Lean Call Activity semantics/laws. Each owner has a narrow typed contract and focused red/green gate; the semantic checkpoint verifies that the existing compiler, lowering, evaluator, and Lean execution modules remain coordinators rather than acquiring this family as another responsibility.

The semantic checkpoint is mandatory before artifact and Temporal work because this capsule changes checked source, the IL, definition topology, runtime identity, public task IDs, quiescence, command addressing, and proof boundaries.

The dominant common-mode risk is collapsing the called Process into an embedded scope or root Workflow identity. The distinct first Query, owner-derived wait class guard, injective encoder theorem, identity-erasure mutation, and separate root/semantic task address explicitly discriminate that error. Lexical QName and namespace resolution remain a source-admission common-mode risk because Lean begins at the checked graph; pinned XSD validation, malformed/foreign-namespace negatives, target/root/entry swaps, and declaration permutation guard it, while independent Lean lowering starts only after `calledProcessId` exists. The third risk is early return around hidden live state; quiescence law, orphan non-resumability, and the caller-resume bypass guard it.

At closure, compare commit-bounded churn with the ordinary embedded Sub-Process completion capsule, the nearest recorded definition/runtime ownership increment. State the measured direction plainly; do not discount a larger result as reuse.

## Owner decision requested

After independent proposal review, approve or reject these choices together:

1. the exact two-Process, one-Call, two-User-Task, empty-data source profile and namespace-qualified QName algorithm;
2. rules `CALL-RESOLVE-01` through `CALL-OBSERVE-01` and the distinct called semantic Process-instance identity;
3. a canonical definition forest, paired `invokeProcess`/`returnProcess` operations, hidden call record, owner-derived waits, and unchanged observation schema;
4. one root Temporal Workflow with semantic child task addressing, no Child Workflow, and no new ingress;
5. standards-first Lean/TypeScript/Temporal evidence with CIB deliberately absent; and
6. the exact exclusions, mandatory semantic checkpoint, atomic pre-release replacement, and cost comparator above.

Implementation may begin only after the context-cold same-effort proposal review is approved, every required correction passes the same-reviewer audit without material redesign, and owner approval is recorded in this Status section.
