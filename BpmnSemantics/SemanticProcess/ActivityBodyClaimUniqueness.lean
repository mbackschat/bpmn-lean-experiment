import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Activity body-claim uniqueness

This module owns `AOO-CLAIM-01`: distinct Activity occurrence records may not claim the same User
Task or child-scope body. Task and scope claims remain separate domains, and repeated equal members
inside one parallel body still belong to that single record.

The predicate depends only on the ordered body projection. Activity identity, body liveness,
controller binding, and host order are independent obligations and are not inferred here.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Every exact User Task identity one Activity body claims. -/
def activityBodyTaskClaims : ActivityBody → List OccurrenceId
  | .userTask task => [task]
  | .parallelUserTasks first rest => first :: rest
  | .childScope _ => []

/-- Every exact child-scope identity one Activity body claims. -/
def activityBodyScopeClaims : ActivityBody → List ScopeOccurrenceId
  | .childScope scope => [scope]
  | .userTask _ | .parallelUserTasks .. => []

private def exactListsOverlap [DecidableEq α] (left right : List α) : Bool :=
  left.any fun leftClaim => right.any fun rightClaim => decide (leftClaim = rightClaim)

private theorem exactListsOverlap_comm [DecidableEq α] (left right : List α) :
    exactListsOverlap left right = exactListsOverlap right left := by
  apply Bool.eq_iff_iff.mpr
  simp only [exactListsOverlap, List.any_eq_true, decide_eq_true_eq]
  constructor
  · rintro ⟨leftClaim, leftMember, rightClaim, rightMember, equal⟩
    exact ⟨rightClaim, rightMember, leftClaim, leftMember, equal.symm⟩
  · rintro ⟨rightClaim, rightMember, leftClaim, leftMember, equal⟩
    exact ⟨leftClaim, leftMember, rightClaim, rightMember, equal.symm⟩

/-- Two records share neither a task claim nor a child-scope claim. -/
def activityBodyClaimsDisjoint (left right : ActivityOccurrence) : Bool :=
  !exactListsOverlap (activityBodyTaskClaims left.body) (activityBodyTaskClaims right.body) &&
    !exactListsOverlap (activityBodyScopeClaims left.body) (activityBodyScopeClaims right.body)

theorem activityBodyClaimsDisjoint_comm (left right : ActivityOccurrence) :
    activityBodyClaimsDisjoint left right = activityBodyClaimsDisjoint right left := by
  simp only [activityBodyClaimsDisjoint, exactListsOverlap_comm]

/-- `AOO-CLAIM-01`. Every pair of distinct record positions has disjoint body claims. -/
def activityBodyClaimsUnique : List ActivityOccurrence → Bool
  | [] => true
  | record :: rest =>
      rest.all (activityBodyClaimsDisjoint record) && activityBodyClaimsUnique rest

theorem activityBodyClaimsUnique_cons (record : ActivityOccurrence)
    (records : List ActivityOccurrence) :
    activityBodyClaimsUnique (record :: records) =
      (records.all (activityBodyClaimsDisjoint record) &&
        activityBodyClaimsUnique records) := by
  rfl

/-- Empty and singleton record sets carry no cross-record collision. -/
theorem activityBodyClaimsUnique_singleton (record : ActivityOccurrence) :
    activityBodyClaimsUnique [record] = true := by
  rfl

/-- Any two distinct records held by a unique collection carry disjoint claims. -/
theorem activityBodyClaimsUnique_pair {records : List ActivityOccurrence}
    (unique : activityBodyClaimsUnique records = true)
    {left right : ActivityOccurrence} (leftMem : left ∈ records) (rightMem : right ∈ records)
    (different : left ≠ right) : activityBodyClaimsDisjoint left right = true := by
  induction records with
  | nil => simp at leftMem
  | cons current rest ih =>
      simp only [activityBodyClaimsUnique, Bool.and_eq_true] at unique
      rcases List.mem_cons.mp leftMem with leftHead | leftRest
      · subst left
        rcases List.mem_cons.mp rightMem with rightHead | rightRest
        · subst right
          exact False.elim (different rfl)
        · exact List.all_eq_true.mp unique.1 right rightRest
      · rcases List.mem_cons.mp rightMem with rightHead | rightRest
        · subst right
          rw [activityBodyClaimsDisjoint_comm]
          exact List.all_eq_true.mp unique.1 left leftRest
        · exact ih unique.2 leftRest rightRest

