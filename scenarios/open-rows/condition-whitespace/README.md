# Whitespace-wrapped Sequence Flow conditions

Neutral inputs for the Sequence Flow condition reading of [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). CIB Seven `2.2.0` applies Java `String.trim` to a condition's text before it parses it (`BpmnParse.java:4394`, `:4400`), so a condition written across lines or padded with spaces reads as the expression it wraps. Without that trim it would be a JUEL composite of text and an eval, a String that fails the condition. They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and no schedule states one. The profile is `cibseven-2.2.0` with no source overlay.

[wrapped-conditions.bpmn](wrapped-conditions.bpmn) routes at an Exclusive Gateway. Its first condition, `${amount > 1000}`, is wrapped in line breaks and indentation. Its second, `${flagged}`, is padded with spaces. The default flow leads to `UserTask_Standard`. Each schedule has one stimulus, the start, so the observation is the User Task the start opens, or the failure of the starting command.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [large](large.scenario.json) | [wrapped-conditions](wrapped-conditions.bpmn) | `amount = 5000`, `flagged = false`: the wrapped condition holds | PC-DATA-07 |
| [flagged](flagged.scenario.json) | [wrapped-conditions](wrapped-conditions.bpmn) | `amount = 10`, `flagged = true`: the wrapped condition fails and the padded one holds | PC-DATA-07 |
| [neither](neither.scenario.json) | [wrapped-conditions](wrapped-conditions.bpmn) | `amount = 10`, `flagged = false`: both conditions fail and the default flow is taken | PC-DATA-07 |
