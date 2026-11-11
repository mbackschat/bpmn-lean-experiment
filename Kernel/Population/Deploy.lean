module

public import Kernel.IL.Timer
public import Kernel.Population.Contract

/-! # Population: deployments

Deploy ordinals, versions per process key and the copies of other deployments' processes a deployment may
carry ([specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments)).
-/

public section

namespace Kernel.Population

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

/-- The current deployment of every key, in deploy order. -/
def currentDeployments (registry : List Deployment) : List Deployment :=
  registry.filter fun deployment => (current registry deployment.key).any (·.deploymentId == deployment.deploymentId)

/-- The program without the carried processes `drop` refuses: each process, every element whose top-level ancestor it
lists, and every flow touching one of them. -/
def withoutCarried (program : Program) (drop : CalledProcess → Bool) : Program :=
  let removed := (program.elements.filter fun element => (program.processOf element.header).any drop).map (·.header.id)
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

/-- A program's root Message starts with their triggers, in document order. -/
def messageStarts (program : Program) : List (Header × MessageTrigger) :=
  ((program.children none).filterMap Element.start?).filterMap fun (header, start) =>
    (start.subscription.bind (·.trigger.message?)).map (header, ·)

/-- The literal names of a program's root Message starts. -/
def messageStartNames (program : Program) : List String :=
  (messageStarts program).filterMap fun (_, trigger) => trigger.name.bind ValueSource.literal?

/-- A program's root Timer starts whose schedule resolves to what a host arms, in document order. -/
def timerStarts (program : Program) : List (Header × Timer.Resolved) :=
  ((program.children none).filterMap Element.start?).filterMap fun (header, start) =>
    (start.subscription.bind (·.trigger.timer?)).bind fun trigger =>
      (Timer.resolve trigger.schedule).toOption.map (header, ·)

/-- What registering a deployment and firing its Timer starts read of it, as plain data a host keeps without the
program: its deploy ordinal, root key and own keys with their versions, its deploy time, whether Message names address
its starts (CIB-LIM-0022), its root Message start names and its root Timer starts by public identifier. -/
structure DeploymentSummary where
  deploymentId : Nat
  key : String
  keys : List String
  versions : List (String × Nat) := []
  deployedAtMs : Nat := 0
  namesAddress : Bool
  messageStartNames : List String
  timerStarts : List (String × Timer.Resolved)

/-- The summary of `program`, not yet registered: its ordinal is the deployment its identity names, 0 for none, and it
has no versions and the deploy time 0 until it is registered. -/
def deploymentSummary (program : Program) : DeploymentSummary :=
  let deploymentId := program.identity.deployment.getD 0
  { deploymentId, key := program.identity.processId, keys := ownKeys deploymentId program
    namesAddress := program.options.messageNames == .addresses, messageStartNames := messageStartNames program
    timerStarts := (timerStarts program).map fun (header, resolved) => ((program.publicId header.id).value, resolved) }

/-- A registered deployment's summary. -/
def Deployment.summary (deployment : Deployment) : DeploymentSummary :=
  { deploymentSummary deployment.program with
    deploymentId := deployment.deploymentId, versions := deployment.versions, deployedAtMs := deployment.deployedAtMs }

/-- The current summary of `key`: its last registered deployment. -/
def currentSummary (registry : List DeploymentSummary) (key : String) : Option DeploymentSummary :=
  (registry.filter (·.key == key)).getLast?

/-- The version each key of `candidate` takes: 1 + the number of registered deployments containing that key. -/
def summaryVersions (registry : List DeploymentSummary) (candidate : DeploymentSummary) : List (String × Nat) :=
  candidate.keys.map fun key => (key, 1 + (registry.filter fun earlier => earlier.versions.any (·.1 == key)).length)

/-- Under `MessageNames.addresses` a root Message start name is unique across the current deployments of other keys:
CIB refuses deploying one another key's current deployment already subscribes (`BpmnDeployer.java:328-363`,
CIB-LIM-0028). -/
def summaryClash (registry : List DeploymentSummary) (candidate : DeploymentSummary) : Option String :=
  let others := (registry.map (·.key)).eraseDups.filter (· != candidate.key)
  let taken := others.flatMap fun key => ((currentSummary registry key).map (·.messageStartNames)).getD []
  if candidate.namesAddress && candidate.messageStartNames.any taken.contains then some "deployment.messageStartName"
  else none

/-- Register `candidate` as `deploymentId` over the summaries of the registered deployments: its versions, or the
refusal of a Message start name another key's current deployment subscribes. -/
def registerSummary (registry : List DeploymentSummary) (deploymentId : Nat) (candidate : DeploymentSummary) :
    Except String (Nat × List (String × Nat)) :=
  match summaryClash registry candidate with
  | some code => .error code
  | none => .ok (deploymentId, summaryVersions registry candidate)

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
  let summaries := registry.map (·.summary)
  let candidate := deploymentSummary { program with identity := { program.identity with deployment := some deploymentId } }
  let versions := summaryVersions summaries candidate
  let unreachable (process : CalledProcess) : Bool :=
    process.definition.deployment.any fun source => source > deploymentId || refused.contains source
  let carried := withoutCarried program unreachable
  match carried.processes.mapM (stampCarried registry deploymentId versions) with
  | .error code => refusal code
  | .ok processes =>
    let stamped := { carried with processes, identity := { carried.identity with deployment := some deploymentId } }
    match admission stamped <|> summaryClash summaries candidate with
    | some code => refusal code
    | none =>
      ({ deploymentId, definitionRef, versions, outcome := .deployed },
        some { deploymentId, definitionRef, ref, key := program.identity.processId, versions, deployedAtMs := atMs,
               program := stamped })

end Kernel.Population
