# Typed BPMN Error and interrupting boundary-error specification

## Status

Implemented current capsule contract; exact evidence status belongs in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md).

## Role

This specification owns the implemented semantic contract and retained decision record for one bounded typed business-error result and one matching interrupting BPMN Error boundary route. Exact implementation status belongs in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md), immediate sequencing belongs in [PLAN.md](../PLAN.md), and the A12 product denominator belongs in the [A12 Workflows compatibility ledger](../research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md).

The owner first approved the seven amended selections on 2026-07-27, conditional on the complete phase-zero CIB Seven `2.0.0` probe leaving every stop condition clear. The probe found that caught and unmatched Errors interact with output mapping differently from the selected account and correctly stopped production implementation. After reviewing that counterexample, the owner approved revised option 2 on 2026-07-27 with all six reviewer conditions: profile-scoped caught-error output mapping, discriminated null values, identical success/error patch validation, explicit evidence-independence limits, a mapping-free unmatched control, and atomic patch → mapping → cleanup → boundary ordering.

This is the second deliberate A12-shaped vertical feasibility slice. Its standard BPMN layer owns exact-code matching, interruption, normal-route abandonment, and boundary continuation. Its CIB Seven overlay owns the separately identified caught-path output-mapping extension and pinned unmatched-host facts. The exact bean token, target-shaped local patch, and migration comparison are downstream adoption evidence. These layers remain separable, and the capsule is not a precedent for implementing each remaining A12 model across Lean, TypeScript, Temporal, and CIB independently.

## Question

Can one A12-shaped Service Task return a typed business error whose exact code matches one attached interrupting boundary Error Event, causing normal Service Task completion to be abandoned and Process execution to continue through the boundary route, while preserving a strict separation from Temporal Activity failure, retry exhaustion, and CIB transaction rollback?

The smallest discriminator is project-authored MIT source with this topology:

```text
None Start
    ↓
Service Task
    ├─ normal success → None End
    └─ Error LinkLimitReachedError
          → User Task Handle Limit
          → None End
```

The User Task makes the chosen boundary route publicly observable without introducing a second effect, nested scope, Error End Event, or general expression requirement.

## Target evidence and corrected denominator

Four production A12 Kotlin delegate classes throw the Java API type `org.cibseven.bpm.engine.delegate.BpmnError`: `SendEmailDelegate`, `RelationshipLinkDelegate`, `DeleteRelationshipLinkDelegate`, and `RelinkDocumentDelegate`. All use non-empty string codes. Code-only construction occurs across the set; `RelationshipLinkDelegate` also supplies a non-empty message for `LinkLimitReachedError`, falling back to `Link limit reached`.

The exact observed codes are:

- `SendEmailError`;
- `LinkLimitReachedError`;
- `RelationshipLinkageError`.

The maintained A12 model corpus contains three Error Event Definitions, but they are not three boundary catches. Exactly one is an Error Boundary Event: it is attached to `CreateRelationshipLinkTask`, references `LinkLimitReachedError`, and flows to `ExpectedUserTaskAfterBPMNError`. The other two occurrences are Error End Events in valid and intentionally invalid travel-expense fixtures and therefore belong to a future propagation capsule.

This specification selects only `LinkLimitReachedError`, because the production delegate supplies that result and a maintained engine test fixture supplies the matching attached boundary catch. The fixture is part of the maintained migration surface but is not represented as a production Process model. `SendEmailError`, Error End Events, propagation to enclosing scopes, and catch-all boundaries remain outside this capsule. `RelationshipLinkageError` is a concrete same-delegate unmatched case and receives the explicit limitation below.

## Normative basis

BPMN 2.0.2 Clause 13.3.3 states that a Service Task fault is treated as an interrupting error and the Activity fails. Clause 13.5.3 states that boundary-event handling consumes the event, cancels the attached Activity when `cancelActivity` is set, and follows the boundary Sequence Flow. Table 10.91 says `cancelActivity` cannot be applied to Error Events because it is always true, and Table 10.92 permits only true for Error. The Error Event Definition rules require a boundary Error with a code to catch only a matching Error, while a boundary Error without a code catches any Error.

The selected account is the exact-code, same-Process, Task-attached case. The capsule does not decide the standard's unspecified behavior for an unhandled Error and does not claim nested-scope propagation. Official OMG issues [BPMN21-211](https://issues.omg.org/issues/BPMN21-211), [BPMN21-227](https://issues.omg.org/issues/BPMN21-227), and [BPMN21-436](https://issues.omg.org/issues/BPMN21-436) concern broader Error consistency, `cancelActivity` wording, and catcher scope; they do not change this bounded proposition and remain reasons not to generalize it.

## Required scope

