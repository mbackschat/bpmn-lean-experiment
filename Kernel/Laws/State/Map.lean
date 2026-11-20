module

public import Kernel.State

/-! # Laws of the kernel state: the closure's keyed queues

What the closure's unit-keyed families (DC4) hold, read as membership: the queued signals and tokens of a state are
the values of its keyed queues and the running micro-step's batch (`allSignals`, `allQueuedTokens`), and moving a
batch under a unit key (`State.queueBatch`), taking an entry off a queue and inserting a fresh key change them only as
sets. Nothing here reads a map's iteration order (KD7): every fact is a lookup or membership. Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- Every queued signal: the closure's queued signals, keyed by unit, then the running micro-step's batch. A membership
view, read only as a set: its order is the map's key order, which is no order of entry. -/
def allSignals (s : State) : List Signal := s.queuedSignals.toList.map (·.2) ++ s.signals

/-- Every queued token, the closure's keyed ones then the running micro-step's batch: `State.allTokens` as a law reads
it (`Laws.State.allTokens_eq`), a membership view like `allSignals`. -/
def allQueuedTokens (s : State) : List Token := s.queuedTokens.toList.map (·.2) ++ s.tokens

variable {β : Type}

/-- A value of a unit-keyed map's entries is the value under some key. -/
theorem mem_values {m : TreeMap UnitKey β compare} {value : β} :
    value ∈ m.toList.map (·.2) ↔ ∃ unit : UnitKey, m[unit]? = some value := by
  simp only [List.mem_map]
  constructor
  · rintro ⟨⟨unit, value'⟩, inside, rfl⟩
    exact ⟨unit, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside⟩
  · rintro ⟨unit, found⟩
    exact ⟨(unit, value), Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr found, rfl⟩

@[simp] theorem toList_empty : (∅ : TreeMap UnitKey β compare).toList = [] := by simp

theorem values_empty : (∅ : TreeMap UnitKey β compare).toList.map (·.2) = [] := by simp

/-- Inserting under a key adds the value and keeps every value under another key. -/
theorem mem_values_insert {m : TreeMap UnitKey β compare} {unit : UnitKey} {value other : β} :
    other ∈ (m.insert unit value).toList.map (·.2) → other = value ∨ other ∈ m.toList.map (·.2) := by
  rw [mem_values, mem_values]
  rintro ⟨key, found⟩
  rw [Std.ExtTreeMap.getElem?_insert] at found
  split at found
  · exact .inl (Option.some.inj found).symm
  · exact .inr ⟨key, found⟩

theorem mem_values_insert_self {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} :
    value ∈ (m.insert unit value).toList.map (·.2) :=
  mem_values.mpr ⟨unit, by simp⟩

theorem mem_values_insert_of {m : TreeMap UnitKey β compare} {unit : UnitKey} {value other : β}
    (fresh : m[unit]? = none) (inside : other ∈ m.toList.map (·.2)) : other ∈ (m.insert unit value).toList.map (·.2) := by
  obtain ⟨key, found⟩ := mem_values.mp inside
  refine mem_values.mpr ⟨key, ?_⟩
  rw [Std.ExtTreeMap.getElem?_insert]
  split
  · next same => rw [Std.LawfulEqOrd.eq_of_compare same] at fresh; simp [fresh] at found
  · exact found

/-- Erasing a key keeps only values under other keys. -/
theorem mem_values_erase {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} :
    value ∈ (m.erase unit).toList.map (·.2) → value ∈ m.toList.map (·.2) := by
  rw [mem_values, mem_values]
  rintro ⟨key, found⟩
  rw [Std.ExtTreeMap.getElem?_erase] at found
  split at found
  · simp at found
  · exact ⟨key, found⟩

/-- An entry left after erasing a key was there, under another key. -/
theorem getElem?_of_erase {m : TreeMap UnitKey β compare} {unit key : UnitKey} {value : β}
    (found : (m.erase unit)[key]? = some value) : m[key]? = some value ∧ key ≠ unit := by
  rw [Std.ExtTreeMap.getElem?_erase] at found
  split at found
  · simp at found
  · next other => exact ⟨found, fun same => other (same ▸ Std.ReflCmp.compare_self)⟩

/-- A unit-keyed map lists each entry once. -/
theorem toList_nodup (m : TreeMap UnitKey β compare) : m.toList.Nodup :=
  Std.ExtTreeMap.distinct_keys_toList.imp fun distinct same => distinct (by rw [same]; exact Std.ReflCmp.compare_self)

