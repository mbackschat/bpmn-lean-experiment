# BPMN 2.0.2 Terminate End Event draft profile

The [profile artifact](profile.json) selects one Terminate End Event inside one ordinary embedded Sub-Process. Reaching it atomically clears every live owner in that child scope occurrence, retains the now-quiescent occurrence for unchanged scope completion, and continues once to the Outer User Task. The same semantic representation remains root-capable, but root-level source admission is deferred.

BPMN 2.0.2 Clauses 10.5.6, 13.2, 13.3.4, and 13.5.6 plus Table 12.22 are the normative authority. The exact selected source, containing-scope account, proofs, hosting boundary, evidence, and exclusions belong to the [Terminate End Event capsule](../../docs/capsules/TERMINATE-END-EVENT-PROPOSAL.md).

`CIB-AGR-0001`, `CIB-AGR-0002`, `CIB-AGR-0003`, `CIB-AGR-0007`, and `CIB-OP-0001` apply only to already reviewed User Task, active-task, parallel, ordinary Sub-Process completion, and occurrence-mapping surfaces. This standards-only profile selects no CIB Terminate target or retained CIB evidence.
