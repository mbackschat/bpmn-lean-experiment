module

public import Kernel.Feature.Subscriptions.Conditions
public import Kernel.State.Criteria

/-! # Subscriptions: correlation

Whether a Message delivery or publication's correlation accepts a waiting subscription (`Hooks.correlates`, and the
recheck `Kernel.Feature.Subscriptions.admitFiring` makes): the modeled key under `MessageCorrelation.modeledKey`, the API
criteria under `apiCriteria`.

Message key correlation as the [specification](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) bounds it: a
criterion names one correlation key and the expression its single property's value is bound to in the subscription's
scope; the delivered value is the Message payload's. Both must be non-empty Strings, compared by exact equality
([exact subset](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)), and the
criterion is evaluated when a delivery is matched, never when the subscription opens, so the current Property value
decides.
-/

public section

namespace Kernel.Feature.Subscriptions

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

/-- Whether `correlation` accepts an item waiting in `scope` whose subscription models the keys `bound`: under
`modeledKey` as `correlationMatches` says; under `apiCriteria` as `State.criteriaHold` says, where admission leaves
`bound` empty (`message.correlation.modeled`). -/
def correlationAccepts (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) (bound : List CorrelationCriterion)
    (correlation : List CorrelationMatch) : Except Failure Bool :=
  match ctx.program.options.messageCorrelation with
  | .modeledKey => correlationMatches ctx (state.evalContext scope) bound correlation
  | .apiCriteria => state.criteriaHold scope correlation

/-- `Hooks.correlates`. Under `modeledKey` a publication reaches only a subscription that models a key. -/
def correlates (ctx : Ctx) (item : OpenItem) (channel : MessageChannel) (correlation : List CorrelationMatch)
    (state : State) : Except Failure Bool :=
  match item.kind.view.channel, (subscription? ctx item).map (criteria ·.trigger) with
  | some channel', some bound =>
    if channel' != channel then .ok false
    else if bound.isEmpty && ctx.program.options.messageCorrelation == .modeledKey then .ok false
    else correlationAccepts ctx state item.scope bound correlation
  | some _, none => .ok false
  | none, _ => .ok false

end Kernel.Feature.Subscriptions
