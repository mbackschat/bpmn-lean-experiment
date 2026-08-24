# MUE Preview Alpha proposal

## Status

Lifecycle: implemented-awaiting-closure
Review: approved

## Product question and current boundary

Owner-approved on 2026-08-24 after the same reviewer approved correction target `bd9b37f9` with no remaining findings. Implementation may open only the bounded checkpoint and later showcase lanes defined below.

[PLAN](PLAN.md#exact-resume-point) requires the first MUE preview to be a polished Product 2 browser journey over the exact natural and interrupted [Sequential Multi-Instance account](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md). That account already owns the BPMN meaning, source, checked representation, runtime state, `openMultiInstances` observation, Temporal deadline scheduler, retained scenarios, and exact natural and interrupting outcomes. This proposal selects only the missing product command, decoding, presentation, and live-showcase contracts needed to let a user see those implemented facts.

The current Product 2 direct-start boundary constructs `StartProcess.initialVariables` as an empty array, so it cannot start the exact retained model with its required three-item input collection. Product 2 also copies the public `StateObservation` shape and rejects `openMultiInstances`, so its strict execution-publication decoder refuses the implemented progress fact. A terminal publication contains the final state and transition records but no prior state snapshots, so neither Product 2 nor the browser may reconstruct progress after the fact.

Alpha changes no MUE content ID, BPMN requirement disposition, semantic profile, model bytes, operation, runtime rule, Temporal version, Work authorization rule, or final-MUE acceptance obligation. It does not close any of the seven remaining MUE content IDs and makes no broader support claim.

## Source-grounded product decision

The [source-grounded UI research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md#sequential-multi-instance-preview-preflight) records the deciding comparison. CIB Seven keeps a Multi-Instance body distinct from its child Activity instances and presents exact running-instance counts separately from incident and lifecycle state. Camunda 8 independently documents one body with ordered sequential inner instances and no partial output propagation after interruption. Alpha adopts the body-versus-iteration distinction and exact counts, but reads them only from Product 1's committed `openMultiInstances` projection.

The preview is an Operations instance-detail surface, not a new primary navigation destination. It uses the project visual language and existing Overview, History, and Diagram relationships. A visible `MUE Preview Alpha` label names the maturity boundary. Current progress, the exact current item, the committed Timer command, and terminal variables remain separate facts rather than one inferred timeline.

## Exact start-data contract

The existing Product 2 exact-version start request gains one required body:

```ts
type DefinitionVersionStartCommand = DeepReadonly<{
  initialVariables: VariableBinding[];
}>;
```

The HTTP decoder is closed and recursively validates the existing Product 1 `VariableValue` variants, safe integers, Unicode wire strings, unique names, and canonical variable-name order. Existing callers send `{ initialVariables: [] }`. Alpha's browser supplies exactly one `stringList` binding named `DataObjectReference_InputItems` with `contract`, `invoice`, and `receipt`; this is the exact retained scenario input, not a new data type or semantic default.

The engine API and gateway pass the detached canonical binding list into the existing `StartProcess` stimulus. The content-bound direct-start intent covers the list. Definitions persistence retains the exact canonical start-data bytes beside the opaque intent digest before dispatch, and reserved-start recovery decodes those bytes to reproduce the same command. A digest is never used to reconstruct content. SQLite and PostgreSQL migrations backfill every pre-Alpha direct-start reservation without stored start bytes as the exact canonical empty `StartProcess.initialVariables`, because that is the only start stimulus the prior contract admitted. After migration, a row without stored canonical start bytes fails closed. Both stores require migration witnesses for a legacy reserved row recovered as the empty command and for a post-migration missing-byte refusal.

A different start-data value creates a different direct-start intent. Mutation after request capture, noncanonical order, duplicate names, malformed nested values, divergent recovery bytes, or a recovered intent mismatch fails before a second Workflow can be treated as the requested Process instance.

## Exact progress-consumer contract

Product 2's execution-publication contract gains the exact public `ActivityOccurrenceId`, `OpenSequentialMultiInstanceIteration`, and `OpenSequentialMultiInstance` shapes already owned by the [Sequential Multi-Instance public contract](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#public-contract). `StateObservation.openMultiInstances` remains optional because existing programs omit it and the exact Sequential Multi-Instance program carries it in every state, including an empty array after either terminal route.

The strict decoder validates every nested key, wire string, safe integer, mode, identity, variable binding, canonical order, and the published count equations. It also requires each nested Process-instance identity to equal the containing state identity. A schema-derived executable guard compares the public state properties with the platform decoder's accepted key set, so a future producer field cannot repeat the current copied-contract drift silently.

The Operations Overview polls the existing complete execution-publication endpoint only while a selected validated state is running and carries `openMultiInstances`. It records a sample only when the validated current revision changes. Each sample is an immutable browser-session copy of the exact returned current state. The component never derives a sample from transition batches, task turnover, state differences, Product 2 ingestion time, or Temporal Event History.

The progress view shows planned, completed, active, and pending counts plus the exact current input item. Natural completion shows the ordered terminal output variable from the validated terminal state. The interrupting journey shows the committed `fireTimer` record, the published escalation interaction, and the absence of the output variable. It does not synthesize a durable interruption status or claim that absence alone proves a route. Browser-session samples are discarded when the exact instance selection is left and are unavailable after reload; they have no status authority and are labelled `Observed in this browser session`. Intermediate revisions may be displayed when polling observes them, but Alpha acceptance requires only an exact current running state and the exact terminal result and never treats a missed revision as recoverable.

## Automated preview actor

The acceptance package owns an explicit automated preview actor as showcase code, not production semantics or Product 2 Work. The production-built browser deploys the exact retained BPMN bytes and starts the exact selected definition through the public Product 2 route. The actor reads Product 1's public current interaction before every command, uses the published task occurrence identity without constructing it, and submits the retained completion values through the ordinary content-bound Product 1 Update.

For the natural journey, the actor submits `accepted`, `flagged`, and `archived` in the retained order, querying the public current interaction before each Update without waiting on intermediate browser polling. For the interrupted journey, it submits only the `accepted` Multi-Instance completion and waits for the production deadline scheduler to fire the exact `PT1S` Boundary Timer. After the browser observes the committed `fireTimer`, the actor queries the public current interaction, takes the published escalation-task occurrence identity, and submits its exact empty completion through the ordinary content-bound Product 1 Update. The browser never receives a Workflow ID, Run ID, Task Queue, Event History, Activity attempt, or private locator.

The actor does not claim or complete the tasks through Product 2 Work because the exact source intentionally carries no Human Task metadata. Metadata-free tasks remain hidden from Work, and Alpha does not weaken that authorization and form boundary merely to make the demo interactive.

## Required user journey

The production-backed Alpha journey is complete only when one headed or headless Chromium run proves both branches against the production web bundle, production platform server, production Worker, and cached local Temporal service:

1. deploy the exact `scenarios/sequential-multi-instance/process.bpmn` bytes through Definitions and start them with the exact three-item binding;
2. open the confirmed Process instance in Operations without using any host identity;
3. display the `MUE Preview Alpha` label and the first committed body/iteration state;
4. show the natural run's exact current running state, then terminal completion and the ordered `accepted`, `flagged`, `archived` output, without requiring intermediate revisions that the host-clock deadline may overtake;
5. start a second exact instance, show its exact current running state, then the committed Boundary Timer command, the published escalation interaction and its empty completion, terminal completion, and no output collection;
6. prove the same functional relationships at 1600 CSS pixels and the responsive discriminators at 1280 CSS pixels;
7. keep Definitions, Operations, History, Diagram, download, Work, and operator-history behavior green outside the conditional preview surface.

## Required, optional, and excluded work

Required:

- strict typed start-data transport through Product 2, the engine gateway, content-bound intent, local and shared persistence, and reserved-start recovery;
- recursive platform decoding of the exact `openMultiInstances` public field plus a schema-to-decoder drift guard;
- a polished, accessible, responsive Operations preview surface over exact committed current states and terminal variables;
- one explicit automated host actor and two production-backed browser journeys using the exact retained BPMN source and values;
- package, PostgreSQL migration/runtime, Product 2, browser, replay, selected pre-push, and governed review evidence.

Optional after Alpha:

- additional curated inputs or additional exact Multi-Instance examples, provided each already belongs to an independently reviewed semantic profile;
- durable product history of progress snapshots, but only under a separately selected public-history contract.

Excluded:

- Parallel Multi-Instance, a generalized start-data editor, new variable kinds, expressions, completion conditions, non-interrupting boundaries, compensation, or another MUE content obligation;
- changing the exact BPMN source, `PT1S` duration, retained scenario stimuli, output rules, or `openMultiInstances` meaning;
- showing metadata-free tasks in Work, bypassing claim/form authorization, or presenting the automated actor as a human user;
- reconstructing progress or interruption from state differences, task turnover, platform timestamps, CIB history, or Temporal Event History;
- a new dashboard, primary navigation destination, private showcase HTTP API, mocked semantic response, screenshot-only acceptance, or an MUE-complete claim.

## Hosting and information-preservation preflight

The start-data change adds no BPMN transition family. Its durable ingress is the existing exact-version Definition start. The Product 2 reservation must retain the exact canonical input bytes before the existing host dispatch boundary, because a crash while the row remains reserved must reproduce the original `StartProcess` stimulus. The existing content-bound intent, Workflow-start conflict handling, describe-only recovery after dispatch ownership, confirmed-instance publication, and replay rules remain in force.

The preview actor uses the existing User Task Update and existing deadline scheduler. Commands remain ordered by the Workflow; each content-bound Multi-Instance or escalation completion is submitted once by the actor and may be transport-retried under the existing recovery contract. The actor queries the current public interaction before submission and stops on refusal, closure, or identity change. The interrupted branch issues no Timer command from the browser or actor. Worker replay and replacement must preserve the same public samples and terminal result.

The smallest live refinement witness is the two-branch browser run above plus exact Workflow replay. The nearest host counterexamples are a reserved start recovered with different initial data, a legacy empty-start reservation not recoverable after either store migration, a post-migration row accepted without stored start bytes, a browser sample fabricated between two observed revisions, a completion using an actor-constructed activation, and a partial output shown after the Timer route. Each must fail at its owning contract boundary.

## Evidence and governed stage plan

Red/green begins with two independent failures: the platform execution-publication decoder refuses the exact current Sequential Multi-Instance state, and the Product 2 exact-version start cannot carry the retained input collection. The class guards are the schema-derived decoder key census and a reserved-start recovery witness whose stored canonical input is the only available command content.

The first green committed checkpoint includes strict start-data transport and recovery, SQLite and PostgreSQL legacy-empty migration witnesses and post-migration missing-byte refusals, recursive publication decoding, and their adversarial tests. It changes a public command and public observation consumer, so it receives a cold semantic-checkpoint review before UI and showcase work continue. Closure follows only after the complete browser journeys, replay, local and PostgreSQL gates, implementation maps, exact status, and cost record are green. Warm closure continuity may be used only if the checkpoint reviewer and executable manifest satisfy the existing rule.

Focused gates are the engine API, engine gateway, platform contracts, Definitions module, server composition, PostgreSQL migration/runtime, web application, UI-quality, and new Alpha showcase package gates plus `git diff --check`. The root runs every path-selected clean-commit pre-push entry point at each governed boundary. No Temporal dependency or binary version changes.

## Same-change owners and reopen conditions

Implementation updates the exact boundaries owned by the [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md#the-engine-boundary), [UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md), [architecture](ARCHITECTURE.md), [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [testing specification](TESTING-SPEC.md), showcase registry, web source map, and [PLAN](PLAN.md). The Sequential Multi-Instance specification changes only if implementation evidence or its already-owned Product 2 consumer statement changes; its semantic rules do not move here.

Reopen this proposal if Product 1 changes the start variable domain, `openMultiInstances` shape or presence rule, direct-start recovery protocol, current-state publication boundary, User Task command identity, boundary deadline scheduling, or if Alpha requires a durable snapshot history, a production automated actor, metadata-free Work visibility, or a private API.

## Implemented closure boundary

Implementation commit `40c740ae` contains the production-backed showcase package and the root release graph. The exact retained source digest is unit-bound, both browser branches enter through Definitions and Operations, the actor uses only public current state and published interaction identity, and the acceptance owner reads Event History only after both instances terminate to verify exact Update and Timer facts and replay every actual Workflow Run. The natural route publishes `accepted`, `flagged`, `archived` in order; the interrupting route publishes the committed Timer command and escalation interaction and no aggregate output. The production build, six focused package tests, one live two-branch Chromium journey, replay of every observed Run, and 83 fixed-fixture UI-quality tests passed in the complete Alpha release gate. Infrastructure passed 416 of 416 tests when run with the loopback permission its port-allocation guard requires. Exact Temporal CLI 1.8.1, Server 1.31.2, SDK/testing 1.21.0, and UI 2.50.1 remain unchanged.

The implementation adds no durable progress history, interactive metadata-free Work task, private control API, mock semantic response, additional semantic profile, broader Multi-Instance variant, or MUE-complete claim. Browser-session samples remain explicitly transient, and the other seven MUE content IDs remain open.

The reproducible implementation range is `d814cac4..40c740ae`: `+4182/-168` nonblank code lines and `+181/-168` nonblank documentation lines, with elapsed time unknown. The nearest same-layer comparator is Product 2 incident operations at `+13373/-543` code and `+97/-54` documentation. Code additions fell by 9,191 because Alpha reuses the closed Sequential Multi-Instance, confirmed-start, execution-publication, Operations, UI-kit, Workflow-chain, and replay mechanisms. Documentation additions rose by 84 because this delivery selected a new cross-product command and observation consumer and therefore paid proposal and semantic-checkpoint review before its showcase lane. The process weight removed before Beta is repeating that product-level proposal across seven breadth slices: each slice stays with its named semantic or hosting owner and opens a capsule only for a new proposition, while one later Beta integration owner carries the coherent catalog and Product 2 journey.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `40eda701` | `fork-turns-none` | `approve-with-required-edits` | `bd9b37f9` |
| Semantic checkpoint | `c26a24295eaa482113c2a7f1a74fd3a7e4e37733` | `fork-turns-none` | `approve-with-required-edits` | `ac9f3535007c66c14697b5a5e5a4b3e57a963cc2` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

Cold proposal review was required because Alpha adds Product 2 transport for an existing semantic command and accepts and presents a newly published runtime observation. The semantic-checkpoint reviewer required the platform operation-kind census, equivalence between pre-host and initial runtime start-data admission, exact String-list map exceptions, and capability-identity UI assertions. The same reviewer approved correction target `ac9f3535007c66c14697b5a5e5a4b3e57a963cc2` after the original adversarial probes inverted and the clean Product 1, platform, showcase, and 77-test UI gates passed with output SHA-256 values `f270ee1053ab683d0436dd319f13e10a330ce6193b8e54d98947b57c626a91b3`, `f9cc2aa514550a3eb78048f3899bea57f87ac44b0a352cea006cb874ea4c3267`, `f1c9b61fb93b8c77a45f1bb88e14aad4dd8969f529f025d90171673a1a983254`, and `ed29d00b6cc936a4377245bce2ebd611568f3ac2b3b63508150ae255ec355eea` respectively. UI and showcase implementation may proceed without broadening the reviewed contract.
