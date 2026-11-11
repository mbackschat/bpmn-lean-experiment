# Signal Start, Signal catch and broadcast compositions

Answer-free schedules for [PC-SIGNAL-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Signal root starts, several distinct starts, Signal catches and Event-Based Gateway competition) and the parts of [PC-SIGNAL-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that one broadcast over several instances and definitions exercises: the whole eligible population, a broadcast whose start fails, receivers that no longer wait, and two versions of one process. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. They extend the throw-side [Signal payload witnesses](../signal-throw-payload/README.md). The profile is `cibseven-2.2.0` with no source overlay, except `race-approved-standards`, which runs `bpmn-2.0.2`.

A Signal start stimulus names its Start Event and carries the Signal name with the variables the Signal brings. A `deliver` with a Signal trigger addresses one catch occurrence of one instance; a population `broadcast` step addresses every receiver. A race arm is addressed by its catch Event and the activation of the gateway occurrence that armed it, and a Timer is a literal duration, so a firing carries the deadline that arming at logical time zero fixes (`PT1H` as 3,600,000).

## Models

| Model | What it holds |
|---|---|
| [shift-signals](shift-signals.bpmn) | One process with two Signal Starts, *Shift opened* (`shift-opened`) leading to *Open the register* and *Shift closed* (`shift-closed`) leading to *Close the register*, each to its own End. |
| [handover-relay](handover-relay.bpmn) | A Signal Start *Handover requested* (`handover-requested`) leading to the Intermediate Signal catch *Handover accepted* (`handover-accepted`) and the User Task *Confirm the handover*. |
| [approval-race](approval-race.bpmn) | A None Start leading to the Event-Based Gateway *Await decision* over the Signal catches *Approved* (`approved`) and *Rejected* (`rejected`) and the Timer catch *Deadline passed* (`PT1H`), each arm to its own User Task. |
| [duplicate-signal-starts](duplicate-signal-starts.bpmn) | One process whose two Signal Starts, *Shift opened at the front* and *Shift opened at the back*, reference the one Signal `shift-opened`. |
| [failing-signal-start](failing-signal-start.bpmn) | A Signal Start *Shift closed* (`shift-closed`) leading to an Exclusive Gateway whose conditioned flow reads the Process variable `auditLevel`, which no stimulus supplies, and whose default flow leads to *Check the shift routinely*. |

## Single-instance schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [shift-opened-start](shift-opened-start.scenario.json) | shift-signals | *Shift opened* is signalled and *Open the register* completes. |
| [shift-closed-start](shift-closed-start.scenario.json) | shift-signals | *Shift closed* is signalled and *Close the register* completes. |
| [shift-opened-start-with-variables](shift-opened-start-with-variables.scenario.json) | shift-signals | The Signal brings a String and an Integer variable. |
| [handover-start-then-catch](handover-start-then-catch.scenario.json) | handover-relay | The Signal Start fires, `handover-accepted` is delivered to the catch and the task completes. |
| [handover-catch-other-signal](handover-catch-other-signal.scenario.json) | handover-relay | The starting Signal's own name is delivered to the catch, then `handover-accepted`. |
| [race-approved-then-late-rejected](race-approved-then-late-rejected.scenario.json) | approval-race | `approved` is delivered, then `rejected` to the other Signal arm. |
| [race-rejected-then-late-timer](race-rejected-then-late-timer.scenario.json) | approval-race | `rejected` is delivered, then the Timer arm is fired. |
| [race-timer-then-late-signal](race-timer-then-late-signal.scenario.json) | approval-race | The Timer arm is fired, then `approved` is delivered. |
| [duplicate-signal-starts-start](duplicate-signal-starts-start.scenario.json) | duplicate-signal-starts | The shared Signal fires the first of the two starts. |
| [failing-signal-start-start](failing-signal-start-start.scenario.json) | failing-signal-start | The Signal Start fires. |
| [race-approved-standards](race-approved-standards.scenario.json) | approval-race | The `bpmn-2.0.2` profile: `Signal_Approved` is delivered to its arm by QName. Separates a targeted delivery, which only `signalDelivery = occurrenceTargeted` admits, from a broadcast. No CIB evidence: CIB runs only its own profile. |

The population witnesses of this directory are held outside the repository with the M8 track: the CIB runner realizes no population scenario and the kernel's population runner refuses an inadmissible definition, so they have no comparable result yet.

The schedules carry no expected instance, task or variable; the retained CIB evidence is the answer.
