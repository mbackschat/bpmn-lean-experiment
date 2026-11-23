module

public import Kernel.State.Key
import all Kernel.State.Key

/-! # Laws of the kernel state: the spine and the scope occurrence key

What a `Spine` is (DC20): `push` keeps it well-formed, its cached depth and fingerprint are its path's, `same` is equality
of paths, the meeting point `meet` finds is the longest common prefix of two paths read outermost first, and
`compareOuter` is the outermost-first order of the full paths. None of it reads a fingerprint's value: a fingerprint only
rejects. Then the scope occurrence key: one key per path (`ext`), so laws name a key by its segments (`ofSegments`), and
its order is its reversed segments' (`compare_eq`). Then the unit key (DC4): one key per root and path (`ext`), `push`
injective with the parent `parent?` reads back, so two distinct units' batch keys are apart (`signalUnit_apart`,
`tokenUnit_apart`), its order the order of (depth, path fingerprint, root, path) (`compare_eq`) and its breadth-first
order that of (depth, root, path read outermost first) (`breadth_eq`). Nothing executable imports this module.
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

theorem child_segments (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Issue) :
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
theorem child_eq_iff {parent key : ScopeOccurrenceId} {element : ElementId} {ordinal : Issue} :
    parent.child element ordinal = key ↔ { element, ordinal } :: parent.segments = key.segments :=
  ⟨fun same => same ▸ rfl, fun same => ext same⟩

theorem eq_child_iff {parent key : ScopeOccurrenceId} {element : ElementId} {ordinal : Issue} :
    key = parent.child element ordinal ↔ key.segments = { element, ordinal } :: parent.segments :=
  ⟨fun same => same ▸ rfl, fun same => ext same⟩

/-- `up` is the key of the segments' tail. -/
@[simp] theorem up_eq {key : ScopeOccurrenceId} {segment : ScopeSegment} {rest : List ScopeSegment}
    (same : key.segments = segment :: rest) : key.up same = .ofSegments rest :=
  ext (by simp [ofSegments_segments])

/-- A child's parent is the key it was entered in. -/
@[simp] theorem parent?_child (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Issue) :
    (parent.child element ordinal).parent? = some parent := by
  rw [parent?_up (child_segments parent element ordinal)]
  exact congrArg some (ext rfl)

/-- The key order is the order of the segments read outermost first, so a subtree is one range of keys. -/
theorem compare_eq (a b : ScopeOccurrenceId) : compare a b = compare a.segments.reverse b.segments.reverse :=
  congrFun (congrFun ScopeOccurrenceId.outerOrder.property a) b

/-- An ancestor comes before its descendants. -/
theorem compare_child (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Issue) :
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

/-! ## Issues (DC12) -/

/-- Two numeral issues are the committed ordinals they name. -/
@[simp] theorem ofNat_inj (m n : Nat) : (no_index (OfNat.ofNat m : Issue)) = no_index (OfNat.ofNat n) ↔ m = n :=
  ⟨fun same => Issue.committed.inj same, fun same => same ▸ rfl⟩

/-- A committed ordinal is the numeral of the ordinal it names. -/
@[simp] theorem committed_eq_ofNat (m n : Nat) : Issue.committed m = no_index (OfNat.ofNat n : Issue) ↔ m = n :=
  ⟨fun same => Issue.committed.inj same, fun same => same ▸ rfl⟩

@[simp] theorem isFresh_fresh (unit : UnitKey) (index : Nat) : (Issue.fresh unit index).isFresh = true := by
  simp only [Issue.isFresh]

@[simp] theorem isFresh_committed (n : Nat) : (Issue.committed n).isFresh = false := by
  simp only [Issue.isFresh]

/-- A numeral is a committed ordinal. -/
@[simp] theorem isFresh_ofNat (n : Nat) : (no_index (OfNat.ofNat n : Issue)).isFresh = false := by
  simp only [Issue.isFresh]

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

@[simp] theorem ofRoot_root (root : UnitRoot) : (UnitKey.ofRoot root).root = root := by unfold UnitKey.ofRoot; rfl

/-- Root unit keys are equal exactly when their roots are, so the seed's is no other root's (DC4). -/
@[simp] theorem ofRoot_inj {a b : UnitRoot} : UnitKey.ofRoot a = UnitKey.ofRoot b ↔ a = b :=
  ⟨fun same => by simpa using congrArg UnitKey.root same, fun same => same ▸ rfl⟩

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

/-- Two steps of one batch compare as their kinds, then their indexes. -/
theorem compare_signal (a b : Nat) : compare (UnitStep.signal a) (UnitStep.signal b) = compare a b := by
  show compareLex (compareOn fun step : UnitStep => step.stepRank.1)
    (compareLex (compareOn fun step : UnitStep => step.stepRank.2.1) (compareOn fun step : UnitStep => step.stepRank.2.2))
    _ _ = _
  simp only [compareLex, compareOn, UnitStep.stepRank, Ordering.then, Std.ReflCmp.compare_self]
  split <;> simp_all

