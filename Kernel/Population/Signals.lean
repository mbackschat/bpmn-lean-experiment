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
throw occurrence it left by public identifier, which names the instances it starts (`cascadeInstanceId`; without one,
`startedInstanceId` after the command), and the State that threw it, which never receives it again: its own receivers
fired inside the throwing step (M7 OP-A). Plain data, so a host can carry it in a fan-out in progress. -/
structure Emission where
  address : SignalAddress
  variables : List (String × Value)
  businessKey : Option String
  origin : Option OccurrenceRef := none
  emitter : Option String := none

/-- The identity of the instance `emission` starts at `startEvent` of `deploymentId` in the fan-out `commandId` began. -/
def Emission.startedId (emission : Emission) (commandId : String) (deploymentId : Nat) (startEvent : String) : String :=
  match emission.origin with
  | none => startedInstanceId commandId deploymentId startEvent
  | some origin => cascadeInstanceId commandId deploymentId startEvent origin

/-- The emission of an intent a committed step of the instance `emitter` left, its origin by public identifier. -/
def intentEmission (emitter : String) (intent : BroadcastIntent) : Emission :=
  { address := intent.address, variables := intent.variables, businessKey := intent.businessKey
    origin := some intent.origin, emitter := some emitter }

/-- The open Signal items of `address` in one instance's `state` of `program`, by process instance identifier (a called
instance's own), then arming order: none unless the instance is running, and none for the `emitter`'s own State. A
host asks it of each instance a delivery may reach. -/
def signalReceiversOf (program : Program) (state : State) (address : SignalAddress)
    (emitter : Option String) : List OccurrenceRef :=
  if state.status != .running || emitter == some state.instanceId then [] else
    let waiting := (state.openItems.filter fun item => item.kind.view.signal.any (address.matches ·.address)).map
      fun item => (state.instanceOf item.scope, item.id, occurrence program state item)
    let ordered := waiting.mergeSort fun (leftInstance, leftItem, _) (rightInstance, rightItem, _) =>
      decide (leftInstance < rightInstance) || (leftInstance == rightInstance && decide (leftItem ≤ rightItem))
    ordered.map (·.2.2)

/-- The root Signal starts of `program`, deployed as `deploymentId`, that a delivery of `address` carrying `variables`
fires (`Hooks.startsFired`), in document order. -/
def signalStartReceivers (hooks : Hooks) (deploymentId : Nat) (program : Program) (address : SignalAddress)
    (variables : List (String × Value)) : List Receiver :=
  let ctx := Step.context hooks program
  ((program.children none).filterMap Element.start?).filterMap fun (header, _) =>
    let probe : StartInput := { instanceId := "", startEvent := some header.id, trigger := .signal address variables }
    match hooks.startsFired ctx probe with
    | .ok (_ :: _) => some (.start deploymentId (program.publicId header.id).value)
    | .ok [] | .error _ => none

/-- The defined linearization of a delivery's snapshot (population contract §6, CIB-INT-0030): the waiting receivers of
every instance by their process instance identifier, each instance's own in the order its list gives, then the start
receivers of each deployment in deploy order. No process instance identifier spans two instances' lists. -/
def linearizeReceivers (waiting : List (String × List OccurrenceRef)) (starts : List (Nat × List Receiver)) :
    List Receiver :=
  let occurrences := (waiting.flatMap (·.2)).mergeSort fun left right =>
    decide (left.processInstanceId < right.processInstanceId) || left.processInstanceId == right.processInstanceId
  let deployments := starts.mergeSort fun left right => decide (left.1 ≤ right.1)
  occurrences.map .occurrence ++ deployments.flatMap (·.2)

