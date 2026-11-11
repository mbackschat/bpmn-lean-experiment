module

public import Kernel.Population.Contract
public import Kernel.Step

/-! # Population: Message publications

Message key correlation with exact-cardinality routing
([specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
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

end Kernel.Population
