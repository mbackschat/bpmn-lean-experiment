module

public import Kernel.Laws.Step.Assign
public import Kernel.Laws.Step.Compact
public import Kernel.Laws.State.CallDepth

/-! # Laws: the commit numbers activations on their resolved names (KD5)

`Step.assign` numbers the identities on the slots as issued, then each activation on its slot under its process
instance's name as the ordinals so far resolve it (`Step.activationStep`), callers first (`Step.activationOrder`). Every
pending activation a tabled name carries is an activation of the caller's instance (`Laws.State.NameTabled`), whose name
is shorter, so the depth order numbers it first and the name resolves then as the commit's renaming resolves it: the
assignment is the plain one over the activations' resolved slots (`assign_replay`). So two activations one name resolves
to count on one counter, the counter a committed instance of that name counts on, with no premise that the resolution
keeps names apart. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

/-! ## Renamings that agree on a name -/

/-- Two renamings agree on every activation a name carries. -/
def NamesAgree (r r' : Issue → Issue) : InstanceName → Prop
  | .named _ => True
  | .called caller _ activation => r activation = r' activation ∧ NamesAgree r r' caller

/-- A name resolves alike under renamings that agree on its activations. -/
theorem rename_congr {r r' : Issue → Issue} : ∀ {name : InstanceName}, NamesAgree r r' name → name.rename r = name.rename r'
  | .named _, _ => by rw [rename_named, rename_named]
  | .called _ _ _, ⟨same, callers⟩ => by rw [rename_called, rename_called, rename_congr callers, same]

/-- Two assignments that hold one entry for an issue rename it alike. -/
theorem renameBy_congr {m m' : TreeMap Issue Nat compare} {issue : Issue} (same : m[issue]? = m'[issue]?) :
    renameBy m issue = renameBy m' issue := by
  cases issue with
  | committed n => rw [renameBy_committed, renameBy_committed]
  | fresh unit index => rw [renameBy_fresh, renameBy_fresh, same]

/-! ## The two orders -/

/-- An activation of a name strictly shorter than a later one's comes before it. -/
theorem activationOrder_before {L : List (Issue × ActivationSlot)}
    (sorted : L.Pairwise fun a b => a.2.processInstance.callDepth ≤ b.2.processInstance.callDepth)
    {pre post : List (Issue × ActivationSlot)} {c x : Issue × ActivationSlot} (split : L = pre ++ c :: post)
    (member : x ∈ L) (shorter : x.2.processInstance.callDepth < c.2.processInstance.callDepth) : x ∈ pre := by
  rw [split] at member sorted
  rcases List.mem_append.mp member with early | late
  · exact early
  · rcases List.mem_cons.mp late with rfl | later
    · omega
    · have := List.rel_of_pairwise_cons (List.pairwise_append.mp sorted).2.1 later
      omega

/-! ## The activation fold -/

/-- An activation's claim on its slot as `r` resolves the slot's name. -/
abbrev resolvedClaim (r : Issue → Issue) (claim : Issue × ActivationSlot) : Issue × ClaimSlot :=
  (claim.1, .activation { claim.2 with processInstance := claim.2.processInstance.rename r })

/-- **The activation fold is the plain fold over the resolved slots** where, at every activation, the ordinals so far
resolve its instance's name as `r` does. -/
theorem activationFold_replay {base : ClaimSlot → Nat} {r : Issue → Issue} :
    ∀ (claims : List (Issue × ActivationSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      (∀ pre c post, claims = pre ++ c :: post →
        NamesAgree (renameBy (pre.foldl (activationStep base) acc).1) r c.2.processInstance) →
      claims.foldl (activationStep base) acc = (claims.map (resolvedClaim r)).foldl (assignStep base) acc
  | [], _, _ => rfl
  | c :: rest, acc, agrees => by
    have head := rename_congr (agrees [] c rest rfl)
    simp only [List.foldl_nil] at head
    have step : activationStep base acc c = assignStep base acc (resolvedClaim r c) := by
      rw [activationStep_eq, resolveSlot_eq, head]
    rw [List.map_cons, List.foldl_cons, List.foldl_cons, step]
    refine activationFold_replay rest _ fun pre c' post split => ?_
    have kept := agrees (c :: pre) c' post (by rw [split]; rfl)
    rw [List.foldl_cons, step] at kept
    exact kept

/-- The order the commit numbers in: the identities as issued, then each activation on its slot under its instance's
resolved name. -/
abbrev committedOrder (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : List (Issue × ClaimSlot) :=
  identityClaims (issueOrder schedule log s) ++
    (activationOrder (taggedActivations schedule s (issueOrder schedule log s))).map (resolvedClaim (commitRenaming schedule start log s))

/-- **The assignment numbers every activation on its resolved slot** (KD5): where every name an activation slot holds
is tabled, the depth order numbers each activation a name carries before the name resolves, so the assignment is the
plain fold over `committedOrder`. -/
theorem assign_replay {start : State} {log : RunLog} {s : State}
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance) :
    assign schedule start log s = (committedOrder schedule start log s).foldl (assignStep (slotBase start)) (∅, ∅) := by
  rw [List.foldl_append]
  let L := activationOrder (taggedActivations schedule s (issueOrder schedule log s))
  let acc := (identityClaims (issueOrder schedule log s)).foldl (assignStep (slotBase start)) (∅, ∅)
  have final : assign schedule start log s = L.foldl (activationStep (slotBase start)) acc := assign_eq start log s
  rw [← activationFold_replay L acc ?agrees]
  · exact final
  case agrees =>
  intro pre c post split
  have tabledOf : ∀ x ∈ L, s.issued[x.1]? = some (.activation x.2) := fun x member =>
    issueOrder_mem.mp (activationOrder_mem.mp member)
  have cIn : c ∈ L := by rw [split]; exact List.mem_append_right _ List.mem_cons_self
  -- Every activation a name of `c`'s depth or less carries lies before `c`, so the fold from there leaves its ordinal.
  suffices agree : ∀ name, NameTabled s name → name.callDepth ≤ c.2.processInstance.callDepth →
      NamesAgree (renameBy (pre.foldl (activationStep (slotBase start)) acc).1) (commitRenaming schedule start log s) name from
    agree _ (slots _ _ (tabledOf c cIn)) (Nat.le_refl _)
  intro name
  induction name with
  | named _ => intro _ _; trivial
  | called caller call activation ih =>
    rintro ⟨pending, tabled⟩ short
    rw [callDepth_called] at short
    simp only [NamesAgree]
    refine ⟨?_, ih tabled (by omega)⟩
    cases fresh : activation.isFresh
    · cases activation with
      | committed n => rw [renameBy_committed, commitRenaming, renameBy_committed]
      | fresh => simp [isFresh_fresh] at fresh
    · obtain ⟨slot, held, named⟩ := pending fresh
      have absent : activation ∉ (c :: post).map (·.1) := by
        intro inside
        obtain ⟨x, xIn, same⟩ := List.mem_map.mp inside
        have xL : x ∈ L := by rw [split]; exact List.mem_append_right _ xIn
        have slotSame : x.2 = slot := by
          have := tabledOf x xL
          rw [same, held] at this
          exact (ClaimSlot.activation.inj (Option.some.inj this)).symm
        have shorterX : x.2.processInstance.callDepth < c.2.processInstance.callDepth := by
          rw [slotSame, named]; omega
        rcases List.mem_cons.mp xIn with rfl | later
        · exact Nat.lt_irrefl _ shorterX
        · have sorted : L.Pairwise fun a b => a.2.processInstance.callDepth ≤ b.2.processInstance.callDepth :=
            activationOrder_sorted _
          rw [split] at sorted
          have := List.rel_of_pairwise_cons (List.pairwise_append.mp sorted).2.1 later
          omega
      rw [commitRenaming, final, split, List.foldl_append]
      exact renameBy_congr (activationFold_lookup _ _ absent).symm

/-- The commit's order lists each issue once. -/
theorem committedOrder_nodup (start : State) (log : RunLog) (s : State) :
    ((committedOrder schedule start log s).map (·.1)).Nodup := by
  rw [List.map_append, List.map_map]
  have identity := (issueOrder_nodup schedule log s).sublist ((identityClaims_sublist (issueOrder schedule log s)).map (·.1))
  have activations := activationOrder_nodup schedule s _ (issueOrder_nodup schedule log s)
  refine List.nodup_append.mpr ⟨identity, by simpa [Function.comp_def] using activations, ?_⟩
  intro issue inside other outside same
  subst same
  obtain ⟨c, cIn, rfl⟩ := List.mem_map.mp inside
  have plain := identityClaims_mem.mp cIn
  exact activationOrder_absent (issueOrder_mem.mp plain.1) plain.2 (by simpa [Function.comp_def] using outside)

theorem committedOrder_activation {start : State} {log : RunLog} {s : State} {issue : Issue} {slot : ActivationSlot}
    (tabled : s.issued[issue]? = some (.activation slot)) :
    resolvedClaim (commitRenaming schedule start log s) (issue, slot) ∈ committedOrder schedule start log s :=
  List.mem_append_right _ (List.mem_map_of_mem (activationOrder_mem.mpr (issueOrder_mem.mpr tabled)))

/-- **An activation takes an ordinal above its resolved slot's base** (`assign_took`'s for activations). -/
theorem assign_tookActivation {start : State} {log : RunLog} {s : State} {issue : Issue} {slot : ActivationSlot}
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    (tabled : s.issued[issue]? = some (.activation slot)) :
    Took (slotBase start) (assign schedule start log s) (resolvedClaim (commitRenaming schedule start log s) (issue, slot)) := by
  have took := fold_took (base := slotBase start) _ (∅, ∅) (committedOrder_nodup (schedule := schedule) start log s)
    (fun _ _ found => by simp at found) _ (committedOrder_activation tabled)
  rw [← assign_replay slots] at took
  exact took

/-- **Two activations of one resolved slot take different ordinals** (`assign_apart`'s for activations). -/
theorem assign_apartActivation {start : State} {log : RunLog} {s : State} {first second : Issue} {one two : ActivationSlot}
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    (tabledOne : s.issued[first]? = some (.activation one)) (tabledTwo : s.issued[second]? = some (.activation two))
    (resolved : (resolvedClaim (commitRenaming schedule start log s) (first, one)).2 =
      (resolvedClaim (commitRenaming schedule start log s) (second, two)).2)
    (same : (assign schedule start log s).1[first]? = (assign schedule start log s).1[second]?) : first = second := by
  have kept := fold_apart (base := slotBase start) (committedOrder schedule start log s) [] (∅, ∅)
    (by simpa using committedOrder_nodup (schedule := schedule) start log s)
    ⟨fun _ member => (nomatch member), fun _ member => (nomatch member)⟩
  rw [← assign_replay slots] at kept
  exact kept.apart _ (by simpa using committedOrder_activation tabledOne) _
    (by simpa using committedOrder_activation tabledTwo) resolved same

/-- **Every activation slot the commit counts is an issued activation's, resolved.** -/
theorem assign_activationSlot {start : State} {log : RunLog} {s : State} {slot : ActivationSlot} {m : Nat}
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    (found : (assign schedule start log s).2[ClaimSlot.activation slot]? = some m) :
    ∃ (issue : Issue) (issued : ActivationSlot), s.issued[issue]? = some (.activation issued) ∧
      slot = { issued with processInstance := issued.processInstance.rename (commitRenaming schedule start log s) } := by
  rw [assign_replay slots] at found
  rcases fold_activationClaimed (base := slotBase start) _ (∅, ∅) found with empty | ⟨issue, member⟩
  · simp at empty
  rcases List.mem_append.mp member with identity | activation
  · exact absurd rfl ((identityClaims_mem.mp identity).2 slot)
  · obtain ⟨c, cIn, same⟩ := List.mem_map.mp activation
    simp only [resolvedClaim, Prod.mk.injEq, ClaimSlot.activation.injEq] at same
    exact ⟨c.1, c.2, issueOrder_mem.mp (activationOrder_mem.mp cIn), same.2.symm⟩

end Kernel.Laws.Step
