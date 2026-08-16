# Human Tasks, forms, and resolution actions research

## Status

**Research complete; the bounded M6 recommendation is implemented and closure-reviewed under the [structured Human Work specification](../BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md).** The owner requested a useful middle ground with regular field types, flat arrays, multiple ways to complete a task, and action-dependent input such as requiring a reason for Abort. This research records the source-grounded basis and remains non-authoritative; the specification owns the exact BPMN, source, wire, validation, compatibility, and evidence contracts.

## Question and conclusion

The current Human Work slice proves assignment, claim, release, one-field String or Boolean forms, content-bound completion, audit, and end-to-end execution. What is the next useful Human Task and form increment that resembles real work, exercises important engine and platform risk areas, and still fits an MVP?

M6 should deliver a bounded Product 2 structured-form and resolution contract, not a general form builder or a new BPMN form semantics. It should support ordered multi-field forms, ordinary scalar values plus a flat string array, named completion actions, action-dependent visibility and requiredness, server-side validation, task instructions, and static Product 2 worklist priority. A retained expense-exception review should prove Approve, Request changes, and Abort paths, including an Abort reason, exact retries, branching, history, and accessible UI.

M6 should deliberately defer arbitrary expressions, nested data, user-authored scripts, dynamic remote options, form design tooling, drafts, comments, attachments, due and follow-up dates, delegation, and a general external-form runtime. Those features are valuable, but each creates another authority, security, time, storage, or lifecycle boundary.

## Current project boundary

The implemented [User Task assignment and form metadata specification](../capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) admits exactly one candidate group and exactly one String or Boolean field. The neutral metadata arrays were deliberately chosen so later profiles can widen cardinality without replacing the representation.

The semantic command already carries an ordered `submittedValues` patch, and the core merges that patch atomically on a committed User Task completion. The current semantic value domain is only String, Boolean, and null. Product 2 narrows the otherwise plural command to exactly one field in `platform/contracts/src/work-tasks.ts`, `platform/contracts/src/work-task-decoders.ts`, `platform/modules/work/src/work-task-detail-service.ts`, `platform/modules/work/src/work-mutation-service.ts`, and `platform/apps/web/src/work-task-detail-workspace.tsx`.

This split is important. Multi-field submission does not require a new command family. Richer generic process values change the semantic value domain and require a reviewed profile, Lean lane, and Temporal refinement witness, but form schemas, resolution actions, conditional input, validation, and form computations are Product 2 concerns. They require a separately versioned platform contract and must not enter the Semantic Process IL, semantic core, or Temporal Workflow state. BPMN's own User Task lifecycle, optional opaque Rendering hook, human-resource roles, and Activity data mechanisms remain the normative boundary; a vendor form format cannot substitute for them.

## CIB Seven findings

