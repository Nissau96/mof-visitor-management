import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Link2, Mail, Share2 } from "lucide-react";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import AdminDialog, {
  DIALOG_CANCEL_BUTTON,
  DIALOG_INPUT,
  DIALOG_PRIMARY_BUTTON,
  DialogBody,
  DialogFooter,
} from "./AdminDialog.jsx";
import { ControlledAppSelect } from "./AppSelect.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import Field from "./Field.jsx";
import { toOptions } from "../constants/selectOptions.js";
import {
  MINISTRY_OF_FINANCE_AGENCY,
  MOF_DIVISIONS,
  VISIT_AGENCIES,
  getFloorOptions,
  resolveDestinationFloor,
  resolveVisitTower,
} from "../constants/visitorOptions.js";
import {
  bookerInviteCreateSchema,
  inviteCreateSchema,
} from "../validation/visitorInvites.js";
import { formatLinkExpiry } from "../lib/visitorInvites.js";

const AGENCY_CHOICES = toOptions(VISIT_AGENCIES);
const DIVISION_CHOICES = toOptions(MOF_DIVISIONS);

// Copy and share for a link that was just created. The link is shown
// only now: the server keeps a hash of it, not the link itself.
function CreatedLink({ invite, onClose }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({
        text: `Book your visit to the Ministry of Finance with ${invite.hostName}. The link works once.`,
        title: "Book your visit",
        url: invite.url,
      });
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  return (
    <>
      <DialogBody>
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-800" htmlFor="visitor-link-url">
            Booking link
          </label>
          <input
            className={`${DIALOG_INPUT} font-mono text-sm`}
            id="visitor-link-url"
            onFocus={(event) => event.target.select()}
            readOnly
            value={invite.url}
          />
          <p className="text-sm leading-5 text-slate-600">
            Works once, until {formatLinkExpiry(invite.expiresAt)}. Copy it now: it
            cannot be shown again.
          </p>
        </div>

        {invite.emailRequested ? (
          <p
            className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${invite.emailSent ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900"}`}
            role="status"
          >
            <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {invite.emailSent
              ? "The link was emailed to the visitor."
              : "The email could not be sent. Copy or share the link instead."}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button className={DIALOG_PRIMARY_BUTTON} onClick={copy} type="button">
            {copied ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
          {canShare ? (
            <button className={DIALOG_CANCEL_BUTTON} onClick={share} type="button">
              <Share2 aria-hidden="true" className="size-4" />
              Share
            </button>
          ) : null}
        </div>
        <p aria-live="polite" className="sr-only">
          {copied ? "Link copied" : ""}
        </p>
      </DialogBody>

      <DialogFooter>
        <button className={DIALOG_CANCEL_BUTTON} onClick={onClose} type="button">
          Done
        </button>
      </DialogFooter>
    </>
  );
}

/**
 * Creates a one-visitor booking link.
 * api: createStaffInviteApi(...) or bookerInviteApi. With api.chooseHost
 * staff name the host (suggested from `hosts`); otherwise the person
 * signed in is the host.
 */
export default function CreateVisitorLinkDialog({
  api,
  defaultHost = "",
  hosts = [],
  onClose,
  onCreated,
  onSignInRequired,
}) {
  const hostListId = useId();
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm({
    defaultValues: {
      agency: MINISTRY_OF_FINANCE_AGENCY,
      division: "",
      floor: "",
      ...(api.chooseHost ? { hostName: defaultHost } : {}),
      visitorEmail: "",
    },
    resolver: zodResolver(api.chooseHost ? inviteCreateSchema : bookerInviteCreateSchema),
  });

  const agency = useWatch({ control, name: "agency" });
  const division = useWatch({ control, name: "division" });
  const isMinistry = agency === MINISTRY_OF_FINANCE_AGENCY;
  const floorChoices = getFloorOptions(resolveVisitTower(agency, division));

  async function create(values) {
    setError("");

    try {
      const invite = await api.create(values);
      setCreated(invite);
      onCreated?.(invite);
    } catch (createError) {
      if (createError?.status === 401 && onSignInRequired) {
        onSignInRequired(createError.message);
        return;
      }

      setError(createError?.message || "The visitor link could not be created. Please try again.");
    }
  }

  return (
    <AdminDialog
      busy={isSubmitting}
      description={
        created
          ? `For one visitor to ${created.hostName}.`
          : "The visitor fills in their details and picks a date. The link works once, for 24 hours."
      }
      eyebrow="Visitor link"
      icon={Link2}
      onClose={onClose}
      title={created ? "Link ready to send" : "Create visitor link"}
    >
      {created ? (
        <CreatedLink invite={created} onClose={onClose} />
      ) : (
        <form noValidate onSubmit={handleSubmit(create)}>
          <DialogBody>
            {error ? <ErrorMessage message={error} title="Link not created" /> : null}

            {api.chooseHost ? (
              <Field
                description="The person the visitor is coming to see."
                error={errors.hostName?.message}
                id="visitor-link-host"
                label="Host"
                required
              >
                <input
                  aria-describedby={`visitor-link-host-description${errors.hostName ? " visitor-link-host-error" : ""}`}
                  aria-invalid={Boolean(errors.hostName)}
                  autoComplete="off"
                  className={DIALOG_INPUT}
                  disabled={isSubmitting}
                  id="visitor-link-host"
                  list={hosts.length ? hostListId : undefined}
                  maxLength="120"
                  {...register("hostName")}
                />
                {hosts.length ? (
                  <datalist id={hostListId}>
                    {hosts.map((host) => (
                      <option key={host} value={host} />
                    ))}
                  </datalist>
                ) : null}
              </Field>
            ) : null}

            <Field error={errors.agency?.message} id="visitor-link-agency" label="Agency" required>
              <ControlledAppSelect
                control={control}
                describedBy={errors.agency ? "visitor-link-agency-error" : undefined}
                disabled={isSubmitting}
                id="visitor-link-agency"
                invalid={Boolean(errors.agency)}
                labelledBy="visitor-link-agency-label"
                name="agency"
                onValueChange={(nextAgency) => {
                  setValue("division", "");
                  setValue("floor", resolveDestinationFloor(nextAgency, ""));
                }}
                options={AGENCY_CHOICES}
                placeholder="Select an agency"
              />
            </Field>

            {isMinistry ? (
              <Field
                error={errors.division?.message}
                id="visitor-link-division"
                label="Division"
                required
              >
                <ControlledAppSelect
                  control={control}
                  describedBy={errors.division ? "visitor-link-division-error" : undefined}
                  disabled={isSubmitting}
                  id="visitor-link-division"
                  invalid={Boolean(errors.division)}
                  labelledBy="visitor-link-division-label"
                  name="division"
                  onValueChange={(nextDivision) =>
                    setValue("floor", resolveDestinationFloor(MINISTRY_OF_FINANCE_AGENCY, nextDivision))
                  }
                  options={DIVISION_CHOICES}
                  placeholder="Select a division"
                />
              </Field>
            ) : null}

            <Field
              description="Filled in from the agency or division. The tower follows them too."
              error={errors.floor?.message}
              id="visitor-link-floor"
              label="Floor"
            >
              <ControlledAppSelect
                control={control}
                describedBy="visitor-link-floor-description"
                disabled={isSubmitting}
                id="visitor-link-floor"
                labelledBy="visitor-link-floor-label"
                name="floor"
                options={floorChoices}
                placeholder="Select a floor"
              />
            </Field>

            <Field
              description="Optional. We email the link to the visitor."
              error={errors.visitorEmail?.message}
              id="visitor-link-email"
              label="Visitor's email"
            >
              <input
                aria-describedby={`visitor-link-email-description${errors.visitorEmail ? " visitor-link-email-error" : ""}`}
                aria-invalid={Boolean(errors.visitorEmail)}
                autoComplete="off"
                className={DIALOG_INPUT}
                disabled={isSubmitting}
                id="visitor-link-email"
                inputMode="email"
                maxLength="254"
                placeholder="visitor@example.com"
                type="email"
                {...register("visitorEmail")}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <button
              className={DIALOG_CANCEL_BUTTON}
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button className={DIALOG_PRIMARY_BUTTON} disabled={isSubmitting} type="submit">
              <Link2 aria-hidden="true" className="size-4" />
              {isSubmitting ? "Creating…" : "Create link"}
            </button>
          </DialogFooter>
        </form>
      )}
    </AdminDialog>
  );
}
