import { ApiError } from "@/lib/api";

/**
 * Map a thrown error from the admin staff endpoints into a user-facing
 * message. We special-case the common failure modes (duplicate email,
 * single-admin invariant trip, validation) so toasts read like English
 * instead of like raw server messages.
 */
export function describeStaffError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const code = err.body?.code;
    const msg = err.body?.message ?? err.message;
    if (err.status === 409 || code === "CONFLICT") {
      if (/email/i.test(msg ?? "")) {
        return "A user with that email already exists.";
      }
      if (/admin/i.test(msg ?? "")) {
        return "Only one admin account is allowed.";
      }
      return msg || "Conflict with an existing record.";
    }
    if (err.status === 403 || code === "FORBIDDEN") {
      return "You don't have permission to do that.";
    }
    if (err.status === 404 || code === "NOT_FOUND") {
      return msg || "Not found.";
    }
    if (err.status === 400 || code === "VALIDATION" || code === "BAD_REQUEST") {
      return msg || "Please check the form and try again.";
    }
    return msg || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
