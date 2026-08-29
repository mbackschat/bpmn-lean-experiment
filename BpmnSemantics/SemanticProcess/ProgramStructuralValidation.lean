import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.ErrorDefinition
import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.TimerStart
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
import BpmnSemantics.SemanticProcess.CallActivityAdmission

/-! # Semantic Process program structural validation

This module owns definition, place, operation, initiation, and operation-specific admission for the Semantic Process IL. `GraphValidation` remains the owner of topology, reachability, scope-tree, and producer/consumer checks.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem strictlySortedStrings_head_lt (head : String) (tail : List String)
    (sorted : strictlySortedStrings (head :: tail) = true) :
    ∀ value ∈ tail, head < value := by
  induction tail generalizing head with
  | nil => simp
  | cons next rest ih =>
      simp only [strictlySortedStrings, Bool.and_eq_true, decide_eq_true_eq] at sorted
      intro value member
      rcases List.mem_cons.mp member with rfl | member
      · exact sorted.1
      · exact String.lt_trans sorted.1 (ih next sorted.2 value member)

/-- Strictly sorted semantic identifiers are duplicate-free. -/
theorem strictlySortedStrings_nodup (values : List String)
    (sorted : strictlySortedStrings values = true) : values.Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
      apply List.nodup_cons.mpr
      refine ⟨?_, ?_⟩
      · intro member
        have impossible := strictlySortedStrings_head_lt head tail sorted head member
        exact String.lt_asymm impossible impossible
      · cases tail with
        | nil => simp
        | cons next rest =>
            simp only [strictlySortedStrings, Bool.and_eq_true,
              decide_eq_true_eq] at sorted
            exact ih sorted.2

private def placeExists (places : List ControlPlace) (id : ControlPlaceId) : Bool :=
  places.any fun place => decide (place.id = id)

private def placeHasOrigin (places : List ControlPlace)
    (id : ControlPlaceId) (origin : BpmnSequenceFlowOrigin) : Bool :=
  places.any fun place =>
    decide (place.id = id && place.origin = origin)

private def sortedDistinctPlaceIds (ids : List ControlPlaceId) : Bool :=
  strictlySortedStrings (ids.map fun id => id.value)

/-- Runtime wait families whose element identities must resolve to one declaring operation. -/
inductive WaitDeclarationFamily where
  | userTask
  | message
  | timer
  | effect
  deriving Repr, DecidableEq

/-- A family-tagged BPMN element identity used by Program admission to preserve declarer
uniqueness across lowering. The family tag deliberately permits different wait kinds to reuse the
same BPMN identifier while preventing two operations from declaring the same runtime wait. -/
structure WaitDeclarationKey where
  family : WaitDeclarationFamily
  elementId : String
  deriving Repr, DecidableEq

def userTaskWaitDeclarationKey (taskId : TaskDefinitionId) : WaitDeclarationKey :=
  { family := .userTask, elementId := taskId.value }

def messageWaitDeclarationKey (elementId : NodeId) : WaitDeclarationKey :=
  { family := .message, elementId := elementId.value }

def timerWaitDeclarationKey (elementId : NodeId) : WaitDeclarationKey :=
  { family := .timer, elementId := elementId.value }

def effectWaitDeclarationKey (elementId : NodeId) : WaitDeclarationKey :=
  { family := .effect, elementId := elementId.value }

