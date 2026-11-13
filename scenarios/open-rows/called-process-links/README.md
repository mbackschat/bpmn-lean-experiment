# Link pairs at a called process's top level

A Link pair joins two sections of one Process level (BPMN 2.0.2 Clause 10.5.5), and a called Process behaves as a normal Process (Clause 13.3.4), so a Link pair at the top level of a process a Call Activity calls pairs within that process. The [model](called-process-links.bpmn) calls *Assess a claim*, whose start reaches the throwing Link *To review*; its catching Link *From intake* leads to the User Task *Review the claim*. The witness belongs to [PC-BASIC-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), the Link throw and catch row.

The answer-free [schedule](review-then-notify.scenario.json) starts the claim, completes *Review the claim* in the called instance and then *Notify the claimant* in the caller. No expected result appears in target input.
