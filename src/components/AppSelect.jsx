import { Select } from "@plexui/ui/components/Select";
import { Controller } from "react-hook-form";

const LABEL_CLASS =
  "mb-2 block text-sm font-semibold text-slate-800";

/**
 * Project select built on Plex UI. Use it for every dropdown so labels,
 * error states, sizing and dark mode stay consistent.
 *
 * - `options`: [{ value, label }]. Filters keep an explicit "All …"
 *   option with value "" as the first entry.
 * - `appearance`: "field" for forms, "filter" for rounded filter bars.
 * - `labelHidden`: keeps the label for screen readers only.
 * - `labelledBy`: id of an existing label (e.g. from <Field>); no label
 *   is rendered then.
 */
export default function AppSelect({
  appearance = "field",
  className,
  describedBy,
  disabled = false,
  id,
  invalid = false,
  label,
  labelClassName = LABEL_CLASS,
  labelHidden = false,
  labelledBy,
  onBlur,
  onChange,
  options,
  placeholder = "Select an option",
  required = false,
  size,
  value,
}) {
  const labelId = labelledBy || `${id}-label`;
  const filter = appearance === "filter";

  return (
    <div className={className}>
      {labelledBy ? null : (
        <label
          className={labelHidden ? "sr-only" : labelClassName}
          id={labelId}
        >
          {label}
        </label>
      )}

      <Select
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-labelledby={labelId}
        block
        disabled={disabled}
        // No id/name: Plex would render a hidden input inside the trigger,
        // which axe flags as nested interactive content. The value lives in
        // React state / react-hook-form instead.
        onChange={(option) => {
          onChange(option.value);
          onBlur?.();
        }}
        options={options}
        pill={filter}
        placeholder={placeholder}
        required={required}
        size={size || (filter ? "2xl" : "3xl")}
        triggerClassName={filter ? undefined : "rounded-xl"}
        value={value ?? ""}
      />
    </div>
  );
}

/**
 * AppSelect bound to a react-hook-form field. `onValueChange` runs after
 * the form value updates, for side effects such as loading dependent data.
 */
export function ControlledAppSelect({
  control,
  name,
  onValueChange,
  ...props
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <AppSelect
          {...props}
          onBlur={field.onBlur}
          onChange={(nextValue) => {
            field.onChange(nextValue);
            onValueChange?.(nextValue);
          }}
          value={field.value}
        />
      )}
    />
  );
}
