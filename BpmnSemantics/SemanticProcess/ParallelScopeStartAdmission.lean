import BpmnSemantics.SemanticProcess.ParallelScopeCheckedAdmission

/-! PMIS-ADMIT-01 binds the proposed closure count to source ownership and validated Start data, without enabling execution. -/

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

def closureBound (parent bodyWithRetirement count : Nat) : Nat :=
  parent + count * bodyWithRetirement

theorem closureBound_zero (parent bodyWithRetirement : Nat) :
    closureBound parent bodyWithRetirement 0 = parent := by simp [closureBound]

theorem closureBound_within_ceiling (parent bodyWithRetirement count : Nat)
    (static : parent + bodyWithRetirement ≤ 1024) (population : count ≤ 16) :
    closureBound parent bodyWithRetirement count ≤ 16400 := by
  have multiplied := Nat.mul_le_mul_right bodyWithRetirement population
  unfold closureBound
  omega

def boundedClosureBound (parent bodyWithRetirement count : Nat) : Option Nat :=
  if parent + bodyWithRetirement ≤ 1024 ∧ count ≤ 16 then
    some (closureBound parent bodyWithRetirement count) else none

theorem boundedClosureBound_within_ceiling (parent bodyWithRetirement count bound : Nat)
    (accepted : boundedClosureBound parent bodyWithRetirement count = some bound) : bound ≤ 16400 := by
  unfold boundedClosureBound at accepted
  split at accepted
  next limits =>
    simp only [Option.some.injEq] at accepted
    subst bound
    exact closureBound_within_ceiling _ _ _ limits.1 limits.2
  next => contradiction

private def checkedSourceCounts (source : CheckedProcess) (bindings : List VariableBinding) : Option (Nat × Nat × Nat) := do
  if !ParallelScopeChecked.admitted source then none else do
    let [entry] := source.nodes.filter (fun node => match node with | .parallelMultiInstanceSubProcess .. => true | _ => false) | none
    let .parallelMultiInstanceSubProcess _ childScope collection item inputs condition := entry | none
    let [root] := source.definitionScopes.filter (·.parentScopeId.isNone) | none
    let locals := inputs.map (·.target)
    let reads := source.nodes.flatMap fun node => match node with
      | .serviceTask id _ mappings _ _ =>
          (SerialBusinessTask.readNames mappings).filter fun name =>
            checkedNodeScopeId? source id != some childScope || (!locals.contains name && name != item)
      | _ => []
    let required := (SerialBusinessTask.readNames inputs ++ reads).eraseDups
    if !SequentialScopeData.startBindingsAdmitted collection condition (SerialBusinessTask.checkedHandlers source) required bindings then none else do
      let [binding] := bindings.filter (·.name == collection) | none
      let .stringList items := binding.value | none
      -- Lowering elides the child Start and adds its retirement; the parent gains root completion.
      let parent := (source.nodeScopes.filter (·.scopeId == root.id)).length + 1
      let bodyWithRetirement := (source.nodeScopes.filter (·.scopeId == childScope)).length
      some (parent, bodyWithRetirement, items.length)

def checkedSourceBound (source : CheckedProcess) (bindings : List VariableBinding) : Option Nat := do
  let (parent, body, count) ← checkedSourceCounts source bindings
  boundedClosureBound parent body count

theorem checkedSourceBound_within_ceiling (source : CheckedProcess) (bindings : List VariableBinding) (bound : Nat)
    (accepted : checkedSourceBound source bindings = some bound) : bound ≤ 16400 := by
  cases counts : checkedSourceCounts source bindings with
  | none => simp [checkedSourceBound, counts] at accepted
  | some values =>
      rcases values with ⟨parent, body, count⟩
      exact boundedClosureBound_within_ceiling parent body count bound (by simpa [checkedSourceBound, counts] using accepted)


def boundedFrontier (waits effects : Nat) : Option StructuredParallelBody.FrontierCapacity :=
  if waits ≤ 128 ∧ effects ≤ 64 then some ⟨waits, effects⟩ else none

theorem boundedFrontier_within_limits (waits effects : Nat) (capacity : StructuredParallelBody.FrontierCapacity)
    (accepted : boundedFrontier waits effects = some capacity) : capacity.waits ≤ 128 ∧ capacity.effects ≤ 64 := by
  unfold boundedFrontier at accepted
  split at accepted
  next limits =>
    cases accepted
    exact limits
  next => contradiction

/-- PMIS-ADMIT-01 retains parent serial work while multiplying only simultaneous body waits by population. -/
def checkedSourceFrontier (source : CheckedProcess) (bindings : List VariableBinding) : Option StructuredParallelBody.FrontierCapacity := do
  let (_, _, count) ← checkedSourceCounts source bindings
  let [entry] := source.nodes.filter (fun node => match node with | .parallelMultiInstanceSubProcess .. => true | _ => false) | none
  let .parallelMultiInstanceSubProcess _ childScope .. := entry | none
  let child := source.nodes.filter (fun node => checkedNodeScopeId? source node.id == some childScope)
  let parent := source.nodes.filter (fun node => checkedNodeScopeId? source node.id != some childScope)
  let effectIds := child.filterMap fun node => match node with | .serviceTask id .. => some id.value | _ => none
  let body ← StructuredParallelBody.frontierCapacity (← child.mapM (SequentialScopeChecked.bodyVertex? source)) effectIds
  let waits := max (if parent.any (fun node => match node with | .userTask .. | .serviceTask .. => true | _ => false) then 1 else 0) (count * body.waits)
  let effects := max (if parent.any (fun node => match node with | .serviceTask .. => true | _ => false) then 1 else 0) (count * body.effects)
  boundedFrontier waits effects

end BpmnSemantics.SemanticProcess.ParallelScopeStart
