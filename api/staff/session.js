import {
  HttpError,
  json,
  methodNotAllowed,
} from "../_lib/http.js";
import { requireActiveStaff } from "../_lib/staffAuth.js";

export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    try {
      const { profile } =
        await requireActiveStaff(request);

      return json(
        {
          profile: {
            fullName: profile.fullName,
            role: profile.role,
          },
        },
        200,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          {
            error: error.message,
          },
          error.status,
          error.status === 401
            ? {
                "WWW-Authenticate": "Bearer",
              }
            : {},
        );
      }

      return json(
        {
          error:
            "The staff session could not be verified.",
        },
        500,
      );
    }
  },
};