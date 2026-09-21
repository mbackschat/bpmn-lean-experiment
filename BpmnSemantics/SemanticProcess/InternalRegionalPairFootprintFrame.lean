import BpmnSemantics.SemanticProcess.InternalRegionalPairOwnershipFrame

/-! Complete preparation compares the entire derived footprint, including parent-owned bounded-completion withdrawals. Retained Activity populations therefore need exact equality after an independent removal. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem withdrawn_activity_frame (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    regionalWithdrawnActivityWrites after right.selection = regionalWithdrawnActivityWrites before right.selection := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have selected := (ownershipClosedSelection_facts program before leftOperation left.selection leftFacts.2.2.2.1).1
  have identities : waitIdentitiesUnique before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    simp_all only
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before leftOperation left leftFound
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  have fields := regionalSelection_reference_fields program before after leftOperation left.selection
    leftFacts.1 identities selected fired
  have ownerFrame := (regional_pair_owner_retention program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied).2
  unfold regionalWithdrawnActivityWrites
  rw [ownerFrame, fields.2.1]
  congr 1
  rw [List.filter_filter]
  apply List.filter_congr
  intro record member
  cases rightKeeps : (regionalSelectionReferenceRetention before right.selection).activity record with
  | true => simp
  | false =>
      have rightWritten := regionalStateFootprint_protects_withdrawn_activity before right.selection right.region right.footprint
        record member rightKeeps rightFacts.2.2.2.2.2.1
      have leftKeeps : (regionalSelectionReferenceRetention before left.selection).activity record = true := by
        cases kept : (regionalSelectionReferenceRetention before left.selection).activity record with
        | true => rfl
        | false =>
            have leftWritten := regionalStateFootprint_protects_withdrawn_activity before left.selection left.region left.footprint
              record member kept leftFacts.2.2.2.2.2.1
            have separated := regional_independent_write_write _ _ independent _ _ leftWritten rightWritten
            simp [regionalStateAtomsConflict, regionalActivityAssociationsConflict, sameActivityOccurrence] at separated
      simp [leftKeeps]

/-- Recomputed reads and writes retain the exact predecessor footprint. In particular,
another deletion cannot silently erase one of this operation's Activity withdrawals. -/
theorem regionalStateFootprint_after_independent_regional (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    regionalStateFootprint? after right.selection right.region = some right.footprint := by
  have footprint := (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.2.2.1
  have queries := regional_pair_region_queries program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied
  have control := (regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied).1
  have activities := withdrawn_activity_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied
  have base : regionalBaseFootprint? after hosting right.selection right.region =
      regionalBaseFootprint? before hosting right.selection right.region := by
    unfold regionalBaseFootprint? regionalCensusWrites
    rw [queries.2.1, queries.2.2]
  simpa only [regionalStateFootprint?, runningInstance?, control, running,
    Option.bind_eq_bind, Option.bind_some, base, activities] using footprint

end BpmnSemantics.SemanticProcess.InternalCommutation
