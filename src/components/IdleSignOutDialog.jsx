import { Clock3 } from "lucide-react";
import { useEffect, useRef } from "react";
import AdminDialog, {
  DIALOG_CANCEL_BUTTON,
  DIALOG_PRIMARY_BUTTON,
  DialogBody,
  DialogFooter,
} from "./AdminDialog.jsx";

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");

  return `${minutes}:${rest}`;
}

// Shown shortly before an idle staff session is signed out. Closing the
// dialog, pressing Escape or choosing "Stay signed in" keeps the
// session.
export default function IdleSignOutDialog({
  onSignOut,
  onStay,
  secondsLeft,
  signingOut,
}) {
  const stayRef = useRef(null);

  useEffect(() => {
    stayRef.current?.focus();
  }, []);

  return (
    <AdminDialog
      busy={signingOut}
      closeLabel="Stay signed in"
      description="For security, staff are signed out after 25 minutes without activity."
      eyebrow="Inactivity"
      icon={Clock3}
      onClose={onStay}
      title="Are you still there?"
      tone="warning"
    >
      <DialogBody>
        <p className="text-sm leading-6 text-slate-700">
          You will be signed out in{" "}
          <span
            className="font-black tabular-nums text-slate-950"
            role="timer"
          >
            {formatCountdown(secondsLeft)}
          </span>
          . Anything you have not saved will be lost.
        </p>
      </DialogBody>

      <DialogFooter>
        <button
          className={DIALOG_CANCEL_BUTTON}
          disabled={signingOut}
          onClick={onSignOut}
          type="button"
        >
          Sign out now
        </button>

        <button
          className={DIALOG_PRIMARY_BUTTON}
          disabled={signingOut}
          onClick={onStay}
          ref={stayRef}
          type="button"
        >
          Stay signed in
        </button>
      </DialogFooter>
    </AdminDialog>
  );
}
