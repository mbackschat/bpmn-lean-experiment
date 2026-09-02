# Compensation source and lowering proposal

## Status

Lifecycle: owner-approved
Review: approved-with-required-edits

## Prior review

The independently approved [boundary-handler retention proposal](COMPENSATION-BOUNDARY-HANDLER-RETENTION-PROPOSAL.md), [Event Sub-Process snapshot proposal](COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-PROPOSAL.md), and [trigger and handler proposal](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md) own the runtime meaning this capsule must preserve. Their source-admission exclusions are intentional. This companion proposal selects only the source, checked-graph, and lowering facts needed to construct their existing Program declarations without reopening eligibility, ordering, restoration, failure, cancellation, or hosting semantics.

The non-admitting reader at `4c5d6145` established parser-graph identity for the global throw, boundary handlers, Event Sub-Process handler, and direct subject dependencies. It deliberately selected no handler body, restored binding, checked representation, limits, profile, or capability. Those remaining choices are material and require this new cold proposal review.

Cold review of target `fb4ff27c` found that the proposed 16,384-byte execution limit could not contain its own 8,192-byte snapshot contract, the full Product 1 admission path was incomplete, and the source-type, Boolean, identity, and normative boundaries were not yet closed. Correction target `50d2525f` records the runtime-canonical 17,808-byte complete frontier and a 20,480-byte bound, closes those contracts, and requires the real no-start host witness. The same reviewer then found that its string-valued Process start would widen the checkpoint asymmetrically; correction target `140510d2` selects the existing empty domain in both semantic accounts and was approved with no remaining finding.

## Question and bounded outcome

What is the smallest standards-only BPMN source and checked representation that deterministically lowers one root-global synchronous Compensation throw, two boundary handlers, one Compensation Event Sub-Process handler, and one direct subject dependency into the already-approved retention, snapshot, and execution declarations?

This capsule selects one checkpoint-only source profile, `bpmn-2.0.2-compensation-source-checkpoint-draft`. It is intentionally outside the product profile registry. The source compiler and both semantic accounts may admit and compare its checked graph and Program, but Product 1 host admission must continue returning `compensationSchedulerUnavailable`; no scenario, capability, corpus row, CIB target, Product 2 surface, or live Workflow execution is added.

The existing requirement `BPMN-COMPENSATION-TRIGGER-HANDLER-01` remains `unsupported`. This checkpoint supplies source-to-Program correspondence evidence only and changes no runtime transition.

## Normative account and selected interpretation

BPMN 2.0.2 Clauses 10.7.2 and 13.5.5 define Compensation catch/throw use, global untargeted compensation, compensation handlers, and reverse dependency order. Table 10.87 makes Compensation Start `isInterrupting` inapplicable, Tables 10.91 and 10.92 make Compensation Boundary `cancelActivity` inapplicable, and Table 8.20 defines `associationDirection` only as Association arrowhead presentation. The official Travel Booking machine-readable example illustrates an explicit `isInterrupting="true"` Compensation Start; Table 10.87, rather than that example, settles that the attribute selects no Compensation interruption behavior.

The global Intermediate Throw Compensation Event has exactly one effective `CompensateEventDefinition`. `activityRef` is absent and effective `waitForCompletion` is true. Omission and lexical `true` normalize through the pinned parser to the same value; lexical `false` or `0` is outside this synchronous profile. The existing parser-preservation guard may still reject ambiguous Boolean lexical `1`; that is a generic import limitation, not Compensation meaning.

Each Compensation catch has exactly one effective `CompensateEventDefinition`, inline or resolved through `eventDefinitionRef`, with `activityRef` absent. The representations normalize to the same checked semantic fields, while their complete artifacts retain different exact source hashes. Effective definitions are distinct and no unused referenced Compensation definition is admitted. Catch-side `waitForCompletion`, Compensation Start `isInterrupting`, Compensation Boundary `cancelActivity`, and Association `associationDirection` neither classify nor lower. Their ordinary XML typing and the generic ambiguous-Boolean guard remain in force.

