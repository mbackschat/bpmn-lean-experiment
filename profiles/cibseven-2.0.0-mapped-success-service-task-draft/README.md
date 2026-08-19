# CIB Seven 2.0.0 mapped-success Service Task profile

The [immutable profile artifact](profile.json) selects one successful string-only `None Start Event → Service Task → None End Event` path.

External value-domain declaration: `effectCompletion = String`.

The source supplies one exact delegate-expression binding, one literal `requestValue` input, and one `${result}` Activity-local output mapped to Process variable `resultValue`. The profile maps the source binding through `effectBindings` to the neutral Activity/mapped-success descriptor; it does not reinterpret the bean token as general JUEL or carry it into the semantic core.

CIB Seven executes the synchronous delegate and mappings atomically inside one engine transaction. The project effect wait, committed arguments, Activity result, and output-mapping boundary are therefore a Temporal-hosted refinement under `CIB-OP-0002`, not independently observed intermediate CIB states.

The profile makes no claim about non-string values, arbitrary variables or beans, Java binary compatibility, failures, rollback equivalence, BPMN Errors, scripts, listeners, incidents, or external tasks.

The mapped-success capsule owns the bounded semantics and fidelity relation. Mandatory gates use the project-authored MIT fixture and fresh content-bound `2.0.0` evidence. Product-specific source bindings may be supplied only through the registered data-only overlay contract.