/-- Disjoint Activity records cannot both contain one exact User Task claim. -/
theorem activityBodyClaimsDisjoint_no_shared_task {left right : ActivityOccurrence}
    {task : OccurrenceId} (disjoint : activityBodyClaimsDisjoint left right = true)
    (leftClaims : task ∈ activityBodyTaskClaims left.body)
    (rightClaims : task ∈ activityBodyTaskClaims right.body) : False := by
  have overlap : exactListsOverlap (activityBodyTaskClaims left.body)
      (activityBodyTaskClaims right.body) = true := by
    simp only [exactListsOverlap, List.any_eq_true, decide_eq_true_eq]
    exact ⟨task, leftClaims, task, rightClaims, rfl⟩
  unfold activityBodyClaimsDisjoint at disjoint
  rw [overlap] at disjoint
  simp at disjoint

/-- Disjoint Activity records cannot both contain one exact child-scope claim. -/
theorem activityBodyClaimsDisjoint_no_shared_scope {left right : ActivityOccurrence}
    {scope : ScopeOccurrenceId} (disjoint : activityBodyClaimsDisjoint left right = true)
    (leftClaims : scope ∈ activityBodyScopeClaims left.body)
    (rightClaims : scope ∈ activityBodyScopeClaims right.body) : False := by
  have overlap : exactListsOverlap (activityBodyScopeClaims left.body)
      (activityBodyScopeClaims right.body) = true := by
    simp only [exactListsOverlap, List.any_eq_true, decide_eq_true_eq]
    exact ⟨scope, leftClaims, scope, rightClaims, rfl⟩
  unfold activityBodyClaimsDisjoint at disjoint
  rw [overlap] at disjoint
  simp at disjoint

/-- A singular incoming task body is disjoint from a record that does not already claim it. -/
theorem activityBodyClaimsDisjoint_userTask_of_not_mem (record other : ActivityOccurrence)
    (incoming : OccurrenceId)
    (absent : incoming ∉ activityBodyTaskClaims other.body) :
    activityBodyClaimsDisjoint { record with body := .userTask incoming } other = true := by
  cases bodyShape : other.body <;>
    simp_all [activityBodyClaimsDisjoint, exactListsOverlap, activityBodyTaskClaims,
      activityBodyScopeClaims]
  intro task taskMem same
  subst task
  exact absent.2 taskMem

/-- An incoming child-scope body is disjoint from a record that does not already claim it. -/
theorem activityBodyClaimsDisjoint_childScope_of_not_mem (record other : ActivityOccurrence)
    (incoming : ScopeOccurrenceId)
    (absent : incoming ∉ activityBodyScopeClaims other.body) :
    activityBodyClaimsDisjoint { record with body := .childScope incoming } other = true := by
  cases bodyShape : other.body <;>
    simp_all [activityBodyClaimsDisjoint, exactListsOverlap, activityBodyTaskClaims,
      activityBodyScopeClaims]

/-- A parallel incoming body is disjoint when none of its member claims occurs in the other record. -/
theorem activityBodyClaimsDisjoint_parallel_of_forall_not_mem (record other : ActivityOccurrence)
    (first : OccurrenceId) (rest : List OccurrenceId)
    (absent : ∀ task ∈ first :: rest, task ∉ activityBodyTaskClaims other.body) :
    activityBodyClaimsDisjoint { record with body := .parallelUserTasks first rest } other = true := by
  have noOverlap : exactListsOverlap (first :: rest) (activityBodyTaskClaims other.body) = false := by
    apply Bool.eq_false_iff.mpr
    intro overlap
    simp only [exactListsOverlap, List.any_eq_true, decide_eq_true_eq] at overlap
    obtain ⟨left, leftMem, right, rightMem, equal⟩ := overlap
    subst right
    exact absent left leftMem rightMem
  change (!exactListsOverlap (first :: rest) (activityBodyTaskClaims other.body) &&
    !exactListsOverlap [] (activityBodyScopeClaims other.body)) = true
  rw [noOverlap]
  rfl

