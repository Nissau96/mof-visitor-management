import {
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import useAuth from "../hooks/useAuth.js";
import { apiRequest } from "../lib/api.js";
import { KIOSK_PATH } from "../lib/kiosk.js";
import AdminDialog, {
  DIALOG_BUTTON,
  DIALOG_CANCEL_BUTTON,
  DIALOG_INPUT,
  DIALOG_PRIMARY_BUTTON,
  DialogBody,
  DialogFooter,
} from "./AdminDialog.jsx";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

// Opened from the sidebar's Set up kiosk button. Setting up turns the
// browser it runs in into a reception kiosk for a year and signs staff
// out, so the tablet is left on the kiosk rather than the staff app.
// The list removes a lost or stolen tablet; it stops on its next use.
export default function KioskDevicesDialog({ onClose }) {
  const { session, signOut } = useAuth();
  const labelId = useId();
  const hintId = useId();
  const errorId = useId();
  const [label, setLabel] = useState("");
  const [setupError, setSetupError] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [devices, setDevices] = useState({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  const authorization = `Bearer ${session?.access_token || ""}`;

  useEffect(() => {
    const controller = new AbortController();

    apiRequest("/api/staff/session?kiosks=1", {
      headers: { Authorization: authorization },
      method: "GET",
      signal: controller.signal,
    })
      .then((result) => {
        setDevices({
          kiosks: Array.isArray(result?.kiosks) ? result.kiosks : [],
          status: "ready",
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.name !== "AbortError") {
          setDevices({ status: "error" });
        }
      });

    return () => controller.abort();
  }, [authorization, refreshKey]);

  async function setUpKiosk(event) {
    event.preventDefault();

    const name = label.trim();

    if (name.length < 2 || name.length > 60) {
      setSetupError("Name the tablet in 2 to 60 characters.");
      return;
    }

    setSettingUp(true);
    setSetupError("");

    try {
      await apiRequest("/api/staff/session?kiosk=1", {
        body: JSON.stringify({ label: name }),
        headers: { Authorization: authorization },
        method: "POST",
      });
    } catch (error) {
      setSetupError(
        error?.status === 400 && error.message
          ? error.message
          : "This device could not be set up as a kiosk. Try again.",
      );
      setSettingUp(false);
      return;
    }

    await signOut().catch(() => undefined);
    window.location.assign(KIOSK_PATH);
  }

  function retryList() {
    setDevices({ status: "loading" });
    setRefreshKey((current) => current + 1);
  }

  return (
    <AdminDialog
      busy={settingUp}
      closeLabel="Close kiosk setup"
      description="Turn a reception tablet into the visitor kiosk, or remove one that is lost or stolen."
      eyebrow="Reception kiosks"
      icon={MonitorSmartphone}
      onClose={onClose}
      title="Set up kiosk"
    >
      <DialogBody>
        <form className="grid gap-3" noValidate onSubmit={setUpKiosk}>
          <h3 className="font-black text-slate-950">This device</h3>

          <div className="grid gap-1.5">
            <label className="text-sm font-bold text-slate-800" htmlFor={labelId}>
              Tablet name
            </label>
            <input
              aria-describedby={setupError ? `${hintId} ${errorId}` : hintId}
              aria-invalid={Boolean(setupError)}
              autoComplete="off"
              className={DIALOG_INPUT}
              disabled={settingUp}
              id={labelId}
              maxLength={60}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Tower 1 reception"
              value={label}
            />
            <p className="text-sm leading-6 text-slate-600" id={hintId}>
              You will be signed out, and this device opens the visitor
              kiosk for the next 12 months. Only use a Ministry tablet
              that stays at reception.
            </p>
            {setupError ? (
              <p
                className="text-sm font-semibold text-red-700"
                id={errorId}
                role="alert"
              >
                {setupError}
              </p>
            ) : null}
          </div>

          <button
            className={`${DIALOG_PRIMARY_BUTTON} justify-self-start`}
            disabled={settingUp}
            type="submit"
          >
            {settingUp ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Set up and sign out
          </button>
        </form>

        <section
          aria-labelledby="kiosk-tablets-heading"
          className="border-t border-slate-200 pt-5"
        >
          <h3 className="font-black text-slate-950" id="kiosk-tablets-heading">
            Set-up tablets
          </h3>

          {devices.status === "loading" ? (
            <p
              className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600"
              role="status"
            >
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Loading tablets…
            </p>
          ) : null}

          {devices.status === "error" ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-red-700" role="alert">
                The tablets could not be loaded.
              </p>
              <button
                className={`${DIALOG_CANCEL_BUTTON} min-h-10 px-4`}
                onClick={retryList}
                type="button"
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Try again
              </button>
            </div>
          ) : null}

          {devices.status === "ready" && devices.kiosks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              No tablets are set up yet.
            </p>
          ) : null}

          {devices.status === "ready" && devices.kiosks.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {devices.kiosks.map((device) => (
                <KioskDeviceRow
                  authorization={authorization}
                  device={device}
                  key={device.id}
                  onRemoved={() =>
                    setDevices((current) => ({
                      ...current,
                      kiosks: current.kiosks.filter(
                        (kiosk) => kiosk.id !== device.id,
                      ),
                    }))
                  }
                />
              ))}
            </ul>
          ) : null}
        </section>
      </DialogBody>

      <DialogFooter>
        <button
          className={DIALOG_CANCEL_BUTTON}
          disabled={settingUp}
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </DialogFooter>
    </AdminDialog>
  );
}

function KioskDeviceRow({ authorization, device, onRemoved }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  async function removeDevice() {
    setRemoving(true);
    setError("");

    try {
      await apiRequest(
        `/api/staff/session?kiosk=${encodeURIComponent(device.id)}`,
        {
          headers: { Authorization: authorization },
          method: "DELETE",
        },
      );
      onRemoved();
    } catch (removeError) {
      if (removeError?.status === 404) {
        onRemoved();
        return;
      }

      setError("The tablet could not be removed. Try again.");
      setRemoving(false);
    }
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-950">{device.label}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Set up{device.createdByName ? ` by ${device.createdByName}` : ""}{" "}
            on {dateFormatter.format(new Date(device.createdAt))} · Last
            used {dateTimeFormatter.format(new Date(device.lastSeenAt))}
          </p>
        </div>

        {confirming ? null : (
          <button
            aria-label={`Remove ${device.label}`}
            className={`${DIALOG_BUTTON} min-h-10 border border-red-200 bg-white px-4 text-red-700 hover:bg-red-50`}
            onClick={() => setConfirming(true)}
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove
          </button>
        )}
      </div>

      {confirming ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-white p-3">
          <p className="text-sm text-slate-800">
            Remove <strong>{device.label}</strong>? It stops working the next
            time someone uses it.
          </p>

          {error ? (
            <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={`${DIALOG_CANCEL_BUTTON} min-h-10 px-4`}
              disabled={removing}
              onClick={() => {
                setConfirming(false);
                setError("");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`${DIALOG_BUTTON} min-h-10 bg-red-700 px-4 text-white hover:bg-red-800 disabled:opacity-60`}
              disabled={removing}
              onClick={removeDevice}
              type="button"
            >
              {removing ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              Remove tablet
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
