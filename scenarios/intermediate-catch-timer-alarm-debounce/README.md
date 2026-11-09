# Alarm debounce scenario

This directory contains one [answer-free scenario](scenario.json) for the [Timer exact durations proposal](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md). A sensor alarm waits an exact `PT2S` debounce window, so a transient spike that clears itself never pages anyone, and then opens one operator User Task to acknowledge the alarm: `None Start Event → PT2S Intermediate Catch Timer Event → User Task → None End Event`.

It is the retained corpus model and the host-clock scenario of that increment: the scenario fires the timer at logical deadline 2000 and completes the acknowledgement. Longer exact durations run in logical time in the Lean and semantic-core cases, because the pipeline's Temporal target waits on the host clock.
