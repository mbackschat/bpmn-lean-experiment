# CreateDocument data and mapping specification

## Role

This specification owns the approved bounded source, data, mapping, effect-result, host-refinement, evidence, and exclusion contract for the A12-shaped `CreateDocument` slice. Exact current implementation and evidence status belongs in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md), and immediate sequencing belongs in [PLAN.md](../PLAN.md).

This capsule defines the smallest semantic and compatibility contract needed to admit the maintained A12 Workflows `CreateDocument.bpmn` source unchanged while preserving the project's single TypeScript semantic core, Temporal Activity boundary, and Lean assurance model.

This is a deliberate vertical feasibility slice, not the architectural location of A12 behavior. Literal input mapping, scoped result validation, output mapping, and effect-result commitment are reusable BPMN/CIB mechanisms; the exact bean token, its profile registration to a neutral operation, the external source check, and migration measurement belong outside the semantic core. Another A12 model that uses these same contracts should add adapter/profile configuration and regression evidence rather than another model-specific semantic path.

The [CIB Seven 2.0 target assessment](../research/CIB-SEVEN-A12-BASELINE-RESEARCH.md) owns release comparison. The [A12 Workflows compatibility ledger](../research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) owns the product denominator. Owner approval authorizes this bounded implementation; it does not authorize a JVM Worker, general variables, general JUEL, or a broader compatibility claim.

## Question

Can one synchronous A12 Service Task receive one literal string input, execute through a committed language-neutral effect intent, return one typed Activity-local string patch, map that local value to one Process variable, and reach the same successful canonical result as CIB Seven `2.0.0`, without claiming transaction or failure equivalence?

The exact target topology is:

```text
None Start
    ↓
CreateDocument Service Task
    ↓
None End
```

The exact maintained source has:

- handler token `${createDocumentDelegate}`;
- input parameter `documentModelName = "MyDocumentModel"`;
- output parameter `myDocumentReference = ${newDocRef}`;
- no standard `implementation` URI;
- no `asyncBefore` or `asyncAfter`;
- Camunda Modeler metadata, `camunda:versionTag`, and BPMNDI.

## Required scope

- exact CIB Seven `2.0.0` A12 target profile, distinct from every `2.2.0` profile;
- exact unchanged source admission for this one model shape;
- string values only;
- one Process scope and one Activity-local scope;
- one literal input mapping and one simple local-variable-reference output mapping;
- profile-registered neutral Activity protocol and mapped-success operation;
- committed effect arguments derived before Activity execution;
- one successful Activity-local result patch;
- deterministic output mapping and Process-variable projection;
- successful CIB/Lean/core/Temporal final-state agreement with explicit fidelity;
- explicit classification of the synchronous CIB transaction versus the durable Temporal effect boundary.

## Excluded scope

Numbers, booleans, null, lists, maps, documents, serialized Java objects, arbitrary variable names or scopes, duplicate names, process-input expressions, general JUEL, property or method access, coercion, bean invocation as expression evaluation, mutable expressions, Groovy, FreeMarker, Script Tasks, execution listeners, arbitrary delegates, Java binary compatibility, `DelegateExecution`, service faults, `BpmnError`, boundary events, incidents, retries as semantics, rollback equivalence, cancellation, multiple effects, and general input/output mapping are excluded.

The next proposed semantic capsule after this one is typed `BpmnError` plus boundary-error handling. Four maintained A12 delegates supply that consumer. This specification shapes its success result as an extensible union but does not add the error variant.

## Source and license boundary

The target file remains in the registered A12 Workflows checkout under its EUPL-1.2 license. It must not be copied into the MIT repository or relicensed by implication.

The implementation may use:

1. a project-authored MIT fixture with the same admitted semantic shape for mandatory repository gates; and
2. an exact-byte, hash-bound optional target gate reading the registered external checkout.

An exact A12 fixture may become mandatory and tracked only after the owner supplies explicit redistribution or relicensing authority. Until then, "unchanged admission" means the external source bytes pass the target gate without rewriting; it does not mean the file is redistributed here.

## CIB target decision

Select a new CIB Seven `2.0.0` A12 target profile. Do not mutate, alias, or relabel the current `2.2.0` profiles.

The target profile may reuse reviewed clauses and witness designs from the payload-free Service Task capsule where the underlying CIB source is byte-identical. It must generate its own engine-version-bound observations and content-bound evidence.

