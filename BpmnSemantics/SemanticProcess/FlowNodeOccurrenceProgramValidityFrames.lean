import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity

/-! # Flow-node occurrence Program-validity frames

This module lifts the four ordinary prepared-wait family preservation results into complete flow-node occurrence Program validity. It adds no validator or admission algorithm.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem waitProgramValidity_of_programValidity (program : Program) (state : RuntimeState)
    (valid : flowNodeOccurrenceProgramValidity program state = true) :
    flowNodeOccurrenceWaitProgramValidity program state = true := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at valid
  exact valid.1.1.2

/-- Transfer full occurrence validity from a reference state when only irrelevant runtime fields differ. -/
theorem flowNodeOccurrenceProgramValidity_from_reference (program : Program)
    (before reference after : RuntimeState)
    (prior : flowNodeOccurrenceProgramValidity program before = true)
    (referenceValid : flowNodeOccurrenceProgramValidity program reference = true)
    (waits : flowNodeOccurrenceWaitProgramValidity program after =
      flowNodeOccurrenceWaitProgramValidity program reference)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (selected : after.selectedBranchSets = before.selectedBranchSets)
    (races : after.eventRaces = before.eventRaces) :
    flowNodeOccurrenceProgramValidity program after = true := by
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program before after prior
  · rw [waits]
    exact waitProgramValidity_of_programValidity program reference referenceValid
  · exact control
  · exact scopes
  · exact calls
  · exact selected
  · exact races

theorem flowNodeOccurrenceProgramValidity_insertOrdinaryUserTask (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (wait : UserTaskWait)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (declarers : userTaskWaitDeclarers program wait.task.id =
      [.awaitUserTask id origin input wait.output wait.task])
    (declared : declaredByExactlyOneOwnedOperation program
      (userTaskWaitDeclarers program wait.task.id) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (ownerProcess : !wait.processInstanceId.value.isEmpty = true)
    (taskId : !wait.task.id.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (metadata : wait.metadata = wait.task.metadata) :
    flowNodeOccurrenceProgramValidity program
      { state with waits := insertUserTaskWait wait state.waits } = true := by
  let after : RuntimeState := { state with waits := insertUserTaskWait wait state.waits }
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program state after prior
  · exact flowNodeOccurrenceWaitProgramValidity_insertOrdinaryUserTask program state id origin input
      wait (waitProgramValidity_of_programValidity program state prior) declarers declared live
      ownerProcess taskId positive processOwner metadata
  all_goals rfl

theorem flowNodeOccurrenceProgramValidity_insertOrdinaryMessage (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : MessageDefinition) (wait : MessageWait)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (declarers : messageWaitDeclarers program wait.elementId =
      [.awaitMessage id origin input wait.output message])
    (declared : declaredByExactlyOneOwnedOperation program
      (messageWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (element : message.elementId = wait.elementId) (channel : message.channel = wait.channel) :
    flowNodeOccurrenceProgramValidity program
      { state with messageWaits := insertMessageWait wait state.messageWaits } = true := by
  let after : RuntimeState :=
    { state with messageWaits := insertMessageWait wait state.messageWaits }
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program state after prior
  · exact flowNodeOccurrenceWaitProgramValidity_insertOrdinaryMessage program state id origin input
      message wait (waitProgramValidity_of_programValidity program state prior) declarers declared
      live processId elementId positive processOwner element channel
  all_goals rfl

theorem flowNodeOccurrenceProgramValidity_insertPayloadMessage (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : MessageDefinition)
    (directOutput : DirectCatchEventPayloadOutput) (wait : MessageWait)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (declarers : messageWaitDeclarers program wait.elementId =
      [.awaitPayloadMessage id origin input wait.output message directOutput])
    (declared : declaredByExactlyOneOwnedOperation program
      (messageWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (element : message.elementId = wait.elementId) (channel : message.channel = wait.channel) :
    flowNodeOccurrenceProgramValidity program
      { state with messageWaits := insertMessageWait wait state.messageWaits } = true := by
  let after : RuntimeState :=
    { state with messageWaits := insertMessageWait wait state.messageWaits }
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program state after prior
  · exact flowNodeOccurrenceWaitProgramValidity_insertPayloadMessage program state id origin input
      message directOutput wait (waitProgramValidity_of_programValidity program state prior)
      declarers declared live processId elementId positive processOwner element channel
  all_goals rfl

theorem flowNodeOccurrenceProgramValidity_insertOrdinaryTimer (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (timer : TimerDefinition) (wait : TimerWait)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (declarers : timerWaitDeclarers program wait.elementId =
      [.awaitTimer id origin input wait.output timer])
    (declared : declaredByExactlyOneOwnedOperation program
      (timerWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (element : timer.elementId = wait.elementId) :
    flowNodeOccurrenceProgramValidity program
      { state with timerWaits := insertTimerWait wait state.timerWaits } = true := by
  let after : RuntimeState := { state with timerWaits := insertTimerWait wait state.timerWaits }
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program state after prior
  · exact flowNodeOccurrenceWaitProgramValidity_insertOrdinaryTimer program state id origin input
      timer wait (waitProgramValidity_of_programValidity program state prior) declarers declared
      live processId elementId positive processOwner element
  all_goals rfl

theorem flowNodeOccurrenceProgramValidity_insertOrdinaryEffect (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (wait : EffectWait) (bindings : List VariableBinding)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (declarers : effectWaitDeclarers program wait.elementId =
      [.awaitEffect id origin input wait.output effect route])
    (declared : declaredByExactlyOneOwnedOperation program
      (effectWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (originElement : origin.elementId = wait.elementId)
    (effectElement : effect.elementId = wait.elementId)
    (descriptor : effect.descriptor = wait.descriptor)
    (arguments : evaluateInputMappings effect.inputMappings = some wait.arguments)
    (outputMappings : effect.outputMappings = wait.outputMappings)
    (routeEq : route = wait.bpmnErrorRoute) (bindingsEq : bindings = wait.arguments)
    (aligned : ∀ candidateId candidateOrigin candidateInput candidateOutput candidateEffect
        candidateRoute,
      .awaitEffect candidateId candidateOrigin candidateInput candidateOutput candidateEffect
          candidateRoute ∈ program.operations →
        candidateOrigin.elementId = candidateEffect.elementId)
    (freshWaits : ∀ old ∈ state.effectWaits,
      effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId old)
    (freshIncidents : ∀ incident ∈ state.effectIncidents,
      effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId incident.wait)
    (freshActivities : ∀ activity ∈ state.variables.activities,
      activityScopeMatches (effectWaitOccurrenceId wait) activity = false) :
    flowNodeOccurrenceProgramValidity program
      { state with
        effectWaits := insertEffectWait wait state.effectWaits
        variables := addActivityVariableScope state.variables
          (effectWaitOccurrenceId wait) bindings } = true := by
  let after : RuntimeState :=
    { state with
      effectWaits := insertEffectWait wait state.effectWaits
      variables := addActivityVariableScope state.variables
        (effectWaitOccurrenceId wait) bindings }
  apply flowNodeOccurrenceProgramValidity_of_wait_frame program state after prior
  · exact flowNodeOccurrenceWaitProgramValidity_insertOrdinaryEffect program state id origin input
      effect route wait bindings (waitProgramValidity_of_programValidity program state prior)
      declarers declared live processId elementId positive processOwner originElement effectElement
      descriptor arguments outputMappings routeEq bindingsEq aligned freshWaits freshIncidents
      freshActivities
  all_goals rfl

end BpmnSemantics.SemanticProcess
