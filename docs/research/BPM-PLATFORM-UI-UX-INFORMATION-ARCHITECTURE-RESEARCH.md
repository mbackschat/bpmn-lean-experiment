# BPM platform UI/UX and information-architecture research

## Status

**Current bounded research.** This document studies recurring UI/UX and information-architecture patterns in BPM task products, process operations tools, and adjacent enterprise workspaces. It is evidence for the project-specific [information architecture specification](../BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) and [UI design specification](../BPM-PLATFORM-UI-DESIGN-SPEC.md), not authority for BPMN meaning, product scope, or implementation technology.

## Research question

Which established interface patterns help a person find and perform BPM work, understand its Process context, and inspect definitions and instances without turning the platform into a stack of unrelated panels?

The question is pattern-first rather than vendor-first. Products are compared as evidence for recurring user objectives:

1. find work;
2. understand work context;
3. perform and complete work;
4. start a Process;
5. inspect a definition and its instances;
6. preserve orientation while moving between those objectives;
7. adapt the same interaction honestly across browser widths;
8. inspect and export operator actions without confusing platform audit with BPMN execution history.

## Project context and owner observations

M3 publishes a small but truthful human-work contract: actor-visible tasks, exact Process and task occurrence identity, one candidate group, claim and release, one typed string or Boolean field, retry-safe completion, and platform audit. It does not publish priority, due date, descriptions, comments, attachments, saved filters, or arbitrary form schemas. Research recommendations must not invent those facts.

M5 separately publishes committed semantic execution History and two durable Product 2 action-audit streams. Work records claim, release, and completion outcomes; Operate records incident Retry and Cancel outcomes. The two streams use separate repositories and insertion orders, so research recommendations must not turn their timestamps or private source ordinals into one semantic, causal, or total chronology.

The owner's live browser review found that the first M3 composition made the product harder to understand than its implementation deserved. Independent panels were stacked top to bottom, the task form was confined to a narrow right area, definition selection was separated from adding a definition, long task rows broke at ordinary widths, and metadata-only BPMN source produced no diagram. The owner wants a coherent browser product that can select or add a Process model, start it, show the resulting task, render its form, and explain it with a diagram.

## Method and limits

The study uses official product documentation and the screenshots embedded in that documentation. Current documentation is preferred. One CIB Seven `manual/1.0` page is retained explicitly as historical evidence for the older Form/History/Diagram/Description tab arrangement, while the current `2.2` Tasklist, configuration, and latest form documentation corroborate the durable task-list, focus-region, Process-start, claim, and form relationships. CIB Seven, Camunda 8, Flowable, Bonita, IBM Business Automation Workflow, Appian, ServiceNow, and ProcessMaker were inspected. Their documented functions are more reliable than visual details that may change between releases; no product is treated as a design authority.

