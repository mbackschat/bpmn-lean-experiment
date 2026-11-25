module

public import Kernel.IL.Types
public import Kernel.State.KeyOrder
public import Kernel.State.Root

/-! # Scope occurrence and occurrence keys

A scope occurrence's identity is structural (KD1): the key of the scope occurrence it was entered in, the element it
was entered for and its issue (`Issue`), once committed an ordinal counted per (parent, element) by
`State.scopeOrdinals`, so no global counter issues it. The process root is the empty key. An occurrence's identity is the
scope occurrence key it was issued in, its element and its issue, once committed an ordinal counted the same way by
`State.occurrenceOrdinals`. Inside a closure every identity is issued as the running unit's key and its index among the
unit's issues, the same in every schedule, and the commit renames it to its committed ordinal (DC12, `Step.compact`;
the committed forms and the issue slots are `Kernel.State.Issue`'s). A scope occurrence key carries its path as a
`Spine` (DC20), whose cached depth and fingerprint and whose jump pointers only accelerate: equality rejects on the
cached fields and the order meets two keys in O(log depth), and both decide on the full path. Each key has a lawful order, so
maps may key on it, and an order that reads only the key's value: no site may read it as an order of entry. Scope
occurrence keys order outermost first, so a subtree is one key range (KD1). An occurrence's public key (`OccurrenceKey`)
is not structural: its process instance, element, activation and role (`ActivationRole`), the activation counted per
role. A closure's unit key (DC4) is a structured
root and a path of unit steps (`Kernel.State.Root`) on the same spine, ordered by depth, fingerprint, root and path, with the breadth-first
order the closure runs signals in beside it. `scripts/kernel-effects.lean` holds the spine to `Spine.push` and the
comparators to the key-order contract (KD7). Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- A path from a root, innermost step first, as a chain of nodes (DC20): each node holds its step, its path, its depth,
a cached 64-bit fingerprint, its parent and a skew-binary jump pointer to an ancestor (Myers 1983), so a node's ancestor
at a given depth, and the meeting point of two nodes, are reached in O(log depth) steps. The cached fields and pointers
only accelerate: every order and every equality that reads them compares the full path last, and no law reads the
fingerprint (T60 F3). Built only by `Spine.push` (KD7's guard). Generic over its step, so a unit key's path can take the
same form. No derived instance: one would walk the ancestors once per pointer. -/
inductive Spine (α : Type) where
  | root
  | node (step : α) (path : List α) (depth : Nat) (fingerprint : UInt64) (parent jump : Spine α)

namespace Spine

variable {α : Type}

/-- The steps from this node up to the root, innermost first. -/
def path : Spine α → List α
  | .root => []
  | .node _ path _ _ _ _ => path

/-- The node's depth, cached: its path's length (`Kernel.Laws.State.Spine.level_eq`). -/
def level : Spine α → Nat
  | .root => 0
  | .node _ _ depth _ _ _ => depth

def fingerprint : Spine α → UInt64
  | .root => 0
  | .node _ _ _ fingerprint _ _ => fingerprint

/-- The node the node was pushed onto; the root's is the root. -/
def parentNode : Spine α → Spine α
  | .root => .root
  | .node _ _ _ _ parent _ => parent

def jump : Spine α → Spine α
  | .root => .root
  | .node _ _ _ _ _ jump => jump

/-- One fingerprint step: a bijection on the fingerprint for each step (xor, then an odd factor modulo 2^64). -/
def fingerprintStep [SpineStep α] (fingerprint : UInt64) (step : α) : UInt64 :=
  (fingerprint ^^^ SpineStep.code step) * 0x9E3779B97F4A7C15

/-- The fingerprint of a path, innermost step first: what a node caches. -/
def fingerprintOf [SpineStep α] : List α → UInt64
  | [] => 0
  | step :: rest => fingerprintStep (fingerprintOf rest) step

/-- The node `step` below `parent`. Its jump is the parent's jump's jump when the parent's two jumps span equal
distances, else the parent, so the jump distance depends on the depth alone. -/
def push [SpineStep α] (step : α) (parent : Spine α) : Spine α :=
  .node step (step :: parent.path) (parent.level + 1) (fingerprintStep parent.fingerprint step) parent <|
    match parent with
    | .root => .root
    | .node _ _ depth _ _ jump => if depth - jump.level == jump.level - jump.jump.level then jump.jump else parent

/-- What `push` keeps of every node: its parent and jump are well-formed, its path extends its parent's by its step,
its depth and fingerprint are its path's, and its jump is an ancestor of its parent. -/
def Good [SpineStep α] : Spine α → Prop
  | .root => True
  | .node step path depth fingerprint parent jump => Good parent ∧ Good jump ∧ path = step :: parent.path ∧
      depth = path.length ∧ fingerprint = fingerprintOf path ∧ jump.path <:+ parent.path

/-- `push` onto a well-formed spine, with the result's well-formedness proved inline (guard 6 keeps theorems out of
executable modules), so `ofPath` and the laws share one proof. -/
def pushGood [SpineStep α] (step : α) (parent : { spine : Spine α // spine.Good }) :
    { spine : Spine α // spine.Good ∧ spine.path = step :: parent.val.path } :=
  ⟨push step parent.val, by
    obtain ⟨parent, good⟩ := parent
    have levelOf : ∀ spine : Spine α, spine.Good → spine.level = spine.path.length := by
      intro spine good
      cases spine with
      | root => rfl
      | node => exact good.2.2.2.1
    have fingerprint : ∀ spine : Spine α, spine.Good → spine.fingerprint = fingerprintOf spine.path := by
      intro spine good
      cases spine with
      | root => rfl
      | node => exact good.2.2.2.2.1
    refine ⟨⟨good, ?_, rfl, ?_, ?_, ?_⟩, rfl⟩
    · cases parent with
      | root => trivial
      | node _ _ _ _ _ jump =>
        dsimp only
        split
        · cases jump with
          | root => trivial
          | node => exact good.2.1.2.1
        · exact good
    · simp [levelOf _ good]
    · simp [fingerprintOf, fingerprint _ good]
    · cases parent with
      | root => exact List.nil_suffix
      | node _ path' _ _ parent' jump =>
        dsimp only
        split
        · cases jump with
          | root => exact List.nil_suffix
          | node _ jumpPath' _ _ jumpParent _ =>
            obtain ⟨_, ⟨_, _, jumpPath, ⟨_, _, jumpJump⟩⟩, nodePath, ⟨_, _, jumpSuffix⟩⟩ := good
            have inJump : jumpParent.path <:+ jumpPath' := by rw [jumpPath]; exact List.suffix_cons _ _
            have inNode : parent'.path <:+ path' := by rw [nodePath]; exact List.suffix_cons _ _
            exact jumpJump.trans (inJump.trans (jumpSuffix.trans inNode))
        · exact List.suffix_refl _⟩

/-- The spine of a path, innermost step first, pushed from the root, with its well-formedness. -/
def ofPath [SpineStep α] : (path : List α) → { spine : Spine α // spine.Good ∧ spine.path = path }
  | [] => ⟨.root, trivial, rfl⟩
  | step :: rest =>
    let parent := ofPath rest
    let pushed := pushGood step ⟨parent.val, parent.property.1⟩
    ⟨pushed.val, pushed.property.1, by rw [pushed.property.2, parent.property.2]⟩

/-- Whether two nodes are one: depth and fingerprint first, then the path, a shared path at once. -/
def sameNode [DecidableEq α] (a b : Spine α) : Bool :=
  a.level == b.level && a.fingerprint == b.fingerprint &&
    @decide (a.path = b.path) (withPtrEqDecEq a.path b.path fun _ => inferInstance)

/-- The ancestor of a node at depth `target`, at most its own: by jump where it does not pass `target`, else by parent;
`fuel` (the depths between) bounds the climb. -/
def climb (target : Nat) : Nat → Spine α → Spine α
  | fuel + 1, spine@(.node _ _ depth _ parent jump) =>
    if depth ≤ target then spine else if target ≤ jump.level then climb target fuel jump else climb target fuel parent
  | _, spine => spine

/-- The two nodes just below the meeting point of two distinct nodes of one depth: climb in lockstep by jump where the
jumps differ, else by parent, until the parents are one; `fuel` (their depth) bounds the climb. The jumps' depths are
compared although `push` makes them equal, so the climb's correctness needs no more of `push` than `Good`. -/
def meet [DecidableEq α] : Nat → Spine α → Spine α → Spine α × Spine α
  | fuel + 1, a@(.node _ _ _ _ pa ja), b@(.node _ _ _ _ pb jb) =>
    if sameNode pa pb then (a, b)
    else if ja.level == jb.level && !sameNode ja jb then meet fuel ja jb
    else meet fuel pa pb
  | _, a, b => (a, b)

/-- The order of two nodes' own steps. -/
def stepOrder [Ord α] : Spine α → Spine α → Ordering
  | .node a .., .node b .. => compare a b
  | _, _ => .eq

/-- The order of two paths, outermost step first, so an ancestor comes before its descendants and a subtree is one
range: the depths first, then the deeper node's ancestor at the shallower's depth, then their meeting point's two
children. -/
def compareOuter [Ord α] [DecidableEq α] (a b : Spine α) : Ordering :=
  if a.level = b.level then
    if sameNode a b then .eq else let below := meet a.level a b; stepOrder below.1 below.2
  else if a.level < b.level then
    let up := climb a.level b.level b
    if sameNode a up then .lt else let below := meet a.level a up; stepOrder below.1 below.2
  else
    let up := climb b.level a.level a
    if sameNode up b then .gt else let below := meet b.level up b; stepOrder below.1 below.2

/-- `compareOuter`, with the two facts the laws read, proved inline beside the order a map key needs, since an
executable module holds no theorem (guard 6): `meet` stops just below the meeting point of two distinct well-formed
nodes of one depth, the end of the longest common prefix of their paths read outermost first; and `compareOuter` is the
outermost-first order of the full paths on well-formed spines. -/
def outer [SpineStep α] [Ord α] [Std.LawfulEqOrd α] [DecidableEq α] :
    { cmp : Spine α → Spine α → Ordering //
      (∀ fuel (a b : Spine α), a.Good → b.Good → a.level = b.level → a.path ≠ b.path → a.level ≤ fuel →
        ∃ sa sb m, (meet fuel a b).1.path = sa :: m ∧ (meet fuel a b).2.path = sb :: m ∧ (sa :: m) <:+ a.path ∧
          (sb :: m) <:+ b.path ∧ sa ≠ sb) ∧
      ∀ a b, a.Good → b.Good → cmp a b = compare a.path.reverse b.path.reverse } :=
  ⟨compareOuter, by
    have thenNe : ∀ {o : Ordering} (x : Ordering), o ≠ .eq → o.then x = o := by
      intro o x h; cases o <;> simp_all [Ordering.then]
    have append : ∀ {l₁ l₂ m₁ m₂ : List α}, l₁.length = l₂.length →
        compare (l₁ ++ m₁) (l₂ ++ m₂) = (compare l₁ l₂).then (compare m₁ m₂) := by
      intro l₁
      induction l₁ with
      | nil => intro l₂ _ _ h; cases l₂ with
        | nil => rfl
        | cons _ _ => simp at h
      | cons x xs ih => intro l₂ m₁ m₂ h; cases l₂ with
        | nil => simp at h
        | cons y ys =>
          simp only [List.length_cons, Nat.add_right_cancel_iff] at h
          simp only [List.cons_append, List.compare_cons_cons, ih h, Ordering.then_assoc]
    have self : ∀ l : List α, compare l l = .eq := fun _ => Std.ReflCmp.compare_self
    -- Two paths that end in one tail `m` below distinct steps compare as those steps.
    have differs : ∀ {la lb m : List α} {sa sb : α}, (sa :: m) <:+ la → (sb :: m) <:+ lb → sa ≠ sb →
        compare la.reverse lb.reverse = compare sa sb := by
      intro la lb m sa sb ha hb ne
      obtain ⟨ta, rfl⟩ := ha
      obtain ⟨tb, rfl⟩ := hb
      simp only [List.reverse_append, List.reverse_cons, List.append_assoc, List.singleton_append]
      rw [append rfl, self, Ordering.eq_then, List.compare_cons_cons]
      exact thenNe _ fun h => ne (Std.LawfulEqOrd.eq_of_compare h)
    -- A proper ancestor's path comes first.
    have prefixed : ∀ {la lb : List α}, la <:+ lb → la.length < lb.length → compare la.reverse lb.reverse = .lt := by
      intro la lb h lt
      obtain ⟨t, rfl⟩ := h
      rw [List.reverse_append, ← List.append_nil la.reverse, List.append_assoc, List.nil_append, append rfl, self]
      cases ht : t.reverse with
      | nil => simp at ht; subst ht; simp at lt
      | cons _ _ => rfl
    have prefixed' : ∀ {la lb : List α}, lb <:+ la → lb.length < la.length → compare la.reverse lb.reverse = .gt := by
      intro la lb h lt
      obtain ⟨t, rfl⟩ := h
      rw [List.reverse_append, ← List.append_nil lb.reverse, List.append_assoc, List.nil_append, append rfl, self]
      cases ht : t.reverse with
      | nil => simp at ht; subst ht; simp at lt
      | cons _ _ => rfl
    have levelOf : ∀ {s : Spine α}, s.Good → s.level = s.path.length := by
      intro s good; cases s with
      | root => rfl
      | node => exact good.2.2.2.1
    have sameIff : ∀ {a b : Spine α}, a.Good → b.Good → (sameNode a b = true ↔ a.path = b.path) := by
      intro a b ga gb
      have fingerprint : ∀ {s : Spine α}, s.Good → s.fingerprint = fingerprintOf s.path := by
        intro s good; cases s with
        | root => rfl
        | node => exact good.2.2.2.2.1
      constructor
      · intro h; simp only [sameNode, Bool.and_eq_true, decide_eq_true_eq] at h; exact h.2
      · intro h; simp [sameNode, levelOf ga, levelOf gb, fingerprint ga, fingerprint gb, h]
    -- Below a node, its parent and its jump are well-formed ancestors.
    have parentOf : ∀ {s : Spine α}, s.Good → s.parentNode.Good ∧ s.parentNode.path <:+ s.path := by
      intro s good; cases s with
      | root => exact ⟨trivial, List.suffix_refl _⟩
      | node => exact ⟨good.1, by simp only [parentNode, path, good.2.2.1]; exact List.suffix_cons _ _⟩
    have jumpOf : ∀ {s : Spine α}, s.Good → s.jump.Good ∧ s.jump.path <:+ s.parentNode.path := by
      intro s good; cases s with
      | root => exact ⟨trivial, List.suffix_refl _⟩
      | node => exact ⟨good.2.1, good.2.2.2.2.2⟩
    have stays : ∀ (target fuel : Nat) (s : Spine α), s.level ≤ target → climb target fuel s = s := by
      intro target fuel s le
      cases fuel with
      | zero => cases s <;> rfl
      | succ fuel =>
        cases s with
        | root => rfl
        | node => simp only [Spine.level] at le; simp [climb, le]
    have climbs : ∀ (fuel : Nat) (target : Nat) (s : Spine α), s.Good → target ≤ s.level → s.level - target ≤ fuel →
        (climb target fuel s).Good ∧ (climb target fuel s).path <:+ s.path ∧ (climb target fuel s).level = target := by
      intro fuel
      induction fuel with
      | zero =>
        intro target s good le enough
        rw [stays target 0 s (by omega)]
        exact ⟨good, List.suffix_refl _, by omega⟩
      | succ fuel ih =>
        intro target s good le enough
        cases s with
        | root =>
          rw [stays target _ _ (Nat.zero_le _)]
          exact ⟨good, List.suffix_refl _, by simp [Spine.level] at le ⊢; omega⟩
        | node step path d f par jmp =>
          have g := good
          obtain ⟨gp, gj, hp, ⟨hd, _, hj⟩⟩ := g
          have pd : par.level + 1 = d := by rw [levelOf gp, hd, hp]; rfl
          have jd : jmp.level ≤ par.level := by rw [levelOf gj, levelOf gp]; exact hj.length_le
          have up : par.path <:+ path := by rw [hp]; exact List.suffix_cons _ _
          simp only [climb]
          split
          · exact ⟨good, List.suffix_refl _, by simp [Spine.level] at le ⊢; omega⟩
          · split
            · obtain ⟨g', s', d'⟩ := ih target jmp gj (by assumption) (by simp [Spine.level] at enough; omega)
              exact ⟨g', s'.trans (hj.trans up), d'⟩
            · obtain ⟨g', s', d'⟩ := ih target par gp (by simp [Spine.level] at *; omega)
                (by simp [Spine.level] at enough; omega)
              exact ⟨g', s'.trans up, d'⟩
    have meets : ∀ (fuel : Nat) (a b : Spine α), a.Good → b.Good → a.level = b.level → a.path ≠ b.path → a.level ≤ fuel →
        ∃ sa sb m, stepOrder (meet fuel a b).1 (meet fuel a b).2 = compare sa sb ∧ (sa :: m) <:+ a.path ∧
          (sb :: m) <:+ b.path ∧ sa ≠ sb ∧ (meet fuel a b).1.path = sa :: m ∧ (meet fuel a b).2.path = sb :: m := by
      intro fuel
      induction fuel with
      | zero =>
        intro a b ga gb dd ne le
        apply absurd _ ne
        have la : a.path = [] := List.eq_nil_of_length_eq_zero (by rw [← levelOf ga]; omega)
        have lb : b.path = [] := List.eq_nil_of_length_eq_zero (by rw [← levelOf gb]; omega)
        rw [la, lb]
      | succ fuel ih =>
        intro a b ga gb dd ne le
        cases a with
        | root =>
          cases b with
          | root => exact absurd rfl ne
          | node => obtain ⟨_, _, hp, ⟨hd, _⟩⟩ := gb; simp [Spine.level, hd, hp] at dd
        | node sa pathA da fa pa ja =>
          cases b with
          | root => obtain ⟨_, _, hp, ⟨hd, _⟩⟩ := ga; simp [Spine.level, hd, hp] at dd
          | node sb pathB db fb pb jb =>
            have ga' := ga
            have gb' := gb
            obtain ⟨gpa, gja, hpa, ⟨hda, _, hja⟩⟩ := ga'
            obtain ⟨gpb, gjb, hpb, ⟨hdb, _, hjb⟩⟩ := gb'
            have pda : pa.level + 1 = da := by rw [levelOf gpa, hda, hpa]; rfl
            have pdb : pb.level + 1 = db := by rw [levelOf gpb, hdb, hpb]; rfl
            have upa : pa.path <:+ pathA := by rw [hpa]; exact List.suffix_cons _ _
            have upb : pb.path <:+ pathB := by rw [hpb]; exact List.suffix_cons _ _
            simp only [Spine.level] at dd le
            simp only [meet]
            split
            · next sp =>
              have e := (sameIff gpa gpb).mp sp
              refine ⟨sa, sb, pa.path, rfl, by rw [hpa]; exact List.suffix_refl _, by rw [hpb, ← e]; exact List.suffix_refl _,
                fun s => ne ?_, hpa, by show pathB = _; rw [hpb, ← e]⟩
              show pathA = pathB
              rw [hpa, hpb, s, e]
            · next sp =>
              have pne : pa.path ≠ pb.path := fun e => sp ((sameIff gpa gpb).mpr e)
              split
              · next sj =>
                simp only [Bool.and_eq_true, beq_iff_eq, Bool.not_eq_eq_eq_not, Bool.not_true] at sj
                obtain ⟨jd, sj⟩ := sj
                have jne : ja.path ≠ jb.path := fun e => by simp [(sameIff gja gjb).mpr e] at sj
                have jle : ja.level ≤ pa.level := by rw [levelOf gja, levelOf gpa]; exact hja.length_le
                obtain ⟨x, y, m, ⟨o, hx, hy, ⟨xy, px, py⟩⟩⟩ := ih ja jb gja gjb jd jne (by omega)
                exact ⟨x, y, m, o, hx.trans (hja.trans upa), hy.trans (hjb.trans upb), xy, px, py⟩
              · obtain ⟨x, y, m, ⟨o, hx, hy, ⟨xy, px, py⟩⟩⟩ := ih pa pb gpa gpb (by omega) pne (by omega)
                exact ⟨x, y, m, o, hx.trans upa, hy.trans upb, xy, px, py⟩
    refine ⟨fun fuel a b ga gb dd ne le => ?_, fun a b ga gb => ?_⟩
    · obtain ⟨sa, sb, m, ⟨_, ha, hb, ⟨distinct, pa, pb⟩⟩⟩ := meets fuel a b ga gb dd ne le
      exact ⟨sa, sb, m, pa, pb, ha, hb, distinct⟩
    unfold compareOuter
    split
    · next dd =>
      split
      · next s => rw [(sameIff ga gb).mp s, self]
      · next s =>
        obtain ⟨x, y, m, ⟨o, hx, hy, ⟨xy, _⟩⟩⟩ :=
          meets a.level a b ga gb dd (fun e => by simp [(sameIff ga gb).mpr e] at s) (Nat.le_refl _)
        simp only [o, differs hx hy xy]
    · next dd =>
      dsimp only
      split
      · next lt =>
        obtain ⟨gu, su, du⟩ := climbs b.level a.level b gb (by omega) (by omega)
        split
        · next s =>
          rw [(sameIff ga gu).mp s]
          exact (prefixed su (by rw [← levelOf gu, ← levelOf gb]; omega)).symm
        · next s =>
          obtain ⟨x, y, m, ⟨o, hx, hy, ⟨xy, _⟩⟩⟩ :=
            meets a.level a _ ga gu du.symm (fun e => by simp [(sameIff ga gu).mpr e] at s) (Nat.le_refl _)
          simp only [o, differs hx (hy.trans su) xy]
      · next lt =>
        obtain ⟨gu, su, du⟩ := climbs a.level b.level a ga (by omega) (by omega)
        split
        · next s =>
          rw [← (sameIff gu gb).mp s]
          exact (prefixed' su (by rw [← levelOf gu, ← levelOf ga]; omega)).symm
        · next s =>
          obtain ⟨x, y, m, ⟨o, hx, hy, ⟨xy, _⟩⟩⟩ :=
            meets b.level _ b gu gb du (fun e => by simp [(sameIff gu gb).mpr e] at s) (Nat.le_of_eq du)
          simp only [o, differs (hx.trans su) hy xy]⟩

end Spine

/-! ## Unit keys -/

/-- The key of one unit of a closure's work, one micro-step (DC4, DC20): its root and the steps from the root down to it,
innermost first, with their spine, which `push` extends and `parent?` reads, so neither copies the path. Structural and
the same in every schedule: when a unit ran is the run log's (`Step.RunLog`), never the key's. A unit key never
outlives its closure: the commit empties every family keyed by one (`Step.orderJournal`). Never a wire value. -/
structure UnitKey where
  root : UnitRoot
  path : List UnitStep
  spine : Spine UnitStep
  spineOk : spine = (Spine.ofPath path).val

namespace UnitKey

/-- The key of a root unit. -/
def ofRoot (root : UnitRoot) : UnitKey := ⟨root, [], .root, rfl⟩

/-- The key of the unit `step` names below `parent`: one `Spine.push`. -/
abbrev push (parent : UnitKey) (step : UnitStep) : UnitKey :=
  ⟨parent.root, step :: parent.path, Spine.push step parent.spine, by rw [parent.spineOk]; rfl⟩

/-- The `index`th signal the unit `parent` queued, as the unit it runs as. -/
abbrev signalUnit (parent : UnitKey) (index : Nat) : UnitKey := parent.push (.signal index)

/-- The `index`th token the unit `parent` queued, as the unit it runs as. -/
abbrev tokenUnit (parent : UnitKey) (index : Nat) : UnitKey := parent.push (.token index)

/-- The unit that queued this one and the step it queued it as, `none` for a root: its spine's parent, read in
constant time. -/
abbrev parent? (key : UnitKey) : Option (UnitKey × UnitStep) :=
  match same : key.path with
  | [] => none
  | step :: rest => some (⟨key.root, rest, key.spine.parentNode, by rw [key.spineOk, same]; rfl⟩, step)

end UnitKey

instance : Inhabited UnitKey := ⟨.ofRoot .input⟩

instance : Repr UnitKey where
  reprPrec key _ := Std.Format.bracket "{ " ("root := " ++ repr key.root ++ ", path := " ++ repr key.path) " }"

/-- Equality rejects on depth and fingerprint at once, then compares the roots, and accepts a shared path at once; only
a fingerprint collision or an unshared equal path walks it. No derived walk: a derived instance would also compare the
spines. -/
instance : DecidableEq UnitKey := fun a b =>
  if cached : a.spine.level = b.spine.level ∧ a.spine.fingerprint = b.spine.fingerprint then
    if roots : a.root = b.root then
      match withPtrEqDecEq a.path b.path (fun _ => inferInstance) with
      | isTrue same => isTrue <| by
          obtain ⟨root, path, spine, ok⟩ := a
          obtain ⟨root', path', spine', ok'⟩ := b
          simp only at same roots
          subst same ok ok' roots
          rfl
      | isFalse other => isFalse fun same => other (congrArg UnitKey.path same)
    else isFalse fun same => roots (congrArg UnitKey.root same)
  else isFalse fun same => cached ⟨congrArg (·.spine.level) same, congrArg (·.spine.fingerprint) same⟩

/-- The order of two unit keys' paths, a shared path at once. -/
def UnitKey.comparePath (a b : UnitKey) : Ordering :=
  match withPtrEqDecEq a.path b.path (fun _ => inferInstance) with
  | isTrue _ => .eq
  | isFalse _ => compare a.path b.path

/-- The order of unit keys (DC20): depth, fingerprint, root, then the full path, so a map operation compares fixed-size
cached fields first and the path decides last; with its agreement with the order of (path length, path fingerprint,
root, path) proved inline beside the order, since an executable module holds no theorem (guard 6). No law reads the
fingerprint's value: it only splits the order (T60 F3). -/
def UnitKey.unitOrder : { cmp : UnitKey → UnitKey → Ordering //
    cmp = compareLex (compareOn (·.path.length)) (compareLex (compareOn (Spine.fingerprintOf ·.path))
      (compareLex (compareOn (·.root)) (compareOn (·.path)))) } :=
  ⟨compareLex (compareOn (·.spine.level)) (compareLex (compareOn (·.spine.fingerprint))
      (compareLex (compareOn (·.root)) UnitKey.comparePath)), by
    have cached : ∀ key : UnitKey, key.spine.level = key.path.length ∧
        key.spine.fingerprint = Spine.fingerprintOf key.path := by
      intro key
      obtain ⟨good, path⟩ := (Spine.ofPath key.path).property
      rw [← key.spineOk] at good path
      cases spine : key.spine with
      | root => rw [spine] at path; simp [Spine.level, Spine.fingerprint, ← path, Spine.path, Spine.fingerprintOf]
      | node =>
        rw [spine] at good path
        exact ⟨by rw [← path]; exact good.2.2.2.1, by rw [← path]; exact good.2.2.2.2.1⟩
    funext a b
    have path : UnitKey.comparePath a b = compare a.path b.path := by
      unfold UnitKey.comparePath
      split
      · next same _ => rw [same]; exact Std.ReflCmp.compare_self.symm
      · rfl
    simp only [compareLex, compareOn, (cached a).1, (cached b).1, (cached a).2, (cached b).2, path]⟩

instance : Ord UnitKey where
  compare := UnitKey.unitOrder.val

instance : Std.TransOrd UnitKey := by
  show Std.TransCmp UnitKey.unitOrder.val
  rw [UnitKey.unitOrder.property]
  exact inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd UnitKey where
  eq_of_compare {a b} h := by
    have h := (show compare a b = UnitKey.unitOrder.val a b from rfl) ▸ h
    rw [UnitKey.unitOrder.property, compareLex_eq_eq, compareLex_eq_eq, compareLex_eq_eq] at h
    have roots : a.root = b.root := Std.LawfulEqOrd.eq_of_compare h.2.2.1
    have paths : a.path = b.path := Std.LawfulEqOrd.eq_of_compare h.2.2.2
    obtain ⟨root, path, spine, ok⟩ := a
    obtain ⟨root', path', spine', ok'⟩ := b
    simp only at roots paths
    subst roots paths ok ok'
    rfl

/-- Breadth-first order of unit keys (DC4, T56 F2), the order the closure runs queued signals in: fewer steps first,
then the root, then the path read outermost first, decided where the two spines meet in O(log depth)
(`Spine.compareOuter`); with its agreement with the order of (path length, root, reversed path) proved inline. -/
def UnitKey.breadth : { cmp : UnitKey → UnitKey → Ordering //
    cmp = compareLex (compareOn (·.path.length)) (compareLex (compareOn (·.root)) (compareOn (·.path.reverse))) } :=
  ⟨compareLex (compareOn (·.spine.level)) (compareLex (compareOn (·.root)) fun a b => Spine.outer.val a.spine b.spine), by
    have good : ∀ key : UnitKey, key.spine.Good ∧ key.spine.path = key.path := by
      intro key
      have built := (Spine.ofPath key.path).property
      rw [← key.spineOk] at built
      exact built
    have level : ∀ key : UnitKey, key.spine.level = key.path.length := by
      intro key
      have g := good key
      cases spine : key.spine with
      | root => rw [spine] at g; simp [Spine.level, ← g.2, Spine.path]
      | node => rw [spine] at g; rw [← g.2]; exact g.1.2.2.2.1
    funext a b
    have outer := Spine.outer.property.2 _ _ (good a).1 (good b).1
    simp only [compareLex, compareOn, level, outer, (good a).2, (good b).2]⟩


/-! ## Issues -/

/-- How an identity was issued (DC12): committed, an ordinal of its slot (`ClaimSlot`); or inside the closure in
progress, as the `index`th issue of the unit `unit` (`State.issue`). A unit runs once in a committed closure
(`Step.conclude` fails the command on a key that ran) and numbers its issues from 0, so a fresh issue is issued once,
and as the same issue in every schedule; the commit renames every fresh issue to a committed one (`Step.compact`), so no committed state holds one. -/
inductive Issue where
  | committed (ordinal : Nat)
  | fresh (unit : UnitKey) (index : Nat)
  deriving DecidableEq, Repr

namespace Issue

/-- Committed before fresh. -/
def tag : Issue → Nat
  | .committed _ => 0
  | .fresh _ _ => 1

/-- A committed issue's ordinal, a fresh one's index in its unit. -/
def number : Issue → Nat
  | .committed ordinal => ordinal
  | .fresh _ index => index

/-- A fresh issue's unit. -/
def unit? : Issue → Option UnitKey
  | .committed _ => none
  | .fresh unit _ => some unit

/-- Whether it was issued in the closure in progress. -/
def isFresh : Issue → Bool
  | .committed _ => false
  | .fresh _ _ => true

/-- A scope segment's fingerprint step reads it: a committed ordinal's hash, as before DC12, a fresh issue's unit's
cached fields mixed with its index. -/
def code : Issue → UInt64
  | .committed ordinal => hash ordinal
  | .fresh unit index => mixHash (mixHash unit.spine.fingerprint (hash unit.spine.level)) (hash index)

end Issue

instance : Inhabited Issue := ⟨.committed 0⟩

/-- A numeral is a committed ordinal, as every key a committed state holds. -/
instance (n : Nat) : OfNat Issue n := ⟨.committed n⟩

/-- Committed issues first, by ordinal; fresh ones by index, then unit, so two issues of one unit compare without walking
its key. -/
instance : Ord Issue where
  compare := compareLex (compareOn Issue.tag) <| compareLex (compareOn Issue.number) (compareOn Issue.unit?)

instance : Std.TransOrd Issue := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd Issue where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn Issue.tag) (compareLex (compareOn Issue.number) (compareOn Issue.unit?)) a b = .eq := h
    rw [compareLex_eq_eq, compareLex_eq_eq] at h
    have tags : a.tag = b.tag := Std.LawfulEqOrd.eq_of_compare h.1
    have numbers : a.number = b.number := Std.LawfulEqOrd.eq_of_compare h.2.1
    have units : a.unit? = b.unit? := Std.LawfulEqOrd.eq_of_compare h.2.2
    cases a <;> cases b <;> simp_all [Issue.tag, Issue.number, Issue.unit?]

/-- One step down the scope tree: the element a scope occurrence was entered for, and its issue among the scope
occurrences of that element entered in the same parent, an ordinal once committed. -/
structure ScopeSegment where
  element : ElementId
  ordinal : Issue
  deriving DecidableEq, Repr, Inhabited

instance : Ord ScopeSegment where
  compare := compareLex (compareOn (·.element.value)) (compareOn (·.ordinal))

instance : Std.TransOrd ScopeSegment := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd ScopeSegment where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun segment : ScopeSegment => segment.element.value)
        (compareOn fun segment : ScopeSegment => segment.ordinal) a b = .eq := h
    rw [compareLex_eq_eq] at h
    obtain ⟨⟨element⟩, ordinal⟩ := a
    obtain ⟨⟨element'⟩, ordinal'⟩ := b
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare h.1
    have ordinals : ordinal = ordinal' := Std.LawfulEqOrd.eq_of_compare h.2
    subst same ordinals
    rfl

/-- A scope segment's fingerprint step: its element's hash mixed with its issue's code. -/
instance : SpineStep ScopeSegment where
  code segment := mixHash (hash segment.element.value) segment.ordinal.code

/-- A segment's committed form, `none` for one issued in the closure in progress. -/
def ScopeSegment.committed? (segment : ScopeSegment) : Option CommittedSegment :=
  match segment.ordinal with
  | .committed ordinal => some { element := segment.element, ordinal }
  | .fresh _ _ => none

/-- A scope occurrence's structural key: its segments from itself up to the process root, innermost first, so the
parent's key is the tail and a key's own element and ordinal are its head, with their spine (DC20), which `child` pushes
and `parent?` reads, so neither copies the path. The root of the process instance has none; a called instance's root is
entered below its Call's scope occurrence like any other. Keys order outermost first (`Ord`), so a subtree is one key
range (KD1). -/
structure ScopeOccurrenceId where
  segments : List ScopeSegment
  spine : Spine ScopeSegment
  spineOk : spine = (Spine.ofPath segments).val

namespace ScopeOccurrenceId

/-- The key of a path of segments, innermost first, its spine pushed segment by segment: O(length). -/
def ofSegments (segments : List ScopeSegment) : ScopeOccurrenceId := ⟨segments, (Spine.ofPath segments).val, rfl⟩

/-- The key of the `ordinal`th scope occurrence of `element` entered in `parent`: one `Spine.push`. -/
abbrev child (parent : ScopeOccurrenceId) (element : ElementId) (ordinal : Issue) : ScopeOccurrenceId :=
  ⟨{ element, ordinal } :: parent.segments, Spine.push { element, ordinal } parent.spine, by rw [parent.spineOk]; rfl⟩

/-- The key of the scope occurrence `scope` was entered in, given `scope`'s segments: its spine's parent, read in
constant time. -/
abbrev up (scope : ScopeOccurrenceId) {segment : ScopeSegment} {rest : List ScopeSegment}
    (segments : scope.segments = segment :: rest) : ScopeOccurrenceId :=
  ⟨rest, scope.spine.parentNode, by rw [scope.spineOk, segments]; rfl⟩

/-- The key of the scope occurrence this one was entered in, `none` for the root. -/
abbrev parent? (scope : ScopeOccurrenceId) : Option ScopeOccurrenceId :=
  match segments : scope.segments with
  | [] => none
  | _ :: _ => some (scope.up segments)

end ScopeOccurrenceId

instance : Inhabited ScopeOccurrenceId := ⟨.ofSegments []⟩

instance : Repr ScopeOccurrenceId where
  reprPrec key _ := Std.Format.bracket "{ " ("segments := " ++ repr key.segments) " }"

/-- Equality rejects on depth and fingerprint at once and accepts a shared path at once; only a fingerprint collision or
an unshared equal path walks it. No derived walk: a derived instance would also compare the spines. -/
instance : DecidableEq ScopeOccurrenceId := fun a b =>
  if cached : a.spine.level = b.spine.level ∧ a.spine.fingerprint = b.spine.fingerprint then
    match withPtrEqDecEq a.segments b.segments (fun _ => inferInstance) with
    | isTrue same => isTrue <| by
        obtain ⟨segments, spine, ok⟩ := a
        obtain ⟨segments', spine', ok'⟩ := b
        simp only at same
        subst same ok ok'
        rfl
    | isFalse other => isFalse fun same => other (congrArg ScopeOccurrenceId.segments same)
  else isFalse fun same => cached ⟨congrArg (·.spine.level) same, congrArg (·.spine.fingerprint) same⟩

/-- The order of scope occurrence keys, outermost segment first (`Spine.compareOuter`), with its agreement with the
order of the reversed segments proved inline. -/
def ScopeOccurrenceId.outerOrder :
    { cmp : ScopeOccurrenceId → ScopeOccurrenceId → Ordering // cmp = compareOn (·.segments.reverse) } :=
  ⟨fun a b => Spine.outer.val a.spine b.spine, by
    funext a b
    obtain ⟨goodA, pathA⟩ := (Spine.ofPath a.segments).property
    obtain ⟨goodB, pathB⟩ := (Spine.ofPath b.segments).property
    have ga := goodA; have gb := goodB
    rw [← a.spineOk] at ga pathA
    rw [← b.spineOk] at gb pathB
    show Spine.outer.val a.spine b.spine = compare a.segments.reverse b.segments.reverse
    rw [Spine.outer.property.2 _ _ ga gb, pathA, pathB]⟩

/-- Oriented (`orientCmp`). -/
instance : Ord ScopeOccurrenceId where
  compare := (orientCmp ScopeOccurrenceId.outerOrder.val).val

instance : Std.TransOrd ScopeOccurrenceId := by
  show Std.TransCmp (orientCmp ScopeOccurrenceId.outerOrder.val).val
  rw [ScopeOccurrenceId.outerOrder.property]
  exact inferInstanceAs <| Std.TransCmp (orientCmp (compareOn _)).val

instance : Std.LawfulEqOrd ScopeOccurrenceId where
  eq_of_compare {a b} h := by
    have h : compare a.segments.reverse b.segments.reverse = .eq := by
      have h := ((orientCmp ScopeOccurrenceId.outerOrder.val).property a b).mp h
      rwa [ScopeOccurrenceId.outerOrder.property] at h
    have same : a.segments = b.segments := List.reverse_inj.mp (Std.LawfulEqOrd.eq_of_compare h)
    -- A key's spine is its path's.
    obtain ⟨segments, spine, ok⟩ := a
    obtain ⟨segments', spine', ok'⟩ := b
    simp only at same
    subst same ok ok'
    rfl

/-- What an ordinal counter counts: the keys issued for `element` in the scope occurrence `parent`, the scope
occurrences entered there (`State.scopeOrdinals`) or the occurrences issued there (`State.occurrenceOrdinals`). -/
structure ScopeSlot where
  parent : ScopeOccurrenceId
  element : ElementId
  deriving DecidableEq, Repr

/-- The parent's key, then the element, oriented (`orientCmp`). -/
instance : Ord ScopeSlot where
  compare := compareLex (compareOn (·.parent)) (orientCmp (compareOn (·.element.value))).val

instance : Std.TransOrd ScopeSlot := inferInstanceAs <| Std.TransCmp (compareLex _ _)

instance : Std.LawfulEqOrd ScopeSlot where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun slot : ScopeSlot => slot.parent)
        (orientCmp (compareOn fun slot : ScopeSlot => slot.element.value)).val a b = .eq := h
    rw [compareLex_eq_eq] at h
    have elements := ((orientCmp (compareOn fun slot : ScopeSlot => slot.element.value)).property a b).mp h.2
    obtain ⟨parent, ⟨element⟩⟩ := a
    obtain ⟨parent', ⟨element'⟩⟩ := b
    have parents : parent = parent' := Std.LawfulEqOrd.eq_of_compare h.1
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare elements
    subst parents same
    rfl

/-- An occurrence's structural key (KD1): the scope occurrence it was issued in, its element and an ordinal counted per
(scope occurrence, element) by `State.occurrenceOrdinals`, so no global counter issues it. A reservation is issued in the
scope occurrence that arms it and keeps its key when it begins in another (`State.beginOccurrence`).
`State.issueOccurrence` is the one issuer. -/
structure OccurrenceId where
  scope : ScopeOccurrenceId
  element : ElementId
  ordinal : Issue
  deriving DecidableEq, Repr, Inhabited

/-- The scope occurrence's key, then the element, then the issue, oriented (`orientCmp`). -/
instance : Ord OccurrenceId where
  compare := compareLex (compareOn (·.scope)) (orientCmp <| compareLex (compareOn (·.element.value)) (compareOn (·.ordinal))).val

instance : Std.TransOrd OccurrenceId := inferInstanceAs <| Std.TransCmp (compareLex _ (orientCmp (compareLex _ _)).val)

instance : Std.LawfulEqOrd OccurrenceId where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun key : OccurrenceId => key.scope) (orientCmp <|
        compareLex (compareOn fun key : OccurrenceId => key.element.value) (compareOn fun key : OccurrenceId => key.ordinal)).val
        a b = .eq := h
    rw [compareLex_eq_eq] at h
    have rest := compareLex_eq_eq.mp <| ((orientCmp <| compareLex (compareOn fun key : OccurrenceId => key.element.value)
        (compareOn fun key : OccurrenceId => key.ordinal)).property a b).mp h.2
    obtain ⟨scope, ⟨element⟩, ordinal⟩ := a
    obtain ⟨scope', ⟨element'⟩, ordinal'⟩ := b
    have scopes : scope = scope' := Std.LawfulEqOrd.eq_of_compare h.1
    have same : element = element' := Std.LawfulEqOrd.eq_of_compare rest.1
    have ordinals : ordinal = ordinal' := Std.LawfulEqOrd.eq_of_compare rest.2
    subst scopes same ordinals
    rfl

/-- Which counter numbers an occurrence: a Multi-Instance body and its instances number apart, as CIB gives the body
an activity id of its own (`BpmnParse:185`). -/
inductive ActivationRole where
  | element
  | multiInstanceBody
  deriving DecidableEq, Repr

/-- An occurrence's public key, which the journal and the observation publish, unlike its structural `OccurrenceId`: its
process instance, element, activation and the counter that numbered it. -/
structure OccurrenceKey where
  processInstanceId : String
  element : ElementId
  activation : Nat
  role : ActivationRole := .element
  deriving DecidableEq, Repr

end Kernel
