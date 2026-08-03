# Event-Based Gateway Message/Timer scenarios

This directory contains one exact BPMN 2.0.2 source and two answer-free scenarios for the [Event-Based Gateway specification](../../docs/capsules/EVENT-BASED-GATEWAY-SPEC.md). The [Message-wins scenario](message-wins.scenario.json) orders the exact operation-addressed delivery before User Task completion. The [Timer-wins scenario](timer-wins.scenario.json) orders the exact `PT1S` firing before its User Task completion. The target inputs contain no expected result or winner annotation.

Lean, the independently implemented TypeScript semantic core, and the Temporal adapter are the differential targets. Temporal owns durable readiness scheduling, winner-side Timer cancellation or subscription withdrawal, fail-closed coalesced readiness, Worker replacement, and replay without adding a physical-event tie-break. No CIB Event-Based Gateway relationship, target, or retained evidence is selected.
