# Project infographics guide

## Status

Maintained regeneration guide. The rendered images are explanatory publication assets, not semantic authority, implementation-status owners, conformance evidence, or release claims.

## Purpose

This guide records the exact content, visual grammar, source owners, snapshot boundary, and regeneration procedure for the project infographics embedded in the root [README](../README.md). It exists so a later refinement can change a prompt or layout without reconstructing factual input from an old image.

Durable architectural statements must be refreshed from [PROJECT-DESIGN.md](PROJECT-DESIGN.md), the [Semantic Process IL specification](SEMANTIC-PROCESS-IL-SPEC.md), and [TESTING-SPEC.md](TESTING-SPEC.md). Exact current implementation status must be refreshed from the detail maps routed by [`implementation-status-router`](IMPLEMENTATION-MAP.md), and current sequencing from [PLAN.md](PLAN.md). The images do not replace those owners.

## Asset inventory

| Asset | README purpose | Dominant layout | Status treatment | Raster |
|---|---|---|---|---|
| `assets/project-infographics/why-lean-helps.png` | Explain why formal semantics materially improve a production BPMN engine | Vertical transformation flow with an evidence orbit | Durable architecture, commit-stamped | 1024 × 1536 PNG |
| `assets/project-infographics/correctness-stack.png` | Explain how authority, proof, independent implementation, and executable evidence compose | Layered stack with one question per layer | Durable architecture, commit-stamped | 1024 × 1536 PNG |
| `assets/project-infographics/product-2-vision.png` | Show the Product 2 operating journey and which platform capabilities are implemented, bounded, or still ahead | Journey-card catalog with a maturity ribbon | Explicit implementation snapshot | 1024 × 1536 PNG |
| `assets/project-infographics/bpmn-execution-on-temporal.png` | Show the deployed system around one admitted BPMN execution and locate source storage, compilation, the interpreter, semantic state, Temporal durability, Activities, and Product 2 projections | Distributed runtime topology with explicit process and persistence boundaries | Durable architecture, commit-stamped | 1024 × 1536 PNG |

## Initial source snapshot

The first render is grounded in repository commit `a34df385`, dated 2026-08-25. Every image footer must include `Project snapshot • 2026-08-25 • a34df385` so a later reader can distinguish a historical publication asset from live status.

Before regenerating, replace that commit and date with the new clean source snapshot, reopen every source owner named below, and review each copied status mark. Do not change a checkmark from memory or infer it from a nearby layer's evidence.

## Shared art direction

- Original ByteByteGo-inspired information design without ByteByteGo branding, logos, wordmarks, watermarks, mascots, or copied compositions.
- Portrait 2:3 composition with a warm off-white background, generous outer margin, and one dominant diagram occupying at least 70 percent of the canvas. The current built-in generation mode returns 1024 × 1536; do not crop away content to simulate another ratio.
- Heavy dark navy outlines, rounded cards, restrained soft shadows, compact sans-serif typography, and small flat technical icons.
- Mint is the title accent and primary success color. Sky blue denotes source and structure, lavender denotes formal semantics, yellow denotes evidence or caution, coral denotes a boundary or absent claim, and neutral gray denotes planned work.
- Prefer short declarative labels over prose. Keep every relationship directional and write it as source, verb, target.
- Use exact project terminology: `checked BPMN graph`, `Semantic Process IL`, `Lean reference interpreter`, `TypeScript semantic core`, `Temporal adapter`, `published engine contract`, and `Product 2`.
- Do not use a combined support percentage. BPMN requirement coverage, selected CIB compatibility, executable-corpus reach, and Product 2 milestone progress remain separate denominators.
- Do not imply that Lean-to-TypeScript agreement selects BPMN meaning independently. Both are independent transcriptions of one reviewed account.
- Do not imply that Temporal Event History, host retries, a database row, or the platform defines BPMN state.
- Set all infographic text from the exact copy below. Do not let the image model invent features, percentages, metrics, versions, or claims.

## Infographic 1: Why Lean helps build a BPMN engine

### Intent

Show that Lean moves the semantic root from prose into executable definitions, useful laws, and checked counterexamples, while the surrounding evidence connects that formal account to exact BPMN source, independently written production code, durable execution, and the product surface.

### Exact title and subtitle

**Title:** `Why Lean Helps Build a BPMN Engine`