/-- The receivers of `emission` when its delivery begins: `signalReceiversOf` each instance and `signalStartReceivers`
each key's current deployment, linearized; and the programs of the instances and deployments it reaches. A receiver
armed later in the delivery is not reached. -/
def receiversOf (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (emission : Emission) :
    List Receiver × List Program :=
  let waiting := instances.map fun member =>
    (member, signalReceiversOf member.deployment.program member.state emission.address emission.emitter)
  let starts := (currentDeployments registry).map fun deployment =>
    (deployment, signalStartReceivers hooks deployment.deploymentId deployment.program emission.address emission.variables)
  let reached := (waiting.filter (!·.2.isEmpty)).map (·.1.deployment.program) ++
    (starts.filter (!·.2.isEmpty)).map (·.1.program)
  (linearizeReceivers (waiting.map fun (member, refs) => (member.state.instanceId, refs))
    (starts.map fun (deployment, receivers) => (deployment.deploymentId, receivers)), reached)

/-- What reaching an occurrence of one instance did: nothing when it is no longer a receiver of the address, read off
the open items and never off a Step failure (R8), else the step of its broadcast delivery. -/
inductive OccurrenceReach where
  | skipped
  | stepped (outcome : Outcome)

/-- Reach `target` in `state`, an instance of `program`, with a broadcast delivery of `address` at `atMs`: the only
place a delivery takes the `broadcast` reach. -/
def reachOccurrence (hooks : Hooks) (program : Program) (state : State) (address : SignalAddress)
    (variables : List (String × Value)) (target : OccurrenceRef) (atMs : Nat) : OccurrenceReach :=
  if (signalReceiversOf program state address none).contains target then
    .stepped (Step.step hooks program (some state)
      (.deliver { occurrence := target, trigger := .signal address .broadcast, variables, atMs := some atMs }))
  else .skipped

/-- What a fan-out still has to do, first item first: reach a receiver, or take the snapshot of an intent the
instance `emitter` left, its origin by public identifier, and reach its receivers. -/
inductive Pending where
  | receiver (emission : Emission) (receiver : Receiver)
  | intent (emitter : String) (intent : BroadcastIntent)

/-- A fan-out in progress as plain data (population contract §5): its command, the work still to do, the entries so
far, newest first so that adding one costs the same however long a cascade runs, how many receivers it may still reach
and whether the cascade bound stopped it. -/
structure FanOutMachine where
  commandId : String
  pending : List Pending
  reversed : List FanOutEntry := []
  budget : Nat := cascadeBound
  stopped : Bool := false

/-- The next thing a fan-out needs: a receiver reached, an intent's snapshot taken, or nothing more. -/
inductive FanOutNext where
  | reach (receiver : Receiver) (emission : Emission)
  | snapshot (intent : BroadcastIntent) (emission : Emission)
  | done (entries : List FanOutEntry)

/-- A fan-out of `commandId` over `root`, which may reach `budget` receivers. -/
def fanOutBegin (commandId : String) (root : List Pending) (budget : Nat) : FanOutMachine :=
  { commandId, pending := root, budget }

/-- The entries in the order the fan-out reached them. -/
def FanOutMachine.entries (machine : FanOutMachine) : List FanOutEntry :=
  machine.reversed.reverse

def FanOutMachine.add (machine : FanOutMachine) (entry : FanOutEntry) : FanOutMachine :=
  { machine with reversed := entry :: machine.reversed }

/-- Stop at `receiver`: the cascade bound is reached, receivers already committed stay committed. -/
def FanOutMachine.stop (machine : FanOutMachine) (receiver : Receiver) : FanOutMachine :=
  -- dynamic-only: how far a cascade runs depends on the population and its run
  { machine.add (.failed receiver (.unsupported "population-cascade-bound")) with stopped := true, pending := [] }

/-- Spend one of the fan-out's receivers on `receiver`: `false` when the fan-out has stopped or stops now at it. -/
def FanOutMachine.spend (machine : FanOutMachine) (receiver : Receiver) : FanOutMachine × Bool :=
  if machine.stopped then (machine, false)
  else if machine.budget == 0 then (machine.stop receiver, false)
  else ({ machine with budget := machine.budget - 1 }, true)

/-- The machine stopped at its next receiver when no receiver is left to spend, else as it is. -/
def FanOutMachine.stopWhenSpent (machine : FanOutMachine) : FanOutMachine :=
  match machine.pending with
  | .receiver _ receiver :: _ => if !machine.stopped && machine.budget == 0 then machine.stop receiver else machine
  | .intent _ _ :: _ => machine
  | [] => machine

/-- What the fan-out needs next. Past `cascadeBound` receivers it is done, its last entry
`failed {receiver, unsupported, population-cascade-bound}`. -/
def fanOutNext (machine : FanOutMachine) : FanOutNext :=
  let machine := machine.stopWhenSpent
  if machine.stopped then .done machine.entries else
    match machine.pending with
    | [] => .done machine.entries
    | .receiver emission receiver :: _ => .reach receiver emission
    | .intent emitter intent :: _ => .snapshot intent (intentEmission emitter intent)

/-- Take the snapshot of the intent `fanOutNext` named: its `receivers`, in `order` when given, which must name each of
them exactly once (`discovery-order-mismatch`), go first, before the rest. -/
def fanOutSnapshot (machine : FanOutMachine) (receivers : List Receiver) (order : Option (List Receiver)) :
    Except String FanOutMachine :=
  match machine.pending with
  | .intent emitter intent :: rest =>
    match inOrder id receivers order with
    | none => .error "discovery-order-mismatch"
    | some ordered => .ok { machine with pending := ordered.map (.receiver (intentEmission emitter intent)) ++ rest }
  | .receiver _ _ :: _ | [] => .error "fan-out-not-at-snapshot"

/-- Record the entry of the receiver `fanOutNext` named and the intents its committed step in the instance `emitter`
left, origins by public identifier: they go first, depth-first, before the next receiver. -/
def fanOutRecord (machine : FanOutMachine) (entry : FanOutEntry) (intents : List BroadcastIntent) (emitter : String) :
    FanOutMachine :=
  match machine.pending with
  | .receiver _ _ :: rest =>
    { machine.add entry with budget := machine.budget - 1, pending := intents.map (.intent emitter) ++ rest }
  | .intent _ _ :: _ | [] => machine

/-- A fan-out over the population's instances. -/
structure Fanning where
  instances : List Instance
  machine : FanOutMachine

/-- A fan-out of `commandId` over `instances` with nothing to do yet, which may reach `budget` receivers. -/
def fanningOf (commandId : String) (instances : List Instance) (budget : Nat := cascadeBound) : Fanning :=
  { instances, machine := fanOutBegin commandId [] budget }

def Fanning.add (fanning : Fanning) (entry : FanOutEntry) : Fanning :=
  { fanning with machine := fanning.machine.add entry }

def Fanning.entries (fanning : Fanning) : List FanOutEntry :=
  fanning.machine.entries

def Fanning.spend (fanning : Fanning) (receiver : Receiver) : Fanning × Bool :=
  let (machine, reachable) := fanning.machine.spend receiver
  ({ fanning with machine }, reachable)

/-- The intents a committed step of `state`, an instance of `program`, left, origins by public identifier. -/
def publicIntents (program : Program) (state : State) : List BroadcastIntent :=
  state.outbox.map fun intent => { intent with origin := { intent.origin with element := program.publicId intent.origin.element } }

/-- Reach one receiver at `atMs` in the fan-out `commandId` began: an occurrence by `reachOccurrence` in the instance
it is waiting in, `skipped` when none still waits there; a start starts its instance. Answers the instances, the
receiver's entry and, when it committed, its State and program, whose intents cascade. -/
def reachReceiver (hooks : Hooks) (registry : List Deployment) (atMs : Nat) (commandId : String)
    (instances : List Instance) (emission : Emission) :
    Receiver → Except String (List Instance × FanOutEntry × Option (State × Program))
  | .occurrence target =>
    let found : Option (Instance × Nat × Outcome) := instances.zipIdx.findSome? fun (member, index) =>
      match reachOccurrence hooks member.deployment.program member.state emission.address emission.variables target atMs with
      | .skipped => none
      | .stepped outcome => some (member, index, outcome)
    match found with
    | none => pure (instances, .skipped target, none)
    | some (member, index, .ok state) =>
      pure (instances.set index { member with state }, .delivered target, some (state, member.deployment.program))
    | some (_, _, .error failure) => pure (instances, .failed (.occurrence target) failure, none)
  | .start deploymentId startEvent => do
    let some deployment := registry.find? (·.deploymentId == deploymentId) | throw "receiver-without-deployment"
    let program := deployment.program
    let some (header, _) := ((program.children none).filterMap Element.start?).find? fun (header, _) =>
        (program.publicId header.id).value == startEvent
      | throw "receiver-without-start"
    let (started, entry) ← startInstance hooks deployment startEvent
      { instanceId := emission.startedId commandId deploymentId startEvent, startEvent := some header.id
        trigger := .signal emission.address emission.variables, businessKey := emission.businessKey, atMs := some atMs }
    pure (instances ++ started.toList, entry, started.map fun member => (member.state, program))

/-- Enough items for any fan-out: it takes at most `cascadeBound + 1` receivers, the last stopping it, of which at most
`cascadeBound` commit, and each committed step, the one that began the fan-out included, leaves at most one intent per
micro-step, so at most `Step.closureBound + 1`. -/
def pendingFuel : Nat := (cascadeBound + 1) * (Step.closureBound + 2)

/-- Run the fan-out's machine to its end at `atMs`, each receiver its own unit of commitment (population contract §5):
a committed receiver's intents go first, depth-first, each taking its snapshot (`receiversOf`) when its own delivery
begins, before the next receiver. The work list is the machine's, so a long cascade needs no deep stack. -/
def fanOut (hooks : Hooks) (registry : List Deployment) (atMs : Nat) : Nat → Fanning → Except String Fanning
  | fuel, fanning =>
    let machine := fanning.machine.stopWhenSpent
    let fanning := { fanning with machine }
    match fanOutNext machine, fuel with
    | .done _, _ => pure fanning
    -- `pendingFuel` bounds every fan-out, so running out of it is a harness defect.
    | .reach _ _, 0 | .snapshot _ _, 0 => throw "population-fan-out-fuel"
    | .snapshot _ emission, fuel + 1 =>
      match fanOutSnapshot machine (receiversOf hooks registry fanning.instances emission).1 none with
      | .error code => throw code
      | .ok machine => fanOut hooks registry atMs fuel { fanning with machine }
    | .reach receiver emission, fuel + 1 =>
      match reachReceiver hooks registry atMs machine.commandId fanning.instances emission receiver with
      | .error code => throw code
      | .ok (instances, entry, committed) =>
        let (emitter, intents) := match committed with
          | some (state, program) => (state.instanceId, publicIntents program state)
          | none => ("", [])
        fanOut hooks registry atMs fuel { instances, machine := fanOutRecord machine entry intents emitter }

/-- Deliver the intents a committed step of `state`, an instance of `program`, left, before the fan-out's other work. -/
def cascade (hooks : Hooks) (registry : List Deployment) (atMs : Nat) (fanning : Fanning) (state : State)
    (program : Program) : Except String Fanning :=
  let pending := (publicIntents program state).map (.intent state.instanceId) ++ fanning.machine.pending
  fanOut hooks registry atMs pendingFuel { fanning with machine := { fanning.machine with pending } }

/-- The cascade of the intents the last committed step of the instance `instanceId` left, which may reach `budget`
receivers, in the cascade `commandId` began. -/
def cascadeOf (hooks : Hooks) (registry : List Deployment) (commandId : String) (atMs budget : Nat)
    (instances : List Instance) (instanceId : String) : Except String Fanning := do
  let some member := instances.find? (·.state.instanceId == instanceId) | throw "cascade-without-instance"
  cascade hooks registry atMs (fanningOf commandId instances budget) member.state member.deployment.program

/-- A command's resolution followed by the cascade of the intents its one committed step left, after that step: a
delivery's (`delivered` names its root instance) into `committed`'s `cascade`, a single start's into its `fanOut`, for
the commands that deliver or start at most once (`publish`, `timerStart`); every other resolution as it is. A start's
cascade may reach `cascadeBound - 1` receivers, since its `started` entry is itself one the bound counts, and a
delivery's target is not. -/
def cascadeCommitted (hooks : Hooks) (registry : List Deployment) (commandId : String) (atMs : Nat)
    (instances : List Instance) (delivered : Option String) : Resolution → Except String (List Instance × Resolution)
  | .committed target _ => do
    let some instanceId := delivered | throw "delivery-without-instance"
    let fanning ← cascadeOf hooks registry commandId atMs cascadeBound instances instanceId
    pure (fanning.instances, .committed target fanning.entries)
  | .fanOut [.started instanceId deploymentId version startEvent] => do
    let fanning ← cascadeOf hooks registry commandId atMs (cascadeBound - 1) instances instanceId
    pure (fanning.instances, .fanOut (.started instanceId deploymentId version startEvent :: fanning.entries))
  | .fanOut entries => pure (instances, .fanOut entries)
  | .failed target failure => pure (instances, .failed target failure)
  | .noMatch => pure (instances, .noMatch)
  | .ambiguous => pure (instances, .ambiguous)
  | .rejected code => pure (instances, .rejected code)
  | .unsupported code => pure (instances, .unsupported code)

/-- Broadcast a Signal at `atMs` (PC-SIGNAL-04): every receiver of its address in the snapshot, in the command's
`order` or the defined linearization, each its own unit of commitment, the instances it starts named after the command
(`startedInstanceId`) and carrying no business key. A broadcast with variables that reaches a program under
`signalPayload = none` is `rejected broadcast-variables-not-admitted` before any receiver, an `order` that is no
permutation of the snapshot `rejected discovery-order-mismatch`. -/
def broadcast (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (atMs : Nat) (sent : Broadcast) :
    Except String (List Instance × Resolution) := do
  let emission : Emission := { address := sent.address, variables := sent.variables, businessKey := none }
  let (snapshot, programs) := receiversOf hooks registry instances emission
  if !sent.variables.isEmpty && programs.any (·.options.signalPayload == SignalPayload.none) then
    return (instances, .rejected "broadcast-variables-not-admitted")
  let some ordered := inOrder id snapshot sent.order | return (instances, .rejected "discovery-order-mismatch")
  let machine := fanOutBegin sent.commandId (ordered.map (.receiver emission)) cascadeBound
  let fanning ← fanOut hooks registry atMs pendingFuel { instances, machine }
  pure (fanning.instances, .fanOut fanning.entries)

end Kernel.Population
