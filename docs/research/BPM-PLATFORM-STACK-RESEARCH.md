# BPM platform technology stack research

## Status

**Project-authored research carrying one bounded recommendation. It adopts no dependency.** The [recommendation](#3-recommendation) is a research conclusion; adoption requires owner approval per package and must pass the resolved-graph checks in [the platform's dependency posture](../PROJECT-DESIGN.md#dependency-posture). Owner decisions taken during this research are listed in [Decisions taken](#10-decisions-taken) and remain owned by [PROJECT-DESIGN.md](../PROJECT-DESIGN.md) and [PLAN.md](../PLAN.md), not by this document.

Reviewers can read sections 1 to 3 for the conclusion and sections 4 onward for the evidence behind it.

## 1. The question

The BPM platform needs a tasklist, a task interaction surface, a deployment and definition console, an operations and monitoring view, dashboards, and history and mining views. Every surface is data-dense: tables with sorting, filtering, pagination and selection; forms with validation; modals; toasts; navigation; tabs; status indicators; date and duration inputs.

What technology should build that, given the requirements below?

## 2. Requirements and wishes

Stated by the owner, with dates where a decision was taken during this research. These are the criteria the recommendation is measured against.

| # | Requirement | Source and rationale |
|---|---|---|
| R1 | **MIT-compatible licences only.** No copyleft, no source-available, no commercially gated components. | The platform is MIT and a downstream EUPL-1.2 product builds on it. A reciprocal or gated dependency breaks that. |
| R2 | **Small resolved dependency footprint.** | Stated non-functional requirement, 2026-08-07. The reason is security: every resolved package is attack surface, and a BPM platform is where a user-facing surface, a deployment endpoint, and durable business state meet. |
| R3 | **Adopt maintained third-party work rather than reimplement a solved problem.** The platform implements only what it uniquely can. | Owner direction, 2026-08-07, naming a JUEL evaluator and a BPMN diagram renderer as explicitly out of scope to implement. |
| R4 | **No stack assembled by hand.** | Owner preference: a coherent selection, not a pile of micro-choices. |
| R5 | **No install-time telemetry, no CDN asset dependency, no vendor visual identity.** | Named as showstoppers, 2026-08-07, on discovering all three in IBM Carbon. Visual identity matters because adopters must be able to brand the product as theirs. |
| R6 | **Optimal for any adopter who wants to use the UI as-is**, rather than for one who substitutes their own widget library. | Owner direction, 2026-08-07, when dropping reuse levels 2 and 3. |
| R7 | **Long-living project.** Dependency longevity and maintainer concentration are first-class criteria. | Owner concern, 2026-08-07. |
| R8 | **API-first.** Each surface splits into an API backed by a service, plus a React client. | Owner direction, 2026-08-07. The UI is one client among others, not a privileged consumer. |

## 3. Recommendation

**`react-aria-components` for behavior and accessibility, plus `@tanstack/react-table`, `@tanstack/react-virtual`, and `@tanstack/react-query`, with a platform-owned component kit written over them, `bpmn-js` for diagram rendering, and `node:sqlite` for the read model.**

### Requirement mapping

| # | How the selection satisfies it |
|---|---|
| R1 | Measured across the whole resolved tree: **15 MIT, 8 Apache-2.0, 1 0BSD, zero unknown, zero copyleft or reciprocal.** |
| R2 | **24 resolved packages**, and that figure already includes all three TanStack packages. Against 41 for a Mantine set without TanStack, 64 for a shadcn shape with TanStack, and 84 for Carbon alone. It is the smallest option measured. |
| R3 | **Partially, and this is the one requirement it does not fully satisfy.** Behavior, accessibility, table logic, virtualization, and server-state caching are all adopted. The visual component layer is not: React Aria ships no components, so the kit is ours, roughly 2,000 lines. |
| R4 | One coherent selection covering primitives, table, virtualization, server state, diagram, and storage, rather than a per-widget shopping list. |
| R5 | Verified by measurement, not assurance: **zero install scripts**, the string `telemetry` absent from the entire resolved tree, **no stylesheet shipped at all** so nothing to load or override, no `fetch`, `XMLHttpRequest`, or `sendBeacon` in runtime modules, and **no `@adobe/*` or Spectrum package pulled**. |
| R6 | React is the largest adopter ecosystem and talent pool. Shipping no styles means adopters brand the product without fighting a vendor theme. |
| R7 | **The strongest backing of any candidate.** Adobe staffs seven to eight people on it and ships it in Photoshop on the web and Creative Cloud, so abandonment would break their own flagship products. Commit concentration is 38% on the top contributor, against 97.8% for Mantine. 3.55M weekly downloads. TanStack Table is comparably entrenched at 17.6M weekly and 53 open issues. |
| R8 | Unaffected; the UI is a client of the platform API either way. |

### Rationale

Three findings drove this, and none of them was the first answer.

**No peer product has solved "React plus a brand-neutral third-party kit."** Products with resources built their own component layer; the one that adopted a finished kit adopted an IBM one. So there was no precedent to defer to, and the question required a judgment on the requirements rather than a lookup.

**The requirement that decided it was longevity, R7, and it eliminated the least-work option.** Mantine satisfied every other requirement and was measured healthy at 48 open issues and fifty releases a year, but one person holds 97.8% of its commits and there is no institutional succession. Its failure mode would leave us coupled to an unmaintained styled kit at every call site, where migration means rewriting the UI. React Aria's failure mode is bounded by Adobe's own dependence on it.

**The remaining two candidates cost the same, so the choice reduced to which dependency to bet on for a decade.** Both React Aria and shadcn-over-Radix put roughly 2,000 lines of wrappers in our repository, so that cost stopped being a differentiator. React Aria then wins on backing, an Adobe team against WorkOS's three to five; on accessibility, the best measured; on footprint, 24 packages against 64; and on not imposing Tailwind. Grafana and Sentry, the two most design-mature developer products surveyed, independently chose it.

### Measured basis

Resolved tree for `react-aria-components` plus all three TanStack packages, measured on 2026-08-07 by installing into an empty project on the pinned Node 24.18.0: **24 packages, 15 MIT, 8 Apache-2.0, 1 0BSD, zero copyleft, zero unknown, zero install scripts.**

The per-package adoption record, with exact versions, roles, and removal costs, is owned by [the BPM platform proposal](../BPM-PLATFORM-PROPOSAL.md#approval-record-for-the-selected-four) rather than duplicated here, because that is the document in which adoption is proposed.

### What would change this

A mature, brand-neutral, well-backed styled kit appearing would reopen R3, since writing the component layer is the only requirement this selection compromises. **Blueprint** is the nearest existing candidate and was not selected: Apache-2.0, Palantir-backed at 47% concentration, purpose-built for dense enterprise data, in production at Dagster, but 457K weekly downloads, 959 open issues suggesting slower triage, and a spreadsheet-style table that needs TanStack anyway.

If the owned-component cost proves higher in practice than estimated, **shadcn over Radix** is the fallback: the same architecture with the wrappers pre-written, at the price of Tailwind and a smaller backer.

## 4. Method

Findings were gathered on 2026-08-07 from primary sources: product repositories with their `package.json` and build configuration, the npm registry and its downloads endpoint, published package tarballs, the GitHub API, and official documentation, in preference to blog posts. CIB Seven findings come from the pinned local checkout registered in [SOURCES.md](../SOURCES.md). A12 widget findings come from a shallow clone at external sibling `../oss/a12/a12-widgets`.

Footprint numbers described as measured were obtained by installing into an empty scratch project and counting the entries of the generated lockfile `packages` map, so they are production resolutions of the named direct dependencies and exclude devDependencies. Install-script counts come from the lockfile `hasInstallScript` flag. Licence audits read each resolved package's own manifest rather than the top-level declaration.

Where a fact could not be established from a primary source it is recorded as not determined rather than estimated. Two facts in this document were initially reported wrongly by research lanes and corrected by direct measurement; both corrections are recorded in [section 9](#9-method-findings-for-the-dependency-guard) because they bear on how the dependency guard must work.

## 5. Background: what "headless" means

This term carries several later findings and is worth fixing precisely.

A conventional component library fuses two things of very different value. **Behavior** is keyboard navigation, focus management and trapping, ARIA roles and relationships, typeahead, collision-aware positioning, outside-click and escape handling, and controlled or uncontrolled state. **Appearance** is DOM structure, CSS, colour, spacing, typography, and motion.

Headless means shipping the first and deliberately shipping none of the second. It is a spectrum with three relevant points.

| Kind | Ships | Examples |
|---|---|---|
| Headless **hooks** | Zero DOM, pure state and logic | TanStack Table, TanStack Virtual, Downshift |
| Headless **primitives**, or unstyled components | DOM plus interaction and accessibility, no styles | React Aria Components, Radix, Base UI, Ark UI, Melt |
| **Styled kit** | Everything, including a visual identity | Carbon, MUI, Mantine, Ant Design, Fluent, PatternFly, Blueprint, A12 widgets |

With a styled kit a select is one element and its design is the vendor's. With a headless primitive the consumer writes the element structure and every class while the library still supplies typeahead, arrow keys, focus return, `aria-activedescendant`, and portal positioning that flips near a viewport edge. With a headless hook there is no library DOM at all: TanStack Table returns row models and sort, filter, and pagination state, and the consumer writes the entire table markup.

The industry moved toward headless because accessibility is the part teams most often get wrong and least want to own, it is invisible in a demo, and visual identity is the part every product wants to control. Overriding a styled kit's theme to match a product is a recurring source of friction, and CSS-in-JS runtimes added cost on top. Headless splits along that seam.

### 5.1 Styling is an independent axis

A correction, because conflating these changed a recommendation before it was caught. Headless primitives ship zero CSS, so **the styling method is a free and separate choice**. Tailwind is not a Radix requirement; it enters only because shadcn's copied components are written with Tailwind classes.

Three axes are orthogonal: the **primitive layer**, the **styling method**, and **who writes the component wrappers**. shadcn bundles the last two.

| Styling method with any headless primitive | Extra dependencies | Precedent |
|---|---|---|
| **CSS Modules** | **none**, natively supported by Vite | Dagster, having moved off CSS-in-JS |
| Plain CSS with attribute selectors | **none** | Primitives expose `data-state`, `data-highlighted`, `data-disabled` |
| Tailwind | one plus a build plugin | Prefect v2 and every shadcn consumer |
| vanilla-extract | build plugin | — |
| Emotion or styled-components | runtime | Grafana and Sentry |
| PandaCSS | build | Chakra 3 internally |

The trap this opens is the mirror of the Tailwind objection: removing Tailwind by hand-writing all component CSS maximizes what the platform implements itself, which pushes against R3. Every objection resolved in isolation during this research moved the answer toward more owned code, which is why the recommendation is anchored on the requirement table rather than on the most recent objection.

## 6. Evidence: what comparable products built

### 6.1 Temporal Web UI

Svelte 5.55.7 with SvelteKit 2.57.1, both pinned, and **deliberately not server-rendered**: `svelte.config.js` uses `adapter-static` with `fallback: 'index.html'` and empty prerender entries. The built assets are embedded into the Go binary through `//go:embed all:assets` in `ui/embed.go` and served by Echo in `server/route/ui.go`. The result is one self-contained Go process that also proxies gRPC to the Temporal frontend.

It declares 39 dependencies and 92 devDependencies. Styling is Tailwind CSS 3 with PostCSS. The component library is **in-house**: Holocene, at 346 files with its own Storybook, built on `class-variance-authority` and `tailwind-merge`. No third-party component kit is used. Build tooling is Vite 6, TypeScript 6, and pnpm. The licence is MIT.

Live updating uses **token-based HTTP long-polling** with `waitNewEvent=true`, following `nextPageToken` while pages remain, backing off two seconds on idle timeout and five on network error, and exiting on an abort signal while returning a resume token. There are no WebSockets and no server-sent events anywhere. A separate refresh path applies capped exponential backoff with a 1.2 growth factor and a 300-second ceiling.

### 6.2 Camunda 8

React with **plain Vite and no meta-framework**. Operate runs React 18.3.1 and Tasklist React 19.2.8, both on Vite 8, with react-router 7, MobX 6, and TanStack Query 5. A unified frontend replacing Operate, Tasklist, and Identity is in progress, using React 19, **TanStack Router** with file-based routing, XState, and Zod-validated API contracts; the monorepo documentation states no component lives there yet.

The UI is a **static bundle packaged into a Java webjar**, not a Node process: `operate/client/pom.xml` produces `operate-webjar` and uses `frontend-maven-plugin` to install Node, run `npm ci` and `npm run build`, and copy the output under `META-INF/resources`. Since 8.8 the engine and web applications ship as one deployment, visible as a single `orchestration` StatefulSet in the 8.10 Helm chart where 8.5 had separate templates per component.

BPMN diagrams use the bpmn.io family: `bpmn-js/lib/NavigatedViewer`, the outline feature, `diagram-js-minimap`, and `@bpmn-io/element-template-icon-renderer`. Runtime decoration uses exactly two mechanisms, `canvas.addMarker` and `removeMarker` for CSS classes and `overlays.add()` for React-rendered badges. Tasklist renders forms with `@bpmn-io/form-js-viewer`.

The component library is IBM **Carbon** alongside Camunda's own composite components, with mixed `styled-components` and Sass.

Operate's read model is separate from the engine: Elasticsearch or OpenSearch as the general answer, RDBMS generally available from 8.9, and H2 the default for lightweight installs. Since 8.8 a single Camunda Exporter writes it.

Repository consolidation is traceable through tags: 8.4.0 was Zeebe only, 8.5.0 moved Zeebe under a subdirectory and merged Operate in, and 8.6.0 merged Tasklist, Identity, and Optimize.

**Licence caveat.** Zeebe, Operate, and Tasklist source files are under the **Camunda License 1.0, which is source-available rather than OSI-approved**. Apache-2.0 covers only the Java client, the Spring Boot starter, the exporter API, the protocol modules, and the BPMN model. The switch happened at 8.6.0. Web Modeler is closed source.

### 6.3 CIB Seven

Two webapp generations ship side by side.

The legacy `/camunda` webapp is **AngularJS 1.8.2** with angular-translate, angular-ui-bootstrap, Bootstrap 3, jQuery 3, and RequireJS. Cockpit, Tasklist, Admin, and Welcome each bootstrap their own Angular module. Searching the tree for Vue and React returns nothing. It declares 43 dependencies and 36 devDependencies, and its lockfile resolves to 1086 entries.

The new `/webapp` webclient is a **separate artifact from a separate repository**, `org.cibseven.webapp:cibseven-webclient-web`. The shipped landing page links Tasklist, Cockpit, and Admin to it, so it is the default user-facing surface while the AngularJS apps remain at `/camunda`. Its stack is **Vue 3.5 with vue-router, vuex, vue-i18n, Bootstrap 5, and Vite**.

Both generations are static assets with no Node process at runtime, assembled into a WAR by `frontend-maven-plugin` and re-packed as a webjar for Spring Boot.

Diagrams use the same bpmn.io family, `bpmn-js` 16.5.0 in the legacy apps and 18.14.0 in the webclient, through `NavigatedViewer` and the `overlays` service. The REST layer is JAX-RS with a Jakarta twin and generated OpenAPI; the webclient adds its own Spring Boot backend-for-frontend.

**Cockpit has no separate read model.** It queries the engine's own relational schema directly, building a MyBatis session from the process engine configuration and running plugin queries against `ACT_RU_*` and `ACT_HI_*` inside the engine command context.

Apache-2.0 throughout, with the frontend enforcing a production licence allowlist of 0BSD, Apache-2.0, the BSD family, CC0-1.0, ISC, MIT, WTFPL, and OFL-1.1.

### 6.4 What the three primary analogues share

**None uses a server-side meta-framework.** Temporal runs SvelteKit with its server half switched off, Camunda evaluated the same space and shipped plain Vite, and CIB ships Webpack and Vite bundles. All three serve a static client bundle from a backend process written in another language. The shared reason is the architecture this project also has: a long-running engine process, and a UI that is an authenticated API client with no public content and no rendering to gain. This is evidence about product shape, not framework quality.

Footprint is not the argument against Next.js. Measured, `next react react-dom` resolves to **54 packages**, smaller than its reputation. The arguments are that its value is SSR, React Server Components, incremental static regeneration, routing, and image optimization, none of which this product needs; that it has no first-class answer for the long-running Temporal Worker and projection subscriber that must run regardless, so it does not remove the multi-process problem it appears to solve; and that a single Node process serving an API and a static bundle is a better deployment story for a self-hosted product.

**All three render BPMN with `bpmn-js` and decorate it through the `overlays` API.** No comparable product hand-draws BPMN from diagram interchange.

**A separate read model is required here, and CIB's approach is unavailable.** Cockpit can query engine tables directly because Camunda 7 is itself a relational database. Temporal is not a queryable BPMN store, so this project's situation matches Camunda 8's, where an exporter projects into a separate store. That validates projecting committed transition records rather than merely motivating it.

Temporal's deliberate choice of long-polling over WebSockets or server-sent events is a solved problem worth copying.

### 6.5 Eleven further self-hosted products

| Product | Framework | Component layer | Styling | Grid or table | Product licence |
|---|---|---|---|---|---|
| n8n | Vue 3.5 | In-house, wrapping Element Plus and Reka UI | SCSS | AG Grid Community 34, TanStack Vue Table | Sustainable Use License |
| Apache Airflow 3.x | React 19 | **Third-party direct: Chakra UI 3** | Emotion | TanStack Table and Virtual | Apache-2.0 |
| Kestra | Vue 3.5 | In-house, wrapping Element Plus and Bootstrap 5 | SCSS | Element Plus table | Apache-2.0 |
| Windmill | Svelte 5 | In-repo, over Melt UI | Tailwind 3 | AG Grid Community **and Enterprise** | AGPLv3 and proprietary |
| Prefect | Vue 3.5 and React 19 | v1 in-house; **v2 vendored Radix with CVA, the shadcn pattern** | Tailwind 3 and 4 | TanStack Table and Virtual | Apache-2.0 |
| Dagster | React 18 | In-house, over Blueprint 5 and Radix | CSS Modules | Hand-rolled table plus TanStack Virtual | Apache-2.0 |
| Grafana | React 18.3 | In-house `@grafana/ui`, over **React Aria** and Floating UI | Emotion | Scoped data-grid fork, react-window | **AGPLv3** app, `@grafana/ui` Apache-2.0 |
| Sentry | React 19.2 | In-house, over **React Aria** and Stately | Emotion | TanStack Virtual only | FSL-1.1-Apache-2.0 |
| Argo CD | React 19 | In-house `argo-ui`, over Foundation Sites CSS | SCSS | react-virtualized | Apache-2.0 |
| Argo Workflows | React 18.3 | Same `argo-ui` | SCSS | None | Apache-2.0 |
| Keycloak admin | React 18.3 | **Third-party direct: PatternFly 5** | PatternFly CSS | `@patternfly/react-table` | Apache-2.0 |
| Metabase | React 18 | **In-house, explicitly wrapping Mantine 8** | Emotion and CSS Modules | TanStack Table and Virtual | AGPLv3 plus commercial |

Nine build an in-house component layer and only two consume a third-party kit directly, both qualified: Keycloak's PatternFly is its own parent organization's system, and Airflow's Chakra carried over from its 2.x application.

**That headline count conflates three distinct patterns, and the distinction matters more than the count.**

1. **Headless primitives plus an own wrapper.** Grafana and Sentry over React Aria, Prefect v2 over Radix, Dagster over Radix and Blueprint, Windmill over Melt. Maximum control, most work.
2. **Wrap a styled kit behind an own API.** Metabase wraps Mantine 8, n8n and Kestra wrap Element Plus. Finished components funnelled through a thin layer. Cheapest of the three.
3. **From scratch over utilities.** Temporal, and Holocene's 346 files.

The industry's build-versus-adopt line therefore falls **below the component kit, not above it**.

Inferred rather than measured: older and larger commercial products own a named design system and have migrated styling at least once, while younger or smaller-team products lean on a kit plus a thin wrapper. Styling splits by cohort, Emotion in the older observability products and Tailwind in the newer ones.

On grids, no heavyweight grid appears in most of them. TanStack Table is the most common choice; AG Grid appears twice, with Windmill the only enterprise-tier user.

### 6.6 Why not simply copy Temporal or Camunda 8

Most of both is already being copied: a single-page app with no meta-framework from both, a static bundle served by the main process and HTTP long-polling from Temporal, and React with plain Vite, `bpmn-js` with `overlays`, TanStack Query, and a projected read model from Camunda.

What does not transfer:

**Temporal's Svelte choice forces the component layer.** Holocene exists because the Svelte ecosystem had no enterprise kit. Copying the stack inherits that obligation, against R4. React additionally has roughly an order of magnitude more adopter reach, and only Windmill uses Svelte in the whole survey. Their Go-binary embedding is inapplicable to a Node host.

**Camunda's Carbon choice is the one the owner rejected under R5.** Precisely: two of the three objections are technically mitigable and one is not. Install telemetry is suppressible with `--ignore-scripts`, and the CDN fonts can be self-hosted by overriding the declarations. The IBM visual identity is **not** mitigable, being baked into compiled CSS across 105 hardcoded font declarations with reportedly incomplete prefix support.

**Their read model is heavier than needed.** Camunda reached the same conclusion for smaller deployments, making RDBMS generally available in 8.9 with H2 the default for lightweight installs.

**Their state layer is one they are themselves leaving.** MobX is being replaced by XState and TanStack Router. Their styling is three-way accumulation of Carbon, `styled-components`, and Sass rather than a design.

**A licensing constraint bounds "the same as".** Zeebe, Operate, and Tasklist are under the source-available Camunda License 1.0. Their architecture can be studied and cited, as here; their code cannot be lifted into an MIT product.

**Camunda's next-generation frontend converges with this analysis**: React 19, TanStack Router, Zod-validated API contracts. It differs from this recommendation only in the component library.

The structural observation is that **no product in this space has solved React plus a brand-neutral third-party kit**. Those with resources built their own; the one that adopted a kit adopted an IBM one.

## 7. Evidence: the candidate field

### 7.1 Component libraries compared

Direct dependency counts read from the npm registry. React 19 support read from `peerDependencies`. Licences from the registry field, cross-checked against the repository licence file and, where they disagreed, against the published tarball.

| Library | Licence | Direct deps | Real data table | Styling build requirement | Accessibility | Paid tier |
|---|---|---|---|---|---|---|
| **React Aria Components** | **Apache-2.0** | **7** | Partial: sorting and selection, no filtering or pagination | **None** | **Best measured** | None |
| Mantine 9 | MIT | 5 core, about 11 for a set | No; third-party MIT `mantine-datatable` | Plain CSS import | Good, no formal claim | None found |
| MUI 9 | MIT | 12 | Yes, `@mui/x-data-grid` is MIT | Emotion runtime | Strong | **Pro and Premium** |
| Base UI 1.7 | MIT | 5 | No | Bring your own CSS | Strong | None |
| Ant Design 6 | MIT | **47** | Yes, the fullest free grid | cssinjs runtime | Weakest of the majors | None |
| Chakra 3 | MIT | 7 declared, plus **67 via `@ark-ui/react`** | No; docs point at TanStack | Emotion runtime | Good | Pro blocks |
| shadcn/ui | MIT | Not applicable, source copied in | No; its table is a TanStack guide | **Tailwind** | Inherits Radix | None |
| Radix Primitives | MIT | **55** for the meta-package | **No table at all** | None | Excellent | None |
| Blueprint | Apache-2.0 | 9 | Spreadsheet-style, not a sort/filter grid | Sass | Good | None |
| Fluent UI v9 | MIT | **62** | Partial | Griffel | Strong | None |
| PatternFly 5 | MIT | not determined | `@patternfly/react-table` | PatternFly CSS | Strong | None |
| PrimeReact 11 | **Proprietary, disqualified** | 2 | Yes, but unavailable | CSS theme import | Claimed AA | **The library itself** |
| HeroUI 3 | MIT | 8 plus React Aria and Tailwind 4 peers | Partial | **Tailwind 4** | Inherits React Aria | HeroUI Pro |

Notes the table cannot carry. Mantine 9 dropped React 18 and peers on React 19 only; its `Table` is presentational. `@mui/base` is deprecated on npm with no publishes in a year and its successor has been renamed twice. Chakra's declared seven dependencies understate it substantially. Radix and React Aria are primitive layers, not kits.

### 7.2 Ecosystem weight

Weekly npm downloads, read on 2026-08-07. Included because adopter familiarity is part of R6, and because impressions about popularity proved unreliable.

| Package | Weekly downloads | Used by, within this survey |
|---|---:|---|
| `@radix-ui/react-dialog` | 69,166,341 | Prefect v2, Dagster, all shadcn consumers |
| `@tanstack/react-table` | 17,612,179 | Airflow, Prefect, Metabase, n8n |
| `@mui/material` | 9,946,522 | none |
| `antd` | 3,556,639 | none |
| **`react-aria-components`** | **3,551,602** | **Grafana, Sentry** |
| `@mantine/core` | 2,250,694 | Metabase only |
| `@chakra-ui/react` | 1,726,915 | Airflow |
| `@blueprintjs/core` | 457,477 | Dagster |
| `@fluentui/react-components` | 403,697 | none |
| `@carbon/react` | 149,337 | Camunda 8 |
| `@patternfly/react-core` | 140,037 | Keycloak admin |

**Carbon is one of the least-downloaded options in the set**, fifteen times smaller than Mantine, so "Camunda chose it" is a weaker signal than it appears. **The ecosystem has converged on headless primitives and TanStack Table**, by a wide margin.

**No BPM or workflow product in this survey uses Mantine.** Metabase is the only user and it is business intelligence. Any argument resting on peer validation for Mantine in this category is unsupported.

### 7.3 Maintainer concentration and backing

Read from the GitHub API on 2026-08-07. Contributor headcount proved misleading, because GitHub counts anyone with a merged typo fix, so commit concentration among the top contributors is reported instead. This is the measure R7 turns on.

| Project | Top contributor commits | Next | Top-1 share of top-8 | Stars | Open issues | Backing |
|---|---:|---:|---:|---:|---:|---|
| **Mantine** | 13,784 | 64 | **97.8%** | 31,533 | 48 | None; OpenCollective donations |
| TanStack Table | 1,527 | 531 | 64% | 28,284 | 53 | TanStack, commercially sponsored |
| Blueprint | 1,288 | 497 | 47% | 21,979 | 959 | Palantir |
| Radix Primitives | 518 | 516 | **38%** | 19,143 | 310 | **WorkOS** |
| **React Aria / Spectrum** | 1,809 | 1,076 | **38%** | 15,768 | 598 | **Adobe**, seven to eight staff, shipped in Photoshop web and Creative Cloud |

Mantine's 48 open issues and fifty releases a year are genuine signs of active triage, and it is not an abandoned project. The risk R7 identifies is different: **one person holds 97.8% of the commits and there is no institutional succession.** Radix and React Aria have real teams.

The failure modes differ in kind, which is the decisive point. If a styled kit stalls, the consumer is coupled to it through its API at every call site and migration means rewriting the UI. If a primitive layer stalls, the consumer already owns the component wrappers and only the primitive must be replaced. **Owning the component code converts an abandonment risk into a maintenance cost.**

### 7.4 The measured showstopper audit

R5's three checks, applied by identical method so the numbers are comparable.

| | Resolved packages | Install scripts | CDN assets | Vendor visual identity |
|---|---:|---:|---|---|
| Carbon | 84 | **22**, telemetry POST to IBM | **105 `@font-face` to IBM CDN** | IBM |
| Mantine set, without TanStack | 41 | 0 | 0, no external asset loads | Generic modern |
| shadcn shape, 8 Radix primitives plus TanStack | 64 | 0 | none | None |
| **React Aria plus all three TanStack** | **24** | **0** | **none; no stylesheet ships at all** | **None possible** |

React Aria's audit in detail, since it is the selection: zero install scripts; the string `telemetry` absent from the entire resolved tree; no CSS file anywhere across `react-aria-components`, `@react-aria`, and `@react-stately`, so there is nothing to load and nothing to override; no `fetch`, `XMLHttpRequest`, or `sendBeacon` in runtime modules; and **no `@adobe/*` or Spectrum package pulled transitively**. The only Adobe traces are a documentation URL in a `Calendar` type declaration and browser bug-tracker links in workaround comments, none of which executes.

The distinction that makes this work: `@adobe/react-spectrum` **is** Adobe's branded design system and would carry their identity; `react-aria-components` is the behavior layer beneath it, published separately and unstyled by design.

**Applying R5's identity criterion consistently eliminates more than Carbon.** The same objection applies to MUI, which reads as Google, Ant Design as Alibaba, Fluent as Microsoft, and PatternFly as Red Hat. What survives as brand-neutral is React Aria, Radix with shadcn, Mantine, Base UI, and arguably Blueprint, whose aesthetic is utilitarian rather than corporate.

One installation detail: installing the `radix-ui` meta-package rather than the primitives actually used costs **90 packages instead of 64**.

### 7.5 TanStack is a family, not a table library

| Piece | Relevance | Peer evidence |
|---|---|---|
| **TanStack Table** v9, MIT, 2 deps | Headless table logic | Airflow, Prefect v2, Metabase, n8n |
| **TanStack Virtual**, MIT | Row virtualization, which Table omits | Airflow, Prefect v2, Dagster, Metabase |
| **TanStack Query**, MIT | Server-state caching and refetch intervals, which is the operations-console polling problem | **Camunda 8 Operate and Tasklist** |
| TanStack Router | Type-safe file-based routing | **Camunda's new unified frontend** |
| TanStack Form | Newer, less proven | none observed |
| TanStack Start | A meta-framework, ruled out by 6.4 | none |

**Table plus Virtual dissolves the grid licensing problem entirely**: MIT, no row cap, no licence key, no gated features, and the most common choice across the peer set. The cost is that no DOM or CSS ships.

### 7.6 What shadcn/ui precisely is

Radix is the headless dependency, versioned normally. **shadcn/ui is not a library**: it is a CLI plus a catalogue of pre-written Radix wrappers styled with Tailwind, copied into the consuming repository. It is pattern 1 of 6.5 with the wrapper already written.

The ownership split: Radix stays a versioned dependency where behavior, accessibility, and security fixes land, while the copied wrapper files, roughly 30 to 80 lines each and about 40 files for a console, become the consumer's own source. In this repository they would fall under the source-hygiene guards, line limits, review process, and publication statistics, on the order of 2,000 lines. The headline objection of no semver channel is weaker than it sounds, because the primitives underneath do have one and the copied layer is mostly composition and styling.

Prefect v2 is the peer precedent.

### 7.7 Data grids and their licensing

**Permissive and safe**, all verified MIT: AG Grid Community with `ag-grid-react`, the free `@mui/x-data-grid`, TanStack Table and Virtual, Glide Data Grid, SlickGrid, Tabulator, RevoGrid, Material React Table, Mantine React Table.

**Disqualifying**: AG Grid Enterprise, MUI X Pro and Premium, Handsontable, Syncfusion, DevExtreme, KendoReact, PrimeReact from v11.

**AG Grid.** `ag-grid-community` declares MIT with the plain MIT text. `ag-grid-enterprise` declares `Commercial` under a per-developer licence, and unlicensed use displays a watermark and console error. Enterprise gates set, multi, and advanced filters, row grouping, aggregation, pivoting, tree data, master-detail, range selection with fill handle, Excel export, clipboard operations, tool panels, context menu, status bar, sparklines, integrated charts, and the advanced server-side row model. Community retains row virtualization, sorting, filtering, editing, pinning, and CSV export.

**MUI X has two free-tier ceilings that are easy to get backwards.** Row virtualization is a Pro feature and the free grid is **limited to 100 rendered rows**, while column virtualization is free; free pagination is likewise limited to pages of up to 100 rows. Pro adds column and row pinning, master-detail, tree data, and lazy loading; Premium adds row grouping, aggregation, pivoting, Excel export, clipboard paste, and range selection. Unlicensed use shows a watermark in production as well as development.

**The free tiers differ sharply on scale**: AG Grid Community virtualizes rows without limit while the free MUI X grid caps at roughly 100 rendered rows. For a console listing process instances that difference is decisive.

**Handsontable** is dual-licensed and not MIT; its free tier is non-commercial with a non-compete clause and requires a runtime licence key. Its `HyperFormula` companion is GPL-3.0-only or paid proprietary.

**Glide Data Grid** is MIT and canvas-based with very large row support, but has self-declared weak accessibility, cells drawn to canvas rather than composed from React, five manual peers, React 19 only in an alpha, and roughly six months of quiet.

`devextreme-react` declares MIT while the required `devextreme` core does not, a specific trap for scanners reading only the top-level package.

**What staying permissive gives up.** The largest loss is a server-side row model with server-side grouping, pivoting, and tree data, which nothing MIT replicates. Also lost: client-side grouping, aggregation, and pivot interfaces; Excel-style set filters; range selection, fill handle, and clipboard paste; styled `.xlsx` export, though CSV is free in both vendors; master-detail and tree data; AG Grid's tool-panel and context-menu chrome; and integrated charting.

**One legal caveat is recorded rather than resolved.** That MIT-licensed material incorporates cleanly into a downstream EUPL-1.2 product is standard practice and the reasoning is sound, but it is inferred rather than resting on a cited ruling. It warrants counsel confirmation before the downstream product ships.

## 8. A12 widgets and the downstream reuse question

The A12 widget set was inspected because product 3 is A12's own EUPL-1.2 product built on this MIT platform, and the question was whether the platform should be designed so A12 could substitute their widgets. **A12 material is EUPL-1.2 and never enters this repository**; the inspected clone is at external sibling `../oss/a12/a12-widgets`.

`mgm-tp/a12-widgets`, version 39.0.2, revision `f924a85`, dual-licensed **EUPL-1.2 OR commercial**, with that SPDX expression in the licence file, all six workspace manifests, and every source-file header.

It is a **styled component kit with its own visual identity**: four themes, a full token schema, bundled Open Sans and Material Symbols variable fonts, and 256 of 1657 core source files importing `styled-components`. It is **React only, and React 19 is required**; peers are `react ^19.2.6`, `react-dom`, `styled-components ^6.1.18`, `react-dnd`. It is **not Web Components**: searching for `customElement`, `attachShadow`, and `defineCustomElement` returns nothing. Roughly 40 runtime dependencies including `recharts`, Lexical, `framer-motion`, `react-day-picker`, `@tanstack/react-virtual`, `react-virtualized`, and Atlaskit drag-and-drop.

It is **not published to public npm**, being served from mgm's Artifactory. Coverage is complete: `Table`, `TreeTable`, `DataTable`, and `DataTreeTable` with per-column and multi-column sorting, a dedicated filter row, selection, pinning, resizing, virtualization, infinite scroll, and drag-and-drop, plus separate `Pagination`, a full form set including a Lexical rich-text editor, modals, toasts, navigation, status indicators, four date and time pickers, charts, and a model-graph diagram, across 1905 exported symbols. Accessibility is evident through thousands of ARIA attributes and a configured `eslint-plugin-jsx-a11y`, but no WCAG statement exists in the repository. The public repository is a **release-drop mirror** with two `a12-ci` commits; upstream activity is evidenced by a 994-line changelog across ten versions and bimonthly security patch rounds.

A12's reference full-stack template depends on it at runtime and `a12-workflows` references it as a devDependency, so A12's products are already built on it.

**The licensing consequence confirms the product division.** Dual EUPL-1.2 or commercial means neither licence lets A12 widgets enter the MIT platform: EUPL is reciprocal, and a commercial licence would not permit MIT redistribution. The widget set belongs exclusively to product 3.

**The reuse question was posed as three levels.** Level 1 is API-only adoption. Level 2 is reusing the platform's pages while substituting the component layer, requiring React plus a complete platform-owned component boundary. Level 3 is using the platform UI unchanged.

**The owner dropped levels 2 and 3 on 2026-08-07**, choosing instead R6 and R8. A12 adopts at the API.

Three planned pieces of work fall away. The swap-friendly component-boundary discipline is no longer a product requirement, only ordinary hygiene. The objection that Tailwind blocks a component swap loses its force. And React is no longer justified by A12-widget compatibility; it is justified by R6.

## 9. Method findings for the dependency guard

Three findings bear on how [the dependency posture](../PROJECT-DESIGN.md#dependency-posture) must be enforced, and all three argue that the executable check must read the resolved lockfile graph rather than declared metadata.

**A repository licence file and its published artifact can disagree, and the repository is the more visible of the two.** Two independent research lanes reported opposite licences for `primereact@11.1.0`, each having read a real source. The GitHub `master` `LICENSE.md` reads "The MIT License (MIT), Copyright (c) 2016-2025 PrimeTek", while the **published npm tarball ships a "PrimeUI License"** that is commercial, requires an offline-verified licence key, and restricts its free Community tier to organizations under one million US dollars of revenue with fewer than five developers and fewer than ten employees. The npm `license` field corroborates the change, reading `MIT` at 10.9.8 and `SEE LICENSE IN LICENSE.md` at 11.1.0. Version 10.9.8 remains MIT.

**A declared direct dependency count can understate the real footprint by an order of magnitude.** Chakra declares seven and carries 67 more through `@ark-ui/react`; the Radix meta-package costs 90 resolved packages where eight individually chosen primitives cost 64.

**Install scripts are invisible to a package count and were the finding that disqualified Carbon.** Its 22 `postinstall` hooks do not show up in any size or licence measure, so the guard must check them explicitly.

A fourth finding concerns research method rather than the guard: **a GitHub contributor headcount is not a bus-factor measure.** Mantine's roughly 460 contributors and its 97.8% single-contributor commit concentration are both true, and only the second answers R7.

## 10. Decisions taken

Recorded for traceability; the durable owners are [PROJECT-DESIGN.md](../PROJECT-DESIGN.md) and [PLAN.md](../PLAN.md).

1. **No server-side meta-framework.** Next.js, Nuxt, Remix, and TanStack Start are out, on the product-shape evidence of 6.4 rather than on footprint.
2. **IBM Carbon is rejected** under R5, for install-time telemetry, a CDN font dependency, and IBM visual identity.
3. **MUI, Ant Design, Fluent, and PatternFly are rejected** by consistent application of R5's identity criterion.
4. **PrimeReact is rejected** as proprietary from v11.
5. **Mantine is rejected** under R7, for 97.8% single-maintainer commit concentration with no institutional succession.
6. **Reuse levels 2 and 3 are dropped**, in favour of R6 and R8.
7. **React 19** as the UI framework, on R6.
8. **`react-aria-components` plus TanStack Table, Virtual, and Query** as the selection, per [the recommendation](#3-recommendation).

## 11. Remaining open decisions

1. **`bpmn-js`** for diagram rendering. The peer evidence is unanimous across all three primary analogues and the alternative is drawing diagram interchange by hand. Needs its own approval record.
2. **`node:sqlite`** for the read model, verified available without a flag on the pinned Node 24.18.0, exporting `DatabaseSync`, `StatementSync`, `Session`, and `backup`. No approval needed as part of the runtime, but its upstream experimental status should be recorded.
3. **The styling method** for the platform's own component kit, free per 5.1. CSS Modules costs nothing extra under Vite and has the Dagster precedent.
4. **Charting**, if hand-rolled SVG proves insufficient. uPlot is dependency-free.
5. **Long-polling for live views**, on the Temporal pattern of 6.1.
6. **Whether to register `../oss/a12/a12-widgets`** in `external-sources.lock`. Unregistered trees are ignored by the guards, so nothing is broken either way; registering pins the revision behind the finding that justified dropping reuse level 2.