**Subtitle:** `Turn semantic risk into executable definitions, proofs, and counterexamples`

### Main flow copy

1. `Exact BPMN XML` / `Bytes • profile • provenance`
2. Arrow label: `admit`
3. `Checked BPMN Graph` / `Validated structure • element and flow identity`
4. Arrow label: `lower`
5. `Semantic Process IL` / `Typed mechanisms, not a BPMN class mirror`
6. Arrow label: `interpret`
7. `Lean Semantics` / `Declarative relation + executable evaluator`
8. Three chips inside the Lean card: `Prove invariants` / `Check finite facts` / `Refute false rules`
9. Arrow label: `transcribe independently`
10. `TypeScript Semantic Core` / `Pure production evaluator • no I/O`
11. Arrow label: `host without redefining`
12. `Temporal Adapter` / `Durability • retries • replay`
13. Arrow label: `publish`
14. `Engine Contract + Product 2` / `Committed state • content-bound commands`

### Evidence orbit copy

- `BPMN + profile review` / `selects the bounded meaning`
- `CIB probes when selected` / `check classified compatibility`
- `Differential + mutation tests` / `detect meaningful disagreement`
- `Replay + browser journeys` / `check durable and product behavior`

### Bottom boundary copy

`Lean proves selected semantic claims. It does not prove the XML parser, TypeScript, Temporal, databases, networks, or full BPMN conformance.`

### Deciding sources

