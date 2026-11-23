/**
 * Open items, transcribed from `Kernel/State/Items.lean`: the open-item map (KD1), an item's structural key and its
 * order, the item itself, and the map's readings in key order and in the order the items opened. Part of `state.ts`,
 * which re-exports it.
 */
import { type ElementId } from "../il/types.js";
import { compareIssue, compareOccurrenceId, type Issue, issueText, type OccurrenceId, type ScopeOccurrenceId } from "./slots.js";
import { type OpenKind } from "./wait.js";

/** The role an open item plays for its occurrence (KD1's item role). */
export enum ItemRole {
  /** What a begun occurrence waits on (`openItem`). */
  Wait = "wait",
  /** A subscription holding its occurrence's reservation (`openSubscription`). */
  Subscription = "subscription",
}

const itemRoleIndex: Readonly<Record<ItemRole, number>> = { [ItemRole.Wait]: 0, [ItemRole.Subscription]: 1 };

/**
 * An open item's structural key (KD1): its occurrence, its role and its issue, once committed a per-occurrence ordinal
 * (`itemOrdinals`, DC12).
 */
export interface ItemKey { readonly occurrence: OccurrenceId; readonly role: ItemRole; readonly ordinal: Issue; }

/** The lexicographic key order of `Kernel.ItemKey`'s `Ord`. */
export function compareItemKey(left: ItemKey, right: ItemKey): number {
  return compareOccurrenceId(left.occurrence, right.occurrence) || itemRoleIndex[left.role] - itemRoleIndex[right.role] ||
    compareIssue(left.ordinal, right.ordinal);
}

/** A key as text, for sets and maps keyed by value. */
export function itemKeyText(key: ItemKey): string {
  return `${key.role}/${issueText(key.ordinal)}/${key.occurrence}`;
}

/** Two keys are one when their text forms are: keys never compare by object reference. */
export function sameItemKey(left: ItemKey, right: ItemKey): boolean {
  return itemKeyText(left) === itemKeyText(right);
}

/**
 * One open interaction. `id.occurrence` is the occurrence it waits for, or a subscription's reservation; the public
 * identity is the occurrence's activation of `element`. `attachedTo` is the occurrence the subscription hangs on (the
 * boundary's host, the Event-Based Gateway of an arm). A `passive` item, such as an Event Sub-Process start
 * subscription, keeps no scope occurrence alive and is removed when its scope completes.
 */
export interface OpenItem {
  readonly id: ItemKey;
  /**
   * The order position the item took when it opened (`takePosition`): the order of opening, which every site that reads the items
   * in order reads (`itemsByPosition`), never the key order of `openItems` (KD1).
   */
  readonly position: number;
  readonly kind: OpenKind;
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly attachedTo: OccurrenceId | null;
  readonly passive: boolean;
}

/** Lean's `OpenItems`: the open items in key order, one per key, each under its own `id`. */
export type OpenItems = readonly OpenItem[];

/** The open items of `items` in the order they opened, by `OpenItem.position`: for every reading that depends on order. */
export function itemsByPosition(items: OpenItems): readonly OpenItem[] {
  return [...items].sort((left, right) => left.position - right.position);
}

/** The open item keyed `key`: Lean's `items[key]?`. */
export function itemAt(items: OpenItems, key: ItemKey): OpenItem | undefined {
  return items.find((item) => sameItemKey(item.id, key));
}

/**
 * `items` with `item` under its own key, replacing an item with that key: `TreeMap.insert`. It places the item by
 * binary search, since a filter and full sort at every insert dominated a closure that opens an item at every pass
 * (`closure-work-bound.test.ts`, measured 2026-11-17).
 */
export function insertItem(items: OpenItems, item: OpenItem): OpenItems {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compareItemKey(items[middle]!.id, item.id) < 0) low = middle + 1;
    else high = middle;
  }
  const replaces = low < items.length && sameItemKey(items[low]!.id, item.id);
  return [...items.slice(0, low), item, ...items.slice(replaces ? low + 1 : low)];
}