/-- Inserting under a fresh key lists the new entry beside the old ones, in some order. -/
theorem toList_insert_perm {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} (fresh : m[unit]? = none) :
    (m.insert unit value).toList.Perm ((unit, value) :: m.toList) := by
  refine (List.perm_ext_iff_of_nodup (toList_nodup _) (List.nodup_cons.mpr ⟨fun inside => ?_, toList_nodup m⟩)).mpr ?_
  · simp [Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside] at fresh
  · intro ⟨key, entry⟩
    simp only [List.mem_cons, Prod.mk.injEq, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some,
      Std.ExtTreeMap.getElem?_insert]
    split
    · next same =>
      have := Std.LawfulEqOrd.eq_of_compare same
      subst this
      simp only [Option.some.injEq, true_and]
      refine ⟨fun h => .inl h.symm, fun h => ?_⟩
      rcases h with h | h
      · exact h.symm
      · simp [fresh] at h
    · next other =>
      have : key ≠ unit := fun same => other (by rw [same]; exact Std.ReflCmp.compare_self)
      simp [this]

/-- Inserting under a fresh key adds its value to the values, in some order. -/
theorem values_insert_perm {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} (fresh : m[unit]? = none) :
    ((m.insert unit value).toList.map (·.2)).Perm (value :: m.toList.map (·.2)) :=
  (toList_insert_perm fresh).map (·.2)

/-- Erasing a key takes its entry out of the list, in some order. -/
theorem toList_erase_perm {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} (found : m[unit]? = some value) :
    m.toList.Perm ((unit, value) :: (m.erase unit).toList) := by
  refine (List.perm_ext_iff_of_nodup (toList_nodup _) (List.nodup_cons.mpr ⟨fun inside => ?_, toList_nodup _⟩)).mpr ?_
  · have := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside
    simp at this
  · intro ⟨key, entry⟩
    simp only [List.mem_cons, Prod.mk.injEq, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some,
      Std.ExtTreeMap.getElem?_erase]
    by_cases same : key = unit
    · subst same
      simp only [Std.ReflCmp.compare_self, ite_true, reduceCtorEq, or_false, true_and, found, Option.some.injEq]
      exact ⟨fun h => h.symm, fun h => h.symm⟩
    · have other : compare unit key ≠ .eq := fun eq => same (Std.LawfulEqOrd.eq_of_compare eq).symm
      simp [same, other]

/-- Erasing a key takes its value out of the values, in some order. -/
theorem values_erase_perm {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} (found : m[unit]? = some value) :
    (m.toList.map (·.2)).Perm (value :: (m.erase unit).toList.map (·.2)) :=
  (toList_erase_perm found).map (·.2)

/-- A key the map does not contain has no value. -/
theorem getElem?_of_contains {m : TreeMap UnitKey β compare} {unit : UnitKey} (absent : m.contains unit = false) :
    m[unit]? = none := by
  simp [Std.ExtTreeMap.mem_iff_contains, absent]

/-! ## Fewer entries, in any order

The closure's views list a map's values in key order, which is no order of entry, so moving a batch under a unit key
reorders them: a step that queues nothing new leaves at most the entries it had, as a multiset (`Fewer`). -/

/-- `after` holds at most `before`'s entries, each as often, in any order. -/
def Fewer {α : Type} (after before : List α) : Prop := ∃ kept, after.Perm kept ∧ kept.Sublist before

theorem Fewer.refl {α : Type} (l : List α) : Fewer l l := ⟨l, .refl _, .refl _⟩

theorem Fewer.of_sublist {α : Type} {after before : List α} (fewer : after.Sublist before) : Fewer after before :=
  ⟨after, .refl _, fewer⟩

theorem Fewer.of_perm {α : Type} {after before : List α} (same : after.Perm before) : Fewer after before :=
  ⟨before, same, .refl _⟩

theorem Fewer.subset {α : Type} {after before : List α} (fewer : Fewer after before) : ∀ ⦃x⦄, x ∈ after → x ∈ before :=
  fun _ inside => have ⟨_, same, sub⟩ := fewer; sub.subset (same.subset inside)

theorem Fewer.trans {α : Type} {first second third : List α} (one : Fewer first second) (two : Fewer second third) :
    Fewer first third := by
  obtain ⟨kept, same, sub⟩ := one
  obtain ⟨kept', same', sub'⟩ := two
  obtain ⟨moved, moves, inside⟩ := List.exists_perm_sublist sub same'
  exact ⟨moved, same.trans moves.symm, inside.trans sub'⟩

