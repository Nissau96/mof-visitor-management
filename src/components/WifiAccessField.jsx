import { Wifi } from "lucide-react";
import { ControlledAppSelect } from "./AppSelect.jsx";
import Field from "./Field.jsx";
import { WIFI_ACCESS_OPTIONS } from "../constants/visitorOptions.js";

// Required Yes/No dropdown for Wi-Fi access. When the chosen meeting
// already asked for Wi-Fi for its guests, a short note replaces it.
export default function WifiAccessField({
  control,
  covered = false,
  description = "The IT team uses your mobile number and email to send the Wi-Fi details.",
  error,
  id = "wifiAccess",
  label = "Wi-Fi access",
  name = "wifiAccess",
  options = WIFI_ACCESS_OPTIONS,
}) {
  if (covered) {
    return (
      <p className="flex items-start gap-3 rounded-xl border border-[#99e2d6] bg-[#f0fdfa] p-3 text-sm leading-6 text-slate-700 dark:border-[#14756d] dark:bg-[#0b2b29] dark:text-[#cbd5e1]!">
        <Wifi aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
        <span>
          Wi-Fi is already arranged for this meeting&apos;s guests. The IT
          team will contact you with the details.
        </span>
      </p>
    );
  }

  const describedBy = [
    description ? `${id}-description` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <Field
      description={description}
      error={error?.message}
      id={id}
      label={label}
      required
    >
      <ControlledAppSelect
        control={control}
        describedBy={describedBy}
        id={id}
        invalid={Boolean(error)}
        labelledBy={`${id}-label`}
        name={name}
        options={options}
        placeholder="Select Yes or No"
      />
    </Field>
  );
}
