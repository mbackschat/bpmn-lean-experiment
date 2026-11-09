# JUEL evaluation architecture decision

## Status

**Adopted, amended by owner decision on 2026-11-08.** The 2026-07-30 decision selected the pinned CIB JUEL runtime behind a Java Temporal Activity Worker and excluded a project-owned evaluator; it was deferred the same day behind the [Simple Boolean decision](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) and never implemented. The 2026-11-08 amendment reverses the exclusion and the Java hosting: no part of the TypeScript and Temporal solution depends on a JVM, and a read-only JUEL subset written in Lean and transcribed to TypeScript is evaluated inside the kernel step from M2. Its read-only context rules stand. The [kernel architecture specification](kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step) owns the levels and their milestones; the pre-amendment record is the [document at `404a39d7`](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/JUEL-EVALUATION-ARCHITECTURE-DECISION.md).

## Question

How does a CIB Seven profile evaluate the JUEL expressions its models carry, so that conditions, mappings, task fields, Multi-Instance expressions, timer definitions, Message and Signal names and conditional predicates execute with CIB's meaning while the kernel stays the single executable account?

## Decision

JUEL is treated like BPMN. The Expression Language specification at the grammar level of the pinned `cibseven-juel` (EL 2.2 method invocations, no lambda, assignment or collection literals, on the shaded Jakarta EL 4.0 API) is normative for syntax and coercion; the pinned evaluator is the behavioral oracle; a difference between them is classified in the [relation register](CIB-BPMN-RELATION-REGISTER.md), never by majority. Lean is the formal authority for the subset's meaning, and the TypeScript kernel transcribes it.

- Each profile selects exactly one evaluator for its admitted expressions, run inside the kernel step: no evaluation leaves the kernel and no host mechanism carries an evaluation result.
- The subset grows by level (core at M2, task fields at M3, Multi-Instance at M5, events at M6, throw at M7). A row whose acceptance needs an expression of a level closes only on that level, never on Simple Boolean.
- An expression outside the selected evaluator is refused at admission with a stable code. Refused at every level: beans, `execution`, `task`, functions outside the closed table, and any mutating or unlisted method.
- The pinned evaluator checks the subset through retained CIB evidence over a table of expressions and contexts.

## Read-only context rules

These rules of the 2026-07-30 decision stand:

- the context contains every binding visible in the selected Process scope, not only the variables admission predicts the expression will read;
- presence and explicit null remain distinct;
- values are immutable data from the portable value domain;
- no `execution` object, configured bean, Spring context, function mapper, Process Engine service, file or network capability, or mutable application object enters the context;
- a method call or capability-bearing expression is outside the subset even when the pinned grammar can parse it, unless it is a read-only method on a String, List or Map value from the closed list.

Variable mutation and engine-service calls are different mechanisms. A Process Engine or application-service call uses an explicit effect; neither follows from read-only JUEL support. The evaluator returns values, never a selected Sequence Flow: the consuming BPMN rule in the kernel applies the result.

## Rationale

The Java Activity design paid for CIB's evaluator with a JVM in the Worker fleet, one Activity and Event History entry per evaluation, a cross-SDK payload contract, and a Lean and TypeScript account that could only prove the consuming transition conditional on an external result. The kernel rewrite's owner decision of 2026-11-08 removed the JVM from the solution; evaluating inside the step keeps evaluation replay-deterministic without recording results, makes expression meaning part of what every scenario checks across Lean, TypeScript and the CIB evidence, and lets admission refuse unsupported syntax before a Workflow starts. The levels were chosen from what CIB's own test models use (measured 2026-11-08 over 1,494 expressions in 2,458 BPMN files): 63% plain variables, 17% operators, 3% literals, 2% property paths, 15% method calls, most of them on beans or `execution`, which stay refused.

CIB Seven and a project evaluator that delegated to the same JUEL artifact would not have been two uncorrelated lanes for expression truth; a separately written subset checked against the pinned evaluator is.

## Exclusions

- variable mutation, side effects, assignment, lambda and collection literals;
- beans, `execution`, `task`, `DelegateExecution`, Process Engine services and application services in expressions;
- a Java Worker, Java semantic core or remote evaluation service;
- an expression result chosen or fabricated by the Temporal host;
- XPath, Groovy, FreeMarker and general FEEL; DMN decision tables and JavaScript Script Tasks follow their own [owner decisions](kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path).

## Reopen conditions

Reopen this decision if a required row's expressions need a capability-bearing `execution` or bean context, if the pinned evaluator's behavior cannot be classified against the EL specification, or if the subset's coercion cannot be stated over the portable value domain.
