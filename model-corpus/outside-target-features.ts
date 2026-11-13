/**
 * What the kernel supports outside the Practical CIB7 target: behaviour CIB Seven 2.2.0 lacks, which therefore counts
 * toward no target row and which the target requires to be preserved and disclosed apart from it ([coverage target,
 * exclusions](../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#optional-integrations-and-exclusions)).
 *
 * Each entry names the capability row of `mvp-capabilities.ts` it belongs to, the feature in product language, where it
 * runs, and the relation-register entry that records what CIB lacks. A CIB difference the cibseven profiles reproduce, a
 * form refused under every profile and a meaning that merely differs between profiles are not features here.
 * `scripts/capability-catalog-disclosures.test.ts` fails when a capability row or register entry does not exist, when
 * the prose names a fact its owner does not hold, or when a row names one basis twice.
 */
export const OutsideTargetReach = {
  /** Only the standards profile runs it; the cibseven profiles refuse the model or, for an aggregate, write none. */
  StandardsProfile: "standardsProfile",
  /** Every profile runs it, while CIB ignores the construct. */
  EveryProfile: "everyProfile",
} as const;

export type OutsideTargetReach = typeof OutsideTargetReach[keyof typeof OutsideTargetReach];

export type OutsideTargetFeature = Readonly<{
  /** The `id` of the capability row the feature belongs to. */
  capability: string;
  feature: string;
  description: string;
  reach: OutsideTargetReach;
  /** The relation-register entry that records what CIB Seven 2.2.0 lacks. */
  basis: string;
}>;

const standardsOnly = (capability: string, feature: string, description: string, basis: string): OutsideTargetFeature =>
  Object.freeze({ capability, feature, description, reach: OutsideTargetReach.StandardsProfile, basis });

const outputAggregation = "The loop's output collection, gathered in item order from each instance's output data item and written once every instance has filled its slot. CIB Seven 2.2.0 installs none, so under the cibseven profiles no output collection is written.";
const implicitStart = "On entry it begins every Activity and Sub-Process inside it that has no incoming flow. CIB Seven 2.2.0 refuses a Sub-Process without a start Event and fails entering such a Transaction, and the cibseven profiles refuse both.";
const messageIdentity = "A Message is addressed by its identity, so it may have no name, and several waits in one scope may share a Message name. CIB Seven 2.2.0 addresses a Message by a name it requires and keeps unique in each scope, and the cibseven profiles refuse both forms.";
const signalIdentity = "A Signal is addressed by its identity, so two Signals may share a name, and several waits in one scope may catch one Signal, such as two Signal starts of one process, each of which starts an instance. CIB Seven 2.2.0 addresses a Signal by a name it keeps unique in a document and in each scope, and the cibseven profiles refuse both forms.";

export const outsideTargetFeatures: ReadonlyArray<OutsideTargetFeature> = Object.freeze([
  standardsOnly("sequenceFlow", "Simple Boolean conditions", "Conditions in the project's Simple Boolean language, declared on the definitions, which test whether a variable is present, null or equal to a String. CIB Seven 2.2.0 evaluates JUEL, and the cibseven profiles refuse a Simple Boolean condition.", "CIB-CFG-0011"),
  standardsOnly("messageStartEvent", "Messages addressed by identity", messageIdentity, "CIB-LIM-0022"),
  standardsOnly("signalStartEvent", "Signals addressed by identity", signalIdentity, "CIB-LIM-0026"),
  standardsOnly("sequentialMultiInstanceUserTask", "Multi-Instance output aggregation", outputAggregation, "CIB-LIM-0001"),
  standardsOnly("parallelMultiInstanceUserTask", "Multi-Instance output aggregation", outputAggregation, "CIB-LIM-0001"),
  standardsOnly("multiInstanceActivity", "Multi-Instance output aggregation", outputAggregation, "CIB-LIM-0001"),
  standardsOnly("receiveTask", "Messages addressed by identity", messageIdentity, "CIB-LIM-0022"),
  Object.freeze({
    capability: "configuredTask",
    feature: "Configured Task extension",
    description: "A Task carrying the project's task-definition extension waits for the external work its handler type names and completes with its result. CIB Seven 2.2.0 ignores the extension and passes such a Task through, so CIB is no oracle for it.",
    reach: OutsideTargetReach.EveryProfile,
    basis: "CIB-LIM-0011",
  }),
  standardsOnly("embeddedSubProcess", "Sub-Process without a start Event", implicitStart, "CIB-LIM-0024"),
  standardsOnly("transaction", "Transaction without a start Event", implicitStart, "CIB-LIM-0024"),
  standardsOnly("intermediateCatchMessageEvent", "Messages addressed by identity", messageIdentity, "CIB-LIM-0022"),
  standardsOnly("messageKeyCorrelation", "Correlation by a modeled key", "A published Message reaches the one waiting instance whose correlation key, evaluated from the model, matches it. CIB Seven 2.2.0 executes no modeled key and correlates only by criteria its API supplies, and the cibseven profiles refuse a modeled key.", "CIB-LIM-0002"),
  standardsOnly("intermediateCatchSignalEvent", "Signals addressed by identity", signalIdentity, "CIB-LIM-0026"),
  standardsOnly("messageBoundaryEvent", "Messages addressed by identity", messageIdentity, "CIB-LIM-0022"),
  standardsOnly("signalBoundaryEvent", "Signals addressed by identity", signalIdentity, "CIB-LIM-0026"),
]);
