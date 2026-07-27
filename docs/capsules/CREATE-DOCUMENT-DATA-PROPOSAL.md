# CreateDocument data and mapping proposal

## Status

**Proposed; owner decision required.**

This capsule proposes the smallest semantic and compatibility contract needed to admit the maintained A12 Workflows `CreateDocument.bpmn` source unchanged while preserving the project's single TypeScript semantic core, Temporal Activity boundary, and Lean assurance model.

The [CIB Seven 2.0 target assessment](../research/CIB-SEVEN-A12-BASELINE-RESEARCH.md) owns release comparison. The [A12 Workflows compatibility ledger](../research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) owns the product denominator. This proposal does not approve implementation, a JVM Worker, general variables, general JUEL, or a compatibility claim.

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
- profile-supplied effect protocol plus source-supplied bean handler;
- committed effect arguments derived before Activity execution;
- one successful Activity-local result patch;
- deterministic output mapping and Process-variable projection;
- successful CIB/Lean/core/Temporal final-state agreement with explicit fidelity;
- explicit classification of the synchronous CIB transaction versus the durable Temporal effect boundary.

## Excluded scope

Numbers, booleans, null, lists, maps, documents, serialized Java objects, arbitrary variable names or scopes, duplicate names, process-input expressions, general JUEL, property or method access, coercion, bean invocation as expression evaluation, mutable expressions, Groovy, FreeMarker, Script Tasks, execution listeners, arbitrary delegates, Java binary compatibility, `DelegateExecution`, service faults, `BpmnError`, boundary events, incidents, retries as semantics, rollback equivalence, cancellation, multiple effects, and general input/output mapping are excluded.

The next proposed semantic capsule after this one is typed `BpmnError` plus boundary-error handling. Four maintained A12 delegates supply that consumer. This proposal shapes its success result as an extensible union but does not add the error variant.

## Source and license boundary

The target file remains in the registered A12 Workflows checkout under its EUPL-or-commercial license. It must not be copied into the MIT repository or relicensed by implication.

The implementation may use:

1. a project-authored MIT fixture with the same admitted semantic shape for mandatory repository gates; and
2. an exact-byte, hash-bound optional target gate reading the registered external checkout.

An exact A12 fixture may become mandatory and tracked only after the owner supplies explicit redistribution or relicensing authority. Until then, "unchanged admission" means the external source bytes pass the target gate without rewriting; it does not mean the file is redistributed here.

## CIB target decision

Select a new CIB Seven `2.0.0` A12 target profile. Do not mutate, alias, or relabel the current `2.2.0` profiles.

The target profile may reuse reviewed clauses and witness designs from the payload-free Service Task capsule where the underlying CIB source is byte-identical. It must generate its own engine-version-bound observations and content-bound evidence.

The profile supplies protocol identity `urn:bpmn-lean:a12-delegate:v1` because the maintained source has no standard BPMN `implementation` attribute. The source's exact delegate-expression token supplies handler identity `createDocumentDelegate`.

```ts
type EffectDescriptor = Readonly<{
  protocol: "urn:bpmn-lean:a12-delegate:v1";
  handler: "createDocumentDelegate";
}>;
```

The protocol is a versioned project compatibility contract, not a fact read from the BPMN attribute. The checked graph records that provenance. Admission rejects a different or compound bean expression; recognizing the exact `${createDocumentDelegate}` token remains structural binding, not general JUEL execution.

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

The input body `MyDocumentModel` normalizes to `stringLiteral`. The output body `${newDocRef}` normalizes to `localVariable`. The checked source retains the exact bodies so Lean independently validates normalization.

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

The Process scope survives until Process completion and is canonically observable. The Activity-local scope exists only while the effect occurrence is active. It is core-owned runtime state and is not independently writable by a Worker.

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

The local scope is then removed, the output token is produced, and supported closure reaches the End Event. `newDocRef` never appears in Process variables; `documentModelName` never leaks into Process variables; only `myDocumentReference` remains canonically observable after completion.

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

The nearest host counterexample is an Activity that returns `newDocRef` but the adapter writes `myDocumentReference` directly, bypassing the semantic mapping. Retained history plus a mapping-bypass mutation must detect that account.

## Smallest witnesses

| Witness | Wrong account separated |
|---|---|
| Intent arguments contain only `documentModelName = "MyDocumentModel"` | Input mapping is deferred to or invented by the Worker |
| Result patch contains only local `newDocRef`; final state contains only Process `myDocumentReference` | Worker writes Process state directly or local variables leak scope |
| Missing/extra/wrong-typed patch rejects with unchanged wait | Any Worker payload is trusted and completion always advances |
| Changing the literal changes transport identity | Idempotency key omits effect arguments |
| Changing the patch changes completion-command identity | Result content is not command-bound |
| CIB `2.0.0` delegate observes the mapped input, sets local output, and final Process scope contains the mapped target | Source extension mapping is accepted syntactically but not executed |
| Temporal Activity-bypass or output-mapping-bypass mutation fails | Pure final equality hides fabricated execution or host-owned mapping |
| Scripted delegate failure after external mutation is not compared as semantic rollback | Successful equality is generalized into false transaction equivalence |

## Evidence required before graduation

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
- Temporal Activity request from committed arguments, typed result validation, semantic output mapping, retry/replay/Worker-replacement evidence, and mapping-bypass detection;
- explicit successful-transaction fidelity row and a retained negative assertion that failure/rollback equivalence is not claimed;
- complete applicable gate within existing budgets.

## Decisions requested

1. Approve a distinct CIB Seven `2.0.0` A12 target profile for this capsule; do not merge it with `2.2.0`.
2. Approve the exact unchanged `CreateDocument` source shape with profile-supplied protocol `urn:bpmn-lean:a12-delegate:v1` and source handler `createDocumentDelegate`.
3. Approve string-only typed values, one Process scope, one Activity-local scope, literal input mapping, and exact simple local-variable output reference.
4. Approve committed effect arguments, one validated Activity-local success patch, and core-owned output mapping to canonical Process variables.
5. Approve transport identity extended by committed arguments and completion-command identity extended by the typed patch.
6. Approve success-only final-observation refinement while explicitly rejecting failure/rollback transaction equivalence.
7. Approve the two-part fixture strategy: mandatory project-authored equivalent plus optional exact external target gate until redistribution authority is supplied.
8. Place typed `BpmnError` and boundary-error semantics immediately after this data contract; do not implement them here.

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