The exact handler effect is a project source-profile binding over the standard Service Task `implementation` attribute. The literal `urn:bpmn-lean:effect:compensation-single-effect-v1` lowers to the existing neutral descriptor `{ protocol: EffectProtocol.Activity, operation: EffectOperation.CompensationSingleEffect }`. This is not a CIB extension, Java class name, delegate expression, or claim that BPMN standardizes the URI.

## Required, optional, and excluded scope

**Required source:** one private executable Process with one root scalar `ItemDefinition`, one Process `Property`, and exact root control flow `None Start -> Parallel split -> (ReserveHotel -> ArrangeGroundTravel) || IssueInsurance -> Parallel join -> global Compensation throw -> None End`. The ItemDefinition has absent `structureRef`, effective `itemKind=Information`, and effective `isCollection=false`; the Property resolves to it by `itemSubjectRef` and has no `dataState`. `ArrangeGroundTravel` is one embedded Sub-Process whose normal body is `None Start -> User Task -> None End`. The direct `ReserveHotel -> ArrangeGroundTravel` Sequence Flow is the sole compensation dependency; `IssueInsurance` is independent.

**Boundary handlers:** `ReserveHotel` and `IssueInsurance` are ordinary User Tasks. Each owns exactly one Compensation Boundary Event and one Process-level Association from that Boundary Event to one external Service Task marked `isForCompensation=true`. Each handler Service Task has the exact implementation literal, no Sequence Flow, no data input, and no output.

**Event Sub-Process handler:** `ArrangeGroundTravel` contains exactly one Event Sub-Process with `triggeredByEvent=true`. Its body is `Compensation Start -> Service Task -> None End`; the Service Task carries the exact implementation literal. It has one required scalar `DataInput` with effective `isCollection=false` and no `dataState`, one `InputSet` whose required `dataInputRefs` contains exactly that input and whose `optionalInputRefs` and `whileExecutingInputRefs` are empty, one empty `OutputSet`, and one direct `DataInputAssociation` from the root Process Property to that DataInput. The Property and DataInput `itemSubjectRef` values resolve to the same ItemDefinition by parser-object identity. No Sub-Process-local Property, DataObject, DataObjectReference, or other binding is present, so the approved complete-parent-snapshot premise stays closed.

**Optional:** human-readable `name` values, BPMN DI, inline versus referenced effective Compensation definitions, omission or lexical `true`, `false`, or `0` for catch-side `waitForCompletion`, Compensation Start `isInterrupting`, and Compensation Boundary `cancelActivity`, and omission or `None`, `One`, or `Both` for Association `associationDirection`. Lexical `1` remains rejected by the generic parser-preservation guard even though it is schema-valid `xsd:boolean`; that import limitation selects no Compensation meaning. Optional material is preserved in exact source bytes or validated DI and never becomes semantic identity.

The profile reader consumes the private provenance result as the authority for attachment, containment, and dependency relationships. It may reacquire elements from those ids only after proving whole-document id uniqueness; it may not rediscover a relationship by text, names, document order, or a second partial graph walk.

**Excluded:** targeted or asynchronous throws; more than one throw; other subject counts or dependencies; implicit, recursive, or default compensation; Compensation End Events; Transactions or Cancel Events; Multi-Instance subjects; handler outputs, boundary-handler inputs, multiple effects, general handler graphs, expressions, assignments, transformations, local handler data, or other data associations; non-Service-Task handlers; CIB extensions; source overlays; profile registration; runtime commands; scenarios; live hosting; public capability; corpus; and Product 2 use.

These are profile restrictions, not the general meaning of Compensation. Arrays and distinct subject arms remain widenable by a later reviewed profile without changing a model admitted here. Targeted throws, additional dependencies, handler forms, and wider data mappings require new checked arms or profile rules rather than reinterpretation of this one.

## Checked graph contract

