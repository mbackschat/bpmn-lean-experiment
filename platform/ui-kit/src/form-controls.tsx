import {
  FieldError,
  Input,
  Label,
  TextField as AriaTextField,
} from "react-aria-components/TextField";
import { Checkbox as AriaCheckbox } from "react-aria-components/Checkbox";
import {
  Label as RadioLabel,
  Radio,
  RadioGroup,
} from "react-aria-components/RadioGroup";
import type {
  TextFieldProps as AriaTextFieldProps,
} from "react-aria-components/TextField";
import type {
  CheckboxProps as AriaCheckboxProps,
} from "react-aria-components/Checkbox";
import type { ReactNode } from "react";

import styles from "./form-controls.module.css";

export type TextFieldProps = Omit<AriaTextFieldProps, "children"> & Readonly<{
  label: ReactNode;
  errorMessage?: ReactNode;
}>;

export function TextField({ label, errorMessage, ...props }: TextFieldProps) {
  return (
    <AriaTextField {...props} className={styles.textField!}>
      <Label>{label}</Label>
      <Input />
      {errorMessage === undefined ? null : <FieldError>{errorMessage}</FieldError>}
    </AriaTextField>
  );
}

export type CheckboxProps = AriaCheckboxProps;

export function Checkbox(props: CheckboxProps) {
  return <AriaCheckbox {...props} className={styles.checkbox!} />;
}

export type BooleanChoiceProps = Readonly<{
  label: ReactNode;
  name: string;
  defaultValue?: boolean;
  isDisabled?: boolean;
}>;

/** Required Boolean choice that preserves the distinction between no value and false. */
export function BooleanChoice({
  label,
  name,
  defaultValue,
  isDisabled,
}: BooleanChoiceProps) {
  return (
    <RadioGroup
      className={styles.booleanChoice!}
      name={name}
      isRequired
      {...(isDisabled === undefined ? {} : { isDisabled })}
      {...(defaultValue === undefined
        ? {}
        : { defaultValue: String(defaultValue) })}
    >
      <RadioLabel>{label}</RadioLabel>
      <div className={styles.booleanChoiceOptions!}>
        <Radio className={styles.radio!} value="true">True</Radio>
        <Radio className={styles.radio!} value="false">False</Radio>
      </div>
    </RadioGroup>
  );
}
