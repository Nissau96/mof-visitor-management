import { useOutletContext } from "react-router-dom";
import VisitorLinksPanel from "../components/VisitorLinksPanel.jsx";
import { bookerInviteApi } from "../lib/visitorInviteApi.js";

// /book/invite: Ministry staff signed in with their work email send one
// visitor a booking link. They are the host of their own links.
export default function BookInvitePage() {
  const { booker, requireSignIn } = useOutletContext();

  return (
    <div className="mx-auto mt-6 grid w-full max-w-4xl gap-6 rounded-3xl border border-slate-200/70 bg-white/95 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)] sm:p-8">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Invite a visitor
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Send one visitor a link to book their own visit
          {booker?.name ? ` with you, ${booker.name}` : ""}. They pick the date
          and get a VIS- code to show at reception, so they skip the kiosk.
        </p>
      </header>

      <VisitorLinksPanel api={bookerInviteApi} onSignInRequired={requireSignIn} />
    </div>
  );
}
