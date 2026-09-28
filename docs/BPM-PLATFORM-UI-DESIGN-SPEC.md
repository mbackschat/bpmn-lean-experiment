# BPM platform UI design specification

## Status

**Implemented, independently closure-reviewed, and maintained.** The M3 shell, shared UI kit, feature CSS Modules, responsive collection, complete declared-state fixtures, real-host showcases, and deterministic desktop browser evidence implement this visual and interaction contract. It changes no BPMN meaning, engine contract, or platform authorization rule and is classified non-material under the [independent cold-review negative case](TESTING-SPEC.md#independent-cold-review-gate).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `1f617ef` | `fork-turns-none` | `approve-with-required-edits` | `c3f6671` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `45c4bfc` | `fork-turns-none` | `approve-with-required-edits` | `afc4b63` |

The context-cold proposal reviewer completed two warm correction rounds and approved `c3f6671`. A separate context-cold closure reviewer required four bounded corrections at `45c4bfc`; two warm audits approved the final correction target `afc4b63`.

## Owner motivation and product vision

The owner expects M3 to establish the visual and interaction foundation for the BPM platform, not merely make the current showcase pass. The product should look deliberate and professional at first contact, remain efficient for sustained work, and be reviewable in a real browser at the primary 1280-pixel desktop width and a 1600-pixel wide viewport.

The initial M3 browser review found weak hierarchy, oversized nested cards, redundant headings, cramped forms and actions, and task rows that did not adapt to their content width. The owner selected CSS Modules, asked for common React Aria practices, prohibited horizontal task-row scrolling, and required browser-driven functional correction across representative desktop widths. CIB Seven and Camunda 8 may inform grouping and workflow, but the product must not copy their appearance or technology stack.

The project-specific result should improve on the references where possible: one coherent shell, full-content task work, container-responsive collections, honest retry and indeterminate states, accessible custom styling, and a diagram surface that explains both source-owned and generated presentation provenance.

## Design intent

The UI is a professional operational work surface: calm, dense enough for real work, clear under failure, and usable without learning internal architecture. Visual hierarchy comes from typography, spacing, alignment, borders, and state, not from repeated oversized cards, decorative gradients, or excessive all-caps labels.

The visual language is project-owned. The [pattern-first UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) and [information architecture specification](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) inform functional grouping, while React Aria supplies accessible behavior and state attributes. None of these sources dictates this product's appearance.

## Content-first presentation

Choose the reading task before the component. For each new or changed surface, state the question the user is trying to answer, the few facts needed to answer it, the next useful action, and which supporting information needs sustained reading. An API record is an input to this decision, never a screen design. Existing components and passing accessibility or overflow checks do not establish that a presentation is suitable.

| Content and user need | Presentation |
|---|---|
| Short, comparable facts for scanning several records | A compact summary table, with labelled cards when the container becomes narrow |
| Record-specific explanations, structured metadata or long values | A full-width reading area beneath the selected summary, or a dedicated detail view |
| Extended reading or multi-step work | A dedicated view with a clear return path |
| Machine payload needed for diagnosis | A secondary, explicitly labelled raw-record disclosure after the readable explanation |

Do not place paragraphs, nested records, forms or raw JSON in narrow table columns. A disclosure button does not make its content suitable for a cell. Preserve visible summary context and group supporting facts by meaning; do not promote every API field to an equally prominent column. Use real-length content and expanded states when judging the design. Wrapping content until it fits is not evidence that it is readable.

For Action history, the first question is “What happened, who did it, and what was the outcome?” Action, outcome, person, time and process navigation answer that question. Exact task, occurrence and recording identifiers are supporting details; raw event JSON is a further diagnostic level. This hierarchy must remain clear at both supported widths.

## Source-grounded design preflight

Before production code for a material Product 2 UI/UX surface, inspect the analogous CIB Seven behavior first when it exists, using current documentation and the pristine pinned source checkout recorded in [SOURCES.md](SOURCES.md). Inspect at least one other established solution when it fills a CIB Seven gap or supplies a useful independent comparison. The owning research and product contract record the observed reference behavior, what this project will adopt, where it will deliberately deviate, and what it will exclude, plus the public engine or platform fact and acceptance oracle that support each decision. If no comparable product surface exists, record that absence instead of inventing a precedent. Do not copy source code, styling, assets, private data models, or product terminology.

The preflight precedes red/green production work. Tests then lock the selected project behavior and at least one realistic reference-shaped alternative that would be wrong for this contract. Desktop geometry and interaction evidence remain the blocking closure oracle; an optional manually invoked screenshot may aid human review but does not replace the preflight or become a release gate.

## Technology and ownership

React Aria Components owns accessible interaction behavior for controls. TanStack Query owns bounded HTTP state, and TanStack Table may own collection row modeling. `platform/ui-kit/` owns shared interaction components, one root-token and document-reset sheet, and co-located CSS Modules for every styled component. `platform/apps/web/` owns workspace composition and feature CSS Modules. A feature may place a shared component through its public `className`, but it may not restyle the component's internal structure or interaction state.

The implemented routing extension uses TanStack Router for typed hash locations and a shared application QueryClient for Work reads and the Process metrics definition/version selector. Definitions and Operations retain their bounded feature loaders; no wholesale data-fetch migration is selected. The [information architecture](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md#browser-location-and-state-ownership) owns URL selection, Back/Forward and mutation guards. React Activity retains visited workspace drafts within the browser session; controls and exact operations remain feature-owned. Its [composed acceptance](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md#acceptance) qualifies routing independently of the historical review receipt above.

Global CSS is limited to document defaults, font inheritance, root tokens, and the intentionally global `bpmn-js` viewer surface. Feature selectors, responsive rules, and business-state styling belong in CSS Modules. React Aria data attributes such as `data-hovered`, `data-focused`, `data-pressed`, `data-disabled`, and `data-pending` are selected only beneath the owning module root. No second global component sheet, feature-wide selector, or application override becomes an implicit theme layer.

## Visual foundations

The visual foundation is the following exact token contract. Token names are stable CSS custom properties; values change only through this owner rather than through local near-matches.

| Token | Exact value | Use |
|---|---:|---|
| `--ui-color-canvas` | `#f4f7f6` | Page and shell canvas |
| `--ui-color-surface` | `#ffffff` | Primary working surface |
| `--ui-color-inset` | `#f7faf9` | Rows, grouped fields, and other inset surfaces |
| `--ui-color-text` | `#17211f` | Primary text |
| `--ui-color-muted` | `#52645f` | Secondary text |
| `--ui-color-border` | `#c8d6d1` | Ordinary borders and dividers |
| `--ui-color-accent` | `#0f6b5c` | Primary action and selected state |
| `--ui-color-accent-hover` | `#0b584d` | Hovered or pressed primary action |
| `--ui-color-accent-soft` | `#e6f2ef` | Selected navigation and contextual accent surface |
| `--ui-color-focus` | `#1769aa` | Visible focus ring |
| `--ui-color-error` / `--ui-color-error-surface` | `#982b22` / `#fdecea` | Error text and surface |
| `--ui-color-warning` / `--ui-color-warning-surface` | `#775400` / `#fff5d6` | Warning or indeterminate text and surface |
| `--ui-color-success` / `--ui-color-success-surface` | `#176b45` / `#e8f5ed` | Success text and surface |
| `--ui-font-family` | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Product text; system fallback is authoritative when Inter is unavailable |
| `--ui-font-page` | `700 1.75rem/1.2 var(--ui-font-family)` | One workspace title |
| `--ui-font-section` | `700 1.25rem/1.3 var(--ui-font-family)` | Collection or selected-object heading |
| `--ui-font-body` | `400 0.9375rem/1.5 var(--ui-font-family)` | Body text |
| `--ui-font-label` | `650 0.8125rem/1.3 var(--ui-font-family)` | Control and responsive-cell labels |
| `--ui-space-1` through `--ui-space-7` | `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px` | Closed spacing scale |
| `--ui-radius-control` / `--ui-radius-surface` / `--ui-radius-pill` | `6px` / `10px` / `999px` | Controls, working surfaces, short badges |
| `--ui-border` | `1px solid var(--ui-color-border)` | Ordinary boundary |
| `--ui-shadow-surface` | `0 8px 24px rgb(23 33 31 / 8%)` | At most one primary floating or working surface |
| `--ui-focus-ring` | `0 0 0 3px rgb(23 105 170 / 32%)` | Focus-visible affordance with a solid `2px` focus outline |

The surface hierarchy is closed. The canvas has no border or shadow. One primary working surface may use `--ui-color-surface`, `--ui-border`, `--ui-radius-surface`, and `--ui-shadow-surface`. An inset or row uses `--ui-color-inset` plus a border or divider and never repeats the shadow. Controls use the surface color, control radius, and border. Status surfaces pair their semantic text and background tokens with an icon or explicit status word, so color is never the only discriminator. Decorative gradients are excluded from operational workspaces.

One page heading identifies the workspace; one section heading identifies the collection or selected object. Eyebrows are reserved for a material object class or status and are not repeated as decoration. Long Process, task, source, actor, and group identities use `overflow-wrap: anywhere` while action labels remain whole. Closely related labels and values use spaces 1 through 4; separate functional groups use spaces 5 through 7. Empty height is not added merely to make a panel look substantial.

## Components and patterns

Primary actions use a filled accent button. Secondary navigation and low-risk contextual actions use plain or outlined controls. Destructive actions require a distinct semantic treatment when introduced; release is not destructive and remains an ordinary task action.

Buttons use their natural content width in every layout, including responsive table cards, grids and vertical flex containers. The owner prohibits stretched full-width buttons: do not introduce `width: 100%`, flex growth, full-row flex basis or cross-axis stretching for buttons. The shared Button owns intrinsic sizing and start alignment; feature layouts wrap or stack compact actions without widening them. Navigation links may occupy their navigation rail, but action buttons do not. Preserve a minimum 44-pixel action height. Check narrow containers inside desktop viewports, including empty states and structured-form actions. Group explanatory text and its next action with a layout gap of at least `--ui-space-4` (16px), rather than relying on incidental paragraph margins.

The upper-left brand links to the initial Work inbox, with a visible hover and keyboard focus state and an accessible home label. It uses the same router and pending-action safeguards as other navigation.

**Explicit controls throughout the product:** use visibly styled, verb-labelled buttons for actions, links for navigation, and plain text for names and descriptions. A title, row, card or colored area is not an action control. Never make an essential action depend on clicking an unmarked surface or discovering hover behavior. A button role alone does not establish a visual affordance: action controls need persistent button styling and a visible focus state. Keep the object name separate from the verb; Edit task opens work, while Approve or Complete submits a decision. Standard tabs, disclosures and form controls retain their native interaction patterns. Apply this rule to new and changed surfaces, and verify the visible label, styling and keyboard behavior in their journey tests.

**Label values in every layout:** when a table becomes cards, retain a visible label for every value through the shared DataTable responsive pattern. Lead with the human-readable process name when an exact catalog match is available. Keep instance identity and definition version labelled; put file fingerprints and execution profiles in an inline Technical details disclosure with labelled fields. Never turn a row into an unexplained stack of identifiers by hiding its headers.

Design complete journeys before arranging controls: identify the user's objective, current object, primary action, visible outcome and next action using the [evaluation journeys](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md#evaluation-journeys). Inspection tabs cannot be the sole discovery path for a primary action. Definitions places its start form above the diagram on one page, with no tab bar or repeated Start shortcut banner; preparation focuses that exact version's starting details. Triggers is one collapsed section below the diagram, preserving its forms when hidden. Process metrics belongs in Operations with a contextual Definitions link, because navigation follows the user's operational question rather than the aggregate's data owner. After creation, What happens next leads human-work users to the task inbox; guided demonstrations automatically open the exact confirmed instance, show its published progress or terminal result, and offer View execution history. Definitions and instance details link back to the exact source/profile-matched Process description. Task names remain text, with a filled Edit task button and secondary Release control in the row's Action group. Opening a form must never look like submitting its business decision.

User-facing evaluation defaults to processes a person can perform. Prepare and foreground only examples with an evidenced Work journey; their human tasks must wait for the user. Automated test participants belong to an explicit isolated host, not a UI mode switch or the normal prepared catalog. Describe automation as a test script acting on a normal BPMN model, never as a different execution meaning of that model. The [RC walkthrough](BPM-PLATFORM-BROWSER-WALKTHROUGH.md#rc-process-showcase-catalog) owns launch details and the exact prepared selection.

Tabs organize related views of one selected object. They must use the React Aria Tabs pattern once the shared component is introduced. Until that extraction, native roles, selected state, focus behavior, and keyboard behavior must remain equivalent. Tabs do not switch between unrelated products.

Task collections use one native table, row, header-cell, and data-cell DOM at every width. Each data cell carries one visible responsive label in card mode; desktop headers are visually hidden only after those labels become visible. A collection-container query reflows the same row into a labeled card before controls or content need horizontal overflow. Table and card presentations never duplicate task content or actions, and the task collection never uses `overflow-x: auto`, an inner horizontal scrollbar, clipped cells, or a second viewport-specific DOM.

Forms give each field a visible label, an explicit semantic type, compatible current value, validation state, and nearby completion action. Boolean is an explicit true-or-false choice rather than an unchecked checkbox whose absence could be confused with false. An incompatible value displays a blocking explanation and no editable control.

The [failed-Process inspection contract](BPM-PLATFORM-FAILED-PROCESS-SPEC.md#source-grounded-product-decision) shows exact Compensation failure facts in Operations Overview, including all complete occurrence identities and the null/empty message distinction. It adds no recovery action or Compensation start form; History, export, Operator history, and honest Diagram availability retain their independent boundaries.

Use **Action history** instead of **Platform action record**, with the explanation **Who performed which actions, and their recorded outcomes.** Keep recorded task and incident actions separate from engine execution History and from claims about whether an incident is still current. Operations Action history foregrounds readable action, outcome, person and recorded time, with a visibly styled View process link for each hosting instance. Exact event and occurrence fields belong in the full-width details area beneath the summary, with labelled facts before a secondary raw-record disclosure. Explain self-only task visibility, independent recording order and partial source unavailability; an unsuccessful read must never look like an empty history. Keep task and incident paging independent under shared activity-type and process-instance filters.

A user-visible mutation is actionable only when its current public prerequisite is true. An unclaimed Work task remains visible with its explicit Claim action but exposes no completion entry point or editable completion form. Navigation does not silently claim a task. When a server returns a valid definite refusal, the UI reports the refusal and refreshes current state; exact-operation retry language is reserved for transport, malformed-response, or explicit indeterminate outcomes where delivery or commitment is genuinely uncertain.

Diagrams receive a stable minimum working height and use the full content width. Loading, generated-layout provenance, rendering failure, and missing presentation are visible states. Viewer attribution stays visible and unmodified.

The About capability overview groups entries by the canonical Family value, using one native table per expanded family at desktop widths, with one row per exact executable BPMN element variant. Status is always written as text; CIB evidence is never encoded only by color. Long restrictions wrap inside their cells, and the table reflows through its owning CSS Module without horizontal page overflow. A short summary precedes the table, but summary counts never become a combined BPMN/CIB/platform percentage.

When responsive tables become block layouts, their captions also become full-width blocks rather than retaining shrinkwrapped table-caption boxes. Desktop tables retain native caption layout. At the supported widths the About capability caption spans at least 90% of its table and fits within two text lines. **Implementation checkpoints** and **Executable BPMN elements and variants** are independently collapsible sections. The former groups all seven historical checkpoint cards; the latter contains the current capability families, each initially collapsed with its entry count and an independent Show/Hide control. Expand all families and Collapse all families operate only on those family groups, preserving the outer section and historical checkpoints. Cards retain their titles, evidence, product surface and remaining limits without individual Show/Hide controls. Collapse meaningful groups rather than replacing each card with an extra interaction. Operational headings use **Process instances** and **Process diagram**; technical identity is explicitly labelled **BPMN process ID**. The catalog's **Show additional models** checkbox changes visibility only, and its entry button is spaced apart from definition controls.

## Disclosures and dialogs

Choose the interaction by the user's task, not by the available screen space:

| Need | Pattern | Required behavior |
|---|---|---|
| Optional explanation, source, start data or exact History values | Shared `InlineDisclosure` | An outlined Show/Hide button, expansion state announced through `aria-expanded`, content in normal document flow, and keyboard activation without moving focus away from the trigger |
| A bounded form or decision that temporarily needs attention | Shared `ModalDialog` | A descriptive title, centered bounded surface, dimmed backdrop, inactive background, contained keyboard focus and visible Cancel/Close action |
| A long or multi-step activity | Dedicated workspace/detail view | Stable navigation, sufficient content area and an explicit return path; do not squeeze it into an overlay |

Inline disclosures push following content down. They never float over unrelated controls, hide essential actions or require outside-click dismissal. The same visible button both expands and collapses the content; its label changes from Show to Hide. Toggling preserves the reading position and focus on that button, including when expansion updates a deep-link URL; disable the router's page-top scroll reset for these in-page updates. Browser acceptance checks both expansion and collapse after scrolling to the control, allowing only the browser's necessary scroll clamping when the document shrinks. Expanded code and identifiers wrap within the panel. Supplementary content may be collapsed initially; errors, prerequisites and the next primary action must remain visible without expansion.

Record details use the shared DataTable `rowDetails` pattern: the button belongs in the summary, while the content occupies a separate row spanning the collection width. Responsive cards keep that reading area below all summary fields. Keep summary values top-aligned and labels adjacent to their values; expanding details must not stretch the summary. Show labelled facts before an optional raw record. Collapsing removes the reading area and returns the original compact geometry while keeping focus on the trigger.

For large inventories, collapse meaningful groups rather than individual entries. Keep the group name and item count visible; provide Expand all and Collapse all when users need both a compact overview and full comparison. The controls retain keyboard focus, and collapsed descendants leave no empty decorative boxes. Inventory expansion is feature-owned local state, not URL or server state. The Definitions Triggers section is an explicit deep-link target and retains its existing `tab=triggers` URL representation.

Collapsed disclosures leave only their trigger visible: no empty border, background, padding or reserved content height. Keep decorative spacing and borders on an inner content wrapper, not on the React Aria `DisclosurePanel` that owns hiding. Browser acceptance compares the collapsed disclosure's height with its trigger before opening and after closing, as well as checking hidden content and keyboard behavior.

Modals open with focus on the first useful field or safe decision. Cancel/Close, Escape and backdrop dismissal restore focus to the opener. During an in-flight command, dismissal may be disabled only with an adjacent explanation; closing must never imply that a submitted operation was cancelled. Keep errors and entered values in the dialog after failure, and close after confirmed successful completion. Prevent duplicate submission. Use the shared React Aria components rather than imitating a modal with absolute positioning, elevated z-index or a styled disclosure summary.

The 2026-09-27 application audit covers all five former disclosure sites. Add BPMN definition uses a modal; showcase explanation, exact source/profile, showcase start data and exact History stimulus values use inline Show/Hide controls. Incident cancellation shares the modal foundation and retains its safe initial focus. Browser acceptance must distinguish these patterns: test backdrop/dismissal/focus for a modal, normal-flow expansion and collapse for inline information, plus errors, pending commands and both supported viewport widths.

## Responsive behavior

Responsive behavior is content-driven. The shell uses viewport breakpoints because it owns the viewport. A table, toolbar, form, or diagram uses a container query when its available width depends on surrounding composition.

At 1600 px the UI should support efficient scanning without stretching text across the entire screen. At 1280 px, navigation remains usable while collections reflow before controls wrap awkwardly. Narrower viewports may benefit from the same content-driven CSS, but they are not an MVP acceptance target and add no dedicated browser-test obligation.

Responsive adaptation prefers this order:

1. allow text to wrap at semantic boundaries;
2. reduce nonessential whitespace;
3. reflow columns into labeled groups;
4. stack related controls;
5. only then collapse a secondary control into a disclosure.

Clipping, character-by-character wrapping, hidden actions, and horizontal page or task-row scrolling are defects.

## Interaction and accessibility

Every interactive control has an accessible name and visible focus indication. Hover is an enhancement, never the sole disclosure of an action. Pending controls remain announced and prevent duplicate mutation. Disabled state must be distinguishable without relying only on opacity.

Error, warning, indeterminate, empty, and success states use semantic text plus role or live-region behavior appropriate to their urgency. The task detail remains open through transport failure, indeterminate completion, and semantic rejection so the user can understand or retry the same operation.

Native semantics are preferred. A visual card remains a table row where comparison is the primary task; a navigation control remains navigation; and tabs are not simulated by unrelated buttons without the complete tab contract.

Selecting a task transfers focus to the selected task heading after detail content is ready. Back returns focus to the exact task-selection control when it still exists, otherwise to the collection heading. A committed completion returns focus to the refreshed collection heading. Rejected, transport-failed, and indeterminate completion keep focus in the detail and move it to the explicit status or retry control without losing the retained operation. Definition selection keeps focus on the selector. Arrow-key tab changes keep focus on the selected tab and associate it with the visible panel. A diagram import failure moves no focus automatically but exposes an alert adjacent to the diagram heading.

Under `prefers-reduced-motion: reduce`, nonessential transitions, smooth scrolling, loading animation, and diagram viewport animation are disabled. State changes remain immediate and perceivable through text and focus. Loading, error, empty, pending, indeterminate, incompatible-value, source-DI diagram, generated-DI diagram, unavailable diagram, and rendering-failure fixtures are deterministic acceptance inputs rather than manually improvised states.

## Visual review protocol

The authoritative automated UI-quality lane belongs to Product 2 and is separate from `verify.sh`, Lean, semantic-core, BPMN-source semantic admission, CIB, differential, Temporal refinement, platform-backend, and showcase-compatibility loops. It is path-filtered to `platform/ui-kit/`, `platform/apps/web/`, their public UI-facing contracts, the fixed-fixture browser showcase, and its own workflow/configuration. Real-host browser showcases have their own type-compatibility and release-acceptance lanes. The UI lane also runs explicitly for M3 release acceptance and by manual dispatch. A semantic-only change does not install Chromium, build the web application, start the M3 host, or execute a screenshot comparison.

The UI-quality lane serves a production-built web bundle with Vite preview and fixed closed API-boundary fixtures independent of Temporal. Two pinned Chromium projects use `1280x900` and `1600x900` viewports. Both assert `scrollWidth <= clientWidth` for the document, workspace content, task collection wrapper, every row or card, selected form, and diagram surface; every primary action's bounding box remains inside its owning surface. Fixtures include multiple task states and deliberately long task, Process, actor, group, and occurrence identities. Role/name, Tab and arrow-key behavior, focus transfer and fallback, retained completion context, and actual computed reduced-motion behavior are executable assertions. The same functional command is required locally before push and in GitHub Actions.

Fixed fixtures must include the false side of every user-visible mutation precondition and at least one definite stale-precondition refusal. The About fixture additionally proves build-version visibility, the complete capability row set, explicit restriction and CIB-relation text, keyboard focus transfer, and no overflow at both desktop widths. Release acceptance additionally runs production-backed headless-Chromium user journeys from model selection or deployment through start, ordered interaction, terminal or resumption status, and applicable public history or audit. The journey complements the fixtures: fixtures separate failure classes deterministically, while the real journey proves that the product users are offered actually composes through its public boundaries.

One optional `toHaveScreenshot` assertion covers the wide Process-execution Diagram as a manual human-review aid. It runs only when explicitly requested in the digest-pinned Linux Playwright environment, waits for fonts and completed diagram rendering, disables animation and carets, and has no blocking CI or release role. Ordinary local and GitHub functional commands do not compare pixels or update the retained image. Manual regeneration uploads one candidate without changing the repository, and a human reviews it before any baseline commit.

Review expanded content, not only the collapsed overview. Record-detail browser checks require the reading area to span at least 90% of its collection, sit below the summary without increasing its height, and disappear on keyboard collapse with focus retained. Cover task actions, incident actions and Process instances at both supported desktop widths. Inspect the expanded screenshots with realistic identifiers and raw records; a no-overflow assertion alone cannot detect an unreadable narrow column.

Automated measurements prove geometry, interaction, and state rather than subjective polish. Human browser review remains appropriate for material design changes, while the optional screenshot is a convenience rather than a regression contract. `@axe-core/playwright` is not selected: it would require its own pinned dependency and licence review and could only add an audit, never replace keyboard, focus, role, name, and state behavior tests.

## Exclusions

This specification does not select a themed component framework, utility-CSS framework, CSS-in-JS runtime, generalized form library, chart library, virtualization, SSR, persistent draft store or design-token build system. The 2026-09-27 routing adoption supersedes only the former router exclusion. It does not copy CIB Seven styling or require parallel viewport-specific DOM trees when responsive CSS can preserve one accessible structure.

## References

- [React Aria getting started](https://react-spectrum.adobe.com/react-aria/getting-started.html) documents custom styling, class names, and interaction-state data attributes.
- [React Spectrum layout guidance](https://react-spectrum.adobe.com/v3/layout.html) provides established responsive Grid and Flex principles without becoming a project dependency.
- [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) owns the product comparison and pattern evidence.
- [BPM platform information architecture specification](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) owns workspace and flow decisions.
- [Architecture](ARCHITECTURE.md#user-interface) owns the selected packages and package boundaries.