The checked node union gains a distinct `globalSynchronousCompensationThrowEvent` arm carrying only the source element id. It remains a normal flow node with one incoming and one outgoing Sequence Flow. Compensation Boundary Events, Associations, external handler Service Tasks, and the Event Sub-Process handler body do not become ordinary checked nodes because lowering them as active control-flow nodes would manufacture waits that BPMN never activates normally.

The checked Process gains one optional closed `compensation` declaration. Omission is physical for every existing profile. The conceptual contract is:

```ts
type CheckedCompensationInput =
  | Readonly<{ kind: "empty" }>
  | Readonly<{
      kind: "directRestoredProcessBinding";
      sourcePropertyId: string;
      targetDataInputId: string;
    }>;

type CheckedCompensationBody = Readonly<{
  kind: "singleEffect";
  handlerElementId: string;
  effectElementId: string;
  descriptor: CompensationSingleEffectDescriptor;
  input: CheckedCompensationInput;
}>;

type CheckedCompensationSubject =
  | Readonly<{
      kind: "boundaryActivity";
      subjectElementId: string;
      boundaryEventElementId: string;
      body: CheckedCompensationBody;
    }>
  | Readonly<{
      kind: "eventSubProcess";
      parentElementId: string;
      parentScopeId: string;
      handlerScopeId: string;
      body: CheckedCompensationBody;
    }>;

type CheckedCompensation = Readonly<{
  triggerElementId: string;
  subjects: CheckedCompensationSubject[];
  dependencies: ReadonlyArray<{
    predecessorElementId: string;
    successorElementId: string;
    reason: "sequenceFlow";
  }>;
  retentionLimits: Readonly<{ maxRecords: 2; maxCanonicalBytes: 4096 }>;
  snapshotLimits: Readonly<{ maxRecords: 1; maxCanonicalBytes: 8192 }>;
  executionLimits: Readonly<{
    maxTriggers: 1;
    maxHandlers: 3;
    maxCanonicalBytes: 20480;
  }>;
}>;
```

`handlerElementId` is the external compensating Service Task for a boundary subject and the Event Sub-Process id for the nested subject. For the boundary form, `effectElementId` equals `handlerElementId` and input is empty. For the Event Sub-Process form, `effectElementId` is its contained Service Task and input is the exact direct restored binding.

The checked graph contains three definition scopes: the root Process, the ordinary embedded `ArrangeGroundTravel` scope, and its dormant Compensation Event Sub-Process scope. The dormant scope has no ordinary checked nodes or Sequence Flows; the normalized executable body and retained semantic identities selected for it are owned by the checked Compensation subject. Checked admission derives this sole empty-scope exception from that exact subject and rejects any undeclared, active, multiply claimed, or nonempty dormant scope.

`triggerElementId` must identify the one global synchronous throw node, which prevents later cardinality widening from making the declaration-to-trigger join implicit. Subjects sort canonically by their source subject element id; dependencies sort by predecessor then successor id. The checkpoint profile requires exactly two boundary subjects, one Event Sub-Process subject, one dependency from the first boundary subject to the Event Sub-Process parent, and no other pairing. Element, boundary, handler, effect, Property, and DataInput ids are resolved source identities, never display names. Definition-scope ids are project-owned derivations: `parentScopeId` is `scope:<parentElementId>`, `handlerScopeId` is `scope:<handlerElementId>`, and the root definition scope is `scope:<processId>`.

The checked Compensation declaration retains the throw element; each subject Activity or Sub-Process; each boundary event; each handler and effect element; the restored Property and DataInput endpoints; dependency endpoints; derived root, parent, and handler definition scopes; and fixed limits. The ordinary checked graph separately retains admitted normal-flow node and Sequence Flow identities. Boundary Association ids, effective CompensateEventDefinition ids, the DataInputAssociation id, Compensation Start and handler None End ids, handler-body Sequence Flow ids, InputOutputSpecification/InputSet/OutputSet ids, and the ItemDefinition id remain exact-source evidence and are deliberately erased because the existing Program has no semantic field for them.

