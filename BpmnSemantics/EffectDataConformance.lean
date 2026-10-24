import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! Finite checked witnesses of the structured effect-data profile run the credit-decision chain through the
actual external dispatcher and its internal closure, so neither a widened result domain alone nor a widened
snapshot alone can satisfy them. They do not discharge a quantified law over arbitrary chains. The 1,024-byte
String bound is stated as laws beside its predicates (`EffectData.checkedAnalysis_refuses_overlong_literal`,
`EffectData.startBindingsAdmitted_refuses_overlong_string`, `serialEffectPatchUnder?_refuses_overlong_string`)
instead of kernel-reducing boundary-sized values; restoration and the aliasing of projected arguments are
TypeScript-only claims; see the
[structured effect-data amendment](../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#source-profile-and-port-contract).
-/

namespace BpmnSemantics.EffectDataConformance

open BpmnSemantics.SemanticProcess

def descriptor (name : String) : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := name }

def identity (profile : ProfileId) : SourceIdentity :=
  { semanticProfile := profile, sourceId := ⟨"credit"⟩
    sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001"
    sourceOverlay := some {
      id := ⟨"handlers"⟩
      sha256 := "0000000000000000000000000000000000000000000000000000000000000002" } }

def assess : CheckedNode :=
  .serviceTask ⟨"C"⟩ (descriptor "assessCredit")
    [{ target := "applicant", expression := .enclosingVariable "applicantRef" }]
    [{ target := "assessment", expression := .localVariable "assessment" }] none

def notify : CheckedNode :=
  .serviceTask ⟨"D"⟩ (descriptor "notifyApplicant")
    [{ target := "assessment", expression := .enclosingVariable "assessment" }]
    [{ target := "receipt", expression := .localVariable "receipt" }] none

