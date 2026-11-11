module

public import Kernel.State

/-! # Population: contract

The data a population run reads and answers: deployments, stimuli, commands, their resolutions and the run's
result ([specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
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

/-- dynamic-only: a command form the population runner does not route yet; it is a scenario stimulus, not a program
shape, so no admission refusal can stand for it. -/
def notImplemented : Resolution := .unsupported "population-not-implemented"

end Kernel.Population