The profile retains the exact source delegate-expression token and registers it to the neutral Activity protocol and mapped-success operation. The absence of a standard BPMN `implementation` attribute is part of the source binding; it does not cause a vendor or bean identity to enter the neutral descriptor.

```ts
type EffectDescriptor = Readonly<{
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1";
  operation: "urn:bpmn-lean:effect-operation:mapped-success-v1";
}>;
```

The neutral descriptor is a versioned project contract, not a fact read from a BPMN attribute. Exact source/profile evidence records the raw binding and its profile registration; the checked graph carries only the neutral descriptor plus generic mappings. Admission rejects a different or compound bean expression, so recognizing the exact `${createDocumentDelegate}` token remains structural binding rather than general JUEL execution. Lean independently validates neutral graph-to-program lowering but does not independently derive the raw binding registration.

## Source admission

Admission accepts only the exact semantic source shape:

- one executable private Process with the exact linear topology;
- the exact delegate-expression expanded QName and token;
- one `camunda:inputOutput` element;
- one input parameter named `documentModelName` with the literal body `MyDocumentModel`;
- one output parameter named `myDocumentReference` with exact simple reference `${newDocRef}`;
- no other executable extension attribute or element.

The importer preserves but excludes from semantics:

- BPMNDI, DI, and DC layout;
- Camunda Modeler execution-platform metadata;
- Service Task modeler-template metadata;
- Process `camunda:versionTag`.

Those fields remain exact-source and deployment metadata. A change affects source identity but does not become a runtime transition unless a later compatibility consumer justifies it.

Parser warnings remain admission-blocking. Unsupported executable content must never be dropped merely because the exact topology still matches.

## Typed value and expression contract

This capsule introduces one value variant:

```ts
type VariableValue = Readonly<{
  kind: "string";
  value: string;
}>;
```

It introduces two expression mechanisms:

```ts
type MappingExpression =
  | Readonly<{ kind: "stringLiteral"; value: string }>
  | Readonly<{ kind: "localVariable"; name: string }>;
```

The input body `MyDocumentModel` normalizes to `stringLiteral`. The output body `${newDocRef}` normalizes to `localVariable`. The checked graph retains the mapping names and normalized expression data so Lean independently validates neutral graph-to-program lowering. Exact lexical bodies remain source/profile evidence; Lean does not independently parse their Camunda syntax.

This is not a JUEL subset claim. The syntax recognizer accepts only the complete `${identifier}` form for this output position, with no whitespace, nesting, property access, call, operator, coercion, fallback, or side effect. The handler token is separately recognized as a binding token and is not evaluated through `MappingExpression`.

## Variable scopes and mappings

The runtime introduces:

```ts
type VariableBinding = Readonly<{
  name: string;
  value: VariableValue;
}>;
```

Canonical collections are sorted by exact scalar-value identifier order and reject duplicate names.

The implemented runtime uses the single replacement representation owned by the [scoped runtime data specification](SCOPED-DATA-SPEC.md):

```ts
type ScopedVariables = DeepReadonly<{
  process: {
    bindings: VariableBinding[];
  };
  activities: Array<{
    owner: EffectOccurrenceId;
    bindings: VariableBinding[];
  }>;
}>;
```

The Process scope survives until Process completion and is canonically observable. The Activity-local scope exists only while the complete effect occurrence is active, and its owner is the full `(processInstanceId, elementId, activation)` identity rather than a bare element or ordinal. It is core-owned runtime state and is not independently writable by a Worker.

Input mapping evaluates before effect intent commitment:

```text
stringLiteral("MyDocumentModel")
  → activityLocal.documentModelName
```

The committed effect intent exposes the evaluated input as immutable Activity arguments:

```ts
type EffectArgument = VariableBinding;

type EffectIntent = Readonly<{
  id: EffectOccurrenceId;
  descriptor: EffectDescriptor;
  arguments: readonly EffectArgument[];
}>;
```

The Worker returns one typed patch:

```ts
type EffectExecutionResult = Readonly<{
  kind: "success";
  localPatch: readonly [
    Readonly<{
      name: "newDocRef";
      value: Readonly<{ kind: "string"; value: string }>;
    }>
  ];
}>;
```

The core validates the patch before mutation. Missing, extra, duplicate, wrongly named, or non-string entries reject the semantic result with exact state preservation.

After patch commitment, output mapping evaluates:

```text
activityLocal.newDocRef
  → process.myDocumentReference
```

