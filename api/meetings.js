import { getAdminClient } from "./_lib/supabase.js";
import {
  json,
  methodNotAllowed,
} from "./_lib/http.js";

export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    try {
      const { data, error } = await getAdminClient().rpc(
        "get_available_meetings",
      );

      if (error) {
        return json(
          {
            error:
              "Available meetings could not be loaded. Please try again.",
          },
          500,
        );
      }

      const meetings = Array.isArray(data)
        ? data.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
          }))
        : [];

      return json(
        {
          meetings,
        },
        200,
      );
    } catch {
      return json(
        {
          error:
            "Available meetings could not be loaded. Please try again.",
        },
        500,
      );
    }
  },
};