/-- Every runtime wait identity one operation may declare. Multi-surface operations contribute one
key per family because runtime well-formedness validates each wait family independently. -/
def operationWaitDeclarationKeys : SemanticOperation → List WaitDeclarationKey
  | .awaitUserTask _ _ _ _ task => [userTaskWaitDeclarationKey task.id]
  | .awaitDataInputUserTask _ _ _ _ taskId _ _ =>
      [userTaskWaitDeclarationKey taskId]
  | .awaitBoundedUserTask _ _ _ task boundaryTimer
  | .awaitMonitoredUserTask _ _ _ task boundaryTimer =>
      [userTaskWaitDeclarationKey task.id,
        timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ boundaryTimer _ =>
      [userTaskWaitDeclarationKey task.id,
        timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ boundaryTimer _ _ =>
      [userTaskWaitDeclarationKey taskId,
        timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitMessage _ _ _ _ message => [messageWaitDeclarationKey message.elementId]
  | .awaitTimer _ _ _ _ timer => [timerWaitDeclarationKey timer.elementId]
  | .enterBoundedScope _ _ _ _ _ boundaryTimer =>
      [timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitEventRace _ _ _ message timer =>
      [messageWaitDeclarationKey message.elementId,
        timerWaitDeclarationKey timer.elementId]
  | .awaitEffect _ origin _ _ _ _ => [effectWaitDeclarationKey origin.elementId]
  | .initiate ..
  | .initiateMessage ..
  | .initiateTimer ..
  | .enterScope ..
  | .invokeProcess ..
  | .returnProcess ..
  | .completeParallelMultiInstanceUserTask ..
  | .duplicate ..
  | .synchronize ..
  | .mergeExclusive ..
  | .choose ..
  | .selectMany ..
  | .synchronizeSelected ..
  | .throwError ..
  | .reachNoneEnd ..
  | .terminateScope ..
  | .completeScope .. => []

def operationDeclaresWaitKey (operation : SemanticOperation)
    (key : WaitDeclarationKey) : Bool :=
  (operationWaitDeclarationKeys operation).contains key

/-- Every wait identity declared by the Program resolves to exactly one operation. This preserves
the checked-source global node-identity invariant at the standalone Program admission boundary. -/
def programWaitDeclarersUnique (operations : List SemanticOperation) : Bool :=
  operations.all fun operation =>
    (operationWaitDeclarationKeys operation).all fun key =>
      decide ((operations.filter fun candidate => operationDeclaresWaitKey candidate key).length = 1)

private def wellFormedBpmnErrorRoute (places : List ControlPlace)
    (route : Option BpmnErrorRoute) : Bool :=
  match route with
  | none => true
  | some route =>
      nonempty route.code &&
        nonempty route.origin.boundaryEventId.value &&
        nonempty route.origin.errorDefinitionId.value &&
        nonempty route.origin.errorElementId.value &&
        nonempty route.origin.sequenceFlowId.value &&
        placeExists places route.output

private def operationWellFormed (program : Program) (places : List ControlPlace) :
    SemanticOperation → Bool
  | .initiate id origin output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists program.controlPlaces output
  | .initiateMessage id origin channel outputs =>
      messageInitiationOperationWellFormed places id origin channel outputs
  | .initiateTimer id origin durationMs outputs =>
      timerInitiationOperationWellFormed places id origin durationMs outputs
  | .enterScope id origin input childEntry childScopeId =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty childScopeId.value &&
        placeExists program.controlPlaces input &&
        placeExists program.controlPlaces childEntry
  | .enterBoundedScope id origin input childEntry childScopeId boundaryTimer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty childScopeId.value &&
        nonempty boundaryTimer.elementId.value &&
        nonempty boundaryTimer.origin.elementId.value &&
        boundaryTimer.durationMs = 1000 &&
        decide (
          origin.elementId.value ≠ boundaryTimer.elementId.value ∧
          childEntry ≠ boundaryTimer.output ∧
          input ≠ childEntry ∧ input ≠ boundaryTimer.output) &&
        -- Same token-carrying requirement as the task host: the deadline output must be exactly the
        -- boundary Sequence Flow's place, not some other place that merely exists.
        places.any (fun place =>
          decide (place.id = boundaryTimer.output ∧
            place.origin = boundaryTimer.origin)) &&
        placeExists program.controlPlaces input &&
        placeExists program.controlPlaces childEntry
  | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned =>
      invokeProcessOperationWellFormed program id origin input calledProcessId
        calledRoot calledEntry returned
  | .returnProcess id origin calledProcessId calledRoot callerOutput =>
      returnProcessOperationWellFormed program id origin calledProcessId calledRoot
        callerOutput
  | .awaitUserTask id origin input output task =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty task.id.value &&
        decide (origin.elementId.value = task.id.value) &&
        UserTaskMetadata.optionWellFormed task.metadata &&
        placeExists places input &&
        placeExists places output
  -- The direct-input identities are exact source identities the copy resolves by, so they must be
  -- present and mutually distinct: a shared identifier would let the association read the DataInput
  -- it is meant to fill.
  | .awaitDataInputUserTask id origin input output taskId taskName directInput =>
      let identities :=
        [taskId.value, directInput.associationId, directInput.sourcePropertyId,
          directInput.targetDataInputId]
      nonempty id.value &&
        nonempty origin.elementId.value &&
        identities.all nonempty &&
        identities.eraseDups.length = identities.length &&
        decide (origin.elementId.value = taskId.value) &&
        decide (taskName ≠ some "") &&
        decide (directInput.targetDataInputName ≠ some "") &&
        decide (input ≠ output) &&
        placeExists places input &&
        placeExists places output
  | .awaitSequentialMultiInstanceUserTask id origin input task data normalOutput
      boundaryTimer limits =>
      let identities :=
        [task.id.value, boundaryTimer.elementId.value,
          data.input.collectionItemDefinitionId, data.input.scalarItemDefinitionId,
          data.input.dataObjectId, data.input.dataObjectReferenceId,
          data.input.loopDataInputId, data.input.inputDataItemId,
          data.input.taskDataInputId, data.input.collectionAssociationId,
          data.input.itemAssociationId, data.output.dataObjectId,
          data.output.dataObjectReferenceId, data.output.taskDataOutputId,
          data.output.outputDataItemId, data.output.loopDataOutputId,
          data.output.itemAssociationId, data.output.collectionAssociationId]
      nonempty id.value &&
        nonempty origin.elementId.value &&
        identities.all nonempty &&
        identities.eraseDups.length = identities.length &&
        origin.elementId.value = task.id.value &&
        boundaryTimer.durationMs = 5000 &&
        limits =
          { maximumItems := 16, maximumItemUtf8Bytes := 512,
            maximumCanonicalCollectionUtf8Bytes := 8192 } &&
        decide (input ≠ normalOutput ∧ input ≠ boundaryTimer.output ∧
          normalOutput ≠ boundaryTimer.output) &&
        places.any (fun place => decide
          (place.id = boundaryTimer.output ∧ place.origin = boundaryTimer.origin)) &&
        placeExists places input && placeExists places normalOutput
  | operation@(.awaitParallelMultiInstanceUserTask ..)
  | operation@(.completeParallelMultiInstanceUserTask ..) =>
      parallelMultiInstanceOperationWellFormed places operation
  | .awaitTimer id origin input output timer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty timer.elementId.value &&
        decide (origin.elementId = timer.elementId) &&
        timer.durationMs = 1000 &&
        placeExists places input &&
        placeExists places output
  | .awaitMessage id origin input output message =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty message.elementId.value &&
        decide (origin.elementId = message.elementId) &&
        message.channel.identifiersNonempty &&
        decide (input ≠ output) &&
        placeExists places input &&
        placeExists places output
  | .awaitEventRace id origin input message timer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty message.configurationOrigin.elementId.value &&
        nonempty message.elementId.value &&
        (match message.channel with
          | .operationMessage .. => message.channel.identifiersNonempty
          | .directMessage .. => false) &&
        nonempty timer.configurationOrigin.elementId.value &&
        nonempty timer.elementId.value &&
        timer.durationMs = 1000 &&
        decide (
          message.configurationOrigin ≠ timer.configurationOrigin ∧
          message.elementId ≠ timer.elementId ∧
          message.output ≠ timer.output ∧
          input ≠ message.output ∧ input ≠ timer.output) &&
        !(places.any fun place =>
          decide (place.origin = message.configurationOrigin ∨
            place.origin = timer.configurationOrigin)) &&
        placeExists places input &&
        placeExists places message.output &&
        placeExists places timer.output
  | .awaitBoundedUserTask id origin input task boundaryTimer
  | .awaitMonitoredUserTask id origin input task boundaryTimer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty task.id.value &&
        nonempty boundaryTimer.elementId.value &&
        nonempty boundaryTimer.origin.elementId.value &&
        decide (origin.elementId.value = task.id.value) &&
        boundaryTimer.durationMs = 1000 &&
        decide (
          task.id.value ≠ boundaryTimer.elementId.value ∧
          task.output ≠ boundaryTimer.output ∧
          input ≠ task.output ∧ input ≠ boundaryTimer.output) &&
        -- The boundary Sequence Flow carries a token, unlike an Event-Based Gateway's configuration
        -- Flows, so this requires the opposite: the deadline output must be exactly that Flow's place.
        places.any (fun place =>
          decide (place.id = boundaryTimer.output ∧
            place.origin = boundaryTimer.origin)) &&
        placeExists places input &&
        placeExists places task.output
  | .awaitEffect id origin input output effect bpmnErrorRoute =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty effect.elementId.value &&
        decide (origin.elementId = effect.elementId) &&
        ((effect.descriptor.protocol =
              "urn:bpmn-lean:effect-protocol:activity-v1" &&
            effect.descriptor.operation =
              "urn:bpmn-lean:effect-operation:probe-v1" &&
            effect.inputMappings.isEmpty &&
            effect.outputMappings.isEmpty &&
            bpmnErrorRoute.isNone) ||
          (effect.descriptor.protocol =
              "urn:bpmn-lean:effect-protocol:activity-v1" &&
            effect.descriptor.operation =
              "urn:bpmn-lean:effect-operation:mapped-success-v1" &&
            singleStringLiteralMapping effect.inputMappings &&
            singleLocalVariableMapping effect.outputMappings &&
            bpmnErrorRoute.isNone) ||
          (effect.descriptor.protocol =
              "urn:bpmn-lean:effect-protocol:activity-v1" &&
            effect.descriptor.operation =
              "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1" &&
            singleStringLiteralMapping effect.inputMappings &&
            singleLocalVariableMapping effect.outputMappings &&
            !bpmnErrorRoute.isNone)) &&
        placeExists places input &&
        placeExists places output &&
        wellFormedBpmnErrorRoute places bpmnErrorRoute
  | .duplicate id origin input outputs =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input &&
        outputs.length ≥ 2 &&
        sortedDistinctPlaceIds outputs &&
        outputs.all (placeExists places)
  | .synchronize id origin inputs output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        inputs.length ≥ 2 &&
        sortedDistinctPlaceIds inputs &&
        inputs.all (placeExists places) &&
        placeExists places output
  | .mergeExclusive id origin inputs output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        !inputs.isEmpty &&
        sortedDistinctPlaceIds inputs &&
        !inputs.contains output &&
        inputs.all (placeExists places) &&
        placeExists places output
  | .choose id origin input candidates defaultOutput defaultOrigin =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input &&
        candidates.length = 2 &&
        (candidates.map (·.output)).eraseDups.length = 2 &&
        !((candidates.map (·.output)).contains defaultOutput) &&
        candidates.all fun candidate =>
          simpleBooleanExpressionValid candidate.condition &&
            placeHasOrigin places candidate.output candidate.origin &&
        placeHasOrigin places defaultOutput defaultOrigin
  | .selectMany id origin input candidates defaultBranch selectionKey =>
      let outputs := candidates.map (·.output) ++ [defaultBranch.output]
      let expected :=
        candidates.map (·.expectedJoinInput) ++ [defaultBranch.expectedJoinInput]
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty selectionKey &&
        placeExists places input &&
        candidates.length = 2 &&
        outputs.eraseDups.length = 3 &&
        expected.eraseDups.length = 3 &&
        strictlySortedStrings
          (candidates.map fun candidate => candidate.origin.elementId.value) &&
        candidates.all fun candidate =>
          simpleBooleanExpressionValid candidate.condition &&
            placeHasOrigin places candidate.output candidate.origin &&
            placeExists places candidate.expectedJoinInput &&
        placeHasOrigin places defaultBranch.output defaultBranch.origin &&
        placeExists places defaultBranch.expectedJoinInput
  | .synchronizeSelected id origin inputs output selectionKey =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty selectionKey &&
        inputs.length = 3 &&
        sortedDistinctPlaceIds inputs &&
        inputs.all (placeExists places) &&
        placeExists places output
  | .throwError id origin input error handler =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        errorReferenceValid error &&
        nonempty handler.attachedScopeId.value &&
        nonempty handler.code &&
        nonempty handler.origin.boundaryEventId.value &&
        nonempty handler.origin.errorDefinitionId.value &&
        nonempty handler.origin.errorElementId.value &&
        nonempty handler.origin.sequenceFlowId.value &&
        handler.code = error.code &&
        handler.origin.errorElementId = error.errorElementId &&
        decide (handler.origin.errorDefinitionId ≠ error.errorDefinitionId) &&
        placeExists places input &&
        placeHasOrigin places handler.output
          { elementId := handler.origin.sequenceFlowId }
  | .reachNoneEnd id origin input =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input
  | .terminateScope id origin input scopeId =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty scopeId.value &&
        placeExists places input
  | .completeScope id origin scopeId parentOutput =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty scopeId.value &&
        parentOutput.all (placeExists places)

private def isInitiate : SemanticOperation → Bool
  | .initiate .. => true
  | .initiateMessage .. => true
  | .initiateTimer .. => true
  | _ => false

private def inclusiveOperationsPaired (operations : List SemanticOperation) : Bool :=
  let selections := operations.filterMap fun
    | .selectMany _ _ _ candidates defaultBranch selectionKey =>
        some (selectionKey,
          canonicalControlPlaceOrder
            (candidates.map (·.expectedJoinInput) ++
              [defaultBranch.expectedJoinInput]))
    | _ => none
  let joins := operations.filterMap fun
    | .synchronizeSelected _ _ inputs _ selectionKey =>
        some (selectionKey, inputs)
    | _ => none
  if selections.isEmpty && joins.isEmpty then true
  else
    selections.length = joins.length &&
      selections.all fun selection =>
        (joins.filter fun join => decide (join.1 = selection.1 &&
          join.2 = selection.2)).length = 1 &&
      joins.all fun join =>
        (selections.filter fun selection => decide (selection.1 = join.1 &&
          selection.2 = join.2)).length = 1

/-- Structural validation for a decoded Semantic Process program, independent of checked-source equality. -/
def programWellFormed (program : Program) : Bool :=
  nonempty program.identity.semanticProfile.value &&
    nonempty program.identity.sourceId.value &&
    sourceOverlayIdentityValid program.identity.sourceOverlay &&
    lowercaseHexSha256 program.identity.sourceSha256 &&
    nonempty program.processId.value &&
    !program.definitionScopes.isEmpty &&
    strictlySortedStrings (program.definitionScopes.map fun scope => scope.id.value) &&
    program.definitionScopes.all (fun scope =>
      nonempty scope.id.value && nonempty scope.originElementId.value) &&
    !program.controlPlaces.isEmpty &&
    !program.operations.isEmpty &&
    strictlySortedStrings (program.controlPlaces.map fun place => place.id.value) &&
    strictlySortedStrings (program.operations.map fun operation => operation.id.value) &&
    program.controlPlaces.all (fun place =>
      nonempty place.id.value && nonempty place.origin.elementId.value) &&
    program.operations.all (operationWellFormed program program.controlPlaces) &&
    inclusiveOperationsPaired program.operations &&
    callOperationsPaired program &&
    (program.operations.filter isInitiate).length = 1 &&
    programGraphWellFormed program &&
    programWaitDeclarersUnique program.operations

/-- Structural admission keeps control-place identifiers in canonical duplicate-free order. -/
theorem programWellFormed_controlPlaceIdsSorted (program : Program)
    (valid : programWellFormed program = true) :
    strictlySortedStrings (program.controlPlaces.map fun place => place.id.value) = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Structural admission keeps operation identifiers in canonical duplicate-free order. -/
theorem programWellFormed_operationIdsSorted (program : Program)
    (valid : programWellFormed program = true) :
    strictlySortedStrings (program.operations.map fun operation => operation.id.value) = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Structural admission validates every operation against the complete Program context. -/
theorem programWellFormed_operations (program : Program)
    (valid : programWellFormed program = true) :
    program.operations.all (operationWellFormed program program.controlPlaces) = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Structural admission includes the complete graph invariant. -/
theorem programWellFormed_graph (program : Program) (valid : programWellFormed program = true) :
    programGraphWellFormed program = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Structural admission resolves every declared wait key to its one declaring operation. -/
theorem programWellFormed_waitDeclarer (program : Program) (operation : SemanticOperation)
    (key : WaitDeclarationKey) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations)
    (declares : operationDeclaresWaitKey operation key = true) :
    program.operations.filter (fun candidate => operationDeclaresWaitKey candidate key) =
      [operation] := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  have unique := List.all_eq_true.mp (by grind : programWaitDeclarersUnique program.operations = true)
    operation member
  simp only [List.all_eq_true] at unique
  have keyMember : key ∈ operationWaitDeclarationKeys operation := by
    simpa [operationDeclaresWaitKey] using declares
  have lengthOne := unique key keyMember
  simp only [decide_eq_true_eq] at lengthOne
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp lengthOne
  have operationFiltered : operation ∈
      program.operations.filter (fun candidate => operationDeclaresWaitKey candidate key) :=
    List.mem_filter.mpr ⟨member, declares⟩
  rw [singleton] at operationFiltered
  have operationEq : operation = sole := by simpa using operationFiltered
  simpa [operationEq] using singleton

/-- Two distinct operations cannot declare the same family-tagged runtime wait in an admitted
Program. This is the class-level rejection theorem for ordinary, bounded, Sequential MI, Parallel
MI, Event Race, and Effect declarer collisions. -/
theorem programWellFormed_rejects_waitDeclarerCollision (program : Program)
    (left right : SemanticOperation) (key : WaitDeclarationKey)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (different : left ≠ right) (leftDeclares : operationDeclaresWaitKey left key = true)
    (rightDeclares : operationDeclaresWaitKey right key = true) :
    programWellFormed program = false := by
  apply Bool.eq_false_iff.mpr
  intro valid
  have leftOnly := programWellFormed_waitDeclarer program left key valid leftMember leftDeclares
  have rightOnly := programWellFormed_waitDeclarer program right key valid rightMember rightDeclares
  rw [leftOnly] at rightOnly
  exact different (by simpa using rightOnly)

/-- Every structurally admitted Program has an acyclic, parent-complete definition-scope forest. -/
theorem programWellFormed_scopeForest (program : Program)
    (valid : programWellFormed program = true) :
    scopeForestWellFormed program = true := by
  exact programGraphWellFormed_scopeForest program (programWellFormed_graph program valid)

private theorem operationWellFormed_of_programWellFormed (program : Program)
    (operation : SemanticOperation) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations) :
    operationWellFormed program program.controlPlaces operation = true := by
  exact List.all_eq_true.mp (programWellFormed_operations program valid) operation member

/-- Every admitted Effect operation uses one BPMN element identity for its origin and definition. -/
theorem programWellFormed_awaitEffect_elements_align (program : Program)
    (valid : programWellFormed program = true)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (member : .awaitEffect id origin input output effect route ∈ program.operations) :
    origin.elementId = effect.elementId := by
  have operationValid := operationWellFormed_of_programWellFormed program _ valid member
  simp only [operationWellFormed, Bool.and_eq_true, decide_eq_true_eq] at operationValid
  exact operationValid.1.1.1.1.2

/-- Every admitted ordinary internal wait operation names a nonempty waited element. -/
theorem programWellFormed_internalArm_element_nonempty (program : Program)
    (operation : SemanticOperation) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations) :
    (match operation with
    | .awaitUserTask _ _ _ _ task => !task.id.value.isEmpty
    | .awaitDataInputUserTask _ _ _ _ taskId _ _ => !taskId.value.isEmpty
    | .awaitMessage _ _ _ _ message => !message.elementId.value.isEmpty
    | .awaitTimer _ _ _ _ timer => !timer.elementId.value.isEmpty
    | .awaitEffect _ _ _ _ effect _ => !effect.elementId.value.isEmpty
    | _ => true) = true := by
  cases operation <;> try rfl
  all_goals
    have operationValid := operationWellFormed_of_programWellFormed program _ valid member
    simp_all [operationWellFormed, nonempty]

end BpmnSemantics.SemanticProcess
