module

public import Kernel.State

/-! # API correlation criteria a command may carry

Which API criteria (CIB-EXT-0025, PC-MESSAGE-08) a delivery or publication is refused for, decided for the command
before any waiting item or start is asked. Part of the State layer, above `Kernel.State`, so `Kernel.Feature.Correlation`
and `Kernel.Population` share one rule.
-/

public section

namespace Kernel

/-- Whether two of `criteria` name one target. CIB's criteria are a map, so a delivery or publication naming one target
twice is `criteria-duplicate`. -/
def targetsRepeat (criteria : List CorrelationMatch) : Bool :=
  let targets := criteria.map (·.target)
  targets.eraseDups.length != targets.length

/-- Whether CIB's variable query can compare a criterion's value: it refuses a value whose serializer is no primitive
type ("Object values cannot be used to query", `SingleQueryVariableValueCondition.java:83-85`), and the runner hands a
Decimal, a String list, a list and a map over as `BigDecimal`, `ArrayList` and `LinkedHashMap` (CIB-CFG-0009). -/
def queryable : Value → Bool
  | .null | .bool _ | .int _ | .string _ => true
  | .decimal _ _ | .stringList _ | .list _ | .map _ => false

/-- Whether a criterion names a variable, whose value CIB's variable query compares. -/
def namesVariable (criterion : CorrelationMatch) : Bool :=
  match criterion.target with
  | .processVariable _ | .localVariable _ => true
  | .businessKey | .processInstance => false

/-- Why a delivery's or publication's API `criteria` are refused under any of `readings`, or `none`; `startOnly` is a
publication that reaches only root Message starts. Two naming one target are `rejected criteria-duplicate` under every
reading. Under `apiCriteria` a start-only publication carrying a variable criterion is `rejected criteria-start-only`, as
CIB fails it (`MessageCorrelationBuilderImpl.java:249-257`, `:332-336`); otherwise a variable criterion whose value is not
`queryable` is `unsupported`, since CIB rolls such a correlation back. Under `modeledKey`, which matches a criterion only
as a modeled key, any other target is `unsupported`. The refusal reads the criteria, the mode and the readings alone, so
it is the command's: a caller decides it before asking any waiting item, never per item. -/
def criteriaRefusal (readings : List MessageCorrelation) (startOnly : Bool) (criteria : List CorrelationMatch) :
    Option Failure :=
  if targetsRepeat criteria then some (.rejected "criteria-duplicate")
  else readings.findSome? fun
    | .apiCriteria =>
      if startOnly && criteria.any namesVariable then some (.rejected "criteria-start-only")
      else if criteria.any fun criterion => namesVariable criterion && !queryable criterion.expected then
        -- dynamic-only: a delivery's criteria are its caller's.
        some (.unsupported "correlation-criterion-not-primitive")
      else none
    | .modeledKey =>
      if criteria.any fun criterion => !(criterion.target matches .processVariable _) then
        -- dynamic-only: a delivery's criteria are its caller's.
        some (.unsupported "profile-message-correlation-api-criteria")
      else none

/-- Why a publication whose `criteria` reach a root Message start of a deployment under `reading` is refused, or `none`.
Under `apiCriteria` a business-key or process-instance criterion is `unsupported`: CIB starts the instance under a
business-key criterion's key (`AbstractCorrelateMessageCmd.java:85`) and ignores a process-instance criterion when it
seeks a start (`DefaultCorrelationHandler.java:148-165`), neither of which the kernel reproduces. A variable criterion
reaches the start as in CIB, which uses it only to seek a waiting execution (`DefaultCorrelationHandler.java:46-72`) and
starts with the delivered variables alone (`AbstractCorrelateMessageCmd.java:81-95`). Under `modeledKey` a criterion names
a modeled key, which a start does not read. -/
def startCriteriaRefusal (reading : MessageCorrelation) (criteria : List CorrelationMatch) : Option Failure :=
  match reading with
  | .apiCriteria =>
    if criteria.all namesVariable then none
    -- dynamic-only: a publication's criteria are its caller's.
    else some (.unsupported "start-criterion-not-variable")
  | .modeledKey => none

end Kernel
