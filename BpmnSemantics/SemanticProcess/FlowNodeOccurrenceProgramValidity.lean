import BpmnSemantics.SemanticProcess.CommandAdmission

/-! # Flow-node occurrence Program validity

This module validates the exact correspondence between immutable Program definitions and live runtime occurrences before lifecycle projection. It owns scope-tree bindings, operation-owned wait families, private Boundary Timer host pairing, Call Activity records, and effect-local scope exactness. It does not project occurrences or define lifecycle transitions.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- One complete runtime owner identity occurs exactly once. -/
def flowNodeOccurrenceOwnerLiveUnique (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Bool :=
  (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = owner)).length = 1

private def operationOwnedBy (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) : Bool :=
  match program.operationScopes.filter fun binding => decide (binding.operationId = operation.id) with
  | [binding] => binding.scopeId = owner.definitionScopeId
  | _ => false

private def occurrenceOwnerValid (state : RuntimeState) (processInstanceId : SemanticId)
    (owner : ScopeOccurrenceId) (elementId : NodeId) (activation : Nat) : Bool :=
  !processInstanceId.value.isEmpty && !elementId.value.isEmpty && activation > 0 &&
    processInstanceId = owner.processInstanceId &&
    flowNodeOccurrenceOwnerLiveUnique state owner

private def scopeOperationBindingValid (program : Program) (occurrence : RuntimeScopeOccurrence)
    (definition : DefinitionScope) : Bool :=
  match occurrence.parent with
  | none => true
  | some parent =>
      (program.operations.filter fun operation =>
        if !operationOwnedBy program operation parent then false
        else match operation with
        | .enterScope _ origin _ _ childScopeId
        | .enterBoundedScope _ origin _ _ childScopeId _ =>
            childScopeId = occurrence.id.definitionScopeId &&
              origin.elementId = definition.originElementId
        | _ => false).length = 1

