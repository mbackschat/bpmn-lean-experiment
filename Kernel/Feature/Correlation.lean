module

public import Kernel.Hooks

/-! # Correlation: whether a Message delivery or publication reaches a waiting item

A sub-feature of its own, which `Kernel.Feature.Subscriptions` and `Kernel.Feature.Work` reach through their hooks
records and `Kernel.Population` through `Hooks.correlates`: the modeled key under `MessageCorrelation.modeledKey`, the
API criteria under `apiCriteria`.

Message key correlation as the [specification](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) bounds it: a
criterion names one correlation key and the expression its single property's value is bound to in the subscription's
scope; the delivered value is the Message payload's. Both must be non-empty Strings, compared by exact equality
([exact subset](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)), and the
criterion is evaluated when a delivery is matched, never when the subscription opens, so the current Property value
decides.

An API criterion (CIB-EXT-0025, PC-MESSAGE-08) holds for an item waiting in a scope occurrence over the waiting
instance's own state.
-/

public section

namespace Kernel.Feature.Correlation

/-- Exact equality of kind and value: `41` never equals `"41"`, nor `1.0` `1.00`, and list and map entries compare in
order. -/
def sameKindAndValue : Value → Value → Bool
  | .null, .null => true
  | .bool left, .bool right => left == right
  | .int left, .int right => left == right
  | .decimal left scale, .decimal right scale' => left == right && scale == scale'
  | .string left, .string right => left == right
  | .stringList left, .stringList right => left == right
  | .list left, .list right =>
    left.length == right.length && (left.attach.zip right).all fun (⟨item, _⟩, other) => sameKindAndValue item other
  | .map left, .map right =>
    left.length == right.length && (left.attach.zip right).all fun (⟨entry, _⟩, other) =>
      entry.1 == other.1 && sameKindAndValue entry.2 other.2
  | _, _ => false
termination_by left => sizeOf left
decreasing_by
  all_goals simp_wf
  · have := List.sizeOf_lt_of_mem ‹_ ∈ left›; omega
  · have := List.sizeOf_lt_of_mem ‹entry ∈ left›
    cases entry; simp_all; omega

/-- Whether `criterion` holds for an item waiting in `scope`: `processVariable` names a variable the instance root holds
and `localVariable` one `scope` holds itself, never one of an enclosing scope, each with an equal value
(`sameKindAndValue`); `businessKey` the instance's own key, a called instance's own; `processInstance` its public
identifier. A null matches a present null, and an absent name nothing. -/
def criterionHolds (state : State) (scope : ScopeOccurrenceId) (criterion : CorrelationMatch) : Bool :=
  let root := state.instanceRoot scope
  let holds (owner : ScopeOccurrenceId) (name : String) : Bool :=
    match (state.variables.find? (·.scope == owner)).bind (·.entries.find? (·.1 == name)) with
    | some (_, value) => sameKindAndValue value criterion.expected
    | none => false
  let names (actual : Option String) : Bool :=
    match criterion.expected, actual with
    | .string expected, some actual => expected == actual
    | _, _ => false
  match criterion.target with
  | .processVariable name => holds root name
  | .localVariable name => holds scope name
  | .businessKey => names ((state.slots.instances.find? (·.root == root)).bind (·.businessKey))
  | .processInstance => names (some (state.instanceOf scope))

/-- Whether every one of a delivery's API `criteria` holds for an item waiting in `scope` (`criterionHolds`), the empty
list included; two naming one target are `criteria-duplicate` (`targetsRepeat`). -/
def criteriaHold (state : State) (scope : ScopeOccurrenceId) (criteria : List CorrelationMatch) : Except Failure Bool :=
  if targetsRepeat criteria then .error (.rejected "criteria-duplicate")
  else .ok (criteria.all (criterionHolds state scope))

def criteria (trigger : Trigger) : List CorrelationCriterion :=
  (trigger.message?.map (·.correlation)).getD []

/-- The key a criterion binds, evaluated in `variables`. -/
def keyValue (ctx : Ctx) (context : EvalContext) (criterion : CorrelationCriterion) :
    Except Failure String :=
  match ctx.evaluate context criterion.value with
  -- dynamic-only: a key's value is the run's data.
  | .value (.string key) => if key.isEmpty then .error (.unsupported "correlation-key-empty") else .ok key
  -- dynamic-only: a key's value type is the run's data.
  | .value _ => .error (.unsupported "correlation-key-type")
  | .failure code => .error (.semanticFailure code)
  | .unsupported code => .error (.unsupported code)

/-- Whether the delivered `correlation` names exactly the criteria's keys, in order, each with the String its criterion
binds, under `MessageCorrelation.modeledKey`, where a modeled key matches as `.processVariable`. Criteria delivered to a
wait that models no key, and the other targets, are API criteria, which that reading does not select: `unsupported`, never
a mismatch. -/
def correlationMatches (ctx : Ctx) (context : EvalContext) (bound : List CorrelationCriterion)
    (correlation : List CorrelationMatch) : Except Failure Bool :=
  -- dynamic-only: a delivery's criteria are its caller's.
  if bound.isEmpty && !correlation.isEmpty then .error (.unsupported "profile-message-correlation-api-criteria")
  else if bound.length != correlation.length then .ok false
  else (bound.zip correlation).allM fun (criterion, delivered) => do
    let expected ← keyValue ctx context criterion
    match delivered.target with
    | .processVariable key =>
      pure (criterion.key == key && match delivered.expected with
        | .string value => value == expected
        | _ => false)
    -- dynamic-only: a delivery's criteria are its caller's.
    | .localVariable _ | .businessKey | .processInstance => .error (.unsupported "profile-message-correlation-api-criteria")

/-- Whether `correlation` accepts an item waiting in `scope` whose subscription's `trigger` models the keys it binds:
under `modeledKey` as `correlationMatches` says; under `apiCriteria` as `criteriaHold` says, where admission leaves
the trigger without keys (`message.correlation.modeled`). `Kernel.Feature.Subscriptions` rechecks a firing with it. -/
def correlationAccepts (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) (trigger : Trigger)
    (correlation : List CorrelationMatch) : Except Failure Bool :=
  match ctx.program.options.messageCorrelation with
  | .modeledKey => correlationMatches ctx (state.evalContext scope) (criteria trigger) correlation
  | .apiCriteria => criteriaHold state scope correlation

/-- `Hooks.correlates`. Under `modeledKey` a publication reaches only a subscription that models a key. -/
def correlates (ctx : Ctx) (item : OpenItem) (channel : MessageChannel) (correlation : List CorrelationMatch)
    (state : State) : Except Failure Bool :=
  match item.kind.view.channel, (subscription? ctx item).map (·.trigger) with
  | some channel', some trigger =>
    if channel' != channel then .ok false
    else if (criteria trigger).isEmpty && ctx.program.options.messageCorrelation == .modeledKey then .ok false
    else correlationAccepts ctx state item.scope trigger correlation
  | some _, none => .ok false
  | none, _ => .ok false

end Kernel.Feature.Correlation
