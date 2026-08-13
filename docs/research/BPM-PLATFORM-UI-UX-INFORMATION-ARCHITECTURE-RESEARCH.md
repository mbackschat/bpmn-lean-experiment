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
7. adapt the same interaction honestly across browser widths.

## Project context and owner observations

M3 publishes a small but truthful human-work contract: actor-visible tasks, exact Process and task occurrence identity, one candidate group, claim and release, one typed string or Boolean field, retry-safe completion, and platform audit. It does not publish priority, due date, descriptions, comments, attachments, saved filters, or arbitrary form schemas. Research recommendations must not invent those facts.

The owner's live browser review found that the first M3 composition made the product harder to understand than its implementation deserved. Independent panels were stacked top to bottom, the task form was confined to a narrow right area, definition selection was separated from adding a definition, long task rows broke at ordinary widths, and metadata-only BPMN source produced no diagram. The owner wants a coherent browser product that can select or add a Process model, start it, show the resulting task, render its form, and explain it with a diagram.

## Method and limits

The study uses official product documentation and the screenshots embedded in that documentation. Current documentation is preferred. One CIB Seven `manual/1.0` page is retained explicitly as historical evidence for the older Form/History/Diagram/Description tab arrangement, while the current `2.2` Tasklist, configuration, and latest form documentation corroborate the durable task-list, focus-region, Process-start, claim, and form relationships. CIB Seven, Camunda 8, Flowable, Bonita, IBM Business Automation Workflow, Appian, ServiceNow, and ProcessMaker were inspected. Their documented functions are more reliable than visual details that may change between releases; no product is treated as a design authority.

The products span different scopes. CIB Seven and Camunda 8 are direct BPM references. Flowable and Bonita combine process, case, task, and form work. IBM BAW and Appian emphasize enterprise work portals. ServiceNow provides a mature record-workspace pattern. ProcessMaker contributes role-oriented process participation. The comparison therefore separates transferable interaction patterns from product-specific data and permissions.

## Pattern 1: stable capability navigation

The durable primary choices recur as work/tasks, processes or definitions, and operational inspection. Camunda 8 Tasklist exposes Tasks and Processes as separate top-level pages. Flowable exposes Tasks, Work, and other application areas in persistent navigation. Bonita separates Process list, Case list, and Task list. ServiceNow workspaces expose list categories and record pages.

The transferable rule is to name navigation after a person's objective, not the engine's package structure. For this project the smallest stable set is Work, Definitions, and Process instances. Dashboard is not a primary objective in M3 and should not be a default landing page merely because many enterprise suites offer one.

## Pattern 2: collection first, then substantial detail

Task products consistently begin with a queue or list and open one exact item into a detail surface. CIB Seven uses filters, results, and a task view. Camunda 8 uses a task queue and selected task details. Flowable describes an inbox plus a details panel with a header, navigation, and main area. Bonita documents both master/detail and a full-width expansion for large forms. ServiceNow list pages open records and allow only optional preview in a side panel.

The transferable rule is the list-to-detail relationship, not a permanent three-column desktop layout. A narrow inspector works for preview and short metadata, but a task form or process diagram is primary work. This project should let selection replace the collection with a full content detail and provide an explicit return to the list. A future desktop enhancement may show a wide master/detail layout only when both surfaces retain usable widths and the same interaction collapses cleanly.

## Pattern 3: form first, Process context adjacent

CIB Seven Tasklist makes Form the default task detail tab and offers History, Diagram, and Description as sibling context. Camunda 8 places the form in task detail and provides a Process tab with the diagram. Flowable uses a Task tab for the form and other tabs for people, subtasks, and documents. Bonita keeps case information one tab from the form. IBM BAW exposes Process details and related task context while a person works.

The recurring rule is that doing the work is primary, while Process context is one predictable navigation step away. This project should use Form, Diagram, and Details for a selected task. Form is the default. Diagram explains where the task sits. Details carries exact public identity, assignment, and completion state. Audit remains its own platform surface rather than being relabeled as BPMN history.

## Pattern 4: assignment is a gate, not the content

CIB Seven, Camunda 8, IBM BAW, Appian, Flowable, and Bonita all distinguish a pooled or candidate task from one accepted or claimed by a worker. They differ in terminology and authorization, but the interaction shape recurs: visibility, claim or accept, work, complete, and optionally release or unassign.

The project consequence is to keep Claim or Release near the selected task and to avoid making claim state a separate workspace. The form may be inspectable before claim only if the public authorization contract allows it. Completion must remain unavailable to the wrong actor, and hidden tasks must not leak through navigation or error detail.

## Pattern 5: task context must survive uncertain delivery

Most surveyed documentation describes ordinary success and validation. It says less about response loss or indeterminate completion. M3's durable action contract is therefore an opportunity to improve on the references. A transport failure or indeterminate engine result must leave the selected task, form data, and exact retry action visible. The interface must not manufacture a new action identity or close the detail as though the outcome were known.

This is a project-specific BPM work pattern: preserve enough context for the person to understand whether they can retry, while rendering terminal rejection and Process closure honestly.

## Pattern 6: startable Processes belong beside, not inside, task filters

Camunda 8 gives startable Processes their own page. CIB Seven starts a Process from Tasklist but still presents a distinct model selection step. IBM BAW exposes launchable Processes beside work. Bonita separates the Process list from the Task list. This prevents the inbox from becoming a mixed catalog of work and models.

For this project Definitions owns existing models, exact versions, start actions, and future triggers. The workspace should offer a selector for definitions already in the durable catalog and an adjacent Add BPMN action. The current phrase Third-party deployment is implementation language and should not be the only path into the feature.

## Pattern 7: definition, diagram, instances, exact instance

