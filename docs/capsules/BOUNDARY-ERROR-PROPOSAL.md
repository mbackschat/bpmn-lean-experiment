# Typed BPMN Error and interrupting boundary-error proposal

## Role

This proposal owns the owner decision for one bounded typed business-error result and one matching interrupting BPMN Error boundary route. Exact implementation status belongs in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md), immediate sequencing belongs in [PLAN.md](../PLAN.md), and the A12 product denominator belongs in the [A12 Workflows compatibility ledger](../research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md).

No error semantics are approved or implemented by this document. Approval would authorize only the exact account below and would require a green phase-zero CIB Seven `2.0.0` probe before source, IL, runtime, or adapter implementation begins.

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

Four production A12 delegate classes throw `org.cibseven.bpm.engine.delegate.BpmnError`: `SendEmailDelegate`, `RelationshipLinkDelegate`, `DeleteRelationshipLinkDelegate`, and `RelinkDocumentDelegate`. All use non-empty string codes. Code-only construction occurs across the set; `RelationshipLinkDelegate` also supplies a non-empty message for `LinkLimitReachedError`, falling back to `Link limit reached`.

The exact observed codes are:

- `SendEmailError`;
- `LinkLimitReachedError`;
- `RelationshipLinkageError`.

The maintained A12 model corpus contains three Error Event Definitions, but they are not three boundary catches. Exactly one is an Error Boundary Event: it is attached to `CreateRelationshipLinkTask`, references `LinkLimitReachedError`, and flows to `ExpectedUserTaskAfterBPMNError`. The other two occurrences are Error End Events in valid and intentionally invalid travel-expense fixtures and therefore belong to a future propagation capsule.

This proposal selects only `LinkLimitReachedError`, because it is the one code for which the target product supplies both a production delegate result and a matching attached boundary catch. `SendEmailError`, `RelationshipLinkageError`, Error End Events, propagation to enclosing scopes, and catch-all boundaries remain outside this capsule.

## Normative basis

BPMN 2.0.2 Clause 13.3.3 states that a Service Task fault is treated as an interrupting error and the Activity fails. Clause 13.5.3 states that boundary-event handling consumes the event, cancels the attached Activity when `cancelActivity` is set, and follows the boundary Sequence Flow; non-interrupting Error boundaries are not permitted. The Error Event Definition rules require a boundary Error with a code to catch only a matching Error, while a boundary Error without a code catches any Error.

The selected account is the exact-code, same-Process, Task-attached case. The capsule does not decide the standard's unspecified behavior for an unhandled Error and does not claim nested-scope propagation. Official OMG issues [BPMN21-211](https://issues.omg.org/issues/BPMN21-211), [BPMN21-227](https://issues.omg.org/issues/BPMN21-227), and [BPMN21-436](https://issues.omg.org/issues/BPMN21-436) concern broader Error consistency, `cancelActivity` wording, and catcher scope; they do not change this bounded proposition and remain reasons not to generalize it.

## Required scope

- a distinct immutable CIB Seven `2.0.0` A12 profile;
- one project-authored MIT fixture shaped after the product mechanism without copying A12 source;
- exact source handler token `#{createRelationshipLinkDelegate}`;
- profile-supplied protocol `urn:bpmn-lean:a12-delegate:v1`;
- one attached interrupting boundary Error Event;
- one referenced root Error with exact code `LinkLimitReachedError`;
- one typed business-error result with a non-empty code and nullable non-empty message;
- exact-code matching only;
- abandonment of the normal Service Task output route;
- continuation through the boundary route to one observable User Task;
- direct Lean and TypeScript mismatch refusal with exact state preservation;
- Temporal refinement in which the Activity completes successfully with the typed business result;
- release-specific CIB Seven `2.0.0` host evidence for synchronous delegate error handling;
- one answer-free differential scenario and the required negative mutations.

## Excluded scope

Catch-all Error boundaries, multiple Error handlers, multiple effects, multiple active occurrences, Error End Events, Intermediate Throw Events, Event Sub-Processes, Sub-Processes, Call Activities, nested-scope propagation, escalation, compensation, transactions, multi-instance Activities, retry exhaustion as semantics, incidents as semantics, technical exceptions as business errors, general service faults, cancellation recovery, Process-variable error-code/message projection, `camunda:errorMessageVariable`, `camunda:errorCodeVariable`, general JUEL, general delegates, external tasks, scripts, listeners, arbitrary variables, the exact complete A12 relationship model, and Java binary compatibility are excluded.

