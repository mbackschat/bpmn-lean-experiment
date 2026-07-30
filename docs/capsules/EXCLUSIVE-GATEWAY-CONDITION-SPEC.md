# Exclusive Gateway conditional routing specification

## Status

**Evidence-closed draft implemented on 2026-07-31 under the standards-first Simple Boolean expression profile. The former JUEL-first Activity account is deferred to a separate CIB compatibility slice.**

## Question

What is the smallest complete divergent Exclusive Gateway mechanism that executes admitted BPMN `FormalExpression` source, proves first-true/default routing independently in Lean and TypeScript, and advances BPMN structure without making a vendor expression runtime a prerequisite?

## Normative and profile basis

BPMN 2.0.2 Clause 13.4.2 and Table 13.2 require each divergent Exclusive Gateway activation to select exactly one outgoing branch: conditions are evaluated in a defined order, the first true condition wins, later conditions are not evaluated, and the default Sequence Flow is selected only when every condition is false.

The standard defines `FormalExpression` and language selection but does not define one universal grammar. `Definitions.expressionLanguage` defaults to XPath 1.0 when omitted. The selected source must therefore explicitly name the project language URI `urn:bpmn-lean:expression:simple-boolean:v1`; no source may reach the project evaluator through omission or fallback.

The [Simple Boolean expression decision](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) owns the five-form language, Process-binding context, total Boolean result, versioning, and exact exclusions. This capsule owns only the consuming conditional-routing mechanism and its first source topology.

Candidate order is process-level XML `sequenceFlow` declaration order. This is the selected project profile interpretation of BPMN's required defined order. `CIB-INT-0001` independently records that pinned CIB makes the same choice, but CIB does not define the standards profile.

The applicable CIB relationships remain `CIB-AGR-0006` and `CIB-INT-0001` for the shared first-true/default and order observations. `CIB-CFG-0005` and `CIB-OP-0004` belong only to the deferred JUEL overlay and do not enter this capsule's implementation or evidence.

## Source and admission boundary

The first admitted Process has exactly:

- one private Process with explicit `isExecutable="true"`;
- one none Start Event;
- one divergent Exclusive Gateway with exactly one incoming Sequence Flow;
- exactly two non-default outgoing Sequence Flows with one BPMN `tFormalExpression` condition each;
- exactly one conditionless default Sequence Flow referenced by the gateway's `default` attribute;
- one distinct User Task and one distinct none End Event on each of the three branch tails; and
- no other Flow Node, extension element, condition, or executable behavior.

`Definitions.expressionLanguage` is exactly `urn:bpmn-lean:expression:simple-boolean:v1`. A condition has no individual `language` override. Its `xsi:type` is absent or resolves to BPMN `tFormalExpression`, and it has no foreign resource attribute or child element. The exact decoded body satisfies Simple Boolean v1.

The default Flow carries no condition. Every non-default outgoing Flow carries one condition. Gateway `<outgoing>` reference order may disagree with process-level `sequenceFlow` declaration order and does not alter evaluation order.

Profile admission parses every body and rejects unsupported syntax, invalid Unicode, duplicate/ambiguous spelling, an omitted or different definition language, a per-expression override, a condition on the default, an unconditioned non-default Flow, unresolved references, and every unsupported topology before a Process Workflow starts.

Converging or mixed Exclusive Gateways, more or fewer candidates, conditional Sequence Flow from another Flow Node, multiple gateways, loops, parallel interaction, a missing default, and branch-tail merging remain outside the first profile.

## Semantic rules

### `XGW-EVALUATE-01` — evaluate candidates in checked order

When one token reaches the `choose` operation, evaluate its ordered candidate expressions against the complete committed Process-scope bindings from the same stable runtime state.

The gateway's order is definition data, not runtime collection order or a Temporal scheduling choice.

### `XGW-SHORT-CIRCUIT-01` — stop after the first true result

The first candidate whose expression evaluates `true` is selected. No later expression is evaluated and no later branch can receive a token.

Changing an unevaluated tail expression cannot change the selected branch when an earlier condition is true.

### `XGW-DEFAULT-01` — use the default only after all false

The default output is selected if and only if every ordered candidate evaluates `false`.

A missing default is excluded, so this capsule does not implement the BPMN exception required when all conditions are false and no default exists.

### `XGW-ROUTE-01` — consume once and produce exactly one branch token

One firing consumes exactly one input token and adds exactly one token to the selected candidate or default output. It adds no token to any unselected output and does not retain a gateway wait.

