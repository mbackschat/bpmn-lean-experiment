module

public import Kernel.State.Key
import all Kernel.State.Key

/-! # Laws of the kernel state: the spine and the scope occurrence key

What a `Spine` is (DC20): `push` keeps it well-formed, its cached depth and fingerprint are its path's, `same` is equality
of paths, the meeting point `meet` finds is the longest common prefix of two paths read outermost first, and
`compareOuter` is the outermost-first order of the full paths. None of it reads a fingerprint's value: a fingerprint only
rejects. Then the scope occurrence key: one key per path (`ext`), so laws name a key by its segments (`ofSegments`), and
its order is its reversed segments' (`compare_eq`). Then the unit key (DC4): one key per root and path (`ext`), `push`
injective with the parent `parent?` reads back, its order the order of (depth, path fingerprint, root, path)
(`compare_eq`) and its breadth-first order that of (depth, root, path read outermost first) (`breadth_eq`). Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The spine -/

section Spine

variable {α : Type} [SpineStep α]

theorem Spine.level_eq {s : Spine α} (good : s.Good) : s.level = s.path.length := by
  cases s with
  | root => rfl
  | node => exact good.2.2.2.1

theorem Spine.fingerprint_eq {s : Spine α} (good : s.Good) : s.fingerprint = Spine.fingerprintOf s.path := by
  cases s with
  | root => rfl
  | node => exact good.2.2.2.2.1

/-- `push` keeps a spine well-formed and extends its path by the step. -/
theorem Spine.push_good {s : Spine α} (step : α) (good : s.Good) :
    (Spine.push step s).Good ∧ (Spine.push step s).path = step :: s.path :=
  (Spine.pushGood step ⟨s, good⟩).property

/-- The spine `ofPath` builds is `push`'s, segment by segment. -/
theorem Spine.ofPath_cons (step : α) (rest : List α) :
    (Spine.ofPath (step :: rest)).val = Spine.push step (Spine.ofPath rest).val := by
  simp only [Spine.ofPath, Spine.pushGood]

theorem Spine.ofPath_good (path : List α) : (Spine.ofPath path).val.Good ∧ (Spine.ofPath path).val.path = path :=
  (Spine.ofPath path).property

/-- Two well-formed spines are one node exactly when their paths are one. -/
theorem Spine.sameNode_iff [DecidableEq α] {a b : Spine α} (ga : a.Good) (gb : b.Good) :
    Spine.sameNode a b = true ↔ a.path = b.path := by
  constructor
  · intro h; simp only [Spine.sameNode, Bool.and_eq_true, decide_eq_true_eq] at h; exact h.2
  · intro h; simp [Spine.sameNode, Spine.level_eq ga, Spine.level_eq gb, Spine.fingerprint_eq ga, Spine.fingerprint_eq gb, h]

/-- The meeting point of two distinct well-formed nodes of one depth is the longest common prefix of their paths read
outermost first: `meet` stops at two nodes whose paths are one tail `m` below distinct steps, each a suffix of its
node's path, so `m` is common and the next steps differ. -/
theorem Spine.meet_prefix [Ord α] [Std.LawfulEqOrd α] [DecidableEq α] {a b : Spine α} (ga : a.Good) (gb : b.Good)
    (depths : a.level = b.level) (distinct : a.path ≠ b.path) :
    ∃ sa sb m, (Spine.meet a.level a b).1.path = sa :: m ∧ (Spine.meet a.level a b).2.path = sb :: m ∧
      (sa :: m) <:+ a.path ∧ (sb :: m) <:+ b.path ∧ sa ≠ sb :=
  Spine.outer.property.1 a.level a b ga gb depths distinct (Nat.le_refl _)

/-- `compareOuter` is the order of the full paths read outermost first, whatever the fingerprints. -/
theorem Spine.compareOuter_eq [Ord α] [Std.LawfulEqOrd α] [DecidableEq α] {a b : Spine α} (ga : a.Good) (gb : b.Good) :
    Spine.compareOuter a b = compare a.path.reverse b.path.reverse :=
  Spine.outer.property.2 a b ga gb