- a distinct immutable CIB Seven `2.0.0` A12 profile;
- one project-authored MIT fixture shaped after the product mechanism without copying A12 source;
- exact source handler token `#{createRelationshipLinkDelegate}`;
- profile-specific recognition of that exact deferred-expression token, with the wrong `${...}` sigil rejected;
- profile-registered neutral Activity protocol and mapped-boundary-error operation;
- one literal string input mapping and one simple local-reference output mapping;
- one attached interrupting boundary Error Event;
- one referenced root Error with exact code `LinkLimitReachedError`;
- one typed business-error result with a non-empty code, required nullable non-empty message, and a validated Activity-local patch;
- a discriminated string-or-null variable value domain that keeps absence, null, and the empty string distinct;
- exact-code matching only;
- abandonment of the normal Service Task output route;
- continuation through the boundary route to one observable User Task;
- direct Lean and TypeScript mismatch refusal with exact state preservation;
- Temporal refinement in which the Activity completes successfully with the typed business result;
- release-specific CIB Seven `2.0.0` host evidence for synchronous delegate error handling;
- a successful-mapping control plus error-path sentinel and null local-write discriminators proving that the CIB-specific profile applies the configured output mapping before Activity-local cleanup;
- a mapping-free unmatched control that isolates default unhandled-`BpmnError` behavior from output-mapping failure;
- one answer-free differential scenario and the required negative mutations;
- same-change disposition of `BPMN-SERVICE-TASK-FAULT-01`, a new bounded boundary-error requirement row, and the five reserved CIB relationship entries after the probe establishes their facts.

## Excluded scope

Catch-all Error boundaries, multiple Error handlers, multiple effects, multiple active occurrences, Error End Events, Intermediate Throw Events, Event Sub-Processes, Sub-Processes, Call Activities, nested-scope propagation, escalation, compensation, transactions, multi-instance Activities, retry exhaustion as semantics, incidents as semantics, technical exceptions as business errors, general service faults, cancellation recovery, Process-variable error-code/message projection, `camunda:errorMessageVariable`, `camunda:errorCodeVariable`, general JUEL, general delegates, external tasks, scripts, listeners, delegate-side Process-scope writes before an Error, arbitrary variables beyond the one string mapping pair, the exact complete A12 relationship model, and Java binary compatibility are excluded.

The exact A12 relationship model is not admitted by this capsule. It contains five Process-variable input expressions, an Exclusive Gateway, other variables, and `camunda:errorCodeVariable=""`. Those facts remain migration inputs, not content to drop or normalize silently. The project-authored literal input is a discriminator that reuses the already-approved mapping mechanism; it does not claim admission of the target's input-expression subset.

The production `RelationshipLinkDelegate` writes Activity-local `newLinkId = null` before either business Error. Phase zero disproved the earlier patchless, string-only account: CIB Seven `2.0.0` maps a non-null pre-error local sentinel into Process scope before routing to the boundary User Task, and the target-shaped null write creates a present null-valued Process variable. The owner therefore selected a profile-scoped extension in which the Worker reports the pre-error Activity-local patch and the semantic program remains the authority that applies the committed output mapping. A delegate-side Process-scope write remains separately excluded.

## Source profile

The implemented capsule uses the distinct immutable profile `cibseven-2.0.0-a12-boundary-error-draft`. It does not mutate the CreateDocument profile or any `2.2.0` profile.

The project-authored fixture admits:

- one private executable Process with the exact topology shown above;
- one Service Task carrying exact delegate-expression token `#{createRelationshipLinkDelegate}`;
- registered neutral descriptor `urn:bpmn-lean:effect-protocol:activity-v1` plus `urn:bpmn-lean:effect-operation:mapped-boundary-error-v1`;
- one input parameter `relationshipModel = "RelationshipModel"` normalized as a string literal;
- one output parameter `relationshipLinkId = ${newLinkId}` normalized as a simple Activity-local reference;
- one Boundary Event attached to that Service Task;
- `cancelActivity` omitted as in the target fixture, with lexical `true` tolerated as redundant and lexical `false` rejected;
- exactly one Error Event Definition referencing exactly one root Error;
- exact root Error code `LinkLimitReachedError`;
- exactly one outgoing boundary Sequence Flow and no incoming boundary flow;
- no error-code or error-message variable extension;
- no other executable extension content.

The lexical forms `${name}` and `#{name}` are not interchangeable source-profile tokens. CIB/JUEL classifies `${...}` as immediate syntax and `#{...}` as deferred syntax even though the delegate-expression host evaluates the selected expression when invoking the Service Task. This profile accepts only exact `#{createRelationshipLinkDelegate}` and rejects `${createRelationshipLinkDelegate}` as a hostile wrong-sigil control. After exact profile admission, the registered neutral Activity/mapped-boundary-error descriptor enters the checked graph; the raw bean token and sigil do not enter `EffectDescriptor`. The CreateDocument profile independently retains exact `${createDocumentDelegate}` and maps it to its own neutral operation. These registrations are not a claim of general JUEL evaluation or lexical equivalence, and Lean does not independently derive them.

The checked source retains the mapping bodies, Boundary Event ID and optional name, attachment, Error Event Definition ID and reference, root Error ID, optional name, exact code, boundary Sequence Flow, and exact BPMN element provenance. The target's `BoundaryEvent.name="Error Event"` and `Error.name="Link Limit Reached"` are source metadata, not matching keys. A name change changes exact source identity but not runtime matching. Admission rejects a missing or unresolved reference, a different code, `cancelActivity="false"`, a second handler, a catch-all definition, an unattached event, the wrong expression sigil, or foreign executable content.

