module

public import Kernel.IL.Types

/-! # The parts of a unit key

What a closure's unit key (DC4, `Kernel.State.Key`) is built from: the committed forms a root names a committed
identity by (`CommittedSegment`, `CommittedOccurrence`, DC12), the roots a unit chain starts at (`UnitRoot`) and the
steps down it (`UnitStep`), each with a lawful order a map key needs, and what a step adds to a spine's fingerprint
(`SpineStep`). Part of `Kernel.State`, below `Kernel.State.Key`, which re-exports it.
-/

public section

namespace Kernel

/-- A committed scope segment (DC12): an element and its committed ordinal, the form a unit root names a committed
scope occurrence by, innermost first. -/
structure CommittedSegment where
  element : ElementId
  ordinal : Nat
  deriving DecidableEq, Repr, Inhabited

instance : Ord CommittedSegment where
  compare := compareLex (compareOn (·.element.value)) (compareOn (·.ordinal))

/-- The orders a map key needs, proved inline beside the order, since an executable module holds no theorem
(guard 6). -/
instance : Std.TransOrd CommittedSegment := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd CommittedSegment where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun segment : CommittedSegment => segment.element.value)
        (compareOn fun segment : CommittedSegment => segment.ordinal) a b = .eq := h
    rw [compareLex_eq_eq] at h
    obtain ⟨⟨element⟩, ordinal⟩ := a
    obtain ⟨⟨element'⟩, ordinal'⟩ := b
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare h.1
    have ordinals : ordinal = ordinal' := Std.LawfulEqOrd.eq_of_compare h.2
    subst same ordinals
    rfl


/-- What a step adds to a `Spine`'s fingerprint. -/
class SpineStep (α : Type) where
  code : α → UInt64

/-- One step down a closure's unit chain (DC4, DC20): the `index`th signal or token the unit above queued, its index in
that unit's batch, so in-batch order is in the key and no order of entry is kept (DC2, DC10); or the idle check of the
scope occurrence, the `round`th offer of the parked occurrence, or the `ordinal`th finish of the Multi-Instance body
holding its instances in the scope occurrence (DC30), that the unit above issued as its `index`th issue (DC12). A unit
that names an identity issued in its own closure hangs below that identity's issuer rather than at a root naming it: an
issue names its unit, so a root naming a fresh identity would make the key types recursive. -/
inductive UnitStep where
  | signal (index : Nat)
  | token (index : Nat)
  | idle (index : Nat)
  | offer (index : Nat) (round : Nat)
  | finish (index : Nat) (ordinal : Nat)
  deriving DecidableEq, Repr

/-- A step's place in the order of steps: signals, tokens, idle checks, offers, then finishes, each by index, then round
or ordinal. -/
def UnitStep.stepRank : UnitStep → Nat × Nat × Nat
  | .signal index => (0, index, 0)
  | .token index => (1, index, 0)
  | .idle index => (2, index, 0)
  | .offer index round => (3, index, round)
  | .finish index ordinal => (4, index, ordinal)

instance : Ord UnitStep where
  compare := compareLex (compareOn (·.stepRank.1)) <|
    compareLex (compareOn (·.stepRank.2.1)) (compareOn (·.stepRank.2.2))

instance : Std.TransOrd UnitStep := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd UnitStep where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun step : UnitStep => step.stepRank.1)
        (compareLex (compareOn fun step : UnitStep => step.stepRank.2.1) (compareOn fun step : UnitStep => step.stepRank.2.2))
        a b = .eq := h
    rw [compareLex_eq_eq, compareLex_eq_eq] at h
    have tags : a.stepRank.1 = b.stepRank.1 := Std.LawfulEqOrd.eq_of_compare h.1
    have indexes : a.stepRank.2.1 = b.stepRank.2.1 := Std.LawfulEqOrd.eq_of_compare h.2.1
    have rounds : a.stepRank.2.2 = b.stepRank.2.2 := Std.LawfulEqOrd.eq_of_compare h.2.2
    cases a <;> cases b <;> simp_all [UnitStep.stepRank]

/-- A step's index in the batch, or among the issues, of the unit above. -/
def UnitStep.batchIndex (step : UnitStep) : Nat := step.stepRank.2.1

/-- The Cantor pairing of `index` and `round`: a bijection of pairs of naturals onto the naturals. -/
def cantorPair (index round : Nat) : Nat := (index + round) * (index + round + 1) / 2 + round

/-- A unit step's code: its kind's rank, below 5, beside the Cantor pair of its index and round, so distinct steps have
distinct codes (`Kernel.Laws.State.UnitStep.stepCode_inj`). -/
def UnitStep.stepCode (step : UnitStep) : Nat := 5 * cantorPair step.stepRank.2.1 step.stepRank.2.2 + step.stepRank.1

/-- A unit step's fingerprint code: its `stepCode`, which differs between distinct steps below 2^64. -/
instance : SpineStep UnitStep where
  code step := UInt64.ofNat step.stepCode

/-- A committed occurrence key's parts (DC12): its scope occurrence's committed path, innermost first, its element and
its ordinal, the form a unit root names a committed occurrence by. -/
structure CommittedOccurrence where
  scope : List CommittedSegment
  element : ElementId
  ordinal : Nat
  deriving DecidableEq, Repr

