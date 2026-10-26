module

public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity

/-! IMES-OBSERVE-01 separates a dormant parent listener from an executing handler scope.
The declaration-owned projection supplements the ordinary-entry projection without weakening its predicates. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def projectOpenFlowNodeOccurrencesWithMessageHandler? (program : Program) (state : RuntimeState) :
    Option (List OpenSemanticFlowNodeOccurrence) := do
  if program.identity.semanticProfile != interruptingMessageEventSubProcessProfileId then
    projectOpenFlowNodeOccurrences? program state
  else
    if !programWellFormed program || !interruptingMessageEventSubProcessStateValid program state then none
    match state.control with
    | .running instanceId =>
        if !runtimeStateWellFormed program instanceId state ||
            !flowNodeOccurrenceWaitProgramValidity program state then none
        let waits ← projectWaits? program state
        let scopes ← (state.scopeOccurrences.filter (·.parent.isSome)).mapM (scopeStart? program state)
        let projected := sortFlowNodeOccurrenceStarts (waits ++ scopes)
        if (projected.map (·.anchor)).Nodup then some projected else none
    | .notStarted | .completed _ | .cancelled _ | .failed .. => some []

/-- IMES-OBSERVE-01 selects the parent, fresh child and cancelled task identities from the predecessor. -/
def messageHandlerDeliveryDelta? (program : Program) (before : RuntimeState)
    (id : MessageSubscriptionId) (channel : MessageChannel) (commandId : SemanticId)
    (transitionIndex : Nat) : Option UnnumberedFlowNodeOccurrenceDelta := do
  let selected ← selectEventSubProcessMessageDelivery? program before id channel
  let instant := instantaneousFlowNodeOccurrenceDelta commandId transitionIndex
    [{ processId := program.processId, elementId := selected.declaration.startEventId,
       owner := selected.child }]
  let scope : UnnumberedFlowNodeOccurrenceStart := {
    anchor := .scope selected.child
    processId := program.processId
    elementId := selected.declaration.elementId
    owner := selected.parent.id }
  let cancelled := (before.waits.filter (·.owner == selected.parent.id)).map fun wait =>
    { anchor := .wait ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩,
      terminal := .cancelled : UnnumberedFlowNodeOccurrenceEnd }
  pure (canonicalFlowNodeOccurrenceDelta (scope :: instant.started) (cancelled ++ instant.ended))

def acceptMessageHandlerCandidate? (program : Program) (before after : RuntimeState)
    (candidate : UnnumberedFlowNodeOccurrenceDelta) : Option UnnumberedFlowNodeOccurrenceDelta := do
  let openBefore ← projectOpenFlowNodeOccurrencesWithMessageHandler? program before
  let openAfter ← projectOpenFlowNodeOccurrencesWithMessageHandler? program after
  let folded ← applyFlowNodeOccurrenceDelta? openBefore candidate
  if folded = openAfter then some candidate else none

def flowNodeOccurrenceDeltaForStimulusWithMessageHandler? (program : Program)
    (before after : RuntimeState) (stimulus : Stimulus) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta := do
  if program.identity.semanticProfile != interruptingMessageEventSubProcessProfileId then
    flowNodeOccurrenceDeltaForStimulus? program before after stimulus transitionIndex
  else
    let candidate ← match stimulus with
      | .deliverMessage commandId id channel =>
          messageHandlerDeliveryDelta? program before id channel commandId transitionIndex
      | _ =>
          candidateFlowNodeOccurrenceDeltaForStimulus? program before stimulus
            (stimulusCommandId stimulus) transitionIndex
    acceptMessageHandlerCandidate? program before after candidate

def flowNodeOccurrenceDeltaForOperationWithMessageHandler? (program : Program)
    (before after : RuntimeState) (operation : SemanticOperation) (commandId : SemanticId)
    (transitionIndex : Nat) : Option UnnumberedFlowNodeOccurrenceDelta := do
  if program.identity.semanticProfile != interruptingMessageEventSubProcessProfileId then
    flowNodeOccurrenceDeltaForOperation? program before after operation commandId transitionIndex
  else
    let candidate ← candidateFlowNodeOccurrenceDeltaForOperation? program before after operation
      commandId transitionIndex
    acceptMessageHandlerCandidate? program before after candidate

end BpmnSemantics.SemanticProcess
