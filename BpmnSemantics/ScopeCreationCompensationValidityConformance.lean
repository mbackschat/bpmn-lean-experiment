module

public import BpmnSemantics.CompensationActivityRetentionConformance
import BpmnSemantics.CompensationTriggerHandlerRuntimeConformance
import BpmnSemantics.SemanticProcess.ScopeInsertionValidity
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

/-! # Compensation owner lookups under scope insertion

The [scope-creation account](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite)
must preserve nonempty Compensation state as well as declaration-free preparations. These witnesses
test the existing Compensation predicates directly; they do not assert complete runtime validity or
admission of a new transition composition.
-/

@[expose] public section

namespace BpmnSemantics.ScopeCreationCompensationValidityConformance

open BpmnSemantics.SemanticProcess

def insertScope (state : RuntimeState) (scope : RuntimeScopeOccurrence) : RuntimeState :=
  { state with scopeOccurrences := insertScopeOccurrence scope state.scopeOccurrences }

def parentlessCount (state : RuntimeState) (owner : ScopeOccurrenceId) : Nat :=
  (state.scopeOccurrences.filter fun scope => decide (scope.id = owner) && scope.parent.isNone).length

namespace Retention

open BpmnSemantics.CompensationActivityRetentionConformance

def freshChild : RuntimeScopeOccurrence := { id := childOwner, parent := some owner }

def duplicateWithParent : RuntimeState :=
  insertScope stateAfterFirst { id := owner, parent := some owner }

theorem completed_work_survives_fresh_scope_insertion :
    (stateAfterFirst.compensationActivityRetentions.any fun retention =>
      !retention.records.isEmpty) = true ∧
    compensationActivityRetentionStateValid retentionProgram stateAfterFirst = true ∧
    compensationActivityRetentionStateValid retentionProgram
      (insertScope stateAfterFirst freshChild) = true := by
  decide +kernel

theorem parentless_count_does_not_replace_exact_retention_owner_lookup :
    parentlessCount stateAfterFirst owner = 1 ∧
    parentlessCount duplicateWithParent owner = 1 ∧
    compensationActivityRetentionStateValid retentionProgram duplicateWithParent = false := by
  decide +kernel

end Retention

namespace Execution

open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

def freshChild : RuntimeScopeOccurrence := { id := parentB, parent := some rootOwner }

def duplicateRoot : RuntimeState :=
  insertScope activeState { id := rootOwner, parent := none }

theorem active_handler_frontier_survives_fresh_scope_insertion :
    compensationExecutionStateValid program activeState = true ∧
    compensationExecutionStateValid program (insertScope activeState freshChild) = true := by
  decide +kernel

theorem duplicate_parentless_owner_invalidates_active_handler_frontier :
    parentlessCount activeState rootOwner = 1 ∧
    parentlessCount duplicateRoot rootOwner = 2 ∧
    compensationExecutionStateValid program duplicateRoot = false := by
  decide +kernel

end Execution

end BpmnSemantics.ScopeCreationCompensationValidityConformance
