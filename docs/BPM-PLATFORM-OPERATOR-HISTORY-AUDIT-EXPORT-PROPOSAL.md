# BPM platform operator history and audit export proposal

## Status

**Owner-approved implementation complete; closure review pending.** Context-cold proposal review target `e4bd44520b6099a353e853113847b12716008d6b` required three bounded correction groups. Two warm correction rounds closed the exact error mapping, route/filename encoding, and owner/registry findings at final target `25c4b6d`. The reviewed Product 2 contract is implemented through strict public bytes, bounded source-local snapshots, authorization-first reconciliation, server composition, the independent Process-instance Operator history surface, canonical download, restart evidence, and two-width browser acceptance. A context-cold closure review over the immutable completed target remains required before graduation and M5 closure. The increment changes no BPMN meaning, semantic profile, CIB relationship, checked graph, Semantic Process IL, semantic runtime state, Product 1 observation, Temporal Workflow behavior, or existing Work and incident-audit API.

[PLAN.md](PLAN.md) owns sequencing. The [human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns Work action audit, the [incident-operations specification](BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns incident-action audit, and the [committed execution publication specification](capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) owns semantic History and its separate canonical export. The [source-grounded UI/UX research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md#pattern-12-operator-audit-is-instance-context-not-semantic-history) owns the external product comparison behind this proposal.

## Owner question and recommendation

What is the smallest complete M5 operator-history surface and audit download that can be built from facts the platform already records without inventing an audit population or chronology?

Adopt one Operations-authorized, per-confirmed-Process-instance `Operator history` view and one strict canonical JSON attachment over the existing Work action and incident-action audit streams. Keep the streams separately labelled and source-locally ordered. Reconcile both durable outboxes before taking two independently atomic bounded snapshots, expose each captured head, and fail the whole request when either stream cannot be proven complete through its own head. Do not merge by timestamp, compare private ordinals, add audit producers, or combine semantic History with platform audit.

This is the recommended design because the platform already owns complete durable records for the selected action families, while their repositories share no transaction, ordinal, cursor, or clock authority. A visually unified timeline would be easier to scan but would communicate a global order the system does not possess. Two explicit streams are both useful and honest.

## Scope

Required scope is one exact public export contract, strict decoder, canonical UTF-8 bytes, one bodyless attachment route, one Operations authorization surface, two bounded repository snapshot operations, authorization-first outbox reconciliation and assembly, one HTTP-only browser client, and one instance-local `Operator history` tab with separate Work and incident-action collections.

Optional scope is a manual reload control inside the tab. It may be omitted without changing the contract because revisiting the tab may request a new pair of source-local snapshots.

Excluded scope includes new audit producers, a global or causal timeline, cross-stream paging, semantic transition records, a combined semantic/audit export, CSV or PDF, a general report or export framework, post-retention archive, tenant policy, production authentication, and changes to the existing self-only Work audit or Operations incident-audit endpoints.

## Product and authority boundary

This is a Product 2 read surface. Work action events remain facts produced by the Work module and durably delivered from its same-transaction outbox. Incident-action events remain facts produced by Operate and durably delivered from its same-transaction outbox. The audit foundation remains the append-only sink for both independent streams. The new service assembles snapshots but creates, edits, enriches, or reclassifies no event.

The committed execution publication remains the sole source for semantic History and current Diagram positions. Operator history is platform action audit. A claim, completion reservation, incident Retry, or incident Cancel record does not prove the semantic Process transition that preceded or followed it except where the event's existing outcome explicitly states the Product 2 action result. Conversely, a semantic transition record does not prove which platform actor acted.

The export contains no opaque engine locator, Workflow ID, Run ID, Task Queue, Event History event, Workflow Task, Activity attempt, Temporal retry, transport payload, private SQLite ordinal, database path, or source-internal cursor. Existing public Process, task-occurrence, incident-occurrence, actor, action, outcome, and canonical audit timestamp fields remain exact.

## Source-grounded design preflight

CIB Seven `2.2` records authenticated operations in a queryable User Operation Log and distinguishes task-worker operations from operator operations. Its public API supports Process-instance, user, category, and timestamp-order queries. The pristine pinned community Cockpit source has no matching User Operation Log or export interface, so CIB supports the data and filtering relationship but not a claimed UI precedent.

Camunda 8 independently exposes an authorization-controlled audit log and offers both a general Operations Log and an exact Process-instance Operations Log. This supports instance-local placement beside broader operational audit. The project deliberately keeps its existing top-level incident Audit panel unchanged because it has no cross-capability global audit contract.

| Boundary | Adopt | Deliberately change | Exclude | Project fact that decides |
|---|---|---|---|---|
| Placement | Exact Process-instance operations context | Add `Operator history` beside Overview, History, and Diagram and keep it available when execution publication is unavailable | New primary navigation or dashboard | Confirmed Process identity exists independently of committed execution projection |
| Categories | Separate task-worker and operator action families | Name the collections `Work actions` and `Incident actions` using project terminology | Vendor categories, entities, or property-entry model | Existing event unions already define two distinct action families |
| Ordering | Source-local ascending audit order | Show two independent heads and no merged chronology | Timestamp or cross-repository ordinal merge | Repositories share no ordering or snapshot primitive |
| Completeness | Reconcile before read and fail closed | Take two independent atomic bounded snapshots instead of claiming one common cut | Partial or cached fallback | Outboxes and sinks are separate databases and transactions |
| Authorization | Operations-group access for per-instance cross-actor inspection and export | Leave Work self-audit and incident audit unchanged | Authentication provider, tenant, or administrator role | Existing exact Operations policy already protects cross-actor operational surfaces |
| Download | Strict versioned canonical JSON attachment | Use one canonical response for both rendering and download | CSV, PDF, semantic/audit bundle, or general exporter | Existing execution export establishes byte verification and download-without-reserialization |

## Public contract

The export reuses the existing strict `PublicProcessInstanceIdentity`, `WorkAuditEvent`, and `IncidentAuditEvent` values without widening them:

```ts
type OperatorAuditStream<Event> = DeepReadonly<{
  headEventId: string | null;
  events: Event[];
}>;

type OperatorAuditExport = DeepReadonly<{
  format: "bpmn-lean.operator-audit.v1";
  instance: PublicProcessInstanceIdentity;
  work: OperatorAuditStream<WorkAuditEvent>;
  incidentActions: OperatorAuditStream<IncidentAuditEvent>;
}>;
```

`instance` is the exact immutable confirmed Product 2 identity addressed by the route. Every event's `hostingProcessInstanceId` equals `instance.processInstanceId`. A Work event's `taskId.processInstanceId` may name the semantic Process instance that owns the task and is not rewritten to the hosting identity. An incident event retains its exact incident occurrence without reinterpretation.

Within each stream, `events` contains every decoded matching event through that stream's captured private insertion head in strict ascending insertion order. Event IDs are unique within and across the two arrays. `headEventId` is null exactly when `events` is empty; otherwise it equals the last event's ID. The head publishes a stable content identity for that independently captured stream without exposing its private ordinal.

There is no relation between `work.headEventId` and `incidentActions.headEventId`. Array position, `recordedAt`, event ID, action ID, Process identity, and occurrence identity establish no cross-stream order. Equal or regressing timestamps across the arrays are valid. Clients must not merge the arrays into one chronology.

The exact format discriminator is `bpmn-lean.operator-audit.v1`. Unknown, missing, duplicate, or extra object fields fail. Existing event decoders continue to reject malformed timestamps, occurrence identities, action variants, outcomes, and unknown fields. The export decoder additionally rejects instance mismatch, duplicate event identity, a non-last head, and any private-host field recursively introduced through an extra key.

## Canonical representation

Canonical bytes are strict JSON encoded as UTF-8 with no byte-order mark, whitespace, or trailing newline. Object keys use Unicode scalar-value ascending order. Array order is preserved. Strings use the existing canonical JSON scalar escaping, numbers are safe integers without alternate spellings, and unsupported values fail. The existing execution-publication export remains byte-identical while both export owners reuse one private canonical JSON mechanism.

The server emits the exact bytes returned by `serializeOperatorAuditExport`. The browser accepts only bytes for which strict parsing, full export decoding, identity corroboration, reserialization, and byte equality all succeed. Download uses those already verified bytes and never serializes the displayed object again.

## Snapshot, completeness, and resource contract

Authorization and confirmed-instance lookup precede reconciliation or audit reads. After those checks, the service executes the following fixed algorithm:

1. reconcile every pending Work audit outbox row;
2. reconcile every pending incident-action audit outbox row;
3. take one atomic Work-repository snapshot filtered by the exact hosting Process-instance ID;
4. take one atomic incident-audit-repository snapshot filtered by the same identity;
5. validate the two stream results and the complete export;
6. canonicalize once and enforce the response-byte ceiling.

The sequence does not create a common atomic cut. Each repository snapshot begins and ends independently. An action committed after its stream's outbox reconciliation may appear only on a later request. The export is nevertheless complete through each published source-local head. A later request may extend either or both streams but must preserve every prior event prefix byte-for-byte.

Each repository snapshot runs inside one read transaction. It first captures matching count, stored JSON byte total, and maximum matching ordinal, checks the ceilings, then reads every matching row through that exact maximum ordinal in ascending order before committing. Changed or undecodable stored content is integrity failure. The private ordinal never leaves the repository.

The fixed v1 ceilings are:

- at most 10,000 events in each source stream;
- at most 8,000,000 stored UTF-8 JSON bytes in each source stream;
- at most 16,777,216 canonical response bytes for the complete envelope.

Crossing any ceiling yields the same fail-closed public unavailability as reconciliation, snapshot, decoding, integrity, or canonicalization failure. The service never truncates, pages, samples, returns one successful stream beside one failed stream, or emits a partial attachment. These ceilings bound one request, not retention; archive and retention policy remain excluded.

## Authorization and confirmed identity

`OperationsAuthorizationSurface.OperatorAudit` is one exact read/export surface. The configured Operations group permits it; every other actor receives HTTP 403. Authorization runs before confirmed-instance lookup, either reconciliation, snapshot, canonicalization, or response construction, so denial reveals no Process existence and causes zero audit work.

The route accepts only an exact Product 2-confirmed `processInstanceId`. A missing registration returns 404 after successful authorization and before audit work. The export carries the registration's exact public identity. No search result, audit event, or caller-provided definition field may substitute for that identity.

This deliberately widens cross-actor inspection only at the new exact Operations surface. `GET /api/v1/work-audit` remains self-only. `GET /api/v1/incident-audit` remains its existing Operations surface with its existing filters and bytes. Neither endpoint redirects to or shares the new export contract.

## HTTP contract

The single public route is:

```text
GET /api/v1/process-instances/{processInstanceId}/operator-audit/export
```

The path has one canonically encoded nonempty identifier segment, no query, and no fragment. The builder applies JavaScript `encodeURIComponent` exactly once to a well-formed Process-instance ID. The matcher percent-decodes exactly once, requires a nonempty well-formed result, and accepts the segment only when reapplying `encodeURIComponent` produces the byte-identical segment; alternate percent-escape case, escaped unreserved characters, and malformed encoding fail. `%252F` is therefore the canonical segment for the legal literal Process-instance ID `%2F`. GET is bodyless and must not declare a content type.

Success is HTTP 200 with `application/json; charset=utf-8` and `Content-Disposition: attachment; filename="operator-audit-{sanitized-process-instance-id}.json"`. Filename sanitization replaces every maximal run outside ASCII letters, digits, `.`, `_`, and `-` with one `_`, retains leading and trailing underscores, truncates the resulting ASCII identity component to 80 characters, and uses `process-instance` only when the result is empty. This reuses the execution-export algorithm with only the `operator-audit-` prefix changed.

The route-owned error set is:

```ts
type OperatorAuditApiErrorCode =
  | "invalidRequest"
  | "methodNotAllowed"
  | "notFound"
  | "forbidden"
  | "operatorAuditUnavailable"
  | "internalFailure";
```

Malformed path or body is 400. Authorization denial is 403. Unknown confirmed identity is 404. Wrong method is 405 with `Allow: GET`. An actor-resolution exception, authorization-policy evaluation exception, or confirmed-registration read, decode, or integrity exception is 500 `internalFailure`. Either outbox-reconciliation exception, either audit snapshot or stored-audit-value exception, cross-stream integrity failure, ceiling breach, export decoding failure, or canonicalization failure is 503 `operatorAuditUnavailable` with canonical message `The complete operator audit is unavailable.` Any other unexpected route defect is 500. The public error catalog gains only `operatorAuditUnavailable`; existing codes and messages remain byte-identical.

## Operator history interface

Selecting a confirmed Process instance opens a full-width Process-instance detail whose exact public identity remains the stable context. The action label becomes `View details`, not `View execution`, because the detail now contains independent semantic and platform facts.

When committed execution publication is available, the detail tabs are Overview, History, Diagram, and Operator history. When it is pending or unavailable, the shell preserves the exact selected identity, reports the committed-execution state in a focused status region, suppresses only Overview, History, and Diagram as appropriate, and leaves Operator history selectable. Operator-audit failure suppresses only the operator tab content and download. Neither source masks the other.

`Operator history` loads the canonical attachment through the HTTP-only client. It shows one scope statement and two separately labelled sections:

- `Work actions` shows recorded time, actor, complete task occurrence, action kind, action ID, and outcome;
- `Incident actions` shows recorded time, actor, complete incident occurrence, action kind, action ID, and outcome.

The sections never interleave rows and never show a global sequence number. Each heading states its event count and whether the captured head is empty or names the last event ID. Empty streams have independent empty states. Equal or regressing cross-stream times do not change presentation order. Existing source-local order is rendered exactly.

The tab owns loading, empty, current, and unavailable states. A material failure receives focus in an alert region. A manual reload, if present, invalidates only the operator-audit request and retains the selected Process context. Leaving detail aborts or invalidates both execution and operator requests and returning restores focus to the exact Process-instance row when still present.

`Download operator audit` is available only after one exact canonical response has passed validation. Activating it downloads the retained verified bytes with the validated server filename. No hidden second fetch or browser-side JSON reconstruction is allowed. The two governed desktop widths are 1280 and 1600 CSS pixels. Both collections use one accessible semantic DOM each and produce no horizontal page or row overflow.

The top-level Operations `Audit` tab remains the incident-action collection defined by M4. Renaming it, merging Work audit into it, or adding global cross-capability filters would select a broader product surface and is excluded.

## Failure and integrity behavior

The route returns 500 `internalFailure` when any one of these conditions holds:

- actor resolution or authorization evaluation fails;
- confirmed-instance lookup, stored registration decoding, or registration integrity evaluation fails;

The route returns 503 `operatorAuditUnavailable` and no export when any one of these conditions holds:

- either outbox reconciliation fails;
- either repository cannot establish one bounded atomic source-local snapshot;
- a stored row conflicts with its indexed identity or fails its existing strict event decoder;
- count, stored-byte, or canonical-response ceiling is exceeded;
- the two arrays share an event ID;
- any event addresses another hosting Process instance;
- a head is inconsistent with its array;
- canonical serialization or byte verification fails.

Authorization denial is not unavailability and occurs first. Unknown confirmed identity is not unavailability and occurs after successful policy evaluation and registration decoding. Separate route tests lock actor-resolution failure, authorization-evaluation failure, registration read/decode/integrity failure, denial, unknown identity, each typed audit-completeness failure, and their zero-work boundaries. The service retains no cache and emits no last-known-good response after a failure. Repository rows and outbox acknowledgements already committed before a later failure remain durable; the failed read creates no compensating event or mutation.

## Evidence contract

| Rule | Required executable separator |
|---|---|
| Exact selected population | Work-only, incident-only, mixed, and empty fixtures export only events whose hosting identity matches the confirmed registration |
| Independent ordering | Reverse each source array independently and prove rejection or byte mismatch; equal and regressing cross-stream timestamps remain valid without merging |
| Source-local completeness | Plant a pending row in each outbox and prove reconciliation precedes its source read; append after one captured head and prove the prior export remains an exact prefix in that stream |
| No common snapshot claim | Add an incident event between the Work and incident snapshots and prove only the incident stream advances without rewriting Work order or head |
| All-or-unavailable | Fail each reconciliation and snapshot independently, corrupt one row, and exceed each count, stored-byte, and response-byte ceiling; every case suppresses both streams |
| Authorization first | Use an actor outside the Operations group and prove zero confirmed-instance lookup, reconciliation, snapshot, or canonicalization |
| Exact confirmed identity | Address an unknown instance and substitute an event or caller identity for the retained registration; no audit read or successful export is allowed |
| Strict wire | Mutate format, instance, hosting identity, event variant, outcome, head, duplicate ID, extra field, whitespace, key order, escape form, and trailing byte independently |
| Existing APIs unchanged | Lock self-only Work audit and authorized incident-audit response bytes and behavior before and after the increment |
| UI independence | Make execution publication unavailable with audit available and vice versa; only the affected tabs and action are suppressed |
| Download identity | Capture server bytes, client-verified bytes, and downloaded bytes and require exact equality plus fixed SHA and validated filename |
| Privacy | Plant every forbidden engine, Temporal, database, cursor, and private ordinal field recursively in service values, HTTP, UI fixtures, and downloaded bytes |
| Responsive accessibility | At 1280 and 1600, prove exact headings, two nonmerged collections, focus restoration, focused failure, keyboard download, and zero horizontal overflow |
| Restart convergence | Leave both outboxes pending across server restart, then prove one event per existing logical identity, complete snapshots, fixed bytes, and no duplicate acknowledgement effect |

Focused verification includes strict contract/type/canonical/route tests, both SQLite snapshot owners, Work and incident outbox integration, authorization policy, operator-audit service and HTTP routes, server composition and restart, HTTP-only client, component behavior, and two-width browser evidence. The complete Product 2 gate runs once after integration. No Lean, BPMN source, semantic-core, CIB, differential, or live Temporal gate is required because this proposal changes none of those claims.

## Required, optional, and excluded functionality

Required:

- one strict `bpmn-lean.operator-audit.v1` envelope over exact existing event unions and confirmed Process identity;
- one canonical attachment route and one HTTP-only verified-byte client;
- one exact Operations authorization surface evaluated before existence or audit work;
- reconciliation of both existing outboxes before two independently atomic bounded snapshots;
- explicit source-local heads, ordering, completeness, and no-cross-stream-order contract;
- all-or-unavailable count, stored-byte, and final-response ceilings;
- one instance-local Operator history tab with separate accessible Work and incident-action sections;
- execution-publication and operator-audit failure independence;
- restart, integrity, privacy, canonical-byte, focus, and two-width browser evidence.

Optional:

- one manual operator-audit reload control.

Excluded:

- any new BPMN, CIB, Lean, semantic-core, Product 1, Temporal, Workflow, Query, Update, Signal, Activity, timer, effect, cancellation, replay, or retention behavior;
- a new audit producer, action kind, event field, actor policy, semantic result, or event rewrite;
- a merged chronology, common snapshot, cross-stream cursor, timestamp sort, private ordinal publication, or causal claim;
- changes to existing Work self-audit, incident audit, semantic History, Diagram, or execution export contracts;
- combined semantic/audit export, CSV, PDF, archive, global cross-capability audit, dashboard, report builder, saved view, or generalized export framework;
- production identity provider, tenant policy, external Process discovery, or post-retention reconstruction;
- layouts below 1280 CSS pixels or pixel-regression baselines.

## Versioning and dependency consequences

This is an additive pre-release Product 2 public contract. Existing Work and incident event bytes, APIs, repositories, outbox lifecycles, execution publication, semantic History export, Process-instance identity, and authorization surfaces remain exact. The new wire is strict from v1; changing its selected event families, stream split, order, head meaning, completeness, ceilings, or privacy boundary requires a new version and migration account.

The two audit repositories add source-local snapshot methods and supporting hosting-identity indexes. Their exact private SQLite epochs advance because existing schemas lack the required indexes and snapshot contract. Unknown, previous, partially upgraded, or structurally divergent audit schemas continue to require an explicit pre-release reset under their existing policy. No production migration or retained-audit compatibility is claimed. This does not change the Work or Operate transactional stores or outbox schemas.

No package or external dependency is added, removed, upgraded, or replaced. Operate consumes structural ports over contract event types and does not import the audit foundation or Work module. The server composition root supplies both repositories and both reconcilers.

## Implementation owners, review headroom, and registries

The new cohesive owners are `platform/contracts/src/operator-audit-export.ts`, `operator-audit-export-decoders.ts`, `operator-audit-export-canonical-json.ts`, and `operator-audit-export-routes.ts`; `platform/modules/operate/src/operator-audit-export-service.ts` and `operator-audit-export-http-routes.ts`; and `platform/apps/web/src/operator-audit-api.ts`, `process-operator-history.tsx`, and its CSS Module. The existing execution canonical owner extracts its private generic canonical-JSON mechanism into a non-exported shared contracts owner without changing bytes.

Existing owners that necessarily change are `platform/contracts/src/definitions.ts` and `index.ts`; both audit contract, SQLite repository, and index owners under `platform/foundation/audit/src/`; `platform/foundation/identity-policy/src/operations-authorization-policy.ts`; `platform/modules/operate/src/index.ts`; `platform/apps/server/src/composition.ts`; and `platform/apps/web/src/app.tsx`, `main.tsx`, `operations-workspace.tsx`, `process-instance-search-panel.tsx`, and `process-instance-execution-detail.tsx`. Their focused existing tests change only where the new surface adds a case or the execution-detail availability boundary is deliberately separated. The existing `process-execution-api.ts`, Work audit route/service, incident audit route/service, and top-level incident Audit panel are inspected and retained byte-identical unless a red guard proves otherwise.

Measured existing nonblank headroom before the proposal target is: contracts index 45/600; Work audit contracts 42/600 and SQLite repository 208/600; incident-audit contracts 44/600 and SQLite repository 386/600; audit index 34/600; Operations authorization policy 50/600; Operate contracts 58/600 and index 128/600; server composition 385/600; Process-instance search panel 293/600; execution detail 286/600; execution API 237/600; Operations workspace 60/600. New focused files begin at zero. The 386-line incident-audit repository has 214 lines of review headroom and may receive only its cohesive bounded snapshot method and schema-index change; any third responsibility must be extracted rather than compressed.

`node scripts/what-binds.ts` reports the registry set collectively across the new and necessarily changed owners: each new contract owner has 115 guards and 2 registries; each new Operate or web owner has 115 guards and 3 registries; the existing aggregate indexes add the source-hygiene backstop for 122 guards; and the showcase owner has 7 guards and 2 registries. The review/update set is the [contracts guide](../platform/contracts/README.md), [audit foundation guide](../platform/foundation/audit/README.md), [identity-policy guide](../platform/foundation/identity-policy/README.md), [foundation guide](../platform/foundation/README.md), [Operate guide](../platform/modules/operate/README.md), [module guide](../platform/modules/README.md), [server guide](../platform/apps/server/README.md), [web guide](../platform/apps/web/README.md), [web source map](../platform/apps/web/SOURCE-MAP.md), [app guide](../platform/apps/README.md), [platform guide](../platform/README.md), [UI-quality showcase](../showcase/platform-ui-quality/README.md), [showcase guide](../showcase/README.md), [documentation registry](README.md), [implementation map](IMPLEMENTATION-MAP.md), and [plan](PLAN.md). A guide may remain byte-identical only after inspection confirms its existing role statement already covers the new owner.

## Review boundary

This proposal is material because it selects a new public wire, cross-actor authorization surface, completeness and ordering contract, canonical download, and Process-instance UI surface. It requires a context-cold proposal review before implementation and a context-cold closure review over the immutable completed target. It requires no semantic checkpoint because it changes no BPMN meaning, profile/CIB relationship, checked-source or IL representation, semantic runtime/public observation, transition family, proof boundary, or Temporal refinement claim.

The proposal review must inspect the two existing event definitions and producer/outbox/sink boundaries, both repository schemas, the confirmed-instance registry, the authorization policy, the execution-export canonical mechanism, and the Process-instance detail failure behavior. The decisive counterexample is a mixed export whose Work and incident timestamps imply the reverse of their independent source-local insertion orders; any design or UI that merges them by time fails.

## Stop and reopen conditions

Stop and return to the owner if implementation requires a new audit producer or event field, a cross-stream total or causal order, a common transaction spanning the two stores, a dependency addition, a Product 1 or Temporal change, a semantic History reinterpretation, a production authentication or tenant decision, retention migration, or a partial result to avoid one of the fixed ceilings.

Reopen this account for another durable audit producer, global cross-capability audit, cross-actor Work search outside the exact export, a shared audit store, common snapshot, archive retention, migration, tenant policy, redaction, CSV/PDF, combined semantic/audit packaging, or a changed event-size or completeness policy.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `e4bd44520b6099a353e853113847b12716008d6b` | `fork-turns-none` | `approve-with-required-edits` | `25c4b6d` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