Completion requires exactly one Activity-local scope owned by the submitted effect occurrence. The local scope is then removed, the output token is produced, and supported closure reaches the End Event. A missing or duplicate owner rejects with exact state preservation. `newDocRef` never appears in Process variables; `documentModelName` never leaks into Process variables; only `myDocumentReference` remains canonically observable after completion.

## Effect and command evolution

`awaitEffect` reuses the existing effect mechanism and adds typed input/output mapping data rather than a second data-specific operation.

`openEffects` adds the committed sorted `arguments` collection. The transport material includes those arguments so idempotency identity changes when the requested external effect changes.

```text
["effectTransport",
  [semanticProfile, sourceId, sourceSha256, processId],
  [processInstanceId, elementId, activation],
  [protocol, handler],
  [["documentModelName", ["string", "MyDocumentModel"]]]]
```

The successful `completeEffect` stimulus adds the typed local patch. Its content-bound command identity includes every patch field and value under a distinct domain. A retry or replay of the same result remains the same command; a conflicting result under the same command ID is an infrastructure identity conflict rather than an accepted semantic alternative.

The Activity request is the descriptor, idempotency key, and committed arguments. The Worker return is only the typed result. Neither side receives mutable Process state or chooses the output mapping.

## Stable semantic rules

### `CDATA-INPUT-01`

Activation evaluates the literal input mapping exactly once, creates one Activity-local string binding, and commits one effect intent whose arguments equal that binding.

### `CDATA-INTENT-01`

The committed descriptor and arguments depend only on admitted definition data and committed semantic state and remain unchanged across observation, Activity attempts, replay, and Worker replacement.

### `CDATA-PATCH-01`

A matching successful effect result with exactly one `newDocRef` string patch commits that local value and no other variable.

### `CDATA-PATCH-REFUSE-01`

A missing, extra, duplicate, wrongly named, or wrongly typed local patch is rejected with exact semantic-state preservation.

### `CDATA-OUTPUT-01`

Successful completion evaluates `${newDocRef}` against the Activity-local scope, writes exactly one Process string variable `myDocumentReference`, removes the local scope, and resumes closure.

### `CDATA-SCOPE-01`

The final Process observation contains `myDocumentReference` and contains neither `documentModelName` nor `newDocRef`.

### `CDATA-TX-01`

For the successful path only, CIB's one-command input/delegate/output transaction and Temporal's committed-intent/Activity/result sequence refine to the same admitted canonical observations. The rule makes no equivalence claim for failure, rollback, cancellation, or an external mutation without semantic completion.

## Temporal hosting/refinement preflight

The Workflow state relation is:

- committed core state is the Workflow's semantic state;
- an in-flight Activity implies one unchanged active effect intent with immutable arguments;
- Activity attempts are refinement stutter;
- only a validated successful local patch permits `completeEffect`;
- output mapping and Process-variable mutation occur in the semantic core after Activity success.

The Activity is derived exclusively from the committed intent. A Worker cannot read or write Workflow state, choose an occurrence, add a Process variable directly, or bypass the mapping.

The existing retry, idempotency, exhaustion, Worker-replacement, bypass, replay, and cancellation boundaries from the [Service Task effect spec](SERVICE-TASK-EFFECT-SPEC.md) remain applicable. The transport key now includes typed arguments, and the completion command includes the result patch.

CIB executes this source synchronously during Process start. Its lane therefore supplies final success, mapping, delegate-input/output, and transaction facts but no independent effect-in-flight state. The CIB intermediate projection remains adapter-decided; the final Process variable and successful completion are engine-observed.

The nearest host counterexample is an Activity that returns `newDocRef` but the adapter writes the patch directly into Process scope, bypassing the semantic mapping. The Lean and TypeScript direct-patch-to-Process-scope non-law separates that account; retained Temporal history separately rejects an Activity bypass.

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Process variable scope | Semantic core from accepted effect results and admitted output mappings | Canonically sorted `variables` | Created empty at Process start, updated only by semantic mappings, retained through completion |
| Activity-local scope | Semantic core from evaluated input mappings and an accepted typed result patch | Never projected as Process variables; committed inputs appear only as effect `arguments` | Created at effect activation, extended by one validated result, removed on completion |
| Effect arguments | Semantic core from admitted literal input mapping before Activity scheduling | Immutable sorted `openEffects[].arguments` | Committed with the effect wait and removed with it |
| Typed local result patch | Activity result validated by the semantic core | Appears in the content-bound `completeEffect` stimulus, not as an independent state field | Applied exactly once or rejected without mutation |
| CIB execution-local variables and mapping transaction | CIB Seven `2.0.0` from the admitted extension binding | Raw mapping-execution evidence plus engine-observed final Process variable | Exists inside the synchronous start transaction; no committed effect-in-flight state |
| Temporal Activity request and result | Adapter from committed intent and Activity Worker response | Durable history and harness evidence only | Request is stable across attempts; the result advances semantics only through ordinary `completeEffect` admission |

