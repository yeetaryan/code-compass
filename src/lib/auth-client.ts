import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://localhost:5173" : window.location.origin,
});

/** Turns Better Auth error codes into friendly copy without revealing which part was wrong. */
export function authErrorMessage(err: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (err.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match. Try again or reset your password.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Try signing in instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters.";
    case "PASSWORD_TOO_LONG":
      return "That password is too long.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "EMAIL_NOT_VERIFIED":
      return "Please confirm your email first — we've sent you a new link.";
    case "INVALID_TOKEN":
      return "This link has expired or was already used. Request a new one.";
    default:
      return err.message || "Something went wrong. Please try again.";
  }
}
