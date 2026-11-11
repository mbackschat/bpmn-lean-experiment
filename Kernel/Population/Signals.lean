module

public import Kernel.Population.Messages

/-! # Population: Signal fan-out

A Signal reaches every receiver of the population one at a time, each its own unit of commitment: an API broadcast,
and the intent a committed step's throw leaves, which cascades depth-first (PC-SIGNAL-04, population contract §5, §6,
[specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
-/

public section

namespace Kernel.Population

/-- `Step.closureBound`'s value (D-CASCADE): how many receivers one stimulus reaches, its cascades included; a semantic
limit, not a guard bound. -/
def cascadeBound : Nat := Step.closureBound

/-- Whether two receivers are one. -/
def Receiver.same : Receiver → Receiver → Bool
  | .occurrence left, .occurrence right => left == right
  | .start leftDeployment leftStart, .start rightDeployment rightStart =>
    leftDeployment == rightDeployment && leftStart == rightStart
  | .occurrence _, .start _ _ | .start _ _, .occurrence _ => false

/-- `listed` in the order a command's `order` gives, which must name each of them exactly once; without one, as listed
(population contract §6). `none` when the order is no such permutation (`discovery-order-mismatch`). -/
def inOrder {α : Type} (receiver : α → Receiver) (listed : List α) : Option (List Receiver) → Option (List α)
  | none => some listed
  | some order =>
    let once := listed.all fun item => (order.filter (·.same (receiver item))).length == 1
    if order.length == listed.length && once then
      some (order.filterMap fun named => listed.find? fun item => named.same (receiver item))
    else none

/-- A Signal on its way to the population: its address and variables, the business key of the instances it starts, the
identity of the instance it starts at a deployment's start Event, and the State that threw it, which never receives it
again: its own receivers fired inside the throwing step (M7 OP-A). -/
structure Emission where
  address : SignalAddress
  variables : List (String × Value)
  businessKey : Option String
  startedId : Nat → String → String
  emitter : Option String

/-- The receivers of `emission` when its delivery begins (population contract §6), each with the program it runs: the
open Signal items of its address in running instances other than the emitter's, by process instance identifier, then
arming order; then the root Signal starts of its address in each key's current deployment, in deploy order, then
document order. A receiver armed later in the delivery is not reached. -/
def receiversOf (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (emission : Emission) :
    List (Receiver × Program) :=
  let waiting := instances.flatMap fun member =>
    if member.state.status != .running || emission.emitter == some member.state.instanceId then [] else
      (member.state.openItems.filter fun item => item.kind.view.signal.any (emission.address.matches ·.address)).map
        fun item => (member.state.instanceOf item.scope, item.id, occurrence member.deployment.program member.state item,
          member.deployment.program)
  let ordered := waiting.mergeSort fun (leftInstance, leftItem, _, _) (rightInstance, rightItem, _, _) =>
    decide (leftInstance < rightInstance) || (leftInstance == rightInstance && decide (leftItem ≤ rightItem))
  let starts := (currentDeployments registry).flatMap fun deployment =>
    let ctx := Step.context hooks deployment.program
    ((deployment.program.children none).filterMap Element.start?).filterMap fun (header, _) =>
      let probe : StartInput :=
        { instanceId := "", startEvent := some header.id, trigger := .signal emission.address emission.variables }
      match hooks.startsFired ctx probe with
      | .ok (_ :: _) => some (.start deployment.deploymentId (deployment.program.publicId header.id).value, deployment.program)
      | .ok [] | .error _ => none
  ordered.map (fun (_, _, ref, program) => (.occurrence ref, program)) ++ starts

/-- The emission of the intent a committed step of `state`, an instance of `program`, left in the cascade the command
`commandId` began: the instances it starts are named after the throw's own occurrence (`cascadeInstanceId`). -/
def intentEmission (commandId : String) (program : Program) (state : State) (intent : BroadcastIntent) : Emission :=
  let emitter := { intent.origin with element := program.publicId intent.origin.element }
  { address := intent.address, variables := intent.variables, businessKey := intent.businessKey
    startedId := fun deploymentId startEvent => cascadeInstanceId commandId deploymentId startEvent emitter
    emitter := some state.instanceId }

/-- An intent's emission and its receivers when its delivery begins. -/
def intentReceivers (hooks : Hooks) (registry : List Deployment) (commandId : String) (instances : List Instance)
    (program : Program) (state : State) (intent : BroadcastIntent) : Emission × List Receiver :=
  let emission := intentEmission commandId program state intent
  (emission, (receiversOf hooks registry instances emission).map (·.1))

/-- A fan-out in progress: the population's instances, the entries so far, newest first so that adding one costs the
same however long a cascade runs, how many receivers it may still reach and whether the cascade bound stopped it. -/
structure Fanning where
  instances : List Instance
  reversed : List FanOutEntry := []
  budget : Nat := cascadeBound
  stopped : Bool := false

def Fanning.add (fanning : Fanning) (entry : FanOutEntry) : Fanning :=
  { fanning with reversed := entry :: fanning.reversed }

/-- The entries in the order the fan-out reached them. -/
def Fanning.entries (fanning : Fanning) : List FanOutEntry :=
  fanning.reversed.reverse

/-- Stop at `receiver`: the cascade bound is reached, receivers already committed stay committed. -/
def Fanning.stop (fanning : Fanning) (receiver : Receiver) : Fanning :=
  -- dynamic-only: how far a cascade runs depends on the population and its run
  { fanning.add (.failed receiver (.unsupported "population-cascade-bound")) with stopped := true }

/-- Spend one of the fan-out's receivers on `receiver`: `false` when the fan-out has stopped or stops now at it. -/
def Fanning.spend (fanning : Fanning) (receiver : Receiver) : Fanning × Bool :=
  if fanning.stopped then (fanning, false)
  else if fanning.budget == 0 then (fanning.stop receiver, false)
  else ({ fanning with budget := fanning.budget - 1 }, true)

/-- Reach one receiver at `atMs`. An occurrence still open in a running instance takes a broadcast delivery, one gone
since the snapshot is `skipped`, read off the open items and never off a Step failure (R8); a start starts its
instance. Answers the fan-out with the receiver's entry and, when it committed, its State and program, whose intents
cascade. -/
def reach (hooks : Hooks) (registry : List Deployment) (atMs : Nat) (fanning : Fanning) (emission : Emission) :
    Receiver → Except String (Fanning × Option (State × Program))
  | .occurrence target =>
    let waiting (member : Instance) : Bool := member.state.status == .running && member.state.openItems.any fun item =>
      item.kind.view.signal.any (emission.address.matches ·.address) &&
        occurrence member.deployment.program member.state item == target
    match fanning.instances.findIdx? waiting with
    | none => pure (fanning.add (.skipped target), none)
    | some index =>
      match fanning.instances[index]? with
      | none => throw "receiver-without-instance"
      | some member =>
        let delivery : Input := .deliver { occurrence := target, trigger := .signal emission.address .broadcast
                                           variables := emission.variables, atMs := some atMs }
        match Step.step hooks member.deployment.program (some member.state) delivery with
        | .ok state =>
          pure ({ fanning.add (.delivered target) with instances := fanning.instances.set index { member with state } },
            some (state, member.deployment.program))
        | .error failure => pure (fanning.add (.failed (.occurrence target) failure), none)
  | .start deploymentId startEvent => do
    let some deployment := registry.find? (·.deploymentId == deploymentId) | throw "receiver-without-deployment"
    let program := deployment.program
    let some (header, _) := ((program.children none).filterMap Element.start?).find? fun (header, _) =>
        (program.publicId header.id).value == startEvent
      | throw "receiver-without-start"
    let (started, entry) ← startInstance hooks deployment startEvent
      { instanceId := emission.startedId deploymentId startEvent, startEvent := some header.id
        trigger := .signal emission.address emission.variables, businessKey := emission.businessKey, atMs := some atMs }
    pure ({ fanning.add entry with instances := fanning.instances ++ started.toList },
      started.map fun member => (member.state, program))

/-- What a fan-out still has to do, first item first: reach a receiver, or take the snapshot of an intent a committed
step left and reach its receivers. -/
inductive Pending where
  | receiver (emission : Emission) (receiver : Receiver)
  | intent (program : Program) (state : State) (intent : BroadcastIntent)

/-- Enough items for any fan-out: it takes at most `cascadeBound + 1` receivers, the last stopping it, of which at most
`cascadeBound` commit, and each committed step, the one that began the fan-out included, leaves at most one intent per
micro-step, so at most `Step.closureBound + 1`. -/
def pendingFuel : Nat := (cascadeBound + 1) * (Step.closureBound + 2)

/-- Work off `pending` in order, each receiver its own unit of commitment (population contract §5): a committed
receiver's intents go first, depth-first, each taking its snapshot when its own delivery begins, before the next
receiver. Past `cascadeBound` receivers the fan-out stops with `failed {receiver, unsupported,
population-cascade-bound}` and the rest is dropped. A list, not recursion per intent, so a long cascade needs no deep
stack. -/
def fanOut (hooks : Hooks) (registry : List Deployment) (commandId : String) (atMs : Nat) :
    Nat → Fanning → List Pending → Except String Fanning
  | _, fanning, [] => pure fanning
  -- `pendingFuel` bounds every fan-out, so running out of it is a harness defect.
  | 0, _, _ :: _ => throw "population-fan-out-fuel"
  | fuel + 1, fanning, .intent program state intent :: rest =>
    let (emission, receivers) := intentReceivers hooks registry commandId fanning.instances program state intent
    fanOut hooks registry commandId atMs fuel fanning (receivers.map (.receiver emission) ++ rest)
  | fuel + 1, fanning, .receiver emission receiver :: rest => do
    let (fanning, reachable) := fanning.spend receiver
    if !reachable then return fanning
    let (fanning, committed) ← reach hooks registry atMs fanning emission receiver
    let intents := match committed with
      | some (state, program) => state.outbox.map (.intent program state)
      | none => []
    fanOut hooks registry commandId atMs fuel fanning (intents ++ rest)

/-- Deliver the intents a committed step of `state`, an instance of `program`, left, in the cascade `commandId` began. -/
def cascade (hooks : Hooks) (registry : List Deployment) (commandId : String) (atMs : Nat) (fanning : Fanning)
    (state : State) (program : Program) : Except String Fanning :=
  fanOut hooks registry commandId atMs pendingFuel fanning (state.outbox.map (.intent program state))

/-- A single start's resolution followed by the cascade of the intents its instance's start step left, for the
commands that start at most one instance (`publish`, `timerStart`); every other resolution as it is. -/
def cascadeStarted (hooks : Hooks) (registry : List Deployment) (commandId : String) (atMs : Nat)
    (instances : List Instance) : Resolution → Except String (List Instance × Resolution)
  | .fanOut [.started instanceId deploymentId version startEvent] => do
    let some member := instances.find? (·.state.instanceId == instanceId) | throw "started-without-instance"
    let fanning ← cascade hooks registry commandId atMs { instances, budget := cascadeBound - 1 } member.state
      member.deployment.program
    pure (fanning.instances, .fanOut (.started instanceId deploymentId version startEvent :: fanning.entries))
  | resolution => pure (instances, resolution)

/-- Broadcast a Signal at `atMs` (PC-SIGNAL-04): every receiver of its address in the snapshot, in the command's
`order` or the defined linearization, each its own unit of commitment, the instances it starts named after the command
(`startedInstanceId`) and carrying no business key. A broadcast with variables that reaches a program under
`signalPayload = none` is `rejected broadcast-variables-not-admitted` before any receiver, an `order` that is no
permutation of the snapshot `rejected discovery-order-mismatch`. -/
def broadcast (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (atMs : Nat) (sent : Broadcast) :
    Except String (List Instance × Resolution) := do
  let emission : Emission := { address := sent.address, variables := sent.variables, businessKey := none
                               startedId := startedInstanceId sent.commandId, emitter := none }
  let snapshot := receiversOf hooks registry instances emission
  if !sent.variables.isEmpty && snapshot.any (·.2.options.signalPayload == SignalPayload.none) then
    return (instances, .rejected "broadcast-variables-not-admitted")
  let some ordered := inOrder (·.1) snapshot sent.order | return (instances, .rejected "discovery-order-mismatch")
  let fanning ← fanOut hooks registry sent.commandId atMs pendingFuel { instances } (ordered.map (.receiver emission ·.1))
  pure (fanning.instances, .fanOut fanning.entries)

end Kernel.Population
