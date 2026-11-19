import {
  ArrowUpRight,
  Building2,
  CircleCheck,
  CreditCard,
  LoaderCircle,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import AppSelect from "./AppSelect.jsx";
import DialogHeader from "./DialogHeader.jsx";
import {
  admitVisitorWithCard,
  checkoutCardVisitor,
  getAvailableVisitorCards,
  reprintDeactivatedVisitorCard,
  reportVisitorCardNotReturned,
  resolveVisitorCardIncident,
  startVisitorCardIncidentInvestigation,
} from "../lib/visitorCardApi.js";

// Shared DialogHeader on top; the body uses slate/white, which the dark
// theme remaps.
function ModalShell({
  busy = false,
  children,
  description,
  eyebrow = "Visitor cards",
  icon: Icon = CreditCard,
  onClose,
  title,
  tone = "brand",
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (
        event.key === "Escape" &&
        !busy
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    busy,
    onClose,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => {
      if (
        event.target ===
          event.currentTarget &&
        !busy
      ) {
        onClose();
      }
    }}>
      <section aria-describedby="visitor-card-dialog-description" aria-labelledby="visitor-card-dialog-title" aria-modal="true" className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl shadow-slate-950/30 sm:max-w-xl sm:rounded-4xl" role="dialog">
        <DialogHeader
          busy={busy}
          description={description}
          descriptionId="visitor-card-dialog-description"
          eyebrow={eyebrow}
          icon={Icon}
          onClose={onClose}
          title={title}
          titleId="visitor-card-dialog-title"
          tone={tone}
        />

        {children}
      </section>
    </div>
  );
}

const SUMMARY_LABEL =
  "text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500";

function initialsOf(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// "Ghana Investment Promotion Centre (GIPC)" -> "GIPC".
function shortAgencyName(agency) {
  return agency?.match(/\(([^)]+)\)\s*$/)?.[1] || agency;
}

function VisitorSummary({
  record,
}) {
  const destination =
    [
      shortAgencyName(
        record.destinationAgency,
      ),
      record.destinationDivision ||
        record.personVisiting,
    ]
      .filter(Boolean)
      .join(" · ") || "Not provided";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-[#ccf3ec] text-base font-black text-[#0f766e]">
            {initialsOf(record.fullName)}
          </span>

          <div className="min-w-0">
            <p className={SUMMARY_LABEL}>
              Visitor
            </p>

            <p className="mt-0.5 flex min-w-0 items-center gap-2 font-black text-slate-950">
              <span className="break-words">
                {record.fullName}
              </span>

              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f0fdfa] text-[#0f766e] ring-1 ring-[#99e2d6] dark:bg-[#0b2b29] dark:text-[#5eead4] dark:ring-[#14756d]">
                <UserRound className="size-3.5" />
              </span>
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className={SUMMARY_LABEL}>
            Reference
          </p>

          <p className="mt-1 inline-flex rounded-full bg-[#e6f7f4] px-2.5 py-0.5 font-mono text-xs font-bold tracking-wider text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]">
            {record.referenceCode}
          </p>
        </div>
      </div>

      <dl className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
        <div>
          <dt className={`flex items-center gap-2.5 ${SUMMARY_LABEL}`}>
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
            Destination
          </dt>

          <dd className="mt-0.5 pl-6.5 text-sm font-bold text-slate-800">
            {destination}
          </dd>
        </div>

        <div>
          <dt className={`flex items-center gap-2.5 ${SUMMARY_LABEL}`}>
            <Building2 aria-hidden="true" className="size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
            Tower
          </dt>

          <dd className="mt-0.5 pl-6.5 text-sm font-bold text-slate-800">
            {record.tower === "tower_1"
              ? "Tower 1"
              : "Tower 2"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ErrorNotice({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

const CARD_TYPES = [
  { label: "Regular", prefix: "MOF-V", value: "regular" },
  { label: "VIP", prefix: "MOF-VIP", value: "vip" },
];

export function AssignVisitorCardModal({
  accessToken,
  onClose,
  onSuccess,
  visitor,
}) {
  const [cardType, setCardType] =
    useState("regular");

  const [
    lastThreeDigits,
    setLastThreeDigits,
  ] = useState("");

  const [cards, setCards] =
    useState([]);

  const [selectedCardId, setSelectedCardId] =
    useState("");

  // Booked meeting guests never saw the privacy notice themselves.
  const needsPrivacy = Boolean(
    visitor.bookedGuest,
  );

  const [privacyConfirmed, setPrivacyConfirmed] =
    useState(false);

  const [searching, setSearching] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [searchCompleted, setSearchCompleted] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  // Searches run as the receptionist types, so only the latest one may
  // update the list.
  const latestSearch = useRef(0);

  function clearResults() {
    latestSearch.current += 1;
    setCards([]);
    setSelectedCardId("");
    setSearchCompleted(false);
    setSearching(false);
    setErrorMessage("");
  }

  function updateCardType(value) {
    setCardType(value);
    clearResults();

    if (lastThreeDigits.length === 3) {
      void findCards(
        lastThreeDigits,
        value,
      );
    }
  }

  function updateLastThreeDigits(event) {
    const digits = event.target.value
      .replace(/\D/g, "")
      .slice(0, 3);

    setLastThreeDigits(digits);
    clearResults();

    if (digits.length === 3) {
      void findCards(digits, cardType);
    }
  }

  function searchCards(event) {
    event.preventDefault();
    clearResults();
    void findCards(
      lastThreeDigits,
      cardType,
    );
  }

  async function findCards(
    digits,
    type,
  ) {
    if (
      !/^\d{3}$/.test(digits) ||
      digits === "000"
    ) {
      setErrorMessage(
        "Enter exactly the final three digits from 001 to 999.",
      );

      return;
    }

    const search =
      latestSearch.current + 1;

    latestSearch.current = search;
    setSearching(true);

    try {
      const result =
        await getAvailableVisitorCards({
          accessToken,
          cardType: type,
          lastThreeDigits: digits,
          tower: visitor.tower,
        });

      if (search !== latestSearch.current) {
        return;
      }

      const availableCards =
        Array.isArray(result?.cards)
          ? result.cards.filter(
              (card) =>
                card?.cardId &&
                card?.cardNumber &&
                card.status ===
                  "available" &&
                card.tower ===
                  visitor.tower,
            )
          : [];

      setCards(availableCards);
      setSearchCompleted(true);

      if (
        availableCards.length === 1
      ) {
        setSelectedCardId(
          availableCards[0].cardId,
        );
      }
    } catch (error) {
      if (search !== latestSearch.current) {
        return;
      }

      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "Available visitor cards could not be searched. Please try again.",
      );
    } finally {
      if (search === latestSearch.current) {
        setSearching(false);
      }
    }
  }

  async function confirmAdmission() {
    const selectedCard =
      cards.find(
        (card) =>
          card.cardId ===
          selectedCardId,
      );

    if (!selectedCard) {
      setErrorMessage(
        "Select the physical visitor card being issued.",
      );

      return;
    }

    setErrorMessage("");
    setSubmitting(true);

    try {
      const result =
        await admitVisitorWithCard({
          accessToken,
          cardId: selectedCard.cardId,
          ...(needsPrivacy
            ? { privacyConfirmed }
            : {}),
          tower: visitor.tower,
          visitId: visitor.visitId,
        });

      if (
        result?.admitted !== true ||
        result?.visit?.visitId !==
          visitor.visitId ||
        result?.visit?.status !==
          "checked_in" ||
        result?.cardAssignment
          ?.cardId !==
          selectedCard.cardId ||
        !result?.cardAssignment
          ?.cardNumber
      ) {
        throw new Error(
          "The visitor admission returned an invalid response.",
        );
      }

      onSuccess(
        `${visitor.fullName} was admitted with ${result.cardAssignment.cardNumber}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "Visitor admission could not be completed. Please try again.",
      );

      setSubmitting(false);
    }
  }

  // Typing stays enabled during a search, so a search never steals focus.
  const busy =
    searching || submitting;

  const prefix =
    CARD_TYPES.find(
      (type) => type.value === cardType,
    )?.prefix;

  return (
    <ModalShell busy={submitting} description="Enter the last three digits printed on the physical card, then confirm the card being issued." onClose={onClose} title="Assign visitor card">
      <div className="scroll-pane min-h-0 flex-1 space-y-5 px-5 py-5 sm:px-6">
        <VisitorSummary
          record={visitor}
        />

        <fieldset disabled={submitting}>
          <legend className="mb-2 text-sm font-bold text-slate-800">
            Card type
          </legend>

          <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
            {CARD_TYPES.map((type) => {
              const checked =
                cardType === type.value;

              return (
                <label className={`cursor-pointer rounded-full px-5 py-2.5 text-sm font-bold transition has-focus-visible:ring-4 has-focus-visible:ring-brand-200 ${checked ? "bg-[#0f766e] text-[#ffffff] shadow-md shadow-[#0f766e]/25" : "text-slate-600 hover:text-slate-900"}`} key={type.value}>
                  <input checked={checked} className="sr-only" name="card-action-card-type" onChange={() => updateCardType(type.value)} type="radio" value={type.value} />
                  {type.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <form onSubmit={searchCards}>
          <label className="mb-2 block text-sm font-bold text-slate-800" htmlFor="card-action-last-digits">
            Last three digits
          </label>

          <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white p-1.5 pl-2 transition focus-within:border-brand-700 focus-within:ring-4 focus-within:ring-brand-100">
            <span aria-hidden="true" className="shrink-0 rounded-full bg-[#e6f7f4] px-3 py-1.5 font-mono text-xs font-bold text-[#0f766e] dark:bg-[#0b2b29] dark:text-[#5eead4]">
              {prefix}
            </span>

            <input aria-describedby="card-action-last-digits-hint" autoComplete="off" className="min-h-0 w-auto min-w-0 flex-1 rounded-none border-0 bg-transparent! px-1 py-0 font-mono text-xl font-bold tracking-[0.4em] text-slate-950 shadow-none outline-none placeholder:text-slate-400 focus-visible:ring-0" disabled={submitting} id="card-action-last-digits" inputMode="numeric" maxLength={3} onChange={updateLastThreeDigits} pattern="[0-9]{3}" placeholder="000" value={lastThreeDigits} />

            <button aria-label="Search cards" className="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#0e8077] to-[#115e59] text-[#ffffff] shadow-md shadow-[#0f766e]/25 transition-colors hover:from-[#0f766e] hover:to-[#134e4a] focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60" disabled={busy} type="submit">
              {searching ? (
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <Search aria-hidden="true" className="size-5" />
              )}
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-500" id="card-action-last-digits-hint">
            Matching cards appear as you type.
          </p>
        </form>

        <ErrorNotice
          message={errorMessage}
        />

        {searchCompleted &&
        cards.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900" role="status">
            No available{" "}
            {cardType === "vip"
              ? "VIP"
              : "regular"}{" "}
            card ending in{" "}
            {lastThreeDigits} is assigned
            to this tower.
          </div>
        ) : null}

        {cards.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-bold text-slate-800">
              Select the physical card
            </legend>

            <div className="mt-2 space-y-2">
              {cards.map((card) => {
                const selected =
                  selectedCardId ===
                  card.cardId;

                return (
                  <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4 transition-colors ${selected ? "border-brand-700 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300"}`} key={card.cardId}>
                    <span className="flex items-center gap-3">
                      <input checked={selected} className="size-4 min-h-0 shrink-0 border-0 p-0 shadow-none accent-brand-800" disabled={submitting} name="visitor-card" onChange={() => setSelectedCardId(card.cardId)} type="radio" value={card.cardId} />

                      <span>
                        <span className="block font-mono font-black text-slate-950">
                          {card.cardNumber}
                        </span>

                        <span className="block text-xs font-semibold text-slate-500">
                          {card.cardType ===
                          "vip"
                            ? "VIP visitor card"
                            : "Regular visitor card"}
                        </span>
                      </span>
                    </span>

                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      Available
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {needsPrivacy ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-slate-800">
            <input checked={privacyConfirmed} className="mt-1 size-4 min-h-0 shrink-0 border-0 p-0 shadow-none accent-brand-800" disabled={submitting} onChange={(event) => setPrivacyConfirmed(event.target.checked)} type="checkbox" />
            <span>
              <span className="block font-bold text-slate-950">
                Booked meeting guest
              </span>
              Their details were sent in by the meeting organiser. I have shown the guest the privacy notice and they agree to their details being recorded.
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#99d8cf] bg-white px-6 text-sm font-bold text-[#0f766e] transition hover:bg-[#f0fdfa] focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50 dark:border-[#14756d] dark:text-[#5eead4] dark:hover:bg-[#0b2b29]" disabled={submitting} onClick={onClose} type="button">
          Cancel
        </button>

        <button className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] py-1.5 pl-5 pr-1.5 text-sm font-bold text-[#ffffff] shadow-lg shadow-[#0f766e]/25 transition-colors hover:from-[#0f766e] hover:to-[#134e4a] focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none" disabled={busy || !selectedCardId || (needsPrivacy && !privacyConfirmed)} onClick={confirmAdmission} type="button">
          {submitting ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <CreditCard aria-hidden="true" className="size-4" />
          )}

          {submitting
            ? "Confirming admission…"
            : "Assign card and admit"}

          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-[#ffffff]/20 group-disabled:bg-white">
            <ArrowUpRight className="size-4" />
          </span>
        </button>
      </div>
    </ModalShell>
  );
}

export function CheckoutVisitorModal({
  accessToken,
  onClose,
  onSuccess,
  visitor,
}) {
  const [
    submittingAction,
    setSubmittingAction,
  ] = useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  async function confirmCheckout() {
    setErrorMessage("");
    setSubmittingAction("checkout");

    try {
      const result =
        await checkoutCardVisitor({
          accessToken,
          tower: visitor.tower,
          visitId: visitor.visitId,
        });

      if (
        result?.checkout?.visitId !==
          visitor.visitId ||
        result?.checkout?.status !==
          "checked_out" ||
        !result?.checkout
          ?.checkedOutAt
      ) {
        throw new Error(
          "The visitor check-out returned an invalid response.",
        );
      }

      onSuccess(
        `${visitor.fullName} was checked out and ${visitor.cardNumber} is available again.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "Check-out could not be completed. Please try again.",
      );

      setSubmittingAction("");
    }
  }

  async function reportNotReturned() {
    setErrorMessage("");
    setSubmittingAction(
      "not-returned",
    );

    try {
      const result =
        await reportVisitorCardNotReturned({
          accessToken,
          tower: visitor.tower,
          visitId: visitor.visitId,
        });

      if (
        result?.reportedNotReturned !==
          true ||
        result?.visitId !==
          visitor.visitId ||
        !result?.incidentId ||
        result?.card?.status !==
          "not_returned"
      ) {
        throw new Error(
          "The visitor-card report returned an invalid response.",
        );
      }

      onSuccess(
        `${visitor.cardNumber} was reported as not returned and an incident was opened.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "The visitor card could not be reported as not returned.",
      );

      setSubmittingAction("");
    }
  }

  const busy =
    Boolean(submittingAction);

  return (
    <ModalShell busy={busy} description="Confirm whether the physical access card has been returned before completing the visitor's departure." icon={LogOut} onClose={onClose} title="Check out visitor">
      <div className="scroll-pane min-h-0 flex-1 space-y-5 px-5 py-5 sm:px-6">
        <VisitorSummary
          record={visitor}
        />

        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <CreditCard aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-800" />

            <div>
              <p className="font-black text-brand-950">
                {visitor.cardNumber}
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-900">
                Select “Card returned” only
                after receiving and confirming
                the physical card at reception.
              </p>
            </div>
          </div>
        </div>

        <ErrorNotice
          message={errorMessage}
        />

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />

            <div>
              <p className="font-bold text-amber-950">
                Card not returned?
              </p>

              <p className="mt-1 text-sm leading-6 text-amber-900">
                Reporting the card as not
                returned makes it unavailable
                and opens an incident for Client
                Service follow-up.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-red-300 bg-white px-5 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-200 disabled:opacity-50" disabled={busy} onClick={reportNotReturned} type="button">
          {submittingAction ===
          "not-returned" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <TriangleAlert aria-hidden="true" className="size-4" />
          )}

          Report not returned
        </button>

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>

          <button className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] px-6 text-sm font-bold text-[#ffffff] shadow-lg shadow-[#0f766e]/25 transition-colors hover:from-[#0f766e] hover:to-[#134e4a] focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy} onClick={confirmCheckout} type="button">
            {submittingAction ===
            "checkout" ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CircleCheck aria-hidden="true" className="size-4" />
            )}

            Card returned
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function formatIncidentValue(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

export function IncidentManagementModal({
  accessToken,
  incident,
  onClose,
  onSuccess,
}) {
  const [notes, setNotes] =
    useState("");

  const [resolution, setResolution] =
    useState("late_return");

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const mode =
    incident.canStartInvestigation ===
      true
      ? "start"
      : incident.canResolve === true
        ? "resolve"
        : incident.canReprint === true
          ? "reprint"
          : "view";

  const maximumNotesLength =
    mode === "reprint"
      ? 1_000
      : 2_000;

  const title = {
    reprint: "Register replacement card",
    resolve: "Resolve card incident",
    start: "Start card investigation",
    view: "Visitor-card incident",
  }[mode];

  const description = {
    reprint:
      "Register the approved replacement after the old visitor card has been permanently deactivated.",
    resolve:
      "Record the confirmed outcome of the card investigation.",
    start:
      "Assign this incident to yourself and record the initial investigation notes.",
    view:
      "Review the completed visitor-card incident and its recorded outcome.",
  }[mode];

  const primaryLabel = {
    reprint: "Register replacement",
    resolve: "Resolve incident",
    start: "Start investigation",
  }[mode];

  async function submitIncidentAction() {
    const normalizedNotes =
      notes.trim();

    setErrorMessage("");

    if (
      normalizedNotes.length < 5
    ) {
      setErrorMessage(
        "Enter notes containing at least 5 characters.",
      );

      return;
    }

    if (
      normalizedNotes.length >
      maximumNotesLength
    ) {
      setErrorMessage(
        `Notes cannot exceed ${maximumNotesLength.toLocaleString()} characters.`,
      );

      return;
    }

    setSubmitting(true);

    try {
      if (mode === "start") {
        const result =
          await startVisitorCardIncidentInvestigation({
            accessToken,
            incidentId:
              incident.incidentId,
            notes: normalizedNotes,
            tower: incident.tower,
          });

        if (
          result?.investigationStarted !==
            true ||
          result?.incidentId !==
            incident.incidentId ||
          !result?.assignedTo ||
          !result?.startedAt
        ) {
          throw new Error(
            "The investigation returned an invalid response.",
          );
        }

        onSuccess(
          `Investigation started for ${incident.cardNumber}.`,
        );

        return;
      }

      if (mode === "resolve") {
        const result =
          await resolveVisitorCardIncident({
            accessToken,
            incidentId:
              incident.incidentId,
            notes: normalizedNotes,
            resolution,
            tower: incident.tower,
          });

        if (
          result?.incidentResolved !==
            true ||
          result?.incidentId !==
            incident.incidentId ||
          result?.resolution !==
            resolution ||
          !result?.resolvedAt
        ) {
          throw new Error(
            "The incident resolution returned an invalid response.",
          );
        }

        const resolutionLabel =
          formatIncidentValue(
            resolution,
          ).toLowerCase();

        onSuccess(
          `${incident.cardNumber} was resolved as ${resolutionLabel}.`,
        );

        return;
      }

      if (mode === "reprint") {
        const result =
          await reprintDeactivatedVisitorCard({
            accessToken,
            cardId: incident.cardId,
            notes: normalizedNotes,
            tower: incident.tower,
          });

        if (
          result?.replacementRegistered !==
            true ||
          !result?.replacementCard
            ?.cardId ||
          !result?.replacementCard
            ?.cardNumber ||
          result?.replacementCard
            ?.status !== "available"
        ) {
          throw new Error(
            "The replacement-card registration returned an invalid response.",
          );
        }

        onSuccess(
          `${result.replacementCard.cardNumber} was registered as the replacement for ${incident.cardNumber}.`,
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "The visitor-card incident action could not be completed.",
      );

      setSubmitting(false);
    }
  }

  return (
    <ModalShell busy={submitting} description={description} icon={ShieldAlert} onClose={onClose} title={title} tone="warning">
      <div className="scroll-pane min-h-0 flex-1 space-y-5 px-5 py-5 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
                Visitor
              </p>

              <p className="mt-1 font-bold text-slate-950">
                {incident.fullName}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {incident.referenceCode}
              </p>
            </div>

            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
                Visitor card
              </p>

              <p className="mt-1 font-black text-brand-800">
                {incident.cardNumber}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {incident.tower ===
                "tower_1"
                  ? "Tower 1"
                  : "Tower 2"}
              </p>
            </div>

            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
                Incident status
              </p>

              <p className="mt-1 font-semibold text-slate-800">
                {formatIncidentValue(
                  incident.incidentStatus,
                )}
              </p>
            </div>

            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
                Assigned officer
              </p>

              <p className="mt-1 font-semibold text-slate-800">
                {incident.assignedOfficer
                  ?.fullName ||
                  "Not assigned"}
              </p>
            </div>
          </div>
        </div>

        {incident.investigationNotes ? (
          <div>
            <p className="text-sm font-bold text-slate-800">
              Investigation notes
            </p>

            <p className="mt-2 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
              {incident.investigationNotes}
            </p>
          </div>
        ) : null}

        {incident.resolution ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-emerald-700">
              Recorded resolution
            </p>

            <p className="mt-1 font-black text-emerald-950">
              {formatIncidentValue(
                incident.resolution,
              )}
            </p>

            {incident.resolutionNotes ? (
              <p className="mt-2 text-sm leading-6 text-emerald-900">
                {incident.resolutionNotes}
              </p>
            ) : null}
          </div>
        ) : null}

        {incident.replacementCard ? (
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <CreditCard aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-blue-700" />

            <div>
              <p className="font-black text-blue-950">
                Replacement registered
              </p>

              <p className="mt-1 text-sm font-semibold text-blue-800">
                {
                  incident
                    .replacementCard
                    .cardNumber
                }
              </p>
            </div>
          </div>
        ) : null}

        {mode === "resolve" ? (
          <div>
            <AppSelect
              disabled={submitting}
              id="card-action-investigation-outcome"
              label="Investigation outcome"
              labelClassName="mb-1.5 block text-sm font-bold text-slate-800"
              onChange={setResolution}
              options={[
                { label: "Card returned late", value: "late_return" },
                { label: "Card lost", value: "lost" },
                { label: "Card damaged", value: "damaged" },
                { label: "Card unusable", value: "unusable" },
              ]}
              size="2xl"
              value={resolution}
            />

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Lost, damaged and unusable
              cards are permanently deactivated.
              A replacement can then be
              registered.
            </p>
          </div>
        ) : null}

        {mode !== "view" ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              {mode === "reprint"
                ? "Replacement notes"
                : mode === "resolve"
                  ? "Resolution notes"
                  : "Investigation notes"}
            </span>

            <textarea className="min-h-32 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand-700 focus:ring-2 focus:ring-brand-100" disabled={submitting} maxLength={maximumNotesLength} onChange={(event) => setNotes(event.target.value)} placeholder={mode === "reprint" ? "Record the approval or reason for registering the replacement card." : "Record the investigation details and action taken."} value={notes} />

            <p className="mt-1 text-right text-xs text-slate-500">
              {notes.length}/
              {maximumNotesLength.toLocaleString()}
            </p>
          </label>
        ) : null}

        {mode === "reprint" ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />

            <p className="text-sm leading-6 text-amber-900">
              The old card remains permanently
              deactivated. The replacement is
              registered with the next suffix,
              such as -R1 or -R2.
            </p>
          </div>
        ) : null}

        <ErrorNotice
          message={errorMessage}
        />
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50" disabled={submitting} onClick={onClose} type="button">
          {mode === "view"
            ? "Close"
            : "Cancel"}
        </button>

        {mode !== "view" ? (
          <button className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-linear-to-r from-[#0e8077] to-[#115e59] px-6 text-sm font-bold text-[#ffffff] shadow-lg shadow-[#0f766e]/25 transition-colors hover:from-[#0f766e] hover:to-[#134e4a] focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} onClick={submitIncidentAction} type="button">
            {submitting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : mode === "reprint" ? (
              <RefreshCw aria-hidden="true" className="size-4" />
            ) : (
              <ShieldAlert aria-hidden="true" className="size-4" />
            )}

            {submitting
              ? "Saving…"
              : primaryLabel}
          </button>
        ) : null}
      </div>
    </ModalShell>
  );
}