instance : Ord CommittedOccurrence where
  compare := compareLex (compareOn (·.scope)) <| compareLex (compareOn (·.element.value)) (compareOn (·.ordinal))

instance : Std.TransOrd CommittedOccurrence := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd CommittedOccurrence where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun key : CommittedOccurrence => key.scope)
        (compareLex (compareOn fun key : CommittedOccurrence => key.element.value)
          (compareOn fun key : CommittedOccurrence => key.ordinal)) a b = .eq := h
    rw [compareLex_eq_eq, compareLex_eq_eq] at h
    obtain ⟨scope, ⟨element⟩, ordinal⟩ := a
    obtain ⟨scope', ⟨element'⟩, ordinal'⟩ := b
    have scopes : scope = scope' := Std.LawfulEqOrd.eq_of_compare h.1
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare h.2.1
    have ordinals : ordinal = ordinal' := Std.LawfulEqOrd.eq_of_compare h.2.2
    subst scopes same ordinals
    rfl

/-- Where a closure's unit chain starts (DC4): the work queued before an input's own transition (a start's arming of the
root's Event Sub-Process starts), the input's own transition, the completion of an idle committed scope occurrence (the
process root's is the instance's completion), or a parked committed occurrence's join offered again, named by the
occurrence and the round, the number of times the closure offered that occurrence before: a join that consumes the
first arrival parked on a flow leaves the latest one parked, so one occurrence can be offered more than once in a
closure. A root names a committed identity in its committed form; the idle check or offer of an identity issued in the
closure is a step below its issuer (`UnitStep.idle`, `UnitStep.offer`). A structured root, never a tagged element
identifier, so no element can take a root's name (T56). The finish of a Multi-Instance body is its own group root
(DC30), named by the committed path of the scope occurrence that holds the body's instances, the body's element and the
number of finishes of that body the closure queued before it, so whichever instance's completion makes the body finish,
the finish runs under one key. -/
inductive UnitRoot where
  | seed
  | input
  | idle (scope : List CommittedSegment)
  | offer (occurrence : CommittedOccurrence) (round : Nat)
  | finish (scope : List CommittedSegment) (element : ElementId) (ordinal : Nat)
  deriving DecidableEq, Repr

/-- A root's place in the order of roots: the seed first, so its batch runs before the input's (`Step.settle`), then
the input, then idle completions, offers and finishes by their keys. -/
def UnitRoot.rootRank : UnitRoot → Nat
  | .seed => 0
  | .input => 1
  | .idle _ => 2
  | .offer _ _ => 3
  | .finish _ _ _ => 4

/-- The committed scope occurrence path an idle or a finish root names. -/
def UnitRoot.idleOf? : UnitRoot → Option (List CommittedSegment)
  | .idle scope => some scope
  | .finish scope _ _ => some scope
  | .seed | .input | .offer _ _ => none

def UnitRoot.offerOf? : UnitRoot → Option CommittedOccurrence
  | .offer occurrence _ => some occurrence
  | .seed | .input | .idle _ | .finish _ _ _ => none

/-- An offer root's round, a finish root's ordinal. -/
def UnitRoot.round : UnitRoot → Nat
  | .offer _ round => round
  | .finish _ _ ordinal => ordinal
  | .seed | .input | .idle _ => 0

/-- A finish root's element. -/
def UnitRoot.elementOf? : UnitRoot → Option String
  | .finish _ element _ => some element.value
  | .seed | .input | .idle _ | .offer _ _ => none

instance : Ord UnitRoot where
  compare := compareLex (compareOn (·.rootRank)) <| compareLex (compareOn (·.idleOf?)) <|
    compareLex (compareOn (·.offerOf?)) <| compareLex (compareOn (·.elementOf?)) (compareOn (·.round))

instance : Std.TransOrd UnitRoot := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd UnitRoot where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun root : UnitRoot => root.rootRank)
        (compareLex (compareOn fun root : UnitRoot => root.idleOf?)
          (compareLex (compareOn fun root : UnitRoot => root.offerOf?)
            (compareLex (compareOn fun root : UnitRoot => root.elementOf?) (compareOn fun root : UnitRoot => root.round))))
        a b = .eq := h
    rw [compareLex_eq_eq, compareLex_eq_eq, compareLex_eq_eq, compareLex_eq_eq] at h
    have ranks : a.rootRank = b.rootRank := Std.LawfulEqOrd.eq_of_compare h.1
    have scopes : a.idleOf? = b.idleOf? := Std.LawfulEqOrd.eq_of_compare h.2.1
    have occurrences : a.offerOf? = b.offerOf? := Std.LawfulEqOrd.eq_of_compare h.2.2.1
    have elements : a.elementOf? = b.elementOf? := Std.LawfulEqOrd.eq_of_compare h.2.2.2.1
    have rounds : a.round = b.round := Std.LawfulEqOrd.eq_of_compare h.2.2.2.2
    cases a <;> cases b <;>
      simp_all [UnitRoot.rootRank, UnitRoot.idleOf?, UnitRoot.offerOf?, UnitRoot.elementOf?, UnitRoot.round]
    rename_i element _ _ element' _ _
    cases element
    cases element'
    simp_all

end Kernel
