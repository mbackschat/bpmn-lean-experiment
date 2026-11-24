module

public import Kernel.State
public import Kernel.Laws.State.Keyed
import all Kernel.State.Occurrence

/-! # Laws of the scope map

The standing scope occurrences are a `Std.ExtTreeMap` keyed by `ScopeOccurrenceId` (DC21), from
`Kernel.State.Occurrence`, whose bodies only this module sees; `State.scopes` is the list view `scopeList` in key order.
This module names the scope occurrence's key for `Laws.State.Keyed`'s map laws, so every other law reasons about
membership in `s.scopes`. `ScopesKeyed` states that each scope occurrence sits under its own `id`, which every writer
keeps (`State.enterScope` inserts an entry under its `id`, the removals filter, `State.enterCalled` keeps the `id`).
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

end Kernel.Laws.State
