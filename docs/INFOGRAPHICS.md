# Project infographics

## Status

Maintained regeneration guide. The rendered images are explanatory publication assets, not semantic authority, implementation-status owners, conformance evidence, or release claims.

## Purpose

This guide records the exact content, visual grammar, source owners, snapshot boundary, and regeneration procedure for the project infographics embedded in the root [README](../README.md). It exists so a later refinement can change a prompt or layout without reconstructing factual input from an old image.

Durable architectural statements must be refreshed from [PROJECT-DESIGN.md](PROJECT-DESIGN.md), the [Semantic Process IL specification](SEMANTIC-PROCESS-IL-SPEC.md), and [TESTING-SPEC.md](TESTING-SPEC.md). Exact current implementation status must be refreshed from the detail maps routed by [`implementation-status-router`](IMPLEMENTATION-MAP.md), and current sequencing from [PLAN.md](PLAN.md). The images do not replace those owners.

Apply [the top-level README audience contract](DOC-DISCIPLINE.md#top-level-readme-audience) when writing or revising explanatory copy. Readers should understand the practical value and component roles without prior Lean knowledge. This writing requirement does not itself require regenerating existing assets.

## Skill and file ownership

Use the maintained [infographic-bytebytego-style skill](https://github.com/mbackschat/coding-setup/tree/main/skills/infographic-bytebytego-style) for generation, refinement, visual acceptance and AVIF export. This record follows its separation of stable communication design, dated factual input and generation/export history.

Track browser-ready AVIFs in `docs/assets/project-infographics/` and use them in README embeds and download links. Keep accepted PNG masters with the same basename locally in that directory; Git ignores existing and future PNGs, including nested drafts. This policy applies to infographics, not browser screenshots or visual-test baselines. Do not force-add a master to Git.

The content and source sections below own the communication intent and dated copy. The [export record](#avif-export-record) owns the derivative hashes and measurements. A format conversion does not refresh architectural facts, status icons or the source date printed on a poster.

The numbered labels in [the architecture's product division](PROJECT-DESIGN.md#product-division) are internal ownership identifiers. In reader-facing prose and future renders, use **BPMN engine** and **BPM platform**. The existing artwork still says “Product 2” in several places; the exact-copy and prompt records below describe those unchanged assets and must stay faithful to them until their next content refresh.

## Asset inventory

| Asset | README purpose | Dominant layout | Status treatment | Raster |
|---|---|---|---|---|
| [why-lean-helps](assets/project-infographics/why-lean-helps.avif) | Explain why formal semantics materially improve a production BPMN engine | Vertical transformation flow with an evidence orbit | Durable architecture, commit-stamped | 1024 × 1536 AVIF |
| [correctness-stack](assets/project-infographics/correctness-stack.avif) | Explain how authority, proof, independent implementation, and executable evidence compose | Layered stack with one question per layer | Durable architecture, commit-stamped | 1024 × 1536 AVIF |
| [BPM platform vision](assets/project-infographics/product-2-vision.avif) | Show the BPM platform operating journey and which capabilities are implemented, bounded, or still ahead | Journey-card catalog with a maturity ribbon | Explicit implementation snapshot | 1024 × 1536 AVIF |
| [BPMN execution on Temporal](assets/project-infographics/bpmn-execution-on-temporal.avif) | Show the deployed system around one admitted BPMN execution and locate source storage, compilation, the interpreter, semantic state, Temporal durability, Activities, and platform projections | Distributed runtime topology with explicit process and persistence boundaries | Durable architecture, commit-stamped | 1024 × 1536 AVIF |

## Initial source snapshot

The first render was grounded in repository commit `a34df385`, dated 2026-08-25, and carried the footer `Project snapshot • 2026-08-25 • a34df385`. The two unchanged images still carry that footer. Every refresh must print the committed source snapshot it actually describes so a later reader can distinguish publication art from live status.

Before regenerating an asset, record its new committed source snapshot separately, reopen every source owner named below, and review each copied status mark. Keep this original source record for the unchanged assets; do not change a checkmark from memory or infer it from a nearby layer's evidence.

## Release-candidate refresh source

The BPM platform progress and Temporal runtime refreshes use committed source `16c5b9f6`, reviewed on 2026-09-29. The `v0.2.0-rc.1` release tag identifies the published distribution at that source; [PLAN.md](PLAN.md#mue-acceptance-goal) keeps final MUE acceptance separate. The other two infographics retain their 2026-08-25 source and footer.

| Material claim | Source | Status at `16c5b9f6` | Scope |
|---|---|---|---|
| Alpha, Beta, and RC are reached; MUE remains open | [MUE delivery checkpoints](PROJECT-DESIGN.md#mue-delivery-checkpoints), [current checkpoint](PLAN.md#mue-release-candidate-critical-path) | Documented checkpoint/release | RC is not final MUE acceptance or BPMN conformance |
| Shared PostgreSQL runtime is implemented but bounded | [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md#current-boundary) | Documented capability | Replicated API and recovery workers; no production HA or capacity claim |
| Production operations and enterprise identity remain absent | [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md#explicitly-absent) | Planned/absent | No production backup/rollback/capacity or identity provider |

## Shared art direction

- Original ByteByteGo-inspired information design without ByteByteGo branding, logos, wordmarks, watermarks, mascots, or copied compositions.
- Portrait 2:3 composition with a warm off-white background, generous outer margin, and one dominant diagram occupying at least 70 percent of the canvas. The current built-in generation mode returns 1024 × 1536; do not crop away content to simulate another ratio.
- Heavy dark navy outlines, rounded cards, restrained soft shadows, compact sans-serif typography, and small flat technical icons.
- Mint is the title accent and primary success color. Sky blue denotes source and structure, lavender denotes formal semantics, yellow denotes evidence or caution, coral denotes a boundary or absent claim, and neutral gray denotes planned work.
- Prefer short declarative labels over prose. Keep every relationship directional and write it as source, verb, target.
- Use exact project terminology: `checked BPMN graph`, `Semantic Process IL`, `Lean reference interpreter`, `TypeScript semantic core`, `Temporal adapter`, `published engine contract`, and `BPM platform` for new public copy. Existing exact-copy sections retain their historical wording until the corresponding image changes.
- Do not use a combined support percentage. BPMN requirement coverage, selected CIB compatibility, executable-corpus reach, and BPM platform milestone progress remain separate denominators.
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

## Infographic 3: BPM platform vision and progress

### Intent

Show the BPM platform as one coherent operator and worker journey over the engine's published contract. Checkmarks describe platform evidence only. They do not increase BPMN conformance or selected CIB compatibility.

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

`MUE Preview Alpha ✓` → `MUE Preview Beta ✓` → `Release Candidate ✓` → `MUE ○`

### Refresh footer

`Project snapshot • 2026-09-29 • 16c5b9f6`

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

Give architecture reviewers one deployment-level picture that answers where exact BPMN is stored, where it is compiled, where the admitted program and semantic state execute, which process contains the interpreter, what the Temporal service owns, what PostgreSQL owns, and how the BPM platform receives committed facts. The visual must not imply that the Temporal service executes Workflow code, that PostgreSQL stores authoritative semantic state, or that Event History, host retries, Activities, or the platform define BPMN meaning.

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

### Platform API internals

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

The Workflow sandbox computes committed publications and returns them through Workflow task completion. The Temporal service carries their Query or Update results back to the API; the image must show no direct network connection between the BPMN Worker and the platform API.

### Bottom boundary copy

`Temporal persists Event History and schedules work; the BPMN Worker runs the interpreter. PostgreSQL stores Product 2 artifacts and projections, never semantic authority.`

### Why Temporal / semantic ownership callout copy

- `WHY TEMPORAL` / `Durable waits • replay • timers • I/O Activities`
- `SEMANTIC CORE OWNS` / `Token flow • task identity • BPMN-visible outcomes`

Place the two clauses in one paired, color-coded callout below the runtime topology. They explain why the Temporal host is useful without implying that the Temporal service interprets BPMN. Keep the shorter bottom boundary separate so the platform storage limit remains visible.

### Deployment qualification copy

`Evaluation Compose: Temporal dev node + temporal-data volume • PostgreSQL service • API/web • recovery Worker • BPMN Worker`

`Lean, CIB Seven, Java, research sources, and test harnesses stay outside every runtime image.`

### Refresh footer

`Project snapshot • 2026-09-29 • 16c5b9f6`

### Deciding sources

- [PROJECT-DESIGN.md, Interpreter architecture](PROJECT-DESIGN.md#interpreter-architecture)
- [ARCHITECTURE.md, Temporal adapter subsystem](ARCHITECTURE.md#temporal-adapter-subsystem)
- [ARCHITECTURE.md, Applications](ARCHITECTURE.md#applications)
- [Evaluation Compose topology](../compose.yaml)
- [Evaluation runtime images](../Dockerfile)
- [Platform engine gateway](../platform/foundation/engine-gateway/README.md)
- [Platform exact artifact store](../platform/foundation/artifact-store/README.md)
- [Temporal Process lifecycle specification, Selected lifecycle](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#selected-lifecycle)
- [Temporal Process lifecycle specification, Workflow-chain production contract](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract)
- [Temporal execution and TypeScript SDK research](research/TEMPORAL-EXECUTION-RESEARCH.md#executive-model)
- [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md#current-boundary)
- [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md#current-boundary)

## Prompt construction

For each asset, combine the shared art direction, the asset's intent, its exact copy, and these output constraints into one generation prompt:

- `Create one original portrait technical infographic, 2:3, light theme.`
- `Use one dominant layout and keep all text large enough to read in a GitHub README.`
- `Use the supplied copy verbatim. Do not add, omit, rename, or reinterpret any technical fact.`
- `Use arrows only for the relationships explicitly named in the copy.`
- `Add the exact footer specified for this asset's committed source snapshot.`
- `No brand logo, no watermark, no decorative fake text, no code screenshot, and no photorealism.`

When the generator cannot render all exact copy legibly, simplify the visual decoration before shortening the text. Any copy change belongs in this guide first, then in a new render.

## Regeneration workflow

1. Start from a committed source snapshot and record its date and commit alongside the asset's current content, following the [release-candidate refresh source](#release-candidate-refresh-source).
2. Reopen every deciding source for the asset. For BPM platform progress, recheck every status mark against the platform and Temporal detail maps and the current PLAN checkpoint.
3. Update exact copy in this guide before changing a rendered image.
4. Generate one raster asset per request using the maintained prompt. Do not batch several infographics into one generated canvas.
5. Inspect the full-resolution image for text fidelity, semantic arrows, legend consistency, contrast, clipping, and false visual equivalence.
6. Refine by editing the generated image with one targeted correction at a time. Do not regenerate unchanged content merely to seek a more favorable random result.
7. Save the accepted PNG master locally in `docs/assets/project-infographics/`, then export its same-basename AVIF using the command below. Commit the AVIF, not the ignored PNG. Update the current inventory, hashes, export measurements and README links together, then run the documentation and link guards.

### AVIF export

Install `avifenc`, `avifdec` and ImageMagick `magick` before exporting. From the repository root, set the installed skill location and run its helper for each accepted PNG:

```sh
INFOGRAPHIC_SKILL_ROOT="$HOME/Projects/coding-setup/skills/infographic-bytebytego-style"
"$INFOGRAPHIC_SKILL_ROOT/scripts/png-to-avif" docs/assets/project-infographics/why-lean-helps.png
```

The default `web-compact` profile retains dimensions, uses quality 55, speed 0 and YUV444, verifies decoding, and rejects outputs above 150,000 bytes or DSSIM 0.006. Use `--force` only to deliberately replace a stale AVIF. Do not silently resize, weaken the fidelity limit or switch to the unbounded `poster` profile after a failure.

An existing local master is the exact pixel reference. If it is missing, the four original masters can be recovered individually from commit `ed6e0cc6` (the last checkpoint before the AVIF migration):

```sh
git show ed6e0cc6:docs/assets/project-infographics/why-lean-helps.png > docs/assets/project-infographics/why-lean-helps.png
```

For later images without a retained original, decoding an AVIF provides a visual reference but does not recover the original PNG pixels. Generative tools reproduce communication intent, not guaranteed pixel-identical output. Preserve complete submitted creation/correction prompts and tool/model/seed details when actually exposed for future generations; the original guide retained the content and prompt-construction recipe, not a complete tool submission transcript or seed. Do not invent that missing history.

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
- PostgreSQL stores exact source and platform facts, not authoritative semantic RuntimeState or Temporal Event History.
- Lean and the independent executable oracles remain outside production runtime images.
- The BPM platform consumes the published engine contract and does not invent occurrence identity.
- BPM platform status marks match the commit printed in the footer.
- No aggregate coverage percentage or general conformance claim appears.
- The image remains legible at the width used in the README.

## AVIF export record

### Initial 2026-09-28 format conversion

On 2026-09-28 the four existing PNG masters from `ed6e0cc6` were converted without regeneration, editing, cropping or downscaling. Their original source snapshot and factual qualifiers were unchanged at that time; this was publication-format maintenance, not a new implementation or conformance assessment. The original generation date/model/seed were not recorded beyond the source snapshot above. The two refreshed assets have new current hashes in the next subsection.

Each invocation used `"$INFOGRAPHIC_SKILL_ROOT/scripts/png-to-avif" docs/assets/project-infographics/<basename>.png` from the repository root, with the default `web-compact` profile. All four decode at 1024 × 1536 and pass the helper's byte-size and DSSIM gates.

| Basename | PNG master bytes (local only) | AVIF bytes | DSSIM |
|---|---:|---:|---:|
| [why-lean-helps](assets/project-infographics/why-lean-helps.avif) | 1,513,698 | 71,917 | 0.00415614 |
| [correctness-stack](assets/project-infographics/correctness-stack.avif) | 1,642,021 | 86,303 | 0.00447543 |
| [product-2-vision](assets/project-infographics/product-2-vision.avif) | 1,712,310 | 74,813 | 0.00403317 |
| [bpmn-execution-on-temporal](assets/project-infographics/bpmn-execution-on-temporal.avif) | 1,564,975 | 83,744 | 0.005198 |

Accepted file identities (SHA-256):

| Basename | Local PNG master | Tracked AVIF |
|---|---|---|
| `why-lean-helps` | `18b4fbf98ced1cb549d40aabb46e2a0e61ec48a55d94c4ae5d2ca33b3dafee74` | `3a49f1e784516e89b9595dc8f3b67674a8e3d170fe4dc1deca3226e94fe0cc01` |
| `correctness-stack` | `7ebec78cd3dabd7798f803cfc9fe245ae0c21d24bb25f08607ab9ed4eccfee27` | `0e2b1fc75fa7720b9916cbc2e477653fba94b08bade93471e4281a5e20519c3a` |
| `product-2-vision` | `36f8cc45e46dc429198160e319780f64bb8e1590c9b291e12b70f2c8e720cbd9` | `21b2639211c4fca969e01d4f3c54cb8de8da2fa248482a018f20149b92b1e8b6` |
| `bpmn-execution-on-temporal` | `0e7591ccaf4a29c4f8d6f39f1c3cec323d2692377bad70d5c3f9128af844b38b` | `db2b9b48ca478e9dd5f96150ba9fe48775ccf6e023688af1abd617892fdd5776` |

Visual acceptance compared each original PNG with its decoded AVIF side by side at 512 × 768. Text, connectors, colors and layout remained readable with no visible content loss. No new factual or status audit was claimed in this format conversion: the then-current Product 2 poster still showed a partial Beta icon. The 2026-09-29 refresh below corrected that milestone status. AVIF re-encoding does not carry the PNG's embedded C2PA manifest; the ignored masters retain the original files.

### 2026-09-29 content refresh

The `image_gen.imagegen` tool edited each existing 1024 × 1536 PNG master in place against source commit `16c5b9f6`; its model version and seed were not exposed. One targeted correction replaced misleading icons in the Temporal callout. The accepted PNGs were retained locally as ignored masters, and the skill's `png-to-avif --force` helper exported tracked AVIFs with the default `web-compact` profile. Both decoded at 1024 × 1536 and passed the 150,000-byte and DSSIM 0.006 gates.

| Basename | PNG master bytes (local only) | AVIF bytes | DSSIM | PNG SHA-256 | AVIF SHA-256 |
|---|---:|---:|---:|---|---|
| [product-2-vision](assets/project-infographics/product-2-vision.avif) | 1,724,985 | 75,575 | 0.00405223 | `86162d8da21b9c1b6e77d8b150e1cc462c1b558542f14b617355e16805717d5f` | `b423974075b4485c09ae7cf58874b072cfc5d9bba1f61c06e13b26182e9ced33` |
| [bpmn-execution-on-temporal](assets/project-infographics/bpmn-execution-on-temporal.avif) | 1,759,060 | 86,313 | 0.00545331 | `7accef70abff0ddc6d6dbc63a48e97b1ca3893dafe9d31c1b21b803cfe9b1435` | `6e72c807f5827dd4e2ecad8da6de8a5c1bd8928df091615992f616c9296a9840` |

Visual acceptance checked both masters at full resolution and at the README's 560-pixel width. The Product 2 poster now marks Alpha, Beta, and RC as reached, leaves MUE open, and retains bounded shared runtime and absent production/identity statuses. The Temporal poster retains its six runtime nodes, directional relationships, and Worker containment; the added paired callout separates durable hosting from BPMN semantics. The accepted callout uses a clock/replay symbol and branching-flow symbol after an initial candidate showed misleading trophy and people icons. No OCR tool was available; text and relations were inspected visually against the copy above. This content refresh does not change the evidence boundary or imply MUE acceptance.

The exact submitted Product 2 edit prompt was:

```text
Edit the attached existing 1024×1536 portrait technical infographic in place as a narrow factual refresh. Preserve the exact original poster composition, title, subtitle, nine numbered cards, all card text, icons, arrows, legend, colors, outline style, boundary callout, and canvas dimensions. Change only the bottom milestone ribbon and footer: (1) 'MUE Preview Beta' must show a green checkmark ✓ and completed mint/green treatment, matching the existing 'MUE Preview Alpha' segment; remove its old yellow half-circle status. (2) 'Release Candidate' must show a green checkmark ✓ and completed mint/green treatment, matching Alpha; remove its old empty-circle status. (3) 'MUE' must remain an empty circle ○ and uncompleted neutral treatment. (4) Replace the tiny bottom footer with the exact text 'Project snapshot • 2026-09-29 • 16c5b9f6'. Do not change card 7 'Shared Runtime': it remains ◐ Bounded preview. Do not promote card 8 Production Operations or card 9 Enterprise Identity: both remain ○ Planned / absent. No new text, no new nodes or arrows, no logo, no watermark. Preserve all existing text spelling and legibility exactly.
```

The exact submitted Temporal content edit prompt was:

```text
Edit the attached existing 1024×1536 portrait infographic 'How BPMN Executes Across Temporal'. This is a content-controlled revision of the same poster, not a new design. Preserve the six numbered runtime nodes, their containment (BPMN Worker contains Temporal Workflow sandbox and separate Activity host), every original arrow and arrow label, all upper-node text, colors, icon family, reading order, and heading. Do not imply the Temporal Service runs the interpreter. Recompose ONLY the lower bands below the BPMN Worker to add one conspicuous two-column ownership callout, while keeping the poster full-size, legible, unclipped and uncluttered. In that callout use exactly: left mint/yellow panel header 'WHY TEMPORAL' and text 'Durable waits • replay • timers • I/O Activities'; right lavender panel header 'SEMANTIC CORE OWNS' and text 'Token flow • task identity • BPMN-visible outcomes'. These are paired roles, not an arrow from one to the other. Keep the green Evaluation Compose band with its original exact text. Replace the long red bottom boundary paragraph with this shorter exact text: 'Temporal persists Event History and schedules work; the BPMN Worker runs the interpreter. PostgreSQL stores Product 2 artifacts and projections, never semantic authority.' Keep the thin gray note with its original exact text: 'Lean, CIB Seven, Java, research sources, and test harnesses stay outside every runtime image.' Update the footer to exactly 'Project snapshot • 2026-09-29 • 16c5b9f6'. You may slightly reduce whitespace and lower-band heights to fit, but do not shrink important labels below readable size. Preserve the exact original title 'How BPMN Executes Across Temporal' and subtitle 'Where source, interpreter, durable state, and projections live'. No extra technical claims, no extra arrows, no watermark or brand. Original neutral canvas remains fully opaque.
```

The exact submitted correction prompt for the Temporal candidate was:

```text
Make a surgical visual correction to this existing 1024×1536 infographic. In the paired lower callout only, replace the trophy icon beside 'WHY TEMPORAL' with a simple clock-and-circular-replay icon indicating durable waits and replay, using the existing mint/gold icon palette. Replace the people/group icon beside 'SEMANTIC CORE OWNS' with a simple branching-token-flow symbol indicating BPMN transition semantics, using the existing lavender icon palette. Preserve every word and line break exactly as shown, including the title, node labels, arrows, lower callout text, Evaluation Compose band, red boundary paragraph, gray note, and footer. Preserve all positions, dimensions, colors, and connections. Do not invent new arrows, claims, badges, or branding.
```