/-- Two units one unit queued run in breadth-first order as their steps compare: their paths differ only there. -/
theorem breadth_siblings (parent : UnitKey) (a b : UnitStep) :
    UnitKey.breadth.val (parent.push a) (parent.push b) = compare a b := by
  rw [breadth_eq]
  simp only [compareLex, compareOn, List.length_cons, List.reverse_cons, Std.ReflCmp.compare_self, Ordering.eq_then]
  generalize parent.path.reverse = path
  induction path with
  | nil => simp [List.compare_cons_cons]
  | cons x xs ih => simpa [List.compare_cons_cons, Std.ReflCmp.compare_self, Ordering.eq_then] using ih

@[simp] theorem batchIndex_token (index : Nat) : (UnitStep.token index).batchIndex = index := by
  simp [UnitStep.batchIndex, UnitStep.stepRank]

instance breadth_trans : Std.TransCmp UnitKey.breadth.val := by
  rw [UnitKey.breadth.property]
  exact inferInstanceAs <| Std.TransCmp (compareLex _ _)

/-- Breadth-first order is a strict total order on unit keys. -/
theorem breadth_lt_trans {a b c : UnitKey} (one : UnitKey.breadth.val a b = .lt) (two : UnitKey.breadth.val b c = .lt) :
    UnitKey.breadth.val a c = .lt :=
  Std.TransCmp.lt_trans one two

theorem breadth_total {a b : UnitKey} (apart : a ≠ b) :
    UnitKey.breadth.val a b = .lt ∨ UnitKey.breadth.val b a = .lt := by
  cases order : UnitKey.breadth.val a b with
  | lt => exact .inl rfl
  | eq => exact absurd (breadth_eq_eq.mp order) apart
  | gt => exact .inr (Std.OrientedCmp.gt_iff_lt.mp order)

/-- A signal unit names the unit that queued it and its index in that unit's batch. -/
theorem signalUnit_inj {u v : UnitKey} {i j : Nat} : u.signalUnit i = v.signalUnit j ↔ u = v ∧ i = j := by
  simp only [UnitKey.signalUnit, push_inj, UnitStep.signal.injEq]

/-- A token unit names the unit that queued it and its index in that unit's batch. -/
theorem tokenUnit_inj {u v : UnitKey} {i j : Nat} : u.tokenUnit i = v.tokenUnit j ↔ u = v ∧ i = j := by
  simp only [UnitKey.tokenUnit, push_inj, UnitStep.token.injEq]

/-- A signal's batch key is never a token's, whatever units queued them and at whatever indexes. -/
theorem signalUnit_ne_tokenUnit (u v : UnitKey) (i j : Nat) : u.signalUnit i ≠ v.tokenUnit j := fun same =>
  UnitStep.noConfusion (push_inj.mp same).2

/-- Batch-key apartness (probes P09 F6, P15 F8): two distinct units' batches share no key, at any indexes, so entries two
units queued never overwrite each other in a unit-keyed map. -/
theorem signalUnit_apart {u v : UnitKey} (apart : u ≠ v) (i j : Nat) : u.signalUnit i ≠ v.signalUnit j :=
  fun same => apart (signalUnit_inj.mp same).1

theorem tokenUnit_apart {u v : UnitKey} (apart : u ≠ v) (i j : Nat) : u.tokenUnit i ≠ v.tokenUnit j :=
  fun same => apart (tokenUnit_inj.mp same).1

end UnitKey

/-- Between two keys a lexicographic order puts in order and whose leading fields agree, every key agrees on that field,
and the rest of the order puts the three in order. -/
theorem lex_between {α β : Type} [Ord β] [Std.TransOrd β] [Std.LawfulEqOrd β] {f : α → β}
    {rest : α → α → Ordering} {a b c : α} (ab : compareLex (compareOn f) rest a b = .lt)
    (bc : compareLex (compareOn f) rest b c = .lt) (same : f a = f c) :
    f b = f a ∧ rest a b = .lt ∧ rest b c = .lt := by
  simp only [compareLex, compareOn] at ab bc
  cases h₁ : compare (f a) (f b) <;> cases h₂ : compare (f b) (f c) <;>
    simp only [h₁, h₂, Ordering.then, reduceCtorEq] at ab bc
  · rw [← same] at h₂
    have := Std.OrientedCmp.gt_of_lt h₁
    rw [h₂] at this
    cases this
  · rw [Std.LawfulEqCmp.eq_of_compare h₂, ← same] at h₁
    have := Std.OrientedCmp.gt_of_lt h₁
    rw [h₁] at this
    cases this
  · rw [← Std.LawfulEqCmp.eq_of_compare h₁, ← same] at h₂
    have := Std.OrientedCmp.gt_of_lt h₂
    rw [h₂] at this
    cases this
  · exact ⟨(Std.LawfulEqCmp.eq_of_compare h₁).symm, ab, bc⟩

