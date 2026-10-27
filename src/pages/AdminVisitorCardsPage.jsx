import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  Check,
  CirclePlus,
  CreditCard,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import AppSelect from "../components/AppSelect.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import ListPagination from "../components/ListPagination.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SegmentedButton from "../components/SegmentedButton.jsx";
import StatCard from "../components/StatCard.jsx";
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

const PAGE_SIZE = 24;

// The page always shows one card type, Regular first.
const INITIAL_FILTERS = Object.freeze({
  cardType: "regular",
  search: "",
  status: "all",
  tower: "all",
});

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
    summary: {
      ...summary,
      towerCountsByType:
        result.summary.towerCountsByType ||
        null,
    },
  };
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
          <AppSelect
            disabled={submitting}
            id="inventory-card-type"
            label="Card type"
            labelClassName="mb-1.5 block text-sm font-bold text-slate-800"
            onChange={setCardType}
            options={[
              { label: "Regular visitor card", value: "regular" },
              { label: "VIP visitor card", value: "vip" },
            ]}
            size="3xl"
            value={cardType}
          />

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

          <AppSelect

            disabled={submitting}

            id="inventory-issuing-tower"

            label="Issuing tower"

            labelClassName="mb-1.5 block text-sm font-bold text-slate-800"

            onChange={setTower}

            options={[

              { label: "Tower 1", value: "tower_1" },

              { label: "Tower 2", value: "tower_2" },

            ]}

            size="3xl"

            value={tower}

          />

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

          <AppSelect

            disabled={submitting}

            id="inventory-new-issuing-tower"

            label="New issuing tower"

            labelClassName="mb-1.5 block text-sm font-bold text-slate-800"

            onChange={setTower}

            options={[

              { label: "Tower 1", value: "tower_1" },

              { label: "Tower 2", value: "tower_2" },

            ]}

            size="3xl"

            value={tower}

          />

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

// Physical-card colours. Explicit hex values keep the tiles the same in
// light and dark mode, like the printed cards they stand for.
const CARD_TYPE_STYLES = Object.freeze({
  regular: Object.freeze({
    dot: "bg-[#0f766e]",
    tile: "bg-[#115e59]",
    text: "text-[#115e59]",
  }),
  vip: Object.freeze({
    dot: "bg-[#881337]",
    tile: "bg-[#881337]",
    text: "text-[#881337]",
  }),
});

const TILE_STATUS_STYLES = Object.freeze({
  assigned: "text-[#1d4ed8]",
  available: "text-[#047857]",
  deactivated: "text-[#475569]",
  investigating: "text-[#6d28d9]",
  not_returned: "text-[#b91c1c]",
});

const TYPE_FILTERS = Object.freeze([
  Object.freeze({
    countKey: "regularCount",
    label: "Regular",
    value: "regular",
  }),
  Object.freeze({
    countKey: "vipCount",
    label: "VIP",
    value: "vip",
  }),
]);

const TOWER_FILTERS = Object.freeze([
  Object.freeze({
    label: "Tower 1",
    value: "tower_1",
  }),
  Object.freeze({
    label: "Tower 2",
    value: "tower_2",
  }),
]);

// Investigating and Deactivated only appear when some card has that status.
const STATUS_FILTERS = Object.freeze([
  Object.freeze({
    label: "All",
    value: "all",
  }),
  Object.freeze({
    label: "Available",
    value: "available",
  }),
  Object.freeze({
    label: "Assigned",
    value: "assigned",
  }),
  Object.freeze({
    label: "Not returned",
    value: "not_returned",
  }),
  Object.freeze({
    countKey: "investigatingCount",
    label: "Investigating",
    value: "investigating",
  }),
  Object.freeze({
    countKey: "deactivatedCount",
    label: "Deactivated",
    value: "deactivated",
  }),
]);

const PILL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-bold transition focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed";