The pristine source registered in [SOURCES.md](../SOURCES.md#cib-seven) was inspected at `5a45b47ea22688d774de97277c3ff7013f54fdd2`, alongside current CIB Seven 2.2 documentation. The source paths below are evidence locations in that external checkout, not project dependencies.

### Generated form metadata

CIB Seven generated forms already establish the useful minimum beyond this project's one-field slice:

- `engine/src/main/java/org/cibseven/bpm/engine/form/FormField.java` exposes a unique variable-binding key, human label, type and type name, current or default value, validation constraints, and additional presentation properties.
- `engine/src/main/java/org/cibseven/bpm/engine/impl/form/type/FormTypes.java` preserves declared enum-option order. The default engine configuration registers String, Long, Date, and Boolean types, while enum is constructed from its declared values.
- [CIB Seven User Task forms](https://docs.cibseven.org/manual/latest/user-guide/task-forms/) document multiple ordered fields; String, Long, Date, Boolean, and enum types; defaults; required, minimum and maximum length, numeric minimum and maximum, and readonly validation; and frontend plus backend enforcement.
- Form field IDs map submitted values to process-variable names. Forms do not by themselves restrict which extra variables callers can submit through the raw API, so this project must keep its stricter exact-field command admission rather than inherit that permissive boundary.

Generated form metadata is strong product-design precedent for labels, multiple scalar fields, static choices, defaults, and validation. It does not provide the requested flat arrays, a closed multiple-action contract, or action-dependent required fields, and it is not BPMN semantic authority.

### Separate modeled forms

CIB Seven recommends Camunda Forms for new projects because they are easier to create and more flexible than generated forms. Forms are separately authored JSON resources and can be bound by deployment, latest version, or exact version through a form reference. See [CIB Seven User Task forms](https://docs.cibseven.org/manual/latest/user-guide/task-forms/) and [CIB Seven form modeling](https://docs.cibseven.org/manual/2.2/webapps/modeler/user-guide/form-modeling/).

The current CIB form builder includes Text, Textarea, Number, Checkbox, Select, Date, Tag List, layout groups and columns, and buttons. It supports static or dynamic options, defaults, required and length or pattern validation, and conditional disabled or hidden state through FEEL expressions. Tag List is the clearest precedent for a multi-valued field.

This is useful product precedent, but adopting CIB form deployment, version binding, dynamic data, FEEL, and a visual builder would exceed a middle-ground MVP increment and would put a vendor form account on the wrong side of the architecture. M6 should use BPMN's standard optional Rendering hook with one project-owned Product 2 catalog format. Zod should implement strict decoding, validation, and pure completion-patch computation without becoming the public wire. A later referenced-form increment can resolve immutable form bytes into a new compatible or versioned Product 2 contract without changing BPMN task or completion meaning.

### Task metadata and Tasklist behavior

`engine/src/main/java/org/cibseven/bpm/engine/task/Task.java` exposes task name, description, priority from 0 to 100, owner, assignee, delegation state, created and updated times, due and follow-up dates, form key or form reference, tenant, comments, and attachments. Candidate users and groups are separate identity links.

The pinned Tasklist source renders due and follow-up dates, candidate groups, Claim and Unclaim, assignee changes, a form tab, task description, comments, diagram context, and history. These facts confirm that a useful Human Task is broader than its form, but they do not all belong in M6.

Task description and static Product 2 worklist priority are small, durable catalog facts with immediate list and detail value. The latter must not be presented as BPMN `taskPriority`, which remains a deferred User Task instance-management concept rather than a model `FormalExpression`. Due and follow-up dates are not equally small because their useful form includes activation-relative expressions, time-zone handling, overdue state, mutation, filtering, and clock semantics. Drafts, comments, attachments, delegation, and mutable assignment introduce new Product 2 persistence, authorization, audit, or content-storage boundaries.

## Current product comparison

The products converge on structured forms linked to User Tasks, server-side validation, assignment-aware task lists, and task context, but expose different amounts of generality.

| Product | Relevant current pattern | M6 consequence |
|---|---|---|
| CIB Seven | Multiple typed fields, labels, defaults, static enum options, backend validation, separate modeled forms, Tag List, conditional visibility, task description and priority | Reuse only product-design concepts; do not import the vendor form format or validator into BPMN semantics; defer general modeled-form deployment and FEEL |
| Camunda 8 | Form references with deployment or version binding, input and output mappings, due and follow-up dates, priority, and visually authored forms in Tasklist | Keep form identity and versioning in the later roadmap; do not couple M6 to `latest` binding or a general mapping language |
| Flowable Work | Referenced forms, required fields, Claim, Save versus Complete, multiple outcome buttons, due information, people, documents, and task context | Adopt multiple completion outcomes now; defer drafts, people, documents, and mutable due dates because they require independent durable contracts |

Sources: [Camunda 8 User Tasks](https://docs.camunda.io/docs/components/modeler/bpmn/user-tasks/), [Camunda 8 forms](https://docs.camunda.io/docs/components/modeler/forms/utilizing-forms/), [Camunda 8 Tasklist](https://docs.camunda.io/docs/components/tasklist/userguide/using-tasklist/), [Flowable User Task](https://documentation.flowable.com/latest/reactmodel/bpmn/reference/user-task), and [Flowable Work tasks](https://documentation.flowable.com/latest/user/work/work-tasks).

## Selected M6 boundary

### Form fields and values

M6 should support one ordered form containing one or more fields. Each field has a stable key, human label, optional help text, one closed field kind, and bounded validation. The Product 2 representation remains independent of React controls and CIB classes and is implemented by a strict Zod schema.

| Field kind | Computed process value | Required M6 behavior |
|---|---|---|
| Text | String or null | Single-line or multiline presentation; required and minimum or maximum Unicode-scalar length |
| Boolean | Boolean or null | Explicit true or false control; optional absence remains distinct from false |
| Integer | Safe non-negative integer or null | Canonical integer wire value with optional inclusive minimum and maximum; no negative, floating-point, or decimal semantics |
| Date | String or null | Exact ISO 8601 calendar date `YYYY-MM-DD`; validation only, with no time-zone or clock semantics |
| Single choice | String or null | One value from a statically declared, ordered value and label set |
| Multiple choice | Ordered unique String array or null | Zero or more values from a statically declared set, with declared maximum items and encoded-byte limits |

This is the middle ground for “regular data types, even arrays.” M6 adds one generic non-negative safe-integer process value and one flat homogeneous string-list process value, not form-aware semantic types. The generic list preserves order and multiplicity; only the Product 2 multiple-choice validator rejects duplicates and canonicalizes selected options. Nested arrays, objects, binary values, decimals, date-times, and heterogeneous lists remain excluded from the M6 profile. Later Zod contracts may become substantially richer, including JSON Schema-scale structures, while the semantic layer continues to see only the canonical process-variable values the platform computes.

Defaults and current values should be projected by exact key. A current compatible process value wins over a static default; a default applies only when the value is absent. Incompatible current values make the task detail unavailable for completion rather than silently coercing data.

### Resolution actions and conditional input

Every M6 form declares two or more ordered named completion actions. Each action has a stable ID, human label, presentation intent from a closed neutral set, and one fixed String binding written into a designated resolution variable. For example, `approve` writes `resolution = "approved"`, while `abort` writes `resolution = "aborted"`.

Selecting an action and submitting field values is one content-bound, atomic User Task completion. The action's fixed resolution binding participates in the same canonical submitted patch, so exact retries and conflicting-payload refusal reuse the current command mechanism. An action is not a new BPMN transition or a separate mutable task state.

That fixed binding is a Product 2 guarantee in M6, not a guarantee for every direct engine client. If a future model requires the mapping independently of its UI, it belongs in a separately reviewed bounded BPMN DataOutput and Data Association account. Moving the form schema or Zod validator into the semantic core would solve the wrong problem.

M6 supports only action-equality conditions. A field may be visible for a declared set of action IDs and may become required for a declared set of action IDs. This directly covers “Abort requires a reason” without introducing FEEL, JavaScript, arbitrary field-to-field expressions, remote validation, or hidden side effects.

The Product 2 server must reject, before engine dispatch, unknown actions, duplicate or extra keys, missing required visible fields, submitted hidden fields, wrong types, invalid options, duplicate array items, and failed bounds. Its Zod-backed computation adds the fixed resolution binding and emits one canonical completion patch. The engine remains authoritative only for generic value-domain admission, occurrence identity, atomic patch merge, and command outcomes; it does not validate a form or infer an action.

### Human Task context

M6 should add task instructions as a plain-text description and a static Product 2 `worklistPriority` from 0 through 100, defaulting to 50. Description appears in task detail. Worklist priority appears in the inbox and supports deterministic priority-then-existing-order sorting plus an exact filter. It is a catalog presentation and ordering fact, not BPMN `taskPriority` execution.

M6 retains the existing one-candidate-group assignment and claim model by composing the already classified `CIB-EXT-0011` literal candidate-group extension independently of the old CIB form block. The neutral passive metadata contract needs an assignment-only arm so the new profile does not carry a dummy CIB form. Multiple candidate users or groups, standard Potential Owner, direct assignee, delegation, mutable priority, due or follow-up dates, and escalation are deferred. This keeps the milestone focused on data capture and resolution while avoiding a second identity and lifecycle expansion.

### Source and packaging boundary

M6 should not widen the existing CIB-compatible `formData` projection. Product 1 should admit and preserve BPMN's standard optional Rendering hook as execution-neutral source without understanding the project form vocabulary. Product 2 should atomically generalize its current DI-only BPMN presentation foundation into one definition-source projection boundary that owns the sole private Product 2 parser graph and projects both DI presentation and one exact project-owned rendering element from Definitions' exact admitted source. That rendering element may contain scalar and multiple-choice fields, resolution actions, action conditions, help text, and static Product 2 worklist priority in the project's namespace and must not invent elements in the BPMN or CIB namespace. A second parser package or exported generic parsed model is excluded.

Product 2 should derive and persist a separate immutable, source-bound Human Task catalog after successful engine admission. The catalog never reaches Product 1, Lean, the Semantic Process IL, the semantic core, or Temporal Workflow code. Unknown fields, constraints, action rules, dynamic options, scripts, expressions, external form URLs, and form references block the M6 product catalog, not BPMN semantic admission. A semantically valid User Task with no supported rendering remains deployable outside the structured M6 product route, as BPMN requires.

No new CIB relationship is required for M6 forms. The M6 profile selects existing `CIB-EXT-0011` only for its literal candidate group and explicitly does not select `CIB-EXT-0012`. Existing CIB form evidence remains recorded research inspiration, the old one-field CIB profile remains unchanged, and the new catalog, arrays, action conditions, Zod validation, and presentation are project behavior. Standard BPMN InputOutputSpecification, DataInput, DataOutput, InputSet, OutputSet, and Data Associations remain conforming but deferred rather than being approximated by the form catalog.

## Retained real-world model and journey

The recommended retained model is an expense-exception review with one claimed Human Task followed by an Exclusive Gateway:

- task name and instructions explain the exception and expected decision;
- static Product 2 worklist priority is high enough to be visible in the inbox ordering;
- `requestReference` is required single-line Text;
- `expenseDate` is a required Date;
- `approvedAmount` is an optional bounded integer;
- `costCenter` is a required Single choice;
- `riskFlags` is a bounded multiple choice;
- `notifySubmitter` is Boolean;
- `resolutionReason` is multiline Text;
- actions are Approve, Request changes, and Abort;
- Request changes and Abort require `resolutionReason`; Approve does not show it;
- the action writes one canonical `resolution` String, and the existing simple String-equality condition mechanism routes two explicit branches plus a default third branch.

The user journey deploys the model, starts it, finds and claims the task, reads its instructions and worklist priority, exercises client and server validation, completes each resolution action in a retained scenario, checks the intermediate or terminal Process status, and verifies semantic History plus the per-occurrence Work audit chain. A duplicate identical completion must recover its first result; a changed resolution action, array, or reason under the same command `actionId` must conflict; invalid submissions must leave the task and Process variables unchanged.

This model covers the high-risk classes the current corpus does not: generic value-domain widening, collection multiplicity and canonical order, multi-field atomicity, platform-owned conditional validation and computation, action-to-variable binding, string-based gateway routing, retry identity over structured payloads, and UI accessibility for dynamic fields and multiple submit buttons.

## Required, optional, and excluded M6 functionality

Required M6 functionality is the selected boundary above: multiple ordered fields, String, Boolean, non-negative safe integer, ISO-date String, static single choice, bounded String array, defaults and current values, bounded validation, named completion actions, action-dependent visibility and requiredness, description, static Product 2 worklist priority, exact atomic completion, the BPMN Rendering non-interference boundary, one real-world corpus model, and full Product 1 plus Product 2 user-journey evidence.

Optional M6 functionality is limited to presentation that does not widen the contract, such as field grouping, a neutral destructive-action intent used only for styling, and responsive two-column layout when the same accessible source order works at narrow widths. Optional work must not delay the semantic and validation evidence.

Excluded from M6 are a visual form builder; separately deployed or remote form resources; `latest` form binding; arbitrary JSON, objects, nested arrays, decimals, date-times, files, and rich text; dynamic or remote option sources; FEEL, JUEL, JavaScript, custom validators, or field-to-field expressions; draft saving; comments and attachments; multiple candidate identities; direct assignment, delegation, escalation, and subtasks; mutable task metadata; due and follow-up dates; SLA timers; input or output mapping languages; task listeners; and external application redirects.

## Roadmap after M6

The next form-specific increment should introduce immutable, content-addressed form artifacts with deployment or exact-version binding into the versioned Product 2 contract. Zod schemas may then grow toward nested structures, discriminated unions, richer pure refinements and transformations, and JSON Schema import or export without making the semantic core a form engine. A form editor, richer layout, dynamic local data binding, and schema migration belong there. `latest` binding, I/O during computation, and remote form execution require separate reproducibility and security decisions.

Drafts, comments, and attachments form a Product 2 collaboration and content-storage increment. Due, follow-up, escalation, and SLA behavior form a task-time and operations increment. Multiple candidates, direct assignment, delegation, and substitution form an identity-policy increment. Keeping these concerns separate prevents M6 from becoming an unreviewable general Tasklist clone.

## Proposal preconditions

The governed M6 proposal must resolve the exact generic value wire, canonical array order and duplicate rule, numeric bounds, BPMN Rendering and project-extension boundary, source-bound Human Task catalog, Zod ownership, action-to-resolution computation, validation outcome, explicit absence of a new CIB form relationship, Lean lane, Temporal payload and retry impact, Product 2 authorization boundary, corpus fixture, and user-journey matrix.

Because M6 changes the generic semantic value domain, Rendering source admission, the Product 2 BPMN parser boundary and derived definition artifact, and the Product 2 completion contract, it requires a context-cold proposal review and a semantic checkpoint review. Product 2 is deliberately the only form validator. Direct engine completion remains a generic profile-admitted patch API and makes no structured-form promise.