/-- A symmetric relation every two entries of `before` keep, every two of `after` keep. -/
theorem Fewer.pairwise {α : Type} {after before : List α} {R : α → α → Prop} (fewer : Fewer after before)
    (symm : ∀ {x y}, R x y → R y x) (holds : before.Pairwise R) : after.Pairwise R :=
  have ⟨_, same, sub⟩ := fewer; (holds.sublist sub).perm same.symm symm

theorem Fewer.append_right {α : Type} {after before : List α} (fewer : Fewer after before) (more : List α) :
    Fewer (after ++ more) (before ++ more) :=
  have ⟨kept, same, sub⟩ := fewer; ⟨kept ++ more, same.append_right more, sub.append_right more⟩

theorem Fewer.append_left {α : Type} {after before : List α} (fewer : Fewer after before) (more : List α) :
    Fewer (more ++ after) (more ++ before) :=
  have ⟨kept, same, sub⟩ := fewer; ⟨more ++ kept, same.append_left more, sub.append_left more⟩

theorem Fewer.append {α : Type} {after before after' before' : List α} (fewer : Fewer after before)
    (fewer' : Fewer after' before') : Fewer (after ++ after') (before ++ before') :=
  have ⟨kept, same, sub⟩ := fewer; have ⟨kept', same', sub'⟩ := fewer'
  ⟨kept ++ kept', same.append same', sub.append sub'⟩

theorem Fewer.filterMap {α β : Type} {after before : List α} (fewer : Fewer after before) (f : α → Option β) :
    Fewer (after.filterMap f) (before.filterMap f) :=
  have ⟨kept, same, sub⟩ := fewer; ⟨kept.filterMap f, same.filterMap f, sub.filterMap f⟩

theorem Fewer.nodup {α : Type} {after before : List α} (fewer : Fewer after before) (distinct : before.Nodup) :
    after.Nodup :=
  fewer.pairwise Ne.symm distinct

/-- A map of one entry lists it. -/
@[simp] theorem toList_singleton {β : Type} (unit : UnitKey) (value : β) :
    ((∅ : TreeMap UnitKey β compare).insert unit value).toList = [(unit, value)] :=
  List.perm_singleton.mp (toList_insert_perm (by simp))

/-- Erasing the one entry of a map leaves it empty. -/
@[simp] theorem erase_singleton {β : Type} (unit : UnitKey) (value : β) :
    ((∅ : TreeMap UnitKey β compare).insert unit value).erase unit = ∅ :=
  Std.ExtTreeMap.ext_getElem? fun key => by
    simp only [Std.ExtTreeMap.getElem?_erase, Std.ExtTreeMap.getElem?_insert, Std.ExtTreeMap.getElem?_empty]
    by_cases same : compare unit key = .eq <;> simp [same]

/-- Inserting under a key lists the new entry beside the others, in some order. -/
theorem toList_insert_perm_erase {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} :
    (m.insert unit value).toList.Perm ((unit, value) :: (m.erase unit).toList) := by
  refine (List.perm_ext_iff_of_nodup (toList_nodup _) (List.nodup_cons.mpr ⟨fun inside => ?_, toList_nodup _⟩)).mpr ?_
  · have := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside
    simp at this
  · intro ⟨key, entry⟩
    simp only [List.mem_cons, Prod.mk.injEq, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some,
      Std.ExtTreeMap.getElem?_insert, Std.ExtTreeMap.getElem?_erase]
    by_cases same : key = unit
    · subst same
      simp only [Std.ReflCmp.compare_self, ite_true, reduceCtorEq, or_false, true_and, Option.some.injEq]
      exact ⟨fun h => h.symm, fun h => h.symm⟩
    · have other : compare unit key ≠ .eq := fun eq => same (Std.LawfulEqOrd.eq_of_compare eq).symm
      simp [same, other]

/-- Inserting under a key adds the value and at most drops the one it replaces. -/
theorem values_insert_fewer {m : TreeMap UnitKey β compare} {unit : UnitKey} {value : β} :
    Fewer ((m.insert unit value).toList.map (·.2)) (value :: m.toList.map (·.2)) := by
  cases found : m[unit]? with
  | none => exact .of_perm (values_insert_perm found)
  | some old =>
    refine Fewer.trans (.of_perm (toList_insert_perm_erase.map (·.2))) ?_
    refine Fewer.trans (.of_sublist (List.Sublist.cons_cons _ (List.sublist_cons_self old _))) (.of_perm ?_)
    exact ((values_erase_perm found).cons value).symm

/-- Inserting a batch under keys adds the batch's values and at most drops those it replaces. -/
theorem foldl_insert_fewer (key : Nat → UnitKey) :
    ∀ (batch : List (β × Nat)) (m : TreeMap UnitKey β compare),
      Fewer ((batch.foldl (fun queued (entry, index) => queued.insert (key index) entry) m).toList.map (·.2))
        (m.toList.map (·.2) ++ batch.map (·.1))
  | [], m => by simpa using Fewer.refl _
  | (entry, index) :: rest, m => by
    refine (foldl_insert_fewer key rest _).trans ?_
    refine ((values_insert_fewer (m := m) (unit := key index) (value := entry)).append_right _).trans (.of_perm ?_)
    simpa using List.perm_middle.symm

/-- An entry of a map a batch was inserted into under keys is a batch entry under its key, or was there before. -/
theorem foldl_insert_getElem? (key : Nat → UnitKey) :
    ∀ (batch : List (β × Nat)) (m : TreeMap UnitKey β compare) (unit : UnitKey) (value : β),
      (batch.foldl (fun queued (entry, index) => queued.insert (key index) entry) m)[unit]? = some value →
        (∃ index, unit = key index ∧ (value, index) ∈ batch) ∨ m[unit]? = some value
  | [], _, _, _, found => .inr found
  | (entry, index) :: rest, m, unit, value, found => by
    rcases foldl_insert_getElem? key rest _ unit value found with ⟨later, named, inside⟩ | old
    · exact .inl ⟨later, named, List.mem_cons_of_mem _ inside⟩
    · rw [Std.ExtTreeMap.getElem?_insert] at old
      split at old
      · next same =>
        cases old
        exact .inl ⟨index, (Std.LawfulEqOrd.eq_of_compare same).symm, List.mem_cons_self ..⟩
      · exact .inr old

/-- Two entries of a list at increasing indexes lie in it in that order. -/
theorem pair_of_getElem? {α : Type} : ∀ {l : List α} {a b : Nat} {x y : α}, a < b → l[a]? = some x → l[b]? = some y →
    [x, y].Sublist l
  | _ :: _, 0, b + 1, _, _, _, first, second => by
    simp only [List.getElem?_cons_zero, Option.some.injEq, List.getElem?_cons_succ] at first second
    subst first
    exact List.Sublist.cons_cons _ (List.singleton_sublist.mpr (List.mem_of_getElem? second))
  | _ :: _, a + 1, b + 1, _, _, lower, first, second => by
    simp only [List.getElem?_cons_succ] at first second
    exact .cons _ (pair_of_getElem? (by omega) first second)
  | [], _, _, _, _, _, first, _ => by simp at first
  | _ :: _, _ + 1, 0, _, _, lower, _, _ => by omega
  | _ :: _, 0, 0, _, _, lower, _, _ => by omega

/-- Taking an entry off a map keeps fewer values. -/
theorem values_erase_fewer {m : TreeMap UnitKey β compare} {unit : UnitKey} :
    Fewer ((m.erase unit).toList.map (·.2)) (m.toList.map (·.2)) := by
  cases found : m[unit]? with
  | none =>
    have same : m.erase unit = m := Std.ExtTreeMap.ext_getElem? fun key => by
      rw [Std.ExtTreeMap.getElem?_erase]
      split
      · next eq => rw [← Std.LawfulEqOrd.eq_of_compare eq, found]
      · rfl
    rw [same]
    exact .refl _
  | some old => exact .trans (.of_sublist (List.sublist_cons_self old _)) (.of_perm (values_erase_perm found).symm)

/-! ## The views -/

/-- `after` queues at most the work `before` queues, each queue as it holds it: the running batches sublists of
`before`'s, and every keyed entry `before`'s under its key. What an operation that queues nothing keeps, for an
invariant that reads the split between the running batch and the keyed queues (`Laws.MultiInstance.BeginsQueued`). -/
structure QueuesKept (before after : State) : Prop where
  signals : after.signals.Sublist before.signals
  tokens : after.tokens.Sublist before.tokens
  queuedSignals : ∀ (unit : UnitKey) (signal : Signal), after.queuedSignals[unit]? = some signal →
    before.queuedSignals[unit]? = some signal
  queuedTokens : ∀ (unit : UnitKey) (token : Token), after.queuedTokens[unit]? = some token →
    before.queuedTokens[unit]? = some token

theorem QueuesKept.of_eq {before after : State} (signals : after.signals = before.signals)
    (tokens : after.tokens = before.tokens) (queuedSignals : after.queuedSignals = before.queuedSignals)
    (queuedTokens : after.queuedTokens = before.queuedTokens) : QueuesKept before after :=
  ⟨signals ▸ .refl _, tokens ▸ .refl _, fun _ _ found => by rw [← queuedSignals]; exact found,
    fun _ _ found => by rw [← queuedTokens]; exact found⟩

/-- What `QueuesKept` keeps of the queue views. -/
theorem QueuesKept.signal_mem {before after : State} (kept : QueuesKept before after) :
    ∀ signal ∈ allSignals after, signal ∈ allSignals before := fun _ inside => by
  rcases List.mem_append.mp inside with keyed | batch
  · obtain ⟨unit, found⟩ := mem_values.mp keyed
    exact List.mem_append_left _ (mem_values.mpr ⟨unit, kept.queuedSignals unit _ found⟩)
  · exact List.mem_append_right _ (kept.signals.subset batch)

theorem QueuesKept.token_mem {before after : State} (kept : QueuesKept before after) :
    ∀ token ∈ allQueuedTokens after, token ∈ allQueuedTokens before := fun _ inside => by
  rcases List.mem_append.mp inside with keyed | batch
  · obtain ⟨unit, found⟩ := mem_values.mp keyed
    exact List.mem_append_left _ (mem_values.mpr ⟨unit, kept.queuedTokens unit _ found⟩)
  · exact List.mem_append_right _ (kept.tokens.subset batch)

theorem QueuesKept.refl (s : State) : QueuesKept s s := .of_eq rfl rfl rfl rfl

theorem QueuesKept.trans {first second third : State} (one : QueuesKept first second) (two : QueuesKept second third) :
    QueuesKept first third :=
  ⟨two.signals.trans one.signals, two.tokens.trans one.tokens,
    fun unit signal found => one.queuedSignals unit signal (two.queuedSignals unit signal found),
    fun unit token found => one.queuedTokens unit token (two.queuedTokens unit token found)⟩

/-- A signal queued under a unit key is queued. -/
theorem mem_allSignals_of {s : State} {unit : UnitKey} {signal : Signal} (found : s.queuedSignals[unit]? = some signal) :
    signal ∈ allSignals s :=
  List.mem_append_left _ (mem_values.mpr ⟨unit, found⟩)

/-- A token queued under a unit key is queued. -/
theorem mem_allQueuedTokens_of {s : State} {unit : UnitKey} {token : Token} (found : s.queuedTokens[unit]? = some token) :
    token ∈ allQueuedTokens s :=
  List.mem_append_left _ (mem_values.mpr ⟨unit, found⟩)

/-- Taking a token off the queue keeps only queued tokens. -/
theorem allQueuedTokens_untoken {s : State} {unit : UnitKey} :
    ∀ token ∈ allQueuedTokens { s with queuedTokens := s.queuedTokens.erase unit }, token ∈ allQueuedTokens s := by
  intro token inside
  rcases List.mem_append.mp inside with keyed | batch
  · exact List.mem_append_left _ (mem_values_erase keyed)
  · exact List.mem_append_right _ batch

/-- Taking a signal off the queue keeps only queued signals. -/
theorem allSignals_unqueue {s : State} {unit : UnitKey} :
    ∀ signal ∈ allSignals { s with queuedSignals := s.queuedSignals.erase unit }, signal ∈ allSignals s := by
  intro signal inside
  rcases List.mem_append.mp inside with keyed | batch
  · exact List.mem_append_left _ (mem_values_erase keyed)
  · exact List.mem_append_right _ batch

/-- Taking the signal under `unit` off the queue leaves the others. -/
theorem allSignals_pop {s : State} {unit : UnitKey} {signal : Signal} (found : s.queuedSignals[unit]? = some signal) :
    (allSignals s).Perm (signal :: allSignals { s with queuedSignals := s.queuedSignals.erase unit }) :=
  (values_erase_perm found).append_right _

/-- Queuing signals in the running batch adds them to the queued ones. -/
theorem allSignals_append (s : State) (more : List Signal) :
    allSignals { s with signals := s.signals ++ more } = allSignals s ++ more := by
  simp [allSignals, List.append_assoc]

/-- Queuing tokens in the running batch adds them to the queued ones. -/
theorem allQueuedTokens_append (s : State) (more : List Token) :
    allQueuedTokens { s with tokens := s.tokens ++ more } = allQueuedTokens s ++ more := by
  simp [allQueuedTokens, List.append_assoc]

/-- A smaller running batch keeps only queued signals. -/
theorem allSignals_batch {s : State} {signals : List Signal} (sub : signals.Sublist s.signals) :
    ∀ signal ∈ allSignals { s with signals := signals }, signal ∈ allSignals s := by
  intro signal inside
  rcases List.mem_append.mp inside with keyed | batch
  · exact List.mem_append_left _ keyed
  · exact List.mem_append_right _ (sub.subset batch)

end Kernel.Laws.State