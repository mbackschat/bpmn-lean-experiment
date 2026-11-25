module

public import Kernel.State.Key

/-! # Committed key forms and in-closure issue slots

What the closure in progress issues (DC12) reads of a key: its committed form (`ScopeOccurrenceId.committedScope`), whether
it names an issue of the closure in progress (`fresh`), the unit keys of the idle check and the offer it owns
(`UnitKey.idleUnit?`, `UnitKey.offerUnit?`, `UnitKey.finishUnit?`, `UnitKey.readyUnit?`), and the slot an issue takes its committed ordinal in at commit
(`ClaimSlot`), the issue table's value (`State.issued`). Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- A scope occurrence key's committed path, `none` when a segment was issued in the closure in progress. -/
def ScopeOccurrenceId.committedScope (scope : ScopeOccurrenceId) : Option (List CommittedSegment) :=
  scope.segments.mapM (·.committed?)

/-- Whether the scope occurrence was entered in the closure in progress: its innermost segment is fresh, since a scope
occurrence entered in a closure is entered in one that stands, so a committed segment has only committed ones above it. -/
def ScopeOccurrenceId.fresh (scope : ScopeOccurrenceId) : Bool :=
  match scope.segments with
  | [] => false
  | segment :: _ => segment.ordinal.isFresh

/-- Whether the occurrence key names an issue of the closure in progress: its own or its scope occurrence's. -/
def OccurrenceId.fresh (id : OccurrenceId) : Bool := id.ordinal.isFresh || id.scope.fresh

/-- The unit key of the idle check of `scope` (DC12): a root naming it when it is committed, a step below the unit that
issued it when it was issued in the closure; `none` for a committed segment above a fresh one, which no issue makes. -/
def UnitKey.idleUnit? (scope : ScopeOccurrenceId) : Option UnitKey :=
  match scope.segments with
  | [] => some (.ofRoot (.idle []))
  | segment :: _ =>
    match segment.ordinal with
    | .fresh unit index => some (unit.push (.idle index))
    | .committed _ => scope.committedScope.map fun path => .ofRoot (.idle path)

/-- The unit key of the `round`th offer of the parked occurrence `occurrence` (DC12), as `idleUnit?` keys an idle
check. -/
def UnitKey.offerUnit? (occurrence : OccurrenceId) (round : Nat) : Option UnitKey :=
  match occurrence.ordinal with
  | .fresh unit index => some (unit.push (.offer index round))
  | .committed ordinal =>
    occurrence.scope.committedScope.map fun scope => .ofRoot (.offer { scope, element := occurrence.element, ordinal } round)

/-- Whether `key` is an offer of the parked occurrence `occurrence`, of any round (`offerUnit?`). -/
def UnitKey.offers (occurrence : OccurrenceId) (key : UnitKey) : Bool :=
  match occurrence.ordinal, key.parent? with
  | .fresh unit index, some (parent, .offer offered _) => offered == index && parent == unit
  | .fresh _ _, _ => false
  | .committed ordinal, _ => key.path.isEmpty && occurrence.scope.committedScope.any fun scope =>
      key.root.offerOf? == some { scope, element := occurrence.element, ordinal }

/-- The unit key of the `ordinal`th finish of the Multi-Instance body of `element` whose instances the scope occurrence
`scope` holds (DC30), as `idleUnit?` keys an idle check: a root naming it when it is committed, a step below the unit
that issued it when it was issued in the closure; `none` for the process root, which holds no body's instances, and for
a committed segment above a fresh one. -/
def UnitKey.finishUnit? (scope : ScopeOccurrenceId) (element : ElementId) (ordinal : Nat) : Option UnitKey :=
  match scope.segments with
  | [] => none
  | segment :: _ =>
    match segment.ordinal with
    | .fresh unit index => some (unit.push (.finish index ordinal))
    | .committed _ => scope.committedScope.map fun path => .ofRoot (.finish path element ordinal)

/-- The unit key of the `ordinal`th readiness of a compensation run in the scope occurrence `scope` whose trigger's
occurrence is `trigger`, none for a group's nested run (DC30, `CompensationRun.anchor?`): a root naming both when they
are committed; a step below the unit that issued the trigger's occurrence when that was issued in the closure, and for a
nested run below the unit that issued its scope occurrence, whose run it is alone; `none` for the process root without a
trigger and for a committed segment above a fresh one. -/
def UnitKey.readyUnit? (scope : ScopeOccurrenceId) (trigger : Option OccurrenceId) (ordinal : Nat) : Option UnitKey :=
  match trigger with
  | some occurrence =>
    match occurrence.ordinal with
    | .fresh unit index => some (unit.push (.ready index ordinal))
    | .committed committed => do
      let path ← scope.committedScope
      let at_ ← occurrence.scope.committedScope
      some (.ofRoot (.ready path (some { scope := at_, element := occurrence.element, ordinal := committed }) ordinal))
  | none =>
    match scope.segments with
    | [] => none
    | segment :: _ =>
      match segment.ordinal with
      | .fresh unit index => some (unit.push (.ready index ordinal))
      | .committed _ => scope.committedScope.map fun path => .ofRoot (.ready path none ordinal)