end Spine

/-! ## The scope occurrence key -/

namespace ScopeOccurrenceId

/-- A key is its segments: its spine is theirs. -/
theorem ext {a b : ScopeOccurrenceId} (same : a.segments = b.segments) : a = b := by
  obtain ⟨segments, spine, ok⟩ := a
  obtain ⟨segments', spine', ok'⟩ := b
  simp only at same
  subst same ok ok'
  rfl

theorem ext_iff {a b : ScopeOccurrenceId} : a = b ↔ a.segments = b.segments :=
  ⟨fun same => same ▸ rfl, ext⟩

@[simp] theorem ofSegments_segments (segments : List ScopeSegment) :
    (ScopeOccurrenceId.ofSegments segments).segments = segments := by
  unfold ScopeOccurrenceId.ofSegments; rfl

@[simp] theorem ofSegments_eta (key : ScopeOccurrenceId) : ScopeOccurrenceId.ofSegments key.segments = key :=
  ext (ofSegments_segments _)

@[simp] theorem ofSegments_inj {a b : List ScopeSegment} :
    ScopeOccurrenceId.ofSegments a = ScopeOccurrenceId.ofSegments b ↔ a = b :=
  ⟨fun same => by simpa only [ofSegments_segments] using congrArg ScopeOccurrenceId.segments same, fun same => same ▸ rfl⟩

/-- Every key is the key of its segments, so a law may destructure a key by its path. -/
theorem cases_on_segments {motive : ScopeOccurrenceId → Prop}
    (of : ∀ segments, motive (ScopeOccurrenceId.ofSegments segments)) (key : ScopeOccurrenceId) : motive key :=
  ofSegments_eta key ▸ of key.segments

/-- A key's parent is the key of its segments' tail. -/
@[simp] theorem parent?_cons (segment : ScopeSegment) (rest : List ScopeSegment) :
    (ScopeOccurrenceId.ofSegments (segment :: rest)).parent? = some (.ofSegments rest) := by
  unfold ScopeOccurrenceId.parent?
  split
  · next h => simp [ofSegments_segments] at h
  · next h =>
    simp only [ofSegments_segments, List.cons.injEq] at h
    exact congrArg some (ext (by simp [ofSegments_segments, h.2]))

@[simp] theorem parent?_nil : (ScopeOccurrenceId.ofSegments []).parent? = none := by
  unfold ScopeOccurrenceId.parent?
  split
  · rfl
  · next h => simp [ofSegments_segments] at h

/-- A key with a segment has a parent: its spine's, read in constant time (`up`). -/
theorem parent?_up {key : ScopeOccurrenceId} {segment : ScopeSegment} {rest : List ScopeSegment}
    (same : key.segments = segment :: rest) : key.parent? = some (key.up same) := by
  unfold ScopeOccurrenceId.parent?
  split
  · next h => simp [same] at h
  · next h =>
    rw [same, List.cons.injEq] at h
    exact congrArg some (ext (by simp [h.2]))

theorem parent?_cons_eq {key : ScopeOccurrenceId} {segment : ScopeSegment} {rest : List ScopeSegment}
    (same : key.segments = segment :: rest) : key.parent? = some (.ofSegments rest) := by
  rw [parent?_up same]
  exact congrArg some (ext (by simp [ofSegments_segments]))

/-- A key's parent is the key one segment shorter. -/
theorem parent?_eq_some {key parent : ScopeOccurrenceId} :
    key.parent? = some parent ↔ ∃ segment, key.segments = segment :: parent.segments := by
  unfold ScopeOccurrenceId.parent?
  split
  · next h => simp [h]
  · next segment rest h =>
    simp only [Option.some.injEq, h, List.cons.injEq]
    exact ⟨fun e => ⟨segment, rfl, e ▸ rfl⟩, fun ⟨_, _, e⟩ => ext e⟩

