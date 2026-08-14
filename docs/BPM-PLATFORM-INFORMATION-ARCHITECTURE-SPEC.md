# BPM platform information architecture specification

## Status

**Implemented, independently closure-reviewed, and maintained.** The platform shell, workspace flows, responsive evidence, and diagram presentation contract realize this information architecture. It changes no BPMN meaning, engine contract, or platform authorization rule and is classified non-material under the [independent cold-review negative case](TESTING-SPEC.md#independent-cold-review-gate).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `1f617ef` | `fork-turns-none` | `approve-with-required-edits` | `c3f6671` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `45c4bfc` | `fork-turns-none` | `approve-with-required-edits` | `83de531` |

The context-cold proposal reviewer completed two warm correction rounds and approved `c3f6671`. A separate context-cold closure reviewer required four bounded corrections at `45c4bfc`; one warm audit approved the correction target `83de531`.

## Owner motivation and product vision

M3 established the first coherent product shell rather than a collection of technically successful panels, and M4 extends that shell with incident operations. The owner wants to experience the product in a browser by selecting or deploying Process models, starting instances, finding tasks, completing typed forms, inspecting current incidents, and seeing the Process diagram that explains the current work.

The owner review identified four deciding failures in the initial composition: unrelated capabilities were stacked vertically; a narrow right panel made task forms and diagrams secondary; task rows broke at ordinary widths; and a definition without embedded BPMN DI produced no useful diagram. The selected direction therefore makes tasks, forms, definitions, diagrams, and instance inspection primary content surfaces, prohibits horizontally scrolling task rows, and supports both source-owned BPMN DI and digest-bound presentation sidecars.

CIB Seven is an important functional and layout reference, while Camunda 8 and other BPM and enterprise-work products provide additional evidence. They are inspiration, not a ceiling. The platform should preserve proven BPM patterns where they fit its published facts, improve responsive behavior and failure honesty where current products are weak, and never import another product's technology stack or unsupported data model.

## Purpose

The platform organizes work around a person's objective rather than around implementation packages or a vertical stack of unrelated panels. A user chooses one stable product workspace, operates its primary collection, and opens a detail view in the same content area.

The pattern-first [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) supplies the evidence base. CIB Seven provides proven functional precedents, especially the separation of Tasklist and Cockpit concerns, task selection followed by Form and Diagram views, and definition-oriented operational inspection. Camunda 8, Flowable, Bonita, IBM Business Automation Workflow, Appian, and ServiceNow provide additional evidence about work queues, detail surfaces, forms, saved views, instance navigation, and responsive limits. These are information-architecture references only. Their frontend implementations, visual styling, terminology, deployment topology, identity models, and technology stacks are not copied.

## Primary navigation

The persistent primary navigation contains these user-facing workspaces:

| Workspace | Primary objective | Initial collection | Detail surface |
|---|---|---|---|
| Work | Find, claim, and complete available human work | Current actor-visible tasks | Form, Diagram, and Details tabs for one exact task occurrence |
| Definitions | Inspect and operate deployed Process definitions | Existing definitions and versions | Diagram, Start, and Triggers tabs for one exact definition version |
| Operations | Find confirmed Process instances, inspect current incidents, and review platform action audit | Process instances, Incidents, and Audit tabs; Process instances is initially selected | Incident selection replaces its collection with full-width Overview, Diagram, and Audit tabs |

The navigation reflects durable product capabilities. It does not expose package names, milestone names, Product 1 versus Product 2 terminology, or test/evidence concepts.

## Workspace structure

Every workspace has one page title, one concise purpose statement, one primary collection or selected-object surface, and actions located with the object they affect. A feature panel must not repeat the page title using different terminology.

Collection and detail are mutually primary states of the same workspace:

```text
primary navigation
        |
        v
workspace collection ---- select exact item ----> workspace detail
        ^                                             |
        +---------------- back -----------------------+
```

The browser viewport belongs to the active workspace. A task form, definition diagram, or incident detail receives the full content width. A permanent right-side inspector is not used for these primary surfaces because it makes forms and diagrams secondary and fails at ordinary laptop widths.

## Work flow

The Work workspace opens on the actor-visible task collection. Selecting a task replaces the collection with the exact task detail. Form is the default tab because completing work is the user's primary objective. Diagram gives Process context, and Details exposes exact public identity and claim facts. Returning to the inbox preserves the workspace rather than navigating to another product area.

Task rows may use a table where the available container can display columns without truncating actions. When the actual content container is narrower, each row reflows into a labeled task card. Horizontal scrolling is prohibited for the M3 task collection. Task and Process names wrap safely, while task occurrence identity remains available in Details rather than consuming collection width.

Claim, release, completion, retry, and indeterminate delivery states stay adjacent to the selected task. A transport failure or indeterminate completion does not discard the exact retained operation or close the task detail.

## Definitions flow

The Definitions workspace begins with selectors for an existing definition and exact version. Adding BPMN is a secondary action in the same workspace, not a separate third-party deployment product area. Selecting a definition opens Diagram by default, with Start and Triggers as related tabs for that exact version.

Diagram resolution follows the [BPMN diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md): prefer usable BPMN DI embedded in the admitted source and otherwise use a digest-bound generated-DI sidecar. The UI labels generated layout honestly and never presents generated DI or the resolved presentation as admitted or executable source.

Definitions use one closed `GET /api/v1/definitions/{processId}/versions/{version}/presentation` result carrying exact public definition identity, source digest, presentation digest, UTF-8 presentation XML, and a closed `source` or `generated` provenance arm. A selected task may request that hosting definition only when its semantic `processInstanceId` equals the public hosting root instance. After import, the exact task `elementId` must exist in the rendered element registry before it is highlighted. A task in a called semantic instance, an absent element, an unsupported generator shape, or a presentation failure produces an honest unavailable Diagram state. The UI never guesses a called definition from element names, host state, or Temporal facts.

## Operations flow

Operations begins with React Aria tabs for Process instances, Incidents, and Audit. Process instances retains the existing confirmed-start search as a tab rather than a separate primary-navigation destination. Incidents is a responsive collection of exact current engine publications. Selecting an incident replaces that collection with full-width Overview, Diagram, and Audit tabs; the diagram highlights the exact published Service Task element, and Back restores focus to the originating row when it still exists or to the collection heading otherwise. The top-level Audit tab is a separate paged collection of platform action facts and never presents an audit row as proof that an incident remains current.

Collection rows are request and focus context, not current-detail authority. Incident controls appear only after the exact detail request succeeds. A pending, unavailable, absent, or stale detail request renders an honest non-actionable state, and switching tabs invalidates the request rather than promoting a late response.

## Responsive composition

At wide and ordinary desktop widths, primary navigation is a persistent left rail and the selected workspace occupies the remaining content area. At narrow widths, the navigation moves above the content and wraps without horizontal page scrolling. Feature components use container queries when their available width can differ materially from the viewport width because of the product shell. The task collection keeps one native table, row, and cell DOM at every width; responsive card labels are visible in narrow mode rather than synthesized only for assistive technology.

The required review widths are 1280 and 1600 CSS pixels. At each width:

- the page has no horizontal overflow;
- primary actions are fully visible;
- task and incident rows reflow before text or controls become cramped;
- forms, diagrams, and incident detail retain the content area rather than moving into a narrow inspector;
- headings are not duplicated merely to fill nested cards.

## Improvements over the reference pattern

The platform deliberately improves on the CIB Seven reference pattern where current web expectations or this product's contract make a better result possible:

1. One consistent shell replaces separate application chrome for task and operations work while retaining distinct workspace responsibilities.
2. Full-width task detail replaces a narrow split-pane form, giving typed forms and diagrams adequate working space.
3. Container-responsive task cards replace clipped columns or horizontal scrolling.
4. Exact retry and indeterminate states remain visible and actionable rather than being hidden behind generic request failure.
5. Source DI plus digest-bound sidecars make the presentation boundary explicit and allow metadata-only executable models to receive generated diagrams without changing admitted source.
6. React Aria interaction contracts provide consistent focus visibility, keyboard access, pending state, and accessible names across custom visual styling.
7. Camunda 8's clearer queue context, optional task description, priority and date ordering, and Process-context tab are retained as future-compatible information slots, but they appear only after the engine and public platform contract publish those facts.
8. Definition selection and exact version selection stay together, while Operations groups Process-instance search, current incidents, and platform action audit without importing unsupported intervention features.

## Required and excluded behavior

Required behavior is stable primary navigation, coherent collection-to-detail flows, Form/Diagram/Details task context, Diagram/Start/Triggers definition context, Process instances/Incidents/Audit operations context, responsive no-scroll collections, and exact current operation state.

Excluded behavior is a dashboard of unrelated panels, a permanent narrow task-form sidebar, route proliferation without a user objective, navigation by engine package, hidden horizontal task-table scrolling, or copying CIB Seven's implementation or visual theme.

## Acceptance

Static component tests lock navigation and collection-to-detail ownership. Real-host browser evidence exercises the M1 source-owned Collaboration DI lifecycle, generated DI in M2 and M3, accessible Definitions and Work navigation, exact task selection, claim, completion, and version operation. The real M4 showcase additionally locks Operations navigation, current incident discovery, response-loss Retry, Worker-replacement Cancel, exact diagram highlighting, incident and top-level audit, and Process-instance search through public platform routes. The deterministic Product 2 browser lane separately locks called-instance and missing-element task-diagram unavailability, source and generated provenance, Operations pending/failure/currentness, private-fact exclusion, focus, reduced motion, and desktop geometry at 1280 and 1600 pixels. Optional visual review uses the separate manually invoked lane owned by the [UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md#visual-review-protocol); semantic development and `verify.sh` never invoke it.

## Research and related owners

- [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) owns the product comparison and pattern evidence.
- [BPM platform UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md) owns visual language and responsive styling rules.
- [BPMN diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns embedded DI and digest-bound sidecar precedence and provenance.
- [Architecture](ARCHITECTURE.md#user-interface) owns packages and dependency direction.