Camunda 8 Operate moves from a deployed Process model to its instance table and then to exact instance history and variables. Flowable Control similarly opens a definition, lists its instances, and uses a diagram plus tabs for exact instance details. Bonita moves from cases to case details and a customizable overview.

The transferable operations pattern is model to instances to exact instance, with the diagram retaining orientation. This project should keep Definitions and Process instances as distinct primary workspaces because their current public contracts are separate, but selection and links should preserve the exact definition identity. A later instance detail may use Diagram, Public data, and Platform audit tabs only after those public contracts exist.

## Pattern 8: filters and saved views are secondary navigation

CIB Seven uses task filters. Camunda 8 supports filters and ordering. Flowable distinguishes For me, Unassigned, Open, Completed, and All. IBM BAW provides searches and saved searches. Appian provides task views and administrator-defined task reports. ServiceNow makes default and personal filtered lists central to repeated work.

The transferable rule is to let repeated queries become stable secondary navigation once the contract has enough fields. M3 has only one actor-visible current-task snapshot, so speculative filter controls would be dishonest. The IA should reserve a filter region without implementing priority, due-date, status, or saved-view semantics before the server publishes them.

## Pattern 9: responsive adaptation needs a different detail posture

The surveyed products often document master/detail desktop layouts, but their responsive quality is uneven. Bonita explicitly offers a panel expansion for wide forms. IBM states that only its Work and Next Task dashboards are responsive across devices, which is strong negative evidence against assuming that a general enterprise dashboard will adapt automatically. ServiceNow treats preview as optional and lets the selected record open as its own page.

The project consequence is to preserve the information relationship while changing the composition. A task list may be a comparison table when wide, then reflow each row into a labeled card within its actual container. Horizontal task-row scrolling is prohibited. Task detail becomes the content view, not a squeezed side panel. The shell moves navigation above content at narrow widths.

## Pattern 10: diagrams are orientation surfaces

CIB Seven and Camunda 8 expose a task's Process diagram from task detail. Flowable shows Process diagrams in instance inspection and can enlarge them. Camunda 8 Operate places the model above its instance list. The recurring purpose is orientation: what this task belongs to, what has happened, and what may come next.

For this project, diagram availability cannot depend on whether the admitted executable source happened to contain BPMN DI. The [BPMN diagram presentation decision](../BPMN-DIAGRAM-PRESENTATION-DECISION.md) therefore preserves source-owned DI when present and otherwise permits a digest-bound generated sidecar that never becomes executable source. Generated provenance must remain visible.

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

1. persistent Work, Definitions, and Process instances navigation;
2. one primary content area with collection-to-detail transitions;
3. full-content task detail with Form, Diagram, and Details;
4. definition and version selection with Add BPMN as a neighboring action;
5. source DI or digest-bound sidecar for every M3 registered model;
6. container-responsive task rows with no horizontal scrolling;
7. retained completion context through transport failure and indeterminate outcomes;
8. screenshot and geometry review at 1600, 1280, 1024, and 768 CSS pixels.

Reserve without implementing:

1. filters and saved views;
2. priority, due dates, follow-up dates, and task descriptions;
3. comments, documents, collaboration, and case context;
4. deep-link routing and bookmarkable workspace state;
5. dashboards, team workload, and process performance;
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

After implementation, add a concise M3 browser walkthrough under `docs/` that shows how to select or add a definition, see its diagram, start an instance, claim the resulting task, complete its typed form, and inspect the resulting public Process instance. A walkthrough is preferable to another proposal because it explains an implemented path rather than selecting new scope.

No separate proposal is recommended now for tokens, a router, a form framework, dashboards, or saved views. The UI design specification already owns tokens and responsive component rules, while the other topics have no approved M3 contract.

## Primary sources

- [Current CIB Seven 2.2 Tasklist](https://docs.cibseven.org/manual/2.2/webapps/tasklist/) documents the current Tasklist surface and its dashboard, filters, assignment, lifecycle, and accessibility owners.
- [Current CIB Seven webclient configuration](https://docs.cibseven.org/manual/2.2/webapps/configuration-options/) documents current keyboard focus regions for filters, tasks, task detail, claim, Process list, and Process start.
- [Historical CIB Seven 1.0 Tasklist dashboard](https://docs.cibseven.org/manual/1.0/webapps/tasklist/dashboard/) documents the versioned Form/History/Diagram/Description tab arrangement used only as historical interaction evidence.
- [CIB Seven User Task forms](https://docs.cibseven.org/manual/latest/user-guide/task-forms/) documents generated, embedded, external, and generic task-form relationships.
- [Camunda 8 Tasklist overview](https://docs.camunda.io/docs/components/tasklist/userguide/using-tasklist/) documents the queue, selected task detail, forms, Process tab, filters, and ordering.
- [Camunda 8 Tasklist Process starts](https://docs.camunda.io/docs/components/tasklist/userguide/starting-processes/) documents a separate Processes page and start-form flow.
- [Camunda 8 Operate navigation](https://docs.camunda.io/docs/components/operate/userguide/basic-operate-navigation/) documents model-to-instance-list-to-instance-detail navigation.
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

Confidence is high for the recurring collection-to-detail, form-plus-context, claim gate, and model-to-instance patterns because they occur across multiple independent products and are documented in current official sources. The exact historical CIB tab arrangement has medium confidence as a current-product detail and is used only where current CIB and independent product evidence support the broader form-plus-context pattern. Confidence is medium for visual composition because screenshots can lag product releases and several products expose configurable layouts. Recommendations remain bounded to M3's actual public facts.

Recheck the source set before selecting a later dashboard, case-management, collaboration, saved-view, or full form-engine increment. Those are product areas where the vendors' data models and current feature releases materially affect the comparison.