theorem child_segments (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Nat) :
    (parent.child element ordinal).segments = { element, ordinal } :: parent.segments := rfl

/-- The spine's depth is the path's length and its fingerprint the path's: the cached fields agree with the path. -/
theorem spine_level (key : ScopeOccurrenceId) : key.spine.level = key.segments.length := by
  have built := Spine.ofPath_good key.segments
  rw [← key.spineOk] at built
  rw [Spine.level_eq built.1, built.2]

theorem spine_fingerprint (key : ScopeOccurrenceId) : key.spine.fingerprint = Spine.fingerprintOf key.segments := by
  have built := Spine.ofPath_good key.segments
  rw [← key.spineOk] at built
  rw [Spine.fingerprint_eq built.1, built.2]

/-- Whether a key is a child reads its segments. -/
theorem child_eq_iff {parent key : ScopeOccurrenceId} {element : ElementId} {ordinal : Nat} :
    parent.child element ordinal = key ↔ { element, ordinal } :: parent.segments = key.segments :=
  ⟨fun same => same ▸ rfl, fun same => ext same⟩

theorem eq_child_iff {parent key : ScopeOccurrenceId} {element : ElementId} {ordinal : Nat} :
    key = parent.child element ordinal ↔ key.segments = { element, ordinal } :: parent.segments :=
  ⟨fun same => same ▸ rfl, fun same => ext same⟩

/-- `up` is the key of the segments' tail. -/
@[simp] theorem up_eq {key : ScopeOccurrenceId} {segment : ScopeSegment} {rest : List ScopeSegment}
    (same : key.segments = segment :: rest) : key.up same = .ofSegments rest :=
  ext (by simp [ofSegments_segments])

/-- A child's parent is the key it was entered in. -/
@[simp] theorem parent?_child (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Nat) :
    (parent.child element ordinal).parent? = some parent := by
  rw [parent?_up (child_segments parent element ordinal)]
  exact congrArg some (ext rfl)

/-- The key order is the order of the segments read outermost first, so a subtree is one range of keys. -/
theorem compare_eq (a b : ScopeOccurrenceId) : compare a b = compare a.segments.reverse b.segments.reverse :=
  congrFun (congrFun ScopeOccurrenceId.outerOrder.property a) b

/-- An ancestor comes before its descendants. -/
theorem compare_child (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Nat) :
    compare parent (parent.child element ordinal) = .lt := by
  rw [compare_eq, child_segments, List.reverse_cons, ← List.append_nil parent.segments.reverse,
    List.append_assoc, List.nil_append]
  generalize parent.segments.reverse = path
  induction path with
  | nil => rfl
  | cons x xs ih =>
    simp only [List.cons_append, List.compare_cons_cons, Std.ReflCmp.compare_self, Ordering.eq_then]
    exact ih

end ScopeOccurrenceId

/-! ## The unit key -/

namespace UnitKey

/-- A unit key is its root and path: its spine is theirs. -/
theorem ext {a b : UnitKey} (roots : a.root = b.root) (paths : a.path = b.path) : a = b := by
  obtain ⟨root, path, spine, ok⟩ := a
  obtain ⟨root', path', spine', ok'⟩ := b
  simp only at roots paths
  subst roots paths ok ok'
  rfl

theorem ext_iff {a b : UnitKey} : a = b ↔ a.root = b.root ∧ a.path = b.path :=
  ⟨fun same => same ▸ ⟨rfl, rfl⟩, fun ⟨roots, paths⟩ => ext roots paths⟩

/-- The spine's depth is the path's length and its fingerprint the path's, by the spine laws alone. -/
theorem spine_level (key : UnitKey) : key.spine.level = key.path.length := by
  have built := Spine.ofPath_good key.path
  rw [← key.spineOk] at built
  rw [Spine.level_eq built.1, built.2]