For every material Product 2 UI/UX surface, this research is updated before production implementation. CIB Seven is inspected first when it has an analogous capability, using both current documentation and the pristine pinned source registered in [SOURCES.md](../SOURCES.md#cib-seven); another established product is consulted when it fills a gap or supplies an independent comparison. Each selected product contract records the observed precedent, adopted behavior, deliberate deviation, exclusion, and the project-owned fact that decides among them. Reference source remains research input and is never copied into the MIT product.

The products span different scopes. CIB Seven and Camunda 8 are direct BPM references. Flowable and Bonita combine process, case, task, and form work. IBM BAW and Appian emphasize enterprise work portals. ServiceNow provides a mature record-workspace pattern. ProcessMaker contributes role-oriented process participation. The comparison therefore separates transferable interaction patterns from product-specific data and permissions.

## Pattern 1: stable capability navigation

The durable primary choices recur as work/tasks, processes or definitions, and operational inspection. Camunda 8 Tasklist exposes Tasks and Processes as separate top-level pages. Flowable exposes Tasks, Work, and other application areas in persistent navigation. Bonita separates Process list, Case list, and Task list. ServiceNow workspaces expose list categories and record pages.

The transferable rule is to name navigation after a person's objective, not the engine's package structure. For this project the smallest stable set is Work, Definitions, and Operations. Process instances, Incidents, and Audit are secondary destinations inside Operations rather than competing primary destinations. Dashboard is not a primary objective and should not be a default landing page merely because many enterprise suites offer one.

### Version and capability disclosure preflight

The reviewer-facing version and capability surface was researched against CIB Seven `2.2.0` documentation and the pristine checkout at `5a45b47ea22688d774de97277c3ff7013f54fdd2`. Current CIB documentation keeps its element implementation account in the BPMN reference and separately lists the Modeler palette; the pinned web applications expose a system-settings destination and engine identity but no execution-capability matrix. The inspected owners were `webapps/frontend/ui/admin/client/scripts/pages/system.html`, `system.js`, `systemSettingsGeneral.html`, and `systemSettingsGeneral.js`. This absence matters: a modeling palette is not evidence that the engine executes every palette element, and a generic system page does not answer a reviewer's coverage question.

Camunda 8 provides the useful independent comparison. Its public BPMN coverage reference groups elements and distinguishes modeling support from execution support, while its version-aware modeling guidance can report that an element is unsupported for the selected engine version. The transferable pattern is an explicit, scannable compatibility matrix whose status is bound to a named product version. The project deliberately moves its smaller matrix into the running product because the current reviewer needs one place to see the exact implemented boundary and its restrictions.

| Decision boundary | Adopt | Deliberately change | Exclude | Acceptance oracle |
|---|---|---|---|---|
| Placement | A stable, directly reachable capability reference | Add one About utility destination to the existing shell instead of another operational workspace | Dashboard cards, hidden footer-only version text, or a developer-only route | Keyboard navigation reaches About and transfers focus to its page heading |
| Version | Name the running product version beside the capability account | Bind it to the web package version at build time and label the product pre-release | Runtime Git inspection, private host identifiers, dependency inventories, or release claims not owned by the package version | The rendered version equals the package version and is present in the production bundle |
| BPMN support | Group exact executable element variants in a table and distinguish bounded support from the standard as a whole | Show the project-owned restriction for every row and bind the complete row set to retained executable models | A modeling-palette claim, a combined support percentage, or any BPMN conformance claim beyond the requirement ledger | The corpus guard rejects a supported capability absent from all retained project models and rejects an unregistered model capability |
| CIB Seven relation | Keep compatibility evidence separate from standards support | Report exact selected-profile pipeline evidence or `not selected` per row against CIB Seven `2.2.0` | Treating CIB breadth, a related calibration, or Product 2 behavior as semantic agreement | Every exact-CIB row names a registered retained pipeline case with a selected CIB target |

The capability page is a read-only project-status surface. It consumes no engine runtime state and creates no new BPMN meaning. Its canonical row data belongs to the executable corpus contract so the retained models and the UI fail together when support changes. The human-readable [implementation map](../IMPLEMENTATION-MAP.md) remains the complete claim boundary, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) remains the BPMN disposition authority.

## Pattern 2: collection first, then substantial detail

Task products consistently begin with a queue or list and open one exact item into a detail surface. CIB Seven uses filters, results, and a task view. Camunda 8 uses a task queue and selected task details. Flowable describes an inbox plus a details panel with a header, navigation, and main area. Bonita documents both master/detail and a full-width expansion for large forms. ServiceNow list pages open records and allow only optional preview in a side panel.

The transferable rule is the list-to-detail relationship, not a permanent three-column desktop layout. A narrow inspector works for preview and short metadata, but a task form or process diagram is primary work. This project should let selection replace the collection with a full content detail and provide an explicit return to the list. A future desktop enhancement may show a wide master/detail layout only when both surfaces retain usable widths and the same interaction collapses cleanly.

## Pattern 3: form first, Process context adjacent

CIB Seven Tasklist makes Form the default task detail tab and offers History, Diagram, and Description as sibling context. Camunda 8 places the form in task detail and provides a Process tab with the diagram. Flowable uses a Task tab for the form and other tabs for people, subtasks, and documents. Bonita keeps case information one tab from the form. IBM BAW exposes Process details and related task context while a person works.

The recurring rule is that doing the work is primary, while Process context is one predictable navigation step away. This project should use Form, Diagram, and Details for a selected task. Form is the default. Diagram explains where the task sits. Details carries exact public identity, assignment, and completion state. Audit remains its own platform surface rather than being relabeled as BPMN history.

## Pattern 4: assignment is a gate, not the content

CIB Seven, Camunda 8, IBM BAW, Appian, Flowable, and Bonita all distinguish a pooled or candidate task from one accepted or claimed by a worker. They differ in terminology and authorization, but the interaction shape recurs: visibility, claim or accept, work, complete, and optionally release or unassign.

The project consequence is to keep Claim or Release near the selected task and to avoid making claim state a separate workspace. The form may be inspectable before claim only if the public authorization contract allows it. The current M3 contract deliberately exposes neither task detail nor the completion action before claim. Completion must remain unavailable to the wrong actor, and hidden tasks must not leak through navigation or error detail.

### CIB-grounded whole-model journey preflight