The source compiler manifest must add only the CMOF facts consumed by this profile: `BaseElement.id`, `Definitions.rootElements`, `BoundaryEvent.attachedToRef`, `BoundaryEvent.cancelActivity`, `ErrorEventDefinition.errorRef`, `Error.name`, and `Error.errorCode`, together with the corresponding `BoundaryEvent`, `ErrorEventDefinition`, and `Error` classes. `BoundaryEvent.name` is already covered by inherited `FlowElement.name`; `ErrorEventDefinition.id` is covered by inherited `BaseElement.id`.

## Reusable IL mechanism

The capsule does not add a standalone `error`, `boundaryError`, or CIB-specific operation. It extends `awaitEffect` with one optional source-derived route:

```ts
type BpmnErrorRoute = Readonly<{
  code: "LinkLimitReachedError";
  output: string;
  origin: Readonly<{
    kind: "bpmnElement";
    boundaryEventId: string;
    errorElementId: string;
    sequenceFlowId: string;
  }>;
}>;

type AwaitEffect = OperationBase & Readonly<{
  kind: SemanticOperationKind.AwaitEffect;
  input: string;
  output: string;
  effect: Readonly<{
    elementId: string;
    descriptor: EffectDescriptor;
    inputMappings: ReadonlyArray<VariableMapping>;
    outputMappings: ReadonlyArray<VariableMapping>;
  }>;
  bpmnErrorRoute: BpmnErrorRoute | null;
}>;
```

Existing `awaitEffect` operations receive `bpmnErrorRoute: null` in the atomic pre-release wire evolution. The field is singular because this capsule admits exactly one handler. A second handler, catch-all behavior, or scope propagation reopens the representation decision.

The route is committed definition data. It is not exposed in `EffectRequest`, selected by the Worker, inferred from a host exception, or reconstructed from a Temporal identifier.

## Typed effect result

The existing string value becomes one branch of a closed variable-value union:

```ts
enum VariableValueKind {
  String = "string",
  Null = "null",
}

type VariableValue =
  | Readonly<{
      kind: VariableValueKind.String;
      value: string;
    }>
  | Readonly<{
      kind: VariableValueKind.Null;
    }>;
```

This is not `string | null`. The closed discriminator lets every strict decoder distinguish absent binding, present null, and present empty string and gives canonical identity three distinct encodings.

The current success result becomes one branch of a closed effect-result union:

```ts
enum EffectExecutionResultKind {
  Success = "success",
  BpmnError = "bpmnError",
}

type EffectExecutionResult =
  | Readonly<{
      kind: EffectExecutionResultKind.Success;
      localPatch: readonly VariableBinding[];
    }>
  | Readonly<{
      kind: EffectExecutionResultKind.BpmnError;
      code: string;
      message: string | null;
      localPatch: readonly VariableBinding[];
    }>;
```

String values and Error fields admit Unicode scalar strings; the code is non-empty. `message` is always present and is either `null` or non-empty; absence and an empty message are invalid. The business-error patch is the Worker-reported Activity-local state immediately before the Error. Both result branches pass through the same patch validator, required-local-name check, duplicate detection, canonical sorting, and rejection-with-state-preservation path.

The Worker returns only the typed result and never Process-scope state. The semantic program remains mapping authority: the semantic core decides whether the route matches, validates the local patch, applies the committed output mapping, and owns every state transition.

## Semantic transition

For one active effect occurrence and one business-error result:

1. validate the complete effect occurrence identity through the existing `completeEffect` command;
2. require the Process to be running and the occurrence to remain active;
3. require `result.code` to equal the committed route code;
4. validate and canonically sort `result.localPatch` through the same function used by successful completion;
5. atomically install that Activity-local patch;
6. atomically apply the committed Service Task output mapping to Process scope;
7. atomically remove the active effect occurrence, committed intent, and Activity-local scope;
8. produce no token on the Service Task normal output;
9. produce one token on the boundary route output;
10. continue ordinary supported closure to the boundary User Task.

The optional message is content-bound and available to evidence, but it does not participate in matching and is not projected into Process variables.

An occurrence mismatch, unmatched Error code, malformed patch, undeclared local name, or duplicate local name is rejected by the pure semantic accounts with exact state preservation. Rejection is not normal Service Task completion and does not create the boundary token.

This CIB-specific profile selects one atomic transition ordered patch → output mapping → Activity-local cleanup → boundary token. No intermediate state is observable. The output-mapping step is a selected CIB extension to the capsule's BPMN cancellation account; a BPMN-only profile may drop `BERROR-CIBMAP-01` while retaining the interrupting catch. Reopen the ordering before admitting concurrent handlers, cancellation observers, listeners, or any projection that can distinguish intermediate steps.
## Stable semantic rules

### `BERROR-CATCH-01`

A matching `bpmnError` result for the active occurrence consumes the effect intent, produces no normal Service Task output, produces one boundary-route token, and closes to the boundary handler.

### `BERROR-INTERRUPT-01`

The matching interrupting boundary result abandons the normal Service Task output route, removes Activity-local state, and follows only the boundary Sequence Flow.

### `BERROR-CIBMAP-01`

