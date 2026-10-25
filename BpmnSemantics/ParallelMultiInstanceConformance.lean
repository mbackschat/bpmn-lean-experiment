module

import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.CallActivity

/-! # Parallel Multi-Instance conformance

Executable witnesses for the approved Parallel Multi-Instance User Task account.

These foundation witnesses bind the two distinct operation surfaces, their exact pairing, and the
indexed controller partition. Parallel entry cannot be represented by the sequential operation with
a different schedule, and command-addressed child completion cannot be treated as an internal entry.
-/

@[expose] public section

namespace BpmnSemantics.ParallelMultiInstanceConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- `PMI-ENTER-01` requires a distinct, profile-gated parallel entry operation. -/
def parallelEntryOperationConstructor :=
  SemanticOperation.awaitParallelMultiInstanceUserTask

/-- The command-addressed child completion is a second, distinct operation arm. -/
def parallelCompletionOperationConstructor :=
  SemanticOperation.completeParallelMultiInstanceUserTask

def operationOrigin : BpmnElementOrigin :=
  { elementId := ⟨"UserTask_Review"⟩ }

def normalOutput : ControlPlaceId := ⟨"place:Flow_Review_Completed"⟩

def dataDefinition : SequentialMultiInstanceDataDefinition :=
  { input :=
      { collectionItemDefinitionId := "ItemDefinition_StringList"
        scalarItemDefinitionId := "ItemDefinition_String"
        dataObjectId := "DataObject_InputItems"
        dataObjectReferenceId := "DataObjectReference_InputItems"
        loopDataInputId := "DataInput_Items"
        inputDataItemId := "InputDataItem_CurrentItem"
        taskDataInputId := "DataInput_CurrentItem"
        collectionAssociationId := "DataInputAssociation_Items"
        itemAssociationId := "DataInputAssociation_CurrentItem" }
    output :=
      { dataObjectId := "DataObject_OutputResults"
        dataObjectReferenceId := "DataObjectReference_OutputResults"
        taskDataOutputId := "DataOutput_CurrentResult"
        outputDataItemId := "OutputDataItem_CurrentResult"
        loopDataOutputId := "DataOutput_Results"
        itemAssociationId := "DataOutputAssociation_CurrentResult"
        collectionAssociationId := "DataOutputAssociation_Results" } }

def entryOperation : SemanticOperation :=
  .awaitParallelMultiInstanceUserTask ⟨"operation:UserTask_Review"⟩ operationOrigin
    ⟨"place:Flow_Start_Review"⟩ ⟨"UserTask_Review"⟩ (some "Review item")
    dataDefinition
    normalOutput
    { elementId := ⟨"BoundaryTimer_Review"⟩
      durationMs := 5000
      output := ⟨"place:Flow_Timer_Escalation"⟩
      origin := { elementId := ⟨"Flow_Timer_Escalation"⟩ } }
    (.stringEquals "completionPolicy" "first")
    { maximumItems := 16
      maximumItemUtf8Bytes := 512
      maximumCanonicalCollectionUtf8Bytes := 8192 }

def completionOperation : SemanticOperation :=
  .completeParallelMultiInstanceUserTask ⟨"operation:UserTask_Review:complete"⟩ operationOrigin
    ⟨"operation:UserTask_Review"⟩ ⟨"UserTask_Review"⟩ normalOutput

def completionForAnotherEntry : SemanticOperation :=
  .completeParallelMultiInstanceUserTask ⟨"operation:UserTask_Review:complete"⟩ operationOrigin
    ⟨"operation:Other"⟩ ⟨"UserTask_Review"⟩ normalOutput

def completionForAnotherOutput : SemanticOperation :=
  .completeParallelMultiInstanceUserTask ⟨"operation:UserTask_Review:complete"⟩ operationOrigin
    ⟨"operation:UserTask_Review"⟩ ⟨"UserTask_Review"⟩ ⟨"place:Other"⟩

def ordinaryTaskWithParallelTaskIdentity : SemanticOperation :=
  .awaitUserTask ⟨"operation:Ordinary_Review"⟩ operationOrigin
    ⟨"place:Ordinary_Input"⟩ ⟨"place:Ordinary_Output"⟩
    { id := ⟨"UserTask_Review"⟩, name := some "Ordinary review" }

/-- Standalone Program admission rejects an ordinary User Task that collides with the parallel
Multi-Instance entry's User Task declaration. -/
def parallel_multi_instance_same_task_declarer_is_rejected : Bool := decide <|
    programWaitDeclarersUnique [entryOperation, ordinaryTaskWithParallelTaskIdentity] = false

