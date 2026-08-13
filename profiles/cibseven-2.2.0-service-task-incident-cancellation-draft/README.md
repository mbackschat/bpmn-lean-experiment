# CIB Seven 2.2.0 Service Task incident cancellation profile

The [immutable profile artifact](profile.json) is the cancellation successor to the [Service Task incident profile](../cibseven-2.2.0-service-task-incident-draft/README.md). It selects the same private executable `None Start Event → Service Task → None End Event` source and effect binding, adds one string Process-start variable, and admits cancellation of the exact root Process only through its published generation-1 incident.

The profile composes the existing effect, incident, configuration, and projection relationships with `CIB-EXT-0006`, `CIB-EXT-0014`, and `CIB-OP-0009`. Canonical projection requires the positive `EXTERNALLY_TERMINATED` historic Process fact and preserves `preserved = "before-cancel"`; runtime absence alone is insufficient.

Raw CIB Process, job, incident, execution, history, and deletion-reason identity remain private. Arbitrary deletion, nested cancellation, Product 2, compensation, Transaction Cancel, modeled Terminate, native host cancellation, retry cycles, and a second semantic incident remain excluded.