For this CIB-specific profile, the validated pre-error Activity-local patch is installed and the committed Service Task output mapping is applied before local cleanup. The target-shaped null patch therefore creates a present null-valued Process variable `relationshipLinkId`; absence, null, and the empty string remain distinct.

### `BERROR-MESSAGE-01`

The optional non-empty message is preserved in command identity and evidence but neither affects code matching nor enters Process variables.

### `BERROR-REFUSE-01`

An occurrence-identity mismatch, inactive or consumed occurrence, or non-matching Error code is rejected with exact semantic-state preservation.

### `BERROR-OBSERVE-01`

The committed Error route remains definition-only. The active waiting projection retains the existing `openEffects` shape and exposes neither the configured Error code nor any future result message. After a matching result, canonical state exposes the boundary User Task and the Process variables produced by the committed mapping; code and message remain command/evidence data rather than canonical state.

## Declarative Lean account

The declarative `EffectCompletionStep` relation gains one constructor for a matching business-error route. The executable evaluator gains the corresponding branch, and a soundness theorem proves that every evaluator-produced business-error transition is permitted by the relation.

Checked laws:

- a quantified matching theorem over program, state, active occurrence, route, command ID, code, optional message, and logical time;
- exact absence of the normal output and exact presence of the boundary output;
- exact validated error-patch handling with rejection and state preservation for an undeclared local;
- exact null-valued `relationshipLinkId` after the Error branch while distinguishing absence, null, and the empty string;
- a quantified mismatch theorem over occurrence identity and Error-code inequality with exact state preservation.

The nearest checked non-law uses one state and both accounts: a deliberately wrong evaluator treats a `bpmnError` result as success and reaches the normal End Event, while the real evaluator opens the boundary User Task. A theorem that merely constructs a boundary token is insufficient.

## Command identity

The existing `completeEffect` command already encodes successful results as `[kind, patchTuples]`. That success branch, its raw Worker-result patch order, its domain prefix, and every existing digest byte remain unchanged. Patch validation and canonical sorting remain semantic-core responsibilities after command identity has been derived; the adapter does not sort the raw Worker result.

The new business-error branch uses the shared canonical encoder:

```text
business error without message:
  ["bpmnError", code, ["none"], patchTuples]

business error with message:
  ["bpmnError", code, ["some", message], patchTuples]
```

Each patch tuple is `[name, ["string", value]]` or `[name, ["null"]]`. The command identity binds the raw Worker-result patch order, as the existing success branch does; validation and canonical sorting remain semantic-core work. Existing successful-result bytes and digests remain under their current literal locks; no success reshaping or retained-evidence change is authorized. The new branch receives known literal locks for code-only, message-bearing, null, absent, and empty-string distinctions.

Required mutations:

- omit or substitute the Error code;
- substitute the message or collapse `null` and a present message;
- omit the patch, substitute null with absence or the empty string, or name an undeclared Activity-local variable;
- treat the business-error branch as the success branch;
- synthesize the boundary result without the required completed Activity history;
- leak the configured code or returned message into `openEffects` or Process variables.

## Temporal refinement

The committed core state remains the Workflow state. While the Activity is in flight, the same effect intent and optional boundary route remain active and unchanged.

A business error is not a failed Temporal Activity. The Activity resolves successfully with the typed `bpmnError` result. The Workflow derives the content-bound `completeEffect` stimulus exclusively from the committed intent and the returned typed result, applies it through the semantic core, and observes the boundary User Task.

Activity transport failure, retry, timeout, Worker loss, and exhausted attempts retain the existing adapter meaning. They do not create `bpmnError`, do not open the boundary route, and on exhaustion fail the Workflow with the existing typed adapter reason while leaving the last committed semantic state unchanged.

The separating mutation throws a Temporal `ApplicationFailure` instead of returning `bpmnError`. The Activity retries or exhausts and the boundary User Task must remain absent.

If an Activity successfully returns a non-matching business-error code, the core refuses it. The Workflow then fails with typed adapter reason `BPMN_UNHANDLED_BPMN_ERROR`, produces no canonical semantic result or completed receipt, and does not retry the already successful Activity. This is a bounded safety disposition, not a claim about BPMN's unspecified unhandled-Error behavior or CIB compatibility. It is already a concrete target incompatibility: the same `RelationshipLinkDelegate` returns unmatched `RelationshipLinkageError` from the modeled `CreateRelationshipLinkTask` on `IOException`, while default CIB handling does not fail the Workflow-equivalent host execution.

Workflow cancellation or termination while the Activity is in flight retains the existing unsupported cancellation-recovery boundary. The stable effect transport key remains the reconciliation lever, but this capsule does not claim recovery.

## CIB Seven `2.0.0` relation

CIB Seven exposes a different host transaction boundary from Temporal. In the selected synchronous delegate account, starting the Process invokes the delegate inside the engine command. A matching `BpmnError` is found by the engine exception handler, caught by the exact Error Event Definition, and routed to the boundary User Task in the same command. No async continuation, job retry, or incident is part of the selected witness.

The CIB phase-zero lane establishes:

