module

public import BpmnSemantics.SemanticProcess.BoundedScope
public import BpmnSemantics.SemanticProcess.MonitoredScope
public import BpmnSemantics.SemanticProcess.TransactionCancellation
public import BpmnSemantics.SemanticProcess.NestedScopeData
public import BpmnSemantics.SemanticProcess.ScopeOccurrenceEntry
import all BpmnSemantics.SemanticProcess.NestedScopeData
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Declared scope entry and completion

This module owns the scope-entry and scope-completion transformations that the `enterScope` and
`completeScope` operations evaluate: monitored or bounded completion selection, and the nested
scope-data hooks that initialize a declaring scope's frame on entry and write its outputs before
completion disposes it. A merge target, entered and completed by occurrence beside live siblings of its
definition (CEA-OCCUR-01, CEA-QUIESCE-01), takes the same hooks addressed by occurrence (CSD-INIT-01,
CSD-RETIRE-01). A Program without a `scopeLocalData` record for the scope keeps exactly the undeclared
entry and completion, which the `_undeclared` and `_other_profile` equations state.
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`recordFor?]

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def completeSelectedScope? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId) : Option RuntimeState :=
  if isMonitoredScopeDefinition program scopeId then
    completeMonitoredScope? program state scopeId parentOutput
  else completeBoundedScope? program state scopeId parentOutput

/-- `enterScope` with NSD-INIT-01: a scope declaring locals installs its frame in the same step. A
scope without a `scopeLocalData` record keeps exactly the retention-aware entry. -/
def enterDeclaredScope? (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId) : Option RuntimeState :=
  match NestedScopeData.recordFor? program childScopeId with
  | none => enterScopeWithCompensationRetention? program state input childEntry childScopeId
  | some _ => do
      NestedScopeData.initializeFrame? program
        (← enterScopeWithCompensationRetention? program state input childEntry childScopeId) childScopeId

/-- `completeScope` with NSD-OUTPUT-01: a child scope declaring locals writes its outputs before the
completion rewrite disposes its frame. Root completion and undeclared scopes keep exactly the
selected completion. -/
def completeDeclaredScope? (program : Program) (state : RuntimeState) (scopeId : DefinitionScopeId) :
    Option ControlPlaceId → Option RuntimeState
  | none => completeSelectedScope? program state scopeId none
  | some output => match NestedScopeData.recordFor? program scopeId with
    | none => completeSelectedScope? program state scopeId (some output)
    | some _ => do
        completeSelectedScope? program (← NestedScopeData.writeOutputs? program state scopeId) scopeId
          (some output)

/-- SCPH-START-01: a `subProcess` scope host enters its child from its one input to its first entry as `enterScope`
does, then splits that child-owned token over every entry in the same step, so the split is no step of its own. -/
def enterDeclaredScopeEntries? (program : Program) (state : RuntimeState) (input : ControlPlaceId)
    (entries : List ControlPlaceId) (childScopeId : DefinitionScopeId) : Option RuntimeState := do
  let first ← entries.head?
  let entered ← enterDeclaredScope? program state input first childScopeId
  let child ← onlyTokenOwner? entered first
  some (duplicateToken entered child first entries)

/-- SCPH-EXIT-01: a scope exit completes its Sub-Process to its first output as `completeScope` does, then splits that
parent-owned token over every output in the same step. -/
def completeDeclaredScopeOutputs? (program : Program) (state : RuntimeState) (scopeId : DefinitionScopeId)
    (outputs : List ControlPlaceId) : Option RuntimeState := do
  let first ← outputs.head?
  let completed ← completeDeclaredScope? program state scopeId (some first)
  let parent ← onlyTokenOwner? completed first
  some (duplicateToken completed parent first outputs)

/-- CSD-INIT-01: a merge target's entry initializes the frame of the occurrence `enterConcurrentScopeState?`
issues under `parent`, whose chain the inputs read. -/
def enterDeclaredScopeOccurrence? (program : Program) (state : RuntimeState) (parent : ScopeOccurrenceId)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId) : Option RuntimeState :=
  match NestedScopeData.recordFor? program childScopeId with
  | none => enterConcurrentScopeState? state parent input childEntry childScopeId
  | some record => do
      NestedScopeData.initializeFrameAt? program
        (← enterConcurrentScopeState? state parent input childEntry childScopeId) record
        (concurrentScopeChild state parent.processInstanceId childScopeId) parent

/-- CSD-RETIRE-01: the completing merge-target occurrence `owner` writes its outputs through its own
parent's chain before `completeScopeOccurrenceState?` disposes exactly its frame. Root completion and
undeclared scopes keep exactly that completion. -/
def completeDeclaredScopeOccurrence? (program : Program) (state : RuntimeState) (owner : ScopeOccurrenceId)
    (scopeId : DefinitionScopeId) : Option ControlPlaceId → Option RuntimeState
  | none => completeScopeOccurrenceState? state owner scopeId none
  | some output => match NestedScopeData.recordFor? program scopeId with
    | none => completeScopeOccurrenceState? state owner scopeId (some output)
    | some record => do
        let [occurrence] := state.scopeOccurrences.filter (·.id == owner) | none
        let parent ← occurrence.parent
        if owner.definitionScopeId ≠ scopeId then none
        else
          completeScopeOccurrenceState? (← NestedScopeData.writeOutputsAt? program state record owner parent)
            owner scopeId (some output)

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`completeDeclaredScope?, `completeDeclaredScopeOccurrence?,
  `enterDeclaredScope?, `enterDeclaredScopeOccurrence?]

theorem enterDeclaredScope?_undeclared (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (undeclared : NestedScopeData.recordFor? program childScopeId = none) :
    enterDeclaredScope? program state input childEntry childScopeId =
      enterScopeWithCompensationRetention? program state input childEntry childScopeId := by
  simp only [enterDeclaredScope?, undeclared]

theorem completeDeclaredScope?_undeclared (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (undeclared : NestedScopeData.recordFor? program scopeId = none) :
    completeDeclaredScope? program state scopeId output = completeSelectedScope? program state scopeId output := by
  cases output <;> simp only [completeDeclaredScope?, undeclared]

theorem enterDeclaredScope?_eq_none (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (refused : enterScopeWithCompensationRetention? program state input childEntry childScopeId = none) :
    enterDeclaredScope? program state input childEntry childScopeId = none := by
  unfold enterDeclaredScope?
  split <;> simp [refused]

/-- A completion refused in every state differing from `state` only in data stays refused after
NSD-OUTPUT-01's write, which changes nothing else. -/
theorem completeDeclaredScope?_eq_none (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (refused : ∀ written : RuntimeState, written = { state with variables := written.variables } →
      completeSelectedScope? program written scopeId output = none) :
    completeDeclaredScope? program state scopeId output = none := by
  cases output with
  | none => exact refused state rfl
  | some output =>
      simp only [completeDeclaredScope?]
      cases NestedScopeData.recordFor? program scopeId with
      | none => exact refused state rfl
      | some _ =>
          cases wrote : NestedScopeData.writeOutputs? program state scopeId with
          | none => rfl
          | some written =>
              exact refused written
                (NestedScopeData.writeOutputs?_variables_only program state written scopeId wrote)

theorem enterDeclaredScope?_other_profile (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (other : nestedScopeDataProgram program = false) :
    enterDeclaredScope? program state input childEntry childScopeId =
      enterScopeWithCompensationRetention? program state input childEntry childScopeId :=
  enterDeclaredScope?_undeclared program state input childEntry childScopeId
    (by simp only [NestedScopeData.recordFor?, other, Bool.false_eq_true, ↓reduceIte])

theorem completeDeclaredScope?_other_profile (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (other : nestedScopeDataProgram program = false) :
    completeDeclaredScope? program state scopeId output = completeSelectedScope? program state scopeId output :=
  completeDeclaredScope?_undeclared program state scopeId output
    (by simp only [NestedScopeData.recordFor?, other, Bool.false_eq_true, ↓reduceIte])

/-- A declared merge target's entry is the occurrence entry followed by the frame of exactly the issued
occurrence. -/
theorem enterDeclaredScopeOccurrence_initializes (program : Program) (state after : RuntimeState)
    (parent : ScopeOccurrenceId) (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (record : ScopeLocalData) (recorded : NestedScopeData.recordFor? program childScopeId = some record)
    (entered : enterDeclaredScopeOccurrence? program state parent input childEntry childScopeId = some after) :
    ∃ issued, enterConcurrentScopeState? state parent input childEntry childScopeId = some issued ∧
      NestedScopeData.initializeFrameAt? program issued record
        (concurrentScopeChild state parent.processInstanceId childScopeId) parent = some after := by
  simp only [enterDeclaredScopeOccurrence?, recorded, Option.bind_eq_bind, Option.bind_eq_some_iff] at entered
  exact entered

/-- A merge target's completion is the occurrence completion of a state that differs from `state` only in
data. -/
theorem completeDeclaredScopeOccurrence_factors (program : Program) (state completed : RuntimeState)
    (owner : ScopeOccurrenceId) (scopeId : DefinitionScopeId) (output : ControlPlaceId)
    (completion : completeDeclaredScopeOccurrence? program state owner scopeId (some output) = some completed) :
    ∃ written : RuntimeState, written = { state with variables := written.variables } ∧
      completeScopeOccurrenceState? written owner scopeId (some output) = some completed := by
  simp only [completeDeclaredScopeOccurrence?] at completion
  split at completion
  · exact ⟨state, rfl, completion⟩
  · next record _ =>
      simp only [Option.bind_eq_bind] at completion
      split at completion
      · obtain ⟨_, _, completion⟩ := Option.bind_eq_some_iff.mp completion
        split at completion
        · contradiction
        · obtain ⟨written, wrote, applied⟩ := Option.bind_eq_some_iff.mp completion
          exact ⟨written, NestedScopeData.writeOutputsAt?_variables_only program state written record owner _ wrote,
            applied⟩
      · contradiction

end BpmnSemantics.SemanticProcess
