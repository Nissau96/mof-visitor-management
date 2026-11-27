import { CalendarCheck, CreditCard, LoaderCircle, Search } from "lucide-react";
import { useState } from "react";
import AdminDialog, {
  DIALOG_CANCEL_BUTTON,
  DIALOG_INPUT,
  DIALOG_PRIMARY_BUTTON,
  DialogBody,
  DialogFooter,
} from "./AdminDialog.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import { AssignVisitorCardModal } from "./VisitorCardActions.jsx";
import { getFloorLabel, getTowerLabel } from "../constants/visitorOptions.js";
import { formatDate } from "../lib/meetingSchedule.js";
import { getPendingAdmissions } from "../lib/visitorCardApi.js";
import { findVisitorBooking } from "../lib/visitorInviteApi.js";
import { toast } from "../lib/toast.js";
import { normalizeBookingCode } from "../validation/visitorInvites.js";

// Told to every page that lists admissions, so they refresh after a
// card is assigned from here.
export const ADMISSIONS_CHANGED_EVENT = "visitor-admissions-changed";

function explain(result) {
  const tower = getTowerLabel(result.tower);

  switch (result.state) {
    case "other_tower":
      return `This visitor is booked for ${tower}. Send them to ${tower} reception.`;
    case "upcoming":
      return `This visit is booked for ${formatDate(result.visitDate, { weekday: true })}, not today.`;
    case "arrived":
      return "This visitor has already been admitted with this code.";
    case "not_arrived":
      return "This booking has ended: the visitor did not arrive on the booked date.";
    case "cancelled":
      return "This booking was cancelled. The visitor can register at the kiosk instead.";
    default:
      return "";
  }
}

function Detail({ label, value }) {
  return value ? (
    <div className="grid gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-950">{value}</dd>
    </div>
  ) : null;
}

/**
 * Reception's "Find booking": search a visitor's VIS- code, check the
 * booking, then admit them with the usual card dialog.
 */
export default function FindBookingDialog({ accessToken, onClose, tower = "" }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(null);
  const [assigning, setAssigning] = useState(false);

  async function search(event) {
    event.preventDefault();
    setError("");
    setFound(null);

    const referenceCode = normalizeBookingCode(code);

    if (!/^VIS-[0-9A-F]{8}$/.test(referenceCode)) {
      setError("Enter the 8 characters after VIS-, for example 1A2B3C4D.");
      return;
    }

    setSearching(true);

    try {
      const result = await findVisitorBooking({ accessToken, code: referenceCode, tower });
      let admission = null;

      if (result.state === "waiting") {
        const pending = await getPendingAdmissions({
          accessToken,
          page: 1,
          pageSize: 5,
          search: referenceCode,
          tower,
        });

        admission =
          (pending?.admissions || []).find(
            (record) => record.referenceCode === referenceCode,
          ) || null;
      }

      setFound({ ...result, admission });
    } catch (searchError) {
      setError(searchError?.message || "The booking could not be searched. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  if (assigning && found?.admission) {
    return (
      <AssignVisitorCardModal
        accessToken={accessToken}
        onClose={() => setAssigning(false)}
        onSuccess={(message) => {
          toast.success("Visitor card updated", message);
          window.dispatchEvent(new Event(ADMISSIONS_CHANGED_EVENT));
          onClose();
        }}
        visitor={found.admission}
      />
    );
  }

  const ready = found?.state === "waiting" && found.admission;
  const message = found && !ready ? explain(found) : "";
  const visitorName = found?.admission?.fullName || found?.visitorName;

  return (
    <AdminDialog
      busy={searching}
      description="Type the reference code the visitor shows you. VIS- is optional."
      eyebrow="Reception"
      icon={Search}
      onClose={onClose}
      title="Find booking"
    >
      <form noValidate onSubmit={search}>
        <DialogBody>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-800" htmlFor="find-booking-code">
              Reference code
            </label>
            <div className="flex gap-2">
              <input
                aria-describedby={error ? "find-booking-error" : undefined}
                aria-invalid={Boolean(error)}
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                className={`${DIALOG_INPUT} font-mono uppercase tracking-wider`}
                id="find-booking-code"
                maxLength="20"
                onChange={(event) => {
                  setCode(event.target.value);
                  setError("");
                }}
                placeholder="VIS-1A2B3C4D"
                spellCheck="false"
                value={code}
              />
              <button
                className={`${DIALOG_PRIMARY_BUTTON} shrink-0 px-5`}
                disabled={searching}
                type="submit"
              >
                {searching ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Search aria-hidden="true" className="size-4" />
                )}
                Search
              </button>
            </div>
            {error ? (
              <p className="text-sm font-semibold text-red-700" id="find-booking-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          {found ? (
            <div aria-live="polite" className="grid gap-4">
              {message ? (
                <ErrorMessage message={message} title="Cannot admit here" />
              ) : found.state === "waiting" && !found.admission ? (
                <ErrorMessage
                  message="The visit is waiting but could not be opened here. Look for it in Pending admissions."
                  title="Not loaded"
                />
              ) : null}

              <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <Detail label="Reference" value={found.referenceCode} />
                <Detail label="Visitor" value={visitorName} />
                <Detail label="Visiting" value={found.hostName || found.admission?.personVisiting} />
                <Detail
                  label="Date"
                  value={found.visitDate ? formatDate(found.visitDate, { weekday: true }) : ""}
                />
                <Detail
                  label="Where"
                  value={[getTowerLabel(found.tower), getFloorLabel(found.floor || "", found.tower)]
                    .filter(Boolean)
                    .join(", ")}
                />
              </dl>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <button className={DIALOG_CANCEL_BUTTON} onClick={onClose} type="button">
            Close
          </button>
          {ready ? (
            <button
              className={DIALOG_PRIMARY_BUTTON}
              onClick={() => setAssigning(true)}
              type="button"
            >
              <CreditCard aria-hidden="true" className="size-4" />
              Admit and assign card
            </button>
          ) : (
            <span className="hidden sm:flex sm:items-center sm:gap-2 sm:text-sm sm:text-slate-500">
              <CalendarCheck aria-hidden="true" className="size-4" />
              Booked visitors bring a VIS- code
            </span>
          )}
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}
