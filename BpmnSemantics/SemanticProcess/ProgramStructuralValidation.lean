module

import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.ErrorDefinition
public import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.TimerStart
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
public import BpmnSemantics.SemanticProcess.CallActivityAdmission
import BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
public import BpmnSemantics.SemanticProcess.SequentialScopeProgramAdmission
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeCheckedAdmission

/-! # Semantic Process program structural validation

This module owns definition, place, operation, initiation, and operation-specific admission for the Semantic Process IL. `GraphValidation` remains the owner of topology, reachability, scope-tree, and producer/consumer checks. Bodies are hidden so a body edit rebuilds only `import all` importers; a definition importers reduce definitionally is `@[expose]` with what its body calls ([migration step 4](../../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#migration-order)).
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def placeExists (places : List ControlPlace) (id : ControlPlaceId) : Bool :=
  places.any fun place => decide (place.id = id)

def placeHasOrigin (places : List ControlPlace)
    (id : ControlPlaceId) (origin : BpmnSequenceFlowOrigin) : Bool :=
  places.any fun place =>
    decide (place.id = id && place.origin = origin)

def sortedDistinctPlaceIds (ids : List ControlPlaceId) : Bool :=
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
  | .awaitDataInputUserTask _ _ _ _ taskId _ _
  | .awaitDataInputOutputUserTask _ _ _ _ taskId _ _ _
  | .awaitDataOutputUserTask _ _ _ _ taskId _ _ =>
      [userTaskWaitDeclarationKey taskId]
  | .awaitBoundedUserTask _ _ _ task boundaryTimer
  | .awaitMonitoredUserTask _ _ _ task boundaryTimer =>
      [userTaskWaitDeclarationKey task.id,
        timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitMessageBoundedUserTask _ _ _ task boundaryMessage
  | .awaitMessageMonitoredUserTask _ _ _ task boundaryMessage =>
      [userTaskWaitDeclarationKey task.id,
        messageWaitDeclarationKey boundaryMessage.elementId]
  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ boundaryTimer _ =>
      [userTaskWaitDeclarationKey task.id,
        timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ boundaryTimer _ _ =>
      [userTaskWaitDeclarationKey taskId,
        timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitMessage _ _ _ _ message => [messageWaitDeclarationKey message.elementId]
  | .awaitPayloadMessage _ _ _ _ message _ =>
      [messageWaitDeclarationKey message.elementId]
  | .awaitCorrelatedPayloadMessage _ _ _ _ message _ _ _ _ =>
      [messageWaitDeclarationKey message.elementId]
  | .awaitTimer _ _ _ _ timer => [timerWaitDeclarationKey timer.elementId]
  | .enterBoundedScope _ _ _ _ _ boundaryTimer
  | .enterMonitoredScope _ _ _ _ _ boundaryTimer =>
      [timerWaitDeclarationKey boundaryTimer.elementId]
  | .awaitEventRace _ _ _ message timer =>
      [messageWaitDeclarationKey message.elementId,
        timerWaitDeclarationKey timer.elementId]
  | .awaitEffect _ origin _ _ _ _ => [effectWaitDeclarationKey origin.elementId]
  | .enterSequentialMultiInstanceScope ..
  | .enterParallelMultiInstanceScope ..
  | .completeSequentialMultiInstanceScope ..
  | .completeParallelMultiInstanceScope ..
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
  | .completeScope ..
  | .completeEventSubProcess ..
  | .triggerCompensation .. | .cancelTransaction .. => []

def operationDeclaresWaitKey (operation : SemanticOperation)
    (key : WaitDeclarationKey) : Bool :=
  (operationWaitDeclarationKeys operation).contains key

/-- Every wait identity declared by the Program resolves to exactly one operation. This preserves
the checked-source global node-identity invariant at the standalone Program admission boundary. -/
def programWaitDeclarersUnique (operations : List SemanticOperation) : Bool :=
  operations.all fun operation =>
    (operationWaitDeclarationKeys operation).all fun key =>
      decide ((operations.filter fun candidate => operationDeclaresWaitKey candidate key).length = 1)

def wellFormedBpmnErrorRoute (places : List ControlPlace)
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

def operationWellFormed (program : Program) (places : List ControlPlace) :
    SemanticOperation → Bool
  | operation@(.enterParallelMultiInstanceScope ..) | operation@(.completeParallelMultiInstanceScope ..) =>
      parallelScopeOperationWellFormed program operation
  | operation@(.enterSequentialMultiInstanceScope ..) | operation@(.completeSequentialMultiInstanceScope ..) =>
      SequentialScopeProgram.operationWellFormed program operation
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
  | .enterBoundedScope id origin input childEntry childScopeId boundaryTimer
  | .enterMonitoredScope id origin input childEntry childScopeId boundaryTimer =>
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
  | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned data =>
      callDataInterfaceValid data origin.elementId.value calledProcessId.value &&
      invokeProcessOperationWellFormed program id origin input calledProcessId
        calledRoot calledEntry returned
  | .returnProcess id origin calledProcessId calledRoot callerOutput data =>
      callDataInterfaceValid data origin.elementId.value calledProcessId.value &&
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
        [taskId.value, directInput.associationId, directInput.source.id,
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
  | .awaitDataInputOutputUserTask id origin input output taskId taskName directInput
      directOutput =>
      let identities :=
        [taskId.value, directInput.associationId, directInput.source.id,
          directInput.targetDataInputId, directOutput.associationId,
          directOutput.sourceDataOutputId, directOutput.target.id]
      nonempty id.value &&
        nonempty origin.elementId.value &&
        identities.all nonempty &&
        identities.eraseDups.length = identities.length &&
        decide (origin.elementId.value = taskId.value) &&
        decide (taskName ≠ some "") &&
        decide (directInput.targetDataInputName ≠ some "") &&
        decide (directOutput.sourceDataOutputName ≠ some "") &&
        decide (input ≠ output) &&
        placeExists places input &&
        placeExists places output
  -- The direct-output identities are exact source identities the completion resolves by. Distinct
  -- DataOutput and Property ids are the load-bearing pair: equal ids would make a routed write and a
  -- name-merged write indistinguishable.
  | .awaitDataOutputUserTask id origin input output taskId taskName directOutput =>
      let identities :=
        [taskId.value, directOutput.associationId, directOutput.sourceDataOutputId,
          directOutput.target.id]
      nonempty id.value &&
        nonempty origin.elementId.value &&
        identities.all nonempty &&
        identities.eraseDups.length = identities.length &&
        decide (origin.elementId.value = taskId.value) &&
        decide (taskName ≠ some "") &&
        decide (directOutput.sourceDataOutputName ≠ some "") &&
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
  | .awaitPayloadMessage id origin input output message directOutput =>
      match message.channel with
      | .operationMessage interfaceId operationId messageId =>
          let identities :=
            [ origin.elementId.value, interfaceId.value, operationId.value, messageId.value
            , directOutput.associationId, directOutput.sourceDataOutputId
            , directOutput.targetPropertyId ]
          nonempty id.value && identities.all nonempty &&
            identities.eraseDups.length = identities.length &&
            origin.elementId = message.elementId &&
            decide (directOutput.sourceDataOutputName ≠ some "") &&
            decide (input ≠ output) &&
            placeExists places input && placeExists places output
      | .directMessage .. => false
  | .awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
      correlationPropertyId payloadSelector processPropertySelector =>
      match message.channel with
      | .operationMessage interfaceId operationId messageId =>
          let identities :=
            [ origin.elementId.value, interfaceId.value, operationId.value, messageId.value,
              correlationKeyId, correlationPropertyId, processPropertySelector.propertyId ]
          nonempty id.value && identities.all nonempty &&
            identities.eraseDups.length = identities.length &&
            origin.elementId = message.elementId &&
            correlationMessagePathValid payloadSelector &&
            correlationProcessPropertyPathValid processPropertySelector &&
            decide (input ≠ output) &&
            placeExists places input && placeExists places output
      | .directMessage .. => false
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
  | .awaitMessageBoundedUserTask id origin input task boundaryMessage
  | .awaitMessageMonitoredUserTask id origin input task boundaryMessage =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty task.id.value &&
        nonempty boundaryMessage.elementId.value &&
        nonempty boundaryMessage.origin.elementId.value &&
        decide (origin.elementId.value = task.id.value) &&
        (match boundaryMessage.channel with
        | .operationMessage .. => boundaryMessage.channel.identifiersNonempty
        | .directMessage .. => false) &&
        decide (
          task.id.value ≠ boundaryMessage.elementId.value ∧
          task.output ≠ boundaryMessage.output ∧
          input ≠ task.output ∧ input ≠ boundaryMessage.output) &&
        places.any (fun place =>
          decide (place.id = boundaryMessage.output ∧
            place.origin = boundaryMessage.origin)) &&
        placeExists places input && placeExists places task.output
  | .awaitEffect id origin input output effect bpmnErrorRoute =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty effect.elementId.value &&
        decide (origin.elementId = effect.elementId) &&
        (((program.identity.semanticProfile == serialBusinessTaskProfileId || program.identity.semanticProfile == portableEffectDataProfileId || program.identity.semanticProfile == nestedScopeDataProfileId || program.identity.semanticProfile == mixedTaskControlFlowProfileId ||
            sequentialScopeProgramSelected program || program.identity.semanticProfile.value == "cibseven-2.2.0-parallel-multi-instance-subprocess-draft") &&
          SerialBusinessTask.descriptorValid effect.descriptor && bpmnErrorRoute.isNone) ||
        (program.identity.semanticProfile == mixedTaskBusinessErrorProfileId &&
          SerialBusinessTask.descriptorValid effect.descriptor) ||
        (effect.descriptor.protocol =
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
        (if program.identity.semanticProfile == mixedTaskControlFlowProfileId || program.identity.semanticProfile == mixedTaskBusinessErrorProfileId then !candidates.isEmpty else candidates.length = 2) &&
        (candidates.map (·.output)).eraseDups.length = candidates.length &&
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
  | .completeEventSubProcess id origin scopeId =>
      completeEventSubProcessOperationWellFormed program id origin scopeId
  | .triggerCompensation id origin definitionScopeId input output =>
      nonempty id.value && nonempty origin.elementId.value &&
        nonempty definitionScopeId.value && input != output &&
        placeExists places input && placeExists places output
  | .cancelTransaction id origin definitionScopeId input output boundaryEventElementId =>
      nonempty id.value && nonempty origin.elementId.value &&
        nonempty definitionScopeId.value && input != output &&
        nonempty boundaryEventElementId.value && boundaryEventElementId != origin.elementId &&
        placeExists places input && placeExists places output

def isInitiate : SemanticOperation → Bool
  | .initiate .. => true
  | .initiateMessage .. => true
  | .initiateTimer .. => true
  | _ => false

def inclusiveOperationsPaired (operations : List SemanticOperation) : Bool :=
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
      (selections.all fun selection =>
        -- IGW-TRACK-01 binds by split identity; payload equality cannot distinguish shared keys.
        (joins.filter fun join => decide (join.1 = selection.1)) = [selection]) &&
      joins.all fun join =>
        (selections.filter fun selection => decide (selection.1 = join.1)).length = 1

def operationRecurrenceValid (profile : ProfileId) : SemanticOperation → Bool
  | .awaitMonitoredUserTask _ _ _ _ arm | .enterMonitoredScope _ _ _ _ _ arm =>
      arm.recurrence.isNone || profile == repeatableSubscriptionCheckpointProfileId
  | .awaitBoundedUserTask _ _ _ _ arm | .enterBoundedScope _ _ _ _ _ arm => arm.recurrence.isNone
  | _ => true

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
    program.operations.all (operationRecurrenceValid program.identity.semanticProfile) &&
    inclusiveOperationsPaired program.operations &&
    callOperationsPaired program &&
    (program.identity.semanticProfile != callDataCheckpointProfileId || callDataProgramGraph program) &&
    (program.operations.filter isInitiate).length = 1 &&
    programGraphWellFormedForProgram program &&
    programWaitDeclarersUnique program.operations &&
    compensationActivityRetentionDeclarationValid program &&
    compensationExecutionDeclarationValid program

/-- Structural admission includes the complete graph invariant. -/
theorem programWellFormed_graph (program : Program) (valid : programWellFormed program = true) :
    programGraphWellFormedForProgram program = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Every structurally admitted Program has an acyclic, parent-complete definition-scope forest. -/
theorem programWellFormed_scopeForest (program : Program)
    (valid : programWellFormed program = true) :
    scopeForestWellFormed program = true := by
  exact programGraphWellFormed_scopeForest program (programWellFormed_graph program valid)

end BpmnSemantics.SemanticProcess
