module

public import BpmnSemantics.Scenario
public import BpmnSemantics.WireNatural

/-! # Parallel Sub-Process population retirement

PMIS-END-01 and PMIS-CANCEL-01 require exact child ownership and separate completed from cancelled bodies. This account establishes local membership, retirement dispatch and accounting laws; callers establish quiescence and perform runtime cleanup.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics BpmnSemantics.SemanticProcessJson

structure ParallelScopeIteration where
  scope : ScopeOccurrenceId
  loopCounter : Nat
  item : String
  deriving Repr, DecidableEq

structure ParallelScopeController where
  id : ActivityOccurrenceId
  total : Nat
  completed : Nat
  deriving Repr, DecidableEq

/-- PMIS-ENTER-01 preserves one definition, unique scope identities and increasing immutable indices. -/
def validParallelScopeIterations (processInstanceId : SemanticId)
    (iterations : List ParallelScopeIteration) : Bool :=
  !iterations.isEmpty && iterations.all (fun iteration =>
    decide (iteration.scope.processInstanceId = processInstanceId ∧ 0 < iteration.scope.activation) &&
    isSafeWireNat iteration.scope.activation && isSafeWireNat iteration.loopCounter) &&
  decide (iterations.Pairwise (fun left right =>
    left.loopCounter < right.loopCounter ∧ left.scope ≠ right.scope ∧
    left.scope.definitionScopeId = right.scope.definitionScopeId))

/-- PMIS ownership uses the Activity membership, without a second controller-owned child list. -/
def validParallelScopePopulation (controller : ParallelScopeController)
    (iterations : List ParallelScopeIteration) : Bool :=
  isSafeWireNat controller.total && isSafeWireNat controller.completed &&
  decide (controller.completed < controller.total ∧
    controller.completed + iterations.length = controller.total) &&
  validParallelScopeIterations controller.id.processInstanceId iterations &&
  iterations.all (fun iteration => decide (iteration.loopCounter < controller.total))

/-- Exact child selection retains both sides of the original membership order. -/
def selectParallelScopeIteration (target : ScopeOccurrenceId) :
    List ParallelScopeIteration → Option (List ParallelScopeIteration × ParallelScopeIteration × List ParallelScopeIteration)
  | [] => none
  | current :: rest =>
    if current.scope = target then some ([], current, rest)
    else do
      let (before, selected, after) ← selectParallelScopeIteration target rest
      pure (current :: before, selected, after)

