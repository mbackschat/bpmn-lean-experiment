# BPM platform structured Human Work proposal

## Status

**Owner-approved on 2026-08-16 after context-cold proposal review; implementation has not started.** The owner selected a useful M6 middle ground with regular field types, flat arrays, multiple resolution actions, and action-dependent input. The owner additionally fixed two durable boundaries: form schemas, validation, and computations belong to Product 2 and are expected to grow toward JSON Schema-scale complexity or beyond through Zod; and Human Task execution semantics follow BPMN 2.0.2 rather than importing CIB Seven form behavior into Lean, the Semantic Process IL, the semantic core, or Temporal Workflow state. The review returned `approve-with-required-edits`; two bounded correction rounds closed every finding, as [the receipt](#independent-cold-review-receipt) records.

This proposal changes no implementation until its proposal review is approved. It deliberately reopens and supersedes only the bounded first-form exclusions in [the platform proposal](BPM-PLATFORM-PROPOSAL.md#task-interaction) and [the existing Human Work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md#required-optional-and-excluded-functionality); that specification remains authoritative for claim, release, exact completion transport, authorization, and Work audit. [PLAN.md](PLAN.md) owns sequencing, [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns the implemented boundary, [the Human Tasks and forms research](research/HUMAN-TASKS-AND-FORMS-RESEARCH.md) owns source-grounded findings, and [the diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns the current DI-only Product 2 BPMN parser exception that M6 must generalize explicitly rather than silently widening.

## Question and decision

How can M6 provide useful multi-field Human Tasks and several ways to complete them without turning BPMN execution semantics into a form engine?

M6 adds one immutable, definition-bound Human Task catalog owned and derived by Product 2 from the exact admitted BPMN source bytes retained by Definitions. The catalog is a non-semantic projection of one project rendering extension placed under BPMN's standard optional `UserTask.renderings` hook. Product 2 stores that catalog with the deployed definition version, validates a strict structured-form submission through a versioned Zod-backed contract, computes one canonical process-variable patch, and sends that patch through the existing content-bound completion command. Product 1 executes only the patch. It does not know the catalog, fields, labels, requiredness, actions, visibility, Zod, or form computations.

The retained `bpmn-2.0.2-bpmn-lean-structured-human-work-draft` profile adds only the generic process-value kinds needed by its process model: safe non-negative integers and ordered string lists. The identifier names both the BPMN baseline and the project extension rather than claiming that BPMN standardizes the value wire or the form. Those values remain ordinary atomic Process-variable values. The semantic core preserves list order and multiplicity but does not inspect members for form options, derive a resolution action, validate field relationships, or interpret a form schema. For Product 2 claim authorization, the profile reuses only the already classified literal candidate-group overlay `CIB-EXT-0011`; it does not select the CIB form relationship `CIB-EXT-0012`.

## Scope

Required functionality is one ordered structured form with Text, Boolean, Integer, Date, Single choice, and Multiple choice fields; literal defaults; bounded validation; two or more ordered resolution actions; action-dependent visibility and requiredness; a plain-text task description; static Product 2 worklist priority; exact definition binding; strict server-side Product 2 validation; canonical completion-patch computation; one retained real-world model; and complete Product 1 plus Product 2 journey evidence.

Optional functionality is presentation-only grouping, destructive-action styling from a closed intent, and a wider responsive layout that preserves the same accessible control order.

Excluded functionality is a visual form builder; separately deployed or remote forms; `latest` binding; arbitrary expressions or scripts; remote options; field-to-field computation; general nested JSON admission; decimal or date-time semantics; files; rich text; drafts; comments; attachments; multiple candidate identities; delegation; mutable priority; due and follow-up dates; timers or escalation; general Tasklist compatibility; and BPMN InputOutputSpecification, DataInput, DataOutput, InputSet, OutputSet, or Data Association execution. Those standard data mechanisms remain conforming but deferred and cannot be inferred from the existing direct Process-variable patch.

## Ownership boundary

```text
exact admitted BPMN source bytes retained by Definitions
    |
    +--> Product 1 checked graph --> Semantic Process IL --> semantic core --> Temporal
    |
    +--> Product 2 definition-source projection boundary
                     |                         |
              diagram projection      immutable HumanTaskCatalogV1
                                               |
                                       Product 2 definitions
                                                            |
                                                   Zod validation/computation
                                                            |
                                          canonical submittedValues patch
                                                            |
                                                existing completion command
```

Product 1 semantic compilation and Product 2 catalog projection independently consume the same digest-bound source bytes retained by Definitions after successful engine admission. The Semantic Process program is executable authority. The Human Task catalog is Product 2 definition metadata and has no semantic authority. Product 2 may join it to an open task only through the exact deployed definition version and the engine-published BPMN element ID. A semantic compilation can succeed even when no supported rendering catalog exists, as BPMN explicitly makes Rendering optional and does not require an implementation to support a declared rendering method. The Product 2 M6 deployment route may separately require a valid supported catalog before offering structured Human Work.

M6 replaces the DI-specific `platform/foundation/bpmn-presentation` package boundary with one cohesive Product 2 `bpmn-definition-projection` boundary. That boundary owns the repository's sole Product 2 private BPMN parser graph and exposes two closed, independently testable projections: diagram presentation and Human Task catalog. It must not expose a generic parsed model, raw moddle object, combined catch-all result, or semantic admission decision. A second parser package is excluded because two independently configured source graphs could disagree about element identity, extensions, or exact-source binding.

The catalog must never be embedded in the Semantic Process IL, checked semantic node, runtime state, Workflow input, Workflow Query, Event History, semantic stable-state observation, or completion command. A missing, mismatched, corrupt, or unknown catalog makes structured completion unavailable in Product 2 and does not change the engine task.

Direct Product 1 clients may continue to submit any value patch admitted by the selected semantic profile. They do not receive Product 2's structured-form guarantee. Product 2 is the authority for its form contract, while the semantic core remains the authority for occurrence identity, value-domain admission, atomic patch merge, continuation, and command outcome.

This creates one deliberate MVP limitation: “Abort writes `resolution = aborted`” is guaranteed by the Product 2 completion route, not by every possible engine client. A model that must enforce that mapping independently of its user interface needs standard BPMN DataOutput and Data Association semantics, or another separately reviewed process-level mapping contract. It must not solve that requirement by importing Zod or form actions into the semantic core.

## Public contracts

### Definition-bound Human Task catalog

The public wire is a strict JSON contract. Zod is its TypeScript decoder and validator, not its serialization authority. A future JSON Schema projection or a richer authoring format must lower into a new compatible or versioned catalog contract rather than expose Zod internals.

```ts
type HumanTaskCatalogV1 = Readonly<{
  schemaVersion: "bpmn-lean-human-task-catalog/v1";
  processId: string;
  semanticProfile: string;
  sourceSha256: string;
  tasks: readonly HumanTaskDefinitionV1[];
}>;

type HumanTaskDefinitionV1 = Readonly<{
  elementId: string;
  description: string;
  worklistPriority: number;
  form: StructuredFormDefinitionV1;
}>;
```

Every list is source-ordered, every identifier is non-empty and unique in its owning collection, every object rejects extra properties, text and collection lengths have explicit encoded-byte ceilings, and the complete canonical catalog has a deployment ceiling. `worklistPriority` is a Product 2 sorting hint from 0 through 100 and defaults to 50; it is not BPMN `taskPriority`, which remains a deferred User Task instance-management concept rather than a model `FormalExpression`. Each structured User Task requires exactly one BPMN Documentation element whose `textFormat` is absent or exactly `text/plain`, whose XML-decoded character data is nonempty and at most 4,096 UTF-8 bytes, and which contains no child element. `description` preserves that decoded character data exactly, including whitespace, without trimming, collapsing, or Unicode normalization.

Catalog bytes use the existing Product 2 canonical JSON primitive: exact UTF-8; object keys ordered by Unicode scalar value; arrays retained in contract order; the established minimal JSON escapes; safe integers rendered in decimal; and no leading, trailing, or insignificant whitespace. The canonical catalog serializer emits only those bytes, and the strict reader decodes the closed catalog then requires byte identity with a fresh serialization before persistence, retry comparison, or browser delivery.

Product 2 persists the catalog under the already durable `(processId, version, sourceSha256, semanticProfile)` definition identity. The catalog wire carries no Product 2 version number because Product 2 assigns and binds that version after accepted engine deployment and catalog projection. Retrieval rechecks the complete identity before rendering or accepting a form submission. Candidate-group authorization continues to use the engine-published open-task assignment metadata from `CIB-EXT-0011` and is not duplicated into the catalog.

The neutral metadata contract widens without changing the existing arm:

```ts
type UserTaskAssignment = Readonly<{
  candidates: readonly [{ kind: "group"; id: string }];
}>;

type ExistingM3FormMetadata = Readonly<{
  fields: readonly [{ key: string; type: "string" | "boolean" }];
}>;

type UserTaskMetadata =
  | Readonly<{ assignment: UserTaskAssignment }>
  | Readonly<{ assignment: UserTaskAssignment; form: ExistingM3FormMetadata }>;
```

Profile admission selects the exact arm. Existing M3 profiles still require assignment plus form, while M6 requires assignment only. An empty metadata object, form-only object, extra key, missing candidate, or multiple candidate remains invalid.

### Structured form definition

```ts
type StructuredFormDefinitionV1 = Readonly<{
  schemaVersion: "bpmn-lean-structured-form/v1";
  fields: readonly StructuredFieldV1[];
  actions: readonly ResolutionActionV1[];
  resolutionVariable: string;
}>;

type ResolutionActionV1 = Readonly<{
  id: string;
  label: string;
  intent: "primary" | "neutral" | "destructive";
  resolutionValue: string;
}>;

type StructuredFieldBase<Default> = Readonly<{
  key: string;
  label: string;
  helpText: string | null;
  defaultValue: Default | null;
  visibleForActions: "all" | readonly string[];
  requiredForActions: readonly string[];
}>;

type ChoiceOptionV1 = Readonly<{
  value: string;
  label: string;
}>;

type StructuredFieldV1 =
  | (StructuredFieldBase<string> & Readonly<{ kind: "text"; multiline: boolean; minLength: number; maxLength: number }>)
  | (StructuredFieldBase<boolean> & Readonly<{ kind: "boolean" }>)
  | (StructuredFieldBase<number> & Readonly<{ kind: "integer"; minimum: number; maximum: number }>)
  | (StructuredFieldBase<string> & Readonly<{ kind: "date" }>)
  | (StructuredFieldBase<string> & Readonly<{ kind: "singleChoice"; options: readonly ChoiceOptionV1[] }>)
  | (StructuredFieldBase<readonly string[]> & Readonly<{ kind: "multipleChoice"; options: readonly ChoiceOptionV1[]; maxItems: number }>);
```

`null` in `defaultValue` means no default; M6 does not need a default whose semantic value is null. `visibleForActions: "all"` means visible for every action; otherwise the array is nonempty. `requiredForActions` may be empty. All referenced action IDs must exist, required actions must be visible, field keys must differ from `resolutionVariable`, and action IDs, field keys, option values, and action `resolutionValue` values are unique in their owning collections. The selected M6 field kinds are:

| Kind | Product 2 input and process value | M6 validation |
|---|---|---|
| `text` | String or null | single-line or multiline, Unicode-scalar minimum and maximum |
| `boolean` | Boolean or null | explicit Boolean, never truthy coercion |
| `integer` | safe non-negative integer or null | inclusive minimum and maximum |
| `date` | String or null | exact `YYYY-MM-DD` calendar date, no clock or time zone |
| `singleChoice` | String or null | exact member of an ordered literal option set |
| `multipleChoice` | ordered unique String list or null | exact members, maximum items, canonical declaration order |

One catalog has at most 128 tasks, one form has 1 through 32 fields and 2 through 8 actions, one choice field has 1 through 64 options, and one form has at most 256 total options. A `multipleChoice.maxItems` is at most the lesser of its option count and 32; its default, compatible current value, and submission must satisfy the same membership, uniqueness, and item bound. Identifiers have at most 256 UTF-8 bytes, labels and help text at most 4,096 UTF-8 bytes, and the complete canonical catalog at most 524,288 UTF-8 bytes. Submitted text values have at most 8,192 UTF-8 bytes and the complete structured-completion request has a 32,768-byte decoded JSON ceiling. Field-specific minima and maxima must be internally consistent and cannot exceed these outer limits.

M6 allows only literal constraints and action-ID membership. A current compatible Process value wins over a literal default, a default applies only when the key is absent, and an incompatible current value makes that field and the complete form unavailable for completion without coercion. The JSON contract is intentionally shaped so later Zod schemas can add nested objects, discriminated unions, refinements, and pure transformations in a new version without adding those concepts to BPMN semantics. Richer form input may still compute a flat patch of already admitted process values. Persisting a nested value itself requires a separately reviewed generic process-value extension, but never a form schema in the core. Any later computation that performs I/O, reads ambient time, depends on actor-local state, or produces a nondeterministic result requires a separate Product 2 contract.

### Structured completion request

The existing `PUT /api/v1/work-task-completions/{actionId}` route retains `actionId` in the path. Its strict body becomes a closed union of the existing M3 `submittedValues` shape and this M6 shape:

```ts
type StructuredWorkCompletionRequestV1 = Readonly<{
  schemaVersion: "bpmn-lean-structured-work-completion/v1";
  taskId: PublicWorkTask["task"]["id"];
  expectedClaimGeneration: number;
  resolutionActionId: string;
  fields: Readonly<Record<string, unknown>>;
}>;
```

The byte-level JSON decoder rejects duplicate object keys before ordinary parsing. The route resolves the exact claimed occurrence and definition version, loads the matching catalog, and passes the body through the catalog-selected Zod schema.

Product 2 computes `submittedValues` as follows:

1. reject an unknown action, unknown or duplicate key, hidden submitted field, missing required visible field, wrong type, failed bound, invalid option, duplicate list member, or incompatible current value;
2. normalize each accepted multiple-choice list into catalog option declaration order, so permutations of the same selected set have one durable meaning;
3. emit one binding for every visible field, using tagged null for an optional blank rather than omission;
4. append exactly one String binding from `resolutionVariable` to the chosen action's fixed `resolutionValue` and reject any field key equal to that variable;
5. sort the resulting bindings by the existing canonical binding order and submit them through the existing content-bound completion command.

After field and action validation, Product 2 canonicalizes every tagged value, binding, complete patch, and public completion-request candidate before reservation. It rejects a value over 16,384 bytes, a binding over 20,480 bytes, a patch over 65,536 bytes, or a request candidate over 131,072 bytes as `formValidationFailed` with the complete-form issue `computedPatchTooLarge`. These Product 2 checks use the exact public tagged request and patch shapes with the Product 2 canonical JSON primitive; they neither compute nor replace Product 1's private content-bound command tuple. The failure is checked server-side before reservation and before any engine-gateway call, while Product 1 independently repeats its canonical tuple and host-envelope checks at its own trust boundary.

Form rejection is a Product 2 request-domain result before engine dispatch. It leaves claim state, task state, Process variables, semantic history, and Work audit unchanged. Product 2 must prove that its engine gateway was not called. Once Product 2 has sent the command, the existing committed, rejected, conflict, infrastructure-failure, exact-retry, reservation, and audit rules remain unchanged.

Existing retained-action precedence also remains unchanged. For an already known `actionId`, Product 2 first checks the bound actor, task, claim generation, retained catalog identity, and canonical structured request without requiring the task still to be open. A byte-equivalent request or a multiple-choice permutation that computes the same canonical patch recovers the retained result; a changed action, field value, task, generation, or catalog binding conflicts. Only an unseen action performs a fresh task read, current-value compatibility check, validation, canonicalization, reservation, and engine dispatch.

The public error is `formValidationFailed` with an ordered non-empty list of field or action issues. Each issue contains a stable code and either one field key, the action selector, or the complete form. It contains no Zod issue object, regex implementation, source XML, stack, host identity, or submitted secret value.

## BPMN 2.0.2 boundary

BPMN 2.0.2 Clause 10.3.4.1 and Table 10.13 define a User Task as human work managed by a task manager and give it an optional list of Rendering extension hooks. The standard deliberately leaves Rendering content undefined and states that a User Task can be deployed even when an implementation does not support its rendering methods. Clause 13.3.3 requires activation to distribute the User Task to its assigned person or group and completion after the work has been done. Potential Owner, actual owner, and the Table 10.14 `taskPriority` User Task instance attribute are standard Human Task concepts, but their complete identity, assignment, and instance-management semantics are not implemented by this proposal.

BPMN's Activity data account separately defines InputOutputSpecification, InputSet, OutputSet, DataInput, DataOutput, and Data Associations, and states that User Tasks have access to those data-aware elements. M6 does not reinterpret a form field as one of those standard elements and does not claim that the existing completion patch implements their lifecycle. [The BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md#reviewed-requirements) therefore keeps the standard Potential Owner and full data mechanisms unsupported. M6 targets the structural `BPMN-UTASK-RENDERING-01` requirement by admitting the Rendering hook while keeping its project-defined contents outside execution semantics.

CIB Seven forms are research input only. M6 neither widens `CIB-EXT-0012`, adds a new CIB form relationship, nor admits CIB `formData`, form-field validators, form references, buttons, or `camunda:priority` into the selected semantic profile. The new profile selects the independently classified `CIB-EXT-0011` literal candidate-group attribute only. The neutral passive `UserTaskMetadata` wire therefore becomes a closed union of the existing assignment-plus-form shape and a new assignment-only shape, without changing any existing artifact bytes. The old M3 CIB form-metadata profiles and their passive observations remain unchanged.

## Selected rules

### Catalog and form rules

- `SHW-BPMN-01`: User Task activation, exact-occurrence completion, and outgoing control retain the existing BPMN lifecycle account; a rendering or Product 2 validation result never becomes a semantic transition.
- `SHW-RENDER-01`: zero or more BPMN Rendering hooks remain legal semantic source; one exact project rendering kind may produce a catalog, while absent, unknown, or unsupported renderings do not change the executable checked graph or program.
- `SHW-ASSIGN-01`: the M6 profile admits exactly one nonempty literal candidate group through existing `CIB-EXT-0011`, publishes the neutral assignment-only metadata shape, and admits no CIB form metadata; authorization and claiming remain Product 2 policy.
- `SHW-CATALOG-01`: an accepted M6 Product 2 definition produces exactly one canonical catalog bound to its source digest, semantic profile, Process ID, and distinct User Task element IDs.
- `SHW-CATALOG-02`: Product 2 renders or validates only a catalog whose complete definition identity equals the selected deployed version; absence or mismatch fails closed without engine work.
- `SHW-FORM-01`: Product 2 owns strict form decoding, field validation, action validation, and completion-patch computation through the versioned JSON contract and its Zod implementation.
- `SHW-FORM-02`: action-dependent behavior is limited to equality with the submitted action ID; hidden fields reject when submitted and required visible fields reject when absent or null.
- `SHW-FORM-03`: list selections are sets at the UI boundary but become ordered unique string lists in catalog option order before command identity is computed.
- `SHW-ACTION-01`: one selected action contributes exactly one fixed String resolution binding to the same atomic completion patch; no action is a BPMN transition.
- `SHW-VALIDATE-01`: a Product 2 form rejection performs no semantic dispatch and changes no claim, task, Process, semantic-history, or Work-audit state.

### Generic semantic-data rules

The generic value wire adds exactly these two tagged alternatives to the existing Boolean, String, and null union:

```ts
type M6VariableValue =
  | Readonly<{ kind: "integer"; value: number }>
  | Readonly<{ kind: "stringList"; value: readonly string[] }>;
```

An `integer` decoder requires `Number.isSafeInteger(value)`, `value >= 0`, and rejection of negative zero. A `stringList` decoder requires a JSON array of well-formed Unicode-scalar strings, at most 32 members, at most 1,024 UTF-8 bytes per member, and at most 16,384 canonical UTF-8 bytes for the complete tagged value. These are generic transport and state bounds, not form option or uniqueness rules. One binding has a 20,480-byte canonical ceiling, one completion patch a 65,536-byte ceiling, and one content-bound command a 131,072-byte ceiling before Temporal dispatch.

- `SHW-DATA-01`: a safe integer is an ordinary immutable Process-variable value in the inclusive range `0` through `9007199254740991`; no coercion, decimal, infinity, NaN, negative value, or negative-zero representation is admitted.
- `SHW-DATA-02`: a string list is an ordinary immutable Process-variable value containing source-significant ordered, well-formed strings; generic semantic equality preserves order and multiplicity, including repeated members.
- `SHW-DATA-03`: the M6 profile admits safe integers and string lists only in User Task completion patches. Existing profiles, Process Start, effect results, mapping expressions, and condition evaluation remain closed to the new kinds.
- `SHW-DATA-04`: accepted bindings use the existing atomic create-or-replace merge and unrelated-binding preservation rules. Rejected wire, profile, or occurrence admission preserves the complete stable state.

Product 2's multiple-choice canonicalization is deliberately separate from `SHW-DATA-02`: semantic string lists are ordered multisets, `["a", "b"]` differs from `["b", "a"]`, and `["a", "a"]` preserves two members. Only a form definition can reject duplicate selections, treat a valid selection as a set, and select catalog order.

## Source admission and rendering projection

The semantic compiler generically admits and preserves bounded standard `bpmn:rendering` content as execution-neutral source. Product 1 does not branch on the project QName, validate the project element's attributes, children, or character-data shape, parse the JSON vocabulary, or emit a catalog. Generic XML well-formedness, parser-warning refusal outside the proved opaque Rendering boundary, and the existing complete-source size ceiling remain Product 1 responsibilities. Product 2 replaces the current DI-only presentation foundation with the single definition-source projection boundary selected above, which alone recognizes the exact project element `bpmnLean:structuredForm` under that Rendering element's inherited `bpmn:extensionElements` hook and validates its placement, absence of extension attributes or child elements, and character data. Its catalog entry point emits only a validated catalog plus closed provenance and never exports raw moddle objects. Unsupported Rendering content never changes the Product 1 checked graph or Semantic Process program.

The extension element contains one strict JSON document as character data and no child element or extension attribute. XML decoding happens first; the resulting text must be strict JSON with no duplicate keys and must decode to this closed source shape:

```ts
type StructuredHumanWorkSourceV1 = Readonly<{
  schemaVersion: "bpmn-lean-structured-human-work-source/v1";
  worklistPriority: number;
  form: StructuredFormDefinitionV1;
}>;
```

For example:

```xml
<bpmn:userTask id="ReviewException" name="Review exception" xmlns:bpmnLean="urn:bpmn-lean:bpmn:extensions:v1">
  <bpmn:documentation>Review the expense exception and choose a resolution.</bpmn:documentation>
  <bpmn:rendering id="ReviewExceptionRendering">
    <bpmn:extensionElements>
      <bpmnLean:structuredForm>{"schemaVersion":"bpmn-lean-structured-human-work-source/v1","worklistPriority":80,"form":{"schemaVersion":"bpmn-lean-structured-form/v1","fields":[{"key":"confirmed","label":"Confirm review","helpText":null,"defaultValue":null,"visibleForActions":"all","requiredForActions":["approve","abort"],"kind":"boolean"}],"actions":[{"id":"approve","label":"Approve","intent":"primary","resolutionValue":"approved"},{"id":"abort","label":"Abort","intent":"destructive","resolutionValue":"aborted"}],"resolutionVariable":"resolution"}}</bpmnLean:structuredForm>
    </bpmn:extensionElements>
  </bpmn:rendering>
</bpmn:userTask>
```

Leading and trailing JSON whitespace is accepted, then discarded by strict decoding and canonical projection. XML comments, processing instructions, mixed child content, multiple project form elements, and non-project Rendering content are either ignored as unsupported Rendering for ordinary engine execution or rejected by the M6 Product 2 catalog route, never reinterpreted as BPMN behavior.

The project namespace `urn:bpmn-lean:bpmn:extensions:v1` owns the complete M6 field, option, constraint, action, condition, help-text, and static Product 2 worklist-priority vocabulary. Standard BPMN Documentation supplies task description. The project extension must not add elements to the CIB namespace, impersonate standard DataInput or DataOutput semantics, or accept unknown descendant content. The Product 2 adapter's registered moddle descriptor and exact projection-key inventory remain boundaries for the catalog projector, not Product 1 semantic-node capabilities.

Catalog failure is reported separately from BPMN semantic admission. Product 1 may return an admitted definition whose exact source has no Product 2-supported rendering. Product 2's M6 deployment service runs catalog projection only after engine acceptance, requires exactly one valid structured Human Task catalog for its selected model, and can refuse the product deployment with typed Product 2 diagnostics without describing the BPMN Process as semantically unsupported.

## Retained model and user journeys

The project-owned `expense-exception-review` model is `None Start Event -> Review exception User Task -> Exclusive Gateway -> three distinct None End Events`. Its task catalog contains:

| Key | Kind | Purpose |
|---|---|---|
| `requestReference` | Text | required external reference |
| `expenseDate` | Date | required calendar date |
| `approvedAmount` | Integer | optional bounded amount |
| `costCenter` | Single choice | required static accounting choice |
| `riskFlags` | Multiple choice | bounded flat array |
| `notifySubmitter` | Boolean | explicit communication decision |
| `resolutionReason` | multiline Text | visible and required for Request changes and Abort |

The actions are Approve, Request changes, and Abort. They write `resolution = "approved"`, `"changes-requested"`, or `"aborted"`. Existing Simple Boolean String equality routes the first two values and uses the default path for Abort. The gateway does not inspect form structure.

Retained answer-free scenarios cover all three actions. Product 1 evidence proves generic value transport, atomic patching, routing, Worker replacement, exact retry, conflicting-payload refusal, history, and replay. Product 2 browser journeys prove deployment and catalog binding, priority ordering, claim, accessible controls, all field types, action-dependent reason input, client and server rejection, no engine call on invalid data, canonical list retry, changed-action conflict, terminal status, semantic history, and the exact Work audit chain.

The model enters the executable corpus as journey-backed and must cover every currently supported M6 field kind. A source mutation that swaps an action binding, a catalog mutation that changes an element ID or source digest, a hidden-field submission, a duplicate list member, an option-order permutation, an unsafe integer, and a same-command changed action are required separators.

## Lean and semantic-core assurance lane

Lean and the independent TypeScript semantic core own `SHW-DATA-01` through `SHW-DATA-04` plus the passive assignment shape in `SHW-ASSIGN-01`. They add safe-integer and string-list values, exact wire decoding, profile admission, equality, atomic replacement, old-profile refusal, state-preserving rejection, and exact preservation of the existing candidate-group projection without a form block. They add no new form, field, option, action, requiredness, visibility, Zod, description, priority, or catalog type.

The Lean lane is **proved** for the generic data increment and assignment-only metadata composition. Required theorems cover safe-integer bounds, string-list equality, order and multiplicity preservation, accepted atomic merge and unrelated-key preservation, old-profile and wrong-surface refusal, complete state preservation for invalid values, exact assignment preservation, and absence of a form block. The nearest checked non-law is that reordered semantic lists commute or compare equal; they do not.

No new semantic transition family is introduced. Existing User Task completion and internal Exclusive Gateway closure are reused unchanged.

## Temporal hosting and refinement preflight

Durable ingress remains the existing content-bound Workflow Update. The Workflow receives only the computed canonical `submittedValues` patch and never receives the form catalog or raw browser submission. Active User Task waits, occurrence identity, command-result recovery, conflicting-payload refusal, Worker replacement, terminal handling, publication, and replay remain the existing mechanisms.

Safe integers and string lists must survive Update encoding, Workflow state, Query results, receipts, canonical history export, replay, and duplicate comparison without host coercion or array mutation. Product 1 independently enforces the same value, binding, patch, and command ceilings before Temporal transport. Product 2's pre-reservation check does not replace that host-boundary admission.

The smallest refinement witness accepts one canonical mixed-type patch containing a repeated generic list member, replaces the Worker before completion, recovers an identical retry, rejects the same command ID with reordered semantic list data, and reaches the branch selected by the resolution String. A Product 2 witness separately proves that multiple-choice duplicates reject while UI permutations canonicalize before command identity and therefore recover the same result.

No Activity, Signal, Timer, Child Workflow, Search Attribute, cancellation mechanism, Workflow-side schema validator, external form fetch, or new Task Queue is required.

## Evidence matrix

| Claim | Required independent evidence |
|---|---|
| Catalog source and binding | exact-source positive fixture; canonical byte oracle; Documentation text-format, child-content, and whitespace separators; unknown key, duplicate ID, wrong digest, wrong element ID, unknown extension, and ordering mutations |
| BPMN and assignment boundary | exact standard User Task lifecycle regression; rendering-present versus rendering-absent executable-program equality; unsupported-rendering deployment control; exact `CIB-EXT-0011` assignment-only projection; CIB formData refusal; full data-family remains rejected rather than silently approximated |
| Generic values and merge | descriptive Lean theorems, independently authored TypeScript tests, strict schema/canonical-JSON mutations for negative, negative-zero, unsafe, reordered, repeated, and oversized values, and old-profile refusal |
| Product 2 validation and computation | Zod contract tests, independent server tests proving zero engine calls on rejection, action/list and every value/binding/patch/command ceiling mutation, and public-error privacy |
| Temporal refinement | exact mixed-value live Workflow witness, Worker replacement, duplicate and conflict recovery, history, replay, and payload ceilings |
| Product journey | 1280 and 1600 Chromium paths for all actions, dynamic reason input, keyboard behavior, validation focus, History, and Work audit |
| Corpus coverage | retained model registration, exact capability accounting, generated corpus map, and production-backed journey |

BPMN, Lean, TypeScript, Temporal, and Product 2 evidence have different denominators. A green form journey is not BPMN conformance evidence, CIB form behavior is not proof of project action semantics, and Zod validation is not a semantic-core theorem.

## Atomic implementation and owner impact

The repository is pre-release, so the new profile, value wire, catalog wire, deployed-definition contract, source projection, retained scenarios, and every producer and consumer change atomically. No durable old M6 history exists. Existing profiles, old M3 task metadata, and their retained evidence remain byte-identical.

Cross-language implementation must update or satisfy at least [the semantic value contract](../packages/semantic-core/src/contract.ts), [stimulus decoding](../packages/semantic-core/src/stimulus.ts), [profile value admission](../packages/semantic-core/src/semantic-profile-value-domain.ts), [passive User Task metadata](../packages/semantic-core/src/user-task-metadata.ts), [profile registration](../packages/semantic-core/src/semantic-profile-catalog.ts), [source compilation](../packages/bpmn-source/src/checked-process-compiler.ts), [source dispatch](../packages/bpmn-source/src/compilation-dispatch.ts), [the existing metadata projector](../packages/bpmn-source/src/user-task-metadata-source.ts), [Lean value-domain](../BpmnSemantics/SemanticProcess/ValueDomain.lean), [profile-admission](../BpmnSemantics/SemanticProcess/ProfileAdmission.lean), and [User Task metadata](../BpmnSemantics/SemanticProcess/UserTaskMetadata.lean) owners.

The wire change must update [scenario](../contracts/schemas/scenario.schema.json), [checked-process](../contracts/schemas/checked-process.schema.json), [Semantic Process](../contracts/schemas/semantic-process.schema.json), [semantic-profile](../contracts/schemas/semantic-profile.schema.json), [semantic-publication](../contracts/schemas/semantic-publication.schema.json), and, when selected by retained CIB evidence, [CIB evidence](../contracts/schemas/cibseven-evidence.schema.json) schemas; [Temporal canonical encoding](../packages/temporal-adapter/protocol/src/canonical-encoding.ts), [command identity](../packages/temporal-adapter/protocol/src/command-identity.ts), [effect transport](../packages/temporal-adapter/protocol/src/effect-transport.ts), [publication validation](../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts), [publication canonical JSON](../packages/temporal-adapter/protocol/src/semantic-publication-canonical-json.ts), and [task detail](../packages/temporal-adapter/protocol/src/user-task-detail.ts); [the published engine Work API](../packages/engine-api/src/process-work.ts), including its completion union and exhaustive clone; [CIB value policy](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValuePolicy.java) and [state projection](../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java); and every differential, publication, history, receipt, replay, and exhaustive-reader consumer reached by those contracts. Negative, negative-zero, unsafe-integer, reordered-list, repeated-list, list-overflow, value-overflow, binding-overflow, patch-overflow, and command-overflow mutations are required.

Product 2 implementation must update the current `platform/foundation/bpmn-presentation/` package and every inbound dependency during its atomic rename to `platform/foundation/bpmn-definition-projection/`, [the shared canonical JSON primitive](../platform/contracts/src/canonical-json.ts), [definition contracts](../platform/contracts/src/definitions.ts), [definition deployment](../platform/modules/definitions/src/definition-deployment-service.ts), [Work completion](../platform/modules/work/src/work-mutation-service.ts), [Work task contracts](../platform/contracts/src/work-tasks.ts), [Work task decoding](../platform/contracts/src/work-task-decoders.ts), [execution-publication value decoding](../platform/contracts/src/execution-publication-semantic-value-decoders.ts), [the task detail workspace](../platform/apps/web/src/work-task-detail-workspace.tsx), and the new catalog, canonical catalog, repository, form-computation, and UI owners. It must also update [the diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md), [architecture](ARCHITECTURE.md), [the canonical contributor boundary](../CLAUDE.md), [the platform proposal](BPM-PLATFORM-PROPOSAL.md), and [the Human Work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md).

Artifact and registry ownership includes [the contract artifact cases](../scripts/contract-artifact-cases.ts), [profiles](../profiles/README.md), [scenarios](../scenarios/README.md), [contracts](../contracts/README.md), the semantic-core, BPMN-source, differential, Temporal-adapter, [engine-api](../packages/engine-api/README.md), platform-contract, [engine-gateway](../platform/foundation/engine-gateway/README.md), Definitions, Work, web, corpus, and showcase purpose-named READMEs or source maps, [the executable corpus](../model-corpus/manifest.json), and the root test-script registrations in [package.json](../package.json).

New cohesive Product 2 owners are required for the catalog wire and decoder, the catalog entry point inside the renamed definition-projection package, catalog repository, structured-form Zod schema and completion computation, and structured-form UI. Do not grow [work-task-decoders.ts](../platform/contracts/src/work-task-decoders.ts), which is already 597/600 nonblank lines. [execution-publication-semantic-value-decoders.ts](../platform/contracts/src/execution-publication-semantic-value-decoders.ts) and [semantic-publication-validation.ts](../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts) are each 573/600 and require a cohesive value decoder or validator extraction before the new variants are added. [Lean ProfileAdmission](../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) is 538/600 and requires a profile-specific module if M6 would exceed its 62-line headroom. [work-mutation-service.ts](../platform/modules/work/src/work-mutation-service.ts) is 524/600, so form validation/computation belongs in a separately testable service rather than consuming its 76-line headroom. [stimulus.ts](../packages/semantic-core/src/stimulus.ts) is 450/600 and must extract value decoding first if the measured change would cross 600. [user-task-metadata-source.ts](../packages/bpmn-source/src/user-task-metadata-source.ts) is 425/600 and remains the old passive M3 owner; no catalog code may consume its 175-line headroom.

[The source-hygiene guard](../scripts/source-hygiene.test.ts), [documentation reviewability guard](../scripts/document-reviewability.test.ts), [independent-review policy](../scripts/independent-review-policy.test.ts), [semantic closure guard](../scripts/semantic-closure-documentation.test.ts), [platform boundary guard](../scripts/platform-product-boundary.test.ts), [Workflow semantic-authority guard](../scripts/workflow-occurrence-semantic-authority.test.ts), [contract schema coverage guard](../scripts/contract-schema-coverage.test.ts), [contract artifact guard](../scripts/contract-artifacts.test.ts), [artifact projection guard](../scripts/contract-artifact-projections.test.ts), [definition artifact guard](../scripts/contract-definition-artifacts.test.ts), [engine process-work guard](../packages/engine-api/test/process-work.test.ts), [engine-gateway process-work guard](../platform/foundation/engine-gateway/test/process-work-gateway.test.ts), [command-identity guard](../packages/temporal-adapter/testkit/test/command-identity.test.ts), [semantic-publication contract guard](../packages/temporal-adapter/protocol/test/semantic-publication-contract.test.ts), [corpus policy guard](../scripts/bpmn-corpus-policy.test.ts), and [Temporal package boundary guard](../scripts/temporal-package-boundary.test.ts) constrain the work. New focused catalog-canonical-byte and cross-ceiling tests must bind the Product 2 catalog and Product 1 command boundaries independently. Run `node scripts/what-binds.ts` again on every actual new or grown path because the owner set and measured headroom stop applying when those paths change.

The Zod dependency is Product 2-only. Implementation must pin it through pnpm, record its license and provenance under the existing dependency policy, and prevent imports from the semantic core, Product 1 BPMN source packages, Temporal Workflow bundle, and cross-language engine wire packages. Zod version selection is an implementation dependency decision, not part of this public contract.

## Epistemic boundary and reopen conditions

The nearest established claims are that the current engine already carries plural string/null/Boolean User Task completion patches atomically, Product 2 already owns claim and content-bound completion, BPMN defines User Task Rendering as an optional opaque hook, and the retained CIB engine offers useful but non-normative form precedents. The nearest unsupported claims are that Product 2 can derive and bind the proposed catalog without reconstructing a semantic fact, that richer values preserve every cross-language canonical contract, and that one Product 2 Zod computation produces byte-identical patches across browser retries and server replacement. Product 2-only action mapping is not a process-wide invariant and the UI-bypass counterexample is intentional M6 evidence, not a hidden gap.

The strongest common-mode risk is accidentally duplicating form rules across BPMN import, web controls, HTTP decoding, Work service, and the semantic core. One authoritative Product 2 Zod schema factory per catalog version, server-authoritative execution, generated or shared client-safe descriptions, and mutation tests at every boundary are required separators. Another risk is treating a display list as a semantic set; the catalog-order versus semantic-order non-law exists to expose it.

Reopen this proposal before adding nested objects or heterogeneous arrays to an admitted semantic value, arbitrary field-to-field or scripted computation, I/O during form computation, Workflow-side form validation, a mutable or remotely resolved catalog, `latest` binding, draft state, attachments, timers, multiple assignment identities, a new completion command family, form facts in semantic observations, standard DataInput/DataOutput execution, or a CIB form construct.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `d116ece` | `fork-turns-none` | `approve-with-required-edits` | `da96485` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The proposal stage used two correction rounds. The first corrected value-domain compatibility, jointly satisfiable ceilings, the Product 1 and Product 2 Rendering boundary, catalog canonicalization, BPMN Documentation projection, `taskPriority` classification, and the owner inventory. The second added the published engine Work API and its focused gateway guards to that inventory; the same reviewer approved the final target with no remaining finding.
