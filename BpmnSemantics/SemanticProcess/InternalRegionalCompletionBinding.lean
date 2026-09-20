import BpmnSemantics.SemanticProcess.InternalRegionalCompletionSelection

/-! # Bounded completion declaration binding

Checked graph admission gives each control place one producer. A projected boundary output
therefore identifies its declaring operation independently of Activity-to-Program completeness.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem graph_output_producer_identity (program : Program) (place : ControlPlace)
    (left right : SemanticOperation)
    (valid : programGraphWellFormedForProgram program = true)
    (declared : place ∈ program.controlPlaces)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftOutput : place.id ∈ operationOutputs left) (rightOutput : place.id ∈ operationOutputs right) :
    left.id = right.id := by
  have memberId (operation : SemanticOperation) (member : operation ∈ program.operations)
      (output : place.id ∈ operationOutputs operation) : operation.id ∈ producers program.operations place.id := by
    unfold producers
    exact List.mem_filterMap.mpr ⟨operation, member, by simp [output]⟩
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at valid
  dsimp only at valid
  split at valid
  · split at valid
    · simp only [Bool.and_eq_true] at valid
      have ports := List.all_eq_true.mp valid.1.1.1.2 place declared
      simp only [Bool.and_eq_true, decide_eq_true_eq] at ports
      have count := ports.1
      obtain ⟨producer, census⟩ := List.length_eq_one_iff.mp count
      have leftIn := memberId left leftMember leftOutput
      have rightIn := memberId right rightMember rightOutput
      simp only [census, List.mem_singleton] at leftIn rightIn
      exact leftIn.trans rightIn.symm
    · contradiction
  · contradiction

/-- A projected boundary output identifies its exact bounded entry by the graph's existing
producer census. No Activity element or retained operation-id premise is required. -/
theorem boundedCompletion_output_operation_binding (program : Program) (place : ControlPlace)
    (id : OperationId) (origin : BpmnElementOrigin) (input childEntry : ControlPlaceId)
    (scopeId : DefinitionScopeId) (boundary : BoundaryTimerArm) (projected : SemanticOperation)
    (valid : programWellFormed program = true)
    (declared : place ∈ program.controlPlaces) (output : place.id = boundary.output)
    (entry : .enterBoundedScope id origin input childEntry scopeId boundary ∈ program.operations)
    (projectedMember : projected ∈ program.operations)
    (projectedOutput : place.id ∈ operationOutputs projected) : projected.id = id := by
  exact graph_output_producer_identity program place projected
    (.enterBoundedScope id origin input childEntry scopeId boundary)
    (programWellFormed_graph program valid) declared projectedMember entry projectedOutput
    (by simp [operationOutputs, output])

/-- Once projection validates the Timer declaration, its operation is the unique bounded entry.
This resolves the TypeScript lookup identity without adding a field or an Activity binding rule. -/
theorem boundedCompletion_timer_operation_binding (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input childEntry : ControlPlaceId)
    (scopeId : DefinitionScopeId) (boundary : BoundaryTimerArm) (projected : SemanticOperation)
    (valid : programWellFormed program = true)
    (entry : .enterBoundedScope id origin input childEntry scopeId boundary ∈ program.operations)
    (projectedMember : projected ∈ program.operations)
    (projectedTimer : operationDeclaresWaitKey projected (timerWaitDeclarationKey boundary.elementId) = true) :
    projected = .enterBoundedScope id origin input childEntry scopeId boundary := by
  have census := programWellFormed_waitDeclarer program
    (.enterBoundedScope id origin input childEntry scopeId boundary)
    (timerWaitDeclarationKey boundary.elementId) valid entry
    (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
  have present : projected ∈ program.operations.filter (fun candidate =>
      operationDeclaresWaitKey candidate (timerWaitDeclarationKey boundary.elementId)) :=
    List.mem_filter.mpr ⟨projectedMember, projectedTimer⟩
  rw [census] at present
  exact List.mem_singleton.mp present

end BpmnSemantics.SemanticProcess.InternalCommutation
