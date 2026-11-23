module

public import Kernel.Laws.State
public import Kernel.Laws.Data.Values

/-! # Laws of the kernel state: the scope chain's searches

What `State.visible`, `State.owner?`, `State.declaring?` and `State.instanceRoot` find, derived from their step
equations in `Kernel.Laws.State` (`visible_go`, `owner?_go`, `declaring?_go`, `instanceRoot_go`) without opening
`Kernel.State`'s bodies. Each search runs from a scope occurrence outward and stops at a called instance's root, the
root of the scope occurrence's process instance (`InstanceRoot`). A called instance's identifier names its caller
instance, Call and activation alone (`calledInstanceId_inj`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The process instance of a scope occurrence -/

/-- `root` is the root of a called process instance in `s`. -/
def CalledRoot (s : State) (root : ScopeOccurrenceId) : Prop :=
  ∃ occurrence ∈ s.scopes, occurrence.id = root ∧ occurrence.calledInstance.isSome

/-- `root` is the root of the process instance `scope` belongs to: the nearest called root from `scope` outward, `scope`
itself included, or the process root when none lies on the way. -/
def InstanceRoot (s : State) (scope root : ScopeOccurrenceId) : Prop :=
  Within s scope root ∧ (CalledRoot s root ∨ root = State.root) ∧
    ∀ nearer, Within s scope nearer → Within s nearer root → CalledRoot s nearer → nearer = root

/-! ## Congruence -/

/-- What a scope occurrence sees reads only the scope occurrences and the variable sets. -/
theorem visible_congr {s t : State} (scopes : t.scopes = s.scopes) (variables : t.variables = s.variables)
    (program : Program) (scope : ScopeOccurrenceId) : t.visible program scope = s.visible program scope := by
  have shows : t.shows program = s.shows program := by
    funext id name; simp only [shows_eq, scopes]
  have called : t.calledRoot = s.calledRoot := by
    funext id; simp only [calledRoot_eq, scopes]
  obtain ⟨later, laterStart, laterSteps⟩ := visible_go t program
  obtain ⟨laterZero, laterNone, laterStep⟩ := laterSteps
  obtain ⟨earlier, earlierStart, earlierSteps⟩ := visible_go s program
  obtain ⟨earlierZero, earlierNone, earlierStep⟩ := earlierSteps
  have go : ∀ fuel current, later fuel current = earlier fuel current := by
    intro fuel
    induction fuel with
    | zero => intro current; rw [laterZero, earlierZero]
    | succ fuel ih =>
      intro current
      cases current with
      | none => rw [laterNone, earlierNone]
      | some id => rw [laterStep, earlierStep, shows, called, scopes, variables, ih]
  rw [laterStart, earlierStart, go]

/-! ## What a search finds stands -/

private theorem find?_stands {state : State} {current : ScopeOccurrenceId} {entry : ScopeOccurrence}
    (found : state.scopes.find? (·.id == current) = some entry) : ∃ scope ∈ state.scopes, scope.id = current :=
  ⟨entry, List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

/-- The declaring occurrence `State.declaring?` finds stands. -/
theorem declaring?_stands {state : State} {scope found : ScopeOccurrenceId} {element : ElementId}
    (ran : state.declaring? scope element = some found) : ∃ entry ∈ state.scopes, entry.id = found := by
  obtain ⟨go, start, zero, step⟩ := declaring?_go state element
  rw [start] at ran
  generalize scope.segments.length + 1 = fuel at ran
  induction fuel generalizing scope with
  | zero => simp [zero] at ran
  | succ fuel ih =>
    rw [step] at ran
    cases search : state.scopes.find? (·.id == scope) with
    | none => simp [search] at ran
    | some entry =>
      simp only [search, Option.bind_some] at ran
      split at ran
      · cases ran; exact find?_stands search
      · split at ran
        · simp at ran
        · obtain ⟨parent, _, recursed⟩ := Option.bind_eq_some_iff.mp ran
          exact ih recursed

/-- The owner `State.owner?` finds holds a variable set. -/
theorem owner?_holds {state : State} {scope found : ScopeOccurrenceId} {name : String}
    (ran : state.owner? scope name = some found) : ∃ variables ∈ state.variables, variables.scope = found := by
  obtain ⟨go, start, zero, step⟩ := owner?_go state name
  rw [start] at ran
  generalize scope.segments.length + 1 = fuel at ran
  induction fuel generalizing scope with
  | zero => simp [zero] at ran
  | succ fuel ih =>
    rw [step] at ran
    split at ran
    · rename_i declares
      cases search : state.variables.find? (·.scope == scope) with
      | none => simp [search] at declares
      | some variables =>
        cases ran
        exact ⟨variables, List.mem_of_find?_eq_some search, by simpa using List.find?_some search⟩
    · split at ran
      · simp at ran
      · obtain ⟨parent, _, recursed⟩ := Option.bind_eq_some_iff.mp ran
        exact ih recursed

/-- An instance root is the process root or a scope occurrence that stands. -/
theorem instanceRoot_stands (state : State) (scope : ScopeOccurrenceId) :
    state.instanceRoot scope = State.root ∨ ∃ entry ∈ state.scopes, entry.id = state.instanceRoot scope := by
  obtain ⟨go, start, zero, step⟩ := instanceRoot_go state
  rw [start]
  generalize scope.segments.length + 1 = fuel
  induction fuel generalizing scope with
  | zero => exact .inl (zero scope)
  | succ fuel ih =>
    rw [step]
    split
    · rename_i called
      right
      rw [calledRoot_eq] at called
      cases search : state.scopes.find? (·.id == scope) with
      | none => simp [search] at called
      | some entry => exact find?_stands search
    · cases (state.scopes.find? (·.id == scope)).bind (·.parent) with
      | none => exact .inl rfl
      | some parent => exact ih parent

/-! ## The scope tree the searches walk

What the searches need of `WellFormed`: a scope occurrence's record is the one a search by its identifier finds
(`Distinct`), and each lies below `State.root` (`Rooted`) at the depth its key's segments count (`Depth.length`), so the
characterization's fuel, one more than that, always reaches the end of the way. -/

section Tree

variable {program : Program} {s : State}

/-- With distinct scope identifiers, a search by a scope occurrence's identifier finds its own record. -/
theorem find?_record (distinct : (scopeIds s).Nodup) {entry : ScopeOccurrence} (member : entry ∈ s.scopes) :
    s.scopes.find? (·.id == entry.id) = some entry := by
  cases search : s.scopes.find? (·.id == entry.id) with
  | none => exact absurd (List.find?_eq_none.mp search entry member) (by simp)
  | some found =>
    exact congrArg some (nodup_map_eq (f := ScopeOccurrence.id) distinct (List.mem_of_find?_eq_some search) member
      (by simpa using List.find?_some search))

/-- The parent a search reads is the record's own. -/
theorem parent_found (distinct : (scopeIds s).Nodup) {entry : ScopeOccurrence} (member : entry ∈ s.scopes) :
    (s.scopes.find? (·.id == entry.id)).bind (·.parent) = entry.parent := by
  rw [find?_record distinct member]; rfl

/-- `State.calledRoot` decides `CalledRoot` when scope identifiers are distinct. -/
theorem calledRoot_iff (distinct : (scopeIds s).Nodup) (scope : ScopeOccurrenceId) :
    s.calledRoot scope = true ↔ CalledRoot s scope := by
  rw [calledRoot_eq]
  constructor
  · intro called
    cases search : s.scopes.find? (·.id == scope) with
    | none => simp [search] at called
    | some entry =>
      simp only [search, Option.bind_some] at called
      exact ⟨entry, List.mem_of_find?_eq_some search, by simpa using List.find?_some search, called⟩
  · rintro ⟨entry, member, rfl, called⟩
    rw [find?_record distinct member]; exact called

/-- The parent a search reads lies above the scope occurrence searched from. -/
theorem within_parent {current parent : ScopeOccurrenceId}
    (link : (s.scopes.find? (·.id == current)).bind (·.parent) = some parent) : Within s current parent := by
  obtain ⟨entry, search, linked⟩ := Option.bind_eq_some_iff.mp link
  have named : entry.id = current := by simpa using List.find?_some search
  rw [← named]
  exact .parent entry parent parent (List.mem_of_find?_eq_some search) linked (.refl _)

/-- A scope occurrence within another and distinct from it is a record whose parent lies within the other. -/
theorem Within.step {inner outer : ScopeOccurrenceId} (within : Within s inner outer) (other : inner ≠ outer) :
    ∃ entry ∈ s.scopes, entry.id = inner ∧ ∃ parent, entry.parent = some parent ∧ Within s parent outer := by
  cases within with
  | refl => exact absurd rfl other
  | parent child parent _ member link above => exact ⟨child, member, rfl, parent, link, above⟩

/-- What lies within a present scope occurrence is present. -/
theorem Within.present {inner outer : ScopeOccurrenceId} (within : Within s inner outer) (present : outer ∈ scopeIds s) :
    inner ∈ scopeIds s := by
  cases within with
  | refl => exact present
  | parent child _ _ member _ _ => exact List.mem_map.mpr ⟨child, member, rfl⟩

/-- Above a scope occurrence other than itself, a scope occurrence lies within its parent. -/
theorem Within.through (distinct : (scopeIds s).Nodup) {child : ScopeOccurrence} {parent outer : ScopeOccurrenceId}
    (member : child ∈ s.scopes) (link : child.parent = some parent) (within : Within s child.id outer)
    (other : child.id ≠ outer) : Within s parent outer := by
  obtain ⟨entry, entryMember, named, ⟨parent', link', above⟩⟩ := within.step other
  have := nodup_map_eq (f := ScopeOccurrence.id) distinct entryMember member named
  subst this
  rw [link] at link'
  obtain rfl := Option.some.inj link'
  exact above

/-- Two scope occurrences above one are one within the other: the way outward is a single chain. -/
theorem Within.comparable (distinct : (scopeIds s).Nodup) {scope first second : ScopeOccurrenceId}
    (one : Within s scope first) (two : Within s scope second) : Within s first second ∨ Within s second first := by
  induction one generalizing second with
  | refl => exact .inl two
  | parent child parent outer member link above ih =>
    by_cases same : child.id = second
    · rw [← same]; exact .inr (.parent child parent outer member link above)
    · exact ih (Within.through distinct member link two same)

/-- A scope occurrence's depth is the number of its key's segments: each step up drops one. -/
theorem Depth.length {scope : ScopeOccurrenceId} {n : Nat} (depth : Depth s scope n) : n = scope.segments.length := by
  induction depth with
  | root => rw [root_eq, ScopeOccurrenceId.ofSegments_segments]; rfl
  | child child parent n _ link _ ih =>
    obtain ⟨_, same⟩ := ScopeOccurrenceId.parent?_eq_some.mp (by simpa only [ScopeOccurrence.parent] using link)
    simp [same, ih]

/-- A present scope occurrence lies at a depth below one more than its key's segments. -/
theorem depth_of (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) :
    ∃ n, Depth s scope n ∧ n < scope.segments.length + 1 := by
  obtain ⟨entry, member, rfl⟩ := List.mem_map.mp present
  obtain ⟨n, depth⟩ := (formed.rooted.2.2 entry member).depth
  exact ⟨n, depth, by rw [depth.length]; omega⟩

/-- `State.root` lies within no other scope occurrence. -/
theorem root_within (formed : WellFormed program s) {outer : ScopeOccurrenceId} (within : Within s State.root outer) :
    State.root = outer :=
  Within.parentless (fun entry member named => (formed.rooted.2.1 entry member).mpr named) within

end Tree

/-! ## The process instance's root -/

section Instance

variable {program : Program} {s : State}

/-- The instance root is the process root or a scope occurrence that stands. -/
theorem InstanceRoot.present (formed : WellFormed program s) {scope root : ScopeOccurrenceId}
    (inInstance : InstanceRoot s scope root) : root ∈ scopeIds s := by
  rcases inInstance.2.1 with ⟨entry, member, named, _⟩ | rfl
  · exact named ▸ List.mem_map.mpr ⟨entry, member, rfl⟩
  · exact formed.rooted.1

private theorem InstanceRoot.settle (formed : WellFormed program s) {scope first second : ScopeOccurrenceId}
    (one : InstanceRoot s scope first) (two : InstanceRoot s scope second) (up : Within s first second) :
    first = second := by
  rcases one.2.1 with called | rfl
  · exact two.2.2 _ one.1 up called
  · exact root_within formed up

/-- A scope occurrence has at most one instance root. -/
theorem InstanceRoot.unique (formed : WellFormed program s) {scope first second : ScopeOccurrenceId}
    (one : InstanceRoot s scope first) (two : InstanceRoot s scope second) : first = second := by
  rcases Within.comparable formed.distinct.scopes one.1 two.1 with up | up
  · exact InstanceRoot.settle formed one two up
  · exact (InstanceRoot.settle formed two one up).symm

/-- A called root a scope occurrence lies within holds its instance root. -/
theorem InstanceRoot.within (formed : WellFormed program s) {scope root called : ScopeOccurrenceId}
    (inInstance : InstanceRoot s scope root) (inside : Within s scope called) (isCalled : CalledRoot s called) :
    Within s root called := by
  rcases Within.comparable formed.distinct.scopes inInstance.1 inside with up | up
  · exact up
  · rw [inInstance.2.2 called inside up isCalled]; exact .refl _

/-- `State.instanceRoot` finds the instance root of every present scope occurrence. -/
theorem instanceRoot_spec (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) :
    InstanceRoot s scope (s.instanceRoot scope) := by
  obtain ⟨go, start, _, step⟩ := instanceRoot_go s
  obtain ⟨n, depth, lt⟩ := depth_of formed present
  rw [start]
  suffices walk : ∀ fuel current n, Depth s current n → n < fuel → Within s scope current →
      (∀ nearer, Within s scope nearer → Within s nearer current → nearer ≠ current → ¬ CalledRoot s nearer) →
      InstanceRoot s scope (go fuel current) from
    walk _ scope n depth lt (.refl _) fun nearer down up other =>
      absurd (Within.antisymm formed present down up).symm other
  intro fuel
  induction fuel with
  | zero => intro _ _ _ lt; omega
  | succ fuel ih =>
    intro current n depth lt down below
    rw [step]
    by_cases called : s.calledRoot current = true
    · simp only [called, ↓reduceIte]
      exact ⟨down, .inl ((calledRoot_iff formed.distinct.scopes current).mp called), fun nearer inner outer isCalled =>
        Classical.byContradiction fun other => below nearer inner outer other isCalled⟩
    · simp only [Bool.not_eq_true] at called
      simp only [called, Bool.false_eq_true, ↓reduceIte]
      cases depth with
      | root =>
        obtain ⟨entry, member, named⟩ := List.mem_map.mp formed.rooted.1
        have parentless : (s.scopes.find? (·.id == State.root)).bind (·.parent) = none := by
          rw [← named, parent_found formed.distinct.scopes member, (formed.rooted.2.1 entry member).mpr named]
        rw [parentless]
        exact ⟨down, .inr rfl, fun nearer inner outer isCalled =>
          Classical.byContradiction fun other => below nearer inner outer other isCalled⟩
      | child child parent m member link parentDepth =>
        rw [parent_found formed.distinct.scopes member, link]
        refine ih parent m parentDepth (by omega) (down.trans (.parent child parent parent member link (.refl _)))
          fun nearer inner outer other isCalled => ?_
        by_cases same : nearer = child.id
        · subst same; simp [(calledRoot_iff formed.distinct.scopes _).mpr isCalled] at called
        · rcases Within.comparable formed.distinct.scopes inner down with up | up
          · exact below nearer inner up same isCalled
          · have := Within.through formed.distinct.scopes member link up (Ne.symm same)
            obtain ⟨entry, entryMember, named, _⟩ := outer.step other
            exact other (Within.antisymm formed (named ▸ List.mem_map.mpr ⟨entry, entryMember, rfl⟩) outer this)

end Instance

/-! ## What the searches find

`State.owner?` and `State.declaring?` share one step (`Searches`): stop at the first scope occurrence the search looks
for, else at a called root, else go to the parent. Within a well-formed state each finds exactly the nearest such scope
occurrence from `scope` outward within its process instance; `State.visible` reads only frames on that way. -/

section Searches

variable {program : Program} {s : State}

/-- The step `State.owner?` and `State.declaring?` share, for the scope occurrences `found` selects. -/
private def Searches (s : State) (found : ScopeOccurrenceId → Bool)
    (go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId) : Prop :=
  (∀ current, go 0 current = none) ∧ ∀ fuel current, go (fuel + 1) current =
    if found current then some current else if s.calledRoot current then none
    else ((s.scopes.find? (·.id == current)).bind (·.parent)).bind (go fuel)

private theorem search_sound (formed : WellFormed program s) {found : ScopeOccurrenceId → Bool}
    {go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId} (steps : Searches s found go) :
    ∀ fuel scope target, go fuel scope = some target → found target = true ∧ Within s scope target ∧
      ∀ nearer, Within s scope nearer → Within s nearer target → nearer ≠ target →
        found nearer = false ∧ s.calledRoot nearer = false := by
  intro fuel
  induction fuel with
  | zero => intro scope target ran; rw [steps.1] at ran; cases ran
  | succ fuel ih =>
    intro scope target ran
    rw [steps.2] at ran
    by_cases here : found scope = true
    · simp only [here, ↓reduceIte] at ran
      obtain rfl := Option.some.inj ran
      refine ⟨here, .refl _, fun nearer down up other => absurd ?_ other⟩
      obtain ⟨entry, member, named, _⟩ := down.step (Ne.symm other)
      exact (Within.antisymm formed (named ▸ List.mem_map.mpr ⟨entry, member, rfl⟩) down up).symm
    · simp only [Bool.not_eq_true] at here
      by_cases called : s.calledRoot scope = true
      · simp only [here, called, Bool.false_eq_true, ↓reduceIte] at ran; cases ran
      · simp only [Bool.not_eq_true] at called
        simp only [here, called, Bool.false_eq_true, ↓reduceIte] at ran
        cases link : (s.scopes.find? (·.id == scope)).bind (·.parent) with
        | none => rw [link] at ran; cases ran
        | some parent =>
          rw [link, Option.bind_some] at ran
          obtain ⟨hit, within, between⟩ := ih parent target ran
          refine ⟨hit, (within_parent link).trans within, fun nearer down above other => ?_⟩
          by_cases same : nearer = scope
          · subst same; exact ⟨here, called⟩
          · obtain ⟨entry, search, linked⟩ := Option.bind_eq_some_iff.mp link
            have named : entry.id = scope := by simpa using List.find?_some search
            subst named
            exact between nearer (Within.through formed.distinct.scopes (List.mem_of_find?_eq_some search) linked down
              (Ne.symm same)) above other

private theorem search_complete (formed : WellFormed program s) {found : ScopeOccurrenceId → Bool}
    {go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId} (steps : Searches s found go) {target : ScopeOccurrenceId}
    (hit : found target = true) {scope : ScopeOccurrenceId} (within : Within s scope target) :
    (∀ nearer, Within s scope nearer → Within s nearer target → nearer ≠ target →
      found nearer = false ∧ s.calledRoot nearer = false) →
    ∀ fuel n, Depth s scope n → n < fuel → go fuel scope = some target := by
  induction within with
  | refl =>
    intro _ fuel n _ lt
    obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by omega⟩
    rw [steps.2]; simp [hit]
  | parent child parent outer member link above ih =>
    intro between fuel n depth lt
    obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by omega⟩
    rw [steps.2]
    by_cases same : child.id = outer
    · subst same; simp [hit]
    · obtain ⟨skip, opened⟩ := between child.id (.refl _) (.parent child parent outer member link above) same
      simp only [skip, opened, Bool.false_eq_true, ↓reduceIte]
      rw [parent_found formed.distinct.scopes member, link, Option.bind_some]
      obtain ⟨m, rfl, parentDepth⟩ := Depth.parent formed member link depth
      exact ih hit (fun nearer down up other =>
        between nearer ((Within.parent child parent parent member link (.refl _)).trans down) up other)
        fuel m parentDepth (by omega)

/-- A search of that step finds exactly the nearest scope occurrence it looks for from `scope` outward, within the
instance rooted at `root`. -/
private theorem search_spec (formed : WellFormed program s) {found : ScopeOccurrenceId → Bool}
    {go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId} (steps : Searches s found go)
    {scope root : ScopeOccurrenceId} (inInstance : InstanceRoot s scope root) (target : ScopeOccurrenceId) :
    go (scope.segments.length + 1) scope = some target ↔ Within s scope target ∧ Within s target root ∧ found target = true ∧
      ∀ nearer, Within s scope nearer → Within s nearer target → found nearer = true → nearer = target := by
  constructor
  · intro ran
    obtain ⟨hit, within, between⟩ := search_sound formed steps _ scope target ran
    refine ⟨within, ?_, hit, fun nearer down up selected => Classical.byContradiction fun other => by
      simp [(between nearer down up other).1] at selected⟩
    rcases Within.comparable formed.distinct.scopes within inInstance.1 with up | up
    · exact up
    · by_cases same : root = target
      · rw [same]; exact .refl _
      · have opened := (between root inInstance.1 up same).2
        rcases inInstance.2.1 with called | isRoot
        · simp [(calledRoot_iff formed.distinct.scopes root).mpr called] at opened
        · subst isRoot; exact absurd (root_within formed up) same
  · rintro ⟨within, inside, hit, nearest⟩
    have present := (within.trans inside).present (inInstance.present formed)
    obtain ⟨n, depth, lt⟩ := depth_of formed present
    refine search_complete formed steps hit within (fun nearer down up other => ?_) _ n depth lt
    refine ⟨Bool.eq_false_iff.mpr fun selected => other (nearest nearer down up selected), ?_⟩
    rw [Bool.eq_false_iff]
    intro called
    have same := inInstance.2.2 nearer down (up.trans inside) ((calledRoot_iff formed.distinct.scopes nearer).mp called)
    subst same
    obtain ⟨entry, member, named, _⟩ := up.step other
    exact other (Within.antisymm formed (named ▸ List.mem_map.mpr ⟨entry, member, rfl⟩) up inside)

/-- `State.owner?` finds the nearest scope occurrence from `scope` outward, within its process instance, whose own
frame binds `name`. -/
theorem owner?_spec (formed : WellFormed program s) {scope root : ScopeOccurrenceId}
    (inInstance : InstanceRoot s scope root) (name : String) (owner : ScopeOccurrenceId) :
    s.owner? scope name = some owner ↔ Within s scope owner ∧ Within s owner root ∧
      (∃ frame ∈ s.variables, frame.scope = owner ∧ ∃ value, (name, value) ∈ frame.entries) ∧
      ∀ nearer, Within s scope nearer → Within s nearer owner →
        (∃ frame ∈ s.variables, frame.scope = nearer ∧ ∃ value, (name, value) ∈ frame.entries) → nearer = owner := by
  obtain ⟨go, start, zero, step⟩ := owner?_go s name
  have binds : ∀ current, ((s.variables.find? (·.scope == current)).map (·.entries.any (·.1 == name))).getD false =
      true ↔ ∃ frame ∈ s.variables, frame.scope = current ∧ ∃ value, (name, value) ∈ frame.entries := by
    intro current
    constructor
    · intro bound
      cases search : s.variables.find? (·.scope == current) with
      | none => simp [search] at bound
      | some frame =>
        simp only [search, Option.map_some, Option.getD_some, List.any_eq_true, beq_iff_eq] at bound
        obtain ⟨⟨named, value⟩, member, rfl⟩ := bound
        exact ⟨frame, List.mem_of_find?_eq_some search, by simpa using List.find?_some search, value, member⟩
    · rintro ⟨frame, member, rfl, ⟨value, bound⟩⟩
      cases search : s.variables.find? (·.scope == frame.scope) with
      | none => exact absurd (List.find?_eq_none.mp search frame member) (by simp)
      | some found =>
        have := nodup_map_eq (f := ScopeVariables.scope) formed.variables.scopes (List.mem_of_find?_eq_some search)
          member (by simpa using List.find?_some search)
        subst this
        simp only [Option.map_some, Option.getD_some, List.any_eq_true, beq_iff_eq]
        exact ⟨_, bound, rfl⟩
  rw [start, search_spec formed ⟨zero, step⟩ inInstance owner, binds]
  simp only [binds]

/-- `State.declaring?` finds the nearest occurrence of the Scope `element` from `scope` outward, within its process
instance. -/
theorem declaring?_spec (formed : WellFormed program s) {scope root : ScopeOccurrenceId}
    (inInstance : InstanceRoot s scope root) (element : ElementId) (target : ScopeOccurrenceId) :
    s.declaring? scope element = some target ↔ Within s scope target ∧ Within s target root ∧
      (∃ entry ∈ s.scopes, entry.id = target ∧ entry.element = some element) ∧
      ∀ nearer, Within s scope nearer → Within s nearer target →
        (∃ entry ∈ s.scopes, entry.id = nearer ∧ entry.element = some element) → nearer = target := by
  obtain ⟨go, start, zero, step⟩ := declaring?_go s element
  have occurs : ∀ current, (((s.scopes.find? (·.id == current)).bind (·.element)) == some element) = true ↔
      ∃ entry ∈ s.scopes, entry.id = current ∧ entry.element = some element := by
    intro current
    constructor
    · intro occurring
      cases search : s.scopes.find? (·.id == current) with
      | none => simp [search] at occurring
      | some entry =>
        simp only [search, Option.bind_some, beq_iff_eq] at occurring
        exact ⟨entry, List.mem_of_find?_eq_some search, by simpa using List.find?_some search, occurring⟩
    · rintro ⟨entry, member, rfl, occurring⟩
      rw [find?_record formed.distinct.scopes member]
      simp [occurring]
  rw [start, search_spec formed ⟨zero, step⟩ inInstance target, occurs]
  simp only [occurs]

/-- Every binding `State.visible` shows from `scope` is one its process instance's frames on the way outward holds
and shows. -/
theorem visible_spec (formed : WellFormed program s) {scope root : ScopeOccurrenceId}
    (inInstance : InstanceRoot s scope root) {reading : Program} {binding : String × Value}
    (seen : binding ∈ s.visible reading scope) :
    ∃ frame ∈ s.variables, Within s scope frame.scope ∧ Within s frame.scope root ∧ binding ∈ frame.entries ∧
      s.shows reading frame.scope binding.1 = true := by
  obtain ⟨go, start, ⟨zero, ended, step⟩⟩ := visible_go s reading
  have absent : ∀ fuel, go fuel none = [] := fun fuel => by cases fuel <;> simp [zero, ended]
  have onward : ∀ current, Within s current root → s.calledRoot current = false → ∀ parent,
      (s.scopes.find? (·.id == current)).bind (·.parent) = some parent → Within s parent root := by
    intro current within opened parent link
    obtain ⟨entry, search, linked⟩ := Option.bind_eq_some_iff.mp link
    have named : entry.id = current := by simpa using List.find?_some search
    subst named
    have member := List.mem_of_find?_eq_some search
    refine Within.through formed.distinct.scopes member linked within fun same => ?_
    rcases inInstance.2.1 with called | isRoot
    · rw [same, (calledRoot_iff formed.distinct.scopes root).mpr called] at opened; cases opened
    · simp [(formed.rooted.2.1 entry member).mpr (same.trans isRoot)] at linked
  rw [start] at seen
  suffices walk : ∀ fuel current, Within s scope current → Within s current root → binding ∈ go fuel (some current) →
      ∃ frame ∈ s.variables, Within s scope frame.scope ∧ Within s frame.scope root ∧ binding ∈ frame.entries ∧
        s.shows reading frame.scope binding.1 = true from
    walk _ scope (.refl _) inInstance.1 seen
  intro fuel
  induction fuel with
  | zero => intro current _ _ seen; rw [zero] at seen; cases seen
  | succ fuel ih =>
    intro current down up seen
    rw [step] at seen
    rcases List.mem_append.mp seen with own | further
    · cases search : s.variables.find? (·.scope == current) with
      | none => simp [search] at own
      | some frame =>
        simp only [search, Option.map_some, Option.getD_some, List.mem_filter] at own
        have named : frame.scope = current := by simpa using List.find?_some search
        subst named
        exact ⟨frame, List.mem_of_find?_eq_some search, down, up, own⟩
    · by_cases called : s.calledRoot current = true
      · simp [called] at further
      · simp only [Bool.not_eq_true] at called
        simp only [called, Bool.false_eq_true, ↓reduceIte] at further
        cases link : (s.scopes.find? (·.id == current)).bind (·.parent) with
        | none => rw [link, absent] at further; cases further
        | some parent =>
          rw [link] at further
          exact ih parent (down.trans (within_parent link)) (onward current up called parent link) further

/-- Entering a scope occurrence changes nothing a present scope occurrence sees: the new one lies below it. -/
theorem visible_enterScope (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (element : ElementId) (parent : ScopeOccurrenceId) (locals : List (String × Value)) (occurrence : Option OccurrenceId)
    (reading : Program) : (s.enterScope element parent locals occurrence).1.visible reading scope = s.visible reading scope := by
  obtain ⟨t, entered⟩ : ∃ t : State, (s.enterScope element parent locals occurrence).1 = t := ⟨_, rfl⟩
  rw [entered]
  have scopes : t.scopes = s.scopes ++
      [{ id := parent.child element (.fresh s.issuing s.issueNext), element := some element, occurrence }] := by
    rw [← entered, enterScope_eq]
  have variables : t.variables = s.variables ++
      [{ scope := parent.child element (.fresh s.issuing s.issueNext), entries := keyed locals }] := by
    rw [← entered, enterScope_eq]
  have record : ∀ entry ∈ s.scopes, t.scopes.find? (·.id == entry.id) = s.scopes.find? (·.id == entry.id) := by
    intro entry member
    rw [scopes, List.find?_append, find?_record formed.distinct.scopes member]; rfl
  have frame : ∀ entry ∈ s.scopes, t.variables.find? (·.scope == entry.id) = s.variables.find? (·.scope == entry.id) := by
    intro entry member
    rw [variables, List.find?_append]
    cases s.variables.find? (·.scope == entry.id) with
    | some _ => rfl
    | none =>
      have : parent.child element (.fresh s.issuing s.issueNext) ≠ entry.id := fun same =>
        entered_unissued parent element formed.issuer.next (same ▸ formed.issued.scopes entry member)
      simp [this]
  obtain ⟨later, laterStart, ⟨laterZero, laterEnded, laterStep⟩⟩ := visible_go t reading
  obtain ⟨earlier, earlierStart, ⟨earlierZero, earlierEnded, earlierStep⟩⟩ := visible_go s reading
  have laterAbsent : ∀ fuel, later fuel none = [] := fun fuel => by cases fuel <;> simp [laterZero, laterEnded]
  have earlierAbsent : ∀ fuel, earlier fuel none = [] := fun fuel => by
    cases fuel <;> simp [earlierZero, earlierEnded]
  have walk : ∀ current n, Depth s current n → ∀ first second, n < first → n < second →
      later first (some current) = earlier second (some current) := by
    intro current n depth
    induction depth with
    | root =>
      intro first second lt lt'
      obtain ⟨first, rfl⟩ : ∃ k, first = k + 1 := ⟨first - 1, by omega⟩
      obtain ⟨second, rfl⟩ : ∃ k, second = k + 1 := ⟨second - 1, by omega⟩
      obtain ⟨entry, member, named⟩ := List.mem_map.mp formed.rooted.1
      have parentless := (formed.rooted.2.1 entry member).mpr named
      rw [laterStep, earlierStep, ← named, calledRoot_eq, calledRoot_eq, record entry member, frame entry member]
      have shows : t.shows reading entry.id = s.shows reading entry.id := by
        funext name; rw [shows_eq, shows_eq, record entry member]
      rw [shows, find?_record formed.distinct.scopes member]
      simp [parentless, laterAbsent, earlierAbsent]
    | child child parent m member link _ ih =>
      intro first second lt lt'
      obtain ⟨first, rfl⟩ : ∃ k, first = k + 1 := ⟨first - 1, by omega⟩
      obtain ⟨second, rfl⟩ : ∃ k, second = k + 1 := ⟨second - 1, by omega⟩
      rw [laterStep, earlierStep, calledRoot_eq, calledRoot_eq, record child member, frame child member]
      have shows : t.shows reading child.id = s.shows reading child.id := by
        funext name; rw [shows_eq, shows_eq, record child member]
      rw [shows, find?_record formed.distinct.scopes member]
      simp only [Option.bind_some, link, ih first second (by omega) (by omega)]
  obtain ⟨n, depth, lt⟩ := depth_of formed present
  rw [laterStart, earlierStart]
  exact walk scope n depth _ _ lt lt

end Searches

/-! ## The identities of called instances

`State.calledInstanceId` spells each part of a called instance's identity after its length, so equal identities have
equal parts: each length is decimal digits ended by the first `:` after it, and each part's characters fill the UTF-8
bytes its length counts. -/

section Called

private theorem split_colon : ∀ {first second rest rest' : List Char}, ':' ∉ first → ':' ∉ second →
    first ++ ':' :: rest = second ++ ':' :: rest' → first = second ∧ rest = rest'
  | [], [], _, _, _, _, same => ⟨rfl, List.cons.inj same |>.2⟩
  | [], b :: _, _, _, _, apart, same => by
    obtain ⟨rfl, _⟩ := List.cons.inj same
    exact absurd (List.mem_cons_self ..) apart
  | a :: _, [], _, _, apart, _, same => by
    obtain ⟨rfl, _⟩ := List.cons.inj same
    exact absurd (List.mem_cons_self ..) apart
  | a :: first, b :: second, _, _, apart, apart', same => by
    obtain ⟨rfl, tail⟩ := List.cons.inj same
    obtain ⟨rfl, rfl⟩ := split_colon (fun inside => apart (List.mem_cons_of_mem _ inside))
      (fun inside => apart' (List.mem_cons_of_mem _ inside)) tail
    exact ⟨rfl, rfl⟩

private theorem split_sized : ∀ {first second rest rest' : List Char},
    (first.map Char.utf8Size).sum = (second.map Char.utf8Size).sum → first ++ rest = second ++ rest' →
      first = second ∧ rest = rest'
  | [], [], _, _, _, same => ⟨rfl, same⟩
  | [], b :: _, _, _, sized, _ => by simp at sized; have := Char.utf8Size_pos b; omega
  | a :: _, [], _, _, sized, _ => by simp at sized; have := Char.utf8Size_pos a; omega
  | a :: first, b :: second, _, _, sized, same => by
    obtain ⟨rfl, tail⟩ := List.cons.inj same
    simp only [List.map_cons, List.sum_cons] at sized
    obtain ⟨rfl, rfl⟩ := split_sized (by omega) tail
    exact ⟨rfl, rfl⟩

private theorem digits_colon (n : Nat) : ':' ∉ Nat.toDigits 10 n := fun inside => by
  have := Nat.isDigit_of_mem_toDigits (by decide +kernel) (by decide +kernel) inside
  simp at this

private theorem digits_inj {m n : Nat} (same : Nat.toDigits 10 m = Nat.toDigits 10 n) : m = n := by
  rw [← Nat.ofDigitChars_ten_toDigits (n := m), same, Nat.ofDigitChars_ten_toDigits]

/-- Equal called-instance identifiers name one caller instance, one Call and one activation. -/
theorem calledInstanceId_inj {caller caller' : String} {call call' : ElementId} {activation activation' : Nat}
    (same : State.calledInstanceId caller call activation = State.calledInstanceId caller' call' activation') :
    caller = caller' ∧ call = call' ∧ activation = activation' := by
  rw [calledInstanceId_eq, calledInstanceId_eq] at same
  have colon : (":" : String).toList = [':'] := by simp
  have spelled := congrArg String.toList same
  simp only [String.toList_append, toString, Nat.toList_repr, List.append_assoc, colon, List.singleton_append]
    at spelled
  replace spelled := List.append_cancel_left spelled
  obtain ⟨sized, spelled⟩ := split_colon (digits_colon _) (digits_colon _) spelled
  obtain ⟨named, spelled⟩ := split_sized (by rw [← Kernel.Laws.Data.utf8ByteSize_eq, ← Kernel.Laws.Data.utf8ByteSize_eq,
    digits_inj sized]) spelled
  obtain ⟨sized, spelled⟩ := split_colon (digits_colon _) (digits_colon _) (List.cons.inj spelled).2
  obtain ⟨called, spelled⟩ := split_sized (by rw [← Kernel.Laws.Data.utf8ByteSize_eq, ← Kernel.Laws.Data.utf8ByteSize_eq,
    digits_inj sized]) spelled
  exact ⟨String.toList_inj.mp named, by
    cases call; cases call'; exact congrArg ElementId.mk (String.toList_inj.mp called),
    digits_inj (List.cons.inj spelled).2⟩

/-- A called instance's identifier is longer than its caller's. -/
theorem calledInstanceId_longer (caller : String) (call : ElementId) (activation : Nat) :
    caller.length < (State.calledInstanceId caller call activation).length := by
  rw [calledInstanceId_eq, ← String.length_toList, ← String.length_toList]
  simp only [String.toList_append, List.length_append, toString]
  have : ("call:" : String).toList.length = 5 := by decide +kernel
  omega

end Called

end Kernel.Laws.State
