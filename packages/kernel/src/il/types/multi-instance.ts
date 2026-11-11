/**
 * Multi-Instance loop characteristics, transcribed from `Kernel/IL/Types/MultiInstance.lean`: the loop an Activity's
 * envelope may carry (BPMN 2.0.2 §10.3.8, Table 10.30), its mode, how many instances it runs, and the names it reads and
 * writes ([Multi-Instance semantics](../../../../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md)). Part of
 * `il/types.ts`, which re-exports it.
 */
import type { Expression } from "./expression.js";

/** Guarded type: `feature/multi-instance` owns matching on it. */
export enum MultiInstanceMode { Sequential = "sequential", Parallel = "parallel" }

export enum InstanceCountTag { Collection = "collection", Cardinality = "cardinality", CountAndCollection = "countAndCollection" }

export type InstanceCount =
  | { readonly tag: InstanceCountTag.Collection; readonly items: Expression }
  | { readonly tag: InstanceCountTag.Cardinality; readonly count: Expression }
  /** Both forms, which CIB reads together; admission refuses it (`multiInstance.countAndCollection`). */
  | { readonly tag: InstanceCountTag.CountAndCollection; readonly count: Expression; readonly items: Expression };

/** Whether the input collection is read once on entry or re-read by a sequential Activity (PC-MI-08). */
export enum CollectionRead { EntrySnapshot = "entrySnapshot", SequentialReread = "sequentialReread" }

export interface MultiInstance {
  readonly mode: MultiInstanceMode;
  readonly count: InstanceCount;
  readonly elementVariable: string | null;
  readonly completionCondition: Expression | null;
  readonly inputDataItem: string | null;
  readonly outputDataItem: string | null;
  readonly outputCollection: string | null;
  readonly mutableCollection: CollectionRead;
  /**
   * A transaction boundary before each instance begins and after it completes, declared on the loop characteristics;
   * the envelope's marks are the body's (CIB-EXT-0027, `BpmnParse#parseMultiInstanceLoopCharacteristics`).
   */
  readonly asyncBefore: boolean;
  readonly asyncAfter: boolean;
  /**
   * The element `loopDataInputRef` names and the `inputDataItem`'s `name`, which `MultiInstanceBinding.LoopReferences`
   * binds instead of the Data Associations (CIB-INT-0014).
   */
  readonly loopDataInputRef: string | null;
  readonly inputDataItemName: string | null;
}
