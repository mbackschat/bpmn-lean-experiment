# Exclusive Gateway conditional routing proposal

## Status

**Owner-approved proposal on 2026-07-30; implementation and dependency adoption remain blocked pending explicit dependency approval.**

This proposal fixes the first bounded vendor-neutral Exclusive Gateway account and the selected CIB Seven `2.0.0` read-only JUEL overlay. It does not describe an implemented surface and must remain a proposal until the complete source, Lean, TypeScript, Java evaluator, Temporal, CIB, and evidence contract is green.

## Question

What is the smallest complete conditional-routing mechanism that advances BPMN structure, serves the measured A12 Workflows condition surface, and does not make Lean or the TypeScript semantic core implement JUEL?

## Evidence and authority

BPMN 2.0.2 Clause 13.4.2 and Table 13.2 own divergent Exclusive Gateway behavior: conditions are considered in order, only the first true condition is selected, later conditions are not evaluated, and the default Sequence Flow is selected only when no condition is true.

The selected CIB overlay is classified by `CIB-AGR-0006`, `CIB-INT-0001`, `CIB-CFG-0005`, and `CIB-OP-0004` in the [CIB–BPMN relationship register](../CIB-BPMN-RELATION-REGISTER.md). CIB Seven `2.0.0` fixes the otherwise underspecified portable order to XML `sequenceFlow` declaration order and supplies the profile-selected JUEL language and command-rollback behavior.

