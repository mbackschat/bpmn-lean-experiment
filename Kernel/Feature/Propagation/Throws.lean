module

public import Kernel.Hooks

/-! # Propagation: throw Events

What a throw Event does when its occurrence arrives (`Hooks.arriveThrow`), the half of `Kernel.Feature.Propagation`
that owns matching on `Throw`. A none End Event consumes its token; a none intermediate throw passes it on. A Terminate
End Event clears the scope occurrence it ends in, which `Step` then completes: inside a Sub-Process the Sub-Process
completes normally and its parent continues, at the process level the instance completes
([BPMN 2.0.2 §13.5.6](../../../docs/reference/bpmn-2.0.2/README.md)). An Error or Cancel End Event consumes its token
and an Escalation throw stands; each queues a `Signal.raise`, which `Kernel.Feature.Propagation.raise` takes, so a throw
never searches for a catcher itself. A Compensation throw hands its scope occurrence to
`Kernel.Feature.Compensation` through `Signal.compensate`; a Signal throw delivers its broadcast; a Message throw opens
its effect item.
-/

public section

namespace Kernel.Feature.Propagation

/-- How a throw Event leaves once it has done its work. -/
def throwLeave (payload : EventPayload) : Leave :=
  match payload.placement with
  | .finish => .flows []
  | .intermediate => .outgoing

/-- The public identity of a trigger: the thrower's occurrence, as `origin` names it. -/
def throwerRef (state : State) (origin : Origin) : OccurrenceRef :=
  { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }

/-- A Compensation throw compensates the Activities retained in its scope occurrence, or only its `activityRef`'s, and
continues once all handlers have completed; only the synchronous form is implemented (`throw.compensation.asynchronous`
at admission). -/
def throwCompensation (header : Header) (payload : EventPayload) (thrown : CompensationThrow) (occurrence : Occurrence)
    (state : State) : Outcome :=
  if !thrown.waitForCompletion then .error (.unsupported "throw-compensation-asynchronous")
  else
    let triggered := throwerRef state { element := header.id, scope := occurrence.scope, activation := occurrence.activation }
    .ok (state.signal (.compensate occurrence.scope thrown.activity triggered none
      (some (.complete occurrence.id (throwLeave payload)))))

/-! ## Signal throws (PC-SIGNAL-01)

