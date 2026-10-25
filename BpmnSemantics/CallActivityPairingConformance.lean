module

public import BpmnSemantics.CallActivityConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Balanced invoke/return populations must still form a bijection, as required by
the [Call Activity account](../docs/capsules/CALL-ACTIVITY-SPEC.md).
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.CallActivityPairingConformance

open BpmnSemantics.SemanticProcess
open CallActivityConformance

def extraOperations (distinctInvokeId : Bool) : List SemanticOperation :=
  program.operations.filterMap fun
    | .invokeProcess id origin input process root entry returned _ =>
        some (.invokeProcess
          (if distinctInvokeId then ⟨"operation:AliasedCall"⟩ else id)
          origin input process root entry returned)
    | .returnProcess _ origin process root output _ =>
        some (.returnProcess ⟨"operation:UnclaimedReturn"⟩ origin process root output)
    | _ => none

def balancedManyToOne (distinctInvokeId : Bool) : Program :=
  { program with
    operations := program.operations ++ extraOperations distinctInvokeId
    operationScopes := program.operationScopes ++
      [{ operationId := ⟨"operation:AliasedCall"⟩, scopeId := callerScopeId },
       { operationId := ⟨"operation:UnclaimedReturn"⟩, scopeId := calledScopeId }] }

def baseline_pair_is_accepted : Bool := decide (callOperationsPaired program = true)

def duplicate_invoke_with_balanced_unclaimed_return_is_rejected : Bool := decide <|
    callOperationsPaired (balancedManyToOne false) = false

def distinct_invoke_alias_with_balanced_unclaimed_return_is_rejected : Bool := decide <|
    callOperationsPaired (balancedManyToOne true) = false

def full_program_admission_rejects_both_malformed_populations : Bool := decide <|
    programWellFormed (balancedManyToOne false) = false ∧
      programWellFormed (balancedManyToOne true) = false

/-- Every check of this module, named for the executable driver's failure report. -/
def checks : List (String × Bool) := [
  ("baseline_pair_is_accepted", baseline_pair_is_accepted),
  ("duplicate_invoke_with_balanced_unclaimed_return_is_rejected", duplicate_invoke_with_balanced_unclaimed_return_is_rejected),
  ("distinct_invoke_alias_with_balanced_unclaimed_return_is_rejected", distinct_invoke_alias_with_balanced_unclaimed_return_is_rejected),
  ("full_program_admission_rejects_both_malformed_populations", full_program_admission_rejects_both_malformed_populations)
]

end BpmnSemantics.CallActivityPairingConformance
