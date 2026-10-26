module

public import BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
public import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
public import BpmnSemantics.SemanticProcess.CallDataCommandAdmission
public import BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition
public import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
public import BpmnSemantics.SemanticProcess.ValueDomain
public import BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
public import BpmnSemantics.SemanticProcess.CompensationStartDataAdmission
public import BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
public import BpmnSemantics.SemanticProcess.NestedScopeDataAdmission
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission

/-! Declaration-bound Start binding policy shared by raw command dispatch and private capacity admission. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.CommandStartBindings

def sequentialMultiInstanceProgramAdmitted (program : Program) : Bool :=
  program.identity.semanticProfile = sequentialMultiInstanceUserTaskProfileId &&
    programWellFormed program && programProfileCapabilitiesValid program

def parallelMultiInstanceProgramAdmitted (program : Program) : Bool :=
  program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId &&
    programWellFormed program && programProfileCapabilitiesValid program

def parallelMultiInstanceStartBindingsAdmitted (program : Program)
    (bindings : List VariableBinding) : Bool :=
  match program.operations.filterMap ParallelMultiInstanceArm.ofOperation?, bindings with
  | [arm], [input, policy] =>
      input.name == arm.data.input.dataObjectReferenceId &&
        (match input.value with
        | .stringList items => withinParallelMultiInstanceLimits arm items
        | _ => false) &&
        policy.name == "completionPolicy" &&
        match policy.value with
        | .string value => value = "all" || value = "first"
        | _ => false
  | _, _ => false

/-- The value-domain table cannot settle the sole arm's binding identity, cardinality and bounds. -/
def sequentialMultiInstanceStartBindingsAdmitted (program : Program)
    (bindings : List VariableBinding) : Bool :=
  match program.operations.filterMap SequentialMultiInstanceArm.ofOperation?, bindings with
  | [arm], [binding] =>
      binding.name == arm.data.inputDataObjectReferenceId &&
        match binding.value with
        | .stringList items => withinSequentialMultiInstanceLimits arm items
        | _ => false
  | _, _ => false

/-- The shared value-domain table cannot settle the composed profile's declared input Property. -/
def dataInputOutputStartBindingsAdmitted (program : Program)
    (bindings : List VariableBinding) : Bool :=
  match dataInputOutputTaskContracts program, bindings with
  | [_], [] => true
  | [contract], [binding] =>
      match contract.directInput.source with
      | .property propertyId =>
          binding.name == propertyId &&
            processDataBindingsAdmitted program.identity.semanticProfile .processStart bindings
      | .processDataInput _ => false
  | _, _ => false

def admitted (program : Program) (instanceId : SemanticId) (bindings : List VariableBinding) : Bool :=
  if ParallelScopeStart.programSelected program then
    (ParallelScopeStart.programStartCapacity program bindings).isSome
  else if sequentialScopeProgramSelected program then
    SequentialScopeData.startAdmitted program bindings
  else if program.identity.semanticProfile = mixedTaskControlFlowProfileId || program.identity.semanticProfile = mixedTaskBusinessErrorProfileId then
    MixedTaskControlFlow.startBindingsAdmitted program bindings
  else if program.identity.semanticProfile = serialBusinessTaskProfileId then
    SerialBusinessTask.startBindingsAdmitted program bindings
  else if program.identity.semanticProfile = portableEffectDataProfileId then
    EffectData.startBindingsAdmitted program bindings
  else if program.identity.semanticProfile = nestedScopeDataProfileId then
    NestedScopeData.startBindingsAdmitted program bindings
  else if program.identity.semanticProfile = callDataCheckpointProfileId then
    callDataStartBindingsAdmitted program bindings
  else if program.identity.semanticProfile = structuredCompositionCheckpointProfileId then
    structuredCompositionStartBindingsAdmitted program bindings
  else if program.identity.semanticProfile = portableHandoffProfileId then
    portableHandoffStartBindingsAdmitted program bindings
  else if program.identity.semanticProfile = compensationSourceCheckpointProfileId then
    compensationStartDataAdmitted program instanceId bindings
  else if parallelMultiInstanceProgramAdmitted program then
    parallelMultiInstanceStartBindingsAdmitted program bindings
  else if sequentialMultiInstanceProgramAdmitted program then
    sequentialMultiInstanceStartBindingsAdmitted program bindings
  else if program.identity.semanticProfile = activityDataInputOutputUserTaskProfileId then
    dataInputOutputStartBindingsAdmitted program bindings
  else processDataBindingsAdmitted program.identity.semanticProfile .processStart bindings

@[simp] theorem admitted_structuredComposition (program : Program) (instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId) :
    admitted program instanceId bindings = structuredCompositionStartBindingsAdmitted program bindings := by
  simp [admitted, profile, ParallelScopeStart.programSelected]

@[simp] theorem admitted_mixedTaskControlFlow (program : Program) (instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId) :
    admitted program instanceId bindings = MixedTaskControlFlow.startBindingsAdmitted program bindings := by
  simp [admitted, profile, ParallelScopeStart.programSelected]

@[simp] theorem admitted_mixedTaskBusinessError (program : Program) (instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskBusinessErrorProfileId) :
    admitted program instanceId bindings = MixedTaskControlFlow.startBindingsAdmitted program bindings := by
  simp [admitted, profile, ParallelScopeStart.programSelected]

@[simp] theorem admitted_serialBusinessTask (program : Program) (instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId) :
    admitted program instanceId bindings = SerialBusinessTask.startBindingsAdmitted program bindings := by
  simp [admitted, profile, ParallelScopeStart.programSelected]

end BpmnSemantics.SemanticProcess.CommandStartBindings
