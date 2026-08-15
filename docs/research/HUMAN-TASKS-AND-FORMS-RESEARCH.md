# Human Tasks, forms, and resolution actions research

## Status

**Research complete; bounded M6 recommendation selected for proposal work.** The owner requested a useful middle ground with regular field types, flat arrays, multiple ways to complete a task, and action-dependent input such as requiring a reason for Abort. This research selects the smallest coherent M6 product boundary, but it is not semantic authority and does not authorize implementation before a governed proposal fixes the exact source, wire, validation, CIB-relationship, and evidence contracts.

## Question and conclusion

The current Human Work slice proves assignment, claim, release, one-field String or Boolean forms, content-bound completion, audit, and end-to-end execution. What is the next useful Human Task and form increment that resembles real work, exercises important engine and platform risk areas, and still fits an MVP?

M6 should deliver a bounded structured form and resolution contract, not a general form builder. It should support ordered multi-field forms, ordinary scalar values plus a flat string array, named completion actions, action-dependent visibility and requiredness, server-side validation, task instructions, and static priority. A retained expense-exception review should prove Approve, Request changes, and Abort paths, including an Abort reason, exact retries, branching, history, and accessible UI.

M6 should deliberately defer arbitrary expressions, nested data, user-authored scripts, dynamic remote options, form design tooling, drafts, comments, attachments, due and follow-up dates, delegation, and a general external-form runtime. Those features are valuable, but each creates another authority, security, time, storage, or lifecycle boundary.

## Current project boundary

The implemented [User Task assignment and form metadata specification](../capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) admits exactly one candidate group and exactly one String or Boolean field. The neutral metadata arrays were deliberately chosen so later profiles can widen cardinality without replacing the representation.

The semantic command already carries an ordered `submittedValues` patch, and the core merges that patch atomically on a committed User Task completion. The current semantic value domain is only String, Boolean, and null. Product 2 narrows the otherwise plural command to exactly one field in `platform/contracts/src/work-tasks.ts`, `platform/contracts/src/work-task-decoders.ts`, `platform/modules/work/src/work-task-detail-service.ts`, `platform/modules/work/src/work-mutation-service.ts`, and `platform/apps/web/src/work-task-detail-workspace.tsx`.

This split is important. Multi-field submission does not require a new command family, but richer value types, form validation, resolution actions, conditional input, and public task metadata are material semantic and public-observation changes. They require a new reviewed profile or profile extension, a Lean lane decision, a Temporal refinement witness, and consistent direct-runner and Product 2 behavior.

## CIB Seven findings