def exact_completion_pair_is_unique_and_substitution_fails_closed : Bool := decide <|
    parallelMultiInstanceOperationsPair entryOperation completionOperation = true ∧
    parallelMultiInstanceOperationsPair entryOperation completionForAnotherEntry = false ∧
    parallelMultiInstanceOperationsPair entryOperation completionForAnotherOutput = false ∧
    ParallelMultiInstanceArm.ofOperation? completionOperation = none ∧
    parallelMultiInstanceCompletionForEntry?
        [entryOperation, completionOperation, completionForAnotherEntry, completionForAnotherOutput]
        entryOperation = some completionOperation ∧
    parallelMultiInstanceCompletionForEntry?
        [entryOperation, completionOperation, completionOperation] entryOperation = none

def taskId (activation : Nat) : UserTaskInstanceId :=
  { processInstanceId := ⟨"ParallelMultiInstance_Foundation"⟩
    elementId := ⟨"UserTask_Review"⟩
    activation }

/-- Index two may complete first without moving its result to index zero. -/
def thirdSlotCompletedFirst : ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := ⟨"ParallelMultiInstance_Foundation"⟩
        activityElementId := ⟨"UserTask_Review"⟩
        activation := 1 }
    snapshot := ["Invoice_1", "Invoice_2", "Invoice_3"]
    slots :=
      [ .pending (taskId 1)
      , .pending (taskId 2)
      , .completed (taskId 3) "Reviewed_3" ] }

def third_slot_completion_preserves_index_and_derived_counts : Bool := decide <|
    ((indexedParallelMultiInstanceSlots thirdSlotCompletedFirst).map fun indexed =>
        (indexed.1, indexed.2.taskId.activation, indexed.2.result?)) =
      [(0, 1, none), (1, 2, none), (2, 3, some "Reviewed_3")] ∧
    parallelPlannedInstanceCount thirdSlotCompletedFirst = 3 ∧
    parallelGeneratedInstanceCount thirdSlotCompletedFirst = 3 ∧
    parallelActiveInstanceCount thirdSlotCompletedFirst = 2 ∧
    parallelCompletedInstanceCount thirdSlotCompletedFirst = 1

def arm? : Option ParallelMultiInstanceArm :=
  ParallelMultiInstanceArm.ofOperation? entryOperation

def preEntryItemsWith (items : List String)
    (completionPolicy : String) : ParallelMultiInstanceRuntimeState :=
  emptyParallelMultiInstanceRuntimeState ⟨"ParallelMultiInstance_Foundation"⟩
    [ { name := "DataObjectReference_InputItems"
        value := .stringList items }
    , { name := "completionPolicy", value := .string completionPolicy } ]

def preEntryWith (completionPolicy : String) : ParallelMultiInstanceRuntimeState :=
  preEntryItemsWith ["Invoice_1", "Invoice_2", "Invoice_3"] completionPolicy

def enteredWith (completionPolicy : String) : Option ParallelMultiInstanceRuntimeState := do
  let arm ← arm?
  enterParallelMultiInstance? arm (preEntryWith completionPolicy)

def submittedResult (result : String) : List VariableBinding :=
  [{ name := "DataOutput_CurrentResult", value := .string result }]

def completedWith (before : Option ParallelMultiInstanceRuntimeState)
    (activation : Nat) (result : String) : Option ParallelMultiInstanceRuntimeState := do
  let arm ← arm?
  let state ← before
  completeParallelMultiInstance? arm state (taskId activation) (submittedResult result)

def enteredAll? : Option ParallelMultiInstanceRuntimeState := enteredWith "all"
def afterThirdAll? : Option ParallelMultiInstanceRuntimeState :=
  completedWith enteredAll? 3 "Reviewed_3"
def afterFirstAll? : Option ParallelMultiInstanceRuntimeState :=
  completedWith afterThirdAll? 1 "Reviewed_1"
def finishedAll? : Option ParallelMultiInstanceRuntimeState :=
  completedWith afterFirstAll? 2 "Reviewed_2"

def enteredFirst? : Option ParallelMultiInstanceRuntimeState := enteredWith "first"
def afterThirdFirst? : Option ParallelMultiInstanceRuntimeState :=
  completedWith enteredFirst? 3 "Reviewed_3"
def afterFirstFirst? : Option ParallelMultiInstanceRuntimeState :=
  completedWith enteredFirst? 1 "Reviewed_1"

