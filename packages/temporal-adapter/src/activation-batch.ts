/**
 * Activation-tagged host callbacks and the batch a scheduler may classify at once.
 *
 * Callback order is not semantic order. One Workflow activation delivers every job it carries before
 * the Workflow observes any of them, so a scheduler reading its records one at a time would let raw
 * job order decide which callback won. Grouping by activation is what makes host simultaneity
 * detectable instead of silently resolved, so it is a mechanism rather than a convenience.
 */
export type ActivationTagged<T> = Readonly<{
  activation: number;
  item: T;
}>;

export type ActivationBatch<T> = Readonly<{
  batch: ReadonlyArray<T>;
  remaining: ReadonlyArray<ActivationTagged<T>>;
}>;

/**
 * Every record sharing the earliest-recorded activation, and the records left for later batches.
 *
 * The batch is not a prefix: a record from another activation may sit between two records of this
 * one, and both of those still belong to this batch. Recorded order is preserved within the batch and
 * within what remains. Returns `undefined` for an empty record, which a caller that already waited
 * for readiness must treat as a host invariant violation rather than as an empty batch.
 */
export function firstActivationBatch<T>(
  recorded: ReadonlyArray<ActivationTagged<T>>,
): ActivationBatch<T> | undefined {
  const first = recorded[0];
  if (first === undefined) {
    return undefined;
  }
  return {
    batch: recorded
      .filter(({ activation }) => activation === first.activation)
      .map(({ item }) => item),
    remaining: recorded.filter(
      ({ activation }) => activation !== first.activation,
    ),
  };
}
