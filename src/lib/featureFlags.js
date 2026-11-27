// "Sign in with Microsoft" and the staff sign-in settings appear once
// the Entra app registration and the Supabase Azure provider are set up
// for this environment (VITE_MICROSOFT_SIGN_IN=true).
export const MICROSOFT_SIGN_IN_ENABLED =
  import.meta.env.VITE_MICROSOFT_SIGN_IN === "true";