private def runtimeScopeBindingValid (program : Program) (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  match program.definitionScopes.filter fun scope =>
      decide (scope.id = occurrence.id.definitionScopeId) with
  | [definition] =>
      !occurrence.id.processInstanceId.value.isEmpty &&
        !occurrence.id.definitionScopeId.value.isEmpty && occurrence.id.activation > 0 &&
        flowNodeOccurrenceOwnerLiveUnique state occurrence.id &&
        scopeOperationBindingValid program occurrence definition &&
        match definition.parentScopeId, occurrence.parent, state.control with
        | some expected, some parent, .running _ =>
            parent.processInstanceId = occurrence.id.processInstanceId &&
              parent.definitionScopeId = expected &&
              flowNodeOccurrenceOwnerLiveUnique state parent
        | none, none, .running hosting =>
            if occurrence.id.processInstanceId = hosting then
              definition.originElementId.value = program.processId.value
            else (state.calledProcessOccurrences.filter fun record => decide
              (record.calledRoot = occurrence.id &&
                record.calledProcessId.value = definition.originElementId.value)).length = 1
        | _, _, _ => false
  | _ => false

private def userTaskWaitValid (program : Program) (state : RuntimeState)
    (wait : UserTaskWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitUserTask _ _ _ output task =>
          output = wait.output && task = wait.task && wait.metadata = task.metadata
      | .awaitBoundedUserTask _ _ _ task _
      | .awaitMonitoredUserTask _ _ _ task _ =>
          task.id = wait.task.id && task.name = wait.task.name && task.output = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ normalOutput _ _ =>
          task.id = wait.task.id && task.name = wait.task.name && normalOutput = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | _ => false).length = 1

private def messageWaitId (wait : MessageWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

private def messageWaitValid (program : Program) (state : RuntimeState)
    (wait : MessageWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitMessage _ _ _ output message =>
          message.elementId = wait.elementId && message.channel = wait.channel && output = wait.output
      | .awaitEventRace _ origin _ message _ =>
          message.elementId = wait.elementId && message.channel = wait.channel &&
            message.output = wait.output && state.eventRaces.any fun race =>
              race.owner = wait.owner && race.id.elementId.value = origin.elementId.value &&
                race.messageSubscriptionId = messageWaitId wait
      | _ => false).length = 1

private def timerWaitId (wait : TimerWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

private def boundaryTimerOperationMatches (program : Program) (state : RuntimeState)
    (wait : TimerWait) (operation : SemanticOperation) : Bool :=
  if !operationOwnedBy program operation wait.owner then false
  else match operation with
  | .awaitBoundedUserTask _ _ _ task boundary
  | .awaitMonitoredUserTask _ _ _ task boundary =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.waits.filter fun host => decide
          (host.owner = wait.owner && host.task.id = task.id &&
            host.activation = wait.activation)).length = 1
  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ boundary _ =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.activityOccurrences.filter fun record =>
          record.owner = wait.owner && recordAttaches record (timerWaitId wait) &&
            match activityBodyTask? record with
            | some body => body.elementId.value = task.id.value
            | none => false).length = 1
  | .enterBoundedScope _ _ _ _ childScopeId boundary =>
      boundary.elementId = wait.elementId && boundary.output = wait.output &&
        (state.scopeOccurrences.filter fun child => decide
          (child.id.definitionScopeId = childScopeId && child.id.activation = wait.activation &&
            child.parent = some wait.owner)).length = 1
  | _ => false

/-- Whether one already validated Timer wait is the private deadline of one exact live host. -/
def flowNodeOccurrenceBoundaryTimerBound (program : Program) (state : RuntimeState)
    (wait : TimerWait) : Bool :=
  (program.operations.filter (boundaryTimerOperationMatches program state wait)).length = 1

private def timerWaitValid (program : Program) (state : RuntimeState)
    (wait : TimerWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitTimer _ _ _ output timer =>
          timer.elementId = wait.elementId && output = wait.output
      | .awaitEventRace _ origin _ _ timer =>
          timer.elementId = wait.elementId && timer.output = wait.output &&
            state.eventRaces.any fun race =>
              race.owner = wait.owner && race.id.elementId.value = origin.elementId.value &&
                race.timerOccurrenceId = timerWaitId wait
      | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
      | .awaitSequentialMultiInstanceUserTask .. | .enterBoundedScope .. =>
          boundaryTimerOperationMatches program state wait operation
      | _ => false).length = 1

private def effectWaitValid (program : Program) (state : RuntimeState)
    (wait : EffectWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitEffect _ _ _ output effect route =>
          effect.elementId = wait.elementId && effect.descriptor = wait.descriptor &&
            evaluateInputMappings effect.inputMappings = some wait.arguments &&
            effect.outputMappings = wait.outputMappings && output = wait.output &&
            route = wait.bpmnErrorRoute
      | _ => false).length = 1

private def effectLocalScopesExact (state : RuntimeState) : Bool :=
  let waits := state.effectWaits ++ state.effectIncidents.map (·.wait)
  waits.all (fun wait =>
      (waits.filter fun candidate => decide
        (effectWaitOccurrenceId candidate = effectWaitOccurrenceId wait)).length = 1 &&
      match state.variables.activities.filter (activityScopeMatches (effectWaitOccurrenceId wait)) with
      | [activity] => activity.bindings = wait.arguments
      | _ => false) &&
    state.variables.activities.all fun activity =>
      (waits.filter fun wait => activityScopeMatches (effectWaitOccurrenceId wait) activity).length = 1

private def callRecordValid (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) : Bool :=
  occurrenceOwnerValid state record.id.processInstanceId record.caller
      ⟨record.id.elementId.value⟩ record.id.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation record.caller then false
      else match operation with
      | .invokeProcess _ origin _ calledProcessId calledRootScopeId _ returnOperationId =>
          origin.elementId.value = record.id.elementId.value &&
            calledProcessId = record.calledProcessId &&
            calledRootScopeId = record.calledRoot.definitionScopeId &&
            returnOperationId = record.returnOperationId
      | _ => false).length = 1

/-- Exact immutable-Program correspondence for every runtime occurrence family used by open projection. -/
def flowNodeOccurrenceProgramValidity (program : Program) (state : RuntimeState) : Bool :=
  state.scopeOccurrences.all (runtimeScopeBindingValid program state) &&
    state.waits.all (userTaskWaitValid program state) &&
    state.messageWaits.all (messageWaitValid program state) &&
    state.timerWaits.all (timerWaitValid program state) &&
    state.effectWaits.all (effectWaitValid program state) &&
    state.effectIncidents.all (fun incident => effectWaitValid program state incident.wait) &&
    state.selectedBranchSets.all (fun record =>
      flowNodeOccurrenceOwnerLiveUnique state record.owner) &&
    state.eventRaces.all (fun race => flowNodeOccurrenceOwnerLiveUnique state race.owner) &&
    state.calledProcessOccurrences.all (callRecordValid program state) &&
    effectLocalScopesExact state

end BpmnSemantics.SemanticProcess