function formatBaseNumber(card) {
  const base = `Base ${String(
    card.baseNumber,
  ).padStart(3, "0")}`;

  return card.replacementSequence > 0
    ? `${base} · R${card.replacementSequence}`
    : base;
}

// Tower counts for one card type. Null until the database returns them,
// in which case both tower tabs show without counts.
function getTowerCounts(
  summary,
  cardType,
) {
  const counts =
    summary.towerCountsByType?.[
      cardType
    ];

  return counts &&
    Number.isInteger(
      Number(counts.tower_1),
    ) &&
    Number.isInteger(
      Number(counts.tower_2),
    )
    ? {
        tower_1: Number(counts.tower_1),
        tower_2: Number(counts.tower_2),
      }
    : null;
}

function TileStatus({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ffffff] px-2 py-0.5 text-[0.6875rem] font-black ${
        TILE_STATUS_STYLES[status] ||
        "text-[#475569]"
      }`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-current"
      />
      {formatStatus(status)}
    </span>
  );
}

function CardTile({ card, onOpen }) {
  const styles =
    CARD_TYPE_STYLES[card.cardType];

  return (
    <article
      className={`relative isolate flex min-h-40 flex-col overflow-hidden rounded-2xl p-3.5 text-[#ffffff] shadow-sm ${styles.tile}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-14 -right-12 -z-10 size-36 rounded-full border-[12px] border-[#ffffff14]"
      >
        <span className="absolute inset-5 rounded-full border-8 border-[#ffffff12]" />
      </span>

      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <h3 className="text-base font-black leading-tight tracking-tight">
          {card.cardNumber}
        </h3>

        <TileStatus status={card.status} />
      </div>

      <p className="mt-1 text-xs font-semibold text-[#ffffffd9]">
        {formatBaseNumber(card)}
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-black">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {formatTower(card.tower)}
          </p>

          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[#ffffffd9]">
            {card.activeAssignment
              ? card.activeAssignment.fullName
              : "No active assignment"}
          </p>
        </div>

        <button
          aria-label={`View ${card.cardNumber} details`}
          className={`grid size-9 shrink-0 place-items-center rounded-full bg-[#ffffff] transition hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffffff80] ${styles.text}`}
          onClick={() => onOpen(card)}
          type="button"
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </article>
  );
}

function DetailItem({ children, label }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">
        {children}
      </dd>
    </div>
  );
}

