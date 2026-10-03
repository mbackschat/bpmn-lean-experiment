import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessProgramAdmission
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! IMES-ARM/TRIGGER/EXPIRE state phases for the bounded application-withdrawal account.
The family predicate adds listener lifetime and interruption constraints to the unchanged generic invariant. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def scopeCount? (state : RuntimeState) (scope : DefinitionScopeId) : Option Nat :=
  match state.scopeActivations.filter (·.scopeId == scope) with
  | [] => some 0
  | [counter] => some counter.count
  | _ => none

private def messageCount? (state : RuntimeState) (element : NodeId) : Option Nat :=
  match state.messageActivations.filter (·.elementId == element) with
  | [] => some 0
  | [counter] => some counter.count
  | _ => none

private def unselectedWorkAbsent (state : RuntimeState) : Bool :=
  state.messageWaits.isEmpty && state.timerWaits.isEmpty && state.effectWaits.isEmpty &&
    state.effectIncidents.isEmpty && state.selectedBranchSets.isEmpty && state.eventRaces.isEmpty &&
    state.calledProcessOccurrences.isEmpty && state.variables.process.bindings.isEmpty &&
    state.variables.activities.isEmpty && state.variables.processInterfaces.isEmpty &&
    state.sequentialMultiInstanceControllers.isEmpty && state.parallelMultiInstanceControllers.isEmpty &&
    state.compensationActivityRetentions.isEmpty && state.compensationParentContextRetentions.isEmpty &&
    state.compensationTriggers.isEmpty && state.compensationHandlerEffectWaits.isEmpty

def messageEventSubProcessRunningPhaseValid (state : RuntimeState) (instanceId : SemanticId)
    (declaration : InterruptingMessageEventSubProcessDeclaration) : Bool :=
  let root : ScopeOccurrenceId := ⟨instanceId, declaration.parentScopeId, 1⟩
  let expected : MessageSubscriptionId := ⟨instanceId, ⟨declaration.startEventId.value⟩, 1⟩
  let children := state.scopeOccurrences.filter (·.id.definitionScopeId == declaration.handlerScopeId)
  let issued := scopeCount? state declaration.handlerScopeId
  let ordinaryWork := state.initiationPending || state.tokens.any (·.owner == root) ||
    state.waits.any (·.owner == root) || state.activityOccurrences.any (·.owner == root)
  (state.scopeOccurrences.filter fun scope => scope.id == root && scope.parent.isNone).length == 1 &&
    children.length ≤ 1 && state.scopeOccurrences.length == 1 + children.length &&
    scopeCount? state declaration.parentScopeId == some 1 &&
    messageCount? state declaration.startEventId == some 1 &&
    (issued == some 0 || issued == some 1) &&
    children.all (fun child => child.parent == some root && child.id.processInstanceId == instanceId &&
      child.id.activation == 1 && issued == some 1) &&
    (!(!children.isEmpty || issued == some 1) || !ordinaryWork) &&
    match state.eventSubProcessMessageSubscriptions with
    | [] => !ordinaryWork
    | [listener] => children.isEmpty && issued == some 0 && listener.owner == root &&
        listener.id == expected && listener.channel == declaration.channel
    | _ => false

/-- IMES-REFUSE-01 validates the complete pre-start state and the three passive/active/retired phases. -/
def interruptingMessageEventSubProcessStateValid (program : Program) (state : RuntimeState) : Bool :=
  if program.identity.semanticProfile != interruptingMessageEventSubProcessProfileId then
    program.interruptingMessageEventSubProcesses.isEmpty && state.eventSubProcessMessageSubscriptions.isEmpty
  else if !interruptingMessageEventSubProcessProgramGraph program then false
  else match state.control with
    | .notStarted => state == initialState
    | .running instanceId =>
        match program.interruptingMessageEventSubProcesses with
        | [declaration] => unselectedWorkAbsent state && messageEventSubProcessRunningPhaseValid state instanceId declaration
        | _ => false
    | .completed _ | .cancelled _ | .failed .. =>
        unselectedWorkAbsent state && state.eventSubProcessMessageSubscriptions.isEmpty &&
          state.scopeOccurrences.isEmpty && state.tokens.isEmpty && state.waits.isEmpty &&
          state.activityOccurrences.isEmpty && !state.initiationPending

/-- The bounded handler account retains every generic state obligation and adds its phase constraints. -/
def interruptingMessageEventSubProcessCheckpointStateWellFormed (program : Program)
    (instanceId : SemanticId) (state : RuntimeState) : Bool :=
  runtimeStateWellFormed program instanceId state && interruptingMessageEventSubProcessStateValid program state

end BpmnSemantics.SemanticProcess