def controllerSlotResults? (state : ParallelMultiInstanceRuntimeState) :
    Option (List (Option String)) :=
  state.controller.map fun controller => controller.slots.map (fun slot => slot.result?)

def processOutput? (state : ParallelMultiInstanceRuntimeState) : Option (List String) :=
  match state.processBindings.filter fun binding =>
      binding.name == "DataObjectReference_OutputResults" with
  | [binding] =>
      match binding.value with
      | .stringList results => some results
      | _ => none
  | _ => none

def timerId : TimerOccurrenceId :=
  { processInstanceId := ⟨"ParallelMultiInstance_Foundation"⟩
    elementId := ⟨"BoundaryTimer_Review"⟩
    activation := 1 }

def timerClosedAll? : Option ParallelMultiInstanceRuntimeState := do
  let arm ← arm?
  let state ← enteredAll?
  interruptParallelMultiInstance? arm state timerId

def staleThirdRefusal : Option ParallelMultiInstanceRuntimeState := do
  let arm ← arm?
  let state ← afterThirdAll?
  completeParallelMultiInstance? arm state (taskId 3) (submittedResult "Duplicate")

def wrongOwnerRefusal : Option ParallelMultiInstanceRuntimeState := do
  let arm ← arm?
  let state ← enteredAll?
  completeParallelMultiInstance? arm state
    { taskId 3 with processInstanceId := ⟨"Other_Process"⟩ }
    (submittedResult "Substituted")

def thirdFirstDelta? : Option ParallelMultiInstanceLifecycleDelta := do
  let before ← enteredFirst?
  let after ← afterThirdFirst?
  pure (parallelCompletionLifecycleDelta before after (taskId 3))

def firstFirstDelta? : Option ParallelMultiInstanceLifecycleDelta := do
  let before ← enteredFirst?
  let after ← afterFirstFirst?
  pure (parallelCompletionLifecycleDelta before after (taskId 1))

def atomicFreshEntryWitness : Bool :=
  match enteredAll?, arm? with
  | some state, some arm =>
      decide (state.taskActivationHighWater = 3) &&
        decide (state.liveChildren.map (fun child => child.activation) = [1, 2, 3]) &&
        (match state.controller with
          | some controller =>
              decide (controller.snapshot = ["Invoice_1", "Invoice_2", "Invoice_3"]) &&
                decide (controller.slots.length = 3) &&
                decide (parallelSlotTaskIds controller.slots).Nodup
          | none => false) &&
        parallelMultiInstanceRuntimeWellFormed arm state
  | _, _ => false

def entry_is_atomic_fresh_and_well_formed : Bool := decide <| atomicFreshEntryWitness = true

/-- The named adversarial state cannot occur: index two stays index two, then early closure removes
index zero and every sibling together with the Timer and publishes no output. -/
def index_two_first_never_moves_or_leaves_an_early_closed_region : Bool := decide <|
    afterThirdAll?.bind controllerSlotResults? =
      some [none, none, some "Reviewed_3"] ∧
    afterThirdFirst?.map (fun state =>
      (state.controller, state.liveChildren, state.lifetimeTimer, processOutput? state)) =
      some (none, [], none, none)

def all_policy_publishes_only_complete_input_index_order : Bool := decide <|
    afterThirdAll?.map processOutput? = some none ∧
      finishedAll?.map (fun state =>
        (state.controller, state.liveChildren, state.lifetimeTimer, processOutput? state)) =
      some (none, [], none,
        some ["Reviewed_1", "Reviewed_2", "Reviewed_3"])

def timer_withdraws_every_child_and_publishes_nothing : Bool := decide <|
    timerClosedAll?.map (fun state =>
      (state.controller.isNone, state.liveChildren.isEmpty, state.lifetimeTimer.isNone,
        state.enabledOutput.map (fun output => output.value) ==
          some "place:Flow_Timer_Escalation",
        (processOutput? state).isNone)) =
      some (true, true, true, true, true)

def stale_duplicate_and_wrong_owner_refuse : Bool := decide <|
    staleThirdRefusal = none ∧ wrongOwnerRefusal = none

/-- Equal first-policy terminal states do not erase the command-addressed lifecycle distinction. -/
def first_policy_order_is_a_trace_non_law : Bool := decide <|
    afterThirdFirst? = afterFirstFirst? ∧ thirdFirstDelta? ≠ firstFirstDelta?

