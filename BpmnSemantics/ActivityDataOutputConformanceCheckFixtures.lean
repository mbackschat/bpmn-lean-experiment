module

public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.Lowering

/-! Fixture definitions and executable checks of [`ActivityDataOutputConformance`](ActivityDataOutputConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.ActivityDataOutputConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

def decisionDirectOutput : DirectActivityDataOutput :=
  { associationId := "DataOutputAssociation_Decision"
    sourceDataOutputId := "DataOutput_Decision"
    sourceDataOutputName := some "Underwriting decision"
    target := .property "Property_UnderwritingOutcome" }

/-- The capsule's routing precondition. Stated as its own checked fact because every write law below
is vacuously satisfiable by a name-merged implementation when these two identities agree. -/
def declaredOutputAndAssociatedPropertyAreDistinct : Bool := decide <|
    decisionDirectOutput.sourceDataOutputId ≠ decisionDirectOutput.target.id

def underwritingProcessId : ProcessId :=
  ⟨"Process_ActivityDataOutputUnderwriting"⟩

def underwritingCheckedProcess : CheckedProcess :=
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

def underwritingProgram : Program :=
  lowerCheckedProcess underwritingCheckedProcess

def underwritingInstanceId : SemanticId :=
  ⟨"ActivityDataOutputInstance_1"⟩

/-- A checked process identical to the registered one except that the declared `DataOutput` and its
target `Property` share one identity. No BPMN document can express this, because both ends are
`xsd:ID`, so admission of the lowered Program is the only boundary that can refuse it. -/
def mergedIdentityCheckedProcess : CheckedProcess :=
  { underwritingCheckedProcess with
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_Recorded"⟩
      , .noneStartEvent ⟨"StartEvent_Application"⟩
      , .dataOutputUserTask ⟨"UserTask_Decide"⟩ (some "Decide credit application")
          { decisionDirectOutput with
            target := .property decisionDirectOutput.sourceDataOutputId } ] }

/-- `ADOUTPUT-ROUTE-01`'s precondition made executable rather than merely asserted.

Equal identities would let a name-merged completion satisfy every routed expectation in this module
by coincidence. The registered program is admissible and the merged one is not, so the refusal is
the identity rule rather than a validator that rejects everything. -/
def mergedOutputAndPropertyIdentityIsStructurallyRejected : Bool := decide <|
    (programWellFormed underwritingProgram,
      programWellFormed (lowerCheckedProcess mergedIdentityCheckedProcess)) =
      (true, false)

/-- The only start this capsule registers: no Process data at all, which is exactly the state in
which the sibling input model creates neither a task nor an Activity record. -/
def startUnderwriting : Stimulus :=
  .startProcess ⟨"start-underwriting"⟩ ⟨underwritingProcessId.value⟩
    underwritingInstanceId []

def started : StimulusResult :=
  applyStimulus scenarioClosureLimit underwritingProgram initialState startUnderwriting

def decideTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := underwritingInstanceId
    elementId := ⟨"UserTask_Decide"⟩
    activation := 1 }

def decideActivityOwner : LocalDataOwner :=
  .activityOccurrence
    { processInstanceId := underwritingInstanceId
      activityElementId := ⟨"UserTask_Decide"⟩
      activation := 1 }

def complete (commandId : String)
    (submittedValues : List VariableBinding) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ decideTaskInstanceId submittedValues

def decideApproved : Stimulus :=
  complete "decide-approved" [{ name := decisionDirectOutput.sourceDataOutputId
                                value := .string "approved" }]

def decideNull : Stimulus :=
  complete "decide-null" [{ name := decisionDirectOutput.sourceDataOutputId
                            value := .null }]

def observed (result : StimulusResult) : Option StateObservation :=
  observeStableState underwritingProgram result.state

def tokenAloneActivatesWithNoProcessBinding : Bool := decide <|
    (started.outcome, started.state.variables.process.bindings,
      started.state.waits.map (·.task.id)) =
      (CommandOutcome.committed, [], [⟨"UserTask_Decide"⟩])

/-- `ADOUTPUT-ENTRY-01`. The Activity owns exactly one local scope and it is empty.

The container is armed at entry rather than at completion so the Activity owns one lifetime rather
than two. It stays empty for that whole lifetime, because `ADOUTPUT-ATOMIC-01` fuses the fill with
the association and the submitted value reaches Process scope without passing through here. -/
def activationArmsOneEmptyActivityScope : Bool := decide <|
    started.state.variables.activities =
      [{ owner := decideActivityOwner, bindings := [] }]

/-- An Activity owning an empty scope publishes no input collection, so the empty container is not
observable as data the task carries. -/
def activeTaskPublishesNoInputCollection : Bool := decide <|
    (observed started).map (·.openUserTasks) =
      some
        [{ id := decideTaskInstanceId
           name := some "Decide credit application"
           state := .active
           inputs := none }]

