import { useId } from "react";

// A radio group drawn as a segmented pill. Arrow keys move between
// options because the inputs are real radios sharing one name.
export default function SegmentedChoice({
  description,
  disabled = false,
  legend,
  name,
  onChange,
  options,
  required = false,
  value,
}) {
  const descriptionId = useId();

  return (
    <fieldset
      aria-describedby={description ? descriptionId : undefined}
      className="grid gap-2"
      disabled={disabled}
    >
      <legend className="mb-2 text-sm font-semibold text-slate-800">
        {legend}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-red-700">
            *
          </span>
        ) : null}
      </legend>

      <div
        className="grid gap-1 rounded-[1.75rem] bg-slate-100 p-1 sm:auto-cols-fr sm:grid-flow-col sm:rounded-full"
      >
        {options.map((option) => {
          const checked = option.value === value;

          return (
            <label
              className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-center text-sm transition has-focus-visible:ring-4 has-focus-visible:ring-brand-200 has-disabled:cursor-not-allowed ${
                checked
                  ? "bg-brand-800 font-black text-white shadow-sm"
                  : "font-semibold text-slate-700 hover:bg-white hover:text-slate-950"
              }`}
              key={String(option.value)}
            >
              <input
                checked={checked}
                className="sr-only min-h-0"
                name={name}
                onChange={() => onChange(option.value)}
                type="radio"
                value={String(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>

      {description ? (
        <p className="text-sm leading-6 text-slate-600" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </fieldset>
  );
}
