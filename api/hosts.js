import { getAdminClient } from "./_lib/supabase.js";
import { json, methodNotAllowed } from "./_lib/http.js";

export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    try {
      const { data, error } = await getAdminClient()
        .from("hosts")
        .select("id, full_name, department")
        .eq("active", true)
        .order("full_name", {
          ascending: true,
        });

      if (error) {
        return json(
          {
            error: "Available hosts could not be loaded.",
          },
          500,
        );
      }

      return json({
        hosts: data.map((host) => ({
          department: host.department,
          fullName: host.full_name,
          id: host.id,
        })),
      });
    } catch {
      return json(
        {
          error: "Available hosts could not be loaded.",
        },
        500,
      );
    }
  },
};