/-- Start, assess, notify, End. -/
def chain (profile : ProfileId) : CheckedProcess :=
  { identity := identity profile, processId := ⟨"P"⟩
    definitionScopes := [rootDefinitionScope ⟨"P"⟩]
    nodeScopes := rootNodeScopes ⟨"P"⟩ [⟨"A"⟩, ⟨"C"⟩, ⟨"D"⟩, ⟨"F"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"P"⟩ [⟨"f1"⟩, ⟨"f2"⟩, ⟨"f3"⟩]
    nodes := [.noneStartEvent ⟨"A"⟩, assess, notify, .noneEndEvent ⟨"F"⟩]
    sequenceFlows :=
      [{ id := ⟨"f1"⟩, sourceId := ⟨"A"⟩, targetId := ⟨"C"⟩ },
       { id := ⟨"f2"⟩, sourceId := ⟨"C"⟩, targetId := ⟨"D"⟩ },
       { id := ⟨"f3"⟩, sourceId := ⟨"D"⟩, targetId := ⟨"F"⟩ }] }

def checked : CheckedProcess := chain portableEffectDataProfileId

def program : Program := lowerCheckedProcess checked

/-- The same chain with a User Task between Start and the assessment. -/
def withHumanTask (profile : ProfileId) : CheckedProcess :=
  { chain profile with
    nodeScopes := rootNodeScopes ⟨"P"⟩ [⟨"A"⟩, ⟨"B"⟩, ⟨"C"⟩, ⟨"D"⟩, ⟨"F"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"P"⟩ [⟨"f1"⟩, ⟨"f2"⟩, ⟨"f3"⟩, ⟨"f4"⟩]
    nodes := [.noneStartEvent ⟨"A"⟩, .userTask ⟨"B"⟩ (some "Review") none, assess, notify,
              .noneEndEvent ⟨"F"⟩]
    sequenceFlows :=
      [{ id := ⟨"f1"⟩, sourceId := ⟨"A"⟩, targetId := ⟨"B"⟩ },
       { id := ⟨"f2"⟩, sourceId := ⟨"B"⟩, targetId := ⟨"C"⟩ },
       { id := ⟨"f3"⟩, sourceId := ⟨"C"⟩, targetId := ⟨"D"⟩ },
       { id := ⟨"f4"⟩, sourceId := ⟨"D"⟩, targetId := ⟨"F"⟩ }] }

/-- Repeated equal members, a mixed-type tail, a negative scale-two amount, a nested Map and a present Null. -/
def assessment : VariableValue :=
  .map [("amount", .decimal (-123455) 2),
        ("entries", .list [.map [("a", .integer 1)], .map [("a", .integer 1)], .string "x"]),
        ("nested", .map [("ok", .boolean true)]),
        ("note", .null)]

def applicant : List VariableBinding := [{ name := "applicantRef", value := .string "ap-1" }]

def assessId : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨"C"⟩, 1⟩
def notifyId : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨"D"⟩, 1⟩

def start (bindings : List VariableBinding) : StimulusResult :=
  applyStimulus 8 program initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ bindings)

def started : StimulusResult := start applicant

def completeAssess (patch : List VariableBinding) : StimulusResult :=
  applyStimulus 8 program started.state (.completeEffect ⟨"assess"⟩ assessId (.success patch))

def assessmentPatch (value : VariableValue) : List VariableBinding :=
  [{ name := "assessment", value }]

def assessed : StimulusResult := completeAssess (assessmentPatch assessment)

def completed : StimulusResult :=
  applyStimulus 8 program assessed.state
    (.completeEffect ⟨"notify"⟩ notifyId (.success [{ name := "receipt", value := .map [("ok", .boolean true)] }]))

def refusedUnchanged (result : StimulusResult) (before : RuntimeState) : Bool :=
  result.outcome == .rejected && result.state == before

theorem credit_chain_admitted_with_one_required_start_property :
    checkedWellFormed checked = true ∧ programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      (EffectData.programAnalysis program).map (·.required) = some ["applicantRef"] := by
  decide +kernel

/-- PBV-EFF-01 through PBV-EFF-04 along the whole chain: Start copies the Property into the first snapshot,
the structured result is written exactly and copied by value into the next task's snapshot while the retired
Activity-local scope is gone, and the chain completes with a structured receipt. Each step is one dispatcher
evaluation; the conjuncts only read its result. -/
theorem structured_assessment_flows_through_the_credit_chain_exactly :
    (started.outcome == .committed &&
      started.state.effectWaits.map (·.arguments) == [[{ name := "applicant", value := .string "ap-1" }]] &&
      assessed.outcome == .committed &&
      assessed.state.variables.process.bindings ==
        [{ name := "applicantRef", value := .string "ap-1" }, { name := "assessment", value := assessment }] &&
      assessed.state.effectWaits.map (·.arguments) == [[{ name := "assessment", value := assessment }]] &&
      assessed.state.variables.activities.map (·.owner) == [.effectOccurrence notifyId] &&
      completed.outcome == .committed && completed.state.control == .completed ⟨"I"⟩ &&
      completed.state.effectWaits.isEmpty && completed.state.variables.activities.isEmpty &&
      completed.state.variables.process.bindings ==
        [{ name := "applicantRef", value := .string "ap-1" }, { name := "assessment", value := assessment },
         { name := "receipt", value := .map [("ok", .boolean true)] }]) = true := by
  decide +kernel

/-- Null and an empty Map are present values: each is written and snapshotted, never treated as absent. -/
theorem null_and_empty_map_are_present_results :
    (completeAssess (assessmentPatch .null)).outcome = .committed ∧
      (completeAssess (assessmentPatch .null)).state.effectWaits.map (·.arguments) =
        [[{ name := "assessment", value := .null }]] ∧
      (completeAssess (assessmentPatch (.map []))).outcome = .committed ∧
      (completeAssess (assessmentPatch (.map []))).state.effectWaits.map (·.arguments) =
        [[{ name := "assessment", value := .map [] }]] := by
  decide +kernel

/-- PBV-EFF-02: a root List or StringList result, a missing or extra local, and a patch for another
occurrence are semantic rejections that leave the committed state byte for byte unchanged. -/
theorem invalid_results_refuse_without_partial_writes :
    refusedUnchanged (completeAssess (assessmentPatch (.list [.string "a"]))) started.state = true ∧
      refusedUnchanged (completeAssess (assessmentPatch (.stringList ["a"]))) started.state = true ∧
      refusedUnchanged (completeAssess []) started.state = true ∧
      refusedUnchanged (completeAssess (assessmentPatch assessment ++ [{ name := "zextra", value := .null }]))
        started.state = true ∧
      refusedUnchanged (completeAssess [{ name := "other", value := assessment }]) started.state = true ∧
      refusedUnchanged
        (applyStimulus 8 program started.state (.completeEffect ⟨"wrong"⟩ notifyId
          (.success [{ name := "receipt", value := .null }]))) started.state = true := by
  decide +kernel

/-- PBV-EFF-01: Process Start stays String or Null and must bind every required input. -/
theorem start_keeps_string_or_null :
    (start [{ name := "applicantRef", value := .null }]).outcome = .committed ∧
      (start [{ name := "applicantRef", value := assessment }]).outcome = .rejected ∧
      (start [{ name := "applicantRef", value := .list [] }]).outcome = .rejected ∧
      (start []).outcome = .rejected := by
  decide +kernel

/-- The scalar contract is the discriminator: the same patch is refused by the earlier profiles' definition
and accepted only by the item arm, and every other profile selects the scalar arm. -/
theorem result_domain_is_selected_by_the_exact_profile :
    serialEffectPatch? ["assessCredit", "notifyApplicant"] [{ target := "assessment", expression := .localVariable "assessment" }]
        [] (assessmentPatch assessment) = none ∧
      (serialEffectPatchUnder? .singletonBusinessItem ["assessCredit", "notifyApplicant"]
        [{ target := "assessment", expression := .localVariable "assessment" }] []
        (assessmentPatch assessment)).isSome = true ∧
      programEffectMappingValuePolicy program = .singletonBusinessItem ∧
      programEffectMappingValuePolicy { program with identity := { program.identity with
        semanticProfile := serialBusinessTaskProfileId } } = .scalar := by
  decide +kernel

/-- SBT-CHAIN-01 without Human vertices: the amendment makes a User Task unsupported rather than
passive, and the earlier serial profile still admits the same graph. -/
theorem user_task_is_unsupported_at_capability_admission :
    (EffectData.checkedAnalysis (withHumanTask portableEffectDataProfileId)).isNone = true ∧
      programProfileCapabilitiesValid (lowerCheckedProcess (withHumanTask portableEffectDataProfileId)) = false ∧
      (SerialBusinessTask.checkedAnalysis (withHumanTask serialBusinessTaskProfileId)).isSome = true := by
  decide +kernel

end BpmnSemantics.EffectDataConformance
