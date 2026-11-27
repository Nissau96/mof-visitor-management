import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

function getPageItems(currentPage, totalPages) {
  if (totalPages <= 9) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  const start = Math.max(
    2,
    Math.min(currentPage - 2, totalPages - 5),
  );

  const end = Math.min(totalPages - 1, start + 4);

  return [
    1,
    ...(start > 2 ? ["start-gap"] : []),
    ...Array.from(
      { length: end - start + 1 },
      (_, index) => start + index,
    ),
    ...(end < totalPages - 1 ? ["end-gap"] : []),
    totalPages,
  ];
}

// Footer for a paged list: "Showing …" on the left, round page buttons
// on the right. noun is plural ("hosts"); singular is used for one item.
export default function ListPagination({
  goToPage,
  label,
  noun,
  nounSingular,
  pagination,
}) {
  const { page, pageSize, totalCount, totalPages } = pagination;

  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);
  const name = totalCount === 1 ? nounSingular : noun;

  const pageButton =
    "grid size-10 shrink-0 place-items-center rounded-full border text-sm font-black transition focus-visible:ring-4 focus-visible:ring-brand-200 sm:size-11";

  return (
    <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 px-4 py-5 sm:px-6 lg:flex-row">
      <p aria-live="polite" className="text-sm text-slate-600">
        {totalPages > 1
          ? `Showing ${first.toLocaleString()} to ${last.toLocaleString()} of ${totalCount.toLocaleString()} ${name} · Page ${page} of ${totalPages}`
          : `Showing ${totalCount.toLocaleString()} of ${totalCount.toLocaleString()} ${name}`}
      </p>

      {totalPages > 1 ? (
        <nav aria-label={label} className="flex items-center gap-1.5 sm:gap-2">
          <button aria-label="Previous page" className={`${pageButton} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`} disabled={page <= 1} onClick={() => goToPage(page - 1)} type="button">
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>

          {getPageItems(page, totalPages).map((item) => {
            if (typeof item !== "number") {
              return (
                <span aria-hidden="true" className="w-4 text-center text-slate-500 max-sm:hidden" key={item}>
                  …
                </span>
              );
            }

            const current = item === page;

            // Phones keep the first, last and neighbouring pages.
            const phoneHidden =
              Math.abs(item - page) > 1 &&
              item !== 1 &&
              item !== totalPages;

            return (
              <button aria-current={current ? "page" : undefined} aria-label={`Page ${item}`} className={`${pageButton} ${phoneHidden ? "max-sm:hidden" : ""} ${current ? "border-brand-800 bg-brand-800 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`} key={item} onClick={() => goToPage(item)} type="button">
                {item}
              </button>
            );
          })}

          <button aria-label="Next page" className={`${pageButton} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`} disabled={page >= totalPages} onClick={() => goToPage(page + 1)} type="button">
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
