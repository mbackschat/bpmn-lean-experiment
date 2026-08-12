import { Button as AriaButton } from "react-aria-components/Button";
import type { ButtonProps as AriaButtonProps } from "react-aria-components/Button";
import type { Ref } from "react";

import styles from "./button.module.css";

export enum ButtonVariant {
  Primary = "primary",
  Plain = "plain",
}

export type ButtonProps = AriaButtonProps & Readonly<{
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
}>;

/** Accessible platform action control with shared interaction styling. */
export function Button({
  className,
  variant = ButtonVariant.Primary,
  ...props
}: ButtonProps) {
  const base = variant === ButtonVariant.Plain
    ? `${styles.button} ${styles.plain}`
    : styles.button!;
  const exactClassName = joinClassName(base, className);
  return <AriaButton {...props} className={exactClassName} />;
}

function joinClassName(
  base: string,
  supplied: AriaButtonProps["className"],
): Exclude<AriaButtonProps["className"], undefined> {
  if (supplied === undefined) return base;
  if (typeof supplied === "function") {
    return (values) => `${base} ${supplied(values)}`.trim();
  }
  return `${base} ${supplied}`.trim();
}
