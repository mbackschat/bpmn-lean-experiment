# Portable business values proposal

## Status

Lifecycle: draft
Review: pending

## Decision and delivery boundary

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

These measurements describe the unchanged owners at design time, not permanent headroom. A changed owner invalidates its figure; remeasure and extract a cohesive value owner only if its responsibility or measured growth requires it. No unlimited parser/proof/infrastructure programme follows from this proposal. Full capsule implementation cost remains unmeasured and open under the [cost ledger](../CAPSULE-COST-LEDGER.md).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
