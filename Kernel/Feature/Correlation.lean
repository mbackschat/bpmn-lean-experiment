module

public import Kernel.Hooks
public import Kernel.State.Criteria

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

/-- Exact equality of kind and value of a queryable criterion value: `41` never equals `"41"`, and a held value of
another kind matches nothing. -/
def sameKindAndValue : Value → Value → Bool
  | .null, .null => true
  | .bool left, .bool right => left == right
  | .int left, .int right => left == right
  | .string left, .string right => left == right
  | _, _ => false

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
list included, unless `criteriaRefusal` refuses the criteria under `apiCriteria`. -/
def criteriaHold (state : State) (scope : ScopeOccurrenceId) (criteria : List CorrelationMatch) : Except Failure Bool :=
  match criteriaRefusal [.apiCriteria] false criteria with
  | some failure => .error failure
  | none => .ok (criteria.all (criterionHolds state scope))

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
wait that models no key, and criteria `criteriaRefusal` refuses under that reading, are `unsupported` or `rejected`,
never a mismatch. -/
def correlationMatches (ctx : Ctx) (context : EvalContext) (bound : List CorrelationCriterion)
    (correlation : List CorrelationMatch) : Except Failure Bool :=
  -- dynamic-only: a delivery's criteria are its caller's.
  if bound.isEmpty && !correlation.isEmpty then .error (.unsupported "profile-message-correlation-api-criteria")
  else if let some failure := criteriaRefusal [.modeledKey] false correlation then .error failure
  else if bound.length != correlation.length then .ok false
  else (bound.zip correlation).allM fun (criterion, delivered) => do
    let expected ← keyValue ctx context criterion
    match delivered.target with
    | .processVariable key =>
      pure (criterion.key == key && match delivered.expected with
        | .string value => value == expected
        | _ => false)
    -- `criteriaRefusal` refused every other target above; the arm keeps the match total.
    | .localVariable _ | .businessKey | .processInstance => pure false

/-- Whether `correlation` accepts an item waiting in `scope` whose subscription's `trigger` models the keys it binds:
under `modeledKey` as `correlationMatches` says; under `apiCriteria` as `criteriaHold` says, where admission leaves
the trigger without keys (`message.correlation.modeled`). `Kernel.Feature.Subscriptions` rechecks a firing with it. -/
def correlationAccepts (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) (trigger : Trigger)
    (correlation : List CorrelationMatch) : Except Failure Bool :=
  match ctx.program.options.messageCorrelation with
  | .modeledKey => correlationMatches ctx (state.evalContext ctx.program scope) (criteria trigger) correlation
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