The fixed limits reserve room below the existing per-collection 65,536-byte ceiling and match the only reachable cardinalities. The runtime-owned canonical encoders measure one structurally valid 8,192-byte promoted snapshot at 16,600 execution bytes with its restored handler and wait; the complete reachable first frontier—Event Sub-Process handler and independent `IssueInsurance` handler compensating while `ReserveHotel` remains pending—at 17,808 bytes. The selected 20,480-byte execution limit therefore leaves 2,672 bytes above that coupled maximum witness without weakening the snapshot limit. Implementation evidence must use those runtime-owned encoders to measure the positive full fixture, the 8,192-byte snapshot coupled to that complete frontier, exact-boundary acceptance, and one-byte-over refusal for each collection, including restored-context and argument duplication. If the independently authored exact fixture or another admitted reachable state exceeds these values, this proposal reopens; the compiler may not silently raise them.

## Deterministic lowering

`COMPSRC-LOWER-01` lowers the checked throw node to the existing `triggerCompensation` operation. Its operation id and BPMN origin derive from the throw element; its input and output derive from the exact incoming and outgoing Sequence Flows; its `definitionScopeId` is the unique parentless scope whose origin is the Process id.

The same checked declaration deterministically produces all three existing Program declarations:

- the two boundary subjects become `compensationActivityRetention.targets`, preserving activity, boundary, and compensation Activity ids and using `retentionLimits`;
- the Event Sub-Process subject becomes the sole `compensationEventSubProcessSnapshots.target`, preserving parent and handler scope ids and using `snapshotLimits`;
- all three subjects, the direct dependency, the throw operation id, root scope id, bodies, and `executionLimits` become `compensationExecution`.

For the restored body, `sourcePropertyId` becomes the existing Program `sourceName` and `targetDataInputId` becomes `argumentName`. Those fields are runtime binding keys and intentionally carry resolved BPMN ids; XML display names have no authority. The closed erased-identity inventory above remains exact-source evidence because the Program has no corresponding fields; claiming checked-to-Program preservation for any of it would be false.

The lowering adds no new Semantic Operation, RuntimeState field, stimulus, result, interaction, observation, or effect-result arm. Lean definition binding independently validates the checked graph and Program, applies profile capability checks, lowers canonically, and requires complete equality. A TypeScript checkpoint binding validator separately compares the trigger, three declarations, subject bodies, restored endpoint ids, dependency endpoints, scopes, and fixed limits. Dropping, renaming, swapping, or reconstructing any retained identity must fail rather than produce a different valid Program.

## Stable rules and separating witnesses

| Rule | Proposition | Smallest separating witness |
|---|---|---|
| `COMPSRC-IDENTITY-01` | Every structural reference and data association is resolved by parser-object identity; names never select a subject, handler, edge, Property, or DataInput. | Duplicate every display name while ids and object references differ; output remains identity-correct, while a name-based mutation fails. |
| `COMPSRC-INAPPLICABLE-01` | Association direction, boundary cancellation, Compensation Start interruption, and catch-side completion flags do not change checked semantic fields within the generic import boundary. | Omission and lexical true/false or zero for each Boolean attribute, plus every Association direction, preserve semantic fields modulo exact source identity; lexical `1` is refused by the generic parser-preservation guard. |
| `COMPSRC-SHAPE-01` | Only the exact root flow, two boundary handlers, one nested handler, and one A-to-B dependency are admitted. | Add a second Association, normal handler Sequence Flow, handler subject, throw, or dependency; admission fails before lowering. |
| `COMPSRC-BODY-01` | Every handler is the exact single-effect descriptor; only the nested handler carries one direct restored Process binding. | Change the implementation literal, use a display name, reverse the association, add an output, or give a boundary handler input; admission fails. |
| `COMPSRC-CHECKED-01` | The optional checked declaration completely owns the trigger join, retained dormant-handler identities, normalized executable bodies, dependencies, and fixed limits. | Remove the declaration, trigger join, one scope, body id, binding endpoint, dependency endpoint, or limit; strict checked admission fails. |
| `COMPSRC-LOWER-01` | One admitted checked value lowers to the exact existing trigger operation and all three mutually consistent Compensation declarations. | Drop or swap one target/body/scope/edge in the Program; definition binding fails although each isolated id remains well formed. |
| `COMPSRC-ISOLATE-01` | The checkpoint identity is not product-registered and every resulting Program remains host-rejected. | Attempt Product 1 start or capability lookup; the exact refusal remains `compensationSchedulerUnavailable` and no Workflow starts. |

