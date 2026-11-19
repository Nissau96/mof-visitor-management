import { CalendarCheck, CalendarPlus, Link2, ScanSearch, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import CreateVisitorLinkDialog from "./CreateVisitorLinkDialog.jsx";
import FindBookingDialog from "./FindBookingDialog.jsx";
import { createStaffInviteApi } from "../lib/visitorInviteApi.js";
import { quickActionsFor } from "../lib/visitorInvites.js";

// Exponential ease-out; motion only for people who allow it.
const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

// The rim keeps the button distinct when it floats over a teal card.
const FAB = `relative grid size-16 place-items-center rounded-full border-4 border-[#ffffff] bg-[#115e59] dark:border-[#0f172a] text-[#ffffff] shadow-[0_14px_30px_-10px_rgba(17,94,89,0.65)] hover:bg-[#134e4a] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 motion-safe:transition-[background-color,transform] motion-safe:duration-200 motion-safe:active:scale-95`;

// Top to bottom; the pills step left as they rise from the button, and
// the one nearest the button appears first.
const ACTIONS = Object.freeze([
  Object.freeze({
    delay: "motion-safe:delay-[90ms]",
    icon: ScanSearch,
    key: "find",
    label: "Find booking",
    offset: "mr-9",
  }),
  Object.freeze({
    delay: "motion-safe:delay-[40ms]",
    icon: Link2,
    key: "create",
    label: "Create visitor link",
    offset: "mr-3",
  }),
]);

function FabIcon({ icon: Icon, shown }) {
  return (
    <Icon
      aria-hidden="true"
      className={`absolute size-7 motion-safe:transition-[transform,opacity] motion-safe:duration-300 ${EASE} ${
        shown ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"
      }`}
      strokeWidth={2.25}
    />
  );
}

/**
 * Floating booking button in the staff area. Receptionists and
 * administrators open a fan of two actions (Find booking, Create visitor
 * link); Unit Heads go straight to Create visitor link; IT gets nothing.
 */
export default function StaffQuickActions({ accessToken, fullName = "", role, tower = "" }) {
  const available = quickActionsFor(role);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState("");
  const [hosts, setHosts] = useState([]);
  const fabRef = useRef(null);
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

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        fabRef.current?.focus();
      }
    }

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  if (!available) {
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

  const actions = ACTIONS.filter((action) => available[action.key]);

  return (
    <>
      {available.find ? (
        <div
          aria-hidden="true"
          className={`fixed inset-0 z-40 bg-slate-950/25 print:hidden motion-safe:transition-opacity motion-safe:duration-300 ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {/* Only the button and open pills take clicks; the rest of this
          corner passes them through to the page. */}
      <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6 print:hidden [&>*]:pointer-events-auto">
        {available.find ? (
          <div
            aria-label="Booking actions"
            className={`flex flex-col items-end gap-3 ${menuOpen ? "" : "invisible"}`}
            id="staff-quick-actions-menu"
            role="menu"
          >
            {actions.map((action, index) => {
              const Icon = action.icon;

              return (
                <button
                  className={`${action.offset} flex min-h-14 items-center gap-3 rounded-full border border-slate-200/80 bg-white py-2 pl-3 pr-6 text-base font-bold text-slate-900 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 motion-safe:transition-[opacity,transform,background-color] motion-safe:duration-300 ${EASE} ${
                    menuOpen
                      ? `${action.delay} translate-y-0 scale-100 opacity-100`
                      : "translate-y-3 scale-90 opacity-0"
                  }`}
                  key={action.key}
                  onClick={() => open(action.key)}
                  ref={index === 0 ? firstItemRef : undefined}
                  role="menuitem"
                  tabIndex={menuOpen ? 0 : -1}
                  type="button"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-[#e6f7f4] text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]">
                    <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
                  </span>
                  {action.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {available.find ? (
          <button
            aria-controls="staff-quick-actions-menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={menuOpen ? "Close booking actions" : "Bookings"}
            className={FAB}
            onClick={() => setMenuOpen((current) => !current)}
            ref={fabRef}
            title={menuOpen ? "Close" : "Bookings"}
            type="button"
          >
            <FabIcon icon={CalendarCheck} shown={!menuOpen} />
            <FabIcon icon={X} shown={menuOpen} />
          </button>
        ) : (
          <button
            aria-label="Create visitor link"
            className={FAB}
            onClick={() => open("create")}
            ref={fabRef}
            title="Create visitor link"
            type="button"
          >
            <FabIcon icon={CalendarPlus} shown />
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
