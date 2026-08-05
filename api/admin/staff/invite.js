import process from "node:process";
import { requireActiveStaff } from "../../_lib/staffAuth.js";
import {
  HttpError,
  json,
  methodNotAllowed,
  readJsonBody,
} from "../../_lib/http.js";
import { getAdminClient } from "../../_lib/supabase.js";
import { adminStaffInviteSchema } from "../../../src/validation/adminManagement.js";

function getInviteRedirectUrl() {
  const configuredUrl =
    process.env.STAFF_INVITE_REDIRECT_URL;

  if (!configuredUrl) {
    throw new HttpError(
      "Staff invitation is not configured.",
      500,
    );
  }

  let redirectUrl;

  try {
    redirectUrl = new URL(configuredUrl);
  } catch {
    throw new HttpError(
      "Staff invitation is not configured.",
      500,
    );
  }

  const localDevelopment =
    redirectUrl.protocol === "http:" &&
    (
      redirectUrl.hostname === "localhost" ||
      redirectUrl.hostname === "127.0.0.1"
    );

  if (
    (
      redirectUrl.protocol !== "https:" &&
      !localDevelopment
    ) ||
    redirectUrl.username ||
    redirectUrl.password ||
    redirectUrl.search ||
    redirectUrl.hash ||
    redirectUrl.pathname !== "/staff/setup"
  ) {
    throw new HttpError(
      "Staff invitation is not configured.",
      500,
    );
  }

  return redirectUrl.toString();
}

function isExistingUserError(error) {
  return (
    error?.code === "email_exists" ||
    error?.code === "user_already_exists" ||
    /already.+(registered|exists)/i.test(
      error?.message || "",
    )
  );
}

function getProfileDatabaseError(error) {
  if (
    error?.code === "23505"
  ) {
    return new HttpError(
      "A staff profile already exists for this account.",
      409,
    );
  }

  if (error?.code === "42501") {
    return new HttpError(
      "Administrator access is required.",
      403,
    );
  }

  if (
    error?.code === "22023" ||
    error?.code === "23514"
  ) {
    return new HttpError(
      "The staff invitation is invalid.",
      400,
    );
  }

  return new HttpError(
    "The staff invitation could not be completed. Please try again.",
    500,
  );
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    try {
      const { profile } =
        await requireActiveStaff(
          request,
          ["admin"],
        );

      const body = await readJsonBody(request);

      const parsed =
        adminStaffInviteSchema.safeParse(body);

      if (!parsed.success) {
        throw new HttpError(
          "The staff invitation is invalid.",
          400,
        );
      }

      const redirectTo =
        getInviteRedirectUrl();

      const adminClient = getAdminClient();

      const {
        data: invitationData,
        error: invitationError,
      } =
        await adminClient.auth.admin
          .inviteUserByEmail(
            parsed.data.email,
            {
              data: {
                full_name:
                  parsed.data.fullName,
              },
              redirectTo,
            },
          );

      if (
        invitationError ||
        !invitationData?.user?.id
      ) {
        if (
          isExistingUserError(
            invitationError,
          )
        ) {
          throw new HttpError(
            "A user with this email address already exists.",
            409,
          );
        }

        throw new HttpError(
          "The invitation email could not be sent. Please try again.",
          502,
        );
      }

      const invitedUserId =
        invitationData.user.id;

      const {
        data: staffProfile,
        error: profileError,
      } = await adminClient.rpc(
        "create_invited_staff_profile",
        {
          p_actor_id: profile.userId,
          p_full_name:
            parsed.data.fullName,
          p_role: parsed.data.role,
          p_user_id: invitedUserId,
        },
      );

      if (profileError) {
        const { error: rollbackError } =
          await adminClient.auth.admin
            .deleteUser(invitedUserId);

        if (rollbackError) {
          throw new HttpError(
            "The invitation was sent, but staff authorisation could not be completed. Deactivate the invited account in Supabase before retrying.",
            500,
          );
        }

        throw getProfileDatabaseError(
          profileError,
        );
      }

      if (
        !staffProfile?.userId ||
        !staffProfile?.email ||
        !staffProfile?.fullName ||
        !staffProfile?.role
      ) {
        throw new HttpError(
          "The staff invitation could not be completed. Please try again.",
          500,
        );
      }

      return json(
        {
          invitationSent: true,
          staff: staffProfile,
        },
        201,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          {
            error: error.message,
          },
          error.status,
        );
      }

      return json(
        {
          error:
            "The staff invitation could not be completed. Please try again.",
        },
        500,
      );
    }
  },
};