def processId : ProcessId := ⟨"Process_ParallelMultiInstanceReview"⟩

def rootScopeId : DefinitionScopeId := ⟨"scope:Process_ParallelMultiInstanceReview"⟩

def programOperations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:EndEvent_Completed"⟩
      { elementId := ⟨"EndEvent_Completed"⟩ } ⟨"place:Flow_Review_Completed"⟩
  , .reachNoneEnd ⟨"operation:EndEvent_Interrupted"⟩
      { elementId := ⟨"EndEvent_Interrupted"⟩ } ⟨"place:Flow_Escalation_End"⟩
  , .initiate ⟨"operation:StartEvent_Review"⟩
      { elementId := ⟨"StartEvent_Review"⟩ } ⟨"place:Flow_Start_Review"⟩
  , .awaitUserTask ⟨"operation:UserTask_Escalation"⟩
      { elementId := ⟨"UserTask_Escalation"⟩ } ⟨"place:Flow_Timer_Escalation"⟩
      ⟨"place:Flow_Escalation_End"⟩
      { id := ⟨"UserTask_Escalation"⟩
        name := some "Handle interrupted review" }
  , entryOperation
  , completionOperation
  , .completeScope ⟨"operation:complete-scope:scope:Process_ParallelMultiInstanceReview"⟩
      { elementId := ⟨"Process_ParallelMultiInstanceReview"⟩ } rootScopeId none ]

def programControlPlaces : List ControlPlace :=
  [ { id := ⟨"place:Flow_Escalation_End"⟩
      origin := { elementId := ⟨"Flow_Escalation_End"⟩ } }
  , { id := ⟨"place:Flow_Review_Completed"⟩
      origin := { elementId := ⟨"Flow_Review_Completed"⟩ } }
  , { id := ⟨"place:Flow_Start_Review"⟩
      origin := { elementId := ⟨"Flow_Start_Review"⟩ } }
  , { id := ⟨"place:Flow_Timer_Escalation"⟩
      origin := { elementId := ⟨"Flow_Timer_Escalation"⟩ } } ]

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := parallelMultiInstanceUserTaskProfileId
        sourceId := ⟨"parallel-multi-instance-first-trace"⟩
        sourceSha256 :=
          "99f6c947d5836d44bb83503f0657e943ecf405c3d298688f12e1c5eaeb98c81e" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes :=
      [{ id := rootScopeId
         parentScopeId := none
         originElementId := ⟨"Process_ParallelMultiInstanceReview"⟩ }]
    operationScopes := programOperations.map fun operation =>
      { operationId := operation.id
        scopeId := rootScopeId }
    controlPlaceScopes := programControlPlaces.map fun place =>
      { controlPlaceId := place.id
        scopeId := rootScopeId }
    controlPlaces := programControlPlaces
    operations := programOperations }

def programArm? : Option ParallelMultiInstanceArm :=
  match program.operations.filterMap ParallelMultiInstanceArm.ofOperation? with
  | [arm] => some arm
  | _ => none

def sharedPreEntry? : Option RuntimeState := do
  let arm ← programArm?
  let started ← runningProgramStartState? program ⟨"ParallelMultiInstance_Foundation"⟩
    [ { name := arm.data.input.dataObjectReferenceId
        value := .stringList ["Invoice_1", "Invoice_2", "Invoice_3"] }
    , { name := "completionPolicy", value := .string "first" } ]
  let owner ← rootScopeOccurrence? started
  pure
    { started with
      initiationPending := false
      tokens := [{ placeId := arm.input, owner }] }

def sharedEnteredFirst? : Option RuntimeState := do
  let arm ← programArm?
  let before ← sharedPreEntry?
  enterSharedParallelMultiInstance? arm before

def completionStimulus (commandId : String) (activation : Nat) (result : String) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ (taskId activation) (submittedResult result)

def thirdFirstStimulus : Stimulus :=
  completionStimulus "complete-third-first" 3 "Reviewed_3"

def firstFirstStimulus : Stimulus :=
  completionStimulus "complete-first-first" 1 "Reviewed_1"

def sharedEnteredFirst : RuntimeState := sharedEnteredFirst?.getD initialState

def thirdFirstTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit program sharedEnteredFirst thirdFirstStimulus

def firstFirstTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit program sharedEnteredFirst firstFirstStimulus

def expectedWaitEnd (id : UserTaskInstanceId)
    (terminal : FlowNodeOccurrenceTerminalKind) : UnnumberedFlowNodeOccurrenceEnd :=
  { anchor := .wait id, terminal }

def thirdFirstLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  canonicalFlowNodeOccurrenceDelta []
    [ expectedWaitEnd (taskId 1) .cancelled
    , expectedWaitEnd (taskId 2) .cancelled
    , expectedWaitEnd (taskId 3) .completed ]

def firstFirstLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  canonicalFlowNodeOccurrenceDelta []
    [ expectedWaitEnd (taskId 1) .completed
    , expectedWaitEnd (taskId 2) .cancelled
    , expectedWaitEnd (taskId 3) .cancelled ]

/-- The production shared evaluator reaches one terminal state for either accepted first winner, but
the exact command-led E1 trace and completed-versus-cancelled E2 child identities remain distinct. -/
def shared_first_policy_is_an_exact_command_and_occurrence_trace_non_law : Bool := decide <|
    sharedEnteredFirst?.isSome = true ∧
      thirdFirstTrace.result.outcome = .committed ∧
      firstFirstTrace.result.outcome = .committed ∧
      thirdFirstTrace.result.state = firstFirstTrace.result.state ∧
      thirdFirstTrace.committedTransitions.head? =
        some (.externalStimulus thirdFirstStimulus) ∧
      firstFirstTrace.committedTransitions.head? =
        some (.externalStimulus firstFirstStimulus) ∧
      thirdFirstTrace.committedTransitions ≠ firstFirstTrace.committedTransitions ∧
      thirdFirstTrace.flowNodeOccurrenceLifecycles.head? = some thirdFirstLifecycle ∧
      firstFirstTrace.flowNodeOccurrenceLifecycles.head? = some firstFirstLifecycle ∧
      thirdFirstTrace.flowNodeOccurrenceLifecycles ≠
        firstFirstTrace.flowNodeOccurrenceLifecycles

def escapeClassCollection : List String :=
  ["\"", "\\", "\u0008", "\u0001"]

def escapeClassResult : String :=
  "\"\\\u0008\u0001"

/-- Parallel entry uses the shared canonical JSON measure and counts quote, backslash, named-control,
and other-control expansion at the tightened seventeen-byte boundary. -/
def every_escape_class_is_counted_at_parallel_entry : Bool := decide <|
    (do
      let arm ← arm?
      enterParallelMultiInstance?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 17 } }
        (preEntryItemsWith escapeClassCollection "all")) = none

/-- Parallel natural completion counts the same four escape classes at its final publication
boundary. The obsolete raw candidate is thirty-four bytes and exact JSON is forty-two. -/
def every_escape_class_is_counted_at_the_final_parallel_candidate_boundary : Bool := decide <|
    (do
      let arm ← arm?
      let state ← afterFirstAll?
      completeParallelMultiInstance?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 34 } }
        state (taskId 2) (submittedResult escapeClassResult)) = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("parallel_multi_instance_same_task_declarer_is_rejected", parallel_multi_instance_same_task_declarer_is_rejected),
  ("exact_completion_pair_is_unique_and_substitution_fails_closed", exact_completion_pair_is_unique_and_substitution_fails_closed),
  ("third_slot_completion_preserves_index_and_derived_counts", third_slot_completion_preserves_index_and_derived_counts),
  ("atomicFreshEntryWitness", atomicFreshEntryWitness),
  ("entry_is_atomic_fresh_and_well_formed", entry_is_atomic_fresh_and_well_formed),
  ("index_two_first_never_moves_or_leaves_an_early_closed_region", index_two_first_never_moves_or_leaves_an_early_closed_region),
  ("all_policy_publishes_only_complete_input_index_order", all_policy_publishes_only_complete_input_index_order),
  ("timer_withdraws_every_child_and_publishes_nothing", timer_withdraws_every_child_and_publishes_nothing),
  ("stale_duplicate_and_wrong_owner_refuse", stale_duplicate_and_wrong_owner_refuse),
  ("first_policy_order_is_a_trace_non_law", first_policy_order_is_a_trace_non_law),
  ("shared_first_policy_is_an_exact_command_and_occurrence_trace_non_law", shared_first_policy_is_an_exact_command_and_occurrence_trace_non_law),
  ("every_escape_class_is_counted_at_parallel_entry", every_escape_class_is_counted_at_parallel_entry),
  ("every_escape_class_is_counted_at_the_final_parallel_candidate_boundary", every_escape_class_is_counted_at_the_final_parallel_candidate_boundary)
]

end BpmnSemantics.ParallelMultiInstanceConformance