## CIB fidelity labels

| Claim | Fidelity |
|---|---|
| Exact delegate expression and input/output extension were deployed under CIB Seven `2.0.0` | Engine-observed deployment fact |
| The delegate received `documentModelName = "MyDocumentModel"` | Probe-service-observed after engine input mapping |
| The delegate wrote Activity-local `newDocRef = "Document:42"` | Probe-service-observed |
| The Process completed with `myDocumentReference = "Document:42"` | Engine-observed history/final-state fact |
| CIB has a committed effect intent or Activity-local wait corresponding to `openEffects` | No claim; CIB invokes and completes the synchronous Service Task inside one command transaction |
| CIB and the project accounts choose the same transaction or rollback semantics | No claim; only the successful admitted boundary observations are related |

The differential judgement is therefore not four independent semantic derivations. Lean and the TypeScript core implement the reviewed semantic account; Temporal supplies refinement evidence for that core; CIB contributes a synchronous host-realization check over deployment, accepted start, mapped delegate execution, final Process variable, and completion.

## Rule-to-evidence matrix

| Rule | Profile clause | Lean | CIB Seven `2.0.0` | TypeScript core | Temporal refinement | Negative or mutation guard |
|---|---|---|---|---|---|---|
| `CDATA-INPUT-01` | Exact literal `documentModelName` input mapping | `literal_input_commits_exact_arguments` and exact waiting trace | Delegate observes the one engine-mapped literal argument | Start commits exactly one immutable effect argument | Activity request is derived from committed arguments | Argument variation/omission changes or collides with transport identity as expected |
| `CDATA-INTENT-01` | Exact raw source binding registered to the neutral Activity/mapped-success descriptor plus exact mappings | Exact neutral waiting trace and successful mapping trace; no raw source-translation claim | No semantic-intent claim; synchronous host execution only | Observation and transport material derive from admitted program plus committed state | Retry, replay, and Worker replacement preserve the same request | Raw-binding, neutral-operation, host-derived identity, and Activity-bypass mutations fail |
| `CDATA-PATCH-01` | Exact successful local `newDocRef` patch | `successful_result_maps_only_process_target` | Probe records one local write | Exact success patch commits | Typed Activity result produces one content-bound completion | Patch-field/value identity locks |
| `CDATA-PATCH-REFUSE-01` | Closed one-field result contract | Quantified `invalid_patch_is_rejected` with missing, extra, and duplicate examples | No result-ingress claim | Missing, extra, duplicate, wrong-name, and wrong-type patches preserve state | No independent mismatch input; adapter forwards the typed Worker result | Malformed-patch tests preserve the exact wait |
| `CDATA-OUTPUT-01` | Exact `${newDocRef}` output mapping | Exact final trace, output theorem, and direct-patch-to-Process-scope non-law | Engine maps local output to the Process variable | Core alone evaluates the output mapping and rejects direct patch naming as final scope | Adapter supplies only the typed local patch | Direct-patch mapping witness and Activity-bypass history mutation |
| `CDATA-SCOPE-01` | Process/local scope contract | Exact final variable theorem and trace | Final Process history contains the mapped target; the projector queries a fixed two-name variable allowlist, so exhaustiveness of the final Process scope is outside CIB's observation boundary | Final observation contains only `myDocumentReference` | Completed receipt and Query trace agree on the final variable | Final-variable projection mutation fails |
| `CDATA-TX-01` | Success-only `CIB-OP-0002` relation | Exact successful semantic trace | Synchronous start transaction reaches the selected final state | Two-step semantic effect trace reaches the same final state | Durable Activity/refinement trace reaches the same final state | Failure/rollback equivalence remains an explicit non-claim |

