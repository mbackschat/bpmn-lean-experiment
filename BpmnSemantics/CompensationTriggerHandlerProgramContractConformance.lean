import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! Executable locks for the compensation trigger and handler Program wire contract. -/

set_option Elab.async false

namespace BpmnSemantics.CompensationTriggerHandlerProgramContractConformance

open BpmnSemantics.SemanticProcessJson
open BpmnSemantics.SemanticProcess
open BpmnSemantics

private def programAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeProgram with
  | .ok _ => true
  | .error _ => false

private def emptyCompensationProgram : String :=
  "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"kind\":\"triggerCompensation\",\"id\":\"trigger\",\"origin\":{\"kind\":\"bpmnElement\",\"elementId\":\"throw\"},\"definitionScopeId\":\"scope:p\",\"input\":\"in\",\"output\":\"out\"}],\"compensationExecution\":{\"definitionScopeId\":\"scope:p\",\"triggerOperationId\":\"trigger\",\"subjects\":[],\"dependencies\":[],\"limits\":{\"maxTriggers\":1,\"maxHandlers\":1,\"maxCanonicalBytes\":7}}}"

private def compensationDescriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }

private def boundaryBody (handler : String) : SingleEffectCompensationHandlerBody :=
  { handlerElementId := ⟨handler⟩, effectElementId := ⟨handler⟩
    descriptor := compensationDescriptor, input := .empty }

private def restoredBody : SingleEffectCompensationHandlerBody :=
  { handlerElementId := ⟨"HB"⟩, effectElementId := ⟨"EB"⟩
    descriptor := compensationDescriptor
    input := .restoredProcessBinding "frozen" "argument" }

private def subjectA : CompensationSubjectDefinition :=
  .boundaryActivity ⟨"A"⟩ (boundaryBody "HA")

private def subjectB : CompensationSubjectDefinition :=
  .eventSubProcess ⟨"scope:B"⟩ ⟨"scope:HB"⟩ restoredBody

private def subjectC : CompensationSubjectDefinition :=
  .boundaryActivity ⟨"C"⟩ (boundaryBody "HC")

private def subjects : List CompensationSubjectDefinition := [subjectA, subjectB, subjectC]

private def declaration : CompensationExecutionDeclaration :=
  { definitionScopeId := ⟨"scope:p"⟩
    triggerOperationId := ⟨"trigger"⟩
    subjects
    dependencies := [{ predecessorElementId := ⟨"A"⟩, successorElementId := ⟨"B"⟩ }]
    limits := { maxTriggers := 1, maxHandlers := 3, maxCanonicalBytes := 4096 } }

private def programWith (candidate : CompensationExecutionDeclaration) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess, semanticProfile := ⟨"p"⟩
        sourceId := ⟨"s"⟩, sourceSha256 := "x" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"p"⟩
    definitionScopes :=
      [{ id := ⟨"scope:p"⟩, parentScopeId := none, originElementId := ⟨"p"⟩ },
       { id := ⟨"scope:B"⟩, parentScopeId := some ⟨"scope:p"⟩, originElementId := ⟨"B"⟩ },
       { id := ⟨"scope:HB"⟩, parentScopeId := some ⟨"scope:B"⟩, originElementId := ⟨"HB"⟩ }]
    operationScopes := [{ operationId := ⟨"trigger"⟩, scopeId := ⟨"scope:p"⟩ }]
    controlPlaceScopes := []
    controlPlaces := []
    operations := [.triggerCompensation ⟨"trigger"⟩ ⟨⟨"throw"⟩⟩
      ⟨"scope:p"⟩ ⟨"in"⟩ ⟨"out"⟩]
    compensationActivityRetention := some
      { definitionScopeId := ⟨"scope:p"⟩
        targets :=
          [{ activityElementId := ⟨"A"⟩, boundaryEventElementId := ⟨"BA"⟩,
             compensationActivityElementId := ⟨"HA"⟩ },
           { activityElementId := ⟨"C"⟩, boundaryEventElementId := ⟨"BC"⟩,
             compensationActivityElementId := ⟨"HC"⟩ }]
        maxRecords := 2, maxCanonicalBytes := 4096 }
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId := ⟨"scope:B"⟩, handlerScopeId := ⟨"scope:HB"⟩ }]
        maxRecords := 1, maxCanonicalBytes := 4096 }
    compensationExecution := some candidate }

private def validProgram := programWith declaration

private def reorderedProgram :=
  programWith { declaration with subjects := [subjectB, subjectA, subjectC] }

private def cyclicProgram :=
  programWith { declaration with dependencies :=
    [{ predecessorElementId := ⟨"A"⟩, successorElementId := ⟨"B"⟩ },
     { predecessorElementId := ⟨"B"⟩, successorElementId := ⟨"A"⟩ }] }

private def emptyRestorationProgram :=
  programWith { declaration with subjects :=
    [subjectA,
     .eventSubProcess ⟨"scope:B"⟩ ⟨"scope:HB"⟩
       { restoredBody with input := .empty },
     subjectC] }

theorem strict_program_decoder_and_declaration_admission_separate_identity_order_dependency_and_restoration :
    programAccepted emptyCompensationProgram = true ∧
    compensationExecutionDeclarationValid validProgram = true ∧
    compensationExecutionDeclarationValid reorderedProgram = false ∧
    compensationExecutionDeclarationValid cyclicProgram = false ∧
    compensationExecutionDeclarationValid emptyRestorationProgram = false := by
  native_decide

private def emptyDeclaration (bytes : Nat) : CompensationExecutionDeclaration :=
  { declaration with
    subjects := []
    dependencies := []
    limits := { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := bytes } }