The nearest plausible common-mode error is a compiler and Lean checker that both retain handler ids but reconstruct attachment, dependency, or restored binding through equal display names. The duplicate-name witness, independent expected checked/Program artifacts, and mutation of every cross-artifact edge are mandatory because agreement alone would not expose that loss.

## Lean assurance lane

The Lean lane is **checked**, not a new runtime relation. Lean adds the exact checked contract and decoder, validates the checkpoint shape and dormant scope, lowers it independently, and proves or decides the expected checked-to-Program equality plus representative refusal mutations. Existing Compensation runtime relations, evaluators, soundness bridges, and laws are imported as unchanged authorities rather than copied.

No new `native_decide` exception is selected. The first build of any kernel-decided fixture remains root-owned under the repository memory wrapper. If an exact fixture cannot close within the existing resource ceiling, the lane records the precise open equality or decomposes the witness; it must not weaken admission or convert the claim into an unchecked example.

## CIB Seven relationship boundary

This is standards-only source correspondence. No CIB behavior, extension, probe, profile rule, or relationship identifier is selected. CIB implementation classes, ordering, persistence entities, timestamps, and handler invocation algorithms remain outside the source reader, checked graph, Lean account, and semantic core.

## Temporal hosting and refinement preflight

This capsule adds no durable ingress, wait, timer, Activity execution, cancellation action, Signal, Update, Query, public projection, host state, or replay branch. It changes only how an already-reviewed Program is constructed. The semantic state relation and every delivery, ordering, concurrency, deduplication, retry, cancellation, and replay obligation remain exactly those of the trigger and handler proposal.

The checkpoint Program contains `triggerCompensation`, but Product 1 reaches host capability only after `supportsSemanticProcessExecution`. The checkpoint identity therefore selects the existing acyclic graph policy and an empty Process-start value domain in both semantic accounts so the full admission path reaches the intended host refusal without adding data semantics. A focused negative witness supplies the newly lowered Program with `initialVariables: []` to `assessBpmnProcessAdmission` and to `startBpmnProcess` with a fake client, observes exactly `compensationSchedulerUnavailable`, and proves zero `client.start` calls and therefore no Workflow id, Run id, Event History, or adapter state. This is the smallest executable refinement witness for this stage.

Live compensation hosting remains the next separate stage. Its pre-schedule Continue-As-New fence, same-handler retry identity, in-flight Run boundary, concurrent frontier, cancellation drain, failure receipt, Worker replacement, and replay obligations cannot be inferred from source-to-Program equality.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| Normative and machine-readable source account | BPMN 2.0.2 Clauses 10.7.2 and 13.5.5, Association Table 8.20, Compensation Tables 10.87 and 10.91–10.92, official XSD/CMOF anchors, and the official Travel Booking example as syntax evidence only |
| Parser-graph identity | Private-reader tests for inline/reference forms, duplicate names, unresolved references, ambiguous roles, inapplicable attributes, and direct dependency direction |
| Exact source profile | Schema-valid positive fixture plus one-field source mutations for topology, cardinality, body, mapping, scope, Boolean, association, ItemDefinition structure/item kind/collection, Property and DataInput data state/collection, InputSet optional/while-executing membership, local-data, and unused-definition boundaries; omitted defaults and explicit selected equivalents produce equal semantic fields modulo exact source identity |
| Checked graph | Independent expected artifact, strict closed decoder in TypeScript and Lean, canonical order permutations, dormant-scope negatives, and old-profile physical omission |
| Lowering | Independently authored expected Program in TypeScript and Lean plus target, scope, body, binding, dependency, limit, and throw-flow mutations |
| Runtime preservation | Existing Program/runtime Compensation suites run unchanged; no new transition or public value is introduced |
| Host isolation | Acyclic graph-policy and cross-account empty Process-start value-domain witnesses using `initialVariables: []`, then `assessBpmnProcessAdmission` and fake-client `startBpmnProcess` over the lowered Program, with exact `compensationSchedulerUnavailable`, zero `client.start` calls, and no capability row |

