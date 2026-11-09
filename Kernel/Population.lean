module

public import Kernel.Step

/-! # Population

Mechanisms across process instances ([proposal](../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#population)). Every input
reaches an instance through `Step.step`; this layer only decides which instance an input goes to. A scenario is one
ordered list of stimuli mixing instance inputs and population stimuli. Implemented: instances of possibly different
definitions, each driven by its own inputs, and Message key correlation with exact-cardinality routing
([specification](../docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#global-command-and-runtime-contract)): a publication
addresses one deployed definition, process, Message channel and correlation key; the candidates are the open
subscriptions of that definition's instances that `Hooks.correlates` accepts; exactly one is delivered to, while zero
or several reject the publication and change no instance. Candidate order never picks a winner.

An instance input that does not commit and a delivery a target refuses are results, never harness errors. A harness
refusal, with a stable code, is a publication that names no deployed definition or carries an empty payload; a
candidate whose key cannot be evaluated is no match.
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

structure Definition where
  ref : DeploymentRef
  program : Program

/-- A correlated publication's address. -/
structure Address where
  definition : DeploymentRef
  processId : String
  channel : MessageChannel
  correlationKey : String

/-- A correlated publication carrying a String payload, the profile's one key domain. -/
structure Publication where
  commandId : String
  address : Address
  payload : String

structure Instance where
  definition : Definition
  state : State

inductive Resolution where
  | committed (target : OccurrenceRef)
  /-- The sole candidate refused the delivery; nothing changed. -/
  | failed (target : OccurrenceRef) (failure : Failure)
  | noMatch
  | ambiguous

/-- `ingressOrdinal` numbers the publications in arrival order, from 1. -/
structure PublicationResult where
  commandId : String
  ingressOrdinal : Nat
  resolution : Resolution

/-- One population scenario stimulus, in scenario order: an input for the instance of `script`, or a publication. -/
inductive Stimulus where
  | input (script : Nat) (definition : Definition) (commandId : String) (input : Input)
  | publish (publication : Publication)

structure Result where
  publications : List PublicationResult
  /-- Ordered by process instance identifier, whatever order they started in. -/
  instances : List Instance
  /-- The instance inputs that did not commit, with their failures. -/
  inputFailures : List (String × Failure)

def occurrence (program : Program) (state : State) (item : OpenItem) : OccurrenceRef :=
  { processInstanceId := state.instanceOf item.scope, element := program.publicId item.element
    activation := ((state.occurrence? item.occurrence).map (·.activation)).getD 0 }

/-- The instances at the address's definition and process, by position, with each of their correlated subscriptions
that accepts `correlation`. -/
def candidates (hooks : Hooks) (instances : List Instance) (address : Address) (correlation : List CorrelationMatch) :
    List (Nat × OccurrenceRef) :=
  instances.zipIdx.flatMap fun (member, index) =>
    let program := member.definition.program
    if member.definition.ref != address.definition || program.identity.processId != address.processId then []
    else
      let ctx := Step.context hooks program
      let accepted := member.state.openItems.filter fun item =>
        match hooks.correlates ctx item address.channel correlation member.state with
        | .ok accepts => accepts
        | .error _ => false
      accepted.map fun item => (index, occurrence program member.state item)

/-- Route one publication: deliver to its sole candidate, or reject it leaving every instance unchanged. -/
def publish (hooks : Hooks) (definitions : List Definition) (instances : List Instance) (ingressOrdinal : Nat)
    (publication : Publication) : Except String (List Instance × PublicationResult) := do
  let address := publication.address
  unless definitions.any fun definition =>
      definition.ref == address.definition && definition.program.identity.processId == address.processId do
    throw "publication-unknown-definition"
  if publication.payload.isEmpty then throw "publication-payload-empty"
  let correlation : List CorrelationMatch :=
    [{ target := .processVariable address.correlationKey, expected := .string publication.payload }]
  let result (resolution : Resolution) : PublicationResult :=
    { commandId := publication.commandId, ingressOrdinal, resolution }
  match candidates hooks instances address correlation with
  | [] => pure (instances, result .noMatch)
  | [(index, target)] =>
    let delivery : Input := .deliver { occurrence := target, trigger := .message address.channel, correlation }
    match instances[index]? with
    | none => throw "candidate-without-instance"
    | some member =>
      match Step.step hooks member.definition.program (some member.state) delivery with
      | .ok state => pure (instances.set index { member with state }, result (.committed target))
      | .error failure => pure (instances, result (.failed target failure))
  | _ :: _ :: _ => pure (instances, result .ambiguous)

/-- What a run has done so far: instances by script, publication results and input failures. -/
structure Progress where
  instances : List (Nat × Instance) := []
  publications : List PublicationResult := []
  inputFailures : List (String × Failure) := []

/-- Apply one stimulus. A publication sees the instances started so far. -/
def apply (hooks : Hooks) (definitions : List Definition) (progress : Progress) : Stimulus → Except String Progress
  | .input script definition commandId input =>
    let before := (progress.instances.find? (·.1 == script)).map (·.2.state)
    match Step.step hooks definition.program before input with
    | .error failure => .ok { progress with inputFailures := progress.inputFailures ++ [(commandId, failure)] }
    | .ok state =>
      let others := progress.instances.filter (·.1 != script)
      .ok { progress with instances := others ++ [(script, { definition, state })] }
  | .publish publication => do
    let ordinal := progress.publications.length + 1
    let scripts := progress.instances.map (·.1)
    let (instances, published) ← publish hooks definitions (progress.instances.map (·.2)) ordinal publication
    pure { progress with instances := scripts.zip instances, publications := progress.publications ++ [published] }

/-- Fold the stimuli in order. -/
def run (hooks : Hooks) (definitions : List Definition) (stimuli : List Stimulus) : Except String Result := do
  let progress ← stimuli.foldlM (apply hooks definitions) ({} : Progress)
  let ids := progress.instances.map (·.2.state.instanceId)
  unless ids.eraseDups.length == ids.length do throw "instance-id-duplicate"
  pure { publications := progress.publications
         inputFailures := progress.inputFailures
         instances := (progress.instances.map (·.2)).mergeSort fun left right =>
           decide (left.state.instanceId ≤ right.state.instanceId) }

end Kernel.Population