/-- Removing members from one parallel body cannot create a collision with another record. -/
theorem activityBodyClaimsDisjoint_parallel_of_subset (record other : ActivityOccurrence)
    (first : OccurrenceId) (rest : List OccurrenceId)
    (subset : ∀ task ∈ first :: rest, task ∈ activityBodyTaskClaims record.body)
    (disjoint : activityBodyClaimsDisjoint record other = true) :
    activityBodyClaimsDisjoint { record with body := .parallelUserTasks first rest } other = true := by
  apply activityBodyClaimsDisjoint_parallel_of_forall_not_mem
  intro task taskMem otherMem
  exact activityBodyClaimsDisjoint_no_shared_task disjoint (subset task taskMem) otherMem

/-- Two task identities naming the same live wait are the same semantic occurrence. -/
theorem taskIdNamesWait_injective {left right : OccurrenceId} {wait : UserTaskWait}
    (leftNames : taskIdNamesWait left wait = true)
    (rightNames : taskIdNamesWait right wait = true) : left = right := by
  simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at leftNames rightNames
  cases left with
  | mk leftProcess leftElement leftActivation =>
      cases right with
      | mk rightProcess rightElement rightActivation =>
          cases leftElement with
          | mk leftValue =>
              cases rightElement with
              | mk rightValue => simp_all

private theorem recordBodyNamesWait_supplies_claim {record : ActivityOccurrence}
    {wait : UserTaskWait} (holds : recordBodyNamesWait wait record = true) :
    ∃ task, task ∈ activityBodyTaskClaims record.body ∧ taskIdNamesWait task wait = true := by
  cases bodyShape : record.body <;>
    simp_all [recordBodyNamesWait, activityBodyTask?, activityBodyTaskClaims]

/-- A unique Activity record collection contains at most one singular body naming one live wait. -/
theorem activityBodyClaimsUnique_task_wait_at_most_one (records : List ActivityOccurrence)
    (wait : UserTaskWait) (unique : activityBodyClaimsUnique records = true) :
    (records.filter (recordBodyNamesWait wait)).length ≤ 1 := by
  induction records with
  | nil => simp
  | cons current rest ih =>
      simp only [activityBodyClaimsUnique, Bool.and_eq_true] at unique
      cases currentMatches : recordBodyNamesWait wait current with
      | false => simpa [currentMatches] using ih unique.2
      | true =>
          obtain ⟨currentTask, currentClaim, currentNames⟩ :=
            recordBodyNamesWait_supplies_claim currentMatches
          have restEmpty : rest.filter (recordBodyNamesWait wait) = [] :=
            List.filter_eq_nil_iff.mpr fun other otherMem otherMatches => by
              obtain ⟨otherTask, otherClaim, otherNames⟩ :=
                recordBodyNamesWait_supplies_claim otherMatches
              have same := taskIdNamesWait_injective currentNames otherNames
              subst otherTask
              exact activityBodyClaimsDisjoint_no_shared_task
                (List.all_eq_true.mp unique.1 other otherMem) currentClaim otherClaim
          simp [currentMatches, restEmpty]

/-- A task body present in a unique collection is the record returned by the wait-keyed lookup. -/
theorem activityOccurrenceForTaskWait_unique (records : List ActivityOccurrence)
    (wait : UserTaskWait) (record : ActivityOccurrence)
    (unique : activityBodyClaimsUnique records = true)
    (mem : record ∈ records)
    (body : ∃ task, activityBodyTask? record = some task ∧ taskIdNamesWait task wait = true) :
    activityOccurrenceForTaskWait? records wait = some record := by
  obtain ⟨task, bodyEq, names⟩ := body
  have bodyMatches : recordBodyNamesWait wait record = true := by
    simp [recordBodyNamesWait, bodyEq, names]
  have memFilter : record ∈ records.filter (recordBodyNamesWait wait) :=
    List.mem_filter.mpr ⟨mem, bodyMatches⟩
  have positive := List.length_pos_of_mem memFilter
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp
    (Nat.le_antisymm (activityBodyClaimsUnique_task_wait_at_most_one records wait unique) positive)
  have sameRecord : record = only := by
    have := singleton ▸ memFilter
    simpa using this
  simp [activityOccurrenceForTaskWait?, singleton, sameRecord]