namespace UnitStep

/-- The triangle numbers' step: the next one adds `n + 1`. -/
theorem triangle_succ (n : Nat) : (n + 1) * (n + 1 + 1) / 2 = n * (n + 1) / 2 + n + 1 := by
  have h : (n + 1) * (n + 1 + 1) = n * (n + 1) + 2 * (n + 1) := by
    simp only [Nat.add_mul, Nat.mul_add, Nat.mul_one, Nat.one_mul]
    omega
  rw [h]
  omega

theorem triangle_mono {n m : Nat} (le : n ≤ m) : n * (n + 1) / 2 ≤ m * (m + 1) / 2 := by
  induction le with
  | refl => exact Nat.le_refl _
  | step _ ih =>
    rename_i m _
    show _ ≤ (m + 1) * (m + 1 + 1) / 2
    rw [triangle_succ]
    omega

/-- **The Cantor pairing is injective**: the pair's sum is the triangle below the code, and the round the rest. -/
theorem cantorPair_inj {i r i' r' : Nat} (same : cantorPair i r = cantorPair i' r') : i = i' ∧ r = r' := by
  unfold cantorPair at same
  have a := triangle_succ (i + r)
  have b := triangle_succ (i' + r')
  rcases Nat.lt_trichotomy (i + r) (i' + r') with lt | eq | gt
  · have := triangle_mono (show i + r + 1 ≤ i' + r' from lt)
    omega
  · rw [eq] at same
    omega
  · have := triangle_mono (show i' + r' + 1 ≤ i + r from gt)
    omega

/-- **Distinct unit steps have distinct codes** (`UnitStep.stepCode`). -/
theorem stepCode_inj {a b : UnitStep} (same : a.stepCode = b.stepCode) : a = b := by
  have ra : a.stepRank.1 < 4 := by cases a <;> simp [UnitStep.stepRank]
  have rb : b.stepRank.1 < 4 := by cases b <;> simp [UnitStep.stepRank]
  unfold UnitStep.stepCode at same
  have ranks : a.stepRank.1 = b.stepRank.1 := by omega
  have pairs : cantorPair a.stepRank.2.1 a.stepRank.2.2 = cantorPair b.stepRank.2.1 b.stepRank.2.2 := by omega
  obtain ⟨indexes, rounds⟩ := cantorPair_inj pairs
  have ranked : a.stepRank = b.stepRank := Prod.ext ranks (Prod.ext indexes rounds)
  cases a <;> cases b <;> simp_all [UnitStep.stepRank]

/-- Distinct unit steps whose codes are below 2^64 have distinct fingerprint codes. -/
theorem code_inj {a b : UnitStep} (small : a.stepCode < 2 ^ 64) (small' : b.stepCode < 2 ^ 64)
    (same : SpineStep.code a = SpineStep.code b) : a = b := by
  change UInt64.ofNat a.stepCode = UInt64.ofNat b.stepCode at same
  have := congrArg UInt64.toNat same
  rw [UInt64.toNat_ofNat_of_lt' small, UInt64.toNat_ofNat_of_lt' small'] at this
  exact stepCode_inj this

end UnitStep

namespace Issue

theorem compare_eq (a b : Issue) :
    compare a b = compareLex (compareOn Issue.tag) (compareLex (compareOn Issue.number) (compareOn Issue.unit?)) a b :=
  rfl

/-- Between two fresh issues of one index whose units agree on depth, fingerprint and root lies only a fresh issue of
that index whose unit agrees with them: the issue order runs by index, then unit, and the unit order by those fields. -/
theorem between_fresh {u w : UnitKey} {i : Nat} {b : Issue} (ab : compare (Issue.fresh u i) b = .lt)
    (bc : compare b (Issue.fresh w i) = .lt) (length : u.path.length = w.path.length)
    (print : Spine.fingerprintOf u.path = Spine.fingerprintOf w.path) (root : u.root = w.root) :
    ∃ v, b = .fresh v i ∧ v.path.length = u.path.length ∧ Spine.fingerprintOf v.path = Spine.fingerprintOf u.path ∧
      v.root = u.root := by
  rw [compare_eq] at ab bc
  obtain ⟨tags, ab, bc⟩ := lex_between ab bc rfl
  obtain ⟨numbers, ab, bc⟩ := lex_between ab bc rfl
  cases b with
  | committed _ => simp [Issue.tag] at tags
  | fresh v j =>
    simp only [Issue.number] at numbers
    subst numbers
    change compare u v = .lt at ab
    change compare v w = .lt at bc
    rw [UnitKey.compare_eq] at ab bc
    obtain ⟨l, ab, bc⟩ := lex_between ab bc length
    obtain ⟨p, ab, bc⟩ := lex_between ab bc print
    obtain ⟨r, _, _⟩ := lex_between ab bc root
    exact ⟨v, rfl, l, p, r⟩

end Issue

end Kernel.Laws.State
