import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import ErrorMessage from "../components/ErrorMessage.jsx";
import LoadingState from "../components/LoadingState.jsx";
import useAuth from "../hooks/useAuth.js";
import { ApiError } from "../lib/api.js";
import {
  assignAdminVisitorCardTower,
  createAdminVisitorCards,
  getAdminVisitorCardInventory,
} from "../lib/visitorCardApi.js";
import {
  adminVisitorCardCreationSchema,
  adminVisitorCardInventorySchema,
  adminVisitorCardTowerSchema,
} from "../validation/visitorCards.js";

const PAGE_SIZE = 10;

const EMPTY_FILTERS = {
  cardType: "all",
  search: "",
  status: "all",
  tower: "all",
};

const inputClassName =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-700 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";

const dateTimeFormatter =
  new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  });

function formatDateTime(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return dateTimeFormatter.format(date);
}

function formatTower(value) {
  return value === "tower_1"
    ? "Tower 1"
    : value === "tower_2"
      ? "Tower 2"
      : "Unknown tower";
}

function formatCardType(value) {
  return value === "vip"
    ? "VIP"
    : "Regular";
}

function formatStatus(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getStatusClassName(status) {
  const styles = {
    assigned:
      "border-blue-200 bg-blue-50 text-blue-800",
    available:
      "border-emerald-200 bg-emerald-50 text-emerald-800",
    deactivated:
      "border-slate-300 bg-slate-100 text-slate-700",
    investigating:
      "border-violet-200 bg-violet-50 text-violet-800",
    not_returned:
      "border-red-200 bg-red-50 text-red-800",
  };

  return (
    styles[status] ||
    "border-slate-300 bg-slate-100 text-slate-700"
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClassName(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

function normalizeNonNegativeInteger(
  value,
  label,
) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    throw new Error(
      `Visitor-card inventory returned an invalid ${label}.`,
    );
  }

  return number;
}

function normalizeInventory(result) {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !Array.isArray(result.cards) ||
    !result.pagination ||
    typeof result.pagination !==
      "object" ||
    !result.summary ||
    typeof result.summary !==
      "object"
  ) {
    throw new Error(
      "Visitor-card inventory returned an invalid response.",
    );
  }

  const pagination = {
    page: normalizeNonNegativeInteger(
      result.pagination.page,
      "page",
    ),
    pageSize:
      normalizeNonNegativeInteger(
        result.pagination.pageSize,
        "page size",
      ),
    totalCount:
      normalizeNonNegativeInteger(
        result.pagination.totalCount,
        "total count",
      ),
    totalPages:
      normalizeNonNegativeInteger(
        result.pagination.totalPages,
        "total pages",
      ),
  };

  const summary = {
    assignedCount:
      normalizeNonNegativeInteger(
        result.summary.assignedCount,
        "assigned count",
      ),
    availableCount:
      normalizeNonNegativeInteger(
        result.summary.availableCount,
        "available count",
      ),
    deactivatedCount:
      normalizeNonNegativeInteger(
        result.summary.deactivatedCount,
        "deactivated count",
      ),
    investigatingCount:
      normalizeNonNegativeInteger(
        result.summary
          .investigatingCount,
        "investigating count",
      ),
    notReturnedCount:
      normalizeNonNegativeInteger(
        result.summary
          .notReturnedCount,
        "not-returned count",
      ),
    regularCount:
      normalizeNonNegativeInteger(
        result.summary.regularCount,
        "regular count",
      ),
    tower1Count:
      normalizeNonNegativeInteger(
        result.summary.tower1Count,
        "Tower 1 count",
      ),
    tower2Count:
      normalizeNonNegativeInteger(
        result.summary.tower2Count,
        "Tower 2 count",
      ),
    vipCount:
      normalizeNonNegativeInteger(
        result.summary.vipCount,
        "VIP count",
      ),
  };

  const validCards =
    result.cards.every((card) => {
      if (
        !card ||
        typeof card !== "object" ||
        typeof card.cardId !==
          "string" ||
        typeof card.cardNumber !==
          "string" ||
        ![
          "regular",
          "vip",
        ].includes(card.cardType) ||
        ![
          "tower_1",
          "tower_2",
        ].includes(card.tower) ||
        ![
          "available",
          "assigned",
          "not_returned",
          "investigating",
          "deactivated",
        ].includes(card.status) ||
        !Number.isInteger(
          Number(card.baseNumber),
        ) ||
        !Number.isInteger(
          Number(
            card.replacementSequence,
          ),
        ) ||
        typeof card.canChangeTower !==
          "boolean"
      ) {
        return false;
      }

      if (
        card.activeAssignment !==
          null &&
        card.activeAssignment !==
          undefined &&
        (typeof card.activeAssignment !==
          "object" ||
          !card.activeAssignment
            .assignmentId ||
          !card.activeAssignment.visitId ||
          !card.activeAssignment
            .referenceCode ||
          !card.activeAssignment.fullName)
      ) {
        return false;
      }

      if (
        card.activeIncident !== null &&
        card.activeIncident !==
          undefined &&
        (typeof card.activeIncident !==
          "object" ||
          !card.activeIncident
            .incidentId ||
          !card.activeIncident.status)
      ) {
        return false;
      }

      return true;
    });

  if (
    !validCards ||
    pagination.page < 1 ||
    pagination.pageSize < 1
  ) {
    throw new Error(
      "Visitor-card inventory returned an invalid response.",
    );
  }

  return {
    cards: result.cards,
    pagination,
    summary,
  };
}

function getVisiblePages(
  currentPage,
  totalPages,
) {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= 5) {
    return Array.from(
      {
        length: totalPages,
      },
      (_, index) => index + 1,
    );
  }

  const start = Math.min(
    Math.max(currentPage - 2, 1),
    totalPages - 4,
  );

  return Array.from(
    {
      length: 5,
    },
    (_, index) => start + index,
  );
}