private theorem activityBodyScopeMatch_supplies_claim {record : ActivityOccurrence}
    {scope : ScopeOccurrenceId} (holds : (activityBodyScope? record == some scope) = true) :
    scope ∈ activityBodyScopeClaims record.body := by
  cases bodyShape : record.body <;>
    simp_all [activityBodyScope?, activityBodyScopeClaims]

/-- A unique Activity record collection contains at most one body claiming one exact child scope. -/
theorem activityBodyClaimsUnique_scope_at_most_one (records : List ActivityOccurrence)
    (scope : ScopeOccurrenceId) (unique : activityBodyClaimsUnique records = true) :
    (records.filter fun record => activityBodyScope? record == some scope).length ≤ 1 := by
  induction records with
  | nil => simp
  | cons current rest ih =>
      simp only [activityBodyClaimsUnique, Bool.and_eq_true] at unique
      cases currentMatches : (activityBodyScope? current == some scope) with
      | false => simpa [currentMatches] using ih unique.2
      | true =>
          have currentClaim := activityBodyScopeMatch_supplies_claim currentMatches
          have restEmpty : (rest.filter fun record =>
              activityBodyScope? record == some scope) = [] :=
            List.filter_eq_nil_iff.mpr fun other otherMem otherMatches => by
              exact activityBodyClaimsDisjoint_no_shared_scope
                (List.all_eq_true.mp unique.1 other otherMem) currentClaim
                (activityBodyScopeMatch_supplies_claim otherMatches)
          simp [currentMatches, restEmpty]

/-- A child-scope body present in a unique collection is the record returned by the scope lookup. -/
theorem activityOccurrenceForScope_unique (records : List ActivityOccurrence)
    (scope : ScopeOccurrenceId) (record : ActivityOccurrence)
    (unique : activityBodyClaimsUnique records = true)
    (mem : record ∈ records) (body : activityBodyScope? record = some scope) :
    activityOccurrenceForScope? records scope = some record := by
  have bodyMatches : (activityBodyScope? record == some scope) = true := by simp [body]
  have memFilter : record ∈ records.filter fun candidate =>
      activityBodyScope? candidate == some scope := List.mem_filter.mpr ⟨mem, bodyMatches⟩
  have positive := List.length_pos_of_mem memFilter
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp
    (Nat.le_antisymm (activityBodyClaimsUnique_scope_at_most_one records scope unique) positive)
  have sameRecord : record = only := by
    have := singleton ▸ memFilter
    simpa using this
  simp [activityOccurrenceForScope?, singleton, sameRecord]

/-- A rewrite that leaves the complete Activity record list unchanged preserves the rule. -/
theorem activityBodyClaimsUnique_frame (before after : RuntimeState)
    (records : after.activityOccurrences = before.activityOccurrences) :
    activityBodyClaimsUnique after.activityOccurrences =
      activityBodyClaimsUnique before.activityOccurrences := by
  rw [records]

