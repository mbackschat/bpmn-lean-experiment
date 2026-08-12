# BPM platform UI design proposal

## Status

**Owner-directed draft for independent review.** This proposal selects the platform UI's visual language, component styling, responsive rules, interaction states, and CSS ownership. It remains a proposal until the complete M3 shell and browser evidence implement the selected rules. It changes no BPMN meaning, engine contract, or platform authorization rule and is classified non-material under the [independent cold-review negative case](TESTING-SPEC.md#independent-cold-review-gate).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `1f617ef` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Owner motivation and product vision

The owner expects M3 to establish the visual and interaction foundation for the BPM platform, not merely make the current showcase pass. The product should look deliberate and professional at first contact, remain efficient for sustained work, and be reviewable in a real browser at 1600, 1280, 1024, and 768 CSS pixels.

The initial M3 browser review found weak hierarchy, oversized nested cards, redundant headings, cramped forms and actions, and task rows that did not adapt to their content width. The owner selected CSS Modules, asked for common React Aria practices, prohibited horizontal task-row scrolling, and required screenshot-driven correction across browser widths. CIB Seven and Camunda 8 may inform grouping and workflow, but the product must not copy their appearance or technology stack.

The project-specific result should improve on the references where possible: one coherent shell, full-content task work, container-responsive collections, honest retry and indeterminate states, accessible custom styling, and a diagram surface that explains both source-owned and generated presentation provenance.

## Design intent

The UI is a professional operational work surface: calm, dense enough for real work, clear under failure, and usable without learning internal architecture. Visual hierarchy comes from typography, spacing, alignment, borders, and state, not from repeated oversized cards, decorative gradients, or excessive all-caps labels.

The visual language is project-owned. The [pattern-first UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) and [information architecture proposal](BPM-PLATFORM-INFORMATION-ARCHITECTURE-PROPOSAL.md) inform functional grouping, while React Aria supplies accessible behavior and state attributes. None of these sources dictates this product's appearance.

## Technology and ownership

React Aria Components owns accessible interaction behavior for controls. TanStack Query owns bounded HTTP state, and TanStack Table may own collection row modeling. CSS Modules own feature-local styles. `platform/ui-kit/` owns shared interaction components and visual tokens; `platform/apps/web/` owns workspace composition and feature-specific layout.

Global CSS is limited to document defaults, font inheritance, root tokens, and intentionally global third-party viewer surfaces. Feature selectors, responsive rules, and business-state styling belong in CSS Modules. A component accepts a class name when the feature must place it, while interaction state is styled through React Aria's documented data attributes such as `data-hovered`, `data-focused`, `data-pressed`, `data-disabled`, and `data-pending`.

## Visual foundations

The base palette uses warm-neutral page surfaces, white working surfaces, a restrained teal accent, high-contrast near-black text, and distinct semantic colors for error, warning, and success. Color is never the only status discriminator.

Use a compact radius scale rather than rounding every container:

| Token role | Contract |
|---|---|
| Control | 6 to 8 px |
| Working surface | 8 to 12 px |
| Pill or badge | Fully rounded only for short status content |

Working surfaces use one subtle border and at most one low-contrast shadow. Nested surfaces reduce elevation instead of repeating the same card treatment. Decorative background gradients are excluded from operational workspaces.

Typography uses the system sans-serif stack. One page heading identifies the workspace; one section heading identifies the collection or selected object. Eyebrows are reserved for a material object class or status and are not repeated as decoration. Long Process, task, and source identities wrap at safe boundaries without shrinking action controls.

Spacing uses a consistent 4 px base with ordinary steps of 8, 12, 16, 24, 32, and 48 px. Closely related labels and values use the smaller steps; separate functional groups use the larger steps. Empty height is not added merely to make a panel look substantial.

## Components and patterns

Primary actions use a filled accent button. Secondary navigation and low-risk contextual actions use plain or outlined controls. Destructive actions require a distinct semantic treatment when introduced; release is not destructive and remains an ordinary task action.

Tabs organize related views of one selected object. They must use the React Aria Tabs pattern once the shared component is introduced. Until that extraction, native roles, selected state, focus behavior, and keyboard behavior must remain equivalent. Tabs do not switch between unrelated products.

Task collections use semantic table markup at widths where columns are genuinely scannable. Each responsive cell carries an explicit label so the same semantic row can reflow into a card. Reflow is based on the component's container width, not only on viewport width. The task collection never relies on a horizontal scrollbar.

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

## Visual review protocol

Every material workspace or shared responsive pattern is reviewed at 1600, 1280, 1024, and 768 CSS pixels using production CSS and representative real data. The reviewer checks alignment, hierarchy, text wrapping, action reachability, focus visibility, surface nesting, and both document and component overflow.

Automated measurements prove only geometry and state. Screenshots are still inspected because an interface can fit numerically while remaining crowded, repetitive, or visually unbalanced. A screenshot review produces actionable findings against this specification rather than subjective requests to make the UI more modern.

## Exclusions

This specification does not select a themed component framework, utility-CSS framework, CSS-in-JS runtime, router, generalized form library, chart library, or design-token build system. It does not copy CIB Seven styling. It does not require desktop and mobile DOM duplication when responsive CSS can preserve one accessible structure.

## References

- [React Aria getting started](https://react-spectrum.adobe.com/react-aria/getting-started.html) documents custom styling, class names, and interaction-state data attributes.
- [React Spectrum layout guidance](https://react-spectrum.adobe.com/v3/layout.html) provides established responsive Grid and Flex principles without becoming a project dependency.
- [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) owns the product comparison and pattern evidence.
- [BPM platform information architecture proposal](BPM-PLATFORM-INFORMATION-ARCHITECTURE-PROPOSAL.md) owns workspace and flow decisions.
- [Architecture](ARCHITECTURE.md#user-interface) owns the selected packages and package boundaries.
