module

public import Kernel.Hooks
public import Kernel.IL.Timer

/-! # Host interface

The adapter sees the kernel only through these projections ([proposal](../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#host-interface)):
what a program needs from its host, what a definition offers before any instance runs, and the open waits and
occurrence facts of a state. Matches no guarded type; every wait is read through `OpenKind.view`.
-/

public section

namespace Kernel.Host

/-- What a program needs from its host. `maxConcurrentWaits` is `none` when the shape bounds nothing, which is every
program with a wait: tokens can multiply through implicit splits and loops, and no finer bound is selected. -/
structure Requirements where
  timers : Bool
  messages : Bool
  effects : Bool
  userTasks : Bool
  calls : Bool
  maxConcurrentWaits : Option Nat
  deriving Repr

/-- Every subscription a program declares, with the element that declares it: catch Events, boundaries, starts and
Event Sub-Process starts (declared by the Event Sub-Process). -/
def subscriptions (program : Program) : List (ElementId × Subscription) :=
  program.elements.flatMap fun element =>
    let boundaries := (element.envelope?.map (·.boundaries)).getD [] |>.map fun boundary =>
      (boundary.id, boundary.subscription)
    let catching := ((element.event?.bind fun (_, event) => event.catch?)).toList
    let starting := ((element.start?.bind (·.2.subscription))).toList
    let eventStart := ((element.scope?.bind fun (_, scope) => scope.kind.start?)).toList
    boundaries ++ (catching ++ starting ++ eventStart).map (element.header.id, ·)

def activityWork (program : Program) : List Work :=
  program.elements.filterMap fun element => element.activity?.map (·.2.work)

def hostRequirements (program : Program) : Requirements :=
  let triggers := (subscriptions program).map (·.2.trigger)
  let work := activityWork program
  let timers := triggers.any (·.timer?.isSome)
  let messages := triggers.any (·.message?.isSome) || work.any (·.receive?.isSome)
  let effects := work.any (·.isService)
  let userTasks := work.any (·.isUser)
  let calls := work.any (·.call?.isSome)
  let waits := timers || messages || effects || userTasks || calls
  { timers, messages, effects, userTasks, calls, maxConcurrentWaits := if waits then none else some 0 }

/-- A start the host can offer: a none start, a Message start on its channel, or a Timer start with its resolved
schedule (`Kernel.Timer.resolve`). -/
structure StartCapability where
  startEventId : ElementId
  channel : Option MessageChannel := none
  timer : Option Timer.Resolved := none
  deriving Repr

/-- A correlated Message subscription as its host routes to it: the public identifier of the element that declares it
and its criteria, each a correlation key and the expression bound to its value, which the kernel evaluates in the
waiting instance when a delivery is matched (`Hooks.correlates`), never the host. -/
structure CorrelatedCatch where
  element : ElementId
  criteria : List CorrelationCriterion
  deriving Repr

/-- The correlated subscriptions on one Message channel. -/
structure CorrelatedChannel where
  channel : MessageChannel
  catches : List CorrelatedCatch
  deriving Repr

/-- `relations` are the profile's register entries, as provenance a host can show. -/
structure Capabilities where
  starts : List StartCapability
  correlatedChannels : List CorrelatedChannel
  relations : List String
  deriving Repr

/-- `catches` grouped by channel, each channel once, in the order of its first catch. -/
def byChannel (catches : List (MessageChannel × CorrelatedCatch)) : List CorrelatedChannel :=
  catches.foldl (fun grouped (channel, entry) =>
    if grouped.any (·.channel == channel) then
      grouped.map fun group =>
        if group.channel == channel then { group with catches := group.catches ++ [entry] } else group
    else grouped ++ [{ channel, catches := [entry] }]) []

/-- A Timer start whose schedule does not resolve offers nothing: admission refuses it (`timer.*`), so an admitted
program's every Timer start is offered. -/
def definitionCapabilities (program : Program) : Capabilities :=
  let starts := (program.children none).filterMap (·.start?) |>.filterMap fun (header, payload) =>
    let trigger := payload.subscription.map (·.trigger)
    let offered (timer : Option Timer.Resolved) : StartCapability :=
      { startEventId := header.id, channel := (trigger.bind (·.message?)).bind (·.channel?), timer }
    match trigger.bind (·.timer?) with
    | none => some (offered none)
    | some timer => (Timer.resolve timer.schedule).toOption.map (offered ∘ some)
  let correlated := (subscriptions program).filterMap fun (element, subscription) =>
    subscription.trigger.message?.bind fun trigger =>
      if trigger.correlation.isEmpty then none
      else trigger.channel?.map ((·, { element := program.publicId element, criteria := trigger.correlation }))
  { starts, correlatedChannels := byChannel correlated, relations := program.options.relations }

/-- One open wait: its public occurrence identity, the called definition it runs in (`none` in the root instance, whose
definition is the program's) and its view. -/
structure OpenWait where
  id : OccurrenceRef
  definition : Option DefinitionRef
  view : WaitView
  deriving Repr

structure View where
  status : InstanceStatus
  failure : Option InstanceFailure
  openWaits : List OpenWait
  journal : List Transition
  deriving Repr

def publicRef (program : Program) (ref : OccurrenceRef) : OccurrenceRef :=
  { ref with element := program.publicId ref.element }

def publicKey (program : Program) (key : OccurrenceKey) : OccurrenceKey :=
  { key with element := program.publicId key.element }

def publicTransition (program : Program) (transition : Transition) : Transition :=
  { transition with
    element := transition.element.map program.publicId
    started := transition.started.map fun fact => { fact with occurrence := publicKey program fact.occurrence }
    ended := transition.ended.map fun (key, terminal) => (publicKey program key, terminal) }

def publicFailure (program : Program) (failure : InstanceFailure) : InstanceFailure :=
  { failure with
    occurrence := publicRef program failure.occurrence
    related := failure.related.map fun (name, ref) => (name, publicRef program ref) }

def openWait (program : Program) (state : State) (item : OpenItem) : OpenWait :=
  { id := publicRef program { processInstanceId := state.instanceOf item.scope, element := item.element
                              activation := ((state.occurrence? item.occurrence).map (·.activation)).getD 0 }
    definition := (state.slots.instances.find? (·.root == state.instanceRoot item.scope)).bind (·.definition)
    view := item.kind.view }

def hostView (program : Program) (state : State) : View :=
  { status := state.status, failure := state.failure.map (publicFailure program)
    openWaits := state.openItems.map (openWait program state)
    journal := state.journal.map (publicTransition program) }

end Kernel.Host
