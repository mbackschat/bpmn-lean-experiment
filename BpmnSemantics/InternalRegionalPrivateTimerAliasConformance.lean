import BpmnSemantics.InternalRegionalCancellationProjectionConformance

/-! Private Timer identities are family-tagged internally but public wait anchors are not.
These constructed Program/state witnesses check cancellation without claiming profile reachability.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation.PrivateTimerAliasWitness

open BpmnSemantics CancellationProjectionWitness

def hosting : SemanticId := SubProcessErrorPropagationConformance.instanceId

def aliasId : OccurrenceId :=
  { processInstanceId := hosting, elementId := ⟨"UserTask_Recover"⟩, activation := 1 }

def program (message : Bool) : Program :=
  { errorProgram with operations := errorProgram.operations.map fun operation =>
      match operation with
      | .enterBoundedScope id origin input childEntry childScope timer =>
          .enterBoundedScope id origin input childEntry childScope
            { timer with elementId := ⟨aliasId.elementId.value⟩ }
      | .awaitUserTask id origin input output task =>
          if message && task.id.value == aliasId.elementId.value then
            .awaitMessage id origin input output
              { elementId := ⟨aliasId.elementId.value⟩, channel := .directMessage ⟨"Recovery"⟩ }
          else operation
      | _ => operation }

def ready : RuntimeState :=
  { errorReady with
    timerWaits := errorReady.timerWaits.map fun timer => { timer with elementId := ⟨aliasId.elementId.value⟩ }
    timerActivations := errorReady.timerActivations.map fun counter => { counter with elementId := ⟨aliasId.elementId.value⟩ }
    activityOccurrences := errorReady.activityOccurrences.map fun record =>
      { record with attachedHandlers := record.attachedHandlers.map fun
          | .timer id => .timer { id with elementId := aliasId.elementId }
          | .message id => .message id } }

def before (message : Bool) : RuntimeState := Id.run do
  let operation := ((program message).operations.find? fun operation => match operation with
    | .awaitUserTask _ _ _ _ task => task.id.value == aliasId.elementId.value
    | .awaitMessage _ _ _ _ definition => definition.elementId.value == aliasId.elementId.value
    | _ => false).getD errorOperation
  let input := match operation with
    | .awaitUserTask _ _ input .. | .awaitMessage _ _ input .. => input
    | _ => ⟨"missing"⟩
  let owner := { processInstanceId := hosting
                 definitionScopeId := SubProcessErrorPropagationConformance.rootScopeId, activation := 1 }
  return (fire? (program message) operation { ready with tokens := addToken ready.tokens input owner }).getD initialState

def exactPublication (message : Bool) : Bool :=
  let selectedProgram := program message
  let predecessor := before message
  match prepareInternalRegional? selectedProgram predecessor errorOperation with
  | none => false
  | some prepared =>
    match applyPreparedInternalRegional? selectedProgram predecessor prepared with
    | none => false
    | some after =>
      programWellFormed selectedProgram &&
      runtimeStateWellFormed selectedProgram hosting predecessor &&
      runtimeStateWellFormed selectedProgram hosting after &&
      predecessor.timerWaits.length == 1 && after.timerWaits.isEmpty &&
      ((projectOpenFlowNodeOccurrences? selectedProgram after).map fun current =>
        current.any fun entry => entry.anchor == .wait aliasId) == some true &&
      !(prepared.publicationTemplate.retainedEnds.any fun ending => ending.anchor == .wait aliasId) &&
      decide (flowNodeOccurrenceDeltaForOperation? selectedProgram predecessor after errorOperation
        ⟨"private-alias"⟩ 0 = some (prepared.publicationTemplate.lifecycle ⟨"private-alias"⟩ 0))

theorem private_timer_cancellation_preserves_aliased_public_task : exactPublication false = true := by
  decide +kernel

theorem private_timer_cancellation_preserves_aliased_public_message : exactPublication true = true := by
  decide +kernel

end BpmnSemantics.SemanticProcess.InternalCommutation.PrivateTimerAliasWitness
