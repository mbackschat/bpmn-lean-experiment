# BPM platform UI design specification

## Status

**Implemented, independently closure-reviewed, and maintained.** The M3 shell, shared UI kit, feature CSS Modules, responsive collection, complete declared-state fixtures, real-host showcases, and deterministic four-width browser evidence implement this visual and interaction contract. It changes no BPMN meaning, engine contract, or platform authorization rule and is classified non-material under the [independent cold-review negative case](TESTING-SPEC.md#independent-cold-review-gate).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `1f617ef` | `fork-turns-none` | `approve-with-required-edits` | `c3f6671` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `45c4bfc` | `fork-turns-none` | `approve-with-required-edits` | `afc4b63` |

The context-cold proposal reviewer completed two warm correction rounds and approved `c3f6671`. A separate context-cold closure reviewer required four bounded corrections at `45c4bfc`; two warm audits approved the final correction target `afc4b63`.

## Owner motivation and product vision

The owner expects M3 to establish the visual and interaction foundation for the BPM platform, not merely make the current showcase pass. The product should look deliberate and professional at first contact, remain efficient for sustained work, and be reviewable in a real browser at 1600, 1280, 1024, and 768 CSS pixels.

The initial M3 browser review found weak hierarchy, oversized nested cards, redundant headings, cramped forms and actions, and task rows that did not adapt to their content width. The owner selected CSS Modules, asked for common React Aria practices, prohibited horizontal task-row scrolling, and required screenshot-driven correction across browser widths. CIB Seven and Camunda 8 may inform grouping and workflow, but the product must not copy their appearance or technology stack.

The project-specific result should improve on the references where possible: one coherent shell, full-content task work, container-responsive collections, honest retry and indeterminate states, accessible custom styling, and a diagram surface that explains both source-owned and generated presentation provenance.

## Design intent

The UI is a professional operational work surface: calm, dense enough for real work, clear under failure, and usable without learning internal architecture. Visual hierarchy comes from typography, spacing, alignment, borders, and state, not from repeated oversized cards, decorative gradients, or excessive all-caps labels.

The visual language is project-owned. The [pattern-first UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) and [information architecture specification](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) inform functional grouping, while React Aria supplies accessible behavior and state attributes. None of these sources dictates this product's appearance.

## Technology and ownership

React Aria Components owns accessible interaction behavior for controls. TanStack Query owns bounded HTTP state, and TanStack Table may own collection row modeling. `platform/ui-kit/` owns shared interaction components, one root-token and document-reset sheet, and co-located CSS Modules for every styled component. `platform/apps/web/` owns workspace composition and feature CSS Modules. A feature may place a shared component through its public `className`, but it may not restyle the component's internal structure or interaction state.

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

Tabs organize related views of one selected object. They must use the React Aria Tabs pattern once the shared component is introduced. Until that extraction, native roles, selected state, focus behavior, and keyboard behavior must remain equivalent. Tabs do not switch between unrelated products.

Task collections use one native table, row, header-cell, and data-cell DOM at every width. Each data cell carries one visible responsive label in card mode; desktop headers are visually hidden only after those labels become visible. A collection-container query reflows the same row into a labeled card before controls or content need horizontal overflow. Desktop and card variants never duplicate task content or actions, and the task collection never uses `overflow-x: auto`, an inner horizontal scrollbar, clipped cells, or a second mobile-only DOM.

Forms give each field a visible label, an explicit semantic type, compatible current value, validation state, and nearby completion action. Boolean is an explicit true-or-false choice rather than an unchecked checkbox whose absence could be confused with false. An incompatible value displays a blocking explanation and no editable control.

Diagrams receive a stable minimum working height and use the full content width. Loading, generated-layout provenance, rendering failure, and missing presentation are visible states. Viewer attribution stays visible and unmodified.

## Responsive behavior

Responsive behavior is content-driven. The shell uses viewport breakpoints because it owns the viewport. A table, toolbar, form, or diagram uses a container query when its available width depends on surrounding composition.

At 1600 px the UI should support efficient scanning without stretching text across the entire screen. At 1280 and 1024 px, navigation remains usable while collections reflow before controls wrap awkwardly. At 768 px, navigation moves above content, actions remain at least 44 CSS pixels in effective target size where practical, task rows become single-column groups, and the page has no horizontal overflow.

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

The authoritative automated UI-quality lane belongs to Product 2 and is separate from `verify.sh`, Lean, semantic-core, BPMN-source semantic admission, CIB, differential, and Temporal refinement loops. It is path-filtered to `platform/ui-kit/`, `platform/apps/web/`, browser showcases, their public UI-facing contracts, and its own workflow/configuration. It also runs explicitly for M3 release acceptance and by manual dispatch. A semantic-only change does not install Chromium, build the web application, start the M3 host, or execute a screenshot comparison.

The UI-quality lane serves a production-built web bundle with Vite preview and fixed closed API-boundary fixtures independent of Temporal. Four pinned Chromium projects use `1600x900`, `1280x900`, `1024x900`, and `768x900` viewports. At every width they assert `scrollWidth <= clientWidth` for the document, workspace content, task collection wrapper, every row or card, selected form, and diagram surface; every primary action's bounding box remains inside its owning surface. Fixtures include multiple task states and deliberately long task, Process, actor, group, and occurrence identities. Role/name, Tab and arrow-key behavior, focus transfer and fallback, retained completion context, and actual computed reduced-motion behavior are executable assertions.

Committed `toHaveScreenshot` baselines cover the collection, selected form, and complete diagram workspace using production CSS. Pixel comparison is authoritative only in the digest-pinned Linux amd64 Playwright 1.62.1 container recorded by the Product 2 UI-quality workflow. The test waits for fonts, intercepted network completion, and diagram import, disables animation and carets, and masks no content. Ordinary CI never updates baselines. Expected, actual, diff, report, and retained trace artifacts are uploaded on failure. Manual baseline regeneration runs only visual tests in the same pinned environment and uploads candidates without changing the repository; every image diff requires human review before commit. macOS may run geometry and interaction checks but does not decide shared pixel baselines.

Automated measurements prove geometry and state, not visual quality. Screenshots are therefore inspected against this token, surface, hierarchy, and responsive contract. `@axe-core/playwright` is not selected: it would require its own pinned dependency and licence review and could only add an audit, never replace keyboard, focus, role, name, and state behavior tests.

## Exclusions

This specification does not select a themed component framework, utility-CSS framework, CSS-in-JS runtime, router, generalized form library, chart library, or design-token build system. It does not copy CIB Seven styling. It does not require desktop and mobile DOM duplication when responsive CSS can preserve one accessible structure.

## References

- [React Aria getting started](https://react-spectrum.adobe.com/react-aria/getting-started.html) documents custom styling, class names, and interaction-state data attributes.
- [React Spectrum layout guidance](https://react-spectrum.adobe.com/v3/layout.html) provides established responsive Grid and Flex principles without becoming a project dependency.
- [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) owns the product comparison and pattern evidence.
- [BPM platform information architecture specification](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) owns workspace and flow decisions.
- [Architecture](ARCHITECTURE.md#user-interface) owns the selected packages and package boundaries.