def approved : StimulusResult :=
  applyStimulus scenarioClosureLimit underwritingProgram started.state decideApproved

/-- `ADOUTPUT-ROUTE-01`. The value reaches the Property the association names, and the submitted
`DataOutput` id never becomes a Process binding of its own. -/
def completionWritesTheAssociatedPropertyOnly : Bool := decide <|
    (approved.outcome, approved.state.variables.process.bindings) =
      (CommandOutcome.committed,
        [{ name := decisionDirectOutput.target.id, value := .string "approved" }])

/-- `ADOUTPUT-ATOMIC-01`. The wait, the Activity record, and the local scope leave in the same
transition that performs the write. -/
def completionDisposesTaskRecordAndScopeTogether : Bool := decide <|
    (approved.state.waits, approved.state.activityOccurrences,
      approved.state.variables.activities) = ([], [], [])

def completedProcessPublishesTheWrittenProperty : Bool := decide <|
    (observed approved).map (fun observation =>
      (observation.status, observation.openUserTasks, observation.variables)) =
      some
        (ProcessStatus.completed, [],
          [{ name := decisionDirectOutput.target.id,
             value := .string "approved" }])

def nullDecided : StimulusResult :=
  applyStimulus scenarioClosureLimit underwritingProgram started.state decideNull

/-- A supplied explicit null makes the single required output available exactly as a String does, so
it is written rather than treated as an omission. -/
def suppliedNullIsWrittenRatherThanOmitted : Bool := decide <|
    (nullDecided.outcome, nullDecided.state.variables.process.bindings) =
      (CommandOutcome.committed,
        [{ name := decisionDirectOutput.target.id, value := .null }])

/-- `ADOUTPUT-ROUTE-01`'s separating non-law. Submitting the association's *target* name is a name
the OutputSet never declares, so it is refused rather than written straight into Process scope. A
name-merged completion would commit here and reach the same Process scope as the routed one. -/
def submissionUnderTheTargetNameIsRefused : Bool := decide <|
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (complete "decide-under-target-name"
          [{ name := decisionDirectOutput.target.id, value := .string "approved" }]) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

/-- `ADOUTPUT-REQUIRE-01`. An omitted required output refuses with exact state preservation rather
than completing the Activity without honouring its OutputSet. -/
def omittedRequiredOutputIsRefused : Bool := decide <|
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (complete "decide-without-output" []) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

/-- The OutputSet declares exactly one member, so a superset is refused rather than silently
narrowed to the declared name. -/
def extraSubmittedOutputIsRefused : Bool := decide <|
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (complete "decide-with-extra-output"
          [ { name := decisionDirectOutput.sourceDataOutputId, value := .string "approved" }
          , { name := "DataOutput_Unadmitted", value := .string "second" } ]) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def wrongActivationPreservesTheActiveState : Bool := decide <|
    applyStimulus scenarioClosureLimit underwritingProgram started.state
        (.completeUserTaskInstance ⟨"decide-wrong-activation"⟩
          { decideTaskInstanceId with activation := 2 }
          [{ name := decisionDirectOutput.sourceDataOutputId, value := .string "approved" }]) =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def repeatedOutputDeclarations (count : Nat) : Program :=
  { underwritingProgram with
    operations := underwritingProgram.operations.flatMap fun operation =>
      match operation with
      | .awaitDataOutputUserTask .. => List.replicate count operation
      | _ => [operation] }

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("declaredOutputAndAssociatedPropertyAreDistinct", declaredOutputAndAssociatedPropertyAreDistinct),
  ("mergedOutputAndPropertyIdentityIsStructurallyRejected", mergedOutputAndPropertyIdentityIsStructurallyRejected),
  ("tokenAloneActivatesWithNoProcessBinding", tokenAloneActivatesWithNoProcessBinding),
  ("activationArmsOneEmptyActivityScope", activationArmsOneEmptyActivityScope),
  ("activeTaskPublishesNoInputCollection", activeTaskPublishesNoInputCollection),
  ("completionWritesTheAssociatedPropertyOnly", completionWritesTheAssociatedPropertyOnly),
  ("completionDisposesTaskRecordAndScopeTogether", completionDisposesTaskRecordAndScopeTogether),
  ("completedProcessPublishesTheWrittenProperty", completedProcessPublishesTheWrittenProperty),
  ("suppliedNullIsWrittenRatherThanOmitted", suppliedNullIsWrittenRatherThanOmitted),
  ("submissionUnderTheTargetNameIsRefused", submissionUnderTheTargetNameIsRefused),
  ("omittedRequiredOutputIsRefused", omittedRequiredOutputIsRefused),
  ("extraSubmittedOutputIsRefused", extraSubmittedOutputIsRefused),
  ("wrongActivationPreservesTheActiveState", wrongActivationPreservesTheActiveState)
]

end BpmnSemantics.ActivityDataOutputConformance
