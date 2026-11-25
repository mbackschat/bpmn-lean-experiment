module

public import Kernel.State.Map

/-! # Laws of a ranked map whose values carry their keys

A state family held as a `Std.ExtTreeMap` keyed by a structural key whose every value carries its own key (KD1's
`KeyedBy`, DC21's ranked maps) is read by the laws as the list of its values in key order. This module turns the map's
point lemmas into membership in that list once, for any key type and any key projection, so a family's own laws
module only names its projection (`Laws.State.Occurrence` for the scope occurrences). Every fact is a lookup or
membership, except `values_filter_val`, which states that a filter reading only the value keeps the key order. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State.Keyed

open Kernel

variable {κ ν : Type} [Ord κ] [Std.TransOrd κ] [Std.LawfulEqOrd κ]

/-- The values of `m` in key order. -/
def values (m : TreeMap κ ν compare) : List ν := m.toList.map (·.2)

/-- Every value of `m` sits under its own key, `key value`. -/
def KeyedOn (key : ν → κ) (m : TreeMap κ ν compare) : Prop := ∀ (k : κ) (value : ν), m[k]? = some value → key value = k

variable {key : ν → κ}

theorem mem_values {m : TreeMap κ ν compare} {value : ν} : value ∈ values m ↔ ∃ k : κ, m[k]? = some value := by
  simp [values, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some]

theorem mem_values_keyed {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {value : ν} :
    value ∈ values m ↔ m[key value]? = some value := by
  rw [mem_values]
  constructor
  · rintro ⟨k, h⟩; rwa [keyed k value h]
  · exact fun h => ⟨_, h⟩

/-- Two values of a keyed map with one key are one value. -/
theorem KeyedOn.eq_of_key {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {a b : ν} (first : a ∈ values m)
    (second : b ∈ values m) (same : key a = key b) : a = b := by
  rw [mem_values_keyed keyed] at first second
  rw [same] at first
  exact Option.some.inj (first.symm.trans second)

omit [Std.LawfulEqOrd κ] in
/-- The empty map's list view is empty. -/
@[simp] theorem toList_empty : (∅ : TreeMap κ ν compare).toList = [] := Std.ExtTreeMap.toList_eq_nil_iff.mpr rfl

omit [Std.LawfulEqOrd κ] in
theorem values_empty : values (∅ : TreeMap κ ν compare) = [] := by simp [values]

omit [Std.LawfulEqOrd κ] in
theorem keyedOn_empty : KeyedOn key (∅ : TreeMap κ ν compare) := by intro k value h; simp at h

theorem keyedOn_insert {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {k : κ} {new : ν} (named : key new = k) :
    KeyedOn key (m.insert k new) := by
  intro k' value h
  rw [Std.ExtTreeMap.getElem?_insert] at h
  split at h
  · rename_i e; cases h; exact named.trans (Std.LawfulEqCmp.eq_of_compare e)
  · exact keyed k' value h

theorem keyedOn_filter {m : TreeMap κ ν compare} (keyed : KeyedOn key m) (f : κ → ν → Bool) : KeyedOn key (m.filter f) := by
  intro k value h
  rw [Std.ExtTreeMap.getElem?_filter'] at h
  exact keyed k value (Option.eq_some_of_filter_eq_some h)

omit [Std.LawfulEqOrd κ] in
theorem keyedOn_erase {m : TreeMap κ ν compare} (keyed : KeyedOn key m) (k : κ) : KeyedOn key (m.erase k) := by
  intro k' value h
  rw [Std.ExtTreeMap.getElem?_erase] at h
  split at h
  · cases h
  · exact keyed k' value h

theorem keyedOn_modify {m : TreeMap κ ν compare} (keyed : KeyedOn key m) (k : κ) {f : ν → ν} (same : ∀ v, key (f v) = key v) :
    KeyedOn key (m.modify k f) := by
  intro k' value h
  rw [Std.ExtTreeMap.getElem?_modify] at h
  split at h
  · rename_i e
    obtain ⟨old, found, rfl⟩ := Option.map_eq_some_iff.mp h
    rw [same, keyed _ old found]; exact Std.LawfulEqCmp.eq_of_compare e
  · exact keyed k' value h

/-- `keyedOn_modify` for a change that keeps only the modified value's key. -/
theorem keyedOn_modify_at {m : TreeMap κ ν compare} (keyed : KeyedOn key m) (k : κ) {f : ν → ν}
    (same : ∀ v, key v = k → key (f v) = k) : KeyedOn key (m.modify k f) := by
  intro k' value h
  rw [Std.ExtTreeMap.getElem?_modify] at h
  split at h
  · rename_i e
    obtain ⟨old, found, rfl⟩ := Option.map_eq_some_iff.mp h
    rw [same old (keyed _ old found)]
    exact Std.LawfulEqCmp.eq_of_compare e
  · exact keyed k' value h

theorem mem_values_filter {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {f : κ → ν → Bool} {value : ν} :
    value ∈ values (m.filter f) ↔ value ∈ values m ∧ f (key value) value = true := by
  rw [mem_values_keyed (keyedOn_filter keyed f), mem_values_keyed keyed, Std.ExtTreeMap.getElem?_filter']
  simp only [Option.filter_eq_some_iff]

/-- A filter that reads only the value needs no keying. -/
theorem mem_values_filter_val {m : TreeMap κ ν compare} {p : ν → Bool} {value : ν} :
    value ∈ values (m.filter fun _ v => p v) ↔ value ∈ values m ∧ p value = true := by
  simp only [mem_values, Std.ExtTreeMap.getElem?_filter', Option.filter_eq_some_iff]
  constructor
  · rintro ⟨k, h, hp⟩; exact ⟨⟨k, h⟩, hp⟩
  · rintro ⟨⟨k, h⟩, hp⟩; exact ⟨k, h, hp⟩

omit [Std.LawfulEqOrd κ] in
/-- A filter that reads only the value filters the values in key order: the one order fact here, which lets a
removal's list laws survive the change to a map. -/
theorem values_filter_val (m : TreeMap κ ν compare) (p : ν → Bool) :
    values (m.filter fun _ v => p v) = (values m).filter p := by
  simp only [values, Std.ExtTreeMap.toList_filter, List.filter_map]
  rfl

theorem mem_values_insert {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {k : κ} {new value : ν} (named : key new = k) :
    value ∈ values (m.insert k new) ↔ value = new ∨ (value ∈ values m ∧ key value ≠ k) := by
  rw [mem_values_keyed (keyedOn_insert keyed named), mem_values_keyed keyed, Std.ExtTreeMap.getElem?_insert]
  constructor
  · intro h
    split at h
    · rename_i e; cases h; exact .inl rfl
    · rename_i e
      exact .inr ⟨h, fun eq => e (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro (rfl | ⟨h, ne⟩)
    · simp [named]
    · have hc : ¬ compare k (key value) = .eq := fun e => ne (Std.LawfulEqCmp.eq_of_compare e).symm
      simp [hc, h]

/-- A value of a map with one more insert is the inserted one or an old one; no keying needed. -/
theorem mem_values_insert_sub {m : TreeMap κ ν compare} {k : κ} {new value : ν} (member : value ∈ values (m.insert k new)) :
    value = new ∨ value ∈ values m := by
  obtain ⟨k', found⟩ := mem_values.mp member
  rw [Std.ExtTreeMap.getElem?_insert] at found
  split at found
  · exact .inl (Option.some.inj found).symm
  · exact .inr (mem_values.mpr ⟨k', found⟩)

/-- Inserting under a key no value carries leaves every value in place. -/
theorem mem_values_insert_fresh {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {k : κ} {new value : ν} (named : key new = k)
    (fresh : ∀ old ∈ values m, key old ≠ k) : value ∈ values (m.insert k new) ↔ value ∈ values m ∨ value = new := by
  rw [mem_values_insert keyed named]
  constructor
  · rintro (h | ⟨h, _⟩); exact .inr h; exact .inl h
  · rintro (h | h); exact .inr ⟨h, fresh value h⟩; exact .inl h

theorem mem_values_erase {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {k : κ} {value : ν} :
    value ∈ values (m.erase k) ↔ value ∈ values m ∧ key value ≠ k := by
  rw [mem_values_keyed (keyedOn_erase keyed k), mem_values_keyed keyed, Std.ExtTreeMap.getElem?_erase]
  constructor
  · intro h
    split at h
    · cases h
    · rename_i e
      exact ⟨h, fun eq => e (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro ⟨h, ne⟩
    have hc : ¬ compare k (key value) = .eq := fun e => ne (Std.LawfulEqCmp.eq_of_compare e).symm
    simp [hc, h]

/-- A map of one entry holds that entry's value alone. -/
@[simp] theorem mem_values_single {k : κ} {new value : ν} : value ∈ values ((∅ : TreeMap κ ν compare).insert k new) ↔ value = new := by
  simp only [mem_values, Std.ExtTreeMap.getElem?_insert, Std.ExtTreeMap.getElem?_empty]
  constructor
  · rintro ⟨k', found⟩
    split at found
    · exact (Option.some.inj found).symm
    · cases found
  · rintro rfl
    exact ⟨k, by simp⟩

/-- A map of one entry views as that entry alone. -/
theorem values_single {k : κ} {new : ν} : values ((∅ : TreeMap κ ν compare).insert k new) = [new] := by
  have length : (values ((∅ : TreeMap κ ν compare).insert k new)).length = 1 := by
    simp [values, Std.ExtTreeMap.size_insert, Std.ExtTreeMap.size_empty]
  match listed : values ((∅ : TreeMap κ ν compare).insert k new), length with
  | [value], _ =>
    have member : value ∈ values ((∅ : TreeMap κ ν compare).insert k new) := listed ▸ List.mem_singleton_self value
    rw [mem_values_single.mp member]

/-- Modifying the entry just inserted inserts the modified entry. -/
theorem modify_insert_self (m : TreeMap κ ν compare) (k : κ) (v : ν) (f : ν → ν) :
    (m.insert k v).modify k f = m.insert k (f v) := by
  apply Std.ExtTreeMap.ext_getElem?
  intro k'
  simp only [Std.ExtTreeMap.getElem?_modify, Std.ExtTreeMap.getElem?_insert]
  split <;> simp_all

/-- The map of `list`, each value under its own key: how a witness writes a family. -/
def ofList (key : ν → κ) (list : List ν) : TreeMap κ ν compare := list.foldl (fun m value => m.insert (key value) value) ∅

theorem keyedOn_foldl (list : List ν) {m : TreeMap κ ν compare} (keyed : KeyedOn key m) :
    KeyedOn key (list.foldl (fun m value => m.insert (key value) value) m) := by
  induction list generalizing m with
  | nil => exact keyed
  | cons value rest ih => exact ih (keyedOn_insert keyed rfl)

theorem keyedOn_ofList (list : List ν) : KeyedOn key (ofList key list) := keyedOn_foldl list keyedOn_empty

theorem mem_values_foldl {list : List ν} {m : TreeMap κ ν compare} (keyed : KeyedOn key m) (nodup : (list.map key).Nodup)
    (fresh : ∀ old ∈ values m, ∀ new ∈ list, key old ≠ key new) {value : ν} :
    value ∈ values (list.foldl (fun m value => m.insert (key value) value) m) ↔ value ∈ values m ∨ value ∈ list := by
  induction list generalizing m with
  | nil => simp
  | cons new rest ih =>
    simp only [List.map_cons, List.nodup_cons, List.mem_map] at nodup
    simp only [List.foldl_cons]
    have fresh' : ∀ old ∈ values (m.insert (key new) new), ∀ next ∈ rest, key old ≠ key next := by
      intro old member next inRest
      rcases (mem_values_insert keyed rfl).mp member with rfl | ⟨member, _⟩
      · exact fun eq => nodup.1 ⟨next, inRest, eq.symm⟩
      · exact fresh old member next (List.mem_cons_of_mem _ inRest)
    rw [ih (keyedOn_insert keyed rfl) nodup.2 fresh', mem_values_insert_fresh keyed rfl
      (fun old member => fresh old member new (List.mem_cons_self ..))]
    simp only [List.mem_cons]
    constructor
    · rintro ((h | h) | h) <;> simp_all
    · rintro (h | h | h) <;> simp_all

theorem mem_ofList {list : List ν} (nodup : (list.map key).Nodup) {value : ν} :
    value ∈ values (ofList key list) ↔ value ∈ list := by
  rw [ofList, mem_values_foldl keyedOn_empty nodup (by simp [values_empty])]
  simp [values_empty]

/-- A keyed map's values carry pairwise distinct keys: the map holds one value per key. -/
theorem values_keys {m : TreeMap κ ν compare} (keyed : KeyedOn key m) : (values m).map key = m.toList.map (·.1) := by
  unfold values
  rw [List.map_map]
  apply List.map_congr_left
  intro pair member
  exact keyed pair.1 pair.2 (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp member)

theorem values_nodup {m : TreeMap κ ν compare} (keyed : KeyedOn key m) : ((values m).map key).Nodup := by
  rw [values_keys keyed, List.Nodup, List.pairwise_map]
  exact Std.ExtTreeMap.distinct_keys_toList.imp fun ne eq => ne (by rw [eq]; exact Std.ReflCmp.compare_self)

/-- `after` holds some of `before`'s values, each under the same key. -/
def Sub (after before : TreeMap κ ν compare) : Prop := ∀ (k : κ) (value : ν), after[k]? = some value → before[k]? = some value

omit [Std.LawfulEqOrd κ] in
theorem Sub.refl (m : TreeMap κ ν compare) : Sub m m := fun _ _ h => h

omit [Std.LawfulEqOrd κ] in
theorem Sub.trans {a b c : TreeMap κ ν compare} (one : Sub b a) (two : Sub c b) : Sub c a :=
  fun k value h => one k value (two k value h)

theorem Sub.filter (f : κ → ν → Bool) (m : TreeMap κ ν compare) : Sub (m.filter f) m := by
  intro k value h
  rw [Std.ExtTreeMap.getElem?_filter'] at h
  exact Option.eq_some_of_filter_eq_some h

omit [Std.LawfulEqOrd κ] in
theorem Sub.erase (k : κ) (m : TreeMap κ ν compare) : Sub (m.erase k) m := by
  intro k' value h
  rw [Std.ExtTreeMap.getElem?_erase] at h
  split at h
  · cases h
  · exact h

omit [Std.LawfulEqOrd κ] in
theorem Sub.keyed {after before : TreeMap κ ν compare} (sub : Sub after before) (keyed : KeyedOn key before) :
    KeyedOn key after :=
  fun k value h => keyed k value (sub k value h)

theorem Sub.subset {after before : TreeMap κ ν compare} (sub : Sub after before) : values after ⊆ values before := by
  intro value member
  obtain ⟨k, h⟩ := mem_values.mp member
  exact mem_values.mpr ⟨k, sub k value h⟩

/-! ## Re-keying every value

A writer that renames every value's key rebuilds the map (`State.renameState`): each value, mapped by `f`, is inserted
under its new key. Every value of the result is a mapped old one, and every mapped old key stands; a mapped old value
itself stands only when no other value maps onto its key, so that direction takes the renaming's injectivity. -/

/-- `m` with every value mapped by `f` and inserted under its own new key, in `m`'s key order. -/
def refold (key : ν → κ) (f : ν → ν) (m : TreeMap κ ν compare) : TreeMap κ ν compare :=
  m.foldl (fun acc _ v => acc.insert (key (f v)) (f v)) ∅

omit [Std.LawfulEqOrd κ] in
theorem refold_eq (f : ν → ν) (m : TreeMap κ ν compare) :
    refold key f m = ((values m).map f).foldl (fun acc v => acc.insert (key v) v) ∅ := by
  unfold refold values
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  generalize (∅ : TreeMap κ ν compare) = init
  induction m.toList generalizing init with
  | nil => rfl
  | cons x rest ih => simp only [List.foldl_cons, List.map_cons]; exact ih _

theorem keyedOn_refold (f : ν → ν) (m : TreeMap κ ν compare) : KeyedOn key (refold key f m) := by
  rw [refold_eq]; exact keyedOn_foldl _ keyedOn_empty

/-- A value of a fold of inserts is an inserted one or one of the start. -/
theorem mem_values_foldl_sub {list : List ν} {m : TreeMap κ ν compare} {value : ν}
    (member : value ∈ values (list.foldl (fun m value => m.insert (key value) value) m)) : value ∈ values m ∨ value ∈ list := by
  induction list generalizing m with
  | nil => exact .inl member
  | cons new rest ih =>
    rcases ih member with old | inRest
    · rcases mem_values_insert_sub old with rfl | old
      · exact .inr (List.mem_cons_self ..)
      · exact .inl old
    · exact .inr (List.mem_cons_of_mem _ inRest)

/-- A fold of inserts holds every inserted key. -/
theorem key_mem_foldl {list : List ν} {m : TreeMap κ ν compare} (keyed : KeyedOn key m) :
    ∀ new ∈ list, ∃ value ∈ values (list.foldl (fun m value => m.insert (key value) value) m), key value = key new := by
  induction list generalizing m with
  | nil => intro _ member; cases member
  | cons first rest ih =>
    intro new member
    simp only [List.foldl_cons]
    rcases List.mem_cons.mp member with rfl | inRest
    · -- The first insert's key survives every later insert, which can only replace its value.
      have kept : ∀ (rest : List ν) (m : TreeMap κ ν compare), KeyedOn key m → key new ∈ m.toList.map (·.1) →
          ∃ value ∈ values (rest.foldl (fun m value => m.insert (key value) value) m), key value = key new := by
        intro rest
        induction rest with
        | nil =>
          intro m keyed present
          obtain ⟨pair, inPairs, same⟩ := List.mem_map.mp present
          exact ⟨pair.2, List.mem_map.mpr ⟨pair, inPairs, rfl⟩,
            by rw [keyed pair.1 pair.2 (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inPairs)]; exact same⟩
        | cons next more ih' =>
          intro m keyed present
          simp only [List.foldl_cons]
          refine ih' _ (keyedOn_insert keyed rfl) ?_
          rw [← values_keys (keyedOn_insert keyed rfl), List.mem_map]
          by_cases same : key next = key new
          · exact ⟨next, (mem_values_insert keyed rfl).mpr (.inl rfl), same⟩
          · rw [← values_keys keyed, List.mem_map] at present
            obtain ⟨old, inside, oldKey⟩ := present
            exact ⟨old, (mem_values_insert keyed rfl).mpr (.inr ⟨inside, by rw [oldKey]; exact Ne.symm same⟩), oldKey⟩
      refine kept rest _ (keyedOn_insert keyed rfl) ?_
      rw [← values_keys (keyedOn_insert keyed rfl)]
      exact List.mem_map.mpr ⟨new, (mem_values_insert keyed rfl).mpr (.inl rfl), rfl⟩
    · exact ih (keyedOn_insert keyed rfl) new inRest

/-- Every value of a re-keyed map is an old value, mapped. -/
theorem mem_refold_of {f : ν → ν} {m : TreeMap κ ν compare} {value : ν} (member : value ∈ values (refold key f m)) :
    ∃ old ∈ values m, value = f old := by
  rw [refold_eq] at member
  rcases mem_values_foldl_sub member with empty | mapped
  · rw [values_empty] at empty; cases empty
  · obtain ⟨old, inside, rfl⟩ := List.mem_map.mp mapped
    exact ⟨old, inside, rfl⟩

/-- Every old value's new key stands in a re-keyed map, whatever the renaming. -/
theorem key_mem_refold {f : ν → ν} {m : TreeMap κ ν compare} {old : ν} (member : old ∈ values m) :
    ∃ value ∈ values (refold key f m), key value = key (f old) := by
  rw [refold_eq]
  exact key_mem_foldl keyedOn_empty (f old) (List.mem_map_of_mem member)

/-- The keys of a re-keyed map are the old values' new keys. -/
theorem keys_refold {f : ν → ν} {m : TreeMap κ ν compare} {k : κ} :
    k ∈ (values (refold key f m)).map key ↔ k ∈ (values m).map (key ∘ f) := by
  constructor
  · intro member
    obtain ⟨value, inside, rfl⟩ := List.mem_map.mp member
    obtain ⟨old, oldIn, rfl⟩ := mem_refold_of inside
    exact List.mem_map.mpr ⟨old, oldIn, rfl⟩
  · intro member
    obtain ⟨old, oldIn, rfl⟩ := List.mem_map.mp member
    obtain ⟨value, inside, same⟩ := key_mem_refold (key := key) (f := f) oldIn
    exact List.mem_map.mpr ⟨value, inside, same⟩

/-- A renaming that maps no two old values onto one key keeps every old value, mapped. -/
theorem mem_refold {f : ν → ν} {m : TreeMap κ ν compare}
    (apart : ∀ a ∈ values m, ∀ b ∈ values m, key (f a) = key (f b) → a = b) {old : ν} (member : old ∈ values m) :
    f old ∈ values (refold key f m) := by
  obtain ⟨value, inside, same⟩ := key_mem_refold (key := key) (f := f) member
  obtain ⟨other, otherIn, rfl⟩ := mem_refold_of inside
  rwa [apart other otherIn old member same] at inside

/-- A filter every entry passes keeps the map. -/
theorem filter_eq_self {m : TreeMap κ ν compare} {f : κ → ν → Bool} (all : ∀ k value, m[k]? = some value → f k value = true) :
    m.filter f = m := by
  apply Std.ExtTreeMap.ext_getElem?
  intro k
  rw [Std.ExtTreeMap.getElem?_filter']
  cases found : m[k]? with
  | none => rfl
  | some value => simp [all k value found]

/-- Two filters that read only the value are one filter by both. -/
theorem filter_filter_val (m : TreeMap κ ν compare) (p q : ν → Bool) :
    (m.filter fun _ v => p v).filter (fun _ v => q v) = m.filter fun _ v => p v && q v := by
  apply Std.ExtTreeMap.ext_getElem?
  intro k
  simp only [Std.ExtTreeMap.getElem?_filter']
  cases m[k]? with
  | none => rfl
  | some value => cases hp : p value <;> cases hq : q value <;> simp [Option.filter, hp, hq]

/-! ## The list view up to order

A writer that inserts or replaces one value changes the list view only up to order: the order is key order, not the
order of writes, so a law that read the list a writer appended to reads it up to a permutation. -/

omit [Std.TransOrd κ] [Std.LawfulEqOrd κ] [Ord κ] in
/-- A list whose images are distinct is itself duplicate-free. -/
theorem nodup_of_map {l : List ν} (distinct : (l.map key).Nodup) : l.Nodup :=
  List.Pairwise.of_map key (fun _ _ apart same => apart (congrArg key same)) distinct

/-- Inserting a value puts it in place of the value under its key, up to order. -/
theorem values_insert_perm [DecidableEq κ] {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {k : κ} {new : ν}
    (named : key new = k) : (values (m.insert k new)).Perm ((values m).filter (fun v => key v != k) ++ [new]) := by
  have nodupAfter : (values (m.insert k new)).Nodup := nodup_of_map (values_nodup (keyedOn_insert keyed named))
  have nodupBefore : ((values m).filter (fun v => key v != k) ++ [new]).Nodup := by
    rw [List.nodup_append]
    refine ⟨(nodup_of_map (values_nodup keyed)).filter _, by simp, ?_⟩
    intro a inA b inB same
    rw [List.mem_singleton] at inB
    subst inB same
    simp [named] at inA
  rw [List.perm_ext_iff_of_nodup nodupAfter nodupBefore]
  intro value
  rw [mem_values_insert keyed named, List.mem_append, List.mem_filter, List.mem_singleton, bne_iff_ne]
  constructor
  · rintro (h | h); exact .inr h; exact .inl h
  · rintro (h | h); exact .inr h; exact .inl h

/-- Inserting under a key that holds no value adds it, whether or not the insert may replace. -/
theorem insertIfNew_eq_insert {m : TreeMap κ ν compare} {k : κ} (absent : m[k]? = none) (new : ν) :
    m.insertIfNew k new = m.insert k new := by
  have notMem : ¬ k ∈ m := fun inside => by
    rw [Std.ExtTreeMap.mem_iff_isSome_getElem?, absent] at inside; cases inside
  apply Std.ExtTreeMap.ext_getElem?
  intro a
  rw [Std.ExtTreeMap.getElem?_insertIfNew, Std.ExtTreeMap.getElem?_insert]
  by_cases e : compare k a = .eq <;> simp [e, notMem]

theorem keyedOn_insertIfNew {m : TreeMap κ ν compare} (keyed : KeyedOn key m) {k : κ} {new : ν} (named : key new = k) :
    KeyedOn key (m.insertIfNew k new) := by
  intro a value found
  rw [Std.ExtTreeMap.getElem?_insertIfNew] at found
  split at found
  · rename_i h
    cases found
    rw [named]; exact Std.LawfulEqCmp.eq_of_compare h.1
  · exact keyed a value found

/-- A value of `m` stays when a value is inserted only under a new key. -/
theorem mem_values_insertIfNew_of {m : TreeMap κ ν compare} {k : κ} {new value : ν} (member : value ∈ values m) :
    value ∈ values (m.insertIfNew k new) := by
  obtain ⟨a, found⟩ := mem_values.mp member
  refine mem_values.mpr ⟨a, ?_⟩
  rw [Std.ExtTreeMap.getElem?_insertIfNew]
  split
  · rename_i h
    exact absurd (by rw [Std.LawfulEqCmp.eq_of_compare h.1, Std.ExtTreeMap.mem_iff_isSome_getElem?, found]; rfl) h.2
  · exact found

theorem mem_values_insertIfNew_sub {m : TreeMap κ ν compare} {k : κ} {new value : ν}
    (member : value ∈ values (m.insertIfNew k new)) : value ∈ values m ∨ value = new := by
  obtain ⟨a, found⟩ := mem_values.mp member
  rw [Std.ExtTreeMap.getElem?_insertIfNew] at found
  split at found
  · cases found; exact .inr rfl
  · exact .inl (mem_values.mpr ⟨a, found⟩)

/-- Inserting under a key that holds a value replaces that value, as `modify` does. -/
theorem insert_eq_modify {m : TreeMap κ ν compare} {k : κ} {old : ν} (present : m[k]? = some old) (new : ν) :
    m.insert k new = m.modify k fun _ => new := by
  apply Std.ExtTreeMap.ext_getElem?
  intro k'
  rw [Std.ExtTreeMap.getElem?_insert, Std.ExtTreeMap.getElem?_modify]
  split
  · rw [present]; rfl
  · rfl

/-- Replacing the value under `k`, if one stands there, by `f` of it keeps every other value in place, up to order. -/
theorem values_modify_perm [DecidableEq κ] {m : TreeMap κ ν compare} (keyed : KeyedOn key m) (k : κ) {f : ν → ν}
    (same : ∀ v, key v = k → key (f v) = k) :
    (values (m.modify k f)).Perm ((values m).map fun v => if key v = k then f v else v) := by
  have keyedAfter : KeyedOn key (m.modify k f) := keyedOn_modify_at keyed k same
  have nodupAfter : (values (m.modify k f)).Nodup := nodup_of_map (values_nodup keyedAfter)
  have keyOf : ∀ v, key (if key v = k then f v else v) = key v := fun v => by
    split
    · rename_i named; rw [same v named, named]
    · rfl
  have nodupBefore : ((values m).map fun v => if key v = k then f v else v).Nodup := by
    refine List.pairwise_map.mpr ((nodup_of_map (values_nodup keyed)).imp_of_mem fun {a b} inA inB apart eq => apart ?_)
    exact KeyedOn.eq_of_key keyed inA inB ((keyOf a).symm.trans ((congrArg key eq).trans (keyOf b)))
  rw [List.perm_ext_iff_of_nodup nodupAfter nodupBefore]
  intro value
  rw [mem_values_keyed keyedAfter, Std.ExtTreeMap.getElem?_modify, List.mem_map]
  constructor
  · intro h
    split at h
    · rename_i e
      obtain ⟨old, found, rfl⟩ := Option.map_eq_some_iff.mp h
      have named : key old = k := keyed _ old found
      exact ⟨old, mem_values.mpr ⟨_, found⟩, ite_eq_left named⟩
    · rename_i e
      exact ⟨value, mem_values.mpr ⟨_, h⟩, ite_eq_right fun named => e (by rw [named]; exact Std.ReflCmp.compare_self)⟩
  · rintro ⟨old, inside, rfl⟩
    rw [mem_values_keyed keyed] at inside
    by_cases named : key old = k
    · rw [ite_eq_left named, same old named, ite_eq_left Std.ReflCmp.compare_self, ← named, inside]; rfl
    · rw [ite_eq_right named, ite_eq_right fun e => named (Std.LawfulEqCmp.eq_of_compare e).symm]; exact inside

/-! ## Re-keying a map whose values do not carry their keys

A map from a key to a value that does not carry it (`HeldMap`) is renamed by inserting each value, mapped, under its
renamed key. -/

section Rebuild

variable {β : Type}

/-- A fold of inserts over entries with pairwise distinct keys reads each key's entry, else the start's. -/
private theorem foldl_insert_getElem? (k : κ) :
    ∀ (entries : List (κ × β)) (acc : TreeMap κ β compare),
      entries.Pairwise (fun a b => compare a.1 b.1 ≠ .eq) →
      (entries.foldl (fun acc entry => acc.insert entry.1 entry.2) acc)[k]? =
        ((entries.find? fun entry => compare entry.1 k == .eq).map (·.2)).or acc[k]?
  | [], _, _ => by simp
  | entry :: rest, acc, distinct => by
    rw [List.pairwise_cons] at distinct
    rw [List.foldl_cons, foldl_insert_getElem? k rest _ distinct.2, List.find?_cons, Std.ExtTreeMap.getElem?_insert]
    by_cases same : compare entry.1 k = .eq
    · have absent : rest.find? (fun other => compare other.1 k == .eq) = none := by
        refine List.find?_eq_none.mpr fun other inside hit => distinct.1 other inside ?_
        exact Std.TransCmp.eq_trans same (Std.OrientedCmp.eq_symm (beq_iff_eq.mp hit))
      simp [same, absent]
    · have miss : (compare entry.1 k == .eq) = false := by simpa using same
      simp [same, miss]

/-- Re-inserting every entry of a map under its own key rebuilds the map. -/
theorem rebuild_self (m : TreeMap κ β compare) : m.foldl (fun acc k v => acc.insert k v) ∅ = m := by
  apply Std.ExtTreeMap.ext_getElem?
  intro k
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  rw [foldl_insert_getElem? k _ _ Std.ExtTreeMap.distinct_keys_toList, Std.ExtTreeMap.getElem?_empty, Option.or_none]
  cases found : m[k]? with
  | none =>
    rw [Option.map_eq_none_iff, List.find?_eq_none]
    intro entry inside hit
    have : m[entry.1]? = some entry.2 := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside
    rw [Std.LawfulEqCmp.eq_of_compare (beq_iff_eq.mp hit)] at this
    rw [this] at found; cases found
  | some v =>
    have inside : (k, v) ∈ m.toList := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr found
    obtain ⟨entry, hit⟩ : ∃ entry, m.toList.find? (fun entry => compare entry.1 k == .eq) = some entry :=
      Option.isSome_iff_exists.mp (List.find?_isSome.mpr ⟨_, inside, by simp⟩)
    have member := List.mem_of_find?_eq_some hit
    have matched := List.find?_some hit
    simp only [beq_iff_eq] at matched
    have keyed : entry.1 = k := Std.LawfulEqCmp.eq_of_compare matched
    have : m[entry.1]? = some entry.2 := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp member
    rw [keyed, found] at this
    rw [hit]; simp [this]

/-- Every entry of a re-keyed map is an old entry under a renamed key, its value mapped. -/
theorem rekey_getElem? {f : κ → κ} {g : β → β} {m : TreeMap κ β compare} {k : κ} {v : β}
    (found : (m.foldl (fun (acc : TreeMap κ β compare) k v => acc.insert (f k) (g v)) ∅)[k]? = some v) :
    ∃ k' v', m[k']? = some v' ∧ f k' = k ∧ g v' = v := by
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList] at found
  have step : ∀ (entries : List (κ × β)) (acc : TreeMap κ β compare),
      (entries.foldl (fun acc entry => acc.insert (f entry.1) (g entry.2)) acc)[k]? = some v →
        acc[k]? = some v ∨ ∃ entry ∈ entries, f entry.1 = k ∧ g entry.2 = v := by
    intro entries
    induction entries with
    | nil => exact fun _ found => .inl found
    | cons entry rest ih =>
      intro acc found
      rcases ih _ found with here | ⟨other, inside, named, value⟩
      · rw [Std.ExtTreeMap.getElem?_insert] at here
        split at here
        · rename_i same
          exact .inr ⟨entry, List.mem_cons_self, Std.LawfulEqCmp.eq_of_compare same, Option.some.inj here⟩
        · exact .inl here
      · exact .inr ⟨other, List.mem_cons_of_mem _ inside, named, value⟩
  rcases step _ _ found with empty | ⟨entry, inside, named, value⟩
  · simp at empty
  · exact ⟨entry.1, entry.2, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp inside, named, value⟩

/-- Re-keying under a renaming that keeps the map's keys apart keeps each entry, under its renamed key. -/
theorem rekey_getElem?_of {f : κ → κ} {g : β → β} {m : TreeMap κ β compare} {k : κ} {v : β}
    (apart : ∀ a b a' b', m[a]? = some a' → m[b]? = some b' → f a = f b → a = b) (found : m[k]? = some v) :
    (m.foldl (fun (acc : TreeMap κ β compare) k v => acc.insert (f k) (g v)) ∅)[f k]? = some (g v) := by
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  have mapped : m.toList.foldl (fun (acc : TreeMap κ β compare) entry => acc.insert (f entry.1) (g entry.2)) ∅ =
      (m.toList.map fun entry => (f entry.1, g entry.2)).foldl (fun acc entry => acc.insert entry.1 entry.2) ∅ := by
    rw [List.foldl_map]
  have distinct : (m.toList.map fun entry => (f entry.1, g entry.2)).Pairwise (fun a b => compare a.1 b.1 ≠ .eq) := by
    rw [List.pairwise_map]
    refine Std.ExtTreeMap.distinct_keys_toList.imp_of_mem fun {a b} aIn bIn ne eq => ne ?_
    have same := apart _ _ _ _ (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp aIn)
      (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp bIn) (Std.LawfulEqCmp.eq_of_compare eq)
    rw [same]; exact Std.ReflCmp.compare_self
  rw [mapped, foldl_insert_getElem? (f k) _ _ distinct, Std.ExtTreeMap.getElem?_empty, Option.or_none]
  have inside : (k, v) ∈ m.toList := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr found
  obtain ⟨entry, hit⟩ : ∃ entry, (m.toList.map fun entry => (f entry.1, g entry.2)).find?
      (fun entry => compare entry.1 (f k) == .eq) = some entry :=
    Option.isSome_iff_exists.mp (List.find?_isSome.mpr ⟨_, List.mem_map_of_mem inside, by simp⟩)
  have matched := List.find?_some hit
  obtain ⟨old, oldIn, rfl⟩ := List.mem_map.mp (List.mem_of_find?_eq_some hit)
  simp only [beq_iff_eq] at matched
  have oldFound : m[old.1]? = some old.2 := Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp oldIn
  have same := apart _ _ _ _ oldFound found (Std.LawfulEqCmp.eq_of_compare matched)
  rw [same, found] at oldFound
  rw [hit]
  simp [Option.some.inj oldFound]

end Rebuild

/-! ## Inserts under distinct keys -/

omit [Std.LawfulEqOrd κ] in
/-- Inserts under two keys that compare apart commute: two units' fresh entries land alike in either order. -/
theorem insert_comm (m : TreeMap κ ν compare) {a b : κ} (x y : ν) (apart : compare a b ≠ .eq) :
    (m.insert a x).insert b y = (m.insert b y).insert a x := by
  have both : ∀ k, compare b k = .eq → compare a k = .eq → False :=
    fun k hb ha => apart (Std.TransCmp.eq_trans ha (Std.OrientedCmp.eq_symm hb))
  apply Std.ExtTreeMap.ext_getKey_getElem?
  · intro k _ _
    simp only [Std.ExtTreeMap.getKey_insert]
    by_cases hb : compare b k = .eq <;> by_cases ha : compare a k = .eq <;> simp [hb, ha]
    exact (both k hb ha).elim
  · intro k
    simp only [Std.ExtTreeMap.getElem?_insert]
    by_cases hb : compare b k = .eq <;> by_cases ha : compare a k = .eq <;> simp [hb, ha]
    exact (both k hb ha).elim

/-- `insert_comm` for keys that differ. -/
theorem insert_comm_ne (m : TreeMap κ ν compare) {a b : κ} (x y : ν) (apart : a ≠ b) :
    (m.insert a x).insert b y = (m.insert b y).insert a x :=
  insert_comm m x y fun same => apart (Std.LawfulEqCmp.eq_of_compare same)

/-- Two pairs of inserts under keys apart across the pairs commute as pairs. -/
theorem insert_pairs_comm (m : TreeMap κ ν compare) {a b c d : κ} (x y z w : ν) (ac : a ≠ c) (ad : a ≠ d)
    (bc : b ≠ c) (bd : b ≠ d) :
    (((m.insert a x).insert b y).insert c z).insert d w = (((m.insert c z).insert d w).insert a x).insert b y := by
  rw [insert_comm_ne _ _ _ bc, insert_comm_ne _ _ _ bd, insert_comm_ne m _ _ ac, insert_comm_ne _ _ _ ad]

end Kernel.Laws.State.Keyed
