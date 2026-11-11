module

public import Kernel.Step

/-! # Population

Mechanisms across process instances ([architecture](../docs/kernel/ARCHITECTURE-SPEC.md#population)). Every input
reaches an instance through `Step.step`; this layer only decides which instance an input goes to. A scenario is one
ordered list of stimuli mixing deployments, instance inputs and population commands, each at a logical time.
Implemented: deployments with versions per process key and the copies of other deployments' processes they may
carry (`deploy`), instances of possibly different deployments, each driven by its own inputs, and Message key
correlation with exact-cardinality routing ([specification](../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)): a
publication addresses one deployment and a Message channel and carries the modeled correlation criteria; the
candidates are the open subscriptions of that deployment's instances that `Hooks.correlates` accepts; exactly one is
delivered to, while zero or several reject the publication and change no instance. Candidate order never picks a
winner. Every other command form is parsed and answered `unsupported population-not-implemented`.

A refused deployment, an instance input that does not commit and a delivery a target refuses are results, never
harness errors; a candidate whose key cannot be evaluated is no match.
-/

public section

namespace Kernel.Population

/-- The source overlay a definition was compiled with. -/
structure Overlay where
  id : String
  sha256 : String
  deriving DecidableEq, Repr

/-- A deployed definition's identity as a publication addresses it: definitions whose local identifiers agree but
whose source, overlay or profile differ are distinct (specification, global command). -/
structure DeploymentRef where
  sourceId : String
  sourceSha256 : String
  overlay : Option Overlay
  profile : String
  deriving DecidableEq, Repr

/-- One deploy event of a scenario definition. `deploymentId` is its deploy ordinal across the population, from 1; `key`
its root process id; `versions` gives each process key it contains 1 + the number of earlier deployments containing
that key. -/
structure Deployment where
  deploymentId : Nat
  definitionRef : String
  ref : DeploymentRef
  key : String
  versions : List (String × Nat)
  deployedAtMs : Nat
  program : Program

/-- The current deployment of a process key, or one exact deployment. -/
inductive DefinitionSelector where
  | processKey (key : String)
  | deployment (deploymentId : Nat)

inductive MessageAddress where
  | channel (channel : MessageChannel)
  | name (name : String)

inductive PublishMode where
  | any
  | executionsOnly
  | startOnly
  deriving DecidableEq

/-- A Message publication; `criteria` are read as the profile's `messageCorrelation` says. -/
structure Publication where
  commandId : String
  definition : Option DefinitionSelector
  message : MessageAddress
  criteria : List CorrelationMatch
  payload : Option Value
  variables : List (String × Value)
  businessKey : Option String
  mode : PublishMode

/-- A receiver of a fan-out: a waiting occurrence, or a start Event of a deployment. -/
inductive Receiver where
  | occurrence (ref : OccurrenceRef)
  | start (deploymentId : Nat) (startEvent : String)

/-- An API Signal broadcast; `order`, when given, is the discovery order its receivers are reached in. -/
structure Broadcast where
  commandId : String
  address : SignalAddress
  variables : List (String × Value)
  order : Option (List Receiver)

structure ConditionEvaluation where
  commandId : String
  definition : Option DefinitionSelector
  variables : List (String × Value)
  businessKey : Option String
  order : Option (List Receiver)

/-- A Timer-start occurrence, named by its due instant; the command's logical time is its firing time. -/
structure TimerStart where
  commandId : String
  deploymentId : Nat
  startEvent : String
  dueMs : Nat

inductive Command where
  | publish (publication : Publication)
  | broadcast (broadcast : Broadcast)
  | evaluateConditions (evaluation : ConditionEvaluation)
  | timerStart (timerStart : TimerStart)

def Command.commandId : Command → String
  | .publish sent => sent.commandId
  | .broadcast sent => sent.commandId
  | .evaluateConditions sent => sent.commandId
  | .timerStart sent => sent.commandId

/-- One receiver of a fan-out, each its own unit of commitment; `skipped` was gone before its turn. -/
inductive FanOutEntry where
  | delivered (target : OccurrenceRef)
  | started (instanceId : String) (deploymentId version : Nat) (startEvent : String)
  | skipped (target : OccurrenceRef)
  | failed (target : Receiver) (failure : Failure)

inductive Resolution where
  | committed (target : OccurrenceRef)
  /-- The sole candidate refused the delivery; nothing changed. -/
  | failed (target : OccurrenceRef) (failure : Failure)
  | fanOut (entries : List FanOutEntry)
  | noMatch
  | ambiguous
  | rejected (code : String)
  | unsupported (code : String)

/-- A command's result; `ordinal` numbers the commands in arrival order, from 1. -/
structure StepResult where
  commandId : String
  ordinal : Nat
  atMs : Nat
  resolution : Resolution

/-- A command the population answered, under the digest of its canonical wire form (contract §7). -/
structure LedgerEntry where
  commandId : String
  digest : String
  result : StepResult

/-- A consumed Timer-start occurrence. -/
structure TimerOccurrence where
  deploymentId : Nat
  startEvent : String
  dueMs : Nat

inductive DeploymentOutcome where
  | deployed
  | refused (code : String)

structure DeploymentResult where
  deploymentId : Nat
  definitionRef : String
  versions : List (String × Nat)
  outcome : DeploymentOutcome

structure Instance where
  deployment : Deployment
  state : State

/-- One population scenario stimulus, in scenario order: a deployment, an input for the instance of `script`, or a
command with its logical time and the digest of its canonical wire form, which the harness computes. -/
inductive Stimulus where
  | deploy (definitionRef : String) (ref : DeploymentRef) (program : Program) (atMs : Nat)
  /-- A deployment whose program the reader or the assembly refused with `code`. -/
  | deployRefused (definitionRef : String) (ref : DeploymentRef) (code : String) (atMs : Nat)
  | input (script : Nat) (definitionRef : String) (commandId : String) (input : Input)
  | command (command : Command) (atMs : Nat) (digest : String)

structure Result where
  deployments : List DeploymentResult
  steps : List StepResult
  /-- Ordered by process instance identifier, whatever order they started in. -/
  instances : List Instance
  /-- The instance inputs that did not commit, with their failures. -/
  inputFailures : List (String × Failure)

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

/-- Whether a carried process is the deploying document's own: unstamped, or stamped with `deploymentId` itself;
any other stamp is a copy `bpmn-source`'s assembly made from that deployment. -/
def ownProcess (deploymentId : Nat) (process : CalledProcess) : Bool :=
  process.definition.deployment.all (· == deploymentId)

/-- The process keys a deployment contains: its root and its own document's processes. -/
def ownKeys (deploymentId : Nat) (program : Program) : List String :=
  program.identity.processId :: ((program.processes.filter (ownProcess deploymentId)).map (·.definition.key))

/-- The version a registered deployment gave `key`. -/
def Deployment.version? (deployment : Deployment) (key : String) : Option Nat :=
  (deployment.versions.find? (·.1 == key)).map (·.2)

/-- The namespace a registered deployment declares `key` in: its root's, or its own process's. -/
def Deployment.namespace? (deployment : Deployment) (key : String) : Option (Option String) :=
  if deployment.key == key then some deployment.program.identity.«namespace»
  else ((deployment.program.processes.filter (ownProcess deployment.deploymentId)).find? (·.definition.key == key)).map
    (·.definition.«namespace»)

/-- The current deployment of `key`: the last registered deployment whose root it is; redeploying a key supersedes its
earlier versions' start subscriptions (`BpmnDeployer.java:232-292`). -/
def current (registry : List Deployment) (key : String) : Option Deployment :=
  (registry.filter (·.key == key)).getLast?

/-- The program without the carried processes `drop` refuses: each process, every element whose top-level ancestor it
lists, and every flow touching one of them. -/
def withoutCarried (program : Program) (drop : CalledProcess → Bool) : Program :=
  let roots := (program.processes.filter drop).flatMap (·.children)
  let rec topLevel (fuel : Nat) (id : ElementId) : ElementId :=
    match fuel, (program.element? id).bind (·.header.parent) with
    | 0, _ | _, none => id
    | fuel + 1, some parent => topLevel fuel parent
  let removed := (program.elements.filter fun element =>
    roots.contains (topLevel program.elements.length element.header.id)).map (·.header.id)
  { program with
    processes := program.processes.filter (!drop ·)
    elements := program.elements.filter (!removed.contains ·.header.id)
    flows := program.flows.filter fun flow => !removed.contains flow.source && !removed.contains flow.target }

/-- Stamp a carried process with its version, or refuse its stamp. The deploying document's own process takes this
deployment and `versions`; a copy must name a registered deployment that contains its key in its namespace from its
source (`population.callee.stamp` otherwise), whose version it takes. -/
def stampCarried (registry : List Deployment) (deploymentId : Nat) (versions : List (String × Nat))
    (process : CalledProcess) : Except String CalledProcess :=
  let definition := process.definition
  if ownProcess deploymentId process then
    let version := (versions.find? (·.1 == definition.key)).map (·.2)
    .ok { process with definition := { definition with deployment := some deploymentId, version } }
  else
    let source := registry.find? fun deployment => definition.deployment == some deployment.deploymentId
    match source.bind fun deployment => (deployment.version? definition.key).map (deployment, ·) with
    | some (deployment, version) =>
      if deployment.namespace? definition.key == some definition.«namespace» &&
          definition.sourceSha256.all (· == deployment.program.identity.sourceSha256) then
        .ok { process with definition := { definition with version := some version } }
      else .error "population.callee.stamp"
    | none => .error "population.callee.stamp"

/-- The literal names of a program's root Message starts. -/
def messageStartNames (program : Program) : List String :=
  ((program.children none).filterMap Element.start?).filterMap fun (_, start) =>
    ((start.subscription.bind (·.trigger.message?)).bind (·.name)).bind ValueSource.literal?

/-- Under `MessageNames.addresses` a root Message start name is unique across the current deployments of other keys:
CIB refuses deploying one another key's current deployment already subscribes (`BpmnDeployer.java:328-363`,
CIB-LIM-0028). -/
def messageStartClash (registry : List Deployment) (program : Program) : Option String :=
  let others := (registry.map (·.key)).eraseDups.filter (· != program.identity.processId)
  let taken := others.flatMap fun key => ((current registry key).map (messageStartNames ·.program)).getD []
  if program.options.messageNames == .addresses && (messageStartNames program).any taken.contains then
    some "deployment.messageStartName"
  else none

/-- Deploy `program` as `deploymentId` at `atMs` (population contract §2.3, PC-SCOPE-03). Each key it contains takes
1 + the number of registered deployments containing that key, so a refused deployment numbers nothing, as CIB registers
none. A copy of another deployment's process stays only if that deployment is registered and no later than this one: a
copy of a later or a refused deployment is removed, so no Call binds a callee deployed after its caller or never
deployed. The rest are stamped (`stampCarried`); then admission runs, then the Message start names are checked. -/
def deploy (admission : Program → Option String) (registry : List Deployment) (refused : List Nat) (deploymentId : Nat)
    (definitionRef : String) (ref : DeploymentRef) (program : Program) (atMs : Nat) :
    DeploymentResult × Option Deployment :=
  let refusal (code : String) : DeploymentResult × Option Deployment :=
    ({ deploymentId, definitionRef, versions := [], outcome := .refused code }, none)
  let versions := (ownKeys deploymentId program).map fun key =>
    (key, 1 + (registry.filter fun earlier => earlier.versions.any (·.1 == key)).length)
  let unreachable (process : CalledProcess) : Bool :=
    process.definition.deployment.any fun source => source > deploymentId || refused.contains source
  let carried := withoutCarried program unreachable
  match carried.processes.mapM (stampCarried registry deploymentId versions) with
  | .error code => refusal code
  | .ok processes =>
    let stamped := { carried with processes, identity := { carried.identity with deployment := some deploymentId } }
    match admission stamped <|> messageStartClash registry stamped with
    | some code => refusal code
    | none =>
      ({ deploymentId, definitionRef, versions, outcome := .deployed },
        some { deploymentId, definitionRef, ref, key := program.identity.processId, versions, deployedAtMs := atMs,
               program := stamped })

/-- dynamic-only: a command form the population runner does not route yet; it is a scenario stimulus, not a program
shape, so no admission refusal can stand for it. -/
def notImplemented : Resolution := .unsupported "population-not-implemented"

/-- Whether a publication is the implemented form: to one deployment's executions on a channel, carrying criteria and
nothing else. -/
def Publication.routed? (publication : Publication) : Option (Nat × MessageChannel) :=
  match publication.definition, publication.message with
  | some (.deployment deploymentId), .channel channel =>
    if publication.payload.isNone && publication.variables.isEmpty && publication.businessKey.isNone &&
        publication.mode == .executionsOnly then some (deploymentId, channel)
    else none
  | _, _ => none

/-- Route one publication: deliver to its sole candidate, or reject it leaving every instance unchanged. -/
def publish (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (publication : Publication) :
    Except String (List Instance × Resolution) := do
  let some (deploymentId, channel) := publication.routed? | return (instances, notImplemented)
  if !registry.any (·.deploymentId == deploymentId) then return (instances, .rejected "definition-not-deployed")
  let correlation := publication.criteria
  let found := instances.zipIdx.flatMap fun (member, index) =>
    if member.deployment.deploymentId != deploymentId then []
    else (matching hooks member.deployment.program member.state channel correlation).map (index, ·)
  match found with
  | [] => pure (instances, .noMatch)
  | [(index, target)] =>
    let delivery : Input := .deliver { occurrence := target, trigger := .message channel, correlation }
    match instances[index]? with
    | none => throw "candidate-without-instance"
    | some member =>
      match Step.step hooks member.deployment.program (some member.state) delivery with
      | .ok state => pure (instances.set index { member with state }, .committed target)
      | .error failure => pure (instances, .failed target failure)
  | _ :: _ :: _ => pure (instances, .ambiguous)

/-- What a run has done so far: deployments, instances by script, command results and their ledger, input
failures. -/
structure Progress where
  registry : List Deployment := []
  deployments : List DeploymentResult := []
  instances : List (Nat × Instance) := []
  steps : List StepResult := []
  ledger : List LedgerEntry := []
  inputFailures : List (String × Failure) := []

/-- The deploy ordinals of the refused deployments, which no copy may come from. -/
def Progress.refused (progress : Progress) : List Nat :=
  progress.deployments.filterMap fun deployment =>
    match deployment.outcome with
    | .deployed => none
    | .refused _ => some deployment.deploymentId

/-- The deployment an instance input reaches: its instance's, or for a new instance its definition's latest. -/
def Progress.deploymentFor (progress : Progress) (script : Nat) (definitionRef : String) : Option Deployment :=
  match progress.instances.find? (·.1 == script) with
  | some (_, member) => some member.deployment
  | none => (progress.registry.filter (·.definitionRef == definitionRef)).getLast?

def route (hooks : Hooks) (progress : Progress) : Command → Except String (List Instance × Resolution)
  | .publish publication => publish hooks progress.registry (progress.instances.map (·.2)) publication
  | .broadcast _ | .evaluateConditions _ | .timerStart _ => pure (progress.instances.map (·.2), notImplemented)

/-- Apply one stimulus. A command sees the instances started so far. -/
def apply (hooks : Hooks) (admission : Program → Option String) (progress : Progress) : Stimulus → Except String Progress
  | .deploy definitionRef ref program atMs =>
    let (result, deployment) := deploy admission progress.registry progress.refused (progress.deployments.length + 1)
      definitionRef ref program atMs
    .ok { progress with registry := progress.registry ++ deployment.toList, deployments := progress.deployments ++ [result] }
  | .deployRefused definitionRef _ code _ =>
    .ok { progress with deployments := progress.deployments ++
      [{ deploymentId := progress.deployments.length + 1, definitionRef, versions := [], outcome := .refused code }] }
  | .input script definitionRef commandId input =>
    let failed (failure : Failure) : Progress :=
      { progress with inputFailures := progress.inputFailures ++ [(commandId, failure)] }
    match progress.deploymentFor script definitionRef with
    | none => .ok (failed (.rejected "definition-not-deployed"))
    | some deployment =>
      let before := (progress.instances.find? (·.1 == script)).map (·.2.state)
      match Step.step hooks deployment.program before input with
      | .error failure => .ok (failed failure)
      | .ok state =>
        let others := progress.instances.filter (·.1 != script)
        .ok { progress with instances := others ++ [(script, { deployment, state })] }
  | .command issued atMs digest => do
    let (instances, resolution) ← route hooks progress issued
    let result : StepResult :=
      { commandId := issued.commandId, ordinal := progress.steps.length + 1, atMs, resolution }
    let scripts := progress.instances.map (·.1)
    pure { progress with instances := scripts.zip instances, steps := progress.steps ++ [result]
                         ledger := progress.ledger ++ [{ commandId := issued.commandId, digest, result }] }

/-- Fold the stimuli in order; `admission` is the admission registry a deployment runs. -/
def runStimuli (hooks : Hooks) (admission : Program → Option String) (stimuli : List Stimulus) : Except String Result := do
  let progress ← stimuli.foldlM (apply hooks admission) ({} : Progress)
  let ids := progress.instances.map (·.2.state.instanceId)
  unless ids.eraseDups.length == ids.length do throw "instance-id-duplicate"
  pure { deployments := progress.deployments
         steps := progress.steps
         inputFailures := progress.inputFailures
         instances := (progress.instances.map (·.2)).mergeSort fun left right =>
           decide (left.state.instanceId ≤ right.state.instanceId) }

end Kernel.Population