- warning-free deployment of the project-authored exact profile source;
- engine-derived Service Task, boundary attachment, root Error reference, and matching code;
- synchronous delegate invocation with code-only and message-bearing `BpmnError`;
- a successful control in which local `newLinkId` maps to Process `relationshipLinkId`;
- an Error-path proxy that writes Activity-local `newLinkId = "must-not-map"` before throwing, after which CIB executes the configured output mapping and exposes Process `relationshipLinkId = "must-not-map"`;
- boundary User Task presence;
- absence of the normal End path;
- Process continuation after completing the boundary User Task.

The CIB lane does not expose a committed project effect intent, typed `completeEffect` command, Temporal Activity result, or independent optional-message semantic account. The code and message are probe-script inputs. CIB therefore supplies a host-realization check, not an independent derivation of the project-owned intermediate state or command.

The following relationship identifiers are reserved for same-change creation after a green probe:

- `CIB-AGR-0005` — bounded normative agreement for the exact-code interrupting Error Boundary Event;
- `CIB-EXT-0003` — the exact deferred delegate-expression token and Java `BpmnError(code, message?)` delegate API selected by this profile;
- `CIB-EXT-0004` — profile-scoped application of the Service Task output mapping to the reported pre-error Activity-local patch during interrupting Error handling;
- `CIB-OP-0003` — synchronous same-command matching Error handling mapped to the durable effect boundary;
- `CIB-CFG-0004` — default unmatched-`BpmnError` host behavior under the pinned A12 CIB Seven `2.0.0` configuration.

`CIB-EXT-0004` is intentionally not recorded as normative agreement. BPMN 2.0.2 specifies interruption/cancellation and the Error boundary route but does not define Camunda input/output extension execution during that cancellation. The selected CIB engine executes output parameters inside `ExecutionEntity.destroy(false)` before clearing Activity-local state. The project adopts that behavior only in this A12 migration profile because the target delegate writes `newLinkId = null`, absent and present-null are observably different in CIB expression resolution, and keeping mapping authority in the semantic program avoids moving Process semantics into the Worker. This is a visible candidate deviation from the capsule's BPMN-only cancellation reading, not a claim that general BPMN requires fault-path output mapping.

The five register entries were added only after the probe established their release-specific facts. The profile artifact names all five IDs, and the register entries, profile declarations, and verifier coverage land together. Graduation changes `BPMN-SERVICE-TASK-FAULT-01` from unsupported to the exact bounded disposition and adds `BPMN-BOUNDARY-ERROR-01` for the matching interrupting route; neither row implies general service faults or Error propagation.

## Unhandled Error boundary

CIB Seven `2.0.0` has `enableExceptionsAfterUnhandledBpmnError=false` by default. Its source logs an unmatched `BpmnError` and calls `execution.end(true)`; setting the flag to `true` instead turns the condition into command failure. A12 does not visibly override the default in the registered repository. Under the selected mapping fixture, however, scope destruction then evaluates `${newLinkId}` after the Activity-local value is no longer available. The start command fails and rolls back with `Cannot resolve identifier 'newLinkId'`; no runtime or historic Process, task, job, incident, activity, or variable remains. The previously proposed clean default final state is therefore not the behavior of the complete selected fixture.

This capsule does not select default CIB behavior as semantic authority and makes no CIB differential-equality claim for an unmatched Error. The known target case is `RelationshipLinkageError` from the same `CreateRelationshipLinkTask`; it is not caught anywhere in the maintained corpus. The selected Temporal adapter failure remains a different mechanism. A mapping-free control isolates CIB's default `execution.end(true)` result from the mapped fixture's later output-mapping failure; the latter rolls the start command back because `${newLinkId}` is no longer resolvable. These are distinct configuration facts and must not be summarized as one general unmatched-Error behavior. A separate owner decision remains required before claiming compatibility for this path, `SendEmailError`, or any other target path without a matching catcher.

## Phase-zero probe obligations

Before formalization or production implementation:

1. deploy the project-authored exact fixture under packaged CIB Seven `2.0.0` with no parser warning;
2. derive the Service Task ID, exact deferred-expression token, mapping pair, boundary attachment, Boundary Event name, Error Event Definition ID, root Error identity/name/code, and outgoing boundary flow from the deployed model;
3. execute a successful control whose Activity-local `newLinkId = "Link:42"` maps to Process `relationshipLinkId = "Link:42"`;
4. prove that a matching code-only `BpmnError`, after the proxy writes Activity-local `newLinkId = "must-not-map"`, reaches the boundary User Task synchronously with no job, incident, or normal completion and with Process `relationshipLinkId = "must-not-map"` produced by the configured output mapping;
5. prove the same route for a message-bearing `BpmnError`, retain the exact message as raw probe input, and prove that a target-shaped Activity-local null creates a present null-valued Process `relationshipLinkId`;
6. perturb the derived Error code and boundary attachment independently and require comparison failure; confirm the selected `#{createRelationshipLinkDelegate}` resolves in CIB while the project importer rejects `${createRelationshipLinkDelegate}` as a wrong-sigil source;
7. throw concrete unmatched `RelationshipLinkageError` from the modeled Service Task under the exact default configuration and record the final Process-instance existence/completion, task set, job/incident set, normal/boundary path absence, and Process variables;
8. repeat the unmatched control with the output mapping removed, leaving the Error route and default configuration unchanged, and record the final host state separately from the mapped fixture;
9. probe the registered external A12 boundary model's `camunda:errorCodeVariable=""` under the exact target engine, determining whether the variable layer accepts the empty name.

