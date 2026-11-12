# Kernel IL specification

## Status

Adopted kernel owner document (W0 extraction, 2026-11-09). The kernel modules it cites are the executable authority; where they differ, the difference is a defect of one of them.

The kernel IL is the program both kernels execute: one immutable, serializable, project-owned record per deployed definition, fixed in shape for every row of the [coverage target](../PRACTICAL-CIB7-COVERAGE-TARGET.md). [`Kernel/IL/Types.lean`](../../Kernel/IL/Types.lean) and [`Kernel/IL/Types/Options.lean`](../../Kernel/IL/Types/Options.lean) are the authority for every record and field; this document states the wire encoding, the shape at the level a producer or consumer needs, and the rules that keep the shape stable while admission widens. The [proposal's IL section](ARCHITECTURE-SPEC.md#il) owns the design rationale.

## Position in the pipeline

The exact BPMN XML bytes stay the provenance root and the CIB oracle's only input; CIB never consumes the IL ([decision][il-decision]). [`@bpmn-lean/bpmn-source`](../../packages/bpmn-source/src/kernel-reader/index.ts) parses the bytes, preserves them with their digest, and reads the model into the IL directly, refusing only what it cannot read faithfully (parse failure, a parser warning, which includes a duplicate identifier, preservation, an unknown element, attribute or extension, a dangling reference) with a `source.*`, `parser.*` or `reader.*` code. Every semantic refusal belongs to `Kernel.Admission`: admission decides whether the program lies inside the admitted surface, and is a separate step from reading. Generated code is never the authoritative representation of a model; both kernels execute this data.

Lessons that still bind the representation ([lessons][il-lessons]): identifiers and variants stay domain-typed in Lean and explicitly discriminated on the wire; the kernel's evaluators replace per-variant evaluators rather than delegating to them; and malformed structure, unsupported source, admission refusal, rejected input, semantic failure and harness failure stay distinct result classes, no `unknown` value standing in for an invalid program.

## Encoding

The wire form is Lean's derived JSON encoding of the IL types ([`Kernel/IL/Codec.lean`](../../Kernel/IL/Codec.lean)); the TypeScript kernel's [codec](../../packages/kernel/src/il/codec.ts) reproduces both its encoding and its acceptance, and a round-trip fixture per schema variant keeps them equal (guard 11).

- A structure is an object keyed by field name. Encoders write every field; a decoder reads an absent field as `null`, so an absent `Option` field is `none` and any other absent field is a decoding error.
- A nullary constructor is a string (`"parallel"`, `"none"`); a constructor with arguments is `{"<constructor>": {"<argument>": …}}`, each argument present even when it is an `Option`.
- `ElementId` and `FlowId` are plain strings.
- A data `Value` uses the scenario contract's `variableValue` form `{"kind": …, "value": …}` with kinds `null`, `boolean`, `integer`, `decimal` (`coefficient` as a decimal string, `scale` a natural), `string`, `stringList`, `list` and `map` (entries `{name, value}` in order). `Value` is the one nested inductive: kernel logic never recurses through a business value.
- Two limits are JavaScript's: the TypeScript decoder refuses integers outside the safe range and cannot tell `1` from `1.0`.
- The reviewed artifact-admission rule is strict: a duplicate decoded key, an unpaired surrogate, an unknown or missing field and unconsumed input are refused ([strict JSON][lcd-json]). Both decoders follow it: the Lean decoder re-encodes what it read and refuses any difference (`Kernel.IL.Codec.strictly`), the TypeScript decoder parses strictly (`parseStrict`).

## Program

| Field | Content |
|---|---|
| `identity` | `processId`, `sourceSha256` of the exact bytes, `profile` (an identifier the kernel never reads) |
| `options` | the profile's `ProfileOptions` ([below](#profile-options)) |
| `elements` | the flat element table, every element and boundary of the root and called processes |
| `flows` | Sequence Flows: `id`, `source`, `target`, optional `condition` expression |
| `variables` | the item names the root process declares (Properties, Data Objects, its own Data Inputs and Outputs; a Data Object reference declares none), declared at the instance root before any value is bound (BPMN 2.0.2 §10.4.1) |
| `processes` | the called processes the program carries: bound `definition` (`DefinitionRef`), process-level `children`, declared `variables`, `executable` |
| `executable` | the root process's `isExecutable` (Table 10.1), absent read as `false` |

The table is flat and identifier-keyed: a Scope names its children and a flow its endpoints by identifier, and no IL or state type is a nested or mutual inductive. A parentless element belongs to the root process unless a called process lists it. `Header.id` is unique in the program, so two versions of one called definition coexist; `origin.sourceId` is the identifier the model's author wrote, which publication shows.

### Elements

Every element is `{"<kind>": {"header": …, "payload": …}}`; the header is `id`, `origin` (`definition`, `sourceId`), `sourceType` (the BPMN element type, which semantic publication shows) and `parent`. No constructor carries positional fields beyond header and payload (guard 9).

| Kind | Payload |
|---|---|
| `activity` | `work` and the shared `envelope` |
| `scope` | `kind` (`embedded`, `transaction {method}`, `eventSubProcess {start, interrupting}`), `children`, `localVariables`, `items` (the Properties and Data Objects it declares; a Data Object reference declares none, it names its Data Object's item), `envelope` |
| `event` | `role` (`catch {subscription}`, `throw {record}`, `linkCatch {name}`, `linkThrow {name}`), `placement` (`intermediate`, `finish`), `incoming`, `outgoing`, `alternativeThrows` (a Multiple throw's records after the first) |
| `gateway` | `kind` (`exclusive {candidates, default}`, `parallel`, `inclusive {candidates, default}`, `eventBased {instantiation}` with `none`, `exclusive` or `parallel`), `incoming`, `outgoing`; candidates keep document order, a flow's condition lives on the flow, and an Event-Based Gateway's arms are the targets of its outgoing flows |
| `start` | optional `subscription`, `outgoing`; root or Event Sub-Process placement follows from the parent |

The shared activity envelope, on Activity and Scope alike: `incoming` and `outgoing` (implicit merge and split), input and output `Mapping`s, `boundaries` (each `id`, `subscription`, `interrupting`, `outgoing`), optional `multiInstance`, the `compensationHandlers` its Associations name (admission admits one, `compensation.handlerCount`), the `forCompensation` mark (BPMN `isForCompensation`), optional `defaultFlow`, and the transaction-boundary marks `asyncBefore` and `asyncAfter`, which on a Multi-Instance Activity mark its body.

`MultiInstance` is `mode`, `count` (`collection` or `cardinality` expression), `elementVariable`, `completionCondition`, `inputDataItem`, `outputDataItem` and `outputCollection`, read through the Data Associations; the loop characteristics' own transaction-boundary marks `asyncBefore` and `asyncAfter`, which mark each instance (CIB-EXT-0027); and the literal `loopDataInputRef` and `inputDataItemName`, which `multiInstanceBinding` may select instead (CIB-INT-0014).

`Work` is one of `none`, `manual`, `user` (name, assignee, candidate users and groups, form key and fields, due and follow-up dates, priority), `receive` (a Message trigger, `instantiate`, the `dataOutputs` of its `ioSpecification`, each a `DataOutputDecl` of `id` and `itemRef`, and the count of its `outputSets`), `service` (protocol, operation), `send` (binding, recipient, correlation, Message and Operation references), `script` (format, source, result variable), `rule` (decision, result variable, binding, result mapping), `call` (called element, binding, tenant, business key, input and output mappings, propagate-all flags).

### Subscriptions and throws

A `Subscription` is a trigger plus output mappings, the triggers of a Multiple Event's later definitions (`alternatives`) and its `parallelMultiple` mark. Triggers: `timer` (`duration`, `date` or `cycle` with dialect `iso8601` or `cron`, each a `ValueSource`), `message` (`messageRef : Option String` addresses the Message and is `none` for an unspecified one; `name : Option ValueSource` is the description or, under a profile that addresses by name, the CIB address; correlation criteria `{key, value}`, `interfaceRef`, `operationRef`, and `itemRef`, the Message's ItemDefinition), `signal` (name), `condition` (expression, variable name, variable events), `error` (code or catch-all, code and message variables), `escalation` (code or catch-all, code variable), `compensation`, `cancel`.

A throw record is `none`, `message` (optional binding, payload mappings), `signal` (name, payload, `propagateAll`, `localOnly`, business key, `asynchronous`), `error` (code, optional message), `escalation` (code), `compensation` (optional `activity`, `waitForCompletion`), `cancel` or the Terminate End Event's record.

A Multi-Instance wrapper is `mode` (`sequential`, `parallel`), `count` (`collection` or `cardinality` expression), element variable, completion condition, input and output data items and output collection. When a sequential wrapper reads its collection is the profile's `multiInstanceCollection`.

### Expressions and mappings

An `Expression` is `literal {value}`, `simpleBoolean {body}`, `variable {name}` or `foreign {language, source}`. The kernel evaluates the first three, the [Simple Boolean subset](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) being `literal`, `isPresent`, `isNull` and `stringEquals`; `foreign` carries any other language's text for the evaluator a later profile selects, and admission refuses it today. A `ValueSource` is a `literal` string or an `expression`. A `Mapping` is `target := source` with a `dialect` (`dataAssociation`, `ioParameter`, `callVariable`) that settles what an unavailable source means; [data](semantics/DATA-SEMANTICS-SPEC.md) owns that meaning.

### Profile options

One enumerated field per decision point the kernel branches on, each defaulting to the standards reading; `relations` lists the profile's register identifiers as provenance. The kernel never compares a profile identifier (guard 7). The semantics documents own each option's meaning and the register entry that selects the non-default value.

| Field | Values (default first) |
|---|---|
| `evaluator` | `simpleBoolean`, `juel` |
| `submission` | `outputSet`, `installsVariables` |
| `scopeChainSubmissionBytes` | `null` or a byte limit |
| `undeclaredWrite` | `refused`, `atInstanceRoot` |
| `errorPathOutputs` | `none`, `mapped` |
| `technicalFailure` | `hostFailure`, `incident` |
| `incidentProcessCancellation` | `false`, `true` |
| `continuationFailure` | `rolledBack`, `incident` |
| `conditionOrder` | `afterOutputs`, `beforeOutputs` |
| `messageCorrelation` | `modeledKey`, `apiCriteria` |
| `deliveryVariables` | `mappedOnly`, `installs` |
| `multiInstanceFinalBody` | `conditionEveryCompletion`, `modeSpecific` |
| `multiInstanceOutputs` | `aggregates`, `none` |
| `compensationOrder` | `dependency`, `allAtOnce` |
| `compensationHandlerFailure` | `failsInstance`, `selected {code}`, `propagatesFromTrigger` |
| `implicitCompensation` | `refused`, `everySubProcess` |
| `errorExitCompensation` | `drops`, `compensatesContained` |
| `multiInstanceCompensation` | `perSubProcessInstance`, `perInstance` |
| `transactionMethods` | `compensateOnly`, `compatibilityAsCompensate` |
| `compensationReferenceScope` | `visible`, `eventSubProcessParent` |
| `abnormalScopeEnd` | `withoutOutflow`, `completesNormally` |
| `unhandledError` | `failsInstance`, `endsThrowingPath` |
| `errorCatchVariables` | `refused`, `eventScope` |
| `callBindingTime` | `programAssembly`, `invocation` |
| `timerZone` | `null` or a zone name |
| `multiInstanceBinding` | `dataAssociations`, `loopReferences` |
| `effectResultValues` | `outputSet`, `activityLocals` |
| `outputContext` | `submission`, `activityScope` |
| `multiInstanceCollection` | `entrySnapshot`, `sequentialReread` |

## Inputs

The kernel step takes one input per call ([`Kernel/State/Input.lean`](../../Kernel/State/Input.lean)), decoded from the scenario contract by [`Kernel/IL/Codec/Stimulus.lean`](../../Kernel/IL/Codec/Stimulus.lean): `start` (instance id, start Event, variables, trigger, business key), `command` (occurrence identity and one of `completeUserTask`, `retryIncident` and `cancelIncidentProcess` (each with the expected incident generation), `setVariables`, `removeVariables`), `deliver` (occurrence identity, Message channel or Signal name, correlation, payload), `timerFire` (occurrence identity, logical time) and `effectResult` (occurrence identity, success with outputs, business failure with code, message and outputs, or technical failure). Every input carries an optional logical time `atMs`; logical time is an input, never a wall clock. An occurrence identity is process instance, element and activation. A Message channel is `operationMessage`, `directMessage` or `unspecifiedMessage`.

## Refusal by field

The IL carries the full shape of every row now; admission widens per track. A field outside the admitted surface is refused by `Kernel.Admission` with a stable refusal code, never left out of the type ([forward-compatible restrictions](../../CLAUDE.md#forward-compatible-restrictions)), so admitting it later widens the surface without reinterpreting any accepted program. Three guards hold the rule: every IL field is read by a non-codec declaration or refused with a code (guard 19); every runtime `unsupported` code has a matching admission refusal for the same shape or is marked dynamic-only at its site (guard 20); and every coverage row has a traceability entry and a decoding fixture (guard 21, [row traceability](ROW-TRACEABILITY-MAP.md)). [Admission](semantics/ADMISSION-SEMANTICS-SPEC.md) lists the codes.

## Superseded representation

The old Semantic Process IL lowered admitted BPMN to mechanism operations over control places, with per-profile operation multisets, cardinalities and well-formedness ([program][il-program], [well-formedness][il-wf], [supported slice][il-slice], [excluded surface][il-excluded]). The owner direction of 2026-11-08 replaced it with the element table above, because one constructor per variant matched closed-world across every layer was the dominant cause of the slowdown ([proposal](ARCHITECTURE-SPEC.md#why-delivery-slowed)). What carries over:

- Structural validity belongs to the reader: a duplicate identifier is refused as `parser.warning` (moddle reports it as a parser error), a dangling reference as `source.reference`, malformed containment as `source.containmentCardinality`. Admission rules per field take the place of the old per-profile operation, control-place and topology cardinalities, and the coverage target takes the place of the supported slice and excluded surface.
- The old graph policies (reachability of every operation from initiation, co-reachability to completion, whole-graph acyclicity except a declared resumption cut) have no counterpart in the kernel: it admits cycles and unreachable elements, and a dangling reference that reaches the kernel fails at run time as a semantic failure.
- The old operational semantics ([operational semantics][il-ops]) are restated per construct in the semantics documents:

| Old construct | Owner |
|---|---|
| Initiation by none, Message and Timer start | [subscriptions](semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) |
| User Task wait, Activity data-input and output User Tasks | [work](semantics/WORK-SEMANTICS-SPEC.md), [data](semantics/DATA-SEMANTICS-SPEC.md) |
| Sequential Multi-Instance User Task | [multi-instance](semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md) |
| Relative timer wait, Message subscription wait, event race arming and winner | [subscriptions](semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md), [flow](semantics/FLOW-SEMANTICS-SPEC.md) |
| Interrupting Message Event Sub-Process | [scopes](semantics/SCOPES-SEMANTICS-SPEC.md) |
| External effect wait, data mapping and typed business error | [work](semantics/WORK-SEMANTICS-SPEC.md), [propagation](semantics/PROPAGATION-SEMANTICS-SPEC.md) |
| Parallel duplication and synchronization, Exclusive merge, conditional choice, Inclusive selection and synchronization | [flow](semantics/FLOW-SEMANTICS-SPEC.md) |
| Definition-scope entry and completion | [scopes](semantics/SCOPES-SEMANTICS-SPEC.md) |
| Compensation Event Sub-Process parent snapshots | [compensation](semantics/COMPENSATION-SEMANTICS-SPEC.md) |
| Called-Process invocation and return | [work](semantics/WORK-SEMANTICS-SPEC.md) |
| Error throw and direct-parent interruption | [propagation](semantics/PROPAGATION-SEMANTICS-SPEC.md) |
| Internal scheduling | [publication and observation](semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md) |

## Sources

[il-decision]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-PROCESS-IL-SPEC.md#decision
[il-lessons]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-PROCESS-IL-SPEC.md#lessons-applied-from-the-rejected-a12-core-il
[il-program]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-PROCESS-IL-SPEC.md#semantic-process-program
[il-ops]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-PROCESS-IL-SPEC.md#operational-semantics
[il-wf]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-PROCESS-IL-SPEC.md#well-formedness
[il-slice]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-PROCESS-IL-SPEC.md#supported-slice
[il-excluded]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/SEMANTIC-PROCESS-IL-SPEC.md#excluded-surface
[lcd-json]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/LEAN-COMMENT-DISCIPLINE-PROPOSAL.md#strict-json-and-artifact-admission
