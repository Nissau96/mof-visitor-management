import { useMemo } from "react";
import VisitorLinksPanel from "../components/VisitorLinksPanel.jsx";
import useAuth from "../hooks/useAuth.js";
import { createStaffInviteApi } from "../lib/visitorInviteApi.js";

// The signed-in staff member's visitor booking links.
export default function StaffVisitorLinksPage() {
  const { profile, session, signOut, tower } = useAuth();
  const accessToken = session?.access_token || "";

  const api = useMemo(
    () => createStaffInviteApi({ accessToken, tower: tower || "" }),
    [accessToken, tower],
  );

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 lg:px-0">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Visitor Links
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Send a visitor a link to book their own visit. They get a VIS- code to
          show at reception, and you get an email when they book.
        </p>
      </header>

      <VisitorLinksPanel
        api={api}
        defaultHost={profile?.fullName || ""}
        onSignInRequired={() => void signOut?.()}
      />
    </div>
  );
}