CIB parsing stores the empty `errorCodeVariable` without warning because both parser and handler guard only against `null`. The variable layer accepts the empty name; after a matching catch, the active Process exposes `"" = "LinkLimitReachedError"` alongside the output-mapped sentinel. The final obligation does not authorize exact external model execution as project evidence, admission of the extension, or copying the source. It prevents the importer from silently ignoring a target-specific executable attribute.

## Phase-zero result and stop

The project-authored model deploys warning-free under packaged CIB Seven `2.0.0`. The retained projector derives the Service Task, exact `#{createRelationshipLinkDelegate}` token, protocol, mapping pair, boundary attachment/name, Error Event Definition, root Error identity/name/code, and boundary output flow from deployment state. Independent Error-code and attachment perturbations fail the profile comparison. Success maps `newLinkId = "Link:42"` to Process `relationshipLinkId = "Link:42"`, and both code-only and message-bearing matching Errors synchronously reach the boundary User Task without a job or incident.

The mapping-suppression obligation fails. On both caught Error forms, `ExecutionEntity.destroy(false)` executes the Service Task output mapping before clearing the Activity execution, so the pre-error local sentinel becomes Process `relationshipLinkId = "must-not-map"`. A separate target-shaped control writes Activity-local `newLinkId = null`; the output mapping creates a present Process variable `relationshipLinkId = null`. This is engine-observed behavior backed by the packaged probe and the pinned source path `BpmnExceptionHandler.propagateError → executeActivity(errorHandlingActivity) → ExecutionEntity.destroy → IoMapping.executeOutputParameters`.

The unmatched-final-state assumption also fails under the complete fixture. Default unmatched handling calls `execution.end(true)`, but subsequent scope destruction tries to evaluate `${newLinkId}` without the Activity-local binding. The start command fails and rolls back completely. The required mapping-free control removes only the output parameter: the same unmatched Error then ends without a runtime Process, active task, job, incident, normal End execution, or boundary-task execution; it retains one ended historic Process plus the Activity-local `relationshipModel = "RelationshipModel"` and `newLinkId = "must-not-map"` history values. This separates default unhandled handling from the selected output-mapping extension and confirms that mapping evaluation is the rollback mechanism in the complete fixture.

These findings reopened the approved account and the stop prevented an unreviewed semantic change. The owner subsequently approved revised option 2 with the six conditions recorded in the role and owner-decision sections. The complete seven-test phase-zero probe, including the mapping-free unmatched control, is green, and the implemented capsule preserves the revised account.

## Cross-target scenario and evidence relation

The pipeline gains one answer-free `service-task-boundary-error` scenario:

1. start one Process instance;
2. supply one `completeEffect` result with code `LinkLimitReachedError`, a non-empty message, and Activity-local `newLinkId = null`;
3. complete the resulting boundary User Task.

The scenario evaluates the fixture's literal `relationshipModel` input into Activity-local state. Lean and the TypeScript core validate the returned null patch, apply the committed output mapping, clear local state, and route to the boundary User Task. Temporal receives no result from the runner: its probe Activity returns the typed business result, and the Workflow derives the identical content-bound stimulus from committed intent. CIB's synchronous caught-Error path writes the same target-shaped null local value and exposes the same final Process variable through its extension output mapping.

The expected relation is:

- Lean and the TypeScript core agree exactly on the semantic transition;
- Temporal preserves the same core-visible result and final state, with a completed Activity and replay evidence;
- CIB agrees on the engine-observed boundary User Task and final host state only;
- `BERROR-REFUSE-01` mismatch space is exercised by Lean and the TypeScript core, plus a focused Temporal adapter-failure witness for a returned unmatched code;
- Activity failure versus returned business error is a focused Temporal mechanism witness, not a CIB comparison.