The exact A12 relationship model is not admitted by this capsule. It also contains input/output mappings, an Exclusive Gateway, other variables, and `camunda:errorCodeVariable=""`. Those facts remain migration inputs, not content to drop or normalize silently.

## Source profile

Approval selects a new profile provisionally named `cibseven-2.0.0-a12-boundary-error-draft`. It does not mutate the CreateDocument profile or any `2.2.0` profile.

The project-authored fixture admits:

- one private executable Process with the exact topology shown above;
- one Service Task carrying exact delegate-expression token `#{createRelationshipLinkDelegate}`;
- profile-supplied protocol `urn:bpmn-lean:a12-delegate:v1`;
- one Boundary Event attached to that Service Task;
- `cancelActivity` omitted with normative default `true`, or lexically `true`;
- exactly one Error Event Definition referencing exactly one root Error;
- exact root Error code `LinkLimitReachedError`;
- exactly one outgoing boundary Sequence Flow and no incoming boundary flow;
- no error-code or error-message variable extension;
- no other executable extension content.

The checked source retains the Boundary Event, its attachment, the Error Event Definition reference, the root Error code, the boundary Sequence Flow, and exact BPMN element provenance. Admission rejects a missing or unresolved reference, a different code, `cancelActivity="false"`, a second handler, a catch-all definition, an unattached event, or foreign executable content.

The source compiler manifest must add only the CMOF facts consumed by this profile: `Definitions.rootElements`, `BoundaryEvent.attachedToRef`, `BoundaryEvent.cancelActivity`, `ErrorEventDefinition.errorRef`, and `Error.errorCode`, together with the corresponding `BoundaryEvent`, `ErrorEventDefinition`, and `Error` classes.

## Reusable IL mechanism

The capsule does not add a standalone `error`, `boundaryError`, or CIB-specific operation. It extends `awaitEffect` with one optional source-derived route:

```ts
type BpmnErrorRoute = Readonly<{
  code: "LinkLimitReachedError";
  output: ControlPlaceId;
  origin: Readonly<{
    kind: "bpmnElement";
    boundaryEventId: string;
    errorElementId: string;
    sequenceFlowId: string;
  }>;
}>;

type AwaitEffect = Readonly<{
  kind: "awaitEffect";
  id: string;
  input: ControlPlaceId;
  output: ControlPlaceId;
  origin: BpmnElementOrigin;
  effect: Readonly<{
    elementId: string;
    descriptor: EffectDescriptor;
  }>;
  bpmnErrorRoute: BpmnErrorRoute | null;
}>;
```

Existing `awaitEffect` operations receive `bpmnErrorRoute: null` in the atomic pre-release wire evolution. The field is singular because this capsule admits exactly one handler. A second handler, catch-all behavior, or scope propagation reopens the representation decision.

The route is committed definition data. It is not exposed in `EffectRequest`, selected by the Worker, inferred from a host exception, or reconstructed from a Temporal identifier.

## Typed effect result

The current success result becomes one branch of a closed union:

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
    }>;
```

The boundary admits non-empty Unicode-scalar strings. `message` is always present and is either `null` or non-empty; absence is invalid. The business-error branch carries no local patch. This represents both A12 construction forms without conflating a message with the matching identity.

The Worker returns only the typed result. The semantic core decides whether a route matches and owns every state transition.

## Semantic transition

For one active effect occurrence and one business-error result:

1. validate the complete effect occurrence identity through the existing `completeEffect` command;
2. require the Process to be running and the occurrence to remain active;
3. require `result.code` to equal the committed route code;
4. remove the active effect occurrence, local Activity scope, and committed intent;
5. do not apply the success patch or normal output mapping;
6. do not produce a token on the Service Task normal output;
7. produce one token on the boundary route output;
8. continue ordinary supported closure to the boundary User Task;
9. preserve Process variables exactly in this capsule.

The optional message is content-bound and available to evidence, but it does not participate in matching and is not projected into Process variables.

An occurrence mismatch or an unmatched Error code is rejected by the pure semantic accounts with exact state preservation. Rejection is not normal Service Task completion and does not create the boundary token.

## Stable semantic rules

### `BERROR-CATCH-01`

A matching `bpmnError` result for the active occurrence consumes the effect intent, produces no normal Service Task output, produces one boundary-route token, and closes to the boundary handler.

### `BERROR-INTERRUPT-01`

The matching interrupting boundary result applies no success patch or normal output mapping and preserves Process variables exactly.

### `BERROR-MESSAGE-01`

The optional non-empty message is preserved in command identity and evidence but neither affects code matching nor enters Process variables.

### `BERROR-REFUSE-01`

An occurrence-identity mismatch, inactive or consumed occurrence, or non-matching Error code is rejected with exact semantic-state preservation.

## Declarative Lean account

The declarative `EffectCompletionStep` relation gains one constructor for a matching business-error route. The executable evaluator gains the corresponding branch, and a soundness theorem proves that every evaluator-produced business-error transition is permitted by the relation.

Required laws:

- a quantified matching theorem over program, state, active occurrence, route, command ID, code, optional message, and logical time;
- exact absence of the normal output and exact presence of the boundary output;
- exact Process-variable preservation;
- a quantified mismatch theorem over occurrence identity and Error-code inequality with exact state preservation.

The nearest checked non-law uses one state and both accounts: a deliberately wrong evaluator treats a `bpmnError` result as success and reaches the normal End Event, while the real evaluator opens the boundary User Task. A theorem that merely constructs a boundary token is insufficient.

## Command identity

The existing `completeEffect` command retains its domain prefix and incorporates the result variant through the shared canonical encoder:

```text
success:
  ["success", sortedLocalPatch]