## Runtime-only inventory and layer ownership

| Construct | Owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Checkpoint profile identity | Source and semantic profile admission only | None; absent from the product profile catalog | May compile exact evidence but cannot advertise or start |
| Checked Compensation declaration | Checked definition artifact | None | Immutable, exact-source-bound, and physically absent from old profiles |
| Dormant handler scope | Checked and Program definition scopes | None | Exists only when exactly owned by the Event Sub-Process subject and never enters normal control flow |

The BPMN source layer owns XML shape, parser-object identity, and the exact implementation-URI policy. The checked contract owns immutable admitted facts. Lean and TypeScript independently own strict validation and deterministic lowering. Existing semantic-core Compensation modules retain all runtime meaning. Temporal owns the refusal until a later reviewed host stage. Product 2 receives nothing.

## Versioning consequences

This is a pre-release additive checked-definition change. Existing checked and Program JSON bytes remain unchanged because the new top-level field is optional and omitted, while the new node arm is unreachable outside the checkpoint profile. Inline and referenced forms share semantic fields but retain distinct source identities and therefore distinct complete bytes. No durable Workflow history or public schema is widened because host admission remains closed.

The mechanically discovered guard set includes [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifact coverage](../../scripts/contract-definition-artifacts.test.ts), [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [pre-release architecture](../../scripts/pre-release-architecture.test.ts), [semantic admission composition](../../packages/semantic-core/test/admission-composition.test.ts), [profile value-domain coverage](../../packages/semantic-core/test/semantic-profile-value-domain.test.ts), [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), [Process start client](../../packages/temporal-adapter/client/test/process-client.test.ts), [test selection coverage](../../scripts/test-selection-coverage.test.ts), [semantic review packets](../../scripts/semantic-review-packet.test.ts), [documentation reviewability](../../scripts/document-reviewability.test.ts), and [normative reference resolution](../../scripts/normative-reference-resolution.test.ts). The new capsule path reports 48 guards and the [documentation registry](../README.md) plus this [capsule registry](README.md).

Existing source owners that must change or prove no change are [compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), [checked compiler](../../packages/bpmn-source/src/checked-process-compiler.ts), [graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), [profile admission](../../packages/bpmn-source/src/checked-process-admission.ts), [flow-element key projection](../../packages/bpmn-source/src/projected-flow-element-keys.ts), [preservation capability](../../packages/bpmn-source/src/preservation-capability.ts), [TypeScript lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), [checked contract](../../packages/semantic-core/src/checked-process-contract.ts), [checked profile shape](../../packages/semantic-core/src/checked-process-profile-shape.ts), [Program profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts), [graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts), [Process-start value domain](../../packages/semantic-core/src/semantic-profile-value-domain.ts), [profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts), [Lean contract](../../BpmnSemantics/SemanticProcessContract.lean), [Lean checked admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), [Lean graph validation](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean), [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean), [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean), [Lean definition binding](../../BpmnSemantics/SemanticProcess/DefinitionBindingValidation.lean), and [Lean checked JSON](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean).

### Owners this implementation grows

The 800-nonblank-line review target is the extraction threshold. These headroom figures are mechanically rechecked, and no size exception is requested.

| Owner | Current headroom | Structural condition |
|---|---:|---|
| [Lean ProfileAdmission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 3 | move the checkpoint predicate to a bounded sibling owner before adding the dispatch arm |
| [Lean SemanticProcessContract](../../BpmnSemantics/SemanticProcessContract.lean) | 54 | extract the checked Compensation support contract before adding references if the complete edit cannot remain below 800 |
| [TypeScript profile admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 147 | delegate the complete checkpoint shape to a new bounded owner; keep only dispatch here |
| [Lean Lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 153 | put Compensation construction in a bounded sibling module and add only canonical dispatch |
| [TypeScript lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 154 | put Compensation construction in a bounded sibling module and add only dispatch/field composition |
| [TypeScript compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) | 480 | dispatch to a new exact source compiler; no Compensation validation belongs here |
| [TypeScript checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts) | 440 | add one node arm and reference a bounded Compensation checked-contract owner |
| [TypeScript graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 444 | delegate only the declaration-derived dormant-scope exception |
| [Lean checked JSON](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 393 | decode the optional field through a bounded sibling decoder and preserve omission |
| [Lean checked admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 383 | delegate exact Compensation declaration validation; no lowering logic belongs here |

New bounded owners hold the Compensation checked contract, exact source compiler, TypeScript lowering, Lean decoder/admission/lowering, and focused evidence. Existing package indexes and module graphs receive exports/imports only. Same-change documentation owners are this capsule, [shared wire contracts](../../contracts/README.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), applicable detail maps routed by [`implementation-status-router`](../IMPLEMENTATION-MAP.md), package READMEs, the capsule cost ledger, and [PLAN](../PLAN.md).

## Epistemic closure and reopen conditions

Selected: exact normative source identities; inapplicable attribute handling; one checkpoint source shape; one standard Service Task implementation binding; one direct restored Process binding; the optional checked declaration and dormant scope; canonical lowering to the three existing declarations and trigger operation; fixed bounded limits; old-byte preservation; and exact host refusal.

Not selected: any new runtime meaning, CIB behavior, registered profile, scenario, differential target, live Temporal scheduling/refinement, public engine capability, whole model, corpus/disclosure, or Product 2 use.

Reopen before implementation if the checked declaration cannot widen without reinterpreting admitted models, the source cannot distinguish normal and dormant handler graphs by object identity, the restored Property cannot reach the handler DataInput without a general expression choice, the fixed limits cannot contain the positive fixture, or exact definition binding would require reconstructing any fact from a display name.

The nearest unsupported source claim is a targeted synchronous throw selecting one named Activity. The nearest unsupported end-to-end claim is live durable execution of the root-global throw across Continue-As-New and Worker replacement.

## Closure cost

At semantic-checkpoint completion, record the commit-bounded source, TypeScript checked/lowering, Lean decoder/lowering, host-refusal, documentation, and review costs in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md), compared with the Message key-correlation source/checked checkpoint because it changed the same source, checked, IL, and Lean definition-binding layers without registering a live profile.

## Stage boundary

After proposal approval, implementation stops at the first green semantic checkpoint where exact source bytes compile to the independently expected checked graph and Program in TypeScript, Lean accepts and independently lowers the same checked artifact, definition binding rejects every named mutation, old profiles remain byte-identical, and host admission returns `compensationSchedulerUnavailable` for the result.

That checkpoint requires independent cold review before profile registration, answer-free scenarios, live Temporal scheduling, Product 1 capability, whole-model corpus, Product 2 use, or closure work. A green checkpoint review authorizes the next cross-Workflow durability stage; it does not itself satisfy the Beta content row.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `fb4ff27cc14dd735ce7e59a74594269dbfbeeeaa` | `fork-turns-none` | `approve-with-required-edits` | `50d2525fd65926f3d72192301cab0046d02a5cbc, 140510d221764f2164a0c6da216241a7972a38f3` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