theorem spine_fingerprint (key : UnitKey) : key.spine.fingerprint = Spine.fingerprintOf key.path := by
  have built := Spine.ofPath_good key.path
  rw [← key.spineOk] at built
  rw [Spine.fingerprint_eq built.1, built.2]

@[simp] theorem push_root (parent : UnitKey) (step : UnitStep) : (parent.push step).root = parent.root := rfl

@[simp] theorem push_path (parent : UnitKey) (step : UnitStep) : (parent.push step).path = step :: parent.path := rfl

@[simp] theorem ofRoot_path (root : UnitRoot) : (UnitKey.ofRoot root).path = [] := by unfold UnitKey.ofRoot; rfl

/-- Pushing is injective: a unit names the unit that queued it and its step. -/
theorem push_inj {a b : UnitKey} {x y : UnitStep} : a.push x = b.push y ↔ a = b ∧ x = y := by
  simp only [ext_iff, List.cons.injEq]
  exact ⟨fun ⟨roots, steps, paths⟩ => ⟨⟨roots, paths⟩, steps⟩, fun ⟨⟨roots, paths⟩, steps⟩ => ⟨roots, steps, paths⟩⟩

/-- A pushed key's parent is the key it was pushed on, with its step; a root has none. -/
@[simp] theorem parent?_push (parent : UnitKey) (step : UnitStep) : (parent.push step).parent? = some (parent, step) := by
  simp only [UnitKey.parent?, Option.some.injEq, Prod.mk.injEq, and_true]
  exact ext rfl rfl

@[simp] theorem parent?_ofRoot (root : UnitRoot) : (UnitKey.ofRoot root).parent? = none := by
  unfold UnitKey.ofRoot; rfl

/-- A pushed key is never a root. -/
theorem push_ne_ofRoot (parent : UnitKey) (step : UnitStep) (root : UnitRoot) : parent.push step ≠ .ofRoot root :=
  fun same => by simpa using congrArg UnitKey.path same

/-- The unit-key order is the order of (depth, path fingerprint, root, path): the cached fields only split it. -/
theorem compare_eq (a b : UnitKey) : compare a b =
    compareLex (compareOn (·.path.length)) (compareLex (compareOn (Spine.fingerprintOf ·.path))
      (compareLex (compareOn (·.root)) (compareOn (·.path)))) a b :=
  congrFun (congrFun UnitKey.unitOrder.property a) b

/-- Breadth-first order is the order of (depth, root, path read outermost first). -/
theorem breadth_eq (a b : UnitKey) : UnitKey.breadth.val a b =
    compareLex (compareOn (·.path.length)) (compareLex (compareOn (·.root)) (compareOn (·.path.reverse))) a b :=
  congrFun (congrFun UnitKey.breadth.property a) b

/-- Breadth-first order decides equality: it is `.eq` only on one key. -/
theorem breadth_eq_eq {a b : UnitKey} : UnitKey.breadth.val a b = .eq ↔ a = b := by
  rw [breadth_eq, compareLex_eq_eq, compareLex_eq_eq]
  constructor
  · intro ⟨_, roots, paths⟩
    exact ext (Std.LawfulEqOrd.eq_of_compare roots)
      (List.reverse_inj.mp (Std.LawfulEqOrd.eq_of_compare paths))
  · intro same
    subst same
    exact ⟨Std.ReflCmp.compare_self, Std.ReflCmp.compare_self, Std.ReflCmp.compare_self⟩

/-- A unit runs before every unit it queued in breadth-first order: fewer steps first. -/
theorem breadth_push (parent : UnitKey) (step : UnitStep) : UnitKey.breadth.val parent (parent.push step) = .lt := by
  rw [breadth_eq]
  simp [compareLex, compareOn, Ordering.then, compare, compareOfLessAndEq]

end UnitKey

end Kernel.Laws.State
