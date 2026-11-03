# Exclusive Choice without a default scenarios

The [Exclusive Choice without a default proposal](../../docs/capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-PROPOSAL.md#separating-witnesses) owns the bounded account. Both models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one mapped Service Task to a caller-supplied Activity handler.

- The [expense routing](expense-routing.bpmn), with its [handler](expense-routing-overlay.json), routes a claim by its Start-supplied `category` through the Choice *Route by category*, which has no default, to *Review travel* or *Review equipment*, then reimburses the claimant through the Service Task *Reimburse claimant*.
- The [ticket triage](ticket-triage.bpmn), with its [handler](ticket-triage-overlay.json), assesses `severity` in the User Task *Triage ticket* inside the Sub-Process *Triage*, then routes through the Choice *Route by severity*, which has no default, to the User Task *Escalate* or to the Service Task *Auto-close*.

The [CIB calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveChoiceWithoutDefaultProbeTest.java) drives four journeys in CIB Seven `2.2.0` with JUEL renditions of the conditions:

- a travel expense opens its review;
- a catering expense fails its Start with `ENGINE-02004` and leaves no instance;
- a medium ticket fails its triage completion with `ENGINE-02004`, leaving the task open, until it is completed as high;
- a low ticket arms the auto-close with the ticket.
