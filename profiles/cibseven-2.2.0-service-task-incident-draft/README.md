# CIB Seven 2.2.0 Service Task incident profile

The [immutable profile artifact](profile.json) is the configured successor to the [success-only Service Task effect profile](../cibseven-2.2.0-service-task-effect-draft/README.md). It selects the same exact private executable `None Start Event → Service Task → None End Event` source shape and effect binding, with explicit failed-job incident creation enabled.

The profile composes `CIB-EXT-0001` and `CIB-CFG-0002` with the bounded failed-job incident lifecycle `CIB-EXT-0013`, the project-owned effect-incident projection `CIB-OP-0008`, and the explicit configuration discriminator `CIB-CFG-0008`. It admits one literal generation-1 semantic incident and one exact retry of the same effect occurrence.

General BPMN service faults, BPMN Error routing, exception data, raw job or incident identity, retry budgets or cycles, a second semantic incident, cancellation, external tasks, and Product 2 state remain excluded.
