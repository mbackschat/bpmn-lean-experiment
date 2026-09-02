import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration

/-! Executable locks for the compensation trigger and handler Program wire contract. -/

namespace BpmnSemantics.CompensationTriggerHandlerProgramContractConformance

open BpmnSemantics.SemanticProcessJson
open BpmnSemantics.SemanticProcess
open BpmnSemantics

private def programAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeProgram with
  | .ok _ => true
  | .error _ => false

private def emptyCompensationProgram : String :=
  "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"kind\":\"triggerCompensation\",\"id\":\"trigger\",\"origin\":{\"kind\":\"bpmnElement\",\"elementId\":\"throw\"},\"definitionScopeId\":\"scope:p\",\"input\":\"in\",\"output\":\"out\"}],\"compensationExecution\":{\"definitionScopeId\":\"scope:p\",\"triggerOperationId\":\"trigger\",\"subjects\":[],\"dependencies\":[],\"limits\":{\"maxTriggers\":1,\"maxHandlers\":1,\"maxCanonicalBytes\":2}}}"

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

end BpmnSemantics.CompensationTriggerHandlerProgramContractConformance
