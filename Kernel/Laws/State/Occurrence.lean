module

public import Kernel.State
public import Kernel.Laws.State.Keyed
import all Kernel.State.Occurrence

/-! # Laws of the scope and occurrence maps

The standing scope occurrences and the issued occurrences are `Std.ExtTreeMap`s keyed by `ScopeOccurrenceId` and
`OccurrenceId` (DC21), from `Kernel.State.Occurrence`, whose body only this module sees; `State.scopes` and
`State.occurrences` are their list views in key order (the held map's, `FeatureSlots.held`, is
`Kernel.Laws.State.Slots`'). This module names each value's key for `Laws.State.Keyed`'s map laws, so every other law
reasons about membership in the list views. `ScopesKeyed` and `OccurrencesKeyed` state that each value sits under its
own key, which every writer keeps (an insert puts an entry under its key, the removals filter, a modify keeps the key).
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel Keyed

/-- Members of a list whose images are distinct are equal when their images are. -/
theorem nodup_map_eq {α β : Type} {f : α → β} : ∀ {l : List α}, (l.map f).Nodup → ∀ {a b : α}, a ∈ l → b ∈ l →
    f a = f b → a = b
  | [], _, _, _, member, _, _ => by simp at member
  | x :: l, nodup, a, b, first, second, same => by
    simp only [List.map_cons, List.nodup_cons, List.mem_map, not_exists, not_and] at nodup
    obtain ⟨fresh, nodup⟩ := nodup
    rcases List.mem_cons.mp first with rfl | inFirst <;> rcases List.mem_cons.mp second with rfl | inSecond
    · rfl
    · exact absurd same.symm (fresh b inSecond)
    · exact absurd same (fresh a inFirst)
    · exact nodup_map_eq nodup inFirst inSecond same

theorem scopeList_eq (m : ScopeMap) : scopeList m = values m := by unfold scopeList values; rfl

theorem scopes_eq (s : State) : s.scopes = scopeList s.scopeMap := rfl

/-- Two states with one scope map have one scope list. -/
theorem scopes_congr {s t : State} (same : t.scopeMap = s.scopeMap) : t.scopes = s.scopes := by
  rw [scopes_eq, scopes_eq, same]

/-- Every standing scope occurrence sits under its own key. -/
abbrev ScopesKeyed (m : ScopeMap) : Prop := KeyedOn ScopeOccurrence.id m

theorem mem_scopeList {m : ScopeMap} {scope : ScopeOccurrence} : scope ∈ scopeList m ↔ ∃ k : ScopeOccurrenceId, m[k]? = some scope :=
  mem_values

theorem mem_scopeList_keyed {m : ScopeMap} (keyed : ScopesKeyed m) {scope : ScopeOccurrence} :
    scope ∈ scopeList m ↔ m[scope.id]? = some scope :=
  mem_values_keyed keyed

/-- Two scope occurrences of the map with one key are one. -/
theorem ScopesKeyed.eq_of_id {m : ScopeMap} (keyed : ScopesKeyed m) {a b : ScopeOccurrence} (first : a ∈ scopeList m)
    (second : b ∈ scopeList m) (same : a.id = b.id) : a = b :=
  KeyedOn.eq_of_key keyed first second same

theorem scopeList_empty : scopeList (∅ : ScopeMap) = [] := values_empty

theorem scopesKeyed_empty : ScopesKeyed (∅ : ScopeMap) := keyedOn_empty

theorem scopesKeyed_insert {m : ScopeMap} (keyed : ScopesKeyed m) (scope : ScopeOccurrence) : ScopesKeyed (m.insert scope.id scope) :=
  keyedOn_insert keyed rfl

/-- `scopesKeyed_insert` for a writer that spells the key apart from the entry. -/
theorem scopesKeyed_insert_at {m : ScopeMap} (keyed : ScopesKeyed m) {k : ScopeOccurrenceId} {new : ScopeOccurrence}
    (named : new.id = k) : ScopesKeyed (m.insert k new) :=
  keyedOn_insert keyed named

theorem scopesKeyed_filter {m : ScopeMap} (keyed : ScopesKeyed m) (f : ScopeOccurrenceId → ScopeOccurrence → Bool) :
    ScopesKeyed (m.filter f) :=
  keyedOn_filter keyed f

theorem scopesKeyed_erase {m : ScopeMap} (keyed : ScopesKeyed m) (key : ScopeOccurrenceId) : ScopesKeyed (m.erase key) :=
  keyedOn_erase keyed key

theorem mem_scopeList_filter {m : ScopeMap} (keyed : ScopesKeyed m) {f : ScopeOccurrenceId → ScopeOccurrence → Bool}
    {scope : ScopeOccurrence} : scope ∈ scopeList (m.filter f) ↔ scope ∈ scopeList m ∧ f scope.id scope = true :=
  mem_values_filter keyed

/-- A filter that reads only the value needs no `ScopesKeyed`. -/
theorem mem_scopeList_filter_val {m : ScopeMap} {p : ScopeOccurrence → Bool} {scope : ScopeOccurrence} :
    scope ∈ scopeList (m.filter fun _ v => p v) ↔ scope ∈ scopeList m ∧ p scope = true :=
  mem_values_filter_val

/-- A filter that reads only the value filters the list view, in key order. -/
theorem scopeList_filter_val (m : ScopeMap) (p : ScopeOccurrence → Bool) :
    scopeList (m.filter fun _ v => p v) = (scopeList m).filter p :=
  values_filter_val m p

theorem mem_scopeList_insert {m : ScopeMap} (keyed : ScopesKeyed m) {new scope : ScopeOccurrence} :
    scope ∈ scopeList (m.insert new.id new) ↔ scope = new ∨ (scope ∈ scopeList m ∧ scope.id ≠ new.id) :=
  mem_values_insert keyed rfl

/-- `mem_scopeList_insert` for a writer that spells the key apart from the entry. -/
theorem mem_scopeList_insert_at {m : ScopeMap} (keyed : ScopesKeyed m) {k : ScopeOccurrenceId} {new scope : ScopeOccurrence}
    (named : new.id = k) : scope ∈ scopeList (m.insert k new) ↔ scope = new ∨ (scope ∈ scopeList m ∧ scope.id ≠ k) :=
  mem_values_insert keyed named

/-- An entry of a map with one more insert is the inserted one or an old one; no keying needed. -/
theorem mem_scopeList_insert_sub {m : ScopeMap} {k : ScopeOccurrenceId} {new scope : ScopeOccurrence}
    (member : scope ∈ scopeList (m.insert k new)) : scope = new ∨ scope ∈ scopeList m :=
  mem_values_insert_sub member

/-- An entry of a map with one more insert is an old one or the inserted one, in the order an appended list reads. -/
theorem mem_scopeList_insert_cases {m : ScopeMap} {k : ScopeOccurrenceId} {new scope : ScopeOccurrence}
    (member : scope ∈ scopeList (m.insert k new)) : scope ∈ scopeList m ∨ scope = new :=
  (mem_values_insert_sub member).symm

theorem mem_scopeList_insert_self {m : ScopeMap} {k : ScopeOccurrenceId} {new : ScopeOccurrence} :
    new ∈ scopeList (m.insert k new) :=
  mem_scopeList.mpr ⟨k, Std.ExtTreeMap.getElem?_insert_self⟩

/-- A scope occurrence under another key than the one inserted stays. -/
theorem mem_scopeList_insert_of {m : ScopeMap} (keyed : ScopesKeyed m) {k : ScopeOccurrenceId} {new old : ScopeOccurrence}
    (member : old ∈ scopeList m) (apart : old.id ≠ k) : old ∈ scopeList (m.insert k new) := by
  rw [mem_scopeList_keyed keyed] at member
  refine mem_scopeList.mpr ⟨old.id, ?_⟩
  rw [Std.ExtTreeMap.getElem?_insert, ite_eq_right fun same => apart (Std.LawfulEqCmp.eq_of_compare same).symm]
  exact member

/-- A standing key stays standing when a key no scope occurrence carries is inserted. -/
theorem mem_keys_insert_of {m : ScopeMap} (keyed : ScopesKeyed m) {k x : ScopeOccurrenceId} {new : ScopeOccurrence}
    (member : x ∈ (scopeList m).map (·.id)) (apart : ∀ entry ∈ scopeList m, entry.id ≠ k) :
    x ∈ (scopeList (m.insert k new)).map (·.id) := by
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp member
  exact List.mem_map_of_mem (mem_scopeList_insert_of keyed inside (apart entry inside))

/-- A key the map does not hold leaves every scope occurrence in place when inserted. -/
theorem mem_scopeList_insert_fresh {m : ScopeMap} (keyed : ScopesKeyed m) {new scope : ScopeOccurrence}
    (fresh : ∀ old ∈ scopeList m, old.id ≠ new.id) :
    scope ∈ scopeList (m.insert new.id new) ↔ scope ∈ scopeList m ∨ scope = new :=
  mem_values_insert_fresh keyed rfl fresh

theorem mem_scopeList_erase {m : ScopeMap} (keyed : ScopesKeyed m) {key : ScopeOccurrenceId} {scope : ScopeOccurrence} :
    scope ∈ scopeList (m.erase key) ↔ scope ∈ scopeList m ∧ scope.id ≠ key :=
  mem_values_erase keyed

/-- A map of one entry views as that entry: how a fresh instance holds its root. -/
@[simp] theorem mem_scopeList_single {k : ScopeOccurrenceId} {v scope : ScopeOccurrence} :
    scope ∈ scopeList ((∅ : ScopeMap).insert k v) ↔ scope = v :=
  mem_values_single

theorem scopeList_single {k : ScopeOccurrenceId} {v : ScopeOccurrence} : scopeList ((∅ : ScopeMap).insert k v) = [v] := by
  rw [scopeList_eq]; exact values_single

/-- The map of the scope occurrences `scopes`, each under its own key: how a witness writes a state's scopes. -/
abbrev ofScopes (scopes : List ScopeOccurrence) : ScopeMap := ofList ScopeOccurrence.id scopes

theorem scopesKeyed_ofScopes (scopes : List ScopeOccurrence) : ScopesKeyed (ofScopes scopes) := keyedOn_ofList scopes

@[simp] theorem mem_ofScopes {scopes : List ScopeOccurrence} (nodup : (scopes.map (·.id)).Nodup) {scope : ScopeOccurrence} :
    scope ∈ scopeList (ofScopes scopes) ↔ scope ∈ scopes :=
  mem_ofList nodup

/-- A keyed map's scope occurrences carry pairwise distinct keys. -/
theorem scopeList_nodup {m : ScopeMap} (keyed : ScopesKeyed m) : ((scopeList m).map (·.id)).Nodup := values_nodup keyed

/-- `after` holds some of `before`'s scope occurrences, each under the same key. -/
abbrev ScopesSub (after before : ScopeMap) : Prop := Sub after before

theorem ScopesSub.refl (m : ScopeMap) : ScopesSub m m := Sub.refl m

theorem ScopesSub.trans {a b c : ScopeMap} (one : ScopesSub b a) (two : ScopesSub c b) : ScopesSub c a := Sub.trans one two

theorem ScopesSub.filter (f : ScopeOccurrenceId → ScopeOccurrence → Bool) (m : ScopeMap) : ScopesSub (m.filter f) m :=
  Sub.filter f m

theorem ScopesSub.erase (key : ScopeOccurrenceId) (m : ScopeMap) : ScopesSub (m.erase key) m := Sub.erase key m

theorem ScopesSub.keyed {after before : ScopeMap} (sub : ScopesSub after before) (keyed : ScopesKeyed before) :
    ScopesKeyed after :=
  Sub.keyed sub keyed

theorem ScopesSub.subset {after before : ScopeMap} (sub : ScopesSub after before) : scopeList after ⊆ scopeList before :=
  Sub.subset sub

/-! ## The occurrence map -/

theorem occurrenceList_eq (m : OccurrenceMap) : occurrenceList m = values m := by unfold occurrenceList values; rfl

theorem occurrences_eq (s : State) : s.occurrences = occurrenceList s.occurrenceMap := rfl

/-- Two states with one occurrence map have one occurrence list. -/
theorem occurrences_congr {s t : State} (same : t.occurrenceMap = s.occurrenceMap) : t.occurrences = s.occurrences := by
  rw [occurrences_eq, occurrences_eq, same]

/-- Every issued occurrence sits under its own key. -/
abbrev OccurrencesKeyed (m : OccurrenceMap) : Prop := KeyedOn Occurrence.id m

theorem mem_occurrenceList {m : OccurrenceMap} {o : Occurrence} : o ∈ occurrenceList m ↔ ∃ k : OccurrenceId, m[k]? = some o :=
  mem_values

theorem mem_occurrenceList_keyed {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {o : Occurrence} :
    o ∈ occurrenceList m ↔ m[o.id]? = some o :=
  mem_values_keyed keyed

/-- Two occurrences of the map with one key are one. -/
theorem OccurrencesKeyed.eq_of_id {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {a b : Occurrence}
    (first : a ∈ occurrenceList m) (second : b ∈ occurrenceList m) (same : a.id = b.id) : a = b := by
  rw [occurrenceList_eq] at first second
  exact KeyedOn.eq_of_key keyed first second same

theorem occurrenceList_empty : occurrenceList (∅ : OccurrenceMap) = [] := values_empty

theorem occurrencesKeyed_empty : OccurrencesKeyed (∅ : OccurrenceMap) := keyedOn_empty

theorem occurrencesKeyed_insert {m : OccurrenceMap} (keyed : OccurrencesKeyed m) (o : Occurrence) :
    OccurrencesKeyed (m.insert o.id o) :=
  keyedOn_insert keyed rfl

theorem occurrencesKeyed_filter {m : OccurrenceMap} (keyed : OccurrencesKeyed m) (f : OccurrenceId → Occurrence → Bool) :
    OccurrencesKeyed (m.filter f) :=
  keyedOn_filter keyed f

theorem occurrencesKeyed_modify {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {new : Occurrence} :
    OccurrencesKeyed (m.modify new.id fun _ => new) := by
  intro k value h
  rw [Std.ExtTreeMap.getElem?_modify] at h
  split at h
  · rename_i e
    obtain ⟨_, _, rfl⟩ := Option.map_eq_some_iff.mp h
    exact Std.LawfulEqCmp.eq_of_compare e
  · exact keyed k value h

/-- A filter that reads only the value needs no `OccurrencesKeyed`. -/
theorem mem_occurrenceList_filter_val {m : OccurrenceMap} {p : Occurrence → Bool} {o : Occurrence} :
    o ∈ occurrenceList (m.filter fun _ v => p v) ↔ o ∈ occurrenceList m ∧ p o = true :=
  mem_values_filter_val

/-- A filter that reads only the value filters the list view, in key order. -/
theorem occurrenceList_filter_val (m : OccurrenceMap) (p : Occurrence → Bool) :
    occurrenceList (m.filter fun _ v => p v) = (occurrenceList m).filter p :=
  values_filter_val m p

theorem mem_occurrenceList_insert {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {new o : Occurrence} :
    o ∈ occurrenceList (m.insert new.id new) ↔ o = new ∨ (o ∈ occurrenceList m ∧ o.id ≠ new.id) :=
  mem_values_insert keyed rfl

/-- An entry of a map with one more insert is an old one or the inserted one; no keying needed. -/
theorem mem_occurrenceList_insert_sub {m : OccurrenceMap} {k : OccurrenceId} {new o : Occurrence}
    (member : o ∈ occurrenceList (m.insert k new)) : o ∈ occurrenceList m ∨ o = new :=
  (mem_values_insert_sub member).symm

theorem mem_occurrenceList_insert_self {m : OccurrenceMap} {k : OccurrenceId} {new : Occurrence} :
    new ∈ occurrenceList (m.insert k new) :=
  mem_occurrenceList.mpr ⟨k, Std.ExtTreeMap.getElem?_insert_self⟩

/-- An occurrence under another key than the one inserted stays. -/
theorem mem_occurrenceList_insert_of {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {k : OccurrenceId} {new old : Occurrence}
    (member : old ∈ occurrenceList m) (apart : old.id ≠ k) : old ∈ occurrenceList (m.insert k new) := by
  rw [mem_occurrenceList_keyed keyed] at member
  refine mem_occurrenceList.mpr ⟨old.id, ?_⟩
  rw [Std.ExtTreeMap.getElem?_insert, ite_eq_right fun same => apart (Std.LawfulEqCmp.eq_of_compare same).symm]
  exact member

/-- A key no occurrence carries leaves every occurrence in place when inserted. -/
theorem mem_occurrenceList_insert_fresh {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {new o : Occurrence}
    (fresh : ∀ old ∈ occurrenceList m, old.id ≠ new.id) :
    o ∈ occurrenceList (m.insert new.id new) ↔ o ∈ occurrenceList m ∨ o = new :=
  mem_values_insert_fresh keyed rfl fresh

/-- Replacing the occurrence under `new`'s key by `new`, when one stands there, replaces exactly that one. -/
theorem mem_occurrenceList_modify {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {new o : Occurrence}
    (present : ∃ old ∈ occurrenceList m, old.id = new.id) :
    o ∈ occurrenceList (m.modify new.id fun _ => new) ↔ o = new ∨ (o ∈ occurrenceList m ∧ o.id ≠ new.id) := by
  rw [mem_occurrenceList_keyed (occurrencesKeyed_modify keyed), Std.ExtTreeMap.getElem?_modify]
  obtain ⟨old, inside, named⟩ := present
  rw [mem_occurrenceList_keyed keyed] at inside ⊢
  constructor
  · intro h
    split at h
    · rename_i e
      obtain ⟨_, _, rfl⟩ := Option.map_eq_some_iff.mp h
      exact .inl rfl
    · rename_i e
      exact .inr ⟨h, fun eq => e (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro (rfl | ⟨h, ne⟩)
    · rw [ite_eq_left Std.ReflCmp.compare_self, ← named, inside]; rfl
    · have hc : ¬ compare new.id o.id = .eq := fun e => ne (Std.LawfulEqCmp.eq_of_compare e).symm
      rw [ite_eq_right hc]; exact h

theorem mem_occurrenceList_erase {m : OccurrenceMap} (keyed : OccurrencesKeyed m) {k : OccurrenceId} {o : Occurrence} :
    o ∈ occurrenceList (m.erase k) ↔ o ∈ occurrenceList m ∧ o.id ≠ k :=
  mem_values_erase keyed

/-- The map of the occurrences `occurrences`, each under its own key: how a witness writes a state's occurrences. -/
abbrev ofOccurrences (occurrences : List Occurrence) : OccurrenceMap := ofList Occurrence.id occurrences

@[simp] theorem mem_ofOccurrences_singleton {new o : Occurrence} : o ∈ occurrenceList (ofOccurrences [new]) ↔ o = new := by
  rw [occurrenceList_eq]; exact mem_values_single

/-- The list view of a map built from occurrences of distinct keys is those occurrences, up to order. -/
theorem occurrenceList_ofOccurrences_perm {occurrences : List Occurrence} (nodup : (occurrences.map (·.id)).Nodup) :
    (occurrenceList (ofOccurrences occurrences)).Perm occurrences :=
  (List.perm_ext_iff_of_nodup (nodup_of_map (key := Occurrence.id) (values_nodup (keyedOn_ofList occurrences)))
    (nodup_of_map nodup)).mpr fun _ => mem_ofList nodup

theorem occurrencesKeyed_ofOccurrences (occurrences : List Occurrence) : OccurrencesKeyed (ofOccurrences occurrences) :=
  keyedOn_ofList occurrences

@[simp] theorem mem_ofOccurrences {occurrences : List Occurrence} (nodup : (occurrences.map (·.id)).Nodup) {o : Occurrence} :
    o ∈ occurrenceList (ofOccurrences occurrences) ↔ o ∈ occurrences :=
  mem_ofList nodup

/-- A keyed map's occurrences carry pairwise distinct keys. -/
theorem occurrenceList_nodup {m : OccurrenceMap} (keyed : OccurrencesKeyed m) : ((occurrenceList m).map (·.id)).Nodup :=
  values_nodup keyed

/-- `after` holds some of `before`'s occurrences, each under the same key. -/
abbrev OccurrencesSub (after before : OccurrenceMap) : Prop := Sub after before

theorem OccurrencesSub.refl (m : OccurrenceMap) : OccurrencesSub m m := Sub.refl m

theorem OccurrencesSub.trans {a b c : OccurrenceMap} (one : OccurrencesSub b a) (two : OccurrencesSub c b) :
    OccurrencesSub c a :=
  Sub.trans one two

theorem OccurrencesSub.filter (f : OccurrenceId → Occurrence → Bool) (m : OccurrenceMap) : OccurrencesSub (m.filter f) m :=
  Sub.filter f m

theorem OccurrencesSub.keyed {after before : OccurrenceMap} (sub : OccurrencesSub after before)
    (keyed : OccurrencesKeyed before) : OccurrencesKeyed after :=
  Sub.keyed sub keyed

/-- A filter that reads only the value keeps a sublist of the list view. -/
theorem occurrenceList_filter_val_sublist (m : OccurrenceMap) (p : Occurrence → Bool) :
    (occurrenceList (m.filter fun _ v => p v)).Sublist (occurrenceList m) := by
  rw [occurrenceList_filter_val]; exact List.filter_sublist

end Kernel.Laws.State
