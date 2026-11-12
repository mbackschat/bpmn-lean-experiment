module

public import Kernel.IL.Types.Expression
public import Kernel.IL.Types.Message
public import Kernel.IL.Types.Reference

/-! # Work

What an Activity does, one record per kind, and the IL's queries on it. Part of `Kernel.IL.Types`, which re-exports it.
-/

public section

namespace Kernel

structure UserWork where
  name : Option String := none
  assignee : Option ValueSource := none
  candidateUsers : List ValueSource := []
  candidateGroups : List ValueSource := []
  formKey : Option String := none
  formFields : List (String × String) := []
  dueDate : Option ValueSource := none
  followUpDate : Option ValueSource := none
  priority : Option ValueSource := none
  deriving Repr

/-- `instantiate` marks a Receive Task that instantiates its Process (BPMN 2.0.2 §10.3.3, Table 10.10). -/
structure ReceiveWork where
  message : MessageTrigger
  instantiate : Bool := false
  deriving Repr

/-- `handlerKey` is the root identifier of the `camunda:delegateExpression` the binding was read from, which CIB
resolves against process variables before its beans (CIB-LIM-0017); admission compares it with the declared names. -/
structure ServiceWork where
  protocol : String
  operation : String
  handlerKey : Option String := none
  deriving Repr

structure SendWork where
  binding : EffectBinding
  /-- As `ServiceWork.handlerKey`. -/
  handlerKey : Option String := none
  recipient : Option ValueSource := none
  correlation : List CorrelationCriterion := []
  messageRef : Option String := none
  operationRef : Option String := none
  deriving Repr

/-- `source` is the inline `script` element's text, `none` when the element is absent, which CIB refuses at deployment
unless a resource is given (`ScriptUtil#getScript`); `resource` is the external script a `camunda:resource` names
instead (CIB's `BpmnParse#parseScriptTaskElement`), which admission refuses (`work.script.resource`,
SCRIPT-SEMANTICS-SPEC). -/
structure ScriptWork where
  format : String
  source : Option String := none
  resultVariable : Option String := none
  resource : Option String := none
  deriving Repr

inductive DecisionResultMapping where
  | singleEntry
  | singleResult
  | collectEntries
  | resultList
  deriving DecidableEq, Repr

structure RuleWork where
  decision : ValueSource
  resultVariable : Option String := none
  binding : CallBinding := .latest
  resultMapping : DecisionResultMapping := .resultList
  tenant : Option ValueSource := none
  deriving Repr

/-- Guarded type: `Kernel.Feature.Work` owns matching on it. -/
inductive Work where
  | none
  | manual
  | user (payload : UserWork)
  | receive (payload : ReceiveWork)
  | service (payload : ServiceWork)
  | send (payload : SendWork)
  | script (payload : ScriptWork)
  | rule (payload : RuleWork)
  | call (payload : CallWork)
  deriving Repr

/-- The Call a work record names, if it is one. -/
def Work.call? : Work → Option CallWork
  | .call work => some work
  | Work.none => Option.none
  | .manual => Option.none
  | .user _ => Option.none
  | .receive _ => Option.none
  | .service _ => Option.none
  | .send _ => Option.none
  | .script _ => Option.none
  | .rule _ => Option.none

/-- Whether the work opens a host effect (a Service Task). -/
def Work.isService : Work → Bool
  | .service _ => true
  | Work.none => false
  | .manual => false
  | .user _ => false
  | .receive _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

/-- Whether the work opens a User Task. -/
def Work.isUser : Work → Bool
  | .user _ => true
  | Work.none => false
  | .manual => false
  | .receive _ => false
  | .service _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

/-- The names a work's own result writes, beside its element's mappings: a User Task's form fields and a Script or
Business Rule Task's result variable. -/
def Work.results : Work → List String
  | .user task => task.formFields.map (·.1)
  | .script work => work.resultVariable.toList
  | .rule work => work.resultVariable.toList
  | Work.none => []
  | .manual => []
  | .receive _ => []
  | .service _ => []
  | .send _ => []
  | .call _ => []

/-- The Message a work record waits for, if it does. -/
def Work.receive? : Work → Option MessageTrigger
  | .receive work => some work.message
  | Work.none => Option.none
  | .manual => Option.none
  | .user _ => Option.none
  | .service _ => Option.none
  | .send _ => Option.none
  | .script _ => Option.none
  | .rule _ => Option.none
  | .call _ => Option.none

end Kernel
