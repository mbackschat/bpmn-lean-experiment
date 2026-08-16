import {
  FieldError,
  Input,
  Label,
  TextArea,
  TextField as AriaTextField,
} from "react-aria-components/TextField";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup,
  Label as CheckboxGroupLabel,
} from "react-aria-components/CheckboxGroup";
import {
  Label as RadioLabel,
  Radio,
  RadioGroup,
} from "react-aria-components/RadioGroup";
import type {
  InputProps,
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
  inputProps?: Omit<InputProps, "children" | "className">;
}>;

export function TextField({ label, errorMessage, inputProps, ...props }: TextFieldProps) {
  return (
    <AriaTextField {...props} className={styles.textField!}>
      <Label>{label}</Label>
      <Input {...inputProps} />
      {errorMessage === undefined ? null : <FieldError>{errorMessage}</FieldError>}
    </AriaTextField>
  );
}

export type TextAreaFieldProps = TextFieldProps;

export function TextAreaField({ label, errorMessage, inputProps: _inputProps, ...props }: TextAreaFieldProps) {
  return (
    <AriaTextField {...props} className={styles.textField!}>
      <Label>{label}</Label>
      <TextArea />
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
  value?: boolean | null;
  onChange?: (value: boolean) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  errorMessage?: ReactNode;
}>;

/** Required Boolean choice that preserves the distinction between no value and false. */
export function BooleanChoice({
  label,
  name,
  defaultValue,
  value,
  onChange,
  isDisabled,
  isInvalid,
  errorMessage,
}: BooleanChoiceProps) {
  return (
    <RadioGroup
      className={styles.booleanChoice!}
      name={name}
      isRequired
      {...(isDisabled === undefined ? {} : { isDisabled })}
      {...(isInvalid === undefined ? {} : { isInvalid })}
      {...(value === undefined ? {} : { value: value === null ? "" : String(value) })}
      {...(onChange === undefined ? {} : { onChange: (next) => onChange(next === "true") })}
      {...(defaultValue === undefined
        ? {}
        : { defaultValue: String(defaultValue) })}
    >
      <RadioLabel>{label}</RadioLabel>
      <div className={styles.booleanChoiceOptions!}>
        <Radio className={styles.radio!} value="true">True</Radio>
        <Radio className={styles.radio!} value="false">False</Radio>
      </div>
      {errorMessage === undefined ? null : <FieldError>{errorMessage}</FieldError>}
    </RadioGroup>
  );
}

export type ChoiceOption = Readonly<{ value: string; label: ReactNode }>;

export type SingleChoiceProps = Readonly<{
  label: ReactNode;
  name: string;
  options: readonly ChoiceOption[];
  value?: string | null;
  onChange?: (value: string) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  errorMessage?: ReactNode;
}>;

export function SingleChoice({
  label,
  name,
  options,
  value,
  onChange,
  isDisabled,
  isInvalid,
  errorMessage,
}: SingleChoiceProps) {
  return (
    <RadioGroup
      className={styles.choiceGroup!}
      name={name}
      {...(value === undefined ? {} : { value: value ?? "" })}
      {...(onChange === undefined ? {} : { onChange })}
      {...(isDisabled === undefined ? {} : { isDisabled })}
      {...(isInvalid === undefined ? {} : { isInvalid })}
    >
      <RadioLabel>{label}</RadioLabel>
      <div className={styles.choiceOptions!}>
        {options.map((option) => (
          <Radio key={option.value} className={styles.radio!} value={option.value}>
            {option.label}
          </Radio>
        ))}
      </div>
      {errorMessage === undefined ? null : <FieldError>{errorMessage}</FieldError>}
    </RadioGroup>
  );
}

export type MultipleChoiceProps = Readonly<{
  label: ReactNode;
  name: string;
  options: readonly ChoiceOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  errorMessage?: ReactNode;
}>;

export function MultipleChoice({
  label,
  name,
  options,
  value,
  onChange,
  isDisabled,
  isInvalid,
  errorMessage,
}: MultipleChoiceProps) {
  return (
    <CheckboxGroup
      className={styles.choiceGroup!}
      value={[...value]}
      onChange={onChange}
      {...(isDisabled === undefined ? {} : { isDisabled })}
      {...(isInvalid === undefined ? {} : { isInvalid })}
    >
      <CheckboxGroupLabel>{label}</CheckboxGroupLabel>
      <div className={styles.choiceOptions!} data-name={name}>
        {options.map((option) => (
          <AriaCheckbox key={option.value} className={styles.checkbox!} value={option.value}>
            {option.label}
          </AriaCheckbox>
        ))}
      </div>
      {errorMessage === undefined ? null : <FieldError>{errorMessage}</FieldError>}
    </CheckboxGroup>
  );
}