function CardDetailsModal({
  card,
  onChangeTower,
  onClose,
}) {
  return (
    <ModalShell busy={false} description={`${formatCardType(card.cardType)} visitor card issued from ${formatTower(card.tower)}.`} onClose={onClose} title={card.cardNumber}>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <DetailItem label="Status">
            <StatusBadge status={card.status} />
          </DetailItem>

          <DetailItem label="Number">
            {formatBaseNumber(card)}
          </DetailItem>

          <DetailItem label="Type">
            {formatCardType(card.cardType)}
          </DetailItem>

          <DetailItem label="Tower">
            {formatTower(card.tower)}
          </DetailItem>
        </dl>

        <div>
          <h3 className="text-sm font-bold text-slate-800">
            Active assignment
          </h3>
          <div className="mt-2">
            <AssignmentDetails
              assignment={
                card.activeAssignment
              }
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-800">
            Card history
          </h3>
          <div className="mt-2">
            <CardLineage card={card} />
          </div>
        </div>

        <IncidentDetails
          incident={card.activeIncident}
        />

        {card.status === "deactivated" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
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

        {card.canChangeTower ? null : (
          <p className="text-sm leading-6 text-slate-600">
            Only an available card without an
            open assignment can move to another
            tower.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button className={`${PILL_BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`} onClick={onClose} type="button">
          Close
        </button>

        <button className={`${PILL_BUTTON} bg-brand-800 text-white hover:bg-brand-900 disabled:bg-slate-200 disabled:text-slate-500`} disabled={!card.canChangeTower} onClick={() => onChangeTower(card)} type="button">
          <ArrowRightLeft aria-hidden="true" className="size-4" />
          Change tower
        </button>
      </div>
    </ModalShell>
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
    useState(INITIAL_FILTERS);

  const [searchDraft, setSearchDraft] =
    useState("");

  const [searchError, setSearchError] =
    useState("");

  const [page, setPage] =
    useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [action, setAction] =
    useState(null);

  const panelRef = useRef(null);

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

  const applySearch = useEffectEvent(
    (value) => {
      if (filters.search !== value) {
        updateFilters({ search: value });
      }
    },
  );

  // Search runs shortly after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parsed =
        adminVisitorCardInventorySchema.shape.search.safeParse(
          searchDraft,
        );

      if (!parsed.success) {
        setSearchError(
          parsed.error.issues[0]?.message ||
            "Check the search and try again.",
        );
        return;
      }

      setSearchError("");
      applySearch(parsed.data);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchDraft]);

  function updateFilters(changes) {
    setFilters((current) => ({
      ...current,
      ...changes,
    }));
    setPage(1);
    setRequestStatus("loading");
  }

  function showInPanel(changes) {
    updateFilters(changes);

    panelRef.current?.scrollIntoView({
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function refreshInventory() {
    setRequestStatus("loading");
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

    setRequestStatus("loading");
    setPage(nextPage);

    panelRef.current?.scrollIntoView({
      block: "start",
    });
  }

  function openCreateCards() {
    setSuccessMessage("");
    setAction({
      type: "create",
    });
  }

  function openDetails(card) {
    setSuccessMessage("");
    setAction({
      card,
      type: "details",
    });
  }

  function openTowerChange(card) {
    if (!card.canChangeTower) {
      return;
    }

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
    refreshInventory();
  }

  const loading =
    requestStatus === "loading";

  const summary = inventory?.summary;

  const towerCounts = summary
    ? getTowerCounts(
        summary,
        filters.cardType,
      )
    : null;

  const typeTotal = summary
    ? summary[
        TYPE_FILTERS.find(
          (option) =>
            option.value ===
            filters.cardType,
        ).countKey
      ]
    : null;

  // A tower with no cards of this type has nothing to show, unless it is
  // the one already selected.
  const towerTabs = [
    {
      count: typeTotal,
      label: "All",
      value: "all",
    },
    ...TOWER_FILTERS.map((option) => ({
      ...option,
      count: towerCounts
        ? towerCounts[option.value]
        : null,
    })).filter(
      (option) =>
        option.count === null ||
        option.count > 0 ||
        option.value === filters.tower,
    ),
  ];

  const statusFilters =
    STATUS_FILTERS.filter(
      (option) =>
        !option.countKey ||
        !summary ||
        summary[option.countKey] > 0 ||
        option.value === filters.status,
    );

  const statCards = summary
    ? [
        {
          count: (
            summary.regularCount +
            summary.vipCount
          ).toLocaleString(),
          icon: Archive,
          id: "total",
          note: `${summary.regularCount.toLocaleString()} regular · ${summary.vipCount.toLocaleString()} VIP`,
          onOpen: () =>
            showInPanel({
              status: "all",
              tower: "all",
            }),
          shortTitle: "Total",
          title: "Total inventory",
        },
        {
          count:
            summary.availableCount.toLocaleString(),
          icon: Check,
          id: "available",
          note: `${summary.assignedCount.toLocaleString()} currently assigned`,
          noteTone: "brand",
          onOpen: () =>
            showInPanel({
              status: "available",
            }),
          shortTitle: "Available",
          title: "Available cards",
        },
        {
          count: (
            <>
              {summary.tower1Count.toLocaleString()}
              <span className="sr-only">
                {" "}in Tower 1,{" "}
              </span>
              <span
                aria-hidden="true"
                className="mx-1 text-2xl font-bold text-slate-400 md:text-4xl"
              >
                /
              </span>
              {summary.tower2Count.toLocaleString()}
              <span className="sr-only">
                {" "}in Tower 2
              </span>
            </>
          ),
          icon: Building2,
          id: "towers",
          note: "Tower 1 / Tower 2",
          noteTone: "blue",
          onOpen: () =>
            showInPanel({
              tower: "all",
            }),
          shortTitle: "Tower 1 / 2",
          title: "Tower allocation",
        },
        {
          count:
            summary.notReturnedCount.toLocaleString(),
          icon: AlertTriangle,
          id: "not-returned",
          note: `${summary.investigatingCount.toLocaleString()} investigating · ${summary.deactivatedCount.toLocaleString()} deactivated`,
          onOpen: () =>
            showInPanel({
              status: "not_returned",
            }),
          shortTitle: "Not returned",
          title: "Not returned",
          tone:
            summary.notReturnedCount > 0
              ? "alert"
              : undefined,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
      <header className="flex flex-col gap-4 px-1 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-700">
            Administration
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Visitor-card inventory
          </h1>

          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            Manage regular and VIP visitor
            cards, review their assignment
            state, and control the tower each
            card is issued from.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button className={`${PILL_BUTTON} border border-brand-600 bg-white text-brand-800 hover:bg-brand-50 disabled:opacity-60`} disabled={loading} onClick={refreshInventory} type="button">
            <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button className={`${PILL_BUTTON} bg-brand-800 text-white hover:bg-brand-900`} onClick={openCreateCards} type="button">
            <CirclePlus aria-hidden="true" className="size-4" />
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

      {statCards.length ? (
        <section aria-label="Visitor-card inventory summary" className="mt-6 grid grid-cols-2 gap-2 sm:gap-4 min-[1400px]:grid-cols-4">
          {statCards.map((card, index) => (
            <StatCard
              count={card.count}
              featured={index === 0}
              icon={card.icon}
              key={card.id}
              note={card.note}
              noteTone={card.noteTone}
              onOpen={card.onOpen}
              shortTitle={card.shortTitle}
              title={card.title}
              tone={card.tone}
            />
          ))}
        </section>
      ) : null}

      {!inventory && loading ? (
        <div className="mt-6">
          <LoadingState message="Loading visitor-card inventory…" />
        </div>
      ) : null}

      {requestStatus === "error" ? (
        <div className="mt-6">
          <ErrorMessage message={requestError} onRetry={refreshInventory} title="Visitor-card inventory unavailable" />
        </div>
      ) : null}

      {inventory && requestStatus !== "error" ? (
        <section aria-busy={loading} aria-labelledby="visitor-card-records-heading" className="@container mt-4 scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" ref={panelRef}>
          <h2 className="sr-only" id="visitor-card-records-heading">
            Visitor cards
          </h2>

          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div aria-label="Card type" className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-slate-200 bg-slate-100 p-1" role="group">
                {TYPE_FILTERS.map((option) => {
                  const active =
                    filters.cardType ===
                    option.value;

                  return (
                    <SegmentedButton active={active} aria-pressed={active} key={option.value} onClick={() => updateFilters({ cardType: option.value, tower: "all" })}>
                      <span aria-hidden="true" className={`size-2.5 rounded-sm ${CARD_TYPE_STYLES[option.value].dot}`} />
                      {option.label}
                      <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-black ${active ? (option.value === "vip" ? "bg-[#881337] text-[#ffffff]" : "bg-brand-800 text-[#ffffff]") : "bg-slate-200 text-slate-700"}`}>
                        {summary[option.countKey].toLocaleString()}
                      </span>
                    </SegmentedButton>
                  );
                })}
              </div>

              <p aria-live="polite" className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-bold text-brand-800">
                {inventory.pagination.totalCount.toLocaleString()}{" "}
                {inventory.pagination.totalCount === 1
                  ? "matching card"
                  : "matching cards"}
              </p>
            </div>

            <div aria-label="Tower" className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200" role="group">
              {towerTabs.map((option) => {
                const active =
                  filters.tower ===
                  option.value;

                return (
                  <button aria-pressed={active} className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-2 text-sm sm:gap-2 sm:px-3 transition focus-visible:ring-4 focus-visible:ring-brand-200 ${active ? "border-brand-700 font-bold text-brand-800" : "border-transparent font-semibold text-slate-600 hover:text-slate-900"}`} key={option.value} onClick={() => updateFilters({ tower: option.value })} type="button">
                    {option.value === "all" ? null : (
                      <MapPin aria-hidden="true" className="size-4 max-sm:hidden" />
                    )}
                    {option.label}
                    {option.count !== null ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-black ${active ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-700"}`}>
                        {option.count.toLocaleString()}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <form className="relative w-full min-w-0 lg:max-w-md" onSubmit={(event) => event.preventDefault()} role="search">
                <label className="sr-only" htmlFor="inventory-search">
                  Search visitor cards
                </label>

                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />

                <input aria-describedby={searchError ? "inventory-search-error" : undefined} aria-invalid={searchError ? true : undefined} autoComplete="off" className="h-11 min-h-11 w-full rounded-full border border-slate-200 bg-slate-50 py-0 pl-11 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100" id="inventory-search" maxLength="80" onChange={(event) => setSearchDraft(event.target.value)} placeholder="Card number, e.g. 205, or visitor" type="search" value={searchDraft} />
              </form>

              <div aria-label="Card status" className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full sm:gap-1 border border-slate-200 bg-slate-100 p-1 lg:self-auto" role="group">
                {statusFilters.map((option) => {
                  const active =
                    filters.status ===
                    option.value;

                  return (
                    <SegmentedButton active={active} aria-pressed={active} className="max-sm:px-2.5" key={option.value} onClick={() => updateFilters({ status: option.value })}>
                      {option.label}
                    </SegmentedButton>
                  );
                })}
              </div>
            </div>

            {searchError ? (
              <p className="text-sm font-semibold text-red-700" id="inventory-search-error" role="alert">
                {searchError}
              </p>
            ) : null}
          </div>

          {inventory.cards.length === 0 ? (
            <div className="px-4 pb-6 sm:px-6">
              <div className="rounded-2xl bg-slate-50 p-8 text-center">
                <CreditCard aria-hidden="true" className="mx-auto size-10 text-slate-500" />

                <h3 className="mt-4 font-black text-slate-950">
                  No visitor cards found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No card matches this type, tower
                  and status. Try another filter or
                  add cards.
                </p>
              </div>
            </div>
          ) : (
            <div className={`grid grid-cols-2 gap-3 px-4 pb-6 transition-opacity @lg:grid-cols-3 @3xl:grid-cols-4 @4xl:grid-cols-5 @5xl:grid-cols-6 sm:gap-4 sm:px-6 ${loading ? "opacity-60" : ""}`}>
              {inventory.cards.map((card) => (
                <CardTile card={card} key={card.cardId} onOpen={openDetails} />
              ))}
            </div>
          )}

          <ListPagination goToPage={goToPage} label="Visitor-card inventory pages" noun="cards" nounSingular="card" pagination={inventory.pagination} />
        </section>
      ) : null}

      {action?.type === "create" ? (
        <CreateCardsModal accessToken={accessToken} onClose={closeAction} onSuccess={completeAction} />
      ) : null}

      {action?.type === "details" ? (
        <CardDetailsModal card={action.card} onChangeTower={openTowerChange} onClose={closeAction} />
      ) : null}

      {action?.type === "tower" ? (
        <ChangeTowerModal accessToken={accessToken} card={action.card} onClose={closeAction} onSuccess={completeAction} />
      ) : null}
    </div>
  );
}