The [A12 Workflows compatibility ledger](../research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md#conditional-expression-denominator) owns the downstream denominator. The selected first value domain covers the Boolean literal and root-null-comparison class without importing nested product data or capability-bearing expressions.

The [JUEL evaluation architecture decision](../JUEL-EVALUATION-ARCHITECTURE-DECISION.md) owns evaluator placement: the actual pinned CIB JUEL runtime parses and evaluates exact source behind a Java Temporal Activity; Lean and TypeScript validate a content-bound receipt and apply BPMN routing.

## Selected source slice

The first profile admits one private executable acyclic Process with:

- one None Start Event;
- one User Task before the conditional decision, so evaluation rollback has a visible pre-command state;
- one divergent Exclusive Gateway with exactly one incoming Sequence Flow;
- exactly two non-default outgoing Sequence Flows carrying `FormalExpression` conditions and exactly one declared default Sequence Flow;
- one distinct User Task on each outgoing branch; and
- unconditional branch tails to one None End Event.

The gateway is divergent only. Converging Exclusive Gateway behavior, a gateway with more or fewer candidates, conditional Sequence Flow on another Flow Node, multiple gateways, parallel interaction, loops, and a gateway without a default are excluded from this first source profile.

The exact condition character data is retained after XML decoding, including whether it uses `${...}` or `#{...}`. Each expression is limited to 256 UTF-8 bytes. The measured target maximum is 91 bytes, so this is a resource bound with explicit headroom rather than a target-string allowlist.

Definition admission invokes the pinned Java evaluator's parse-only validation before Workflow start. A syntax failure rejects admission, matching the pinned CIB deployment boundary; TypeScript does not parse JUEL to perform this check.

## First context and value domain

The first request contains every Process-scope binding visible at the gateway, sorted by project canonical variable-name order. It never contains only the variables that an expression is predicted to read.

Each binding value is exactly `string | null`. Absence means no binding with that name; explicit null means one binding whose value is null. Duplicate names, unsupported value kinds, an Activity-local binding, or an omitted visible Process binding invalidate the request.

Boolean is the required condition result but is not yet an admitted Process-variable value. Nested maps, lists, arrays, numbers, Boolean Process variables, dates, binary values, serialized Java objects, and target-specific data structures remain outside this capsule.

The Java evaluator installs only exact root-variable resolution over the supplied immutable bindings. It installs no bean, property-on-Java-object, method, function, class, `execution`, Process Engine service, Spring, file, network, or mutation resolver. An expression that attempts one of those capabilities produces a typed profile error rather than acquiring the capability.

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

The command that leaves the preceding User Task remains speculative until the gateway receipt selects a route. A typed JUEL resolution, unsupported-capability, non-Boolean-result, or evaluation error returns the command outcome `rolledBack` and restores the exact committed state that existed before User Task completion.

The speculative continuation is private runtime state and is not exposed by canonical observation. While the evaluator Activity is pending, Queries expose only the last committed state. No downstream branch task, Process-variable change, or completed command receipt is visible before successful evaluation and atomic commitment.

Syntax error is an admission failure under the parse-only preflight, not a runtime rollback result. Temporal Worker loss, timeout, cancellation, malformed transport, and exhausted Activity attempts are adapter or infrastructure failures; they do not become JUEL or BPMN outcomes and do not commit speculative state.

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

Applying a command returns either a completed semantic result or a private suspended continuation containing:

- the original committed state;
- the speculative post-stimulus state at the conditional choice;
- the exact evaluation request;
- the originating semantic command identity; and
- no host Activity ID, attempt number, task queue, or Run ID.

Resuming with a valid successful receipt continues closure and commits once. Resuming with a typed evaluation error returns `rolledBack` and the original committed state. A continuation cannot be resumed twice, with another command, or after another state has committed.

The pending continuation is persisted by the Temporal Workflow for durability but is omitted from the canonical BPMN observation. It is removed on successful commit or typed rollback.

Only the existing single semantic input loop may create, await, and resume the continuation. While it awaits the evaluator Activity, later accepted semantic commands remain queued and their handlers remain pending; they cannot mutate committed state or overtake the suspended command. After success or typed rollback, the loop publishes that command result and resumes the queue. This preserves the production lifecycle's explicit acceptance-order nondeterminism without adding concurrent semantic-core execution.

## Temporal hosting and refinement preflight

The Java evaluator is a normal Activity Worker on a dedicated task queue. The TypeScript Workflow does not load Java, spawn a JVM, use a Local Activity, or evaluate an expression.

One gateway activation creates one Activity request containing both ordered candidates and the complete context. The Activity returns after the first true condition or after both false; there is no Activity per condition.

The request and result use a closed shared schema and the Temporal SDKs' JSON payload boundary. A cross-SDK test must lock exact strings, ordered arrays, explicit null, absence, non-ASCII scalar strings, unknown/missing fields, duplicate variable names, and the request digest before semantic integration begins.

The proposed Activity policy is start-to-close 2 seconds, schedule-to-close 10 seconds, two attempts, fixed 100-millisecond retry backoff, and no heartbeat. Read-only duplicate execution is safe because the immutable request has no capability and the result is content-bound. A typed JUEL error is returned as a successful Activity result and is not retried; transport or Worker failure follows the bounded Activity retry policy.

Replay consumes the recorded Activity result and does not run JUEL again for a completed activation. Worker replacement before acknowledgement must reproduce the same receipt. A bypass mutation in which Workflow code fabricates or modifies a condition result must fail request/receipt validation.

One successful evaluation adds the ordinary Activity and Workflow Task lifecycle Events to Temporal history. Internal semantic transitions before and after the Activity may close inside their Workflow Tasks without one Event per semantic step. This capsule neither introduces Continue-As-New nor changes the qualitative history-cost decision.

The state relation is: committed Workflow state equals committed semantic-core state; a pending evaluator Activity additionally carries one content-bound suspended continuation whose canonical projection is the unchanged pre-command observation. Successful Activity completion plus receipt application refines one atomic semantic command commitment; typed evaluation error refines `rolledBack`; infrastructure failure has no semantic transition.

## Error contract

The Java boundary returns one of:

- `evaluated`, with the exact valid Boolean prefix;
- `unresolvedIdentifier`, for an absent or unresolved root;
- `unsupportedCapability`, for property, method, function, bean, class, engine, or mutation access outside the resolver profile;
- `nonBooleanResult`, when the pinned CIB condition contract does not receive a non-null `Boolean`; or
- `evaluationFailure`, for another bounded JUEL runtime failure.

Each error identifies the first candidate that failed and carries a stable project code, not a Java exception class, stack trace, source path, bean name, or engine object. Error messages are diagnostic-only and excluded from semantic comparison.

Malformed request/result payloads, digest disagreement, impossible prefixes, and Java Worker protocol errors are adapter failures rather than evaluation errors.

## Targeted preservation gate

The capsule must add an executable source/profile check proving that the longest internal closure segment of every newly admitted program is at most `semanticProcessClosureLimit`, currently 8. The evaluation suspension divides closure into two checked segments; it does not reset or evade the bound.

The first source profile forbids a reachable state in which conditional choice and another independent operation are simultaneously enabled. Lean and TypeScript must each reject every mutated witness that violates that admission premise. A later profile that makes multiple-enabled conditional choice reachable must either prove the choices commute and are order-invariant, introduce an explicit semantic choice, or make Lean and TypeScript reject the state identically.

The canonical wait-order rule is unchanged because conditional evaluation is private and does not add a public wait kind. A future decision to expose it publicly would reopen the observation contract and evidence, not silently extend `activeWaits`.

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
11. runtime evaluation failure with exact pre-command task/state rollback;
12. candidate-order, context, definition, activation, prefix, and digest receipt mutations;
13. Java Worker loss/retry/replacement and same-run history replay; and
14. a Temporal bypass mutation that fabricates a receipt.

The existing CIB and isolated-JUEL probes establish items 1–11 as feasibility and oracle evidence. They do not establish the proposed Lean, TypeScript, shared wire, Temporal, or retained-evidence claims.

## Rule-to-evidence plan

| Rule | BPMN/profile review | Lean | CIB Seven | TypeScript | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|---|
| `XGW-EVALUATE-01` | Clause 13.4.2, Table 13.2, `CIB-INT-0001` | Declarative ordered-choice premise and lowering-order theorem | Reversed-reference declaration-order probe | Ordered request projection | One ordered Activity request | Candidate reorder |
| `XGW-SHORT-CIRCUIT-01` | `CIB-AGR-0006` | Valid-prefix relation | Earlier true suppresses later failure | Prefix validator and route evaluator | One Activity returns one prefix | Extra result after true |
| `XGW-DEFAULT-01` | Clause 13.4.2, Table 13.2 | All-false default law | All-false default probe | Default selection | Recorded all-false receipt | Shortened all-false prefix |
| `XGW-ROUTE-01` | BPMN token rule | Transition soundness and exactly-one-output law | Selected branch observation | Pure token transition | Query/Update result and replay | Duplicate/unselected output |
| `XGW-RECEIPT-01` | Project binding contract | Exact receipt hypotheses | Not an independent receipt account | Strict validator | Cross-SDK and bypass guards | Identity/order/context/digest mutations |
| `XGW-JUEL-01` | `CIB-CFG-0005` | Truth remains an input | Engine and isolated same-runtime probes | Truth remains an input | Java Worker uses pinned runtime | Capability and non-Boolean probes |
| `XGW-ROLLBACK-01` | `CIB-OP-0004` | Rollback relation preserves state | Failed-start zero-state and User Task rollback probe | Suspended-command rollback | Speculative invisibility, retry, replay | Downstream visibility and state-drift mutations |

Lean and TypeScript are independent transcriptions of the receipt-consuming BPMN rule. They are not independent JUEL truth accounts. Temporal refines the TypeScript core and is not another semantic account.

## Dependencies and removal cost

The proposed Worker has two runtime roots and one build-time version alignment:

- `org.cibseven.bpm.juel:cibseven-juel:2.0.0` for JUEL parsing and evaluation;
- `io.temporal:temporal-sdk:1.35.0` for the Java Activity Worker; and
- imported `com.fasterxml.jackson:jackson-bom:2.21.5` to replace Temporal's vulnerable Jackson `2.15.4` transitive family with one patched aligned family.

[SOURCES.md](../SOURCES.md#candidate-java-juel-evaluator-worker) owns the exact 38-jar resolved graph, integrity, licenses, current advisory scan, provenance, and removal cost. None is adopted by this proposal.

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

1. the exact dependencies are explicitly approved and committed with their graph and licence record;
2. source admission and parse-only validation are red/green and reject every excluded source shape;
3. the checked graph and generic `choose` IL operation preserve exact candidate/default Sequence Flow identities, order, expressions, and profile identity across TypeScript and Lean;
4. Lean defines the declarative relation, executable evaluator, evaluator soundness, exact route laws, rollback preservation, receipt refusals, and nearest non-laws;
5. the pure TypeScript semantic core implements the same receipt-consuming account without JUEL or I/O;
6. the Java evaluator enforces the closed resolver and typed errors;
7. cross-SDK payload, Worker loss/retry/replacement, speculative invisibility, history, replay, and bypass evidence are green;
8. the closure-limit and multiple-enabledness guards pass for every admitted program;
9. CIB evidence is content-bound with meaningful order, short-circuit, default, error, and rollback mutations;
10. the implementation map, requirement ledger, relationship register, profile, test specification, and plan state the exact implemented and absent claims; and
11. an epistemic-closure review confirms the shared-JUEL common mode and the nearest unsupported conditional-routing claim.
