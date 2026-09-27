# BPM platform information architecture specification

## Status

**Implemented, independently closure-reviewed, and maintained.** The platform shell, workspace flows, responsive evidence, and diagram presentation contract realize this information architecture. It changes no BPMN meaning, engine contract, or platform authorization rule and is classified non-material under the [independent cold-review negative case](TESTING-SPEC.md#independent-cold-review-gate).

The 2026-09-27 owner-approved routing extension is implemented and accepted through the composed package, policy and browser evidence described below. The earlier closure receipt does not qualify this extension.

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

The upper-left brand is a native home link to the initial Work inbox (`#/work`), clearing any selected task from the destination. It supports keyboard activation, modified clicks and browser history through the existing router; pending or uncertain task actions retain the same navigation protection as other links.

The shell additionally exposes one utility destination, About, after the three operational workspaces. About identifies the running pre-release product version and presents the exact bounded BPMN element variants, current restrictions, retained-model coverage, and selected CIB Seven `2.2.0` evidence relation. It is not a dashboard or operational workspace and contains no mutation.

The navigation reflects durable product capabilities. It does not expose package names, milestone names, Product 1 versus Product 2 terminology, or test infrastructure. About may name standards, retained evidence, and compatibility profiles because explaining those distinctions is its user objective.

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

## Browser location and state ownership

TanStack Router owns code-based typed hash routes for the static client. Opening or copying a location, refreshing, and browser Back/Forward must address the same public selection and view without requiring a server fallback. The closed URL surface is:

| Surface | URL-owned selection and view |
|---|---|
| Shell | Work, Definitions, Operations or About workspace |
| Definitions | Public Process ID, exact version and detail tab |
| Showcase catalog | Catalog/detail view, selected model, search text `q` and additional-model toggle `all` |
| Work | Exact published task selection and Form/Diagram/Details view |
| Operations | Collection tab, selected public instance or incident, detail view and submitted filters |

URL values are selection requests, never authorization or evidence of current availability. Reopening a location resolves it through public APIs and validates the returned exact identity and current prerequisites before presenting actions. Missing, stale, invalid or unauthorized selections remain non-actionable; no occurrence identity is constructed from an element name, route position, history or state difference. A public Start result can select its returned instance directly without inventing or searching for another identity.

One shared application QueryClient serves existing Query-backed Work reads. Definitions and Operations keep their bounded feature API clients, loaders and request-concurrency controls; routing introduces no wholesale data-fetch migration. React Activity preserves visited workspace state, while feature-owned form state retains drafts and feature-owned operations retain exact retries. The URL contains no payload, form draft, capability, command or retry identity. Submitted collection filters belong in the URL; unsubmitted field edits stay local. Reload or opening a copied link restores public selection, not an in-memory draft or uncertain operation.

Pending and uncertain mutations block navigation that would replace their affected selected item, including browser-history navigation. Unrelated workspace changes and safe detail-view changes may retain that operation in memory. Routing neither resubmits commands nor silently claims tasks. Existing actor authorization and definite-refusal handling remain authoritative. No persistent draft store, general state manager, SSR, form library or virtualization is selected.

## Work flow

The Work workspace opens on the actor-visible task collection. Task names are descriptive text, not action labels. A claimed row offers a filled **Edit task** button in its Action cell; its accessible name also identifies the task. **Release** is secondary. An unclaimed row offers **Claim** without an Edit control. Editing opens the exact task's Form without submitting or approving anything. Diagram gives Process context, and Details exposes exact public identity and claim facts. Back restores focus to the Edit control when it still exists.

Task rows may use a table where the available container can display columns without truncating actions. When the actual content container is narrower, each row reflows into a labeled task card. Horizontal scrolling is prohibited for the M3 task collection. Task and Process names wrap safely, while task occurrence identity remains available in Details rather than consuming collection width.

Claim, release, completion, retry, and indeterminate delivery states stay adjacent to the selected task. A transport failure or indeterminate completion does not discard the exact retained operation or close the task detail.

Task input and the selected resolution survive detail-tab and primary-workspace navigation in memory. A different task occurrence receives a fresh form. Inactive content is hidden and unavailable to keyboard navigation; persistent draft storage is not provided. An incompatible published field value makes the complete form unavailable before any editable controls appear, including when that field belongs to another resolution action.

## Definitions flow

The Definitions workspace includes a searchable Process showcase catalog alongside deployed definitions. Selecting a showcase reveals its business purpose, evaluation instructions, exact element restrictions and separate evidence boundaries before any deployment or start. Human-work examples use the existing claim/form flow; guided simulations require the explicitly isolated RC host and label simulated participants and integrations. Other retained models remain inspectable without an executable browser claim. The [RC source preflight](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md#rc-business-process-showcase-preflight) owns the adopted and excluded reference behavior. This presentation and reuse of existing public operations is non-material under the independent-review negative case. Catalog binding tests, complete affected-package gates and production-browser journeys own acceptance.

**Show additional models** changes catalog visibility only; it grants no execution capability. The catalog button has visible separation from the deployed-definition controls. Diagram copy says **Process diagram**, identifies the technical **BPMN process ID**, and retains source/generated-layout provenance and the derived-copy warning.

The deployed-definition view begins with selectors for an existing definition and exact version. Adding BPMN is a secondary action in the same workspace, not a separate third-party deployment product area. Selecting a definition opens Diagram by default, with Start and Triggers as related tabs for that exact version.

The isolated `demo:rc` host prepares the existing curated catalog before reporting ready. The catalog identifies prepared entries by published exact source digest and semantic profile, then offers **Open definition** and **Go to Start** links carrying the published Process ID and version. Guided readiness additionally requires the simulation host. Following, reloading or returning to these links never deploys or starts a process. Unprepared entries keep the existing explicit preparation action; ordinary platform startup does not seed examples.

Add BPMN definition opens a titled modal with a dimmed, inactive background and visible Cancel action. Escape, Cancel and clicking the backdrop dismiss an idle form and restore focus to its opener. Deployment retains entered values and displays errors inside the modal; while a request is pending it disables submission/dismissal and explains why. Confirmed successful deployment closes the dialog and selects the returned version. Supplementary showcase explanation, exact source/profile, start data and History stimulus values instead expand in normal flow through shared Show/Hide controls under the [disclosure guideline](BPM-PLATFORM-UI-DESIGN-SPEC.md#disclosures-and-dialogs).

The latest selection owns asynchronous results. Deployment keeps its exact returned version even if another version appears concurrently. Changing definition resets its Start receipt and diagram; a failed diagram load never leaves an earlier model visible. Catalog return restores the originating control. Preparation opens Start for the exact returned version and focuses **Ready to start**, retaining the source/profile-bound showcase title and instructions. The Diagram and other inspection tabs offer a prominent **Start process** shortcut to this same view. A shortcut only navigates; creating an instance still requires the explicit version-labelled Start command. Safe tab changes retain that command's pending state and result rather than losing the receipt or inviting another start.

### Evaluation journeys

| User objective | Guided sequence | Completion and next action |
|---|---|---|
| Try a business example | Explore showcases → choose a prepared business process → Go to Start → Start the displayed version; prepare explicitly only when the model is not deployed | Show the returned instance and What happens next; no return to selectors or manual tab discovery |
| Run an existing definition | Choose definition/version → inspect Diagram → Start process → review details → explicit Start | Open the exact returned instance directly in Operations, without searching or copying its ID |
| Participate in a human-work example | Confirmed Start → Open task inbox → Claim → Edit task → fill the form → explicit completion | Return to the current task collection; inspect the started instance through its retained Start receipt |
| Watch a guided simulation | Confirmed Start → View instance in Operations → Overview and History | Explain simulated participants before starting and beside the next step; make no human-inbox promise |
| Understand coverage without running | Explore a model → read business purpose, elements and restrictions | Additional view-only models have no Prepare or Start claim |

Each transition must make the next action visible, retain the selected business context, and explain any deliberate wait or prerequisite. After confirmed Start, the next step takes visual priority over starting again. The task-inbox link lists current authorized work; it neither identifies an unobserved task nor silently claims one. Navigation creates no instance. These journeys use the existing typed routes, feature-owned state and public APIs, with no wizard framework or new engine capability.

Diagram resolution follows the [BPMN diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md): prefer usable BPMN DI embedded in the admitted source and otherwise use a digest-bound generated-DI sidecar. The UI labels generated layout honestly and never presents generated DI or the resolved presentation as admitted or executable source.

Definitions use one closed `GET /api/v1/definitions/{processId}/versions/{version}/presentation` result carrying exact public definition identity, source digest, presentation digest, UTF-8 presentation XML, and a closed `source` or `generated` provenance arm. A selected task may request that hosting definition only when its semantic `processInstanceId` equals the public hosting root instance. After import, the exact task `elementId` must exist in the rendered element registry before it is highlighted. A task in a called semantic instance, an absent element, an unsupported generator shape, or a presentation failure produces an honest unavailable Diagram state. The UI never guesses a called definition from element names, host state, or Temporal facts.

## Operations flow

Operations begins with React Aria tabs for Process instances, Incidents, and Audit. Process instances retains the existing confirmed-start search as a tab rather than a separate primary-navigation destination. Incidents is a responsive collection of exact current engine publications. Selecting an incident replaces that collection with full-width Overview, Diagram, and Audit tabs; the diagram highlights the exact published Service Task element, and Back restores focus to the originating row when it still exists or to the collection heading otherwise. The top-level Audit tab is a separate paged collection of platform action facts and never presents an audit row as proof that an incident remains current.

Collection rows are request and focus context, not current-detail authority. Incident controls appear only after the exact detail request succeeds. A pending, unavailable, absent, or stale detail request renders an honest non-actionable state, and switching tabs invalidates the request rather than promoting a late response.

An unresolved incident action retains its exact retry identity across detail tabs and primary workspaces. Back to the incident collection remains unavailable until the action has a definite disposition, with an adjacent explanation. Late completion callbacks cannot close another selection. This is in-memory interaction continuity, not persistent drafts or new engine observation.

## About flow

About opens directly to a compact version summary followed by a complete native table. Each row names one executable BPMN element variant, its family, exact current restriction, retained project-model coverage, and its selected CIB Seven relation. Standards support, CIB compatibility, and Product 2 availability remain separate facts. A prominent pre-release note states that the rows are bounded evidence rather than a BPMN conformance percentage, and links the reader to the maintained implementation map and requirement ledger for the complete account.

The table is compiled from the same project-owned capability catalog checked by the executable model corpus. The browser does not infer support from deployed definitions, runtime histories, CIB results, or UI features. Adding an admitted element variant without retained corpus coverage fails the corpus gate before the About projection can claim it.

**Implementation checkpoints** labels historical Beta evidence separately from the current executable overview. One Show/Hide control expands the complete group of seven checkpoint cards. A separate Show/Hide control expands the complete executable capability overview. Both sections start collapsed and expand independently; individual cards have no disclosure controls. Historical labels, evidence, product surface and remaining limits remain unchanged; Beta is not presented as the current product milestone.

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

Required behavior is stable primary navigation, the About utility destination, coherent collection-to-detail flows, Form/Diagram/Details task context, Diagram/Start/Triggers definition context, Process instances/Incidents/Audit operations context, responsive no-scroll collections, and exact current operation state.

Excluded behavior is a dashboard of unrelated panels, a permanent narrow task-form sidebar, route proliferation without a user objective, navigation by engine package, hidden horizontal task-table scrolling, or copying CIB Seven's implementation or visual theme.

## Acceptance

The routing extension requires direct-link, reload and Back/Forward witnesses for the closed URL surface, exact-version selection under delayed responses, no action from invalid or unauthorized selections, and retained draft/retry behavior across permitted navigation. Navigation must not replay a mutation or discard an unresolved operation. Acceptance composes the complete UI run's passing cases with focused passing corrections for Work Back focus at both widths, delayed exact-version detail suppression and the additional lifecycle cases. The failed full-run receipt remains failed; this is not a single all-green final full-suite run. Complete affected package and policy gates pass. Live RC journeys and shutdown witnesses pass on the preceding bundle, with the final table and definition corrections covered by the affected browser rerun. The following working-tree receipt records the command outcomes; [PLAN.md](PLAN.md) owns the next action.

UI evaluation corrections, working tree on `2026-09-27`: `./scripts/pnpm.sh run test:platform-web:built` passes (5 UI-kit and 151 web tests); platform dependency/boundary checks pass (38), as do documentation checks (51). `./scripts/pnpm.sh run test:ui-quality:built` passed 134 cases and exposed two focus failures; the shared table correction passes both viewport reruns, with 11 targeted final checks including two additional delayed-selection/background-completion cases. `./scripts/pnpm.sh run test:showcase:mue-rc:built` passes its twelve live journeys and two shutdown checks; their final table/selection corrections are covered by the targeted browser receipt. No full engine gate was repeated and the RC tag was not moved.

Subsequent journey/button correction on `2026-09-27`, still uncommitted: focused red witnesses reproduce the absent Diagram Start shortcut, preparation landing on Diagram for both human and guided models, and the missing explicit Edit task button. The rebuilt web and UI-kit package gates pass (151 and 5 tests). The selected Playwright file set passes 136 checks, including source-bound preparation into exact-version Start, no implicit creation, retained Start receipts, Work drafts and responsive focus. Two final button-style checks pass at 1280/1600. The real Temporal RC journeys `request-review-with-form` and `external-service-recording` pass using the visible next actions through completion and History. This qualifies the selected interaction correction, not a fresh full engine or twelve-model RC qualification.

Disclosure correction on `2026-09-27`, still uncommitted: the deployment form's missing modal/dismissal behavior and the inconsistent inline controls have separating red browser witnesses. The web/UI-kit gates pass (151 and 5 tests), as does the browser type check. Thirteen targeted cases pass for all four inline disclosure sites, both desktop widths and existing incident confirmation; the deployment-error fixture initially fails because it supplies an invalid public error code. After correcting that fixture, all eight definition lifecycle cases pass, including pending/error/success, exact version, Cancel/Escape/backdrop dismissal and focus return. Manual 1280-pixel inspection confirms the centered form, dimmed background and visible Cancel. The [shared guideline](BPM-PLATFORM-UI-DESIGN-SPEC.md#disclosures-and-dialogs) owns future design.

Action geometry and checkpoint correction on `2026-09-27`, still uncommitted: separating browser failures reproduce the missing next-action spacing, stretched Claim control and absent per-checkpoint disclosures. After correction, 12 focused browser cases pass at 1280/1600, covering the 16-pixel action gap for three showcase journeys, natural Claim width with a minimum 44-pixel height, keyboard expansion/collapse of all seven checkpoints with exact retained evidence, and the current capability table's caption layout. Web/UI-kit package gates pass (151 and 5 tests), as does the browser type check. Automatic demo preparation was still a proposal at that checkpoint; the follow-up below implements it.

Prepared-demo and collapsed-geometry follow-up on `2026-09-27`, still uncommitted: the live red witness found zero definitions instead of twelve, and two layout witnesses reproduced empty collapsed panel decoration. The final focused browser run passes 15 cases, including exact prepared-definition links, Back/reload without mutations, manual preparation and zero-height collapsed content at both desktop widths. The live RC startup witness confirms all twelve admitted definitions and no automatically started instances; human request review and guided service recording complete through the prepared links (three live tests pass). Web/UI-kit tests pass (151 and 5), demo package tests pass (23), and browser type checking passes. This qualifies demo preparation and the shared disclosure correction, not a repeated full engine gate.

Final UI evaluation checkpoint on `2026-09-28`: four focused browser cases verify section-level About expansion and caption geometry at both widths. Five further cases verify the home link, keyboard activation and browser history, uncertain-command navigation protection, and the separated upload action with modal dismissal. The web package passes all 151 tests and the browser type check passes. This remains a non-material UI/demo composition change covered by the existing package, dependency, documentation and browser guards; it changes no semantic or public engine contract. The six absent-DI showcase failures remain open under the separately approved presentation task in [PLAN.md](PLAN.md).

Static component tests lock navigation and collection-to-detail ownership. Real-host browser evidence exercises the M1 source-owned Collaboration DI lifecycle, generated DI in M2 and M3, accessible Definitions and Work navigation, exact task selection, claim, completion, and version operation. The real M4 showcase additionally locks Operations navigation, current incident discovery, response-loss Retry, Worker-replacement Cancel, exact diagram highlighting, incident and top-level audit, and Process-instance search through public platform routes. The deterministic Product 2 browser lane separately locks called-instance and missing-element task-diagram unavailability, source and generated provenance, Operations pending/failure/currentness, private-fact exclusion, focus, reduced motion, and desktop geometry at 1280 and 1600 pixels. Optional visual review uses the separate manually invoked lane owned by the [UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md#visual-review-protocol); semantic development and `verify.sh` never invoke it.

## Research and related owners

- [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) owns the product comparison and pattern evidence.
- [BPM platform UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md) owns visual language and responsive styling rules.
- [BPMN diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns embedded DI and digest-bound sidecar precedence and provenance.
- [Architecture](ARCHITECTURE.md#user-interface) owns packages and dependency direction.