function sameFilters(first, second) {
  return (
    first.cardType === second.cardType &&
    first.search === second.search &&
    first.status === second.status &&
    first.tower === second.tower
  );
}

function SummaryCard({
  description,
  label,
  value,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-600">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
        {value.toLocaleString()}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </article>
  );
}

function CardLineage({ card }) {
  if (
    !card.replacesCardNumber &&
    !card.replacementCardNumber
  ) {
    return (
      <span className="text-xs text-slate-500">
        Original card
      </span>
    );
  }

  return (
    <div className="space-y-1 text-xs text-slate-500">
      {card.replacesCardNumber ? (
        <p>
          Replaces{" "}
          <span className="font-bold text-slate-700">
            {card.replacesCardNumber}
          </span>
        </p>
      ) : null}

      {card.replacementCardNumber ? (
        <p>
          Replaced by{" "}
          <span className="font-bold text-slate-700">
            {card.replacementCardNumber}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function AssignmentDetails({ assignment }) {
  if (!assignment) {
    return (
      <span className="text-sm text-slate-500">
        No active assignment
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <UserRound aria-hidden="true" className="size-4 text-slate-500" />

        <p className="font-bold text-slate-900">
          {assignment.fullName}
        </p>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {assignment.referenceCode}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        Due{" "}
        {formatDateTime(
          assignment.returnDueAt,
        )}
      </p>
    </div>
  );
}

function IncidentDetails({ incident }) {
  if (!incident) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />

        <div>
          <p className="text-xs font-black uppercase tracking-[0.08em] text-amber-800">
            Active incident
          </p>

          <p className="mt-1 text-sm font-semibold text-amber-950">
            {formatStatus(
              incident.status,
            )}
          </p>

          <p className="mt-1 text-xs text-amber-800">
            Opened{" "}
            {formatDateTime(
              incident.openedAt,
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function InventoryCard({
  card,
  onChangeTower,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-black text-brand-900">
            {card.cardNumber}
          </p>

          <p className="mt-1 text-sm text-slate-600">
            {formatCardType(
              card.cardType,
            )}{" "}
            visitor card
          </p>
        </div>

        <StatusBadge
          status={card.status}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-y border-slate-200 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
            Tower
          </p>

          <p className="mt-1 font-semibold text-slate-900">
            {formatTower(card.tower)}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
            Sequence
          </p>

          <p className="mt-1 font-semibold text-slate-900">
            {card.replacementSequence >
            0
              ? `R${card.replacementSequence}`
              : "Original"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <CardLineage card={card} />
      </div>

      <div className="mt-4">
        <AssignmentDetails
          assignment={
            card.activeAssignment
          }
        />
      </div>

      <IncidentDetails
        incident={card.activeIncident}
      />

      {card.status ===
      "deactivated" ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-bold">
            {formatStatus(
              card.deactivationReason,
            ) || "Deactivated"}
          </p>

          {card.deactivationNotes ? (
            <p className="mt-1 text-xs leading-5">
              {card.deactivationNotes}
            </p>
          ) : null}
        </div>
      ) : null}

      <button className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!card.canChangeTower} onClick={() => onChangeTower(card)} type="button">
        <ArrowRightLeft aria-hidden="true" className="size-4" />
        {card.canChangeTower
          ? "Change tower"
          : "Tower locked"}
      </button>
    </article>
  );
}

function InventoryRow({
  card,
  onChangeTower,
}) {
  return (
    <tr>
      <td className="px-6 py-5 align-top">
        <p className="font-black text-brand-900">
          {card.cardNumber}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Base{" "}
          {String(
            card.baseNumber,
          ).padStart(3, "0")}
        </p>

        <div className="mt-2">
          <CardLineage card={card} />
        </div>
      </td>

      <td className="px-6 py-5 align-top">
        <p className="font-semibold text-slate-900">
          {formatCardType(
            card.cardType,
          )}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {card.replacementSequence >
          0
            ? `Replacement R${card.replacementSequence}`
            : "Original card"}
        </p>
      </td>

      <td className="px-6 py-5 align-top">
        <p className="font-semibold text-slate-900">
          {formatTower(card.tower)}
        </p>
      </td>

      <td className="px-6 py-5 align-top">
        <StatusBadge
          status={card.status}
        />

        <IncidentDetails
          incident={
            card.activeIncident
          }
        />
      </td>

      <td className="px-6 py-5 align-top">
        <AssignmentDetails
          assignment={
            card.activeAssignment
          }
        />
      </td>

      <td className="px-6 py-5 text-right align-top">
        <button aria-label={`Change tower for ${card.cardNumber}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!card.canChangeTower} onClick={() => onChangeTower(card)} title={card.canChangeTower ? "Change issuing tower" : "Only available cards can change tower"} type="button">
          <ArrowRightLeft aria-hidden="true" className="size-4" />
          <span className="hidden xl:inline">
            Change tower
          </span>
        </button>
      </td>
    </tr>
  );
}

function ModalShell({
  busy,
  children,
  description,
  onClose,
  title,
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
        <section aria-describedby="visitor-card-modal-description" aria-labelledby="visitor-card-modal-title" aria-modal="true" className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl" role="dialog">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-xl font-black text-slate-950" id="visitor-card-modal-title">
                {title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600" id="visitor-card-modal-description">
                {description}
              </p>
            </div>

            <button aria-label="Close dialog" className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50" disabled={busy} onClick={onClose} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          </header>

          {children}
        </section>
      </div>
    </div>
  );
}

function CreateCardsModal({
  accessToken,
  onClose,
  onSuccess,
}) {
  const [cardType, setCardType] =
    useState("regular");

  const [startNumber, setStartNumber] =
    useState("");

  const [endNumber, setEndNumber] =
    useState("");

  const [tower, setTower] =
    useState("tower_2");

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function submitCards(event) {
    event.preventDefault();
    setErrorMessage("");

    const parsed =
      adminVisitorCardCreationSchema.safeParse(
        {
          cardType,
          endNumber,
          startNumber,
          tower,
        },
      );

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ||
          "Check the visitor-card range and try again.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const result =
        await createAdminVisitorCards({
          accessToken,
          cardType:
            parsed.data.cardType,
          endNumber:
            parsed.data.endNumber,
          startNumber:
            parsed.data.startNumber,
          tower: parsed.data.tower,
        });

      if (
        result?.cardsCreated !==
          true ||
        !Number.isInteger(
          result.cardCount,
        ) ||
        result.cardCount < 1 ||
        !Array.isArray(result.cards)
      ) {
        throw new Error(
          "Visitor-card creation returned an invalid response.",
        );
      }

      onSuccess(
        `${result.cardCount.toLocaleString()} ${formatCardType(result.cardType)} ${result.cardCount === 1 ? "card was" : "cards were"} added to ${formatTower(result.tower)}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "Visitor cards could not be added.",
      );

      setSubmitting(false);
    }
  }

  return (
    <ModalShell busy={submitting} description="Add a controlled range of regular or VIP visitor cards and select the tower that will issue them." onClose={onClose} title="Add visitor cards">
      <form noValidate onSubmit={submitCards}>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              Card type
            </span>

            <select className={inputClassName} disabled={submitting} onChange={(event) => setCardType(event.target.value)} value={cardType}>
              <option value="regular">
                Regular visitor card
              </option>

              <option value="vip">
                VIP visitor card
              </option>
            </select>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-800">
                Starting number
              </span>

              <input className={inputClassName} disabled={submitting} inputMode="numeric" max="999" min="1" onChange={(event) => setStartNumber(event.target.value)} placeholder="e.g. 300" type="number" value={startNumber} />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-800">
                Ending number
              </span>

              <input className={inputClassName} disabled={submitting} inputMode="numeric" max="999" min="1" onChange={(event) => setEndNumber(event.target.value)} placeholder="e.g. 320" type="number" value={endNumber} />
            </label>
          </div>

          <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            Numbers must be between 001 and
            999. A maximum of 100 cards can
            be added in one request.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              Issuing tower
            </span>

            <select className={inputClassName} disabled={submitting} onChange={(event) => setTower(event.target.value)} value={tower}>
              <option value="tower_1">
                Tower 1
              </option>

              <option value="tower_2">
                Tower 2
              </option>
            </select>
          </label>

          {errorMessage ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50" disabled={submitting} onClick={onClose} type="button">
            Cancel
          </button>

          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 text-sm font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting} type="submit">
            {submitting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CirclePlus aria-hidden="true" className="size-4" />
            )}

            {submitting
              ? "Adding cards…"
              : "Add cards"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ChangeTowerModal({
  accessToken,
  card,
  onClose,
  onSuccess,
}) {
  const [tower, setTower] =
    useState(card.tower);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function submitTower(event) {
    event.preventDefault();
    setErrorMessage("");

    const parsed =
      adminVisitorCardTowerSchema.safeParse(
        {
          cardId: card.cardId,
          tower,
        },
      );

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ||
          "Select a valid tower.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const result =
        await assignAdminVisitorCardTower({
          accessToken,
          cardId: parsed.data.cardId,
          tower: parsed.data.tower,
        });

      if (
        result?.towerAssigned !==
          true ||
        result?.cardId !==
          card.cardId ||
        !result?.cardNumber ||
        !result?.tower
      ) {
        throw new Error(
          "Tower assignment returned an invalid response.",
        );
      }

      onSuccess(
        result.alreadyAssigned
          ? `${result.cardNumber} is already assigned to ${formatTower(result.tower)}.`
          : `${result.cardNumber} was moved from ${formatTower(result.previousTower)} to ${formatTower(result.tower)}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error &&
          error.message
          ? error.message
          : "The visitor-card tower could not be updated.",
      );

      setSubmitting(false);
    }
  }

  return (
    <ModalShell busy={submitting} description="Only an available card without an unresolved assignment can be issued from another tower." onClose={onClose} title="Change issuing tower">
      <form noValidate onSubmit={submitTower}>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
              Visitor card
            </p>

            <p className="mt-1 text-lg font-black text-brand-900">
              {card.cardNumber}
            </p>

            <p className="mt-1 text-sm text-slate-600">
              Currently issued from{" "}
              {formatTower(card.tower)}
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              New issuing tower
            </span>

            <select className={inputClassName} disabled={submitting} onChange={(event) => setTower(event.target.value)} value={tower}>
              <option value="tower_1">
                Tower 1
              </option>

              <option value="tower_2">
                Tower 2
              </option>
            </select>
          </label>

          {errorMessage ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50" disabled={submitting} onClick={onClose} type="button">
            Cancel
          </button>

          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 text-sm font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting} type="submit">
            {submitting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ArrowRightLeft aria-hidden="true" className="size-4" />
            )}

            {submitting
              ? "Updating…"
              : "Update tower"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function Pagination({
  currentPage,
  goToPage,
  totalPages,
}) {
  const visiblePages =
    getVisiblePages(
      currentPage,
      totalPages,
    );

  return (
    <nav aria-label="Visitor-card inventory pages" className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 px-4 py-5">
      <button aria-label="Previous page" className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} type="button">
        <ChevronLeft aria-hidden="true" className="size-5" />
      </button>

      {visiblePages.map(
        (pageNumber) => (
          <button aria-current={pageNumber === currentPage ? "page" : undefined} className={`grid size-11 place-items-center rounded-xl border text-sm font-black ${pageNumber === currentPage ? "border-brand-800 bg-brand-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`} key={pageNumber} onClick={() => goToPage(pageNumber)} type="button">
            {pageNumber}
          </button>
        ),
      )}

      <button aria-label="Next page" className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)} type="button">
        <ChevronRight aria-hidden="true" className="size-5" />
      </button>
    </nav>
  );
}

export default function AdminVisitorCardsPage() {
  const { session, signOut } = useAuth();

  const [inventory, setInventory] =
    useState(null);

  const [requestStatus, setRequestStatus] =
    useState("loading");

  const [requestError, setRequestError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [filters, setFilters] =
    useState(EMPTY_FILTERS);

  const [searchDraft, setSearchDraft] =
    useState("");

  const [cardTypeDraft, setCardTypeDraft] =
    useState("all");

  const [towerDraft, setTowerDraft] =
    useState("all");

  const [statusDraft, setStatusDraft] =
    useState("all");

  const [filterError, setFilterError] =
    useState("");

  const [page, setPage] =
    useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [action, setAction] =
    useState(null);

  const accessToken =
    session?.access_token || "";

  useEffect(() => {
    const controller =
      new AbortController();

    getAdminVisitorCardInventory({
      accessToken,
      cardType: filters.cardType,
      page,
      pageSize: PAGE_SIZE,
      search: filters.search,
      signal: controller.signal,
      status: filters.status,
      tower: filters.tower,
    })
      .then((result) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setInventory(
          normalizeInventory(result),
        );

        setRequestError("");
        setRequestStatus("ready");
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        if (
          error instanceof ApiError &&
          (error.status === 401 ||
            error.status === 403)
        ) {
          void signOut().catch(
            () => undefined,
          );
          return;
        }

        setRequestError(
          error instanceof Error &&
            error.message
            ? error.message
            : "Visitor-card inventory could not be loaded.",
        );

        setRequestStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [
    accessToken,
    filters,
    page,
    refreshKey,
    signOut,
  ]);

  function beginLoading() {
    setInventory(null);
    setRequestError("");
    setRequestStatus("loading");
  }

  function submitFilters(event) {
    event.preventDefault();
    setFilterError("");

    const parsed =
      adminVisitorCardInventorySchema.safeParse(
        {
          cardType: cardTypeDraft,
          page: 1,
          pageSize: PAGE_SIZE,
          search: searchDraft,
          status: statusDraft,
          tower: towerDraft,
        },
      );

    if (!parsed.success) {
      setFilterError(
        parsed.error.issues[0]?.message ||
          "Check the inventory filters and try again.",
      );
      return;
    }

    const nextFilters = {
      cardType:
        parsed.data.cardType,
      search: parsed.data.search,
      status: parsed.data.status,
      tower: parsed.data.tower,
    };

    const unchanged =
      page === 1 &&
      sameFilters(
        filters,
        nextFilters,
      );

    beginLoading();
    setPage(1);
    setFilters(nextFilters);

    if (unchanged) {
      setRefreshKey(
        (currentKey) =>
          currentKey + 1,
      );
    }
  }

  function clearFilters() {
    setSearchDraft("");
    setCardTypeDraft("all");
    setTowerDraft("all");
    setStatusDraft("all");
    setFilterError("");
    setFilters(EMPTY_FILTERS);
    beginLoading();
    setPage(1);
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  function refreshInventory() {
    beginLoading();
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  function goToPage(nextPage) {
    const totalPages =
      inventory?.pagination
        .totalPages || 0;

    if (
      nextPage < 1 ||
      nextPage > totalPages ||
      nextPage === page
    ) {
      return;
    }

    beginLoading();
    setPage(nextPage);

    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
  }

  function openCreateCards() {
    setSuccessMessage("");
    setAction({
      type: "create",
    });
  }

  function openTowerChange(card) {
    if (!card.canChangeTower) {
      return;
    }

    setSuccessMessage("");
    setAction({
      card,
      type: "tower",
    });
  }

  function closeAction() {
    setAction(null);
  }

  function completeAction(message) {
    setAction(null);
    setSuccessMessage(message);
    beginLoading();
    setPage(1);
    setRefreshKey(
      (currentKey) =>
        currentKey + 1,
    );
  }

  const loading =
    requestStatus === "loading";

  const filtersApplied = Boolean(
    filters.search ||
      filters.cardType !== "all" ||
      filters.tower !== "all" ||
      filters.status !== "all",
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-800">
            Administration
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Visitor-card inventory
          </h1>

          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            Manage regular and VIP visitor
            cards, review their current
            assignment state, and control
            the tower from which available
            cards are issued.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={refreshInventory} type="button">
            <RefreshCw aria-hidden="true" className={`size-5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900" onClick={openCreateCards} type="button">
            <CirclePlus aria-hidden="true" className="size-5" />
            Add cards
          </button>
        </div>
      </header>

      {successMessage ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900" role="status">
          <p className="flex-1">
            {successMessage}
          </p>

          <button aria-label="Dismiss confirmation" className="grid size-9 shrink-0 place-items-center rounded-lg text-emerald-800 hover:bg-emerald-100" onClick={() => setSuccessMessage("")} type="button">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}

      {inventory ? (
        <section aria-label="Visitor-card inventory summary" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard description={`${inventory.summary.regularCount.toLocaleString()} regular and ${inventory.summary.vipCount.toLocaleString()} VIP cards`} label="Total inventory" value={inventory.summary.regularCount + inventory.summary.vipCount} />

          <SummaryCard description={`${inventory.summary.assignedCount.toLocaleString()} currently assigned`} label="Available cards" value={inventory.summary.availableCount} />

          <SummaryCard description={`${inventory.summary.tower1Count.toLocaleString()} in Tower 1 and ${inventory.summary.tower2Count.toLocaleString()} in Tower 2`} label="Tower allocation" value={inventory.summary.tower1Count + inventory.summary.tower2Count} />

          <SummaryCard description={`${inventory.summary.investigatingCount.toLocaleString()} investigating and ${inventory.summary.deactivatedCount.toLocaleString()} deactivated`} label="Not returned" value={inventory.summary.notReturnedCount} />
        </section>
      ) : null}

      <section aria-labelledby="card-inventory-filters-heading" className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3">
          <Search aria-hidden="true" className="size-5 text-brand-800" />

          <h2 className="text-xl font-black text-slate-950" id="card-inventory-filters-heading">
            Search and filter
          </h2>
        </div>

        <form className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-[1.4fr_0.75fr_0.75fr_0.9fr_auto]" noValidate onSubmit={submitFilters}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              Card or visitor
            </span>

            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />

              <input autoComplete="off" className={`${inputClassName} pl-12`} maxLength="120" onChange={(event) => setSearchDraft(event.target.value)} placeholder="Card, visitor or reference" type="search" value={searchDraft} />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              Card type
            </span>

            <select className={inputClassName} onChange={(event) => setCardTypeDraft(event.target.value)} value={cardTypeDraft}>
              <option value="all">
                All types
              </option>

              <option value="regular">
                Regular
              </option>

              <option value="vip">
                VIP
              </option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              Tower
            </span>

            <select className={inputClassName} onChange={(event) => setTowerDraft(event.target.value)} value={towerDraft}>
              <option value="all">
                All towers
              </option>

              <option value="tower_1">
                Tower 1
              </option>

              <option value="tower_2">
                Tower 2
              </option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-800">
              Status
            </span>

            <select className={inputClassName} onChange={(event) => setStatusDraft(event.target.value)} value={statusDraft}>
              <option value="all">
                All statuses
              </option>

              <option value="available">
                Available
              </option>

              <option value="assigned">
                Assigned
              </option>

              <option value="not_returned">
                Not returned
              </option>

              <option value="investigating">
                Investigating
              </option>

              <option value="deactivated">
                Deactivated
              </option>
            </select>
          </label>

          <div className="flex items-end">
            <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-5 font-black text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit">
              <Search aria-hidden="true" className="size-5" />
              Apply
            </button>
          </div>
        </form>

        {filterError ? (
          <p className="mt-4 text-sm font-semibold text-red-700" role="alert">
            {filterError}
          </p>
        ) : null}

        {filtersApplied ? (
          <button className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50" disabled={loading} onClick={clearFilters} type="button">
            <X aria-hidden="true" className="size-4" />
            Clear filters
          </button>
        ) : null}
      </section>

      {loading && !inventory ? (
        <div className="mt-6">
          <LoadingState message="Loading visitor-card inventory…" />
        </div>
      ) : null}

      {requestStatus === "error" ? (
        <div className="mt-6">
          <ErrorMessage message={requestError} onRetry={refreshInventory} title="Visitor-card inventory unavailable" />
        </div>
      ) : null}

      {inventory &&
      requestStatus !== "error" ? (
        <section aria-busy={loading} aria-labelledby="visitor-card-records-heading" className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h2 className="text-xl font-black text-slate-950" id="visitor-card-records-heading">
                Inventory records
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                {inventory.pagination.totalCount.toLocaleString()}{" "}
                {inventory.pagination.totalCount ===
                1
                  ? "matching card"
                  : "matching cards"}
              </p>
            </div>

            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Boxes aria-hidden="true" className="size-4" />
              Page{" "}
              {inventory.pagination.page}{" "}
              of{" "}
              {Math.max(
                inventory.pagination
                  .totalPages,
                1,
              )}
            </div>
          </div>

          {inventory.cards.length ===
          0 ? (
            <div className="p-5 sm:p-8">
              <div className="rounded-2xl bg-slate-50 p-8 text-center">
                <CreditCard aria-hidden="true" className="mx-auto size-10 text-slate-400" />

                <h3 className="mt-4 font-black text-slate-950">
                  No visitor cards found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No card matches the
                  current inventory filters.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 p-4 md:hidden">
                {inventory.cards.map(
                  (card) => (
                    <InventoryCard card={card} key={card.cardId} onChangeTower={openTowerChange} />
                  ),
                )}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1050px] border-collapse text-left">
                  <thead className="bg-slate-50 text-sm text-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-bold" scope="col">
                        Visitor card
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Type
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Tower
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Status
                      </th>

                      <th className="px-6 py-4 font-bold" scope="col">
                        Active assignment
                      </th>

                      <th className="px-6 py-4 text-right font-bold" scope="col">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {inventory.cards.map(
                      (card) => (
                        <InventoryRow card={card} key={card.cardId} onChangeTower={openTowerChange} />
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {inventory.pagination
            .totalPages > 1 ? (
            <Pagination currentPage={page} goToPage={goToPage} totalPages={inventory.pagination.totalPages} />
          ) : null}
        </section>
      ) : null}

      {action?.type === "create" ? (
        <CreateCardsModal accessToken={accessToken} onClose={closeAction} onSuccess={completeAction} />
      ) : null}

      {action?.type === "tower" ? (
        <ChangeTowerModal accessToken={accessToken} card={action.card} onClose={closeAction} onSuccess={completeAction} />
      ) : null}
    </div>
  );
}