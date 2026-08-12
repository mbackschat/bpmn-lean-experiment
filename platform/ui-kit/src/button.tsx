import { Button as AriaButton } from "react-aria-components/Button";
import type { ButtonProps as AriaButtonProps } from "react-aria-components/Button";

export enum ButtonVariant {
  Primary = "primary",
  Plain = "plain",
}

export type ButtonProps = AriaButtonProps & Readonly<{
  variant?: ButtonVariant;
}>;

/** Accessible platform action control with shared interaction styling. */
export function Button({
  className,
  variant = ButtonVariant.Primary,
  ...props
}: ButtonProps) {
  const base = variant === ButtonVariant.Plain
    ? "uiButton uiButtonPlain"
    : "uiButton";
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