The first executable-corpus browser journey was researched against the pristine CIB Seven checkout at `5a45b47ea22688d774de97277c3ff7013f54fdd2`. The relevant Tasklist and Cockpit files are unchanged from the published `v2.2.0` tag at `834a9874760de8a0107f7c1b32806e37f17fb017`. The comparison used the [registered source](../SOURCES.md#cib-seven) and exact source paths, not screenshots or remembered behavior, and no CIB code, styling, assets, data model, or terminology was copied.

| Journey boundary | CIB precedent adopted | Deliberate project change | Excluded behavior | Acceptance oracle |
|---|---|---|---|---|
| Select and start | Explicit Process selection followed by an explicit Start action | Definitions owns exact admitted source and version selection before start | Tenant, deployment-ID, delete, and CIB runtime-definition controls | Deploy the exact corpus BPMN through Definitions, select exact version 1, and retain the public instance ID |
| Claim and work | A candidate task is visible before claim; claim precedes task work and completion | The task name, detail, Form, and Complete action are unavailable until `demo-user` claims it | Arbitrary assignment and CIB authorization internals | First prove the unclaimed false precondition, then claim the same task and open its Form, Diagram, and Details |
| Generated form | Field metadata and type determine the generated control | Boolean uses explicit True and False choices so absent input remains distinct from false | CIB generic-form breadth and checkbox semantics | Prove neither choice is initially selected, explicitly choose True, and complete the exact occurrence |
| Completion and inspection | Finished work leaves the current queue; Cockpit provides Process-instance inspection | Operations shows the completed current state and engine-published semantic History; Work audit remains a separate Product 2 public fact | CIB `HistoryService`, user-operation log, Temporal Event History, and state-difference reconstruction as semantic History | Verify no current task, completed Overview, contiguous public History, and exact claim/reserved/committed Work-audit events |

The retained production journey is [`corpus-user-task-journey.spec.ts`](../../showcase/m3-human-work/e2e/corpus-user-task-journey.spec.ts). It is also the separating evidence for the previously missed class in which a positive completion script did not first prove that an unclaimed task was non-actionable.

## Pattern 5: task context must survive uncertain delivery

Most surveyed documentation describes ordinary success and validation. It says less about response loss or indeterminate completion. M3's durable action contract is therefore an opportunity to improve on the references. A transport failure or indeterminate engine result must leave the selected task, form data, and exact retry action visible. The interface must not manufacture a new action identity or close the detail as though the outcome were known.

This is a project-specific BPM work pattern: preserve enough context for the person to understand whether they can retry, while rendering terminal rejection and Process closure honestly.

## Pattern 6: startable Processes belong beside, not inside, task filters

Camunda 8 gives startable Processes their own page. CIB Seven starts a Process from Tasklist but still presents a distinct model selection step. IBM BAW exposes launchable Processes beside work. Bonita separates the Process list from the Task list. This prevents the inbox from becoming a mixed catalog of work and models.

For this project Definitions owns existing models, exact versions, start actions, and future triggers. The workspace should offer a selector for definitions already in the durable catalog and an adjacent Add BPMN action. The current phrase Third-party deployment is implementation language and should not be the only path into the feature.

## Pattern 7: definition, diagram, instances, exact instance

Camunda 8 Operate moves from a deployed Process model to its instance table and then to exact instance history and variables. Flowable Control similarly opens a definition, lists its instances, and uses a diagram plus tabs for exact instance details. Bonita moves from cases to case details and a customizable overview.

The transferable operations pattern is model to instances to exact instance, with the diagram retaining orientation. This project keeps Definitions as the model workspace and places Process instances inside Operations because operational inspection now also owns Incidents and Audit. Selection and links preserve exact definition identity. The implemented instance detail uses Overview, Diagram, and engine-published History only where those public contracts exist; incident audit and Work audit remain distinct Product 2 facts.

## Pattern 8: filters and saved views are secondary navigation

CIB Seven uses task filters. Camunda 8 supports filters and ordering. Flowable distinguishes For me, Unassigned, Open, Completed, and All. IBM BAW provides searches and saved searches. Appian provides task views and administrator-defined task reports. ServiceNow makes default and personal filtered lists central to repeated work.

The transferable rule is to let repeated queries become stable secondary navigation once the contract has enough fields. M3 has only one actor-visible current-task snapshot, so speculative filter controls would be dishonest. The IA should reserve a filter region without implementing priority, due-date, status, or saved-view semantics before the server publishes them.

## Pattern 9: responsive adaptation needs a different detail posture

The surveyed products often document master/detail desktop layouts, but their responsive quality is uneven. Bonita explicitly offers a panel expansion for wide forms. IBM states that only its Work and Next Task dashboards are responsive across devices, which is strong negative evidence against assuming that a general enterprise dashboard will adapt automatically. ServiceNow treats preview as optional and lets the selected record open as its own page.

The project consequence is to preserve the information relationship while changing the composition. A task list may be a comparison table when wide, then reflow each row into a labeled card within its actual container. Horizontal task-row scrolling is prohibited. Task detail becomes the content view, not a squeezed side panel. The shell moves navigation above content at narrow widths.

## Pattern 10: diagrams are orientation surfaces

CIB Seven and Camunda 8 expose a task's Process diagram from task detail. Flowable shows Process diagrams in instance inspection and can enlarge them. Camunda 8 Operate places the model above its instance list. The recurring purpose is orientation: what this task belongs to, what has happened, and what may come next.

The pinned CIB Seven source and current 2.2 Cockpit documentation establish a more specific operations pattern. Its navigated bpmn-js viewer keeps pan, zoom, reset, collapsed-Subprocess drill-down, and called-Process navigation in the diagram; running activity-instance counts and incident counts are separate element badges; the activity-instance tree and detail tables can select an element and bring it into view; and the visible guide distinguishes a current task from a selected task. Running or current work uses blue or mint treatment, while incidents use red. CIB Seven does not present the traversed Sequence Flow route as the instance's semantic history.

The transferable visual rule is therefore to distinguish current execution, user selection, and failure instead of using one highlight for all three. This project uses its accent and soft-accent colors for exact current positions and reserves the error color for incidents or errors. It deliberately adds published Sequence Flow token positions alongside active waits because the engine exposes both as current committed facts. It does not paint live scope containers, infer an active route, or pretend that called-Process positions exist in the parent diagram; those remain listed explicitly when the selected presentation cannot show them. A compact guide makes that project-specific extension visible to the reader.

For this project, diagram availability cannot depend on whether the admitted executable source happened to contain BPMN DI. The [BPMN diagram presentation decision](../BPMN-DIAGRAM-PRESENTATION-DECISION.md) therefore preserves source-owned DI when present and otherwise permits a digest-bound generated sidecar that never becomes executable source. Generated provenance must remain visible.

## Pattern 11: flow-node metrics require occurrence facts, not transition counts

CIB Seven's runtime Process Definition diagram overlays two independent facts on BPMN elements: running activity-instance counts and incident counts. The overlay is optional, an element badge can filter the instance collection by exact activity ID, and a collapsed container aggregates child counts without pretending that the container itself executed. The pinned source implements this through the public activity-instance statistics result and bpmn-js overlays, not by counting persistence commands, PVM transitions, or diagram markers.

CIB Seven's historic account preserves the same unit. One `HistoricActivityInstance` represents one execution of one flow node and carries its own identifier, activity ID, parent activity-instance ID, start time, end time, duration, completion disposition, and cancellation disposition. Historic activity statistics group those stored rows by activity ID and keep running, finished, canceled, and complete-scope counts separate. The completed Process duration report selects only historic Process instances with an end time, groups them by their start period, and computes minimum, maximum, and average from the stored duration. The community Cockpit source contains the report-extension host and a conditional duration-report link, but not the duration-report provider itself, so this research adopts the public data account and navigation relationship rather than claiming to have inspected an unavailable community implementation.

CIB Seven also separates an armed Boundary Event subscription from execution of the Boundary Event flow node. The parser attaches the event subscription to its host scope, while `BoundaryEventActivityBehavior` reaches the ordinary activity-start operations only when the event fires. The project should therefore count a Boundary Event occurrence when it catches and takes its outgoing path, not when its timer or Message subscription is merely armed. Event-Based Gateway candidates differ: they are actual waiting Catch Event flow nodes and may finish completed or canceled after the race resolves.

Camunda Optimize supplies an independent analytical comparison where the CIB community UI is absent. It separates the object being viewed from the measure, treats flow-node count as how often a flow node executed, restricts total duration to terminal occurrences whose end is known, exposes status and date filters explicitly, and offers a diagram heatmap plus table or chart. The useful pattern is explicit measure, population, status, and interval, not the report-builder breadth, heatmap styling, predictive analysis, or Elasticsearch architecture.

The current project publication cannot honestly reproduce the CIB activity-instance unit. Its internal record exposes the selected Program operation and BPMN origin. One Call Activity execution selects both `invokeProcess` and `returnProcess` with the same BPMN element origin, while one embedded Sub-Process selects both `enterScope` and `completeScope` with the same origin. Counting records by `origin.elementId` therefore reports two executions where the runtime performed one. Treating a selected operation as a flow-node occurrence would also make Product 2 interpret Semantic Process IL. Exact wait occurrence identities cover User Tasks, Messages, Timers, and effects, but they are not a universal flow-node lifecycle.

Duration is a separate missing fact. `logicalTimeMs` is semantic scheduler time, not wall-clock time. The E1 envelope carries no committed wall-clock instant for an activity start or terminal boundary. Product 2 ingestion time, platform audit time, state differences, CIB history, and Temporal Event History are explicitly nonauthoritative substitutes. A duration value derived from any of them would be precise-looking platform invention.

The next bounded M5 contract must therefore stop at Product 1 and publish two new, separately specified facts before Product 2 renders metrics: an exact per-instance BPMN flow-node-occurrence lifecycle, and a replay-stable engine commit instant for the lifecycle boundaries. “Flow node” is deliberate project terminology and includes Events, Gateways, Tasks, Call Activities, and embedded Sub-Processes rather than only the BPMN `Activity` subtype. Frequency is the count of occurrence starts in the complete retained population for one exact definition version. Duration is the difference between the published terminal and start commit instants for completed occurrences only. Running or canceled occurrences remain visible in frequency/status counts but do not enter the completed-duration sample. The contract must define repeated activation identity, Call Activity and embedded Sub-Process pairing, boundary-event disposition, same-batch zero duration, nondecreasing commit time, and a fail-closed result when any confirmed instance in the selected population is unavailable or gapped.

| Reference pattern | Adopt | Deliberately change | Exclude |
|---|---|---|---|
| CIB runtime activity badges | Optional numeric overlays bound to exact BPMN elements; badge selection narrows the corresponding evidence | Call the project unit a flow-node occurrence and keep current-position and incident modes separate from historical metrics; no collapsed-container count may masquerade as its own occurrence | Counting semantic records, tokens, diagram markers, or platform rows as flow-node executions |
| CIB historic activity rows | One durable occurrence with start, terminal, status, and exact parent or owner identity | Use only project-published semantic identity and engine commit time, never CIB persistence identity or data shape | CIB entities, SQL, PVM lifecycle, and history configuration as product dependencies or semantic authority |
| CIB duration reports | Completed-only samples with explicit count, minimum, maximum, and average | Bind every aggregate to one exact definition version and visibly label the initial population as all retained evidence; make incomplete population unavailable rather than partial | Adjustable periods in the first increment, an average without sample count, running-instance pseudo-duration, and unseen enterprise report UI assumptions |
| Camunda Optimize flow-node analysis | Separate Frequency and Duration modes plus an accessible exact-value table | Begin with numeric diagram overlays and restrained sequential emphasis rather than a heatmap that implies more precision than the bounded sample | Report builder, dashboards, targets, outliers, variables, process variants, conformance, prediction, sharing, and auto-refresh |

The smallest honest Product 2 surface belongs to one exact definition version as a Flow-node metrics detail with Frequency and Duration modes, a visible all-retained population summary, numeric diagram overlays, and the same values in a table. Adjustable periods are useful CIB precedent but are deliberately deferred until the basic occurrence contract and retention population are proven. The surface is not another primary navigation destination. Desktop functional evidence at 1280 and 1600 CSS pixels is sufficient; layouts below 1280 CSS pixels and pixel-regression baselines are not acceptance requirements.

## Pattern 12: operator audit is instance context, not semantic history

CIB Seven `2.2` records authenticated engine operations in its User Operation Log. The public query can filter by Process instance, user, operation category, and timestamp order, and one operation ID groups the property-level entries produced by a single operation. Task Claim and Complete belong to a task-worker category, while manual Process-instance operations belong to an operator category. The pristine pinned community Cockpit source contains the public query and REST support but no corresponding User Operation Log or Operations Log interface or export in the inspected web application, so this project adopts the per-instance filtering and explicit action category but does not claim a CIB community UI or download precedent.

Camunda 8 supplies an independent product comparison. Its audit log is an authorization-controlled who, when, and affected-entity record, while Operate offers both a general Operations Log and a Process-instance-level Operations Log beside the exact instance. The transferable pattern is to make operator actions available in the Process-instance context and keep a broader operations collection separate. The project deliberately does not copy Camunda's data model, terminology, sorting controls, deployment topology, or retention account.

The project already has two complete action records at different capability boundaries. Work audit contains claim, release, and completion outcomes. Incident-action audit contains Retry and Cancel outcomes. Neither is the engine-published semantic History. They have separate transactional outboxes, sinks, private insertion ordinals, and snapshot instants. A combined timestamp sort would look convenient but would invent a global order that neither store establishes, because wall-clock timestamps can tie or regress and the private ordinals are not comparable across repositories.

The bounded M5 surface should therefore add one `Operator history` tab to exact Process-instance detail and one canonical JSON download. The tab presents `Work actions` and `Incident actions` as two separately labelled ascending source-local collections. Each collection names its own captured head and completeness boundary; no merged timeline, cross-stream cursor, causal arrow, or common snapshot is shown. The view and download remain available when committed semantic History or Diagram publication is unavailable because platform audit and Product 1 execution publication have independent authorities and failure modes.

| Decision boundary | Adopt | Deliberately change | Exclude | Acceptance oracle |
|---|---|---|---|---|
| Placement | Exact Process-instance operations context plus the existing broader incident-audit collection | Add `Operator history` as a Process-instance detail tab without replacing the incident-only top-level Audit panel | A new primary navigation destination or a dashboard card | Selecting one confirmed instance exposes its operator history and returns focus to the same collection row |
| Population | Existing Work and incident-action audit events for the exact hosting Process instance | Preserve the two complete source streams instead of flattening property entries or adding new producers | Deploy/start/read/authorization-denial audit, semantic transition records, or unaudited platform actions | Fixtures contain Work-only, incident-only, mixed, and empty streams without synthetic events |
| Ordering | Ascending order within each source stream | Publish two independently captured heads and state that no order exists between streams | Timestamp merge, cross-stream ordinal, inferred causal relation, or semantic chronology | Reversing either source order fails; equal and regressing cross-stream timestamps remain valid without reordering |
| Completeness | Reconcile both outboxes before two bounded source-local snapshots | Fail the whole view/export when either reconciliation, snapshot, decoding, or ceiling check fails | Partial results, cached fallback, or a claimed common atomic cut | A pending outbox is delivered before read; either unavailable or over-ceiling source suppresses both streams |
| Authorization and privacy | One exact Operations-group surface over all actors | Leave the existing self-only Work audit and incident audit APIs byte-identical | Tenant policy, authentication provider, private locator, Workflow/Run/Task Queue/Event History/Activity-attempt/transport facts | Denial performs zero reconciliation or repository reads; recursive forbidden-field mutations fail |
| Download | Strict versioned canonical JSON bytes over the same verified value shown in the tab | Download the already verified response bytes without browser reserialization | CSV, PDF, combined semantic/audit export, general export framework, or post-retention archive | Fixed bytes and SHA, whitespace/key-order/trailing-byte mutations, attachment filename, and downloaded-byte identity |

This surface completes the bounded M5 operator-history and audit-export requirement. It does not make the current producers a complete log of every platform or engine operation, and it does not change the top-level incident Audit tab into a cross-capability collection. A future global audit product, retention archive, tenant policy, or additional audit producer requires its own scope and authorization account.

## Product evidence matrix

| Product | Find work | Perform work | Process context | Operations pattern | Transferable lesson | Project-specific caution |
|---|---|---|---|---|---|---|
| CIB Seven Tasklist | Filters plus results | Default Form tab, claim and complete | Diagram and other task tabs | Separate Cockpit concerns | Proven task collection plus contextual tabs | Three-column desktop composition crowds forms and does not define this project's responsive behavior |
| Camunda 8 Tasklist and Operate | Task queue, filters, ordering | Form in selected task detail | Process tab | Model, instances, exact instance | Clear split between human work and operations | Priority, dates, descriptions, and intervention actions are not current project facts |
| Flowable Work and Control | Role-based inbox filters | Full task detail with form and outcomes | Work item and task tabs, diagrams | Definition and instance navigation | Strong header, tabs, and content-area detail model | Case, document, people, and save-draft functions are outside M3 |
| Bonita User Application | Configurable task and case lists | Form in master/detail with expand option | Case tab and overview | Case list to detail and overview | Wide forms need a larger detail mode | Custom case UI and broad form engine do not justify a generic project form layer |
| IBM BAW Process Portal | Work dashboard, searches, saved searches | Claim and complete work | Details, stream, related Process | Separate Process dashboards | Saved work views and team queues are valuable later | Its own documentation limits which dashboards are responsive |
| Appian Tempo | Task views, filters, reports | Accept, validate, save draft, submit | Task and record context | Sites and reports organize related work | Explicit views and deep task URLs aid orientation | Social tasks, reports, offline forms, and record fabric exceed BPM scope |
| ServiceNow Workspace | Default and personal filtered lists | Record page, optional inline editing | Record context | List to record, bookmarkable lists | Preview is optional; full record work owns a page | General database records and condition builders must not shape the BPM contract |
| ProcessMaker | Participant role and inbox | Assigned Process task forms | Request and case organization | Role-oriented product areas | Navigation should match participant objectives | Documentation evidence was too shallow to select a detailed M3 pattern |

## M3 recommendations

Adopt now:

1. persistent Work, Definitions, and Operations navigation, with Process instances inside Operations;
2. one primary content area with collection-to-detail transitions;
3. full-content task detail with Form, Diagram, and Details;
4. definition and version selection with Add BPMN as a neighboring action;
5. source DI or digest-bound sidecar for every M3 registered model;
6. container-responsive task rows with no horizontal scrolling;
7. retained completion context through transport failure and indeterminate outcomes;
8. functional browser and geometry review at 1280 and 1600 CSS pixels, with visual inspection used manually when a material design change warrants it;
9. explicit claim-before-work interaction, with completion unavailable while unclaimed and definite stale-claim refusals kept distinct from unknown delivery;
10. production-backed browser journeys that select or deploy a model, start it, cross each required interaction state, and verify terminal status plus public history or audit.

Reserve without implementing:

1. filters and saved views;
2. priority, due dates, follow-up dates, and task descriptions;
3. comments, documents, collaboration, and case context;
4. deep-link routing and bookmarkable workspace state;
5. dashboards and team workload;
6. instance intervention, migration, and variable repair.

Reject for M3:

1. a dashboard of unrelated feature cards as the primary IA;
2. a permanent narrow right panel for forms or diagrams;
3. horizontal task-table scrolling;
4. vendor product terminology or technology decisions imported as UX requirements;
5. BPMN facts inferred from Temporal Event History or platform state differences;
6. controls for data the engine and platform do not publish.

## Further recommended artifacts

The two project-specific UI contracts have graduated to stable specifications after their browser acceptance evidence and independent closure reviews completed. The [BPMN diagram presentation decision](../BPMN-DIAGRAM-PRESENTATION-DECISION.md) separately owns provenance and lifecycle because generated layout is not merely a visual-style choice.

The maintained [human-work browser walkthrough](../HUMAN-WORK-WALKTHROUGH.md) shows how to select or add a definition, inspect and download its diagram presentation, start an instance, claim the resulting task, complete its typed form, inspect the resulting public Process instance, and review operator history. A walkthrough is preferable to another proposal because it explains an implemented path rather than selecting new scope.

The flow-node occurrence and commit-time publication has closed together with the bounded Product 2 Flow-node metrics surface. The Product 2-only operator-history and canonical audit-export contract described by Pattern 12 has also closed in the [operator history and audit export specification](../BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md). No separate proposal is recommended for a router, report builder, dashboard, chart library, generalized mining store, or saved views.

## Primary sources

- [Current CIB Seven 2.2 Tasklist](https://docs.cibseven.org/manual/2.2/webapps/tasklist/) documents the current Tasklist surface and its dashboard, filters, assignment, lifecycle, and accessibility owners.
- [Current CIB Seven BPMN modeling documentation](https://docs.cibseven.org/manual/2.2/webapps/modeler/user-guide/bpmn-modeling/) lists the modeling palette and therefore supplies a useful negative discriminator between modeling availability and engine execution support. [CIB Seven process-engine concepts](https://docs.cibseven.org/manual/2.2/user-guide/process-engine/process-engine-concepts/) routes executable meaning to the element-by-element BPMN implementation reference. The matching pinned Admin system-settings source was inspected at the exact paths recorded in the capability-disclosure preflight.
- [Current CIB Seven 2.2 Process Definition View](https://docs.cibseven.org/manual/2.2/webapps/cockpit/bpmn/process-definition-view/) and [Process Instance View](https://docs.cibseven.org/manual/2.2/webapps/cockpit/bpmn/process-instance-view/) document the diagram guide, running and incident badges, navigation controls, detail tabs, and called-Process drill-down. The matching implementation was inspected in the pristine pinned checkout recorded by [SOURCES.md](../SOURCES.md#cib-seven), especially its process-diagram directive, bpmn-js viewer, activity-instance projection, and instance-count overlay owners.
- [Current CIB Seven Cockpit configuration](https://docs.cibseven.org/manual/latest/webapps/cockpit/extend/configuration/) documents optional runtime activity metrics and the day, week, month, or complete historic metric period.
- [Current CIB Seven history configuration](https://docs.cibseven.org/manual/latest/user-guide/process-engine/history/history-configuration/) documents historic activity instances and completed Process and Task count or duration reports. [CIB Seven 2.2 REST](https://docs.cibseven.org/rest/cibseven/2.2-ee/) documents the exact historic activity-instance, activity-statistics, and completed Process duration result fields. The matching pinned source inspection covered `HistoricActivityInstance`, `HistoricStatistics.xml`, `Report.xml`, `BoundaryEventActivityBehavior`, the PVM activity-start operations, and the community Cockpit instance-count and report-host owners.
- [CIB Seven 2.2 User Operation Log](https://docs.cibseven.org/manual/2.2-ee/user-guide/process-engine/history/user-operation-log/) documents authenticated operation recording, operation grouping, Process-instance and user filters, task-worker versus operator categories, and the public Java/REST query relationship. The matching pristine source inspection confirmed Process-instance, user, category, and timestamp-order query support and found no matching community Cockpit User Operation Log or export surface.
- [Current CIB Seven webclient configuration](https://docs.cibseven.org/manual/2.2/webapps/configuration-options/) documents current keyboard focus regions for filters, tasks, task detail, claim, Process list, and Process start.
- [Historical CIB Seven 1.0 Tasklist dashboard](https://docs.cibseven.org/manual/1.0/webapps/tasklist/dashboard/) documents the versioned Form/History/Diagram/Description tab arrangement used only as historical interaction evidence.
- [CIB Seven User Task forms](https://docs.cibseven.org/manual/latest/user-guide/task-forms/) documents generated, embedded, external, and generic task-form relationships.
- [Camunda 8 Tasklist overview](https://docs.camunda.io/docs/components/tasklist/userguide/using-tasklist/) documents the queue, selected task detail, forms, Process tab, filters, and ordering.
- [Camunda 8 BPMN coverage](https://docs.camunda.io/docs/components/modeler/bpmn/bpmn-coverage/) supplies the independent grouped matrix and explicit modeling-versus-execution distinction used by the capability-disclosure preflight. [Camunda version-aware element guidance](https://docs.camunda.io/docs/components/modeler/reference/modeling-guidance/rules/element-type/) shows the related selected-engine-version compatibility pattern.
- [Camunda 8 Tasklist Process starts](https://docs.camunda.io/docs/components/tasklist/userguide/starting-processes/) documents a separate Processes page and start-form flow.
- [Camunda 8 Operate navigation](https://docs.camunda.io/docs/components/operate/userguide/basic-operate-navigation/) documents model-to-instance-list-to-instance-detail navigation.
- [Camunda 8 audit log](https://docs.camunda.io/docs/components/audit-log/overview/) documents the authorization-controlled who, when, and affected-entity account. [Camunda Operate audit operations](https://docs.camunda.io/docs/next/components/operate/userguide/audit-operations/) documents both a general Operations Log and a Process-instance-level Operations Log and supplies the independent placement comparison used by Pattern 12.
- [Camunda Optimize report definitions](https://docs.camunda.io/docs/8.7/components/optimize/userguide/process-analysis/report-analysis/define-reports/), [flow-node filters](https://docs.camunda.io/docs/components/optimize/userguide/process-analysis/flow-node-filters/), and [duration measures](https://docs.camunda.io/docs/components/optimize/userguide/process-analysis/report-analysis/measures/) document the independent count/duration, status, interval, completed-only, aggregation, diagram, and table patterns used only to fill the community CIB UI gap.
- [Flowable Work tasks](https://documentation.flowable.com/latest/user/work/work-tasks) documents inbox filters, selected task detail, forms, actions, and contextual tabs.
- [Flowable Control processes](https://documentation.flowable.com/latest/user/control/processes) documents definition, instance, diagram, task, and detail navigation.
- [Bonita User Task list](https://documentation.bonitasoft.com/bonita/2025.1/runtime/user-task-list) documents configurable master/detail, full-width list, and expanded wide-form modes.
- [Bonita User Case list](https://documentation.bonitasoft.com/bonita/latest/runtime/user-application-case-list) documents responsive case collection, detail, and overview relationships.
- [IBM BAW Process Portal dashboards](https://www.ibm.com/docs/en/baw/25.0.x?topic=ipp-dashboards) documents Work, Process, and performance surfaces and explicitly identifies its responsive subset.
- [IBM BAW task work](https://www.ibm.com/docs/en/baw/26.0.x?topic=mw-completing-work-tasks) documents claimed and team tasks, task detail, and Process context.
- [Appian Tasks](https://docs.appian.com/suite/help/26.3/Tasks.html) documents task views, filters, accept, form validation, save draft, and submit.
- [ServiceNow workspace lists](https://www.servicenow.com/docs/en-US/bundle/zurich-platform-user-interface/page/administer/workspace/task/work-with-lists.html) documents list-to-record navigation, optional preview, filtering, sorting, and bookmarkable lists.
- [ProcessMaker documentation](https://docs.processmaker.com/) documents participant, designer, and administrator product roles and the participant inbox objective.

## Confidence and recheck boundary

Confidence is high for the recurring collection-to-detail, form-plus-context, claim gate, model-to-instance, flow-node-occurrence count, completed-duration, and instance-local operator-audit patterns because they occur across independent products and the CIB activity and user-operation data accounts are confirmed by public contracts and pinned source. Confidence is high that the project must preserve separate source-local audit ordering because its two stores expose no common ordinal or snapshot. The exact historical CIB tab arrangement has medium confidence as a current-product detail and is used only where current CIB and independent product evidence support the broader form-plus-context pattern. Confidence is medium for visual composition because screenshots can lag product releases and several products expose configurable layouts.

Recheck the source set before selecting a later dashboard, case-management, collaboration, saved-view, full form-engine, global audit product, or generalized mining increment. Reopen the operator-audit preflight if another durable audit producer, a shared transactional audit store, tenant policy, archive retention, or a public cross-stream order is selected, because any of those changes the honest population, authorization, or completeness contract.