/-- Rewriting at most one selected record preserves uniqueness when the rewritten claimant is
disjoint from every unselected record. -/
theorem activityBodyClaimsUnique_map_selected (records : List ActivityOccurrence)
    (selected : ActivityOccurrence → Bool)
    (rewrite : ActivityOccurrence → ActivityOccurrence)
    (unique : activityBodyClaimsUnique records = true)
    (atMostOne : (records.filter selected).length ≤ 1)
    (frame : ∀ record, selected record = false → rewrite record = record)
    (fresh : ∀ chosen ∈ records, ∀ other ∈ records,
      selected chosen = true → selected other = false →
      activityBodyClaimsDisjoint (rewrite chosen) other = true) :
    activityBodyClaimsUnique (records.map rewrite) = true := by
  induction records with
  | nil => rfl
  | cons current rest ih =>
      simp only [List.map_cons, activityBodyClaimsUnique, Bool.and_eq_true] at unique ⊢
      constructor
      · simp only [List.all_map, Function.comp_apply, List.all_eq_true]
        intro candidate candidateMem
        have original := List.all_eq_true.mp unique.1 candidate candidateMem
        cases currentSelected : selected current with
        | false =>
            cases candidateSelected : selected candidate with
            | false =>
                rw [frame current currentSelected, frame candidate candidateSelected]
                exact original
            | true =>
                rw [activityBodyClaimsDisjoint_comm]
                simpa [frame current currentSelected] using
                  fresh candidate (List.mem_cons_of_mem current candidateMem) current
                    (List.mem_cons_self) candidateSelected currentSelected
        | true =>
            cases candidateSelected : selected candidate with
            | false =>
                rw [frame candidate candidateSelected]
                exact fresh current List.mem_cons_self candidate
                  (List.mem_cons_of_mem current candidateMem) currentSelected candidateSelected
            | true =>
                have selectedMem : candidate ∈ rest.filter selected :=
                  List.mem_filter.mpr ⟨candidateMem, candidateSelected⟩
                have positive := List.length_pos_of_mem selectedMem
                have lengthEq : ((current :: rest).filter selected).length =
                    (rest.filter selected).length + 1 := by
                  simp [currentSelected]
                omega
      · apply ih unique.2
        have restBound : (rest.filter selected).length ≤ 1 := by
          cases currentSelected : selected current with
          | false =>
              have lengthEq : ((current :: rest).filter selected).length =
                  (rest.filter selected).length := by
                simp [currentSelected]
              omega
          | true =>
              have lengthEq : ((current :: rest).filter selected).length =
                  (rest.filter selected).length + 1 := by
                simp [currentSelected]
              omega
        exact restBound
        intro chosen chosenMem other otherMem
        exact fresh chosen (List.mem_cons_of_mem current chosenMem) other
          (List.mem_cons_of_mem current otherMem)

/-- Removing any subset of records cannot introduce a body claimant. -/
theorem activityBodyClaimsUnique_filter (records : List ActivityOccurrence)
    (keep : ActivityOccurrence → Bool)
    (unique : activityBodyClaimsUnique records = true) :
    activityBodyClaimsUnique (records.filter keep) = true := by
  induction records with
  | nil => rfl
  | cons record rest ih =>
      simp only [activityBodyClaimsUnique, Bool.and_eq_true] at unique
      have restUnique := ih unique.2
      have disjointRetained :
          (rest.filter keep).all (activityBodyClaimsDisjoint record) = true := by
        simp only [List.all_eq_true] at unique ⊢
        intro candidate retained
        exact unique.1 candidate (List.mem_filter.mp retained).1
      cases kept : keep record with
      | false => simpa [kept] using restUnique
      | true => simpa [kept, activityBodyClaimsUnique] using
          And.intro disjointRetained restUnique

/-- Canonical insertion preserves uniqueness when the incoming record is disjoint from every
predecessor record. -/
theorem activityBodyClaimsUnique_insertActivityOccurrence (record : ActivityOccurrence)
    (records : List ActivityOccurrence)
    (fresh : records.all (activityBodyClaimsDisjoint record) = true)
    (unique : activityBodyClaimsUnique records = true) :
    activityBodyClaimsUnique (insertActivityOccurrence record records) = true := by
  induction records with
  | nil => rfl
  | cons current rest ih =>
      simp only [List.all_cons, Bool.and_eq_true] at fresh
      simp only [activityBodyClaimsUnique, Bool.and_eq_true] at unique
      unfold insertActivityOccurrence
      by_cases before : activityOccurrenceBefore record current = true
      · simp [before, activityBodyClaimsUnique, fresh, unique]
      · simp only [Bool.not_eq_true] at before
        have insertedUnique := ih fresh.2 unique.2
        have disjointInserted :
            (insertActivityOccurrence record rest).all
              (activityBodyClaimsDisjoint current) = true := by
          rw [all_insertActivityOccurrence]
          simp only [Bool.and_eq_true]
          exact ⟨by simpa [activityBodyClaimsDisjoint_comm] using fresh.1, unique.1⟩
        simpa [before, activityBodyClaimsUnique] using
          And.intro disjointInserted insertedUnique

end BpmnSemantics.SemanticProcess
