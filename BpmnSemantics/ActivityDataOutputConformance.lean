import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Activity data-output conformance

Checked facts for the bounded Activity data-output account: the concrete credit-underwriting
witnesses that separate a routed association write from a name-merged one, an available supplied
output from an omitted one, and data-independent entry from the sibling input family's
data-dependent entry. The family's quantified activation, routing, refusal, and disposal laws are
stated at their owner, [ActivityDataOutput](SemanticProcess/ActivityDataOutput.lean).

The model deliberately gives the `DataOutput` and its target `Property` different ids. Every routed
expectation below would also hold under a name-merged completion if those ids agreed, so the
inequality is what makes these witnesses discriminating rather than merely true.
-/

namespace BpmnSemantics.ActivityDataOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def decisionDirectOutput : DirectActivityDataOutput :=
  { associationId := "DataOutputAssociation_Decision"
    sourceDataOutputId := "DataOutput_Decision"
    sourceDataOutputName := some "Underwriting decision"
    targetPropertyId := "Property_UnderwritingOutcome" }

/-- The capsule's routing precondition. Stated as its own checked fact because every write law below
is vacuously satisfiable by a name-merged implementation when these two identities agree. -/
theorem declaredOutputAndAssociatedPropertyAreDistinct :
    decisionDirectOutput.sourceDataOutputId ≠ decisionDirectOutput.targetPropertyId := by
  decide +kernel

private def underwritingProcessId : ProcessId :=
  ⟨"Process_ActivityDataOutputUnderwriting"⟩

private def underwritingCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := activityDataOutputUserTaskProfileId
        sourceId := ⟨"activity-data-output-user-task"⟩
        sourceSha256 :=
          "de5a4f547f30a2137f8836130f2bbf6156bed14ca8d172d4effd80de2dac0b1b" }
    processId := underwritingProcessId
    definitionScopes := [rootDefinitionScope underwritingProcessId]
    nodeScopes := rootNodeScopes underwritingProcessId
      [⟨"EndEvent_Recorded"⟩, ⟨"StartEvent_Application"⟩, ⟨"UserTask_Decide"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes underwritingProcessId
      [⟨"Flow_Application_Decide"⟩, ⟨"Flow_Decide_Recorded"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_Recorded"⟩
      , .noneStartEvent ⟨"StartEvent_Application"⟩
      , .dataOutputUserTask ⟨"UserTask_Decide"⟩ (some "Decide credit application")
          decisionDirectOutput ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Application_Decide"⟩
          sourceId := ⟨"StartEvent_Application"⟩
          targetId := ⟨"UserTask_Decide"⟩ }
      , { id := ⟨"Flow_Decide_Recorded"⟩
          sourceId := ⟨"UserTask_Decide"⟩
          targetId := ⟨"EndEvent_Recorded"⟩ } ] }

private def underwritingProgram : Program :=
  lowerCheckedProcess underwritingCheckedProcess

private def underwritingInstanceId : SemanticId :=
  ⟨"ActivityDataOutputInstance_1"⟩

/-- The only start this capsule registers: no Process data at all, which is exactly the state in
which the sibling input model creates neither a task nor an Activity record. -/
private def startUnderwriting : Stimulus :=
  .startProcess ⟨"start-underwriting"⟩ ⟨underwritingProcessId.value⟩
    underwritingInstanceId []

private def started : StimulusResult :=
  applyStimulus scenarioClosureLimit underwritingProgram initialState startUnderwriting

private def decideTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := underwritingInstanceId
    elementId := ⟨"UserTask_Decide"⟩
    activation := 1 }

private def decideActivityOwner : LocalDataOwner :=
  .activityOccurrence
    { processInstanceId := underwritingInstanceId
      activityElementId := ⟨"UserTask_Decide"⟩
      activation := 1 }

private def complete (commandId : String)
    (submittedValues : List VariableBinding) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ decideTaskInstanceId submittedValues

private def decideApproved : Stimulus :=
  complete "decide-approved" [{ name := decisionDirectOutput.sourceDataOutputId
                                value := .string "approved" }]

private def decideNull : Stimulus :=
  complete "decide-null" [{ name := decisionDirectOutput.sourceDataOutputId
                            value := .null }]

private def observed (result : StimulusResult) : Option StateObservation :=
  observeStableState underwritingProgram result.state