business error without message:
  ["bpmnError", code, ["none"]]

business error with message:
  ["bpmnError", code, ["some", message]]
```

Existing successful-result bytes and digests remain under literal locks before refactoring. The new branch receives known literal locks for code-only and message-bearing forms.

Required mutations:

- omit or substitute the Error code;
- substitute the message or collapse `null` and a present message;
- treat the business-error branch as the success branch;
- synthesize the boundary result without the required completed Activity history.

## Temporal refinement

The committed core state remains the Workflow state. While the Activity is in flight, the same effect intent and optional boundary route remain active and unchanged.

A business error is not a failed Temporal Activity. The Activity resolves successfully with the typed `bpmnError` result. The Workflow derives the content-bound `completeEffect` stimulus exclusively from the committed intent and the returned typed result, applies it through the semantic core, and observes the boundary User Task.

Activity transport failure, retry, timeout, Worker loss, and exhausted attempts retain the existing adapter meaning. They do not create `bpmnError`, do not open the boundary route, and on exhaustion fail the Workflow with the existing typed adapter reason while leaving the last committed semantic state unchanged.

The separating mutation throws a Temporal `ApplicationFailure` instead of returning `bpmnError`. The Activity retries or exhausts and the boundary User Task must remain absent.

If an Activity successfully returns a non-matching business-error code, the core refuses it. The Workflow then fails with typed adapter reason `BPMN_UNHANDLED_BPMN_ERROR`, produces no canonical semantic result or completed receipt, and does not retry the already successful Activity. This is a bounded safety disposition, not a claim about BPMN's unspecified unhandled-Error behavior or CIB compatibility.

Workflow cancellation or termination while the Activity is in flight retains the existing unsupported cancellation-recovery boundary. The stable effect transport key remains the reconciliation lever, but this capsule does not claim recovery.

## CIB Seven `2.0.0` relation

CIB Seven exposes a different host transaction boundary from Temporal. In the selected synchronous delegate account, starting the Process invokes the delegate inside the engine command. A matching `BpmnError` is found by the engine exception handler, caught by the exact Error Event Definition, and routed to the boundary User Task in the same command. No async continuation, job retry, or incident is part of the selected witness.

The CIB lane can establish:

- warning-free deployment of the project-authored exact profile source;
- engine-derived Service Task, boundary attachment, root Error reference, and matching code;
- synchronous delegate invocation with code-only and message-bearing `BpmnError`;
- boundary User Task presence;
- absence of the normal End path;
- Process continuation after completing the boundary User Task.

The CIB lane does not expose a committed project effect intent, typed `completeEffect` command, Temporal Activity result, or independent optional-message semantic account. The code and message are probe-script inputs. CIB therefore supplies a host-realization check, not an independent derivation of the project-owned intermediate state or command.

The intended register classifications after a green probe are:

- bounded normative agreement for an exact-code interrupting Error Boundary Event;
- CIB extension for the Java `BpmnError(code, message?)` delegate API;
- permitted host-specific realization for synchronous same-command error handling;
- configuration-specific behavior for an unmatched or unhandled `BpmnError`.

No register entry is added before the probe establishes the release-specific facts.

## Unhandled Error boundary

CIB Seven `2.0.0` source permits configuration-dependent unhandled behavior: the default can end the execution after logging, while `enableExceptionsAfterUnhandledBpmnError` can turn the condition into a command failure. A12 does not visibly override that configuration in the registered repository.

This capsule does not select either behavior as semantic authority and makes no CIB differential-equality claim for an unmatched Error. The phase-zero probe records both configurations as oracle facts. A future owner decision is required before claiming compatibility for `SendEmailError`, `RelationshipLinkageError`, or any target path without a matching catcher.

## Phase-zero probe obligations

Before formalization or production implementation:

1. deploy the project-authored exact fixture under packaged CIB Seven `2.0.0` with no parser warning;
2. derive the Service Task ID, boundary attachment, root Error identity, Error code, and outgoing boundary flow from the deployed model;
3. prove that a matching code-only `BpmnError` reaches the boundary User Task synchronously with no job, incident, or normal completion;
4. prove the same route for a message-bearing `BpmnError` and retain the exact message as raw probe evidence;
5. perturb the derived Error code and boundary attachment independently and require comparison failure;
6. record mismatch behavior under the target default and under explicit `enableExceptionsAfterUnhandledBpmnError=true`, without selecting either as project semantics;
7. probe the registered external A12 boundary model's `camunda:errorCodeVariable=""` under the exact target engine, determining whether deployment warns and whether a matching error writes an empty-name variable or fails.

The final obligation does not authorize exact external model execution as project evidence, admission of the extension, or copying the source. It prevents the importer from silently ignoring a target-specific executable attribute.

## Cross-target scenario and evidence relation

The pipeline gains one answer-free `service-task-boundary-error` scenario:

1. start one Process instance;
2. supply one `completeEffect` result with code `LinkLimitReachedError` and a non-empty message;
3. complete the resulting boundary User Task.

Lean and the TypeScript core apply the semantic result directly. Temporal receives no result from the runner: its probe Activity returns the typed business result, and the Workflow derives the identical content-bound stimulus from committed intent. CIB receives no project `completeEffect` command: the synchronous proxy delegate throws `BpmnError`, after which the harness completes the observed boundary User Task.

The expected relation is:

- Lean and the TypeScript core agree exactly on the semantic transition;
- Temporal preserves the same core-visible result and final state, with a completed Activity and replay evidence;
- CIB agrees on the engine-observed boundary User Task and final host state only;
- `BERROR-REFUSE-01` mismatch space is exercised by Lean and the TypeScript core, plus a focused Temporal adapter-failure witness for a returned unmatched code;
- Activity failure versus returned business error is a focused Temporal mechanism witness, not a CIB comparison.

The current nine-scenario pipeline would become ten scenarios, twenty isolated Temporal executions, and twelve replayed histories. The new scenario uses two isolated Temporal executions, while only its primary history is replayed. No additional transport-only scenario is added.

Retained CIB evidence is generated only through the explicit replacement command, belongs to the `2.0.0` release group, and is content-bound to the project-authored fixture and answer-free scenario. External A12 bytes remain outside the MIT evidence artifact.

## Rule-to-evidence matrix

| Rule | BPMN/profile clause | Lean | TypeScript core | CIB Seven `2.0.0` | Temporal | Negative witness |
|---|---|---|---|---|---|---|
| `BERROR-CATCH-01` | Exact-code Error catch and interrupting boundary handling | Declarative relation, evaluator soundness, quantified matching theorem, exact trace | Independent matching branch and exact trace | Engine-observed boundary User Task and normal-path absence; host realization only | Successful typed Activity result, core-visible boundary state, history, replay | Treat `bpmnError` as success or synthesize it without completed Activity history |
| `BERROR-INTERRUPT-01` | Attached Activity is interrupted and boundary Sequence Flow is followed | Exact normal-output absence and Process-variable preservation | Exact output and state assertions | Engine-observed normal-path absence and boundary continuation | Same core-visible state after completed Activity | Apply success patch or normal output after the business error |
| `BERROR-MESSAGE-01` | Profile result shape; message is not the matching key | Quantified optional-message theorem | Strict `null`/non-empty admission and command identity | Message is probe-script input; the selected boundary route remains engine-observed | Activity result and content-bound command evidence | Omit the field, collapse `null` with a value, or substitute the message |
| `BERROR-REFUSE-01` | Exact-code profile restriction; unhandled standard behavior remains unspecified | Quantified identity/code mismatch with state preservation | Independent refusal and state preservation | No semantic-equality claim; configuration facts only | Returned unmatched code becomes typed adapter failure without Activity retry | Code substitution and occurrence-identity mutations |

No row counts CIB, Lean, TypeScript, and Temporal as four independent semantic derivations. Lean supplies the reviewed formal account, TypeScript independently transcribes it, CIB supplies the bounded engine host relation, and Temporal supplies refinement and replay evidence over the TypeScript core.

## Runtime-only and synthetic constructs

| Construct | Source or derivation | Owner | Public projection | Lifecycle |
|---|---|---|---|---|
| `bpmnErrorRoute` | Checked Boundary Event, root Error, and boundary Sequence Flow | Semantic program | None directly | Created during lowering; immutable for the Process definition |
| `bpmnError` result | Worker business result | Effect-result contract | Command outcome and resulting canonical state | Exists only as command input and retained adapter result |
| Optional message | Worker business result | Effect-result contract | Evidence and command identity only | Retained with the command result; never becomes a Process variable |
| CIB Java exception | Probe delegate | CIB host | Raw probe evidence | Exists within one synchronous engine command |
| Temporal Activity result | Completed Activity | Temporal adapter | Durable history and harness evidence | Replayed from Event History |
| `BPMN_UNHANDLED_BPMN_ERROR` | Successful host result refused by the core | Temporal adapter | Workflow failure only | Ends the Workflow Execution without semantic completion |

## Versioning consequences

Approval causes one atomic pre-release replacement of the checked-graph, Semantic Process, effect-result, stimulus, scenario, observation, schema, decoder, command-identity, and evidence contracts. Existing effect operations gain explicit `bpmnErrorRoute: null`; no compatibility reader, format counter, legacy union, or Workflow patch branch is retained.

The new profile receives its own semantic-profile identity and CIB release group. Existing profile identities and successful command bytes remain unchanged. Graduation to `-SPEC` occurs only after the phase-zero facts, semantic account, CIB host relation, Temporal refinement, retained evidence, mutations, reflection, and complete gate are green.

## Common-mode risks

- The project-authored fixture and source rules could encode the same mistaken attachment or code relation. The CIB probe must derive those fields from deployment state rather than reconstruct them from constants.
- Lean and TypeScript could share a fixture-specific code literal. Quantified matching and mismatch laws plus code-substitution mutations must vary the code.
- All hosts could conflate business error and infrastructure failure. The Temporal `ApplicationFailure` mutation must prove that only a successful typed Activity result can open the boundary route.
- The exact A12 empty error-variable attribute could be dropped as harmless metadata. The external probe is mandatory before any unchanged-admission claim for that model.
- CIB's synchronous command transaction and Temporal's durable Activity boundary could be summarized as equivalent. Evidence must retain the host-specific relation and avoid rollback-equivalence language.

## Stop conditions

Stop for owner direction if:

- packaged CIB Seven `2.0.0` cannot reproduce the exact matching catch without parser warnings;
- matching CIB handling requires a job retry, administrative execution, or incident;
- Temporal can represent the business error only as a failed Activity;
- the route or match depends on a CIB job ID, Temporal Run ID, Activity attempt, or other host identity;
- aligning the accounts requires changing existing success semantics, lifecycle completion, closure order, or wire behavior for proof convenience;
- the A12 empty error-variable attribute would be ignored, normalized, or admitted without an explicit profile decision;
- the focused or complete gate exceeds an existing feedback budget without an owner-approved treatment;
- implementation requires a new dependency.

## Decisions requested

Approval is requested for these seven selections:

1. select the one project-authored target-shaped fixture, exact `LinkLimitReachedError` catch, distinct `2.0.0` profile, and unchanged external-model exclusion;
2. extend the effect-result union with non-empty `code` plus required nullable non-empty `message`, with no business-error patch;
3. extend `awaitEffect` with one optional committed `bpmnErrorRoute` and apply the exact interrupting transition above;
4. require pure-account mismatch refusal and use typed `BPMN_UNHANDLED_BPMN_ERROR` only as adapter failure for a successful but semantically unmatched Activity result;
5. classify CIB as a synchronous host-realization check and require the complete phase-zero probe, including the exact A12 empty error-variable fact;
6. require Temporal to carry business error as a successful typed Activity result and retain infrastructure failure/retry exhaustion outside semantic outcomes;
7. add the one answer-free scenario with the exact lane relation, mutations, ten-scenario/twenty-execution/twelve-replay matrix, and explicit evidence replacement.

Until all seven are approved, the project stops at this proposal and does not implement typed `BpmnError` or boundary-error behavior.
