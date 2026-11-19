import { Link2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import CreateVisitorLinkDialog from "./CreateVisitorLinkDialog.jsx";
import FindBookingDialog from "./FindBookingDialog.jsx";
import { createStaffInviteApi } from "../lib/visitorInviteApi.js";
import { quickActionsFor } from "../lib/visitorInvites.js";

const FAB =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-black text-white shadow-[0_18px_40px_-12px_rgba(17,94,89,0.6)] hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

const MENU_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-bold text-slate-900 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none";

/**
 * Floating button in the staff area. Receptionists and administrators
 * get a menu (Find booking, Create visitor link); Unit Heads get
 * Create visitor link alone; IT gets nothing.
 */
export default function StaffQuickActions({ accessToken, fullName = "", role, tower = "" }) {
  const actions = quickActionsFor(role);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState("");
  const [hosts, setHosts] = useState([]);
  const wrapperRef = useRef(null);
  const firstItemRef = useRef(null);

  const api = useMemo(
    () => createStaffInviteApi({ accessToken, tower }),
    [accessToken, tower],
  );

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    firstItemRef.current?.focus();

    function close(event) {
      if (event.type === "keydown" && event.key !== "Escape") {
        return;
      }

      if (event.type === "pointerdown" && wrapperRef.current?.contains(event.target)) {
        return;
      }

      setMenuOpen(false);
    }

    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);

    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [menuOpen]);

  if (!actions) {
    return null;
  }

  function open(name) {
    setMenuOpen(false);
    setDialog(name);

    // The host list comes with the link list; a name can still be typed.
    if (name === "create" && hosts.length === 0) {
      api
        .list()
        .then((data) => setHosts(Array.isArray(data?.hosts) ? data.hosts : []))
        .catch(() => undefined);
    }
  }

  return (
    <>
      <div
        className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6 print:hidden"
        ref={wrapperRef}
      >
        {actions.find && menuOpen ? (
          <div
            aria-label="Quick actions"
            className="w-60 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/20"
            id="staff-quick-actions-menu"
            role="menu"
          >
            <button
              className={MENU_ITEM}
              onClick={() => open("find")}
              ref={firstItemRef}
              role="menuitem"
              type="button"
            >
              <Search aria-hidden="true" className="size-5 text-brand-800" />
              Find booking
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => open("create")}
              role="menuitem"
              type="button"
            >
              <Link2 aria-hidden="true" className="size-5 text-brand-800" />
              Create visitor link
            </button>
          </div>
        ) : null}

        {actions.find ? (
          <button
            aria-controls={menuOpen ? "staff-quick-actions-menu" : undefined}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={`${FAB} w-14 px-0 sm:w-auto sm:px-5`}
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Plus aria-hidden="true" className="size-5" />
            )}
            <span className="sr-only sm:not-sr-only">Bookings</span>
          </button>
        ) : (
          <button className={FAB} onClick={() => open("create")} type="button">
            <Link2 aria-hidden="true" className="size-5" />
            Create visitor link
          </button>
        )}
      </div>

      {dialog === "find" ? (
        <FindBookingDialog
          accessToken={accessToken}
          onClose={() => setDialog("")}
          tower={tower}
        />
      ) : null}

      {dialog === "create" ? (
        <CreateVisitorLinkDialog
          api={api}
          defaultHost={fullName}
          hosts={hosts}
          onClose={() => setDialog("")}
        />
      ) : null}
    </>
  );
}
