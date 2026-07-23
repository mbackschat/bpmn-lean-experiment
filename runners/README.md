# External runners

This directory contains project-owned adapters to independent executable oracles. Runner code may depend on its target system, but those dependencies must not enter Lean, the pure TypeScript reducer, or the Temporal adapter.

The [CIB Seven oracle runner](cibseven/README.md) is the first implementation. It calibrates the neutral scenario through public engine services and emits a target-independent trace plus explicitly non-semantic diagnostics.