private def emptyProgram (bytes : Nat) : Program :=
  { programWith (emptyDeclaration bytes) with
    identity := { validProgram.identity with
      semanticProfile := compensationSourceCheckpointProfileId
      sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    definitionScopes :=
      [{ id := ⟨"scope:p"⟩, parentScopeId := none, originElementId := ⟨"p"⟩ }]
    operationScopes := ["complete", "end", "start", "trigger"].map fun id =>
      { operationId := ⟨id⟩, scopeId := ⟨"scope:p"⟩ }
    controlPlaceScopes := ["in", "out"].map fun id =>
      { controlPlaceId := ⟨id⟩, scopeId := ⟨"scope:p"⟩ }
    controlPlaces := ["in", "out"].map fun id =>
      { id := ⟨id⟩, origin := ⟨⟨id⟩⟩ }
    operations :=
      [.completeScope ⟨"complete"⟩ ⟨⟨"p"⟩⟩ ⟨"scope:p"⟩ none,
       .reachNoneEnd ⟨"end"⟩ ⟨⟨"end"⟩⟩ ⟨"out"⟩,
       .initiate ⟨"start"⟩ ⟨⟨"start"⟩⟩ ⟨"in"⟩,
       .triggerCompensation ⟨"trigger"⟩ ⟨⟨"throw"⟩⟩ ⟨"scope:p"⟩ ⟨"in"⟩ ⟨"out"⟩]
    compensationActivityRetention := none
    compensationEventSubProcessSnapshots := none }

private def executionJson (bytes : Nat) : Lean.Json :=
  Lean.Json.mkObj [("compensationExecution", Lean.Json.mkObj
    [("definitionScopeId", .str "scope:p"), ("triggerOperationId", .str "trigger"),
     ("subjects", .arr #[]), ("dependencies", .arr #[]),
     ("limits", Lean.Json.mkObj [("maxTriggers", Lean.toJson (1 : Nat)),
       ("maxHandlers", Lean.toJson (1 : Nat)), ("maxCanonicalBytes", Lean.toJson bytes)])])]

private def executionJsonAccepted (bytes : Nat) : Bool :=
  (decodeCompensationExecutionField (executionJson bytes)).isOk

theorem execution_readers_reject_below_empty_pair_capacity :
    compensationExecutionDeclarationValid (emptyProgram 2) = false ∧
    compensationExecutionDeclarationValid (emptyProgram 6) = false ∧
    executionJsonAccepted 2 = false ∧ executionJsonAccepted 6 = false := by
  decide +kernel

theorem minimum_execution_capacity_admits_a_structurally_valid_empty_state :
    programWellFormed (emptyProgram 7) = true ∧
    compensationExecutionStateValid (emptyProgram 7) initialState = true ∧
    executionJsonAccepted 7 = true ∧
    compensationExecutionDeclarationValid (emptyProgram 65536) = true ∧
    executionJsonAccepted 65536 = true := by
  decide +kernel

theorem execution_readers_keep_integer_and_upper_bounds :
    ([0, 65537, 9007199254740992].all fun bytes =>
      !compensationExecutionDeclarationValid (emptyProgram bytes) &&
        !executionJsonAccepted bytes) = true := by
  decide +kernel

theorem canonical_empty_execution_pair_has_seven_bytes :
    canonicalCompensationExecutionStateUtf8Bytes [] [] = 7 := by
  rfl

theorem admitted_execution_declaration_can_represent_empty_collections (program : Program)
    (candidate : CompensationExecutionDeclaration)
    (present : program.compensationExecution = some candidate)
    (valid : compensationExecutionDeclarationValid program = true) :
    canonicalCompensationExecutionStateUtf8Bytes [] [] ≤ candidate.limits.maxCanonicalBytes := by
  exact compensationExecutionDeclarationValid_minimumBytes program candidate present valid

private def retentionAtTwoBytes : Program :=
  { emptyProgram 7 with
    compensationActivityRetention := some
      { definitionScopeId := ⟨"scope:p"⟩
        targets := [{ activityElementId := ⟨"A"⟩,
                      boundaryEventElementId := ⟨"BA"⟩,
                      compensationActivityElementId := ⟨"HA"⟩ }]
        maxRecords := 1, maxCanonicalBytes := 2 }
    operations :=
      [.awaitUserTask ⟨"A"⟩ ⟨⟨"A"⟩⟩ ⟨"in"⟩ ⟨"out"⟩ { id := ⟨"A"⟩, name := none }]
    operationScopes := [{ operationId := ⟨"A"⟩, scopeId := ⟨"scope:p"⟩ }] }

private def snapshotAtTwoBytes : Program :=
  { emptyProgram 7 with
    definitionScopes :=
      [{ id := ⟨"scope:p"⟩, parentScopeId := none, originElementId := ⟨"p"⟩ },
       { id := ⟨"scope:H"⟩, parentScopeId := some ⟨"scope:p"⟩, originElementId := ⟨"H"⟩ }]
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId := ⟨"scope:p"⟩, handlerScopeId := ⟨"scope:H"⟩ }]
        maxRecords := 1, maxCanonicalBytes := 2 } }

theorem separate_retention_and_snapshot_declarations_keep_two_byte_minima :
    compensationActivityRetentionDeclarationValid retentionAtTwoBytes = true ∧
    compensationEventSubProcessSnapshotDeclarationValid snapshotAtTwoBytes = true ∧
    canonicalCompensationRecordsUtf8Bytes [] = 2 ∧
    canonicalCompensationParentContextRetentionsUtf8Bytes [] = 2 := by
  decide +kernel

end BpmnSemantics.CompensationTriggerHandlerProgramContractConformance