- [PROJECT-DESIGN.md, Why Lean](PROJECT-DESIGN.md#why-lean)
- [PROJECT-DESIGN.md, Two kinds of independence](PROJECT-DESIGN.md#two-kinds-of-independence)
- [Semantic Process IL decision](SEMANTIC-PROCESS-IL-SPEC.md#decision)
- [Semantic Process IL Lean obligations](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations)
- [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#current-boundary)
- [`implementation-status-owner:ASSURANCE-ADOPTION`](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md#current-boundary)

## Infographic 2: The project's correctness stack

### Intent

Show that no single proof or test establishes whole-system correctness. Each layer answers a distinct question, and the claim is only as broad as the exact profile and evidence boundary shared by the layers that actually ran.

### Exact title and subtitle

**Title:** `The Project's Correctness Stack`

**Subtitle:** `Each layer answers a different correctness question`

### Stack copy, top to bottom

1. `BPMN 2.0.2` / `What must the standard account cover?`
2. `Reviewed Profile + CIB Classification` / `Which bounded meaning and compatibility relationship are selected?`
3. `Checked Source + Lowering` / `Did exact source preserve every required distinction?`
4. `Lean Formal Semantics` / `Do executable definitions satisfy proved laws and checked non-laws?`
5. `Independent TypeScript Core` / `Does production transcribe the reviewed behavior?`
6. `Differential + Mutation Evidence` / `Do independent lanes expose meaningful disagreement?`
7. `Temporal + Product Evidence` / `Does durable execution preserve public outcomes end to end?`

### Side labels

- Beside layers 1 and 2: `AUTHORITY`
- Beside layers 3 and 4: `FORMAL CHECK`
- Beside layers 5 and 6: `INDEPENDENT EXECUTION`
- Beside layer 7: `DURABLE ACCEPTANCE`

### Bottom boundary copy

`No single lane proves the whole system. Every claim stops at its exact profile, environment, observation boundary, and evidence.`

### Deciding sources

- [PROJECT-DESIGN.md, Authority model](PROJECT-DESIGN.md#authority-model)
- [PROJECT-DESIGN.md, Component boundaries](PROJECT-DESIGN.md#component-boundaries)
- [PROJECT-DESIGN.md, Two kinds of independence](PROJECT-DESIGN.md#two-kinds-of-independence)
- [TESTING-SPEC.md, Evidence lanes](TESTING-SPEC.md#evidence-lanes)
- [Semantic Process IL independence](SEMANTIC-PROCESS-IL-SPEC.md#independence)
- [`implementation-status-owner:ASSURANCE-ADOPTION`](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md#implemented)

## Infographic 3: Product 2 vision and progress

### Intent

Show Product 2 as one coherent operator and worker journey over the engine's published contract. Checkmarks describe Product 2 platform evidence only. They do not increase BPMN conformance or selected CIB compatibility.

### Exact title and subtitle

**Title:** `Product 2: BPM Platform Vision & Progress`

**Subtitle:** `A user and operator platform over the published engine contract`

### Legend

- `✓` icon with label `Implemented + evidenced`
- `◐` icon with label `Bounded preview`
- `○` icon with label `Planned / absent`

### Journey-card copy

1. `✓ Model + Version` / `Deploy exact bytes • versions • diagrams • examples`
2. `✓ Start + Discover` / `Direct start • Timer schedules • Message start • search`
3. `✓ Human Work` / `Inbox • claim • typed forms • completion • audit`
4. `✓ Operate` / `Incidents • retry • cancel • authorization`
5. `✓ Understand` / `Committed history • diagram focus • audit export • metrics`
6. `✓ Run Durably` / `Temporal hosting • replay • Worker replacement`
7. `◐ Shared Runtime` / `PostgreSQL • replicated API • recovery workers`
8. `○ Production Operations` / `HA • backup + rollback • capacity • tenant isolation`
9. `○ Enterprise Identity` / `Production IdP • admin • delegation`

### Maturity ribbon copy

`MUE Preview Alpha ✓` → `MUE Preview Beta ◐` → `Release Candidate ○` → `MUE ○`

### Boundary callout copy

`The platform consumes only published engine facts. It never reconstructs BPMN state or occurrence identity.`

### Deciding sources

- [PROJECT-DESIGN.md, Product division](PROJECT-DESIGN.md#product-division)
- [PROJECT-DESIGN.md, MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints)
- [PROJECT-DESIGN.md, What the platform may consume](PROJECT-DESIGN.md#what-the-platform-may-consume)
- [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md#current-boundary)
- [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md#current-boundary)
- [PLAN.md, Current checkpoint](PLAN.md#current-checkpoint)

## Infographic 4: How BPMN executes across Temporal

### Intent

Give architecture reviewers one deployment-level picture that answers where exact BPMN is stored, where it is compiled, where the admitted program and semantic state execute, which process contains the interpreter, what the Temporal service owns, what PostgreSQL owns, and how Product 2 receives committed facts. The visual must not imply that the Temporal service executes Workflow code, that PostgreSQL stores authoritative semantic state, or that Event History, host retries, Activities, or Product 2 define BPMN meaning.

### Exact title and subtitle

**Title:** `How BPMN Executes Across Temporal`

**Subtitle:** `Where source, interpreter, durable state, and projections live`

### Runtime-node copy

1. `Browser` / `React UI • HTTP only`
2. `Product 2 API` / `Node process • modules + engine gateway`
3. `PostgreSQL 18` / `Exact BPMN bytes • metadata • tasks • projections • audit`
4. `Product 2 Recovery Worker` / `Queries committed engine facts • refreshes bounded projections`
5. `Temporal Service` / `Workflow routing • durable timers • Event History • task queues`
6. `BPMN Worker` / `Node process • Workflow + Activity pollers`

### Product 2 API internals

- `Deploy: validate + compile exact BPMN XML`
- `Start: lower to Semantic Process IL`
- `Operate: start • Update • Signal • Query`

### BPMN Worker internals

- Container: `Temporal Workflow sandbox`
- Inside the sandbox: `Semantic Process IL + RuntimeState`
- Inside the sandbox: `Pure TypeScript semantic-core interpreter`
- Inside the sandbox: `applyStimulus → committed observation + explicit effects`
- Sibling inside the Worker: `Activity host` / `Executes selected external effects`

The `BPMN Worker` must visibly contain both the `Temporal Workflow sandbox` and `Activity host`. The pure TypeScript interpreter lives inside the Workflow bundle running in the Worker process. The Temporal service schedules Workflow and Activity tasks but does not run the interpreter.

### Directional relationship copy

1. `Browser` → `HTTP` → `Product 2 API`
2. `Product 2 API` ↔ `store exact source + product facts` ↔ `PostgreSQL 18`
3. `Product 2 API` → `start • Update • Signal • Query` → `Temporal Service`
4. `Temporal Service` ↔ `Workflow + Activity tasks/results` ↔ `BPMN Worker`
5. `Product 2 Recovery Worker` → `Query committed engine facts` → `Temporal Service`
6. `Product 2 Recovery Worker` → `refresh projections` → `PostgreSQL 18`
7. `Temporal Service` → `published committed facts` → `Product 2 API`

The Workflow sandbox computes committed publications and returns them through Workflow task completion. The Temporal service carries their Query or Update results back to the API; the image must show no direct network connection between the BPMN Worker and Product 2 API.

### Bottom boundary copy

`BPMN XML is stored by Product 2. The admitted Semantic Process IL and RuntimeState execute inside the Temporal Workflow bundle on the BPMN Worker. Temporal persists Event History and schedules work. PostgreSQL stores Product 2 artifacts and projections, never semantic authority.`

### Deployment qualification copy

`Evaluation Compose: one Temporal development node with its own temporal-data volume, one PostgreSQL service, one Product 2 API/web process, one Product 2 recovery Worker, and one BPMN Worker.`

`Lean, CIB Seven, Java, research sources, and test harnesses are evidence inputs and stay outside every runtime image.`

### Deciding sources

- [PROJECT-DESIGN.md, Interpreter architecture](PROJECT-DESIGN.md#interpreter-architecture)
- [ARCHITECTURE.md, Temporal adapter subsystem](ARCHITECTURE.md#temporal-adapter-subsystem)
- [ARCHITECTURE.md, Applications](ARCHITECTURE.md#applications)
- [Evaluation Compose topology](../compose.yaml)
- [Evaluation runtime images](../Dockerfile)
- [Product 2 engine gateway](../platform/foundation/engine-gateway/README.md)
- [Product 2 exact artifact store](../platform/foundation/artifact-store/README.md)
- [Temporal Process lifecycle specification, Selected lifecycle](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#selected-lifecycle)
- [Temporal Process lifecycle specification, Workflow-chain production contract](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract)
- [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md#current-boundary)
- [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md#current-boundary)

## Prompt construction

For each asset, combine the shared art direction, the asset's intent, its exact copy, and these output constraints into one generation prompt:

- `Create one original portrait technical infographic, 2:3, light theme.`
- `Use one dominant layout and keep all text large enough to read in a GitHub README.`
- `Use the supplied copy verbatim. Do not add, omit, rename, or reinterpret any technical fact.`
- `Use arrows only for the relationships explicitly named in the copy.`
- `Add the exact footer Project snapshot • 2026-08-25 • a34df385.`
- `No brand logo, no watermark, no decorative fake text, no code screenshot, and no photorealism.`

When the generator cannot render all exact copy legibly, simplify the visual decoration before shortening the text. Any copy change belongs in this guide first, then in a new render.

## Regeneration workflow

1. Start from a clean source snapshot and record its date and commit in [Initial source snapshot](#initial-source-snapshot).
2. Reopen every deciding source for the asset. For Product 2, recheck every status mark against the platform and Temporal detail maps and the current PLAN checkpoint.
3. Update exact copy in this guide before changing a rendered image.
4. Generate one raster asset per request using the maintained prompt. Do not batch several infographics into one generated canvas.
5. Inspect the full-resolution image for text fidelity, semantic arrows, legend consistency, contrast, clipping, and false visual equivalence.
6. Refine by editing the generated image with one targeted correction at a time. Do not regenerate unchanged content merely to seek a more favorable random result.
7. Save the final PNG at the registered asset path, update its README embed if the path changed, and run the documentation and link guards.

## Acceptance checklist

- Every word carrying a project fact matches this guide.
- Every arrow has the intended source, verb, and target.
- Lean is shown as semantic authority for the selected account, not as a proof of the parser or production stack.
- TypeScript is shown as an independent transcription, not a second vote on meaning.
- CIB is shown only as selected compatibility evidence.
- Temporal is shown as a durable host, not as BPMN semantic authority.
- Temporal ingress mechanisms are shown as delivery paths into the single pure semantic loop, not as alternative transition authorities.
- Event History and Run IDs remain private host facts and never appear in the published engine contract.
- The Temporal service and BPMN Worker are separate runtime nodes: the service schedules and persists, while the Worker runs the Workflow bundle and interpreter.
- PostgreSQL stores exact source and Product 2 facts, not authoritative semantic RuntimeState or Temporal Event History.
- Lean and the independent executable oracles remain outside production runtime images.
- Product 2 consumes the published engine contract and does not invent occurrence identity.
- Product 2 status marks match the commit printed in the footer.
- No aggregate coverage percentage or general conformance claim appears.
- The image remains legible at the width used in the README.