/-- What an activation counter counts (R8): the activations of `element` under `role` in the process instance
`processInstance`, whose name is pending when a Call of the closure in progress entered it. -/
structure ActivationSlot where
  processInstance : InstanceName
  element : ElementId
  role : ActivationRole
  deriving DecidableEq, Repr

/-- The roles' order, which an activation slot compares them in. -/
def ActivationRole.slotRank : ActivationRole → Nat
  | .element => 0
  | .multiInstanceBody => 1

instance : Ord ActivationSlot where
  compare := compareLex (compareOn (·.processInstance)) <| compareLex (compareOn (·.element.value)) (compareOn (·.role.slotRank))

instance : Std.TransOrd ActivationSlot := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd ActivationSlot where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun slot : ActivationSlot => slot.processInstance)
        (compareLex (compareOn fun slot : ActivationSlot => slot.element.value) (compareOn fun slot : ActivationSlot => slot.role.slotRank))
        a b = .eq := h
    rw [compareLex_eq_eq, compareLex_eq_eq] at h
    obtain ⟨inst, ⟨element⟩, role⟩ := a
    obtain ⟨inst', ⟨element'⟩, role'⟩ := b
    have instances : inst = inst' := Std.LawfulEqOrd.eq_of_compare h.1
    have elements : element = element' := Std.LawfulEqOrd.eq_of_compare h.2.1
    have ranks : role.slotRank = role'.slotRank := Std.LawfulEqOrd.eq_of_compare h.2.2
    subst instances elements
    cases role <;> cases role' <;> simp_all [ActivationRole.slotRank]

/-- The slot a fresh issue takes its committed ordinal in at commit (DC12), one constructor per counter map, so the
commit's assignment keys exactly what each counter compares (P07 F3): a scope occurrence's (parent, element)
(`State.scopeOrdinals`), an occurrence's (scope occurrence, element) (`State.occurrenceOrdinals`), an item's occurrence
(`State.itemOrdinals`), and an order position's one slot (`State.nextOrder`, DC13), which has no owner; an occurrence's
issue counts on it too, for the order position it is (DC25, `Step.assignStep`). -/
inductive ClaimSlot where
  | scope (slot : ScopeSlot)
  | occurrence (slot : ScopeSlot)
  | item (occurrence : OccurrenceId)
  | position
  /-- An activation: numbered at commit on its counter (`State.activationCount`), as an ordinal is on its slot's. -/
  | activation (slot : ActivationSlot)
  deriving DecidableEq, Repr

namespace ClaimSlot

/-- The counter map a slot counts in. -/
def claimRank : ClaimSlot → Nat
  | .scope _ => 0
  | .occurrence _ => 1
  | .item _ => 2
  | .position => 3
  | .activation _ => 4

def scopeSlot? : ClaimSlot → Option ScopeSlot
  | .scope slot => some slot
  | .occurrence slot => some slot
  | .item _ => none
  | .position => none
  | .activation _ => none

def claimItem : ClaimSlot → Option OccurrenceId
  | .item owner => some owner
  | .scope _ => none
  | .occurrence _ => none
  | .position => none
  | .activation _ => none

def claimActivation : ClaimSlot → Option ActivationSlot
  | .activation slot => some slot
  | .scope _ | .occurrence _ | .item _ | .position => none

end ClaimSlot

/-- The commit's assignment keys its counters by slot. -/
instance : Ord ClaimSlot where
  compare := compareLex (compareOn ClaimSlot.claimRank) <| compareLex (compareOn ClaimSlot.scopeSlot?) <|
    compareLex (compareOn ClaimSlot.claimItem) (compareOn ClaimSlot.claimActivation)

instance : Std.TransOrd ClaimSlot := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd ClaimSlot where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn ClaimSlot.claimRank) (compareLex (compareOn ClaimSlot.scopeSlot?)
      (compareLex (compareOn ClaimSlot.claimItem) (compareOn ClaimSlot.claimActivation))) a b = .eq := h
    rw [compareLex_eq_eq, compareLex_eq_eq, compareLex_eq_eq] at h
    have ranks : a.claimRank = b.claimRank := Std.LawfulEqOrd.eq_of_compare h.1
    have slots : a.scopeSlot? = b.scopeSlot? := Std.LawfulEqOrd.eq_of_compare h.2.1
    have items : a.claimItem = b.claimItem := Std.LawfulEqOrd.eq_of_compare h.2.2.1
    have activations : a.claimActivation = b.claimActivation := Std.LawfulEqOrd.eq_of_compare h.2.2.2
    cases a <;> cases b <;> simp_all [ClaimSlot.claimRank, ClaimSlot.scopeSlot?, ClaimSlot.claimItem, ClaimSlot.claimActivation]

/-- Whether the order position `a` comes no later than `b` (DC13): a committed position by its number, before every pending
one, which the closure in progress issued; two pending positions by their units under `units`, then by their index in the
unit. `units` is the closure's order of units, which `unitCtx` chooses by the branch schedule, so every site that
orders positions reads that one choice. -/
def Issue.notAfter (units : UnitKey → UnitKey → Ordering) : Issue → Issue → Bool
  | .committed a, .committed b => a ≤ b
  | .committed _, .fresh _ _ => true
  | .fresh _ _, .committed _ => false
  | .fresh unit index, .fresh other index' =>
    match units unit other with
    | .lt => true
    | .gt => false
    | .eq => index ≤ index'

end Kernel