The pristine source registered in [SOURCES.md](../SOURCES.md#cib-seven) was inspected at `5a45b47ea22688d774de97277c3ff7013f54fdd2`, alongside current CIB Seven 2.2 documentation. The source paths below are evidence locations in that external checkout, not project dependencies.

### Generated form metadata

CIB Seven generated forms already establish the useful minimum beyond this project's one-field slice:

- `engine/src/main/java/org/cibseven/bpm/engine/form/FormField.java` exposes a unique variable-binding key, human label, type and type name, current or default value, validation constraints, and additional presentation properties.
- `engine/src/main/java/org/cibseven/bpm/engine/impl/form/type/FormTypes.java` preserves declared enum-option order. The default engine configuration registers String, Long, Date, and Boolean types, while enum is constructed from its declared values.
- [CIB Seven User Task forms](https://docs.cibseven.org/manual/latest/user-guide/task-forms/) document multiple ordered fields; String, Long, Date, Boolean, and enum types; defaults; required, minimum and maximum length, numeric minimum and maximum, and readonly validation; and frontend plus backend enforcement.
- Form field IDs map submitted values to process-variable names. Forms do not by themselves restrict which extra variables callers can submit through the raw API, so this project must keep its stricter exact-field command admission rather than inherit that permissive boundary.

Generated form metadata is a strong source-compatible base for labels, multiple scalar fields, static choices, defaults, and validation. It does not provide the requested flat arrays, a closed multiple-action contract, or action-dependent required fields.

### Separate modeled forms

CIB Seven recommends Camunda Forms for new projects because they are easier to create and more flexible than generated forms. Forms are separately authored JSON resources and can be bound by deployment, latest version, or exact version through a form reference. See [CIB Seven User Task forms](https://docs.cibseven.org/manual/latest/user-guide/task-forms/) and [CIB Seven form modeling](https://docs.cibseven.org/manual/2.2/webapps/modeler/user-guide/form-modeling/).

The current CIB form builder includes Text, Textarea, Number, Checkbox, Select, Date, Tag List, layout groups and columns, and buttons. It supports static or dynamic options, defaults, required and length or pattern validation, and conditional disabled or hidden state through FEEL expressions. Tag List is the clearest precedent for a multi-valued field.

This is the right long-term packaging direction, but adopting form deployment, version binding, dynamic data, FEEL, and a visual builder together would exceed a middle-ground MVP increment. M6 should keep its neutral runtime form contract source-independent and admit a bounded inline definition first. A later referenced-form increment can resolve immutable form bytes into the same neutral contract without changing task or completion meaning.

### Task metadata and Tasklist behavior

`engine/src/main/java/org/cibseven/bpm/engine/task/Task.java` exposes task name, description, priority from 0 to 100, owner, assignee, delegation state, created and updated times, due and follow-up dates, form key or form reference, tenant, comments, and attachments. Candidate users and groups are separate identity links.

The pinned Tasklist source renders due and follow-up dates, candidate groups, Claim and Unclaim, assignee changes, a form tab, task description, comments, diagram context, and history. These facts confirm that a useful Human Task is broader than its form, but they do not all belong in M6.

Task description and static priority are small, durable publication facts with immediate list and detail value. Due and follow-up dates are not equally small because their useful form includes activation-relative expressions, time-zone handling, overdue state, mutation, filtering, and clock semantics. Drafts, comments, attachments, delegation, and mutable assignment introduce new Product 2 persistence, authorization, audit, or content-storage boundaries.

## Current product comparison

The products converge on structured forms linked to User Tasks, server-side validation, assignment-aware task lists, and task context, but expose different amounts of generality.

| Product | Relevant current pattern | M6 consequence |
|---|---|---|
| CIB Seven | Multiple typed fields, labels, defaults, static enum options, backend validation, separate modeled forms, Tag List, conditional visibility, task description and priority | Reuse the bounded metadata concepts; keep exact submission stricter; defer general modeled-form deployment and FEEL |
| Camunda 8 | Form references with deployment or version binding, input and output mappings, due and follow-up dates, priority, and visually authored forms in Tasklist | Keep form identity and versioning in the later roadmap; do not couple M6 to `latest` binding or a general mapping language |
| Flowable Work | Referenced forms, required fields, Claim, Save versus Complete, multiple outcome buttons, due information, people, documents, and task context | Adopt multiple completion outcomes now; defer drafts, people, documents, and mutable due dates because they require independent durable contracts |

Sources: [Camunda 8 User Tasks](https://docs.camunda.io/docs/components/modeler/bpmn/user-tasks/), [Camunda 8 forms](https://docs.camunda.io/docs/components/modeler/forms/utilizing-forms/), [Camunda 8 Tasklist](https://docs.camunda.io/docs/components/tasklist/userguide/using-tasklist/), [Flowable User Task](https://documentation.flowable.com/latest/reactmodel/bpmn/reference/user-task), and [Flowable Work tasks](https://documentation.flowable.com/latest/user/work/work-tasks).

## Selected M6 boundary

### Form fields and values

M6 should support one ordered form containing one or more fields. Each field has a stable key, human label, optional help text, one closed field kind, and bounded validation. The neutral representation remains independent of React controls and CIB classes.

| Field kind | Submitted semantic value | Required M6 behavior |
|---|---|---|
| Text | String or null | Single-line or multiline presentation; required and minimum or maximum Unicode-scalar length |
| Boolean | Boolean or null | Explicit true or false control; optional absence remains distinct from false |
| Integer | Safe signed integer or null | Canonical integer wire value with optional inclusive minimum and maximum; no floating-point or decimal semantics |
| Date | String or null | Exact ISO 8601 calendar date `YYYY-MM-DD`; validation only, with no time-zone or clock semantics |
| Single choice | String or null | One value from a statically declared, ordered value and label set |
| Multiple choice | Ordered unique String array or null | Zero or more values from a statically declared set, with declared maximum items and encoded-byte limits |

This is the middle ground for “regular data types, even arrays.” M6 adds one integer kind and one flat homogeneous array kind, not arbitrary JSON. Nested arrays, objects, binary values, decimals, date-times, and heterogeneous lists remain excluded. The exact numeric and array representation must be selected before implementation so Lean, TypeScript, Java evidence, canonical JSON, audit redaction, and Temporal payload checks agree.

Defaults and current values should be projected by exact key. A current compatible process value wins over a static default; a default applies only when the value is absent. Incompatible current values make the task detail unavailable for completion rather than silently coercing data.

### Resolution actions and conditional input

Every M6 form declares two or more ordered named completion actions. Each action has a stable ID, human label, presentation intent from a closed neutral set, and one fixed String binding written into a designated resolution variable. For example, `approve` writes `resolution = "approved"`, while `abort` writes `resolution = "aborted"`.

Selecting an action and submitting field values is one content-bound, atomic User Task completion. The action's fixed resolution binding participates in the same canonical submitted patch, so exact retries and conflicting-payload refusal reuse the current command mechanism. An action is not a new BPMN transition or a separate mutable task state.

M6 supports only action-equality conditions. A field may be visible for a declared set of action IDs and may become required for a declared set of action IDs. This directly covers “Abort requires a reason” without introducing FEEL, JavaScript, arbitrary field-to-field expressions, remote validation, or hidden side effects.

The semantic admission boundary must reject, without state change, unknown actions, duplicate or extra keys, missing required visible fields, submitted hidden fields, wrong types, invalid options, duplicate array items, failed bounds, and a resolution binding that does not match the selected action. Product 2 may provide immediate client feedback, but the engine-side validator remains authoritative for the selected profile.

### Human Task context

M6 should add task instructions as a plain-text description and a static priority from 0 through 100, defaulting to 50. Description appears in task detail. Priority appears in the inbox and supports deterministic priority-then-existing-order sorting plus an exact filter.

M6 retains the existing one-candidate-group assignment and claim model. Multiple candidate users or groups, direct assignee, delegation, mutable priority, due or follow-up dates, and escalation are deferred. This keeps the milestone focused on data capture and resolution while avoiding a second identity and lifecycle expansion.

### Source and packaging boundary

M6 should widen the existing CIB-compatible `formData` projection for multiple scalar fields, labels, enum options, defaults, and the selected built-in validations. Project-owned extension syntax may add the flat multiple-choice field, resolution actions, action conditions, help text, and static priority, but it must use the project's namespace and must not invent elements in the CIB namespace.

The imported representation must lower into one project-owned neutral form contract before reaching Lean, the semantic core, Temporal Workflow code, or Product 2. Unknown fields, constraints, action rules, dynamic options, scripts, expressions, external form URLs, and form references remain admission-blocking for the M6 profile.

The CIB relationship record must distinguish three claims instead of calling the whole form CIB-compatible: CIB agreement or selected overlay for generated scalar fields and validators, project extension for arrays and action conditions, and Product 2 presentation for action buttons. A retained CIB probe should verify the shared scalar subset only.

## Retained real-world model and journey

The recommended retained model is an expense-exception review with one claimed Human Task followed by an Exclusive Gateway:

- task name and instructions explain the exception and expected decision;
- static priority is high enough to be visible in the inbox ordering;
- `approvedAmount` is an optional bounded integer;
- `riskFlags` is a bounded multiple choice;
- `notifySubmitter` is Boolean;
- `resolutionReason` is multiline Text;
- actions are Approve, Request changes, and Abort;
- Request changes and Abort require `resolutionReason`; Approve does not show it;
- the action writes one canonical `resolution` String, and the existing simple String-equality condition mechanism routes two explicit branches plus a default third branch.

The user journey deploys the model, starts it, finds and claims the task, reads its instructions and priority, exercises client and server validation, completes each resolution action in a retained scenario, checks the intermediate or terminal Process status, and verifies semantic History plus the per-occurrence Work audit chain. A duplicate identical completion must recover its first result; a changed resolution action, array, or reason under the same command `actionId` must conflict; invalid submissions must leave the task and Process variables unchanged.

This model covers the high-risk classes the current corpus does not: semantic value-domain widening, collection multiplicity and canonical order, multi-field atomicity, conditional validation, action-to-variable binding, string-based gateway routing, retry identity over structured payloads, and UI accessibility for dynamic fields and multiple submit buttons.

## Required, optional, and excluded M6 functionality

Required M6 functionality is the selected boundary above: multiple ordered fields, String, Boolean, safe integer, ISO-date String, static single choice, bounded String array, defaults and current values, bounded validation, named completion actions, action-dependent visibility and requiredness, description, static priority, exact atomic completion, retained CIB scalar evidence, one real-world corpus model, and full Product 1 plus Product 2 user-journey evidence.

Optional M6 functionality is limited to presentation that does not widen the contract, such as field grouping, a neutral destructive-action intent used only for styling, and responsive two-column layout when the same accessible source order works at narrow widths. Optional work must not delay the semantic and validation evidence.

Excluded from M6 are a visual form builder; separately deployed or remote form resources; `latest` form binding; arbitrary JSON, objects, nested arrays, decimals, date-times, files, and rich text; dynamic or remote option sources; FEEL, JUEL, JavaScript, custom validators, or field-to-field expressions; draft saving; comments and attachments; multiple candidate identities; direct assignment, delegation, escalation, and subtasks; mutable task metadata; due and follow-up dates; SLA timers; input or output mapping languages; task listeners; and external application redirects.

## Roadmap after M6

The next form-specific increment should introduce immutable, content-addressed form artifacts with deployment or exact-version binding into the same neutral runtime contract. That is the point to add a form editor, richer layout, dynamic local data binding, and schema migration. `latest` binding and remote form execution require separate reproducibility and security decisions.

Drafts, comments, and attachments form a Product 2 collaboration and content-storage increment. Due, follow-up, escalation, and SLA behavior form a task-time and operations increment. Multiple candidates, direct assignment, delegation, and substitution form an identity-policy increment. Keeping these concerns separate prevents M6 from becoming an unreviewable general Tasklist clone.

## Proposal preconditions

The governed M6 proposal must resolve the exact value wire, canonical array order and duplicate rule, numeric bounds, source extension namespace, action-to-resolution mapping, validation outcome, task-publication shape, CIB relationship IDs, Lean lane, Temporal payload and retry impact, Product 2 authorization boundary, corpus fixture, and user-journey matrix.

Because M6 changes the semantic value domain, User Task metadata, admission, command validation, public observation, and Product 2 completion contract, it requires a context-cold proposal review and a semantic checkpoint review. It must not be implemented as a Product 2-only validator while the direct engine accepts submissions that the UI calls invalid.
