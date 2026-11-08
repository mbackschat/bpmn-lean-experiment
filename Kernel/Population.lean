module

public import Kernel.Step

/-! # Population

Mechanisms across process instances ([proposal](../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#population)). Every input
reaches an instance through `Step.step`; this layer only decides which instance an input goes to. Implemented:
instances of possibly different definitions, each driven by its own inputs, and Message key correlation with
exact-cardinality routing ([specification](../docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#global-command-and-runtime-contract)):
a publication addresses one deployed definition, process, Message channel and correlation key; the candidates are
the open subscriptions of that definition's instances that `Hooks.correlates` accepts; exactly one is delivered to,
while zero or several reject the publication and change no instance. Candidate order never picks a winner.

A failure here is a harness refusal with a stable code, never a semantic outcome: an instance input that does not
commit, a publication that names no deployed definition, or a candidate whose key cannot be evaluated.
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
structure DefinitionRef where
  sourceId : String
  sourceSha256 : String
  overlay : Option Overlay
  profile : String
  deriving DecidableEq, Repr

structure Definition where
  ref : DefinitionRef
  program : Program

/-- A correlated publication's address. -/
structure Address where
  definition : DefinitionRef
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
  | noMatch
  | ambiguous

/-- `ingressOrdinal` numbers the publications in arrival order, from 1. -/
structure PublicationResult where
  commandId : String
  ingressOrdinal : Nat
  resolution : Resolution

structure Result where
  publications : List PublicationResult
  /-- Ordered by process instance identifier, whatever order they started in. -/
  instances : List Instance

/-- Start one instance and apply its inputs; each must commit. -/
def startInstance (hooks : Hooks) (definition : Definition) (inputs : List (String × Input)) :
    Except String Instance := do
  let state ← inputs.foldlM (init := none) fun (before : Option State) (commandId, input) =>
    match Step.step hooks definition.program before input with
    | .ok after => .ok (some after)
    | .error _ => .error s!"instance-input-not-committed:{commandId}"
  match state with
  | some state => pure { definition, state }
  | none => throw "instance-without-inputs"

def occurrence (state : State) (item : OpenItem) : OccurrenceRef :=
  { processInstanceId := state.instanceOf item.scope, element := item.element, activation := item.activation }

/-- The instances at the address's definition and process, by position, with each of their correlated subscriptions
that accepts `correlation`. -/
def candidates (hooks : Hooks) (instances : List Instance) (address : Address) (correlation : List (String × Value)) :
    Except String (List (Nat × OccurrenceRef)) :=
  instances.zipIdx.flatMapM fun (member, index) => do
    let program := member.definition.program
    if member.definition.ref != address.definition || program.identity.processId != address.processId then
      pure []
    else
      let ctx := Step.context hooks program
      let accepted ← member.state.openItems.filterM fun item =>
        match hooks.correlates ctx item address.channel correlation member.state with
        | .ok accepts => .ok accepts
        | .error _ => .error "correlation-candidate-invalid"
      pure (accepted.map fun item => (index, occurrence member.state item))

/-- Route one publication: deliver to its sole candidate, or reject it leaving every instance unchanged. -/
def publish (hooks : Hooks) (definitions : List Definition) (instances : List Instance) (ingressOrdinal : Nat)
    (publication : Publication) : Except String (List Instance × PublicationResult) := do
  let address := publication.address
  unless definitions.any fun definition =>
      definition.ref == address.definition && definition.program.identity.processId == address.processId do
    throw "publication-unknown-definition"
  if publication.payload.isEmpty then throw "publication-payload-empty"
  let correlation := [(address.correlationKey, Value.string publication.payload)]
  let result (resolution : Resolution) : PublicationResult :=
    { commandId := publication.commandId, ingressOrdinal, resolution }
  match ← candidates hooks instances address correlation with
  | [] => pure (instances, result .noMatch)
  | [(index, target)] =>
    let delivery : Input := .deliver { occurrence := target, channel := address.channel, correlation }
    let updated ← instances.zipIdx.mapM fun (member, position) =>
      if position != index then .ok member
      else match Step.step hooks member.definition.program (some member.state) delivery with
        | .ok state => .ok { member with state }
        | .error _ => .error "correlated-delivery-not-committed"
    pure (updated, result (.committed target))
  | _ :: _ :: _ => pure (instances, result .ambiguous)

/-- Start every instance, in order, then route every publication, in order. -/
def run (hooks : Hooks) (definitions : List Definition) (scripts : List (Definition × List (String × Input)))
    (publications : List Publication) : Except String Result := do
  let instances ← scripts.mapM fun (definition, inputs) => startInstance hooks definition inputs
  let ids := instances.map (·.state.instanceId)
  unless ids.eraseDups.length == ids.length do throw "instance-id-duplicate"
  let (instances, results) ← publications.zipIdx.foldlM (init := (instances, [])) fun (instances, results)
      (publication, position) => do
    let (instances, published) ← publish hooks definitions instances (position + 1) publication
    pure (instances, results ++ [published])
  pure { publications := results
         instances := instances.mergeSort fun left right => decide (left.state.instanceId ≤ right.state.instanceId) }

end Kernel.Population
