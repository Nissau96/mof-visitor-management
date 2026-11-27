import { Ban, Link2, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import AdminDialog, {
  DIALOG_CANCEL_BUTTON,
  DIALOG_PRIMARY_BUTTON,
  DialogBody,
  DialogFooter,
} from "./AdminDialog.jsx";
import CreateVisitorLinkDialog from "./CreateVisitorLinkDialog.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import LoadingState from "./LoadingState.jsx";
import { getFloorLabel, getTowerLabel } from "../constants/visitorOptions.js";
import { formatDate } from "../lib/meetingSchedule.js";
import { toast } from "../lib/toast.js";
import { canCancelInvite, formatLinkExpiry } from "../lib/visitorInvites.js";

const LINK_STATES = Object.freeze({
  cancelled: { label: "Cancelled", tone: "bg-slate-100 text-slate-700" },
  expired: { label: "Expired", tone: "bg-slate-100 text-slate-700" },
  unused: { label: "Unused", tone: "bg-amber-50 text-amber-900" },
  used: { label: "Used", tone: "bg-brand-50 text-brand-900" },
});

const VISIT_STATES = Object.freeze({
  arrived: "Arrived",
  cancelled: "Cancelled",
  not_arrived: "Did not arrive",
  upcoming: "Expected",
  waiting: "Waiting at reception",
});

function describePlace(invite) {
  return [
    invite.division || invite.agency,
    getTowerLabel(invite.tower),
    getFloorLabel(invite.floor || "", invite.tower),
  ]
    .filter(Boolean)
    .join(" · ");
}

function InviteRow({ invite, onCancel }) {
  const state = LINK_STATES[invite.state] || LINK_STATES.expired;

  return (
    <li className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${state.tone}`}>
            {state.label}
          </span>
          {invite.state === "used" ? (
            <span className="font-mono text-sm font-bold text-slate-900">
              {invite.referenceCode}
            </span>
          ) : null}
        </div>

        <p className="mt-2 font-semibold text-slate-950">
          {invite.state === "used"
            ? `${invite.visitorName} · ${formatDate(invite.visitDate, { weekday: true })}`
            : `For ${invite.hostName}`}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {invite.state === "used"
            ? `${VISIT_STATES[invite.visitState] || "Expected"} · ${describePlace(invite)}`
            : invite.state === "unused"
              ? `Works until ${formatLinkExpiry(invite.expiresAt)} · ${describePlace(invite)}`
              : describePlace(invite)}
        </p>
      </div>

      {canCancelInvite(invite) ? (
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200"
          onClick={() => onCancel(invite)}
          type="button"
        >
          <Ban aria-hidden="true" className="size-4" />
          Cancel
        </button>
      ) : null}
    </li>
  );
}

function CancelInviteDialog({ api, invite, onClose, onCancelled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const booked = invite.state === "used";

  async function confirm() {
    setBusy(true);
    setError("");

    try {
      onCancelled(await api.cancel(invite.id));
    } catch (cancelError) {
      setError(cancelError?.message || "The visitor link could not be cancelled.");
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      busy={busy}
      description={
        booked
          ? `${invite.visitorName}'s visit on ${formatDate(invite.visitDate)} will be cancelled, and reception will not expect them.`
          : "The link will stop working straight away."
      }
      eyebrow="Visitor link"
      icon={Ban}
      onClose={onClose}
      title={booked ? "Cancel this visit?" : "Cancel this link?"}
      tone="danger"
    >
      <DialogBody>
        {error ? <ErrorMessage message={error} title="Not cancelled" /> : null}
        <p className="text-sm leading-6 text-slate-700">
          This cannot be undone. Create a new link if the visitor still needs to come.
        </p>
      </DialogBody>
      <DialogFooter>
        <button className={DIALOG_CANCEL_BUTTON} disabled={busy} onClick={onClose} type="button">
          Keep it
        </button>
        <button className={DIALOG_PRIMARY_BUTTON} disabled={busy} onClick={confirm} type="button">
          {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          {booked ? "Cancel visit" : "Cancel link"}
        </button>
      </DialogFooter>
    </AdminDialog>
  );
}

/**
 * The signed-in person's visitor links, with Create and Cancel.
 * api: createStaffInviteApi(...) or bookerInviteApi.
 */
export default function VisitorLinksPanel({
  api,
  defaultHost = "",
  headingLevel: Heading = "h2",
  onSignInRequired,
  openCreate = false,
}) {
  const [result, setResult] = useState({ error: "", hosts: [], invites: [], status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [creating, setCreating] = useState(openCreate);
  const [cancelling, setCancelling] = useState(null);

  const handleError = useCallback(
    (error) => {
      if (error?.status === 401 && onSignInRequired) {
        onSignInRequired(error.message);
        return true;
      }

      return false;
    },
    [onSignInRequired],
  );

  useEffect(() => {
    const controller = new AbortController();

    api
      .list(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({
            error: "",
            hosts: Array.isArray(data?.hosts) ? data.hosts : [],
            invites: Array.isArray(data?.invites) ? data.invites : [],
            status: "ready",
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || handleError(error)) {
          return;
        }

        setResult((current) => ({
          ...current,
          error: error?.message || "Your visitor links could not be loaded.",
          status: "error",
        }));
      });

    return () => controller.abort();
  }, [api, handleError, refreshKey]);

  function refresh() {
    setRefreshKey((key) => key + 1);
  }

  return (
    <section aria-labelledby="visitor-links-heading" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading className="text-xl font-black tracking-tight text-slate-950" id="visitor-links-heading">
            Visitor links
          </Heading>
          <p className="mt-1 text-sm text-slate-600">
            One link books one visitor. It works once, for 24 hours.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            aria-label="Refresh visitor links"
            className="inline-flex size-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200"
            onClick={refresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
          </button>
          <button className={DIALOG_PRIMARY_BUTTON} onClick={() => setCreating(true)} type="button">
            <Link2 aria-hidden="true" className="size-4" />
            Create visitor link
          </button>
        </div>
      </div>

      {result.status === "loading" ? (
        <LoadingState message="Loading your visitor links…" />
      ) : result.status === "error" ? (
        <ErrorMessage message={result.error} title="Links not loaded" />
      ) : result.invites.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-600">
          No visitor links yet. Create one and send it to your visitor.
        </p>
      ) : (
        <ul className="grid gap-3">
          {result.invites.map((invite) => (
            <InviteRow invite={invite} key={invite.id} onCancel={setCancelling} />
          ))}
        </ul>
      )}

      {creating ? (
        <CreateVisitorLinkDialog
          api={api}
          defaultHost={defaultHost}
          hosts={result.hosts}
          onClose={() => setCreating(false)}
          onCreated={refresh}
          onSignInRequired={onSignInRequired}
        />
      ) : null}

      {cancelling ? (
        <CancelInviteDialog
          api={api}
          invite={cancelling}
          onCancelled={() => {
            setCancelling(null);
            toast.success("Cancelled", cancelling.state === "used" ? "The visit was cancelled." : "The link no longer works.");
            refresh();
          }}
          onClose={() => setCancelling(null)}
        />
      ) : null}
    </section>
  );
}
