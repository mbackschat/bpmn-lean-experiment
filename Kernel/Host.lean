module

public import Kernel.Hooks

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

/-- Every subscription a program declares: catch Events, boundaries, starts and Event Sub-Process starts. -/
def subscriptions (program : Program) : List Subscription :=
  program.elements.flatMap fun element =>
    let boundaries := (element.envelope?.map (·.boundaries)).getD [] |>.map (·.subscription)
    let catching := ((element.event?.bind fun (_, event) => event.catch?)).toList
    let starting := ((element.start?.bind (·.2.subscription))).toList
    let eventStart := ((element.scope?.bind fun (_, scope) => scope.kind.start?)).toList
    boundaries ++ catching ++ starting ++ eventStart

def activityWork (program : Program) : List Work :=
  program.elements.filterMap fun element => element.activity?.map (·.2.work)

def hostRequirements (program : Program) : Requirements :=
  let triggers := (subscriptions program).map (·.trigger)
  let work := activityWork program
  let timers := triggers.any (·.timer?.isSome)
  let messages := triggers.any (·.message?.isSome) || work.any (·.receive?.isSome)
  let effects := work.any (·.isService)
  let userTasks := work.any (·.isUser)
  let calls := work.any (·.call?.isSome)
  let waits := timers || messages || effects || userTasks || calls
  { timers, messages, effects, userTasks, calls, maxConcurrentWaits := if waits then none else some 0 }

/-- A start the host can offer: a none start, a Message start on its channel, or a Timer start. -/
structure StartCapability where
  startEventId : ElementId
  channel : Option MessageChannel := none
  timer : Option TimerSchedule := none
  deriving Repr

/-- `relations` are the profile's register entries, as provenance a host can show. -/
structure Capabilities where
  starts : List StartCapability
  correlatedChannels : List MessageChannel
  relations : List String
  deriving Repr

def definitionCapabilities (program : Program) : Capabilities :=
  let starts := (program.children none).filterMap (·.start?) |>.map fun (header, payload) =>
    let trigger := payload.subscription.map (·.trigger)
    { startEventId := header.id
      channel := (trigger.bind (·.message?)).bind (·.channel?)
      timer := trigger.bind (·.timer?) |>.map (·.schedule) : StartCapability }
  let correlated := (subscriptions program).filterMap fun subscription =>
    subscription.trigger.message?.bind fun trigger =>
      if trigger.correlation.isEmpty then none else trigger.channel?
  { starts, correlatedChannels := correlated, relations := program.options.relations }

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
