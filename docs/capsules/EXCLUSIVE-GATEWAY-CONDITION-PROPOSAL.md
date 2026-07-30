# Exclusive Gateway conditional routing proposal

## Status

**Owner-approved proposal on 2026-07-30; the reviewed dependency set is approved but not yet adopted, and production implementation has not begun.**

This proposal fixes the first bounded vendor-neutral Exclusive Gateway account and the selected CIB Seven `2.0.0` read-only JUEL overlay. It does not describe an implemented surface and must remain a proposal until the complete source, Lean, TypeScript, Java evaluator, Temporal, CIB, and evidence contract is green.

## Question

What is the smallest complete conditional-routing mechanism that advances BPMN structure, serves the measured language/context portion of the A12 Workflows condition surface, and does not make Lean or the TypeScript semantic core implement JUEL?

## Evidence and authority

BPMN 2.0.2 Clause 13.4.2 and Table 13.2 own divergent Exclusive Gateway behavior: conditions are considered in order, only the first true condition is selected, later conditions are not evaluated, and the default Sequence Flow is selected only when no condition is true.

The selected CIB overlay is classified by `CIB-AGR-0006`, `CIB-INT-0001`, `CIB-CFG-0005`, and `CIB-OP-0004` in the [CIB–BPMN relationship register](../CIB-BPMN-RELATION-REGISTER.md). CIB Seven `2.0.0` fixes the otherwise underspecified portable order to XML `sequenceFlow` declaration order and supplies the profile-selected JUEL language and command-rollback behavior.