inductive ParallelScopeRetirement where
  | remaining (controller : ParallelScopeController) (completed : ParallelScopeIteration)
      (first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
  | naturalCompletion (controller : ParallelScopeController) (completed : ParallelScopeIteration)
  | earlyCompletion (controller : ParallelScopeController) (completed : ParallelScopeIteration)
      (first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
  deriving Repr, DecidableEq

def ParallelScopeRetirement.controller : ParallelScopeRetirement → ParallelScopeController
  | .remaining controller .. | .naturalCompletion controller .. | .earlyCompletion controller .. => controller

/-- Remaining or cancelled bodies; natural exhaustion has neither. -/
def ParallelScopeRetirement.siblings : ParallelScopeRetirement → List ParallelScopeIteration
  | .remaining _ _ first rest | .earlyCompletion _ _ first rest => first :: rest
  | .naturalCompletion .. => []

/-- PMIS-END-01 and PMIS-CANCEL-01 gives natural exhaustion precedence over a true completion condition. -/
def finishParallelScopeRetirement (controller : ParallelScopeController)
    (selected : ParallelScopeIteration) (siblings : List ParallelScopeIteration)
    (condition : Bool) : ParallelScopeRetirement :=
  let successor := { controller with completed := controller.completed + 1 }
  match siblings with
  | [] => .naturalCompletion successor selected
  | first :: rest =>
    if condition then .earlyCompletion successor selected first rest
    else .remaining successor selected first rest

/-- The caller establishes body quiescence before this ownership operation and owns state cleanup. -/
def retireParallelScopeIteration (controller : ParallelScopeController)
    (iterations : List ParallelScopeIteration) (target : ScopeOccurrenceId)
    (condition : Bool) : Option ParallelScopeRetirement := do
  if !validParallelScopePopulation controller iterations then none else do
    let (before, selected, after) ← selectParallelScopeIteration target iterations
    pure (finishParallelScopeRetirement controller selected (before ++ after) condition)

/-- Every present exact owner has an executable selection; no ordering premise is needed. -/
theorem selectParallelScopeIteration_total (target : ScopeOccurrenceId)
    (iterations : List ParallelScopeIteration)
    (member : ∃ iteration ∈ iterations, iteration.scope = target) :
    ∃ before selected after, selectParallelScopeIteration target iterations = some (before, selected, after) := by
  induction iterations with
  | nil => simp at member
  | cons current rest ih =>
    by_cases selected : current.scope = target
    · exact ⟨[], current, rest, by simp [selectParallelScopeIteration, selected]⟩
    · obtain ⟨iteration, present, identity⟩ := member
      have tailMember : iteration ∈ rest := by
        rcases List.mem_cons.mp present with rfl | present
        · exact False.elim (selected identity)
        · exact present
      obtain ⟨before, chosen, after, found⟩ := ih ⟨iteration, tailMember, identity⟩
      exact ⟨current :: before, chosen, after, by simp [selectParallelScopeIteration, selected, found]⟩

/-- Valid population accounting and present ownership make retirement dispatch total. -/
theorem retireParallelScopeIteration_total (controller : ParallelScopeController)
    (iterations : List ParallelScopeIteration) (target : ScopeOccurrenceId) (condition : Bool)
    (valid : validParallelScopePopulation controller iterations = true)
    (member : ∃ iteration ∈ iterations, iteration.scope = target) :
    ∃ result, retireParallelScopeIteration controller iterations target condition = some result := by
  obtain ⟨before, selected, after, found⟩ := selectParallelScopeIteration_total target iterations member
  exact ⟨finishParallelScopeRetirement controller selected (before ++ after) condition,
    by simp [retireParallelScopeIteration, valid, found]⟩

theorem selectParallelScopeIteration_sound (target : ScopeOccurrenceId)
    (iterations before after : List ParallelScopeIteration) (selected : ParallelScopeIteration)
    (found : selectParallelScopeIteration target iterations = some (before, selected, after)) :
    iterations = before ++ selected :: after ∧ selected.scope = target := by
  induction iterations generalizing before with
  | nil => simp [selectParallelScopeIteration] at found
  | cons current rest ih =>
    simp only [selectParallelScopeIteration] at found
    split at found
    · cases found
      simp_all
    · cases chosen : selectParallelScopeIteration target rest with
      | none => simp [chosen] at found
      | some selection =>
        rcases selection with ⟨preceding, member, suffix⟩
        simp [chosen] at found
        rcases found with ⟨rfl, rfl, rfl⟩
        obtain ⟨shape, owner⟩ := ih preceding chosen
        simp [shape, owner]

theorem finishParallelScopeRetirement_controller (controller : ParallelScopeController)
    (selected : ParallelScopeIteration) (siblings : List ParallelScopeIteration) (condition : Bool) :
    (finishParallelScopeRetirement controller selected siblings condition).controller =
      { controller with completed := controller.completed + 1 } := by
  cases siblings <;> cases condition <;> rfl

theorem finishParallelScopeRetirement_siblings (controller : ParallelScopeController)
    (selected : ParallelScopeIteration) (siblings : List ParallelScopeIteration) (condition : Bool) :
    (finishParallelScopeRetirement controller selected siblings condition).siblings = siblings := by
  cases siblings <;> cases condition <;> rfl

/-- Accounting charges the completed body once; cancelled siblings never become completions. -/
theorem parallelScopeRetirement_accounting (controller : ParallelScopeController)
    (before after : List ParallelScopeIteration) (selected : ParallelScopeIteration) (condition : Bool)
    (accounted : controller.completed + (before ++ selected :: after).length = controller.total) :
    let result := finishParallelScopeRetirement controller selected (before ++ after) condition
    result.controller.total = controller.total ∧
    result.controller.completed + result.siblings.length = controller.total := by
  simp only [finishParallelScopeRetirement_controller, finishParallelScopeRetirement_siblings]
  simp only [List.length_append, List.length_cons] at *
  constructor
  · trivial
  · omega

/-- Selection removes exactly one owned body while preserving the entire surviving entries. -/
theorem parallelScopeRetirement_frame (controller : ParallelScopeController)
    (iterations before after : List ParallelScopeIteration) (selected : ParallelScopeIteration)
    (target : ScopeOccurrenceId) (condition : Bool)
    (found : selectParallelScopeIteration target iterations = some (before, selected, after)) :
    let siblings := (finishParallelScopeRetirement controller selected (before ++ after) condition).siblings
    iterations = before ++ selected :: after ∧ selected.scope = target ∧
    siblings = before ++ after := by
  obtain ⟨shape, identity⟩ := selectParallelScopeIteration_sound target iterations before after selected found
  exact ⟨shape, identity, finishParallelScopeRetirement_siblings ..⟩

/-- Declarative retirement distinguishes continued ownership, natural exhaustion and cancellation. -/
inductive ParallelScopeRetirementRelation (controller : ParallelScopeController)
    (iterations : List ParallelScopeIteration) (target : ScopeOccurrenceId) :
    Bool → ParallelScopeRetirement → Prop where
  | remaining (before after : List ParallelScopeIteration) (selected first : ParallelScopeIteration)
      (rest : List ParallelScopeIteration)
      (valid : validParallelScopePopulation controller iterations = true)
      (shape : iterations = before ++ selected :: after) (identity : selected.scope = target)
      (siblings : before ++ after = first :: rest) :
      ParallelScopeRetirementRelation controller iterations target false
        (.remaining { controller with completed := controller.completed + 1 } selected first rest)
  | naturalCompletion (selected : ParallelScopeIteration) (condition : Bool)
      (valid : validParallelScopePopulation controller iterations = true)
      (shape : iterations = [selected]) (identity : selected.scope = target) :
      ParallelScopeRetirementRelation controller iterations target condition
        (.naturalCompletion { controller with completed := controller.completed + 1 } selected)
  | earlyCompletion (before after : List ParallelScopeIteration) (selected first : ParallelScopeIteration)
      (rest : List ParallelScopeIteration)
      (valid : validParallelScopePopulation controller iterations = true)
      (shape : iterations = before ++ selected :: after) (identity : selected.scope = target)
      (siblings : before ++ after = first :: rest) :
      ParallelScopeRetirementRelation controller iterations target true
        (.earlyCompletion { controller with completed := controller.completed + 1 } selected first rest)

theorem retireParallelScopeIteration_dispatch (controller : ParallelScopeController)
    (iterations : List ParallelScopeIteration) (target : ScopeOccurrenceId) (condition : Bool)
    (result : ParallelScopeRetirement)
    (executed : retireParallelScopeIteration controller iterations target condition = some result) :
    ParallelScopeRetirementRelation controller iterations target condition result := by
  unfold retireParallelScopeIteration at executed
  split at executed
  · simp at executed
  · rename_i admitted
    have valid : validParallelScopePopulation controller iterations = true := by simpa using admitted
    cases found : selectParallelScopeIteration target iterations with
    | none => simp [found] at executed
    | some selection =>
      rcases selection with ⟨before, selected, after⟩
      simp [found] at executed
      subst result
      obtain ⟨shape, identity⟩ := selectParallelScopeIteration_sound target iterations before after selected found
      cases siblings : before ++ after with
      | nil =>
        have both := List.append_eq_nil_iff.mp siblings
        rcases both with ⟨rfl, rfl⟩
        exact .naturalCompletion selected condition valid shape identity
      | cons first rest =>
        cases condition with
        | false =>
          simpa [finishParallelScopeRetirement, siblings] using
            (ParallelScopeRetirementRelation.remaining before after selected first rest valid shape identity siblings)
        | true =>
          simpa [finishParallelScopeRetirement, siblings] using
            (ParallelScopeRetirementRelation.earlyCompletion before after selected first rest valid shape identity siblings)

theorem validParallelScopePopulation_accounting (controller : ParallelScopeController)
    (iterations : List ParallelScopeIteration)
    (valid : validParallelScopePopulation controller iterations = true) :
    controller.completed + iterations.length = controller.total := by
  simp only [validParallelScopePopulation, Bool.and_eq_true, decide_eq_true_eq] at valid
  exact valid.1.1.2.2

/-- Every accepted evaluator result preserves the fixed total and counts cancellation separately. -/
theorem retireParallelScopeIteration_accounting (controller : ParallelScopeController)
    (iterations : List ParallelScopeIteration) (target : ScopeOccurrenceId) (condition : Bool)
    (result : ParallelScopeRetirement)
    (executed : retireParallelScopeIteration controller iterations target condition = some result) :
    result.controller.id = controller.id ∧ result.controller.total = controller.total ∧
    result.controller.completed = controller.completed + 1 ∧
    result.controller.completed + result.siblings.length = controller.total := by
  have relation := retireParallelScopeIteration_dispatch controller iterations target condition result executed
  cases relation with
  | remaining before after selected first rest valid shape identity siblings
  | earlyCompletion before after selected first rest valid shape identity siblings =>
    have accounted := validParallelScopePopulation_accounting controller iterations valid
    have length := congrArg List.length siblings
    simp only [shape, List.length_append, List.length_cons] at accounted
    simp only [List.length_append, List.length_cons] at length
    simp only [ParallelScopeRetirement.controller, ParallelScopeRetirement.siblings, List.length_cons]
    exact ⟨trivial, trivial, trivial, by omega⟩
  | naturalCompletion selected condition valid shape identity =>
    have accounted := validParallelScopePopulation_accounting controller iterations valid
    simp only [shape, List.length_cons, List.length_nil] at accounted
    exact ⟨rfl, rfl, rfl, by simpa [ParallelScopeRetirement.controller, ParallelScopeRetirement.siblings] using accounted⟩

private theorem validParallelScopeIterations_sublist (instanceId : SemanticId)
    (before after : List ParallelScopeIteration)
    (valid : validParallelScopeIterations instanceId before = true)
    (retained : after.Sublist before) (nonempty : after ≠ []) :
    validParallelScopeIterations instanceId after = true := by
  simp only [validParallelScopeIterations, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true] at valid ⊢
  refine ⟨⟨by cases after <;> simp_all, ?_⟩, List.Pairwise.sublist retained valid.2⟩
  intro iteration member
  exact valid.1.2 iteration (retained.subset member)

/-- PMIS-END-01 preserves valid ongoing ownership after any exact retirement that leaves a nonempty population. -/
theorem retireParallelScopeIteration_remaining_valid (controller next : ParallelScopeController)
    (iterations : List ParallelScopeIteration) (target : ScopeOccurrenceId) (condition : Bool)
    (selected first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
    (executed : retireParallelScopeIteration controller iterations target condition =
      some (.remaining next selected first rest)) :
    validParallelScopePopulation next (first :: rest) = true := by
  have accounted := (retireParallelScopeIteration_accounting controller iterations target condition
    (.remaining next selected first rest) executed).2.2.2
  have relation := retireParallelScopeIteration_dispatch controller iterations target condition
    (.remaining next selected first rest) executed
  cases relation with
  | remaining before after selected first rest valid shape identity siblings =>
    have retained : (first :: rest).Sublist iterations := by
      rw [← siblings, shape]
      exact (List.sublist_cons_self selected after).append_left before
    have original := valid
    simp only [validParallelScopePopulation, Bool.and_eq_true, decide_eq_true_eq,
      isSafeWireNat, List.all_eq_true] at original
    have totalSafe : controller.total ≤ maxSafeWireNat := original.1.1.1.1
    have completionSafe : controller.completed + 1 ≤ maxSafeWireNat := by
      simp only [ParallelScopeRetirement.controller, ParallelScopeRetirement.siblings,
        List.length_cons] at accounted
      omega
    have completionBelow : controller.completed + 1 < controller.total := by
      simp only [ParallelScopeRetirement.controller, ParallelScopeRetirement.siblings,
        List.length_cons] at accounted
      omega
    have iterationsValid := validParallelScopeIterations_sublist controller.id.processInstanceId
      iterations (first :: rest) original.1.2 retained (by simp)
    simp only [validParallelScopePopulation, Bool.and_eq_true, decide_eq_true_eq,
      isSafeWireNat, List.all_eq_true]
    refine ⟨⟨⟨⟨totalSafe, completionSafe⟩, ⟨completionBelow, accounted⟩⟩, iterationsValid⟩, ?_⟩
    intro iteration member
    exact original.2 iteration (retained.subset member)

def sampleController : ParallelScopeController :=
  ⟨⟨⟨"applicants"⟩, ⟨"Check"⟩, 2⟩, 3, 0⟩
def sampleIteration (index : Nat) : ParallelScopeIteration :=
  ⟨⟨⟨"applicants"⟩, ⟨"CheckBody"⟩, 8 + index⟩, index, "same applicant value"⟩

example : retireParallelScopeIteration sampleController
    [sampleIteration 0, sampleIteration 1, sampleIteration 2] (sampleIteration 1).scope false =
    some (.remaining { sampleController with completed := 1 } (sampleIteration 1)
      (sampleIteration 0) [sampleIteration 2]) := by decide +kernel

example : retireParallelScopeIteration sampleController
    [sampleIteration 0, sampleIteration 1, sampleIteration 2] (sampleIteration 1).scope true =
    some (.earlyCompletion { sampleController with completed := 1 } (sampleIteration 1)
      (sampleIteration 0) [sampleIteration 2]) := by decide +kernel

example : retireParallelScopeIteration { sampleController with completed := 2 }
    [sampleIteration 2] (sampleIteration 2).scope true =
    some (.naturalCompletion { sampleController with completed := 3 } (sampleIteration 2)) := by decide +kernel

example : retireParallelScopeIteration sampleController
    [sampleIteration 0, sampleIteration 0, sampleIteration 2] (sampleIteration 0).scope false = none := by decide +kernel

end BpmnSemantics.SemanticProcess
