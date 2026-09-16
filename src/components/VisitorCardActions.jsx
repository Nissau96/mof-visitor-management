import {
  CircleCheck,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import {
  admitVisitorWithCard,
  checkoutCardVisitor,
  getAvailableVisitorCards,
  reprintDeactivatedVisitorCard,
  reportVisitorCardNotReturned,
  resolveVisitorCardIncident,
  startVisitorCardIncidentInvestigation,
} from "../lib/visitorCardApi.js";

function ModalShell({
  busy = false,
  children,
  description,
  onClose,
  title,
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
      <section aria-describedby="visitor-card-dialog-description" aria-labelledby="visitor-card-dialog-title" aria-modal="true" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl" role="dialog">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-xl font-black text-slate-950" id="visitor-card-dialog-title">
              {title}
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-600" id="visitor-card-dialog-description">
              {description}
            </p>
          </div>

          <button aria-label="Close dialog" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50" disabled={busy} onClick={onClose} type="button">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

function VisitorSummary({
  record,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
            Visitor
          </p>

          <p className="mt-1 font-bold text-slate-950">
            {record.fullName}
          </p>
        </div>

        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
            Reference
          </p>

          <p className="mt-1 font-bold text-brand-800">
            {record.referenceCode}
          </p>
        </div>

        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
            Destination
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-800">
            {record.destinationDivision ||
              record.destinationAgency ||
              "Not provided"}
          </p>
        </div>

        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
            Tower
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-800">
            {record.tower === "tower_1"
              ? "Tower 1"
              : "Tower 2"}
          </p>
        </div>
      </div>
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

  const [searching, setSearching] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [searchCompleted, setSearchCompleted] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  function updateCardType(event) {
    setCardType(event.target.value);
    setCards([]);
    setSelectedCardId("");
    setSearchCompleted(false);
    setErrorMessage("");
  }

  function updateLastThreeDigits(event) {
    const digits = event.target.value
      .replace(/\D/g, "")
      .slice(0, 3);

    setLastThreeDigits(digits);
    setCards([]);
    setSelectedCardId("");
    setSearchCompleted(false);
    setErrorMessage("");
  }

  async function searchCards(event) {
    event.preventDefault();

    setErrorMessage("");
    setCards([]);
    setSelectedCardId("");
    setSearchCompleted(false);

    if (
      !/^\d{3}$/.test(
        lastThreeDigits,
      ) ||
      lastThreeDigits === "000"
    ) {
      setErrorMessage(
        "Enter exactly the final three digits from 001 to 999.",
      );

      return;
    }

    setSearching(true);

    try {
      const result =
        await getAvailableVisitorCards({
          accessToken,
          cardType,
          lastThreeDigits,
          tower: visitor.tower,
        });

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
      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "Available visitor cards could not be searched. Please try again.",
      );
    } finally {
      setSearching(false);
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

  const busy =
    searching || submitting;

  return (
    <ModalShell busy={busy} description="Search using the final three digits printed on the physical card, then confirm the card being issued." onClose={onClose} title="Assign visitor card">
      <div className="space-y-5 px-5 py-5 sm:px-6">
        <VisitorSummary
          record={visitor}
        />

        <form className="space-y-4" onSubmit={searchCards}>
          <div className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-800">
                Card type
              </span>

              <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100" disabled={busy} onChange={updateCardType} value={cardType}>
                <option value="regular">
                  Regular visitor
                </option>

                <option value="vip">
                  VIP visitor
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-800">
                Last three digits
              </span>

              <div className="flex gap-2">
                <input autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base font-bold tracking-[0.18em] text-slate-950 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-brand-700 focus:ring-2 focus:ring-brand-100" disabled={busy} inputMode="numeric" maxLength={3} onChange={updateLastThreeDigits} pattern="[0-9]{3}" placeholder="e.g. 168" value={lastThreeDigits} />

                <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-4 text-sm font-bold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy} type="submit">
                  {searching ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Search aria-hidden="true" className="size-4" />
                  )}

                  Search
                </button>
              </div>
            </label>
          </div>
        </form>

        <ErrorNotice
          message={errorMessage}
        />

        {searchCompleted &&
        cards.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
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
                  <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${selected ? "border-brand-700 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300"}`} key={card.cardId}>
                    <span className="flex items-center gap-3">
                      <input checked={selected} className="size-4 accent-brand-800" disabled={submitting} name="visitor-card" onChange={() => setSelectedCardId(card.cardId)} type="radio" value={card.cardId} />

                      <span>
                        <span className="block font-black text-slate-950">
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
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={onClose} type="button">
          Cancel
        </button>

        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 text-sm font-bold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !selectedCardId} onClick={confirmAdmission} type="button">
          {submitting ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <CreditCard aria-hidden="true" className="size-4" />
          )}

          {submitting
            ? "Confirming admission…"
            : "Assign card and admit"}
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
    <ModalShell busy={busy} description="Confirm whether the physical access card has been returned before completing the visitor's departure." onClose={onClose} title="Check out visitor">
      <div className="space-y-5 px-5 py-5 sm:px-6">
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

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={busy} onClick={reportNotReturned} type="button">
          {submittingAction ===
          "not-returned" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <TriangleAlert aria-hidden="true" className="size-4" />
          )}

          Report not returned
        </button>

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>

          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={busy} onClick={confirmCheckout} type="button">
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
    <ModalShell busy={submitting} description={description} onClose={onClose} title={title}>
      <div className="space-y-5 px-5 py-5 sm:px-6">
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
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              Investigation outcome
            </span>

            <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100" disabled={submitting} onChange={(event) => setResolution(event.target.value)} value={resolution}>
              <option value="late_return">
                Card returned late
              </option>

              <option value="lost">
                Card lost
              </option>

              <option value="damaged">
                Card damaged
              </option>

              <option value="unusable">
                Card unusable
              </option>
            </select>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Lost, damaged and unusable
              cards are permanently deactivated.
              A replacement can then be
              registered.
            </p>
          </label>
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

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50" disabled={submitting} onClick={onClose} type="button">
          {mode === "view"
            ? "Close"
            : "Cancel"}
        </button>

        {mode !== "view" ? (
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 text-sm font-bold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting} onClick={submitIncidentAction} type="button">
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
