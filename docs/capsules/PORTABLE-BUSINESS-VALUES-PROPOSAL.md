# Portable business values proposal

## Status

Lifecycle: owner-approved
Review: approved

## Decision and delivery boundary

The portable-value design is accepted at `377b46e0`; the [serial-handoff amendment](#serial-handoff-consuming-amendment) is independently accepted at `46fb3993`. Implementation follows the bounded checkpoint and qualification below.

Freeze the finite value contract required by `PC-DATA-01` so an order can retain repeated line items, a nested address and an exact signed amount through the `PC-DATA-03` delivery path. This is design acceptance, not runtime coverage. No profile, decoder, evaluator, source admission, host or platform capability changes on approval alone. Implementation still requires its selected profile identity, governed checkpoint and applicable qualification.

The required contract contains String, Null, Boolean, the existing nonnegative Integer, exact Decimal, recursive List and recursive Map. Each node is tagged; heterogeneous collections are permitted because every member retains its own type. This is one closed recursive value type, not arbitrary JSON, a field-schema language or host-object serialization. Currency, display precision and business field names are ordinary process data.

Excluded: arithmetic, implicit conversions, generic Java objects, binary floating-point numbers, dates, binary blobs, cyclic/shared object identity, non-string map keys, arbitrary serialization providers, field mutation, new mapping expressions, JUEL context widening and browser forms. [The expression boundary](../PROJECT-DESIGN.md#profile-selected-expression-evaluation) remains separately governed.

## Authority and source evidence

BPMN 2.0.2 Clauses 10.4.1–10.4.2 supply the data-item and data-association account; the existing [Activity input/output contract](ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md) owns selected mapping semantics. BPMN does not prescribe this project's JSON value encoding or universal Java variable domain. The carrier and finite limits below are project representation choices, not new BPMN execution rules.

The pinned [CIB source boundary](../SOURCES.md#cib-seven) binds `v2.2.0` to `834a9874760de8a0107f7c1b32806e37f17fb017`. Research doctor passed on 2026-10-13. The following inspected files are byte-identical between that tag and the registered pristine research checkout; no new CIB execution was performed:

| Evidence at the pinned tag | Supported observation and limit |
|---|---|
| [BpmnParseUtil.java](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/parser/BpmnParseUtil.java), `parseParamValueProvider`, line 168 onward; [ListValueProvider.java](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/main/java/org/cibseven/bpm/engine/impl/core/variable/mapping/value/ListValueProvider.java), line 36 | Recursive mapping values and append-preserved list members; not a claim about arbitrary portable serialization. |
| [InputOutputTest.java](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/iomapping/InputOutputTest.java), `testInputNested`, `testInputNestedListValues`, and nested outputs | Nested lists/maps are within CIB7 practical depth. The project's string-only keys, canonical order and resource limits are narrower choices. |
| [VariableApiTest.java](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/commons/typed-values/src/test/java/org/cibseven/bpm/engine/test/api/variable/VariableApiTest.java), lines 184 and 207 | `BigDecimal` is an Object value, not CIB's portable primitive Decimal. This proposal does not select Java serialization or numeric evaluator compatibility. |

The existing [relationship register](../CIB-BPMN-RELATION-REGISTER.md) retains its String/null Start/completion and Boolean completion boundaries; none is widened by analogy. This standards-facing representation proposal selects no new executable CIB relationship. A future CIB projection must classify its exact nested-value/Decimal relation and retain a separating probe before claiming compatibility. Decimal is an exact project carrier, not evidence that CIB's Double or BigDecimal has identical type, equality or arithmetic semantics.

## Public value contract

The following is the proposed portable domain. `DeepReadonly` is the existing shared utility. Each object has exactly its shown fields; absence of a field is never a Null constructor.

```ts
type BusinessValue = DeepReadonly<
  | { kind: "string"; value: string }
  | { kind: "null" }
  | { kind: "boolean"; value: boolean }
  | { kind: "integer"; value: number }
  | { kind: "decimal"; coefficient: string; scale: number }
  | { kind: "list"; value: BusinessValue[] }
  | { kind: "map"; value: { name: string; value: BusinessValue }[] }
>;
```

| Arm | Exact domain |
|---|---|
| String | Unicode scalar string, no normalization; at most 1,024 UTF-8 bytes in this portable domain. |
| Null | Explicit present value with only `kind`; distinct from an absent variable or absent Map entry. |
| Boolean | Exactly `true` or `false`, without truthy/string/numeric coercion. |
| Integer | Existing exact `0..9007199254740991` domain; no negative zero. Negative amounts use Decimal, including scale zero. Integer `1` and Decimal coefficient `"1"`, scale `0` have different types. |
| Decimal | Exact mathematical value `coefficient × 10^-scale`; signed coefficient `-9223372036854775808..9223372036854775807`, encoded as decimal text; scale is an integer `0..6`. No conversion through a floating-point number. |
| List | Dense ordered sequence of BusinessValue nodes. Repeated equal members retain their multiplicity and positions. Empty and heterogeneous lists are valid. |
| Map | Dense sequence of entries with unique Unicode scalar keys in strictly increasing Unicode-scalar order. Keys may be empty and are at most 1,024 UTF-8 bytes. Each value is a BusinessValue; empty maps are valid. No prototype lookup or host dictionary identity participates. |

Decimal coefficient spelling is `0` or an optional minus followed by a nonzero digit and decimal digits. There is no plus, exponent, leading zero or `-0`. Zero has scale zero. A nonzero coefficient with positive scale must not end in zero. Consequently `12345/2` denotes `123.45`, `-125/2` denotes `-1.25`, and `123450/3` is rejected rather than silently normalized. Input scale/display precision is not preserved; store a separate business field when it matters. Arithmetic and equality across different numeric types are excluded.

The existing `stringList` remains a distinct, legacy nominal arm for its currently selected profiles and MI contracts. It is excluded from BusinessValue at every depth. A generic List of Strings has one encoding in the portable domain; no decoder chooses between two spellings of that same type. Existing profiles retain their `stringList` encoding and narrower eligibility. This is a difference in selected type domains, not a second parser version or automatic conversion. Adopting generic Lists for an MI collection requires that profile's explicit amendment.

### Finite limits

The proposed limits bound validation and copying while admitting the representative order. They are project policy, not measured CIB limits.

- At most four List/Map nodes along any root-to-leaf path, counting a root container as one; scalar depth is zero.
- At most 32 immediate members/entries per List/Map and 256 tagged value nodes in one root value, including the root. Map keys and entry wrappers do not count as value nodes; their bytes still count.
- At most 16,384 UTF-8 bytes in the canonical JSON encoding of one root value, including tags, names, delimiters and escaping. Each nested subtree must also satisfy the same structural domain.
- Existing content-bound tuple limits remain: 20,480 bytes per variable binding, 65,536 per patch and 131,072 per command. These measure the existing canonical typed tuple encoding, not the value JSON size.

All limits apply together, with exact-limit acceptance and one-over rejection. A scalar or empty collection still consumes one node. Repeated equal values count separately. No truncation, flattening, deduplication or budget increase is an admissible response. These are not aggregate Workflow-state guarantees: activation must additionally prove or check the selected profile's snapshot, command-publication and restoration capacity across all copies before commit. Per-value acceptance alone cannot establish that obligation.

### Canonical bytes and identity

Canonical value JSON uses no whitespace, the exact field order shown above (`kind`, then `value`, or `kind`, `coefficient`, `scale`), existing canonical JSON string escaping, and canonical decimal-digit integer spelling. List order is unchanged; Map entry objects use `name` then `value` and the specified key order. Raw requests may vary whitespace and object-field order; duplicate decoded object keys, unknown/missing fields, noncanonical Map order and malformed UTF-8/surrogates reject before semantic interpretation. An existing canonical-byte publication reader remains stricter and requires its exact bytes.

Command identity extends the existing typed tuple recursively: Decimal is `["decimal", coefficient, scale]`, List is `["list", memberTuples]`, Map is `["map", [[name, valueTuple], ...]]`. Existing scalar tuples are unchanged. Type tags, list multiplicity/order, map keys, absence and Null therefore contribute distinctly to content identity. No CIB serialization or host-object hash participates.

The [AA-13 admission decision](../ASSURANCE-IMPROVEMENT-REGISTER.md#aa-13) for this contract is exact lexical admission: wire integer tokens must match `0|[1-9][0-9]*` and satisfy their field bound before conversion. `1.0`, `1e1`, `1.0000000000000001`, `1e-400`, `1e400` and `-0` reject. Decimal coefficient remains a string. This intentionally tightens currently inconsistent numeric spellings while preserving all canonical encoded values. Raw artifact, HTTP, Lean-input and differential-result readers must agree independently; fatal UTF-8 decoding and own-property handling are mandatory. Approval settles this decision but does not claim AA-13 is repaired.

## Ingress eligibility and refusal

Recognition of a generic arm does not authorize execution. Existing [profile selection](../../packages/semantic-core/src/semantic-profile-value-domain.ts) and its [independent cross-target matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts) retain every current profile's value eligibility. An unknown profile fails closed. This design fixes the portable-domain policy below; a consuming implementation proposal must bind it to a new exact semantic profile identity and existing admitted source/operation shapes before activation. No current profile silently opts in.

| Surface | Portable-domain selection in a consuming profile | Preserved extra obligation |
|---|---|---|
| Process Start | All BusinessValue arms, recursively, in canonical initial bindings | Exact admitted Process and required first-entry bindings; no Workflow starts on refusal. |
| Human completion | All BusinessValue arms in submitted values | Exact active occurrence, declared outputs, atomic write-back and later valid completion after refusal. Forms do not gain an editor automatically. |
| Payload Message | All BusinessValue arms as the explicit payload | Exact payload-bearing subscription and declared association. Payload-free Message remains payload-free; a missing payload is not Null. Correlation keys remain their separately selected String domain. |
| Effect completion | All BusinessValue arms in the selected success/result patch | Exact effect occurrence and declared result/output mappings; arbitrary handler object returns are invalid. Error code and error-message fields are not value patches and retain their contracts. |
| Call entry/return | All BusinessValue arms on explicitly selected interface bindings | Exact Process interface and caller/callee scope ownership; by-value copying, no aliasing or implicit all-variable export. No new external Call command. |
| Expression evaluation | No widening | Simple Boolean and JUEL remain in their separate approved domains. A portable value reaching a String-only expression is not coerced. |

This is a closed eligibility table, not permission to admit every topology combining those surfaces. Profile/source/host admission stays separate. A consumer that selects only some surfaces records the others as unsupported; completing `PC-DATA-02/03` requires their stated selected-command coverage, not merely adopting the shared type.

| Input condition | Prescribed consequence |
|---|---|
| Invalid raw encoding, unknown kind/field, unsafe numeric token, noncanonical Decimal/Map, duplicate keys/bindings or exceeded value bound | Wire boundary error; no typed stimulus and no semantic transition. An equivalent malformed in-memory value is rejected before transition. |
| Well-formed typed value outside the selected profile's surface domain | Scenario support reports unsupported; direct command admission rejects with the full committed state/publication unchanged. This distinction remains explicit in tests. |
| Absent required binding versus present Null | Absence fails required-input/port admission; Null is a present typed value and succeeds only where that port permits Null. No default insertion. |
| Valid value of the wrong declared port type | Typed admission/mapping refusal under the owning operation; no coercion or partial patch. |
| Missing or wrong output discovered during internal mapping | Existing atomic command rollback/refusal semantics apply; no partial committed state. This proposal adds no new failure outcome and does not relabel infrastructure failure as semantic rejection. |

## Stable rules and separating witnesses

| Rule | Required discriminator |
|---|---|
| `PBV-TYPE-01` — preserve every node's exact type | Boolean `true`, String `"true"`, Integer `1`, Decimal `1/0`, Null and absence remain pairwise distinct. |
| `PBV-TREE-01` — preserve List order/multiplicity and exact Map membership | An order has two equal item Maps in a List and an address Map with present-null `line2`; remove one item, swap unequal items, or replace Null with absence and the result must differ. |
| `PBV-AMOUNT-01` — preserve exact signed coefficient and scale | `12345/2`, `-125/2`, signed coefficient bounds and adjacent-over-bound negatives; a Double-roundtrip mutation must be detected on `9007199254740993/0`. |
| `PBV-BOUND-01` — validate the complete finite tree before mutation | Depth four/five, children 32/33, nodes 256/257, UTF-8 and canonical byte exact/over limits, plus valid early entry followed by an invalid last entry. |
| `PBV-INGRESS-01` — apply profile eligibility at every selected boundary | The same nested order is accepted by a selected portable surface and refused by an old String/null profile; schema recognition alone cannot pass. |
| `PBV-IDENTITY-01` — one canonical identity per typed value | Noncanonical Decimal and Map aliases reject; object-field order/whitespace do not change a valid request's typed identity; duplicate decoded keys reject. |
| `PBV-COPY-01` — preserve values without host aliases | Mutating a caller-owned input after admission changes neither committed state, captured inputs, Call data nor retained publication; restored snapshots agree. |

A concrete smallest order value is a Map with scalar-sorted entries `address`, `items`, `total`: address contains `city = String("Berlin")` and `line2 = Null`; items contains two equal Maps with `quantity = Integer(1)` and `sku = String("A")`; total is Decimal `12345/2`. It has 12 value nodes and maximum container depth three. A second instance uses different ordered items and negative total `-125/2`, defeating deduplication, sorting and unsigned-only implementations. These are proposed answer-free inputs; independent target outputs and verifier-side assertions must remain physically separate.

## Lean assurance lane

Lane shape: checked

Evidence: The implementation must extend the existing [typed values](../../BpmnSemantics/Scenario.lean) and [profile domain](../../BpmnSemantics/SemanticProcess/ValueDomain.lean) independently of TypeScript. No new Lean evidence exists at design acceptance. Checked admission/roundtrip, cross-ingress refusal, signed-boundary and restoration witnesses must cover the rules above; finite cases are not a universal codec-equivalence theorem.

Required laws state their premises explicitly: encoding then decoding an admitted canonical tree preserves its tagged value; cloning preserves value equality without storage aliasing; rejected commands preserve the complete committed state; bound checks reject before partial writes. Their quantified proofs are not claimed by this checked lane. The nearest non-laws are numeric equality across Integer/Decimal, Map insertion-order preservation, Decimal display-scale preservation, and universal acceptance of all generic values by all profiles.

No transition family, declarative relation, scheduler choice, synthetic runtime owner or occurrence identity is added. Existing transition/lifetime laws must remain valid for opaque admitted values. A consumer whose code relies on scalar inspection or whose capacity/resumption proof is invalidated must reopen that exact obligation before activation; this proposal cannot substitute finite codec cases for its existing proof guarantees.

## Temporal hosting and refinement preflight

Use existing Start arguments, content-bound Updates, Message ingress, effect-result reconciliation, Call-scope state, publications and Continue-As-New snapshots. Workflow code carries deterministic tagged data; no Java object, arithmetic provider or new Activity/timer/Signal is introduced. Existing queue ordering, deduplication, retry, cancellation and occurrence ownership remain unchanged.

The state relation compares complete tagged trees in committed Process/local/captured/interface values and public observations, preserving List multiplicity and exact Decimal components. The nearest adapter counterexample is a recursive value accepted at Update validation but rounded, flattened, aliased or omitted by command hashing, publication encoding or restoration. Another is individually valid values whose copied aggregate exceeds state capacity after the command has already committed.

The smallest future live witness carries the order through Start, one Human handoff and one existing effect/Call/Message surface only when selected, replaces the Worker, forces one existing continuation boundary, and compares complete public values and content-bound command recovery before replaying every produced Run. A duplicate command must recover the same result; one changed nested leaf must change identity. Each additional ingress needs its focused witness, not a new hosting framework. Retained SDK failures and complete runtime qualification remain open; design review neither reruns nor waives them.

## Evidence strategy and acceptance

| Claim lane | Design acceptance | Required before implementation acceptance |
|---|---|---|
| BPMN/profile | Review the representation/semantics distinction, domain table, bounds and exclusions | Exact consuming profile and unchanged or reviewed source/operation/port contracts |
| Lean | Review the checked-lane scope and inherited-law preservation obligation | Independent decoders/eligibility, named finite witnesses and affected proof consumers |
| TypeScript | Review exact typed shape, recursive validation and immutable ownership | Red/green roundtrip, refusal, alias and bound tests at actual ingress |
| CIB | Source precedent only; no new compatibility claim | Classify and probe each selected CIB projection, including Decimal type distinction |
| Temporal | Review the existing-mechanism preflight and aggregate-capacity obligation | Selected real ingress, replacement/continuation, public projection, recovery and replay |
| Negative/mutation | Review the rule discriminators above | Wrong-type coercion, rounding, deduplication, order loss, absent/null collapse and omitted nested hashing must each fail a relevant observation |

`PC-DATA-01` closes only on an immutable independent approval of this full design, with required findings resolved and the checklist linked to that dated receipt. No runtime row closes with it. The proposal stays a proposal until implemented and closure-reviewed. The next consequence is a bounded common-codec/admission slice supporting the typed-order journey; its exact source/profile and aggregate-capacity obligations must be selected before code. A failed bounded design review leaves the task open and triggers replanning.

Common-mode risks are shared test fixtures/serialization assumptions, projecting CIB Objects as though their type were portable Decimal, and testing only already-parsed numbers after precision was lost. Independent raw-byte cases, exact CIB type observations and separately written Lean/TypeScript readers address different risks. The nearest unsupported claim remains a usable end-to-end typed-order process; this document supplies no such evidence.

## Serial-handoff consuming amendment

This amendment selects `bpmn-2.0.2-portable-business-values-handoff-draft` as the first executable consumer. Its useful outcome is Start → Review → Archive → End: Review receives the complete order, submits its differently named DataOutput, and Archive receives the value copied through the declared Process Property. It supplies a bounded public engine handoff toward `PC-DATA-03`, with `PC-DATA-02` admission obligations; it does not close either broad runtime task by itself.

### Source, type and port contract

Reuse the [retained serial source role shape](../../scenarios/structured-process-composition/serial.bpmn), not its identifiers or a business-model whitelist. Admit one executable root Process, one None Start/End, exactly two composed User Tasks in one acyclic serial path, and their direct Property-to-DataInput/DataOutput-to-Property associations. The second task reads the first task's output Property. No disconnected nodes, branches, ordinary tasks, conditions, loops, scopes, metadata, optional sets, transformations or extra behavior are admitted. Preserve generic ownership, global identity, distinctness and independent checked/Program validation through the existing [structural admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md).

Each task has one required InputSet/DataInput and one required OutputSet/DataOutput. Keep absent ItemDefinition/DataState and the existing omitted/default-false `isCollection` syntax. BPMN §8.4.10 permits a structured information item; §10.4.1 Tables 10.51, 10.59 and 10.60 permit an absent item type and distinguish a noncollection port. [Normative CMOF/XSD provenance](../SOURCES.md#omg-bpmn-202) remains authoritative; the [existing source reader](../../packages/bpmn-source/src/scalar-io-specification.ts) enforces these facts.

The selected port domain is `SingletonBusinessItem`: String, Null, Boolean, Integer, Decimal or Map from BusinessValue, excluding only a root List. A Map represents one structured record; its fields may contain the complete recursive BusinessValue domain, including Lists. This is an explicit profile interpretation, not a claim that BPMN declares a JSON Map datatype. A top-level List would represent a collection on this untyped port and is therefore a well-formed but unsupported port value. Legacy StringList stays excluded at every depth. The generic BusinessValue bounds and encodings are unchanged.

Start requires exactly one binding named by the first task's source Property, carrying one SingletonBusinessItem; unrelated initial bindings reject for this profile. Both completions require exactly their declared DataOutput-named binding with a SingletonBusinessItem. Missing input/output, a Property-named output, extra binding, wrong occurrence or root List rejects without partial writes. Present Null and an empty Map are available items, distinct from absence. Null is not an automatic replacement for missing data. Neither completion is required to equal the captured input: Review may revise an order, and Archive copies the submitted value as declared.

Only Process Start and these two Human completions select this domain. Message, effect, Call, MI, expression and platform form capabilities remain unselected. Existing profile identities and their value domains retain their meanings. The same generic schema-valid nested value must still fail old-profile admission, including direct commands and restoration; widening shared readers must not widen an old profile.

### Runtime, ownership and acceptance

Reuse the existing composed operation, occurrence identity, Property associations and one Activity-local input snapshot. No new opcode, runtime owner, wire policy flag or profile-independent collection capability is added. Derive the Property-path value policy from the exact Program profile and apply it consistently to admission, arming, local-scope validation, completion, observation and restoration. A generic value decoder is insufficient. Keep Process-interface/Call and other scalar mappings on their existing contracts; never replace `processInterfaceScalar` globally.

Select complete required input before arming; copy it by value into the occurrence-local input, then expose the task. Exact completion writes its declared Property and retires that same local/Activity/task lifetime before subsequent arming. The next task receives the newly written value under its own input ID and occurrence. No submitted DataOutput name becomes a Process variable. Failed validation preserves the predecessor's complete data, waits, counters and publication. The serial shape permits only one semantic wait, and Start/each accepted completion must reach that wait or terminal state within the unchanged internal closure limit.

The existing proved scalar-profile accounts remain required regression evidence. This new profile retains the declared checked lane: finite source/admission, independent evaluator, actual command and restoration discriminators establish its selected behavior without claiming the SPC profile's scalar-premised universal resumption theorem for recursive values. Reuse shared transition/lifetime facts where their premises hold; do not assume scalar premises for a Map or copy the scalar proof programme under new names. Any invalidated existing guarantee must be restored before acceptance. Proof growth beyond the finite implementation allowance triggers replanning, not additional owners.

Public enrollment is mandatory: compile/start/observe/command support, independent value-domain matrix, answer-free scenarios, runnable example, standard-only pipeline cases, retained whole-model corpus and truthful Product 2 disclosure. The corpus model remains unavailable as a browser-ready demonstration until a separately selected UI journey exists. No new CIB execution claim follows from this profile; its authority is the standard-facing account and independent Lean/core/Temporal evidence.

### Capacity admission

Keep the initial Property and both output Properties distinct. Together with the single initial binding and retired predecessor local, this bounds the successful journey to two root-value copies at the first wait and three at the second wait or termination. Each paired E1/E2 batch carries one root in its external stimulus; internal transition records carry identities, not copied states. A continuation carries at most seven roots across runtime state, publication current and original Start. A selected-Run publication query can carry nine across the echoed snapshot, returned current and three stimuli. These are structural copy counts from the existing [publication owner](../../packages/temporal-adapter/workflow/src/execution-publication-state.ts), [segment owner](../../packages/temporal-adapter/workflow/src/workflow-publication-segments.ts) and [query capacity owner](../../packages/temporal-adapter/workflow/src/workflow-publication-query-capacity.ts), not measured aggregate qualification.

Before Workflow creation, derive a conservative envelope from the actual admitted Program, identities, names and Start arguments, reserving the full 16,384-byte allowance for each permitted future output. Require that envelope to fit the existing 64 KiB state/batch, 192 KiB query/result and 448 KiB continuation limits, including tags, escaping, directories, retained trace/publication, command recovery and non-value metadata. Component limits alone are insufficient. Refuse the hosted start before creating a Workflow if the full successful path cannot fit; do not reduce the generic value domain, raise production limits or accept a value only to discover its unavoidable copying overflow later. Exercise actual maximum-value journeys and nearest-over-bound envelopes to settle the bound before runtime acceptance.

This reserves the two-completion business path; it is not an unlimited retry, command-history or Run-longevity guarantee. Existing recovery, queue, directory and total-Run policies continue to bound additional traffic. Unexpected host capacity failure remains the existing typed host failure with the last committed publication preserved. The [Workflow capacity owner](../../packages/temporal-adapter/workflow/src/workflow-chain-capacity.ts) latches that failure; a later smaller value is not promised to resume the failed Workflow. Ordinary semantic refusals still preserve the active task and permit a later valid completion within the host limits.

### Decisive witnesses and checkpoint

The positive journey uses the 12-node order above, then a revision with ordered unequal items and negative Decimal, and a present-Null control. Assert the exact copied input and complete committed Process values at both waits and terminal completion. Repeat with renamed BPMN IDs and reordered semantically unordered declarations; business names must not enter admission logic. Preserve list multiplicity, canonical Map keys and type tags at all observations.

Negative cases cover root List versus nested List, missing versus Null, wrong/extra output, stale occurrence, old-profile refusal, malformed raw numbers/UTF-8, exact/over value bounds and aliased caller data. Mutations that deduplicate items, round the signed coefficient, omit a nested leaf from command identity, flatten a Map or leak a retired local must be observed. Generic wire validity, profile support, typed command rejection, internal rollback and host capacity failure remain separate outcomes.

The first green shared value/reader/admission batch is a material semantic checkpoint. Stop before downstream hosting/registration crosses it; commit and obtain cold review with complete affected package qualification. Use focused Lean owner/consumer builds while stabilizing, followed by one complete Lean acceptance gate for the coherent batch. Reuse unchanged evidence; review does not request another full build. Then reuse the production handoff's Worker replacement, forced rollover, full E1/E2, content-bound recovery and every-Run replay mechanisms. Closure remains independently governed; unrelated retained runtime failures cannot be represented as passed.

### Raw-wire admission checkpoint

This checkpoint implements AA-13 for the existing five value arms; it adds no recursive values or profile activation. Lean, TypeScript and Java independently reject noncanonical or unsafe raw integer tokens before numeric conversion, and preserve fatal UTF-8 refusal. Artifact and differential result readers use that boundary; source-overlay members remain own properties. Generic JSON and catalog-owned structured form fields keep their separate numeric policy. At HTTP ingress, lexical refusal returns 400; canonical JSON with an invalid typed value retains its typed refusal.

The [Lean executable witness](../../BpmnSemantics/SemanticProcessJsonConformance.lean#exactWireIntegerAdmissionWitness), [raw artifact tests](../../scripts/strict-json.test.ts), [actual differential reader](../../packages/differential/test/raw-wire-admission.test.ts), [Work HTTP tests](../../platform/modules/work/test/work-http-routes.test.ts) and [Java reader tests](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/ScenarioJsonTest.java) separate fractional rounding, underflow, exponent/decimal aliases, safe bounds, malformed encoding and canonical controls. Existing Lean theorems remain; the new finite cases introduce no compiler-trusted proof axioms. Complete qualification and independent checkpoint acceptance remain required before dependent work.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): update every producer/consumer of the shared union atomically, preserve current profile meanings, and assign new semantic identities when selecting wider behavior. No parallel legacy parser, embedded format switch, dependency installation or durable-history migration is selected. Published artifacts are not rewritten; an actual retained-history boundary would require a separately evidenced migration/replay decision.

The 2026-10-13 `what-binds` inventory for the owners below identifies the existing [schema coverage](../../scripts/contract-schema-coverage.test.ts), [publication coverage](../../scripts/execution-publication-contract-coverage.test.ts), [cross-target domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), [lane guard](../../scripts/lean-assurance-lane.test.ts) and [independent review guard](../../scripts/independent-review-policy.test.ts). These constrain implementation even when their code does not change.

The shared change must inventory and satisfy the [schemas](../../contracts/README.md#schemas), [core source map](../../packages/semantic-core/SOURCE-MAP.md), [Temporal source map](../../packages/temporal-adapter/SOURCE-MAP.md), [strict artifact parser](../../scripts/strict-json.ts), [platform parser](../../platform/contracts/src/strict-json.ts), [Lean JSON owners](../../BpmnSemantics/SemanticProcessJson.lean), source lowering/literals, CIB projection, differential comparison and Product 2 value readers. Recognition must be exhaustive even for surfaces that continue rejecting the new domain. The initial design changes none of them; each implementation lane reruns path-specific binding discovery before growth, because this design inventory is not permission to omit a transitive consumer.

### Owners this implementation grows

| Owner | Remaining nonblank lines before the 800-line review target |
|---|---|
| [TypeScript shared value contract](../../packages/semantic-core/src/contract.ts) | 290 |
| [TypeScript value validation/equality/copy](../../packages/semantic-core/src/variable-value.ts) | 618 |
| [TypeScript profile domain](../../packages/semantic-core/src/semantic-profile-value-domain.ts) | 493 |
| [Lean typed values](../../BpmnSemantics/Scenario.lean) | 408 |
| [Lean profile domain](../../BpmnSemantics/SemanticProcess/ValueDomain.lean) | 647 |
| [Content-bound command encoding](../../packages/temporal-adapter/protocol/src/command-identity.ts) | 543 |
| [Cross-target domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts) | 603 |
| [Composed-task arming](../../packages/semantic-core/src/internal-transition-data-arming-patch.ts) | 691 |
| [Composed-task completion](../../packages/semantic-core/src/semantic-process-activity-data-input-output-runtime.ts) | 621 |
| [Property/interface endpoint policy](../../packages/semantic-core/src/activity-data-endpoint.ts) | 707 |
| [Serial structural admission](../../packages/semantic-core/src/structured-process-composition-admission.ts) | 521 |
| [Lean endpoint policy](../../BpmnSemantics/SemanticProcess/ActivityDataEndpointRuntime.lean) | 721 |
| [Lean composed-task runtime](../../BpmnSemantics/SemanticProcess/ActivityDataInputOutputRuntime.lean) | 616 |
| [Source association lowering](../../packages/bpmn-source/src/activity-data-input-output-source.ts) | 490 |
| [Host semantic candidate preflight](../../packages/temporal-adapter/workflow/src/workflow-semantic-candidate.ts) | 654 |
| [Lean strict JSON boundary](../../BpmnSemantics/StrictJson.lean) | 664 |

These measurements describe the unchanged owners at design time, not permanent headroom. A changed owner invalidates its figure; remeasure and extract a cohesive value owner only if its responsibility or measured growth requires it. No unlimited parser/proof/infrastructure programme follows from this proposal. Full capsule implementation cost remains unmeasured and open under the [cost ledger](../CAPSULE-COST-LEDGER.md).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `46fb39933116782162de61ff1cd0e9ca3585e54c` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

Consuming amendment accepted on 2026-10-13 against baseline `99cfe6fc810d06c7538712680302765a75212686`; no required findings. Packet: `d95272b2724f1802171ab6ca9b84fe2d4535e7ed9f7a6125aa847e68e45397c3`. Independent normative/source and publication-shape probes, XML validation, doctor and 100 focused guards passed, with asserted receipts under `/tmp/pbv-handoff-review-{doctor,focused,source,shapes,xsd}-20261013`. The 16,384-byte Map produced a 50,044-byte substituted terminal state; this is feasibility evidence, not recursive-value runtime or aggregate hosted qualification.

### Portable-value design acceptance

Design accepted on 2026-10-13 against `377b46e028c2c92d2ce32a044d992cc7c60e1dcc`, baseline `36058b60b2949d45350a69f42833f1579a1ff923`; no required findings. Packet: `a544a375045ff57924324750f39d7229340e8b09671a76e555a117f25ceef965`. Independent source, recursive-type and exact-boundary probes plus the asserted `/tmp/pbv-review-focused-20261013` and `/tmp/pbv-review-doctor-research-20261013` receipts support design approval only. `PC-DATA-01` is accepted; AA-13 implementation, consuming profiles, aggregate capacity and `PC-DATA-02/03` runtime delivery remain open.
