"use server";

import { requireUser } from "@/lib/auth";
import { deleteAllUserData } from "@/lib/accountDeletion";

type ActionResult = { success: boolean; error?: string };

// Full account erasure — GDPR/CCPA "right to erasure". Deletes every row and
// storage object that carries this user's data, then the auth.users row
// itself. Irreversible; there is no undo. The real sequence (statement
// order, why it's one implicit transaction, why storage removal happens
// first) lives in lib/accountDeletion.ts's deleteAllUserData() — shared with
// actions/admin.ts's admin-triggered deleteUserAsAdmin() so there's exactly
// one place this hard-won, twice-live-verified sequence can drift from
// correct.
export async function deleteAccount(): Promise<ActionResult> {
  const user = await requireUser();

  try {
    await deleteAllUserData(user.id);
    return { success: true };
  } catch (error) {
    console.error("[actions/account] deleteAccount failed", error);
    return {
      success: false,
      error:
        "Something went wrong deleting your account. Your data has not been changed — please try again or contact support.",
    };
  }
}
