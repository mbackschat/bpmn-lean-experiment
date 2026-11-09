# Portable business effect-data scenarios

The [profile](../../profiles/cibseven-2.2.0-portable-business-effect-data-draft/profile.json) and [semantics specification](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the bounded account. [credit-decision.bpmn](credit-decision.bpmn) is the retained project-authored credit decision: Service Task *Assess credit* returns one structured assessment, which Service Task *Notify applicant* receives as its input. The exact [source overlay](source-overlay.json) binds both operations to caller-supplied Activity handlers. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent.

| Scenario | Journey |
|---|---|
| [Assessed application](credit-assessed.scenario.json) | Assess returns a Map with two equal and one unequal credit check, a negative scale-two Decimal, a nested contact Map, a Boolean and a present Null; Notify receives it whole and returns a String receipt. |
| [Present Null](credit-null.scenario.json) | Assess returns Null, which Notify receives as a present value, and Notify returns an empty-Map receipt. |
