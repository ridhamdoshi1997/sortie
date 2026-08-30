// PayPal Payouts integration — affiliate program, direct user request
// 2026-08-30. Chosen over Stripe Connect: InsForge's Stripe integration has
// zero Connect/marketplace-payout support (confirmed by grepping its own
// docs), and PayPal needs no per-affiliate KYC onboarding, just their
// PayPal email. Manual-trigger only — this is called exclusively from the
// admin "Pay now" action (actions/admin.ts), never automatically.
//
// PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET/PAYPAL_MODE need to be added to
// .env before this can send anything real — not yet configured as of
// 2026-08-30 (no PayPal Business account/API app exists for this project
// yet). Sending Payouts also requires PayPal's own "Access to Payouts"
// approval on that Business account (an asynchronous request, not
// instant self-serve) — this code works against sandbox as soon as
// sandbox credentials exist, independent of that live-access approval.

type PayoutResult =
  | { success: true; batchId: string; batchStatus: string }
  | { success: false; error: string };

function getBaseUrl(): string {
  return process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET");
  }

  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`PayPal OAuth error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
  }

  const json = await response.json();
  return json.access_token as string;
}

// One recipient per call, matching the admin "Pay now" button's own
// per-affiliate trigger — no bulk-batch UI exists (or is needed) for v1.
export async function sendPayout(params: {
  recipientEmail: string;
  amountCents: number;
  currency: string;
  note: string;
  senderItemId: string;
}): Promise<PayoutResult> {
  try {
    const accessToken = await getAccessToken();

    const response = await fetch(`${getBaseUrl()}/v1/payments/payouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: params.senderItemId,
          email_subject: "You've been paid — Sortie affiliate commission",
          email_message: "Thanks for referring Sortie subscribers — here's your commission payout.",
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: {
              value: (params.amountCents / 100).toFixed(2),
              currency: params.currency,
            },
            receiver: params.recipientEmail,
            note: params.note,
            sender_item_id: params.senderItemId,
          },
        ],
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return { success: false, error: `PayPal Payouts error (HTTP ${response.status}): ${bodyText.slice(0, 300)}` };
    }

    const json = await response.json();
    return {
      success: true,
      batchId: json.batch_header?.payout_batch_id ?? "",
      batchStatus: json.batch_header?.batch_status ?? "PENDING",
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown PayPal error" };
  }
}
