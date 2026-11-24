/**
 * The orientation of the scope-led key orders, transcribed from `Kernel/State/KeyOrder.lean`: `false`, so they order
 * as `key.ts` and `items.ts` write them. The opposite-key-order test build substitutes this module with one whose
 * constant is `true` (`packages/differential/test/opposite-key-order.ts`) and requires every output to stay
 * byte-identical, since the storage order of a scope-keyed map never reaches an output (KD7, promise row 810). The
 * constant is this module's only content, so a build selects it and nothing a host or a model supplies can.
 */

/**
 * Whether the scope-led key orders are reversed: only in the opposite-key-order test build. Reversed, a scope subtree is
 * still one key range, but its root is the range's last key, not its first; so removal by key range (DC21) must take
 * its bounds from the oriented order, never assume the subtree's root opens it.
 */
export const keyOrderOpposite: boolean = false;
