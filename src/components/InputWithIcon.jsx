import { forwardRef } from "react";
import { DIALOG_INPUT } from "./AdminDialog.jsx";

// A standard form input with a muted icon inside its leading edge.
// Every other prop goes to the <input>, so it works with
// react-hook-form's register().
const InputWithIcon = forwardRef(function InputWithIcon(
  { className = "", icon: Icon, ...props },
  ref,
) {
  return (
    <div className="relative">
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-slate-500"
      />
      <input
        className={`${DIALOG_INPUT} pl-11 ${className}`}
        ref={ref}
        {...props}
      />
    </div>
  );
});

export default InputWithIcon;