## Checked graph and Semantic Process IL

The checked graph adds a divergent Exclusive Gateway node with its exact default Sequence Flow identity and adds a nullable condition record to each Sequence Flow. A condition record retains the explicit language URI and exact decoded body; it does not retain a moddle object or evaluator closure.

Lowering parses each checked body independently into the closed `SimpleBooleanExpression` type and emits one generic `choose` operation:

```ts
type ConditionalCandidate = DeepReadonly<{
  condition: SimpleBooleanExpression;
  output: string;
  origin: {
    kind: "bpmnSequenceFlow";
    elementId: string;
  };
}>;

type ChooseOperation = DeepReadonly<
  OperationBase & {
    kind: "choose";
    input: string;
    candidates: [ConditionalCandidate, ConditionalCandidate];
    defaultOutput: string;
    defaultOrigin: {
      kind: "bpmnSequenceFlow";
      elementId: string;
    };
  }
>;
```

`choose` is a reusable ordered conditional-choice mechanism, not an `exclusiveGateway` opcode. Reuse for another BPMN source construct requires that construct's own capsule and lowering proof.

Lean decodes the checked exact bodies, independently parses them during canonical lowering, and requires exact equality with the received typed program. The TypeScript source compiler implements its own parser/lowerer. Neither implementation receives precomputed expected truth.

## Runtime and command closure

Simple Boolean evaluation is pure, total after admission, and synchronous inside internal closure. It adds no command, receipt, continuation, activation counter, public wait, rollback arm, or semantic error result.

The exact profile guard admits eight operations and seven control places arranged as one initiation, one choice, three branch waits, and three terminations. Starting the Process takes exactly three internal transitions: `initiate`, `choose`, then `awaitUserTask`. Completing the accepted branch takes one `terminate` transition. The runtime-bound guard exposes exhaustion at two start steps; every admitted command path remains below `semanticProcessClosureLimit = 8`.

The first topology permits no state in which `choose` and another independent internal operation are simultaneously enabled. Source admission fixes graph cardinality and branch ownership, the TypeScript execution-surface guard rejects an added or duplicated operation, and Lean rejects any received program unequal to canonical lowering before evaluation. This is a profile-specific reachability guard, not a general TypeScript ambiguity detector.

## Temporal hosting and refinement preflight

No new durable mechanism is required:

| Concern | Hosting decision |
|---|---|
| Durable ingress | Existing start and exact User Task completion Updates |
| Wait | Existing semantic User Task wait after pure closure |
| Timer | None |
| Effect or Activity | None |
| Cancellation | None |
| Lifecycle | Existing semantic-lifetime Workflow and accepted-handler draining |
| Projection | Existing canonical Process status, waits, tasks, variables, interactions, and logical time |

The Workflow receives the admitted typed program, invokes the pure TypeScript semantic core, and persists the resulting state. It does not parse expression source or choose a branch itself. Replay reexecutes the same pure `choose` transition from the same program and committed Process bindings.

The state relation remains exact equality between committed Workflow-held core state and the pure core state. Expression evaluation and routing create no Temporal Command of their own and add no per-expression Event History entry.

The smallest refinement witness starts the conditional Process, observes exactly the selected branch User Task, completes it, reaches semantic completion, replays the produced history, and rejects a Workflow-bypass mutation that substitutes a branch outside the core result.

## Runtime-only and synthetic construct inventory

This capsule adds no runtime-only or synthetic construct. Parsed Simple Boolean values and `choose` candidates are immutable definition data. Candidate order and default identity originate from admitted Sequence Flows. Runtime state uses only existing control-place tokens, Process bindings, User Task occurrences, activation counters for those User Tasks, and end occurrences under their existing ownership and projection rules.

## Versioning consequences

This is one atomic pre-release contract replacement across `CheckedSequenceFlow`, `CheckedNode`, `SemanticOperation`, the checked graph and Semantic Process schemas, TypeScript and Lean decoders/lowerers, validators, fixtures, and tests. It does not change command-result, runtime-state, canonical-observation, stimulus, CIB-evidence, or Temporal payload shapes.

Implementation creates one draft standards profile identity `bpmn-2.0.2-simple-boolean-exclusive-gateway-draft`. It does not mutate a CIB profile or reinterpret existing scenario/evidence bytes. A language change requires a new language URI; a routing-semantics change requires a new profile identity and rule IDs as applicable.

