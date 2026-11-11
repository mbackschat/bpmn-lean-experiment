module

public import Kernel.Population.Deploy
public import Kernel.Step

/-! # Population: Message publications

Routing a Message publication across the population with exact cardinality: to a waiting subscription, else to a root
Message start ([specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
-/

public section

namespace Kernel.Population

def occurrence (program : Program) (state : State) (item : OpenItem) : OccurrenceRef :=
  { processInstanceId := state.instanceOf item.scope, element := program.publicId item.element
    activation := ((state.occurrence? item.occurrence).map (·.activation)).getD 0 }

/-- The open subscriptions of one instance of `program` that `Hooks.correlates` accepts for a delivery on `channel`
carrying `correlation`, by public occurrence identity; a subscription whose key cannot be evaluated is no match. A host
that routes a publication across instances asks it of each instance. -/
def matching (hooks : Hooks) (program : Program) (state : State) (channel : MessageChannel)
    (correlation : List CorrelationMatch) : List OccurrenceRef :=
  let ctx := Step.context hooks program
  let accepted := state.openItems.filter fun item =>
    match hooks.correlates ctx item channel correlation state with
    | .ok accepts => accepts
    | .error _ => false
  accepted.map (occurrence program state)

/-- The open Message subscriptions of one instance of `program` a publication reaches, each with the channel its
delivery names: those on the publication's channel, or, for a name, those that resolved that name when they opened
(only under `MessageNames.addresses`, CIB-LIM-0022), on their own channel. Each must accept the criteria
(`Hooks.correlates`; a key that cannot be evaluated is no match) and, when the publication carries a business key,
belong to an instance with that key, a called instance's own (CIB `processInstanceBusinessKey`). -/
def receivers (hooks : Hooks) (program : Program) (state : State) (publication : Publication) :
    List (OccurrenceRef × MessageChannel) :=
  let ctx := Step.context hooks program
  state.openItems.filterMap fun item =>
    let view := item.kind.view
    let channel? := match publication.message with
      | .channel channel => some channel
      | .name name => if view.name == some name then view.channel else none
    let keyed := publication.businessKey.all fun key =>
      ((state.slots.instances.find? (·.root == state.instanceRoot item.scope)).bind (·.businessKey)) == some key
    channel?.bind fun channel =>
      match hooks.correlates ctx item channel publication.criteria state with
      | .ok true => if keyed then some (occurrence program state item, channel) else none
      | .ok false | .error _ => none

/-- The root Message starts a publication reaches in `scope`, or, without one, in the current deployment of every key
(CIB-INT-0031), each with its deployment and channel: those on the publication's channel, or, for a name, those whose
literal name it is under the deployment's `MessageNames.addresses` (CIB-LIM-0022). -/
def startCandidates (registry : List Deployment) (scope : Option Deployment) (message : MessageAddress) :
    List (Deployment × ElementId × MessageChannel) :=
  let deployments : List Deployment := match scope with
    | some deployment => [deployment]
    | none => (registry.map (·.key)).eraseDups.filterMap (current registry)
  deployments.flatMap fun deployment =>
    (messageStarts deployment.program).filterMap fun ((header, trigger) : Header × MessageTrigger) =>
      let reached : Bool := match message with
        | .channel channel => trigger.channel == channel
        | .name name =>
          deployment.program.options.messageNames == .addresses && (trigger.name.bind ValueSource.literal?) == some name
      if reached then some (deployment, header.id, trigger.channel) else none

/-- The deployment a selector names: the current deployment of a key, or one registered deployment; `some none` for
no selector, `none` for a selector naming no registered deployment. -/
def selected (registry : List Deployment) : Option DefinitionSelector → Option (Option Deployment)
  | none => some none
  | some (.processKey key) => (current registry key).map some
  | some (.deployment deploymentId) => (registry.find? (·.deploymentId == deploymentId)).map some

/-- Start an instance of `deployment` with `input`, which names its start Event `publicStart` by its public identifier and
carries the instance's derived identity: the started instance and its `started` entry; or, when the start step refuses
it, no instance and the `failed` entry. -/
def startInstance (hooks : Hooks) (deployment : Deployment) (publicStart : String) (input : StartInput) :
    Except String (Option Instance × FanOutEntry) := do
  let some version := deployment.version? deployment.key | throw "deployment-without-version"
  match Step.step hooks deployment.program none (.start input) with
  | .ok state => pure (some { deployment, state }, .started input.instanceId deployment.deploymentId version publicStart)
  | .error failure => pure (none, .failed (.start deployment.deploymentId publicStart) failure)

/-- Start `deployment`'s instance at `startEvent` for a publication at `atMs`: the start input names the start, so the
start step rechecks its channel, and carries the payload, variables and business key. -/
def startFor (hooks : Hooks) (instances : List Instance) (publication : Publication) (atMs : Nat)
    (deployment : Deployment) (startEvent : ElementId) (channel : MessageChannel) :
    Except String (List Instance × Resolution) := do
  let publicStart := (deployment.program.publicId startEvent).value
  let (started, entry) ← startInstance hooks deployment publicStart
    { instanceId := startedInstanceId publication.commandId deployment.deploymentId publicStart
      startEvent := some startEvent, variables := publication.variables
      trigger := .message channel publication.payload, businessKey := publication.businessKey, atMs := some atMs }
  pure (instances ++ started.toList, .fanOut [entry])

/-- Route one publication at `atMs` (PC-MESSAGE-02, PC-MESSAGE-08): unless start-only, deliver to its sole receiver
among the instances of its selected deployment, or of every deployment without a selector; when there is none and it
is not executions-only, start its sole start candidate. The delivery or start takes the command's logical time, so the
step it causes evaluates `now` and arms Timers from it. Zero is `noMatch` and several are `ambiguous`, either leaving
every instance unchanged; candidate order never picks a winner. Criteria naming one target twice are
`rejected criteria-duplicate`, a selector naming no registered deployment `rejected definition-not-deployed`. A delivery
also answers its receiver's root instance, whose committed step's intents cascade next. -/
def publish (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (atMs : Nat)
    (publication : Publication) : Except String (List Instance × Resolution × Option String) := do
  let targets := publication.criteria.map (reprStr ·.target)
  if targets.eraseDups.length != targets.length then return (instances, .rejected "criteria-duplicate", none)
  let some scope := selected registry publication.definition | return (instances, .rejected "definition-not-deployed", none)
  let reached := if publication.mode == .startOnly then [] else
    instances.zipIdx.flatMap fun (member, index) =>
      if scope.any (·.deploymentId != member.deployment.deploymentId) then []
      else (receivers hooks member.deployment.program member.state publication).map (index, ·)
  match reached with
  | [(index, target, channel)] =>
    let delivery : Input := .deliver { occurrence := target, trigger := .message channel
                                       correlation := publication.criteria, payload := publication.payload
                                       variables := publication.variables, atMs := some atMs }
    match instances[index]? with
    | none => throw "candidate-without-instance"
    | some member =>
      match Step.step hooks member.deployment.program (some member.state) delivery with
      | .ok state => pure (instances.set index { member with state }, .committed target [], some state.instanceId)
      | .error failure => pure (instances, .failed target failure, none)
  | _ :: _ :: _ => pure (instances, .ambiguous, none)
  | [] =>
    if publication.mode == .executionsOnly then return (instances, .noMatch, none)
    match startCandidates registry scope publication.message with
    | [] => pure (instances, .noMatch, none)
    | [(deployment, startEvent, channel)] =>
      let (instances, resolution) ← startFor hooks instances publication atMs deployment startEvent channel
      pure (instances, resolution, none)
    | _ :: _ :: _ => pure (instances, .ambiguous, none)

end Kernel.Population