The [A12 Workflows compatibility ledger](../research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md#conditional-expression-denominator) owns the downstream denominator. The selected first value domain covers 9 of 16 condition occurrences, 5 of 11 exact strings, and 4 of 8 condition-bearing models at the language/context level without importing nested product data or capability-bearing expressions. The exact two-condition-plus-default source shape is narrower, so none of those figures is unchanged-model admission or execution coverage.

The [JUEL evaluation architecture decision](../JUEL-EVALUATION-ARCHITECTURE-DECISION.md) owns evaluator placement: the actual pinned CIB JUEL runtime parses and evaluates exact source behind a Java Temporal Activity; Lean and TypeScript validate a content-bound receipt and apply BPMN routing.

## Selected source slice

The first profile admits one private executable acyclic Process with:

- one None Start Event;
- one User Task before the conditional decision, so evaluation rollback has a visible pre-command state;
- one divergent Exclusive Gateway with exactly one incoming Sequence Flow;
- exactly two non-default outgoing Sequence Flows carrying condition expressions whose `xsi:type` is absent or resolves to BPMN `tFormalExpression`, and exactly one conditionless declared default Sequence Flow;
- one distinct User Task on each outgoing branch; and
- unconditional branch tails to one None End Event.

The gateway is divergent only. Converging Exclusive Gateway behavior, a gateway with more or fewer candidates, conditional Sequence Flow on another Flow Node, multiple gateways, parallel interaction, loops, and a gateway without a default are excluded from this first source profile.

Each admitted non-default condition has no `language` attribute and no `{http://camunda.org/schema/1.0/bpmn}resource` attribute. Every non-default outgoing Sequence Flow has one condition and the default Sequence Flow has none. A language-qualified expression is a script in pinned CIB rather than JUEL, and a resource-backed expression changes the source boundary; both are rejected before JUEL validation. A default Flow carrying a condition is rejected rather than allowed to re-enter ordinary candidate iteration.

The exact condition character data is retained after XML decoding, including whether it uses `${...}` or `#{...}`. Each expression is limited to 256 UTF-8 bytes. The measured target maximum is 91 bytes, so this is a resource bound with explicit headroom rather than a target-string allowlist.

Definition admission has two phases. TypeScript performs structural import and produces a provisional checked definition plus one content-bound batched validation request. Before any Process Workflow starts, the deployment orchestrator starts a short-lived TypeScript `validateJuelConditions` Workflow whose only durable operation is one parse-only Activity on the dedicated Java evaluator Worker. The validation Workflow uses the same two-second start-to-close, ten-second schedule-to-close, two-attempt, fixed 100-millisecond retry policy as runtime evaluation and has a fifteen-second execution timeout. Only a successful receipt matching the profile, definition digest, ordered candidate identities, and exact expressions finalizes admission. A typed syntax failure rejects the definition; timeout, Worker absence, malformed transport, or Workflow failure is a deployment-infrastructure failure and starts no Process Workflow. The validation history is deployment evidence, not Process history or a BPMN observation. No direct evaluator endpoint, local JVM subprocess, or fourth runtime root is introduced.

## First context and value domain

The first request contains every Process-scope binding visible at the gateway, sorted by project canonical variable-name order. It never contains only the variables that an expression is predicted to read.

The request reuses the canonical `VariableBinding[]` contract. Each value is exactly tagged `VariableValue.String` or `VariableValue.Null`; the Java boundary converts those two variants to Java `String` or `null` only after strict request validation. Absence means no binding with that name; explicit null means one binding carrying `VariableValue.Null`. Duplicate names, unsupported value kinds, an Activity-local binding, or an omitted visible Process binding invalidate the request. No parallel untagged `string | null` wire representation is introduced.

Boolean is the required condition result but is not yet an admitted Process-variable value. Nested maps, lists, arrays, numbers, Boolean Process variables, dates, binary values, serialized Java objects, and target-specific data structures remain outside this capsule.

The Java evaluator installs only exact root-variable resolution over the supplied immutable bindings. It installs no bean, property-on-Java-object, method, function, class, `execution`, Process Engine service, Spring, file, network, or mutation resolver. An expression that attempts one of those capabilities produces the semantic `evaluationError` result rather than acquiring the capability.

## Stable semantic rules

### `XGW-EVALUATE-01` — evaluate candidates in profile order

When one token reaches the admitted divergent Exclusive Gateway, the conditional-choice operation requests evaluation of the two non-default candidate conditions in their checked order against one complete immutable Process-scope context snapshot.

This is vendor-neutral BPMN conditional-routing meaning parameterized by a language-profile result. The CIB profile fixes the checked candidate order to XML `sequenceFlow` declaration order through `CIB-INT-0001`.

### `XGW-SHORT-CIRCUIT-01` — stop at the first true condition

The result is a non-empty evaluated prefix ending at the first true condition, or the complete all-false candidate list. A true result forbids every later candidate result.

The Java evaluator evaluates sequentially and stops immediately after the first true Boolean. It never returns a selected Sequence Flow.

### `XGW-DEFAULT-01` — select default only after all false

If and only if both non-default conditions evaluate false, the semantic core selects the declared default Sequence Flow.

A missing default remains outside this source profile, so the BPMN exception required when all conditions are false and no default exists is reviewed but not implemented by this capsule.

### `XGW-ROUTE-01` — consume once and produce one selected route

A valid receipt consumes the gateway's one offered incoming token and produces exactly one token on the selected outgoing Sequence Flow. It does not duplicate the token, retain an additional gateway-local token, or activate an unselected branch.

### `XGW-RECEIPT-01` — bind truth to the exact request

The semantic core accepts a receipt only when its profile identity, definition identity, Process identity, gateway operation and activation identity, candidate IDs and order, exact expression strings, complete context, and request digest match the pending evaluation.

An evaluated prefix must contain the checked candidate IDs in order; every element before its last is false; its last may be true; and an all-false result must contain all candidates. A stale, reordered, shortened-all-false, extended-after-true, foreign-definition, foreign-context, or digest-mismatched receipt is rejected with no committed-state change.

### `XGW-JUEL-01` — delegate exact read-only JUEL truth

Under profile `CIB-CFG-0005`, `org.cibseven.bpm.juel:cibseven-juel:2.0.0` owns parsing, its private AST, equality/null operators, coercion, root resolution, and the Boolean result for exact `${...}` and `#{...}` source.

Lean, TypeScript, and project Java code implement no JUEL grammar, AST, operator, coercion, optimizer, transpiler, or alternate evaluator. CIB engine execution and the Java evaluator share one JUEL implementation and count as one correlated truth account.

### `XGW-ROLLBACK-01` — evaluation error preserves the pre-command state

The command that leaves the preceding User Task remains speculative until the gateway receipt selects a route. A semantic `evaluationError` returns the command outcome `rolledBack` and restores the exact committed state that existed before User Task completion.

The speculative continuation is private runtime state and is not exposed by canonical observation. While the evaluator Activity is pending, Queries expose only the last committed state. No downstream branch task, Process-variable change, or completed command receipt is visible before successful evaluation and atomic commitment.

Syntax error is an admission failure under the parse-only preflight, not a runtime rollback result. Temporal Worker loss, timeout, cancellation, malformed transport, and exhausted Activity attempts are adapter or infrastructure failures; they do not become JUEL or BPMN outcomes and do not commit speculative state.

The suspended continuation is required because the existing caller-completable effect mechanism would first commit User Task completion and only later receive another stimulus. It therefore cannot reproduce CIB's single-command rollback to the still-open User Task. Conditional evaluation instead suspends the one originating semantic command before commitment.

## Semantic Process mechanism

The proposed IL addition is a generic `choose` operation, not an `exclusiveGateway` case and not a topology selector. It represents one ordered conditional choice with:

- one input control place;
- an opaque profile-registered evaluator identity;
- an ordered non-empty tuple of candidate `(Sequence Flow origin, exact expression source, output control place)` records; and
- one default `(Sequence Flow origin, output control place)`.

The checked BPMN graph retains the Exclusive Gateway, exact Sequence Flow declarations, decoded expression source, default reference, and language/profile evidence so Lean can independently check graph-to-program ordering and lowering. Raw CIB profile selection remains a source/profile fact and is not misreported as a Lean-independent derivation.

The same operation may later represent conditional Sequence Flow from another legal BPMN Flow Node only after that source meaning has its own capsule. The first production validator admits only the exact three-way gateway slice above.

## Runtime and command continuation

Conditional evaluation is neither an `awaitEffect` operation nor an `openEffect`. It is a profile-language service used to decide an internal BPMN route and does not expose a caller-completable interaction or application effect.

The current `applyInternalOperation(): RuntimeState | null`, `closeInternal` result, and committed-or-rejected `CommandResult` cannot represent suspension. The atomic replacement introduces these closed result families:

```ts
type InternalOperationResult =
  | { kind: "notEnabled" }
  | { kind: "advanced"; state: RuntimeState }
  | { kind: "suspended"; request: JuelConditionRequest; continuation: ConditionalContinuation };

type ClosureProgress =
  | { kind: "quiescent"; state: RuntimeState; internalStepsUsed: number }
  | { kind: "suspended"; request: JuelConditionRequest; continuation: ConditionalContinuation }
  | { kind: "boundExceeded"; state: RuntimeState; internalStepsUsed: number };

type ApplyStimulusResult =
  | { kind: "completed"; result: CommandResult }
  | { kind: "suspended"; request: JuelConditionRequest; continuation: ConditionalContinuation };
```

`CommandResult` admits the existing public `CommandOutcome.RolledBack` in addition to committed and rejected. A new `resumeConditionalEvaluation(program, continuation, receipt)` entry point validates the receipt and returns one completed committed or rolled-back command result for this one-gateway profile. An invalid or malformed receipt is an adapter failure rather than a semantic rejection. The former nullable internal-step result and boolean-only closure result are replaced rather than wrapped.

Applying a command may therefore return a private suspended continuation containing:

- the original committed state;
- the speculative post-stimulus state at the conditional choice;
- the exact evaluation request;
- the originating semantic command identity;
- the total internal-step count already consumed by this command; and
- no host Activity ID, attempt number, task queue, or Run ID.

Resuming with a valid successful receipt continues closure and commits once. Resuming with a typed evaluation error returns `rolledBack` and the original committed state. A continuation cannot be resumed twice, with another command, or after another state has committed.

The pending continuation is persisted by the Temporal Workflow for durability but is omitted from the canonical BPMN observation. It is removed on successful commit, semantic evaluation rollback, or terminal evaluator-infrastructure handling.

Only the existing single semantic input loop may create, await, and resume the continuation. While it awaits the evaluator Activity, later accepted semantic commands remain queued and their handlers remain pending; they cannot mutate committed state or overtake the suspended command. After success or typed rollback, the loop publishes that command result and resumes the queue. If the Activity exhausts its attempts or reaches schedule-to-close, the loop discards the continuation, leaves the exact original committed state and User Task wait visible, fails the originating Update as an adapter/infrastructure failure, and resumes the queue. The client may retry with a new semantic command ID; replaying the same Temporal Update ID returns its already recorded failed Update rather than evaluating again. This preserves the production lifecycle's explicit acceptance-order nondeterminism without adding concurrent semantic-core execution or stranding the queue.

## Temporal hosting and refinement preflight

The Java evaluator is a normal Activity Worker on a dedicated task queue. The TypeScript Workflow does not load Java, spawn a JVM, use a Local Activity, or evaluate an expression.

One gateway activation creates one Activity request containing both ordered candidates and the complete context. The Activity returns after the first true condition or after both false; there is no Activity per condition.

The request and result use a closed shared schema and the Temporal SDKs' JSON payload boundary. The request carries the existing tagged `VariableBinding[]` representation. A cross-SDK test must lock exact strings, ordered arrays, tagged explicit null, absence, non-ASCII scalar strings, unknown/missing fields, duplicate variable names, and the request digest before semantic integration begins.

The proposed Activity policy is start-to-close 2 seconds, schedule-to-close 10 seconds, two attempts, fixed 100-millisecond retry backoff, and no heartbeat. Read-only duplicate execution is safe because the immutable request has no capability and the result is content-bound. A typed JUEL error is returned as a successful Activity result and is not retried; transport or Worker failure follows the bounded Activity retry policy.

Replay consumes the recorded Activity result and does not run JUEL again for a completed activation. Worker replacement before acknowledgement must reproduce the same receipt. A bypass mutation in which Workflow code fabricates or modifies a condition result must fail request/receipt validation.

One successful evaluation adds the ordinary Activity and Workflow Task lifecycle Events to Temporal history. Internal semantic transitions before and after the Activity may close inside their Workflow Tasks without one Event per semantic step. This capsule neither introduces Continue-As-New nor changes the qualitative history-cost decision.

The state relation is: committed Workflow state equals committed semantic-core state; a pending evaluator Activity additionally carries one content-bound suspended continuation whose canonical projection is the unchanged pre-command observation. Successful Activity completion plus receipt application refines one atomic semantic command commitment; semantic evaluation error refines `rolledBack`; infrastructure failure has no semantic transition, discards the private continuation, fails the originating Update outside the semantic result algebra, and leaves the last committed Workflow/core state equal.

## Error contract

The Java boundary returns one semantic result union: `evaluated` with the exact valid Boolean prefix, or `evaluationError` with the request digest and first failing candidate ID. Every evaluation failure has the same semantic consequence: rollback of the originating command.

The Java result may additionally carry an optional diagnostic code from `propertyResolution | methodResolution | nonBooleanResult | runtimeFailure` and a nullable message capped at 512 UTF-8 bytes for logs and operator diagnosis. They are excluded from the request digest, Lean/TypeScript semantic comparison, and command outcome. The implementation distinguishes only broad facts available without message parsing and does not separate absent-root from unsupported-property semantics by matching localized CIB/JUEL message text. Java exception classes, stack traces, source paths, bean names, and engine objects never cross the boundary.

Malformed request/result payloads, digest disagreement, impossible prefixes, and Java Worker protocol errors are adapter failures rather than evaluation errors.

## Targeted preservation gate

The capsule must add an executable source/profile check proving that every admitted command uses at most `semanticProcessClosureLimit`, currently 8, across all closure segments before and after suspension. The continuation carries `internalStepsUsed`, and resume receives only the remaining budget. Creating or awaiting the host Activity is not a BPMN semantic transition and neither resets nor consumes the semantic budget. The admitted program's worst command path uses at most four internal transitions and one suspension, leaving explicit headroom under 8; the guard includes an over-limit mutation. A later capsule may choose a different checked per-command bound, but it may not reinterpret this one as a per-segment allowance.

The first source profile forbids a reachable state in which conditional choice and another independent operation are simultaneously enabled. Lean and TypeScript must each reject every mutated witness that violates that admission premise. A later profile that makes multiple-enabled conditional choice reachable must either prove the choices commute and are order-invariant, introduce an explicit semantic choice, or make Lean and TypeScript reject the state identically.

The canonical wait-order rule is unchanged because conditional evaluation is private and does not add a public wait kind. A future decision to expose it publicly would reopen the observation contract and evidence, not silently extend `activeWaits`.

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Creation and removal invariant |
|---|---|---|---|
| Choice activation counter | Semantic runtime counter keyed by the `choose` operation; the speculative next value contributes to the evaluation identity | None | Incremented only in speculative state when the operation suspends; committed with a successful route and restored with the original state on rollback or infrastructure failure |
| `evaluationId` | Complete semantic Process instance identity plus `choose` operation identity and speculative activation; owned by the semantic runtime | None | Created once per suspension, bound into request and continuation, and removed when that continuation settles |
| Request digest | Project canonical digest over profile, definition, Process instance, evaluation identity, candidates, expressions, default, and tagged complete context | None | Created with the request, rechecked at every boundary, and retained only inside the pending continuation and resulting receipt |
| Suspended continuation | Original committed state, speculative state, request, semantic command identity, and consumed closure count; owned by the semantic runtime and durably held by the Workflow | None; Queries project the original committed state | Exactly one per suspended command; never caller-completable or resumable twice; removed on commit, semantic rollback, or evaluator-infrastructure failure |

No construct contains a Temporal Run ID, Activity ID, attempt number, task queue, Java exception, or target-specific application identity.

## Versioning consequences

This is one atomic pre-release replacement. It changes the current `CommandResult`/closure result families, `CheckedSequenceFlow` and `CheckedNode` condition/default fields, `SemanticOperation` with the generic `choose` arm, the new request/result and continuation contracts, the receipt/resume entry point, Lean's Semantic Process JSON decoders and definitions, shared schemas, all producers and consumers, fixtures, mutations, and Temporal Workflow state together. No compatibility reader, parallel old result arm, format counter, patch branch, or migration function is added.

Implementation creates a new immutable draft profile identity `cibseven-2.0.0-exclusive-gateway-juel-draft`; it does not mutate any existing profile ID. Existing retained scenario and CIB evidence remain unchanged because this capsule adds a new scenario/evidence set rather than reinterpreting an implemented one. Any later change to the semantic receipt, admitted value domain, resolver capability, candidate cardinality, or source-shape rule requires a new profile identity and the applicable atomic artifact replacement.

## Separating witnesses

The minimum source and runtime witnesses are:

1. reversed gateway `<outgoing>` references versus `sequenceFlow` declarations, proving the selected declaration order;
2. first and second conditions both true, proving first-true selection;
3. first false and second true;
4. both false, proving default selection;
5. a later unresolved expression after an earlier true, proving short-circuit non-evaluation;
6. `${...}` and `#{...}` retention;
7. present string, explicit null, and absent root behavior;
8. non-Boolean result;
9. unsupported property/method/function/write capability;
10. deployment-time syntax rejection;
11. profile rejection of a `language` attribute, with a CIB control proving that the same source is routed to script handling rather than JUEL;
12. deployment rejection of a condition on the declared default Flow;
13. runtime evaluation failure with exact pre-command task/state rollback;
14. candidate-order, context, definition, activation, prefix, and digest receipt mutations;
15. Java Worker loss/retry/replacement and same-run history replay;
16. permanently absent Java Worker or exhausted attempts failing the originating Update, preserving the committed User Task wait, and allowing the queued next command to run; and
17. a Temporal bypass mutation that fabricates a receipt.

The packaged-CIB probes now restate declaration order, first/second/default selection, short circuit, both delimiters, present string, explicit null, absent root, non-Boolean and delimiter-free text results, syntax rejection, language-as-script routing, conditional-default rejection, and User Task rollback inside the exact two-condition-plus-default and String/Null profile wherever that profile can express the witness. The isolated-JUEL probes remain feasibility evidence for the stricter resolver and hostile capability cases; they are not CIB public evidence or retained profile evidence. None of these probes establishes the proposed Lean, TypeScript, shared wire, Temporal, receipt-mutation, exhausted-attempt, or retained-evidence claims.

Valid profile-shaped behavioral models are generated with the pinned CIB Seven BPMN Model API through a project helper that requires exactly two conditional branches and one default. The builder's default formal condition serializes without explicit `xsi:type`, which directly exercises the admitted type-absent path. The rare language-qualified negative uses a test-local helper that registers the BPMN namespace, writes the qualified formal-expression QName, and sets `language`; the production profile builder cannot produce that excluded shape. Literal BPMN XML is retained only for the declaration-order witness because model serialization owns `<outgoing>` reference order and would erase the lexical disagreement being tested. Modified CIB source or a forked DSL builder is neither required nor admitted as oracle evidence.

## Rule-to-evidence plan

| Rule | Layer | BPMN/profile review | Lean | CIB Seven | TypeScript | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|---|---|
| `XGW-EVALUATE-01` | BPMN-neutral rule with CIB order parameter | Clause 13.4.2, Table 13.2, `CIB-INT-0001` | Declarative ordered-choice premise and lowering-order theorem | Reversed-reference declaration-order probe | Ordered request projection | One ordered Activity request | Candidate reorder |
| `XGW-SHORT-CIRCUIT-01` | BPMN-neutral | `CIB-AGR-0006` | Valid-prefix relation | Earlier true suppresses later failure | Prefix validator and route evaluator | One Activity returns one prefix | Extra result after true |
| `XGW-DEFAULT-01` | BPMN-neutral | Clause 13.4.2, Table 13.2 | All-false default law | All-false default probe | Default selection | Recorded all-false receipt | Shortened all-false prefix |
| `XGW-ROUTE-01` | BPMN-neutral | BPMN token rule | Transition soundness and exactly-one-output law | Selected branch observation | Pure token transition | Query/Update result and replay | Duplicate/unselected output |
| `XGW-RECEIPT-01` | Project-internal binding | Project binding contract | Exact receipt hypotheses | Not an independent receipt account | Strict validator | Cross-SDK and bypass guards | Identity/order/context/digest mutations |
| `XGW-JUEL-01` | CIB configuration | `CIB-CFG-0005` | Truth remains an input | Engine and isolated same-runtime probes | Truth remains an input | Java Worker uses pinned runtime | Capability and non-Boolean probes |
| `XGW-ROLLBACK-01` | CIB operational compatibility | `CIB-OP-0004` | Rollback relation preserves state | Failed-start zero-state and User Task rollback probe | Suspended-command rollback | Speculative invisibility, retry, replay, exhaustion recovery | Downstream visibility, state drift, and queue-stall mutations |

Lean and TypeScript are independent transcriptions of the receipt-consuming BPMN rule. They are not independent JUEL truth accounts. Temporal refines the TypeScript core and is not another semantic account.

## Dependencies and removal cost

The approved Worker has two runtime roots and one build-time version alignment:

- `org.cibseven.bpm.juel:cibseven-juel:2.0.0` for JUEL parsing and evaluation;
- `io.temporal:temporal-sdk:1.35.0` for the Java Activity Worker; and
- imported `com.fasterxml.jackson:jackson-bom:2.21.5` to replace Temporal's vulnerable Jackson `2.15.4` transitive family with one patched aligned family.

[SOURCES.md](../SOURCES.md#candidate-java-juel-evaluator-worker) owns the exact 38-jar resolved graph, integrity, licenses, current advisory scan, provenance, and removal cost. The owner approved this exact set after independent review on 2026-07-30; adoption remains a separate committed implementation change.

Removing the Java module and task-queue registration removes all three roots and the complete transitive graph. The pure TypeScript semantic core, Lean semantics, checked BPMN graph, and vendor-neutral conditional-choice contract remain; the CIB JUEL profile becomes unavailable until another explicitly approved language runtime supplies valid receipts.

## Exclusions

This capsule excludes:

- a project-authored JUEL or generic expression evaluator;
- nested context objects or collections;
- numbers, Boolean variables, dates, binary values, or Java objects;
- property paths, methods, functions, beans, `execution`, engine services, Spring, mutation, or side effects;
- input/output mapping evaluation and removal of the existing exact `MappingExpression.localVariable` shortcut;
- conditional Events, loop conditions, assignment, forms, listeners, scripts, Groovy, FreeMarker, XPath, FEEL, DMN, or a multi-language evaluator protocol;
- converging, mixed, parallel, inclusive, event-based, or complex Gateway behavior;
- an Exclusive Gateway without a default;
- public observation of evaluator continuation state;
- general A12 model admission, general CIB JUEL compatibility, or BPMN Process Execution Conformance;
- Continue-As-New, a retained production history baseline, and deployment versioning.

## Graduation conditions

Graduate this proposal only when:

1. the approved exact dependencies are committed with their graph and licence record;
2. structural source admission plus the short-lived validation Workflow are red/green and reject every excluded source shape without starting a Process Workflow;
3. the checked graph and generic `choose` IL operation preserve exact candidate/default Sequence Flow identities, order, expressions, and profile identity across TypeScript and Lean;
4. Lean defines the declarative relation, executable evaluator, evaluator soundness, exact route laws, rollback preservation, receipt refusals, and nearest non-laws;
5. the pure TypeScript semantic core implements the same receipt-consuming account without JUEL or I/O;
6. the Java evaluator enforces the closed resolver, one semantic evaluation-error arm, and the bounded diagnostic-only classification;
7. cross-SDK payload, Worker loss/retry/replacement/exhaustion, queue recovery, speculative invisibility, validation/runtime history, replay, and bypass evidence are green;
8. the per-command closure-limit and multiple-enabledness guards pass for every admitted program;
9. CIB evidence is content-bound with meaningful order, short-circuit, default, error, and rollback mutations;
10. the implementation map, requirement ledger, relationship register, profile, test specification, and plan state the exact implemented and absent claims; and
11. an epistemic-closure review confirms the shared-JUEL common mode and the nearest unsupported conditional-routing claim.