For `CDATA-OUTPUT-01` and `CDATA-SCOPE-01`, `camunda:inputOutput` has no BPMN normative rule, so the selected mapping account is CIB Seven's own behavior recorded as `CIB-EXT-0002`; CIB is the source of that account and therefore cannot also count as independent evidence for it. The non-CIB evidence for these rules is the Lean and TypeScript transcriptions, the direct-patch-to-Process-scope non-law, the malformed-patch refusal witnesses, and Temporal preservation — the same double-counting prohibition the [boundary-error capsule](BOUNDARY-ERROR-SPEC.md#rule-to-evidence-matrix) records for `BERROR-CIBMAP-01`.

## Smallest witnesses

| Witness | Wrong account separated |
|---|---|
| Intent arguments contain only `documentModelName = "MyDocumentModel"` | Input mapping is deferred to or invented by the Worker |
| Result patch contains only local `newDocRef`; final state contains only Process `myDocumentReference` | Worker writes Process state directly or local variables leak scope |
| Missing/extra/wrong-typed patch rejects with unchanged wait | Any Worker payload is trusted and completion always advances |
| Changing the literal changes transport identity | Idempotency key omits effect arguments |
| Changing the patch changes completion-command identity | Result content is not command-bound |
| CIB `2.0.0` delegate observes the mapped input, sets local output, and final Process scope contains the mapped target | Source extension mapping is accepted syntactically but not executed |
| Temporal Activity-bypass mutation fails and the Lean/core direct-patch account produces `newDocRef` rather than mapped `myDocumentReference` | Pure final equality hides fabricated execution or host-owned mapping |
| Scripted delegate failure after external mutation is not compared as semantic rollback | Successful equality is generalized into false transaction equivalence |

## Required evidence

- owner-approved CIB `2.0.0` A12 profile identity and exact relationship-register entries;
- warning-free exact external-source admission with no rewrite, plus a project-authored equivalent mandatory fixture unless redistribution is separately authorized;
- hostile source mutations for handler, input name/value, output name/reference, extra mapping, compound expression, executable extension content, and parser warning;
- checked graph retaining exact expression bodies, binding provenance, and metadata classification;
- IL data for typed mapping mechanisms without a topology-specific evaluator;
- Lean declarative relation, executable evaluator, soundness bridge, successful mapping trace, scope law, patch-refusal theorem, and nearest checked non-law;
- independently implemented TypeScript behavior and exact state-preservation witnesses;
- atomic wire evolution for typed values, Process variables, effect arguments, and result patch;
- core-owned canonical argument and patch encoding with field-variation and omission mutations;
- packaged CIB Seven `2.0.0` execution that observes delegate input, local output, final Process mapping, cleanup, and engine version;
- fresh content-bound `2.0.0` evidence, never relabeled `2.2.0` evidence;
- Temporal Activity request from committed arguments, typed result validation, semantic output mapping, retry/replay/Worker-replacement evidence, Activity-bypass detection, and the separate Lean/core direct-patch mapping discriminator;
- explicit successful-transaction fidelity row and a retained negative assertion that failure/rollback equivalence is not claimed;
- complete applicable gate within existing budgets.

## Approved decisions

The owner approved all eight selections:

1. a distinct CIB Seven `2.0.0` A12 target profile for this capsule, without merging it with `2.2.0`;
2. the exact unchanged `CreateDocument` source shape with its raw delegate-expression binding registered to neutral Activity/mapped-success identities;
3. string-only typed values, one Process scope, one Activity-local scope, literal input mapping, and exact simple local-variable output reference;
4. committed effect arguments, one validated Activity-local success patch, and core-owned output mapping to canonical Process variables;
5. transport identity extended by committed arguments and completion-command identity extended by the typed patch;
6. success-only final-observation refinement while explicitly rejecting failure/rollback transaction equivalence;
7. the two-part fixture strategy: mandatory project-authored equivalent plus optional exact external target gate until redistribution authority is supplied;
8. typed `BpmnError` and boundary-error semantics immediately after this data contract, without implementing them here.

## Stop conditions

Stop for owner direction if:

- the exact external source cannot be admitted without rewriting executable content;
- CIB Seven `2.0.0` differs from the assessed mapping or synchronous success account;
- exact target evidence would require copying external source into the MIT repository without license authority;
- input mapping cannot be committed before Activity scheduling;
- the Activity needs mutable Process state or direct output-mapping authority;
- output mapping or patch validation cannot remain deterministic and pure;
- a correct transport identity requires host state;
- successful comparison requires hiding a canonical Process-variable difference;
- failure or rollback behavior becomes necessary to claim the selected success path;
- the change requires general JUEL, Java delegate compatibility, a second semantic core, or a new dependency.