The declared-target pipeline keeps one boundary-error semantic scenario with two isolated Temporal executions and replays only its primary history. The successful-mapping control remains a phase-zero and focused semantic witness rather than another pipeline scenario. No additional transport-only scenario is present; repository-wide live matrix counts belong to [the testing specification](../TESTING-SPEC.md#complete-differentialrefinement-pipeline).

Retained CIB evidence is generated only through the explicit replacement command, belongs to the `2.0.0` release group, and is content-bound to the project-authored fixture and answer-free scenario. External A12 bytes remain outside the MIT evidence artifact.

## Rule-to-evidence matrix

| Rule | BPMN/profile clause | Lean | TypeScript core | CIB Seven `2.0.0` | Temporal | Negative witness |
|---|---|---|---|---|---|---|
| `BERROR-CATCH-01` | Exact-code Error catch and interrupting boundary handling | Declarative relation, evaluator soundness, quantified matching theorem, exact trace | Independent matching branch and exact trace | Engine-observed boundary User Task and normal-path absence; host realization only | Successful typed Activity result, core-visible boundary state, history, replay | Treat `bpmnError` as success or synthesize it without completed Activity history |
| `BERROR-INTERRUPT-01` | Attached Activity is interrupted and boundary Sequence Flow is followed | Exact normal-output absence, local cleanup, and boundary route | Independent normal-route abandonment and cleanup | Engine-observed boundary User Task and normal-path absence | Same core-visible route after completed Activity | Treat `bpmnError` as normal success |
| `BERROR-CIBMAP-01` | Selected CIB extension, not general BPMN | Direct transcription of validated patch → mapping → cleanup → boundary ordering | Independent transcription plus undeclared-local refusal | Source of the selected account: engine-observed sentinel/null output mapping; not independent evidence | Preserves core-owned mapping after the Activity result | Undeclared local, null/absence/empty-string confusion, or Worker-authored Process patch |
| `BERROR-MESSAGE-01` | Profile result shape; message is not the matching key | Quantified optional-message theorem | Strict `null`/non-empty admission and command identity | Message is probe-script input; the selected boundary route remains engine-observed | Activity result and content-bound command evidence | Omit the field, collapse `null` with a value, or substitute the message |
| `BERROR-REFUSE-01` | Exact-code profile restriction; unhandled standard behavior remains unspecified | Quantified identity/code mismatch with state preservation | Independent refusal and state preservation | No semantic-equality claim; configuration facts only | Returned unmatched code becomes typed adapter failure without Activity retry | Code substitution and occurrence-identity mutations |
| `BERROR-OBSERVE-01` | Definition/runtime observation boundary | Exact unchanged wait and mapped boundary-state projections | Exact `openEffects`, User Task, and null-valued Process-variable projections | Host wait is not a semantic account; boundary User Task and variables are engine-observed | Same core projections plus history-bound result | Leak configured code or returned message into `openEffects` or Process variables |

No row counts CIB, Lean, TypeScript, and Temporal as four independent semantic derivations. Lean supplies the reviewed formal account, TypeScript independently transcribes it, CIB supplies the bounded engine host relation, and Temporal supplies refinement and replay evidence over the TypeScript core. For `BERROR-CIBMAP-01`, CIB is the source of the selected profile account and therefore cannot also count as independent evidence for it; the non-CIB evidence is the Lean/TypeScript transcriptions, strict patch/null negative witnesses, and Temporal preservation.

## Runtime-only and synthetic constructs

| Construct | Source or derivation | Owner | Public projection | Lifecycle |
|---|---|---|---|---|
| `bpmnErrorRoute` | Checked Boundary Event, root Error, and boundary Sequence Flow | Semantic program | None directly | Created during lowering; immutable for the Process definition |
| `bpmnError` result | Worker business result | Effect-result contract | Command outcome and resulting canonical state | Exists only as command input and retained adapter result |
| Pre-error local patch | Worker result validated against committed required local names | Semantic core | Process values only after program-owned output mapping | Installed, mapped, and cleared atomically during one accepted Error transition |
| Null variable value | Explicit discriminated `VariableValueKind.Null` | Shared semantic contract | Present null-valued binding | Preserved distinctly from absence and empty string until overwritten or scope cleanup |
| Optional message | Worker business result | Effect-result contract | Evidence and command identity only | Retained with the command result; never becomes a Process variable |
| CIB local-write sentinel | Phase-zero proxy script | CIB host | Raw evidence and observed mapped Process variable | Written before the proxy throws; CIB output mapping copies it to Process scope on the caught path |
| CIB Java exception | Probe delegate | CIB host | Raw probe evidence | Exists within one synchronous engine command |
| Temporal Activity result | Completed Activity | Temporal adapter | Durable history and harness evidence | Replayed from Event History |
| `BPMN_UNHANDLED_BPMN_ERROR` | Successful host result refused by the core | Temporal adapter | Workflow failure only | Ends the Workflow Execution without semantic completion |

## Versioning consequences

Implementation uses one atomic pre-release replacement of the checked-graph, Semantic Process, effect-result, stimulus, scenario, observation, schema, decoder, command-identity, and evidence contracts. Existing effect operations carry explicit `bpmnErrorRoute: null`; no compatibility reader, format counter, legacy union, or Workflow patch branch is retained.

The new profile has its own semantic-profile identity and CIB release group. Existing profile identities and successful command bytes remain unchanged. Graduation to this `-SPEC` records that the phase-zero facts, semantic account, CIB host relation, five relationship-register entries, requirement-ledger dispositions, Temporal refinement, retained evidence, mutations, reflection, and complete gate are green.

## Common-mode risks

- The project-authored fixture and source rules could encode the same mistaken attachment or code relation. The CIB probe must derive those fields from deployment state rather than reconstruct them from constants.
- Lean and TypeScript could share a fixture-specific code literal. Quantified matching and mismatch laws plus code-substitution mutations must vary the code.
- All hosts could conflate business error and infrastructure failure. The Temporal `ApplicationFailure` mutation must prove that only a successful typed Activity result can open the boundary route.
- The exact A12 empty error-variable attribute could be dropped as harmless metadata. The external probe is mandatory before any unchanged-admission claim for that model.
- CIB's synchronous command transaction and Temporal's durable Activity boundary could be summarized as equivalent. Evidence must retain the host-specific relation and avoid rollback-equivalence language.
- The Error path could appear to preserve or map Process data only because no mapping or local value existed. The same fixture's success control, raw local-write sentinel, target-null witness, mapping-free unmatched control, and undeclared-local mutation make those classes of false agreement observable.
- CIB could be counted both as the source of `BERROR-CIBMAP-01` and as independent corroboration. The rule-to-evidence row explicitly prohibits that double counting.
- `${...}` and `#{...}` could be normalized before profile admission. The wrong-sigil source mutation must reject before handler normalization.

## Stop conditions

Stop for owner direction if:

- packaged CIB Seven `2.0.0` cannot reproduce the exact matching catch without parser warnings;
- matching CIB handling requires a job retry, administrative execution, or incident;
- Temporal can represent the business error only as a failed Activity;
- the route or match depends on a CIB job ID, Temporal Run ID, Activity attempt, or other host identity;
- the target evidence requires a delegate-side Process-scope write before the Error;
- aligning the accounts requires changing existing success semantics, lifecycle completion, closure order, or wire behavior for proof convenience;
- the A12 empty error-variable attribute would be ignored, normalized, or admitted without an explicit profile decision;
- the focused or complete gate exceeds an existing feedback budget without an owner-approved treatment;
- implementation requires a new dependency.

## Owner decisions

The owner approved these seven selections on 2026-07-27:

1. select the project-authored target-shaped fixture with the literal-input/simple-output mapping pair, exact deferred `#{createRelationshipLinkDelegate}` token, exact `LinkLimitReachedError` catch, distinct `2.0.0` profile, wrong-sigil rejection, and unchanged external-model exclusion;
2. extend the effect-result union with non-empty `code` plus required nullable non-empty `message`; this original patchless wording was superseded by revised option 2 below;
3. extend the exact current `awaitEffect` shape with one optional committed `bpmnErrorRoute`, select atomic consume/cancel/follow ordering, and apply the exact interrupting transition and observation contract above;
4. require pure-account mismatch refusal and use typed `BPMN_UNHANDLED_BPMN_ERROR` only as adapter failure for a successful but semantically unmatched Activity result, explicitly recording the concrete `RelationshipLinkageError` divergence from default CIB behavior;
5. classify CIB as a synchronous host-realization check, reserve `CIB-AGR-0005`, `CIB-EXT-0003`, `CIB-OP-0003`, and `CIB-CFG-0004`, update the requirement ledger on graduation, and require the strengthened phase-zero probe including successful mapping, pre-error local write, exact default unmatched final state, and the A12 empty error-variable fact;
6. require Temporal to carry business error as a successful typed Activity result and retain infrastructure failure/retry exhaustion outside semantic outcomes;
7. add the one answer-free Error scenario with the selected caught-path mapping and local-cleanup evidence, the exact lane relation, observation and mechanism mutations, the ten-scenario/twenty-execution/twelve-replay matrix, and explicit evidence replacement.

Phase zero invalidated the mapping-suppression premise shared by selections 3, 5, and 7 and the clean unmatched-host-state premise in selection 4. The reviewed competing accounts were:

1. retain normative mapping suppression in Lean/core/Temporal and classify CIB's output-mapping behavior as a bounded host divergence, with a case-specific CIB relation that expects `relationshipLinkId = "must-not-map"`;
2. include Service Task output mapping in the project Error semantics for this CIB-specific profile, add the exact pre-error Activity-local patch to the business-error result, and widen the bounded value domain to represent the target's null; this accepts the engine extension behavior without treating it as BPMN's general fault meaning;
3. remove output mapping from this capsule and defer the target-shaped mapping/error interaction, reducing migration evidence and losing the discriminator that found the conflict.

On 2026-07-27 the owner selected revised option 2 and rejected options 1 and 3. The rationale is evidence- and migration-specific: CIB's identifier resolver distinguishes an absent `newLinkId` from a present null, the target delegate writes null on both modeled Error branches, and the target corpus consumes related null semantics. Suppressing the mapping would therefore bake a known migration incompatibility into an immutable profile, while removing the mapping would discard the discriminator that exposed it. The Worker still reports only Activity-local state; mapping authority remains in the semantic program.

The revised approval binds these six conditions:

1. `BERROR-INTERRUPT-01` owns normal-route abandonment and local cleanup; separate `BERROR-CIBMAP-01` owns profile-scoped caught-error output mapping and is classified as `CIB-EXT-0004`, with the BPMN candidate-deviation boundary kept visible.
2. Null is a closed discriminated `VariableValue` variant, never `string | null`; absent, null, and empty string have distinct decoder and digest behavior.
3. Business-error patches pass through the same validator, required-local-name check, sorting, and state-preserving rejection path as successful patches, including an undeclared-local mutation.
4. CIB is the source of the `BERROR-CIBMAP-01` account and is not counted as independent evidence for it.
5. A mapping-free unmatched control establishes default unhandled-Error behavior separately from the mapped fixture's output-mapping rollback.
6. The semantic transition is one atomic patch → mapping → cleanup → boundary operation with no implied intermediate state.

The earlier selection 2 wording “with no business-error patch” and every mapping-suppression consequence are superseded. The implemented capsule follows revised option 2 after the mapping-free phase-zero control passed.
