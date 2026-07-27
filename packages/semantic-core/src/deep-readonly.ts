/**
 * Recursively makes a data contract immutable while preserving tuples,
 * discriminated unions, and callable types.
 *
 * Use this for serializable contract shapes. Concrete values should normally
 * use `as const satisfies Contract` so their literals remain narrow.
 */
export type DeepReadonly<T> =
  T extends (...arguments_: never[]) => unknown
    ? T
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;