The former proposed JUEL receipt, suspension, rollback, Java Worker, cross-SDK, and evaluator-Activity contract is not retained as a parallel current representation. It remains deferred design in the [JUEL architecture decision](../JUEL-EVALUATION-ARCHITECTURE-DECISION.md).

## Maintained separating witnesses

The minimum executable witnesses are:

1. first candidate `true`, with a changed second candidate proving tail irrelevance;
2. first `false` and second `true`;
3. both candidates `false`, selecting the default;
4. reversed gateway `<outgoing>` references with unchanged `sequenceFlow` declarations;
5. `isPresent`, `isNull`, and `stringEquals` over present string, explicit null, and absent Process bindings;
6. invalid syntax, overlength source, invalid identifier, invalid JSON string escape, and unpaired surrogate rejection;
7. omitted XPath-default language, a different language URI, and a per-expression override rejection;
8. conditional default and conditionless non-default rejection;
9. exact checked-body-to-typed-AST lowering equality and a body/AST mutation;
10. duplicate output, missing output, candidate reordering, and invalid default-reference program mutations;
11. exact three-step start closure, an over-limit mutation, and a multiple-enabledness mutation; and
12. Temporal selected-branch observation, completion, replay, inherited User Task Worker-restart coverage, and a gateway-specific Workflow branch-bypass mutation.

The current CIB JUEL probes remain calibration evidence for `CIB-AGR-0006` and `CIB-INT-0001`. They are not translated into Simple Boolean sources, retained as this profile's expected results, or counted as an independent language-truth lane.

## Rule-to-evidence matrix

| Rule | Layer | Normative/profile basis | Lean | CIB Seven | TypeScript | Temporal | Negative or mutation |
|---|---|---|---|---|---|---|---|
| `XGW-EVALUATE-01` | BPMN rule plus project order interpretation | Clause 13.4.2, Table 13.2, `CIB-INT-0001` as separate compatibility fact | Independent parser, exact canonical-lowering check, and checked-order transition | Declaration-order calibration only | Strict source admission, typed lowering, and pure evaluation | Core-hosted closure | Reversed gateway references, body/AST inequality, and wrong-route mutation |
| `XGW-SHORT-CIRCUIT-01` | BPMN-neutral | Clause 13.4.2 | `first_true_ignores_tail` | JUEL calibration only | Tail mutation leaves the route unchanged | Selected wait is stable on replay | Later-candidate mutation |
| `XGW-DEFAULT-01` | BPMN-neutral | Clause 13.4.2, Table 13.2 | Executable all-false default witness | JUEL calibration only | Exact default selection | Pure closure uses the same default route | Conditional-default and default-reference mutations |
| `XGW-ROUTE-01` | BPMN-neutral | Token-routing rule | Evaluator soundness plus `selected_output_owned` | Selected-branch calibration only | Pure consume-one/produce-one transition | Query/Update result, replay, and route-bypass discrimination | Duplicate output, source-origin, and Workflow route-substitution mutations |

## Exclusions and nearest unsupported claim

This capsule excludes XPath, JUEL, FEEL, scripts, expression composition, coercion, nested data, numbers, Boolean Process variables, paths, methods, functions, mutation, conditional Events, loop conditions, assignments, mappings, converging or mixed gateways, more than two candidates, missing defaults, branch merging, and CIB or A12 unchanged-model execution.

The closest unsupported claim is a divergent Exclusive Gateway under another expression language or source cardinality. General BPMN expression support, Common Executable XPath support, general Exclusive Gateway behavior, and BPMN Process Execution Conformance remain unsupported.

## Assurance boundary

The checked BPMN graph and Semantic Process program have one TypeScript producer. Lean independently parses the retained expression bodies and checks graph-to-program lowering equality, but it does not independently parse BPMN XML; a shared XML-to-checked-graph defect could therefore reach Lean, the TypeScript core, and Temporal together. CIB's JUEL probes can separate declaration-order and first-true/default structure, but not truth in the project language.

The nearest realistic counterexample is a source whose gateway references suggest one order while process-level Sequence Flow declarations establish another. The answer-free standards scenario contains that discriminator, and the compiler plus Lean lowering preserve declaration order. A schema-valid Workflow route substitution changes the observed User Task from `Task_First` to `Task_Second` and is detected at the differential boundary.

This capsule changes no canonical observation field and retains no CIB expected result. Its standards-only differential case declares Lean as the reference result and compares the independently implemented TypeScript core and Temporal host. CIB remains a calibration lane for the separately named relationship records, never an expression-truth oracle for Simple Boolean v1.
