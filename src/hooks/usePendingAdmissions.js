import { useEffect, useState } from "react";
import { ApiError } from "../lib/api.js";
import { getPendingAdmissions } from "../lib/visitorCardApi.js";

const PAGE_SIZE = 10;

function readPagination(result) {
  const pagination = result?.pagination || {};
  const number = (value) =>
    Number.isInteger(Number(value)) && Number(value) >= 0
      ? Number(value)
      : 0;

  return {
    page: number(pagination.page) || 1,
    totalCount: number(pagination.totalCount),
    totalPages: number(pagination.totalPages),
  };
}

function isAuthError(error) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  );
}

// Visitors waiting at reception for the dashboard.
//
// count: everyone waiting in the tower scope, ignoring the search, or
// null until known. list: the page shown in the table, only fetched
// while `listing` is true.
export default function usePendingAdmissions({
  accessToken,
  listing,
  onAuthError,
  page,
  refreshKey,
  search,
  tower,
}) {
  const [countResult, setCountResult] = useState({
    count: null,
    key: "",
  });
  const [listResult, setListResult] = useState({
    error: "",
    fetchedAt: null,
    key: "",
    pagination: readPagination(null),
    records: [],
  });

  const countKey = [accessToken, tower, refreshKey].join("|");
  const listKey = listing
    ? [accessToken, tower, refreshKey, search, page].join("|")
    : "";

  useEffect(() => {
    const controller = new AbortController();

    getPendingAdmissions({
      accessToken,
      page: 1,
      pageSize: 1,
      search: "",
      signal: controller.signal,
      tower,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setCountResult({
            count: readPagination(result).totalCount,
            key: countKey,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        if (isAuthError(error)) {
          onAuthError();
          return;
        }

        setCountResult({ count: null, key: countKey });
      });

    return () => controller.abort();
    // onAuthError is a callback, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, countKey, tower]);

  useEffect(() => {
    if (!listKey) {
      return undefined;
    }

    const controller = new AbortController();

    getPendingAdmissions({
      accessToken,
      page,
      pageSize: PAGE_SIZE,
      search,
      signal: controller.signal,
      tower,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setListResult({
            error: "",
            fetchedAt: new Date().toISOString(),
            key: listKey,
            pagination: readPagination(result),
            records: Array.isArray(result?.admissions)
              ? result.admissions
              : [],
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        if (isAuthError(error)) {
          onAuthError();
          return;
        }

        setListResult({
          error:
            error instanceof Error && error.message
              ? error.message
              : "Pending admissions could not be loaded. Please try again.",
          fetchedAt: null,
          key: listKey,
          pagination: readPagination(null),
          records: [],
        });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, listKey, page, search, tower]);

  // While a refresh is in flight the previous count and page stay on
  // screen (dimmed by the page), so the table never jumps.
  const listReady = Boolean(listKey) && listResult.key === listKey;

  return {
    count: countResult.count,
    countLoaded: Boolean(countResult.key),
    list: {
      ...listResult,
      status: !listReady
        ? "loading"
        : listResult.error
          ? "error"
          : "ready",
    },
  };
}
