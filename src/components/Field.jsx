export default function Field({
  children,
  description,
  error,
  id,
  label,
  required = false,
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="grid gap-2">
      <label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-red-700">
            *
          </span>
        ) : null}
      </label>

      {description ? (
        <p className="text-sm leading-5 text-slate-600" id={descriptionId}>
          {description}
        </p>
      ) : null}

      {children}

      {error ? (
        <p className="text-sm font-semibold text-red-700" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
