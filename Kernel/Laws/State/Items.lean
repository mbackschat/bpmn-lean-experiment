module

public import Kernel.State
import all Kernel.State.Items

/-! # Laws of the open-item map

The open items are a `Std.ExtTreeMap` keyed by `ItemKey` (KD1), from `Kernel.State.Items`, whose bodies only this
module sees. The laws read them as the list `itemList s.openItems`; this module turns the map's point lemmas into
membership in that list, once, so every other law reasons about membership. `KeyedBy` states that each value carries its own key, which every writer keeps (`State.putItem` inserts an item under
its `id`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- Every open item sits under its own key. -/
def KeyedBy (m : OpenItems) : Prop := ∀ (k : ItemKey) (item : OpenItem), m[k]? = some item → item.id = k

theorem mem_itemList {m : OpenItems} {item : OpenItem} : item ∈ itemList m ↔ ∃ k : ItemKey, m[k]? = some item := by
  simp [itemList, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some]

theorem mem_itemList_keyed {m : OpenItems} (keyed : KeyedBy m) {item : OpenItem} :
    item ∈ itemList m ↔ m[item.id]? = some item := by
  rw [mem_itemList]
  constructor
  · rintro ⟨k, h⟩; rwa [keyed k item h]
  · exact fun h => ⟨_, h⟩

/-- Two items of the map with one key are one item. -/
theorem KeyedBy.eq_of_id {m : OpenItems} (keyed : KeyedBy m) {a b : OpenItem} (first : a ∈ itemList m)
    (second : b ∈ itemList m) (same : a.id = b.id) : a = b := by
  rw [mem_itemList_keyed keyed] at first second
  rw [same] at first
  exact Option.some.inj (first.symm.trans second)

theorem itemList_empty : itemList (∅ : OpenItems) = [] := by simp [itemList]

theorem keyedBy_empty : KeyedBy (∅ : OpenItems) := by intro k item h; simp at h

theorem keyedBy_insert {m : OpenItems} (keyed : KeyedBy m) (item : OpenItem) : KeyedBy (m.insert item.id item) := by
  intro k v h
  rw [Std.ExtTreeMap.getElem?_insert] at h
  split at h
  · rename_i e; cases h; exact (Std.LawfulEqCmp.eq_of_compare e)
  · exact keyed k v h

theorem keyedBy_filter {m : OpenItems} (keyed : KeyedBy m) (f : ItemKey → OpenItem → Bool) : KeyedBy (m.filter f) := by
  intro k v h
  rw [Std.ExtTreeMap.getElem?_filter'] at h
  exact keyed k v (Option.eq_some_of_filter_eq_some h)

theorem keyedBy_erase {m : OpenItems} (keyed : KeyedBy m) (key : ItemKey) : KeyedBy (m.erase key) := by
  intro k v h
  rw [Std.ExtTreeMap.getElem?_erase] at h
  split at h
  · cases h
  · exact keyed k v h

theorem mem_itemList_filter {m : OpenItems} (keyed : KeyedBy m) {f : ItemKey → OpenItem → Bool} {item : OpenItem} :
    item ∈ itemList (m.filter f) ↔ item ∈ itemList m ∧ f item.id item = true := by
  rw [mem_itemList_keyed (keyedBy_filter keyed f), mem_itemList_keyed keyed, Std.ExtTreeMap.getElem?_filter']
  simp only [Option.filter_eq_some_iff]

theorem mem_itemList_insert {m : OpenItems} (keyed : KeyedBy m) {new item : OpenItem} :
    item ∈ itemList (m.insert new.id new) ↔ item = new ∨ (item ∈ itemList m ∧ item.id ≠ new.id) := by
  rw [mem_itemList_keyed (keyedBy_insert keyed new), mem_itemList_keyed keyed, Std.ExtTreeMap.getElem?_insert]
  constructor
  · intro h
    split at h
    · rename_i e; cases h; exact .inl rfl
    · rename_i e
      exact .inr ⟨h, fun eq => e (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro (rfl | ⟨h, ne⟩)
    · simp
    · have hc : ¬ compare new.id item.id = .eq := fun e => ne (Std.LawfulEqCmp.eq_of_compare e).symm
      simp [hc, h]

theorem mem_itemList_erase {m : OpenItems} (keyed : KeyedBy m) {key : ItemKey} {item : OpenItem} :
    item ∈ itemList (m.erase key) ↔ item ∈ itemList m ∧ item.id ≠ key := by
  rw [mem_itemList_keyed (keyedBy_erase keyed key), mem_itemList_keyed keyed, Std.ExtTreeMap.getElem?_erase]
  constructor
  · intro h
    split at h
    · cases h
    · rename_i e
      exact ⟨h, fun eq => e (by rw [eq]; exact Std.ReflCmp.compare_self)⟩
  · rintro ⟨h, ne⟩
    have hc : ¬ compare key item.id = .eq := fun e => ne (Std.LawfulEqCmp.eq_of_compare e).symm
    simp [hc, h]

/-- A key the map does not hold leaves every item in place when inserted. -/
theorem mem_itemList_insert_fresh {m : OpenItems} (keyed : KeyedBy m) {new item : OpenItem}
    (fresh : ∀ old ∈ itemList m, old.id ≠ new.id) :
    item ∈ itemList (m.insert new.id new) ↔ item ∈ itemList m ∨ item = new := by
  rw [mem_itemList_insert keyed]
  constructor
  · rintro (h | ⟨h, _⟩); exact .inr h; exact .inl h
  · rintro (h | h); exact .inr ⟨h, fresh item h⟩; exact .inl h

/-- The map of the items `items`, each under its own key: how a witness writes a state's open items. -/
def ofItems (items : List OpenItem) : OpenItems := items.foldl (fun m item => m.insert item.id item) ∅

theorem keyedBy_foldl (items : List OpenItem) {m : OpenItems} (keyed : KeyedBy m) :
    KeyedBy (items.foldl (fun m item => m.insert item.id item) m) := by
  induction items generalizing m with
  | nil => exact keyed
  | cons item rest ih => exact ih (keyedBy_insert keyed item)

theorem keyedBy_ofItems (items : List OpenItem) : KeyedBy (ofItems items) := keyedBy_foldl items keyedBy_empty

theorem mem_foldl {items : List OpenItem} {m : OpenItems} (keyed : KeyedBy m) (nodup : (items.map (·.id)).Nodup)
    (fresh : ∀ old ∈ itemList m, ∀ new ∈ items, old.id ≠ new.id) {item : OpenItem} :
    item ∈ itemList (items.foldl (fun m item => m.insert item.id item) m) ↔ item ∈ itemList m ∨ item ∈ items := by
  induction items generalizing m with
  | nil => simp
  | cons new rest ih =>
    simp only [List.map_cons, List.nodup_cons, List.mem_map] at nodup
    simp only [List.foldl_cons]
    have fresh' : ∀ old ∈ itemList (m.insert new.id new), ∀ next ∈ rest, old.id ≠ next.id := by
      intro old member next inRest
      rcases (mem_itemList_insert keyed).mp member with rfl | ⟨member, _⟩
      · exact fun eq => nodup.1 ⟨next, inRest, eq.symm⟩
      · exact fresh old member next (List.mem_cons_of_mem _ inRest)
    rw [ih (keyedBy_insert keyed new) nodup.2 fresh', mem_itemList_insert_fresh keyed
      (fun old member => fresh old member new (List.mem_cons_self ..))]
    simp only [List.mem_cons]
    constructor
    · rintro ((h | h) | h) <;> simp_all
    · rintro (h | h | h) <;> simp_all

@[simp] theorem mem_ofItems_singleton {new item : OpenItem} : item ∈ itemList (ofItems [new]) ↔ item = new := by
  simp [ofItems, mem_itemList_insert keyedBy_empty, itemList_empty]

/-- Two states with one item map have one item list. -/
theorem items_congr {s t : State} (same : t.openItems = s.openItems) : itemList t.openItems = itemList s.openItems := by
  rw [same]

theorem items_same {s t : State} {item : OpenItem} (member : item ∈ itemList t.openItems)
    (same : t.openItems = s.openItems) : item ∈ itemList s.openItems := items_congr same ▸ member

/-- The items in opening order are the items: `itemsByPosition` only orders them. -/
@[simp] theorem mem_itemsByPosition {m : OpenItems} {item : OpenItem} : item ∈ itemsByPosition m ↔ item ∈ itemList m := by
  unfold itemsByPosition; exact List.mem_mergeSort

@[simp] theorem mem_ofItems {items : List OpenItem} (nodup : (items.map (·.id)).Nodup) {item : OpenItem} :
    item ∈ itemList (ofItems items) ↔ item ∈ items := by
  rw [ofItems, mem_foldl keyedBy_empty nodup (by simp [itemList_empty])]
  simp [itemList_empty]

/-- `after`'s items are some of `before`'s, each under the same key, and the item counters are unchanged: what an
operation that only closes items does to the open-item map. -/
structure ItemsNarrow (after before : OpenItems) (afterOrdinals beforeOrdinals : Std.ExtTreeMap Nat Nat compare) :
    Prop where
  sub : ∀ (k : ItemKey) (item : OpenItem), after[k]? = some item → before[k]? = some item
  ordinals : ∀ o, beforeOrdinals.getD o 0 ≤ afterOrdinals.getD o 0

theorem ItemsNarrow.refl (m : OpenItems) {o : Std.ExtTreeMap Nat Nat compare} : ItemsNarrow m m o o :=
  ⟨fun _ _ h => h, fun _ => Nat.le_refl _⟩

theorem ItemsNarrow.filter (f : ItemKey → OpenItem → Bool) {m : OpenItems} {o : Std.ExtTreeMap Nat Nat compare} :
    ItemsNarrow (m.filter f) m o o :=
  ⟨fun k item h => by rw [Std.ExtTreeMap.getElem?_filter'] at h; exact Option.eq_some_of_filter_eq_some h,
    fun _ => Nat.le_refl _⟩

theorem ItemsNarrow.erase (key : ItemKey) {m : OpenItems} {o : Std.ExtTreeMap Nat Nat compare} :
    ItemsNarrow (m.erase key) m o o :=
  ⟨fun k item h => by
    rw [Std.ExtTreeMap.getElem?_erase] at h
    split at h
    · cases h
    · exact h, fun _ => Nat.le_refl _⟩

theorem ItemsNarrow.keyed {after before : OpenItems} {o o' : Std.ExtTreeMap Nat Nat compare}
    (narrow : ItemsNarrow after before o o') (keyed : KeyedBy before) : KeyedBy after :=
  fun k item h => keyed k item (narrow.sub k item h)

theorem ItemsNarrow.subset {after before : OpenItems} {o o' : Std.ExtTreeMap Nat Nat compare}
    (narrow : ItemsNarrow after before o o') : itemList after ⊆ itemList before := by
  intro item member
  obtain ⟨k, h⟩ := mem_itemList.mp member
  exact mem_itemList.mpr ⟨k, narrow.sub k item h⟩

theorem ItemsNarrow.trans {a b c : OpenItems} {oa ob oc : Std.ExtTreeMap Nat Nat compare}
    (one : ItemsNarrow b a ob oa) (two : ItemsNarrow c b oc ob) : ItemsNarrow c a oc oa :=
  ⟨fun k item h => one.sub k item (two.sub k item h), fun o => Nat.le_trans (one.ordinals o) (two.ordinals o)⟩

/-- `after` holds some of `before`'s items, each under the same key. -/
def ItemsSub (after before : OpenItems) : Prop := ∀ (k : ItemKey) (item : OpenItem), after[k]? = some item → before[k]? = some item

theorem ItemsSub.refl (m : OpenItems) : ItemsSub m m := fun _ _ h => h

theorem ItemsSub.trans {a b c : OpenItems} (one : ItemsSub b a) (two : ItemsSub c b) : ItemsSub c a :=
  fun k item h => one k item (two k item h)

theorem ItemsSub.filter (f : ItemKey → OpenItem → Bool) (m : OpenItems) : ItemsSub (m.filter f) m :=
  (ItemsNarrow.filter f (o := ∅)).sub

theorem ItemsSub.keyed {after before : OpenItems} (sub : ItemsSub after before) (keyed : KeyedBy before) :
    KeyedBy after :=
  fun k item h => keyed k item (sub k item h)

theorem ItemsSub.subset {after before : OpenItems} (sub : ItemsSub after before) : itemList after ⊆ itemList before :=
  (show ItemsNarrow after before ∅ ∅ from ⟨sub, fun _ => Nat.le_refl _⟩).subset

/-- What `ItemsSub` keeps, read over the states' item lists. -/
theorem ItemsSub.items {before after : State} (sub : ItemsSub after.openItems before.openItems) :
    itemList after.openItems ⊆ itemList before.openItems := sub.subset

/-- The ordinal clause of `IssuedBelow` carries to a state whose items are some of `before`'s, whose occurrences are
some of `before`'s, and whose counters agree with `before`'s on every occurrence that stays. -/
theorem issuedItems_transport {before after : State} (sub : ItemsSub after.openItems before.openItems)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence ∈ before.occurrences)
    (ordinals : ∀ occurrence ∈ after.occurrences,
      after.itemOrdinals.getD occurrence.id 0 = before.itemOrdinals.getD occurrence.id 0)
    (issued : ∀ item ∈ itemList before.openItems, (∃ occurrence ∈ before.occurrences, occurrence.id = item.id.occurrence) →
      item.id.ordinal < before.itemOrdinals.getD item.id.occurrence 0) :
    ∀ item ∈ itemList after.openItems, (∃ occurrence ∈ after.occurrences, occurrence.id = item.id.occurrence) →
      item.id.ordinal < after.itemOrdinals.getD item.id.occurrence 0 := by
  rintro item member ⟨occurrence, present, same⟩
  rw [← same, ordinals occurrence present, same]
  exact issued item (sub.subset member) ⟨occurrence, occurrences occurrence present, same⟩

theorem getD_filter_keep {α : Type} [Ord α] [Std.TransOrd α] [Std.LawfulEqOrd α] {m : Std.ExtTreeMap α Nat compare}
    {f : α → Nat → Bool} {k : α} {d : Nat}
    (keepK : ∀ v, f k v = true) : (m.filter f).getD k d = m.getD k d := by
  rw [Std.ExtTreeMap.getD_filter', Std.ExtTreeMap.getD_eq_getD_getElem?]
  cases m[k]? <;> simp [Option.filter, keepK]

theorem filter_erase_comm (m : Std.ExtTreeMap Nat Nat compare) (f : Nat → Nat → Bool) (id : Nat) :
    (m.erase id).filter f = (m.filter f).erase id := by
  apply Std.ExtTreeMap.ext_getElem?
  intro k
  simp only [Std.ExtTreeMap.getElem?_filter', Std.ExtTreeMap.getElem?_erase]
  split <;> rfl

/-- A filter that reads only the value needs no `KeyedBy`. -/
theorem mem_itemList_filter_val {m : OpenItems} {p : OpenItem → Bool} {item : OpenItem} :
    item ∈ itemList (m.filter fun _ v => p v) ↔ item ∈ itemList m ∧ p item = true := by
  simp only [mem_itemList, Std.ExtTreeMap.getElem?_filter', Option.filter_eq_some_iff]
  constructor
  · rintro ⟨k, h, hp⟩; exact ⟨⟨k, h⟩, hp⟩
  · rintro ⟨⟨k, h⟩, hp⟩; exact ⟨k, h, hp⟩

theorem mem_itemList_map {m : OpenItems} {g : OpenItem → OpenItem} {item : OpenItem} :
    item ∈ itemList (m.map fun _ v => g v) ↔ ∃ old ∈ itemList m, g old = item := by
  simp only [mem_itemList, Std.ExtTreeMap.getElem?_map, Option.map_eq_some_iff]
  constructor
  · rintro ⟨k, old, h, rfl⟩; exact ⟨old, ⟨k, h⟩, rfl⟩
  · rintro ⟨old, ⟨k, h⟩, rfl⟩; exact ⟨k, old, h, rfl⟩

theorem keyedBy_map {m : OpenItems} (keyed : KeyedBy m) {g : OpenItem → OpenItem} (ids : ∀ v, (g v).id = v.id) :
    KeyedBy (m.map fun _ v => g v) := by
  intro k item h
  rw [Std.ExtTreeMap.getElem?_map, Option.map_eq_some_iff] at h
  obtain ⟨old, h, rfl⟩ := h
  rw [ids]; exact keyed k old h

theorem getD_bump (m : Std.ExtTreeMap Nat Nat compare) (o k : Nat) :
    m.getD k 0 ≤ (m.insert o (m.getD o 0 + 1)).getD k 0 := by
  rw [Std.ExtTreeMap.getD_insert]
  split
  · rename_i e; have := Std.LawfulEqCmp.eq_of_compare e; subst this; omega
  · exact Nat.le_refl _

theorem getD_bump_self (m : Std.ExtTreeMap Nat Nat compare) (o : Nat) :
    (m.insert o (m.getD o 0 + 1)).getD o 0 = m.getD o 0 + 1 := by
  simp

theorem getD_erase_ne {m : Std.ExtTreeMap Nat Nat compare} {id k d : Nat} (other : k ≠ id) :
    (m.erase id).getD k d = m.getD k d := by
  rw [Std.ExtTreeMap.getD_erase]
  split
  · rename_i e; exact absurd (Std.LawfulEqCmp.eq_of_compare e).symm other
  · rfl

end Kernel.Laws.State