theorem tokenAloneActivatesWithNoProcessBinding :
    (started.outcome, started.state.variables.process.bindings,
      started.state.waits.map (·.task.id)) =
      (CommandOutcome.committed, [], [⟨"UserTask_Decide"⟩]) := by
  decide +kernel

theorem activationConsumesTheIncomingToken :
    projectTokenMultiplicities underwritingProgram started.state =
      [(⟨"place:Flow_Application_Decide"⟩, 0), (⟨"place:Flow_Decide_Recorded"⟩, 0)] := by
  decide +kernel

/-- `ADOUTPUT-ENTRY-01`. The Activity owns exactly one local scope and it is empty: this family arms
the container at entry and the completion supplies its content. -/
theorem activationArmsOneEmptyActivityScope :
    started.state.variables.activities =
      [{ owner := decideActivityOwner, bindings := [] }] := by
  decide +kernel

/-- An Activity owning an empty scope publishes no input collection, so the empty container is not
observable as data the task carries. -/
theorem activeTaskPublishesNoInputCollection :
    (observed started).map (·.openUserTasks) =
      some
        [{ id := decideTaskInstanceId
           name := some "Decide credit application"
           state := .active
           inputs := none }] := by
  decide +kernel

private def approved : StimulusResult :=
  applyStimulus scenarioClosureLimit underwritingProgram started.state decideApproved

/-- `ADOUTPUT-ROUTE-01`. The value reaches the Property the association names, and the submitted
`DataOutput` id never becomes a Process binding of its own. -/
theorem completionWritesTheAssociatedPropertyOnly :
    (approved.outcome, approved.state.variables.process.bindings) =
      (CommandOutcome.committed,
        [{ name := decisionDirectOutput.targetPropertyId, value := .string "approved" }]) := by
  decide +kernel

/-- `ADOUTPUT-ATOMIC-01`. The wait, the Activity record, and the local scope leave in the same
transition that performs the write. -/
theorem completionDisposesTaskRecordAndScopeTogether :
    (approved.state.waits, approved.state.activityOccurrences,
      approved.state.variables.activities) = ([], [], []) := by
  decide +kernel

theorem completedProcessPublishesTheWrittenProperty :
    (observed approved).map (fun observation =>
      (observation.status, observation.openUserTasks, observation.variables)) =
      some
        (ProcessStatus.completed, [],
          [{ name := decisionDirectOutput.targetPropertyId,
             value := .string "approved" }]) := by
  decide +kernel

private def nullDecided : StimulusResult :=
  applyStimulus scenarioClosureLimit underwritingProgram started.state decideNull

/-- A supplied explicit null makes the single required output available exactly as a String does, so
it is written rather than treated as an omission. -/
theorem suppliedNullIsWrittenRatherThanOmitted :
    (nullDecided.outcome, nullDecided.state.variables.process.bindings) =
      (CommandOutcome.committed,
        [{ name := decisionDirectOutput.targetPropertyId, value := .null }]) := by
  decide +kernel

/-- `ADOUTPUT-ROUTE-01`'s separating non-law. Submitting the association's *target* name is a name
the OutputSet never declares, so it is refused rather than written straight into Process scope. A
name-merged completion would commit here and reach the same Process scope as the routed one. -/
theorem submissionUnderTheTargetNameIsRefused :
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (complete "decide-under-target-name"
          [{ name := decisionDirectOutput.targetPropertyId, value := .string "approved" }]) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- `ADOUTPUT-REQUIRE-01`. An omitted required output refuses with exact state preservation rather
than completing the Activity without honouring its OutputSet. -/
theorem omittedRequiredOutputIsRefused :
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (complete "decide-without-output" []) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- The OutputSet declares exactly one member, so a superset is refused rather than silently
narrowed to the declared name. -/
theorem extraSubmittedOutputIsRefused :
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (complete "decide-with-extra-output"
          [ { name := decisionDirectOutput.sourceDataOutputId, value := .string "approved" }
          , { name := "DataOutput_Unadmitted", value := .string "second" } ]) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem staleCompletionPreservesTheCommittedState :
    applyStimulus scenarioClosureLimit underwritingProgram approved.state decideApproved =
      { outcome := .rejected
        state := approved.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem wrongActivationPreservesTheActiveState :
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (.completeUserTaskInstance ⟨"decide-wrong-activation"⟩
          { decideTaskInstanceId with activation := 2 }
          [{ name := decisionDirectOutput.sourceDataOutputId, value := .string "approved" }]) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

end BpmnSemantics.ActivityDataOutputConformance
