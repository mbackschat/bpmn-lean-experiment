import BpmnSemantics.CallActivityConformance

/-! Balanced invoke/return populations must still form a bijection, as required by
the [Call Activity account](../docs/capsules/CALL-ACTIVITY-SPEC.md).
-/

set_option Elab.async false

namespace BpmnSemantics.CallActivityPairingConformance

open BpmnSemantics.SemanticProcess
open CallActivityConformance

private def extraOperations (distinctInvokeId : Bool) : List SemanticOperation :=
  program.operations.filterMap fun
    | .invokeProcess id origin input process root entry returned =>
        some (.invokeProcess
          (if distinctInvokeId then ⟨"operation:AliasedCall"⟩ else id)
          origin input process root entry returned)
    | .returnProcess _ origin process root output =>
        some (.returnProcess ⟨"operation:UnclaimedReturn"⟩ origin process root output)
    | _ => none

private def balancedManyToOne (distinctInvokeId : Bool) : Program :=
  { program with
    operations := program.operations ++ extraOperations distinctInvokeId
    operationScopes := program.operationScopes ++
      [{ operationId := ⟨"operation:AliasedCall"⟩, scopeId := callerScopeId },
       { operationId := ⟨"operation:UnclaimedReturn"⟩, scopeId := calledScopeId }] }

theorem baseline_pair_is_accepted : callOperationsPaired program = true := by decide +kernel

theorem duplicate_invoke_with_balanced_unclaimed_return_is_rejected :
    callOperationsPaired (balancedManyToOne false) = false := by decide +kernel

theorem distinct_invoke_alias_with_balanced_unclaimed_return_is_rejected :
    callOperationsPaired (balancedManyToOne true) = false := by decide +kernel

theorem full_program_admission_rejects_both_malformed_populations :
    programWellFormed (balancedManyToOne false) = false ∧
      programWellFormed (balancedManyToOne true) = false := by decide +kernel

end BpmnSemantics.CallActivityPairingConformance
