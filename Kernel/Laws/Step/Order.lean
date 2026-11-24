module

public import Kernel.Step.Order
public import Kernel.Laws.State.Key
import all Kernel.Step.Order

/-! # Laws of the step function: the closure's order

What `Kernel.Step.Order` does, read from its bodies: the run log records a unit at the next position and keeps every
other unit's (`runPosition_record`, `mem_record`, `size_record`), and each choice of a closure's next unit picks an entry of the map it scans and picks
one whenever the map has one (`firstBreadth_mem`, `earliest_mem`, `latest_mem` and their `none` forms), whatever order
the map lists its entries in. This is the one module that sees `Kernel.Step.Order`'s bodies; `Kernel.Laws.Step`
composes these facts with `Kernel.Step`'s bodies. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-! ## The run log -/

/-- A unit just recorded ran at the next position; every other unit the log recorded keeps its own. (An unrecorded one
reads the log's size, which recording grows.) -/
theorem runPosition_record (log : RunLog) (unit other : UnitKey) (logged : other = unit ∨ other ∈ log.positions) :
    (log.record unit).runPosition other = if other = unit then log.positions.size else log.runPosition other := by
  simp only [RunLog.record, RunLog.runPosition, Std.ExtTreeMap.get?_eq_getElem?, Std.ExtTreeMap.getElem?_insert]
  by_cases same : other = unit
  · subst same; simp
  · have : compare unit other ≠ .eq := fun eq => same (Std.LawfulEqOrd.eq_of_compare eq).symm
    have inside : other ∈ log.positions := logged.resolve_left same
    obtain ⟨n, found⟩ := Option.isSome_iff_exists.mp (Std.ExtTreeMap.mem_iff_isSome_getElem?.mp inside)
    simp [same, this, found]

/-- A run log records, after `record unit`, `unit` and the units it recorded before. -/
theorem mem_record {log : RunLog} {unit other : UnitKey} :
    other ∈ (log.record unit).positions ↔ other = unit ∨ other ∈ log.positions := by
  simp only [RunLog.record, Std.ExtTreeMap.mem_insert]
  constructor
  · rintro (same | inside)
    · exact .inl (Std.LawfulEqOrd.eq_of_compare same).symm
    · exact .inr inside
  · rintro (same | inside)
    · exact .inl (same ▸ Std.ReflCmp.compare_self)
    · exact .inr inside

/-- Recording a unit the log has not recorded adds one position. -/
theorem size_record {log : RunLog} {unit : UnitKey} (fresh : unit ∉ log.positions) :
    (log.record unit).positions.size = log.positions.size + 1 := by
  simp only [RunLog.record]
  rw [Std.ExtTreeMap.size_insert, ite_eq_right fun found => fresh (Std.ExtTreeMap.mem_iff_contains.mpr found)]

/-! ## The choice of the next unit -/

private theorem least_go {α : Type} (before : UnitKey → UnitKey → Bool) :
    ∀ (entries : List (UnitKey × α)) (init : Option (UnitKey × α)) (found : UnitKey × α),
      entries.foldl (leastStep before) init = some found → init = some found ∨ found ∈ entries
  | [], _, _, ran => .inl ran
  | entry :: rest, init, found, ran => by
    rcases least_go before rest _ found ran with first | later
    · cases init with
      | none => exact .inr (Option.some.inj first ▸ List.mem_cons_self ..)
      | some best =>
        simp only [leastStep] at first
        split at first
        · exact .inr (Option.some.inj first ▸ List.mem_cons_self ..)
        · exact .inl first
    · exact .inr (List.mem_cons_of_mem _ later)

/-- The least entry under any order is an entry. -/
theorem least_mem {α : Type} {before : UnitKey → UnitKey → Bool} {entries : List (UnitKey × α)} {found : UnitKey × α}
    (chosen : least before entries = some found) : found ∈ entries := by
  rcases least_go before entries none found chosen with absent | inside
  · cases absent
  · exact inside

private theorem least_some {α : Type} (before : UnitKey → UnitKey → Bool) :
    ∀ (entries : List (UnitKey × α)) (init : UnitKey × α), entries.foldl (leastStep before) (some init) ≠ none
  | [], _ => by simp
  | entry :: rest, init => by
    simp only [List.foldl_cons, leastStep]
    split
    · exact least_some before rest entry
    · exact least_some before rest init

/-- There is a least entry whenever there is an entry. -/
theorem least_eq_none {α : Type} {before : UnitKey → UnitKey → Bool} {entries : List (UnitKey × α)} :
    least before entries = none ↔ entries = [] := by
  unfold least
  cases entries with
  | nil => simp
  | cons entry rest => simpa [leastStep] using least_some before rest entry

private theorem least_min_go {α : Type} {before : UnitKey → UnitKey → Bool}
    (trans : ∀ a b c, before a b = true → before b c = true → before a c = true)
    (total : ∀ a b, a ≠ b → before a b = true ∨ before b a = true) :
    ∀ (rest done : List (UnitKey × α)) (init : Option (UnitKey × α)),
      (∀ best, init = some best → ∀ entry ∈ done, entry.1 ≠ best.1 → before best.1 entry.1 = true) →
      (init = none → done = []) → ∀ found, rest.foldl (leastStep before) init = some found →
      ∀ entry ∈ done ++ rest, entry.1 ≠ found.1 → before found.1 entry.1 = true
  | [], done, init, least, _, found, ran, entry, inside, apart => by
    simp only [List.foldl_nil, List.append_nil] at ran inside
    exact least found ran entry inside apart
  | next :: rest, done, init, least, empty, found, ran, entry, inside, apart => by
    refine least_min_go trans total rest (done ++ [next]) (leastStep before init next) ?_ ?_ found ran entry
      (by simpa using inside) apart
    · intro best chosen other member differs
      rcases List.mem_append.mp member with old | new
      · cases init with
        | none => simp [empty rfl] at old
        | some prior =>
          simp only [leastStep] at chosen
          split at chosen
          · next first =>
            cases chosen
            by_cases same : other.1 = prior.1
            · rw [same]; exact first
            · exact trans _ _ _ first (least prior rfl other old same)
          · cases chosen; exact least _ rfl other old differs
      · obtain rfl := List.mem_singleton.mp new
        cases init with
        | none => cases chosen; exact absurd rfl differs
        | some prior =>
          simp only [leastStep] at chosen
          split at chosen
          · cases chosen; exact absurd rfl differs
          · next later =>
            cases chosen
            exact (total _ _ (Ne.symm differs)).resolve_right (by simpa using later)
    · intro none
      cases init with
      | none => cases none
      | some prior =>
        simp only [leastStep] at none
        split at none <;> cases none

/-- The least entry under a strict total order comes before every other entry. -/
theorem least_min {α : Type} {before : UnitKey → UnitKey → Bool}
    (trans : ∀ a b c, before a b = true → before b c = true → before a c = true)
    (total : ∀ a b, a ≠ b → before a b = true ∨ before b a = true) {entries : List (UnitKey × α)}
    {found : UnitKey × α} (chosen : least before entries = some found) :
    ∀ entry ∈ entries, entry.1 ≠ found.1 → before found.1 entry.1 = true :=
  least_min_go trans total entries [] none (fun _ none => by cases none) (fun _ => rfl) found chosen

theorem mem_of_toList {α : Type} {map : TreeMap UnitKey α compare} {unit : UnitKey} {value : α}
    (inside : (unit, value) ∈ map.toList) : map[unit]? = some value :=
  Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside

/-- The signal the closure runs next is a queued one, and there is one whenever a signal is queued. -/
theorem firstBreadth_mem {queued : TreeMap UnitKey Signal compare} {unit : UnitKey} {signal : Signal}
    (next : firstBreadth queued = some (unit, signal)) : queued[unit]? = some signal :=
  mem_of_toList (least_mem next)

theorem firstBreadth_eq_none {queued : TreeMap UnitKey Signal compare} :
    firstBreadth queued = none ↔ queued.toList = [] := least_eq_none

/-- The token the closure moves next is a queued one, under either schedule. -/
theorem earliest_mem {log : RunLog} {queued : TreeMap UnitKey Token compare} {unit : UnitKey} {token : Token}
    (next : earliest log queued = some (unit, token)) : queued[unit]? = some token :=
  mem_of_toList (least_mem next)

theorem latest_mem {log : RunLog} {queued : TreeMap UnitKey Token compare} {unit : UnitKey} {token : Token}
    (next : latest log queued = some (unit, token)) : queued[unit]? = some token :=
  mem_of_toList (least_mem next)

/-- The signal the closure runs next comes before every other queued signal in breadth-first order. -/
theorem firstBreadth_least {queued : TreeMap UnitKey Signal compare} {unit other : UnitKey} {signal signal' : Signal}
    (next : firstBreadth queued = some (unit, signal)) (inside : queued[other]? = some signal') (apart : other ≠ unit) :
    UnitKey.breadth.val unit other = .lt := by
  have := least_min (before := fun a b => UnitKey.breadth.val a b == .lt)
    (fun _ _ _ one two => by simp only [beq_iff_eq] at one two ⊢; exact Laws.State.UnitKey.breadth_lt_trans one two)
    (fun _ _ apart => by simpa using Laws.State.UnitKey.breadth_total apart) next (other, signal')
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr inside) apart
  simpa using this

/-- Token order is a strict total order: by run position, then batch index, then the key. -/
theorem tokenBefore_trans (log : RunLog) (a b c : UnitKey) (one : tokenBefore log a b = true)
    (two : tokenBefore log b c = true) : tokenBefore log a c = true := by
  unfold tokenBefore at *
  have keys : compare a b = .lt → compare b c = .lt → compare a c = .lt := Std.TransCmp.lt_trans
  revert one two keys
  generalize queuedKey log a = ka
  generalize queuedKey log b = kb
  generalize queuedKey log c = kc
  obtain ⟨pa, ia⟩ := ka
  obtain ⟨pb, ib⟩ := kb
  obtain ⟨pc, ic⟩ := kc
  simp only [Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq]
  intro one two keys
  rcases one with h1 | ⟨e1, h1 | ⟨e1', c1⟩⟩ <;> rcases two with h2 | ⟨e2, h2 | ⟨e2', c2⟩⟩ <;>
    first
    | exact .inl (by omega)
    | exact .inr ⟨by omega, .inl (by omega)⟩
    | exact .inr ⟨by omega, .inr ⟨by omega, keys c1 c2⟩⟩

theorem tokenBefore_total (log : RunLog) (a b : UnitKey) (apart : a ≠ b) :
    tokenBefore log a b = true ∨ tokenBefore log b a = true := by
  unfold tokenBefore
  have keys : compare a b = .lt ∨ compare b a = .lt := by
    cases order : compare a b with
    | lt => exact .inl rfl
    | eq => exact absurd (Std.LawfulEqOrd.eq_of_compare order) apart
    | gt => exact .inr (Std.OrientedCmp.gt_iff_lt.mp order)
  revert keys
  generalize queuedKey log a = ka
  generalize queuedKey log b = kb
  obtain ⟨pa, ia⟩ := ka
  obtain ⟨pb, ib⟩ := kb
  simp only [Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq]
  intro keys
  rcases Nat.lt_trichotomy pa pb with h | h | h <;> rcases Nat.lt_trichotomy ia ib with g | g | g <;>
    rcases keys with k | k <;>
    first
    | exact .inl (.inl h)
    | exact .inr (.inl h)
    | exact .inl (.inr ⟨h, .inl g⟩)
    | exact .inr (.inr ⟨h.symm, .inl g⟩)
    | exact .inl (.inr ⟨h, .inr ⟨g, k⟩⟩)
    | exact .inr (.inr ⟨h.symm, .inr ⟨g.symm, k⟩⟩)

/-- The token the closure moves last-queued-first comes after every other queued token in token order. -/
theorem latest_greatest {log : RunLog} {queued : TreeMap UnitKey Token compare} {unit other : UnitKey} {token token' : Token}
    (next : latest log queued = some (unit, token)) (inside : queued[other]? = some token') (apart : other ≠ unit) :
    tokenBefore log other unit = true :=
  least_min (before := fun a b => tokenBefore log b a)
    (fun a b c one two => tokenBefore_trans log c b a two one)
    (fun a b apart => (tokenBefore_total log a b apart).symm) next (other, token')
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr inside) apart

/-- A queued entry's place in token order is the position its parent ran at and its index in that unit's batch. -/
theorem queuedKey_push (log : RunLog) (unit : UnitKey) (step : UnitStep) :
    queuedKey log (unit.push step) = (log.runPosition unit, step.batchIndex) := by
  unfold queuedKey
  rw [Laws.State.UnitKey.parent?_push]
  rfl

/-- Two tokens one unit queued run, in token order, by their indexes in its batch. -/
theorem tokenBefore_siblings {log : RunLog} {unit : UnitKey} {a b : Nat}
    (before : tokenBefore log (unit.tokenUnit a) (unit.tokenUnit b) = true) (apart : a ≠ b) : a < b := by
  simp only [tokenBefore, queuedKey_push, Laws.State.UnitKey.batchIndex_token, Nat.lt_irrefl, decide_false,
    Bool.false_or, beq_self_eq_true, Bool.true_and, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true,
    beq_iff_eq] at before
  omega

theorem earliest_eq_none {log : RunLog} {queued : TreeMap UnitKey Token compare} :
    earliest log queued = none ↔ queued.toList = [] := least_eq_none

theorem latest_eq_none {log : RunLog} {queued : TreeMap UnitKey Token compare} :
    latest log queued = none ↔ queued.toList = [] := least_eq_none

/-- A closure unit's context differs from the closure's only in its order of units (DC13). -/
@[simp] theorem unitCtx_program (ctx : Ctx) (log : RunLog) : (unitCtx ctx log).program = ctx.program :=
  rfl

/-- The closure's order of units is a total order under either schedule (DC13): the sort `Step.issueOrder` makes is a
total preorder of positions. -/
instance issuerOrder_transCmp (schedule : BranchSchedule) (log : RunLog) : Std.TransCmp (issuerOrder schedule log) := by
  cases schedule with
  | orderInvariant =>
    show Std.TransCmp UnitKey.breadth.val
    rw [UnitKey.breadth.property]
    exact inferInstanceAs <| Std.TransCmp (compareLex _ _)
  | declarationDepthFirst =>
    show Std.TransCmp (compareLex (compareOn fun unit => (orderKey log unit 0).1) compare)
    exact inferInstanceAs <| Std.TransCmp (compareLex _ _)

/-- The closure's order of units ties only equal keys under either schedule. -/
theorem issuerOrder_tied (schedule : BranchSchedule) (log : RunLog) (a b : UnitKey)
    (tie : issuerOrder schedule log a b = .eq) : a = b := by
  cases schedule with
  | orderInvariant => exact Laws.State.breadth_tied tie
  | declarationDepthFirst =>
    simp only [issuerOrder] at tie
    exact Std.LawfulEqOrd.eq_of_compare (compareLex_eq_eq.mp tie).2

/-- The batch signals `Step.conclude` keys under a root of their own rather than under its unit (`State.queueBatch`'s
`grouped`) are completions only: a Multi-Instance body's finish (DC30). -/
@[expose] def GroupsCompletions (state : State) (grouped : Nat → Option UnitKey) : Prop :=
  ∀ index key, grouped index = some key → ∃ occurrence leave writes rule,
    state.batchSignals[index]? = some (.complete occurrence leave writes rule)

/-- Keying every batch signal under its unit groups none. -/
theorem groupsCompletions_none (state : State) : GroupsCompletions state fun _ => none :=
  fun _ _ grouped => by cases grouped

/-- A begin in the batch keys under its unit (`GroupsCompletions`). -/
theorem GroupsCompletions.begin {state : State} {grouped : Nat → Option UnitKey} (groups : GroupsCompletions state grouped)
    {index : Nat} {request : BeginRequest} (found : state.batchSignals[index]? = some (.begin request)) :
    grouped index = none := by
  cases keyed : grouped index with
  | none => rfl
  | some key =>
    have completes := groups index key keyed
    simp [found] at completes

end Kernel.Laws.Step