A Signal throw evaluates, in CIB's order, its business key, its payload and its name
(`ThrowSignalEventActivityBehavior.java:48-51`); the first failure decides. It then fires every open item of the
Signal's address in its own State, the root instance tree, before it leaves, and appends one `BroadcastIntent` for the
other States (CIB-OP-0019): receivers are listed before any is delivered, so one armed during the delivery is not, an
item gone by its turn is skipped (`Step`'s `fire`), and the thrower leaves before any receiver's cancellation (#151). -/

/-- A business key (CIB-EXT-0040): a String, `null` being none; another type is CIB's failed cast, which rolls back. -/
def signalBusinessKey (ctx : Ctx) (context : EvalContext) : Option Expression → Except Failure (Option String)
  | none => .ok none
  | some expression =>
    match ctx.evaluate context expression with
    | .value value =>
      match value with
      | .string key => .ok (some key)
      | .null => .ok none
      -- dynamic-only: a key's value type is the run's data.
      | .bool _ | .int _ | .decimal _ _ | .stringList _ | .list _ | .map _ =>
        .error (.rolledBack "signal-business-key-type")
    | .failure code => .error (.rolledBack code)
    | .unsupported code => .error (.unsupported code)

/-- The payload (CIB-EXT-0040): the `camunda:in` copies in document order, `variables="all"` copying every variable
`visible` from the throw at its position, a later target replacing an earlier (`VariableMap.put`). -/
def signalPayload (ctx : Ctx) (context : EvalContext) (visible : List (String × Value)) (record : SignalThrow) :
    Except Failure (List (String × Value)) := do
  let position := record.propagateAll.getD record.payload.length
  let before ← ctx.requireMappings context (record.payload.take position)
  let after ← ctx.requireMappings context (record.payload.drop position)
  pure (lastWrites (before ++ (if record.propagateAll.isSome then visible else []) ++ after))

/-- The address a throw broadcasts to: its `signalRef` under `SignalNames.identifier`, else its name (CIB-INT-0028),
an expression's evaluated at the throw (CIB-EXT-0041). A `null` name matches nothing in CIB or fails on an earlier
subscription of the same command (`EventSubscriptionManager.java:120-121`), so it is not claimed. -/
def thrownAddress (ctx : Ctx) (context : EvalContext) (record : SignalThrow) : Except Failure SignalAddress :=
  match ctx.program.options.signalNames, record.signalRef, record.name with
  | .identifier, some ref, _ => .ok (.qualified ref)
  | .addresses, _, some (.literal text) => .ok (.named text)
  | .addresses, _, some (.expression body) =>
    match ctx.evaluate context body with
    | .value value =>
      match value with
      | .string text => .ok (.named text)
      -- dynamic-only: the evaluated name is the run's data.
      | .null => .error (.unsupported "signal-name-null")
      | .bool _ | .int _ | .decimal _ _ | .stringList _ | .list _ | .map _ => .error (.rolledBack "signal-name-type")
    | .failure code => .error (.rolledBack code)
    | .unsupported code => .error (.unsupported code)
  -- Admission refuses both (`signal.unspecified`, `signal.unnamed`).
  | .identifier, none, _ => .error (.unsupported "signal-unspecified")
  | .addresses, _, none => .error (.unsupported "signal-unnamed")

/-- The open items of `address` in the thrower's own State, by process instance, then in arming order, the order the
linearization of the population fixes for CIB's unordered `HashSet` (`EventSubscriptionManager.java:111-126`). -/
def ownReceivers (state : State) (address : SignalAddress) : List OpenItem :=
  ((itemList state.openItems).filter fun item => item.kind.view.signal.any (address.matches ·.address)).mergeSort fun left right =>
    let (l, r) := (state.instanceOf left.scope, state.instanceOf right.scope)
    decide (l < r) || (l == r && left.position ≤ right.position)

/-- The delivery that fires `item` from a throw. -/
def thrownDelivery (ctx : Ctx) (state : State) (address : SignalAddress) (variables : List (String × Value))
    (item : OpenItem) : DeliveryInput :=
  { occurrence := { processInstanceId := state.instanceOf item.scope, element := ctx.program.publicId item.element
                    activation := ((state.occurrence? item.id.occurrence).map (·.activation)).getD 0 }
    trigger := .signal address .broadcast, variables }

def throwSignal (ctx : Ctx) (payload : EventPayload) (record : SignalThrow) (origin : Origin) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let context := state.evalContext ctx.program occurrence.scope
  let businessKey ← signalBusinessKey ctx context record.businessKey
  let variables ← signalPayload ctx context (state.visible ctx.program occurrence.scope) record
  let address ← thrownAddress ctx context record
  let fired := (ownReceivers state address).foldl (fun state item =>
    state.signal (.fire item.id (.signal (thrownDelivery ctx state address variables item)))) state
  let intent : BroadcastIntent := { address, variables, businessKey, origin := throwerRef state origin }
  .ok ({ fired with outbox := fired.outbox ++ [intent] }.signal (.complete occurrence.id (throwLeave payload) [] .outward))

/-- A Message throw under `MessageThrowForms.cibForms` (PC-MESSAGE-09): unbound, it passes its token on, as CIB's
`IntermediateThrowNoneEventActivityBehavior` does (CIB-INT-0027); bound, it opens one effect item, as CIB runs its
delegate as a Service Task's (CIB-EXT-0039), and `Kernel.Feature.Work.effectResult` answers it: a throw Event has no
envelope, so a success leaves with no outputs and a business failure raises from the throw's occurrence. -/
def throwMessage (record : MessageThrow) (occurrence : Occurrence) (leave : State → State) (state : State) : State :=
  match record.binding with
  | none => leave state
  | some binding => state.openItem (.effect { protocol := binding.protocol, operation := binding.operation }) occurrence

def arriveThrow (ctx : Ctx) (header : Header) (payload : EventPayload) (thrown : Throw) (occurrence : Occurrence)
    (state : State) : Outcome :=
  let origin : Origin := { element := header.id, scope := occurrence.scope, activation := occurrence.activation }
  let leave (state : State) : State := state.signal (.complete occurrence.id (throwLeave payload) [] .outward)
  match thrown with
  | .none => .ok (leave state)
  | .terminate => .ok ((state.clearInside occurrence.scope [occurrence.id]).signal
      (.complete occurrence.id (.flows []) [] .outward))
  | .error record =>
    -- `throw.error.message` at admission refuses an expression, the only message the kernel cannot read.
    .ok ((leave state).signal (.raise (.error record.code (record.message.bind ValueSource.literal?)) origin))
  -- An Escalation is not critical: its thrower leaves after the search, unless the catcher interrupts it (`throwerLeaves`).
  | .escalation record => .ok (state.signal (.raise (.escalation record.code) origin))
  | .message record => .ok (throwMessage record occurrence leave state)
  | .signal record => throwSignal ctx payload record origin occurrence state
  | .compensation record => throwCompensation header payload record occurrence state
  | .cancel => .ok ((leave state).signal (.raise .cancel origin))

end Kernel.Feature.Propagation
