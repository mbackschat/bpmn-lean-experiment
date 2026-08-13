import { Button as AriaButton } from "react-aria-components/Button";
import type { ButtonProps as AriaButtonProps } from "react-aria-components/Button";
import type { Ref } from "react";

import styles from "./button.module.css";

export enum ButtonVariant {
  Danger = "danger",
  Navigation = "navigation",
  Primary = "primary",
  Plain = "plain",
  Secondary = "secondary",
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
  const base = `${styles.button} ${variantClassName(variant)}`;
  const exactClassName = joinClassName(base, className);
  return <AriaButton {...props} className={exactClassName} />;
}

function variantClassName(variant: ButtonVariant): string {
  switch (variant) {
    case ButtonVariant.Danger:
      return styles.danger!;
    case ButtonVariant.Navigation:
      return styles.navigation!;
    case ButtonVariant.Plain:
      return styles.plain!;
    case ButtonVariant.Primary:
      return styles.primary!;
    case ButtonVariant.Secondary:
      return styles.secondary!;
  }
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
