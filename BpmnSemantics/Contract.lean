/-! # BpmnSemantics.Contract — profile-independent outcome vocabulary

This module captures distinctions required directly by the architecture handoff before
any BPMN feature semantics are chosen. It deliberately contains no CIB Seven, Temporal,
or BPMN execution algorithm.
-/

namespace BpmnSemantics

/-- The semantic result of processing one externally initiated command. -/
inductive CommandOutcome where
  | committed
  | rolledBack
  | rejected
  | semanticFailure
  | unsupported
  deriving Repr, DecidableEq

namespace CommandOutcome

/-- Whether the outcome explicitly records a committed command. -/
def isCommit : CommandOutcome → Bool
  | .committed => true
  | .rolledBack
  | .rejected
  | .semanticFailure
  | .unsupported => false

end CommandOutcome

/-- A scenario result keeps semantic outcomes separate from harness and infrastructure failure. -/
inductive ScenarioOutcome where
  | semantic (outcome : CommandOutcome)
  | harnessFailure
  | infrastructureFailure
  deriving Repr, DecidableEq

end BpmnSemantics
