// Minimal Resend transport: one POST to their REST API via fetch, no SDK
// (project rule: no new dependencies). Sending email is never fatal — this
// module never throws to the caller; failures are logged and reported as
// { ok: false } so submits and admin actions always succeed regardless.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = { to: string; subject: string; html: string };
export type SendEmailResult = { ok: boolean };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Local dev without a Resend key keeps working: warn and skip.
  if (!apiKey || !from) {
    console.warn(
      `[email] RESEND_API_KEY/EMAIL_FROM not set; skipping "${input.subject}"`
    );
    return { ok: false };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      // Expected in test mode for any recipient other than the owner's own
      // inbox (onboarding@resend.dev only delivers there).
      console.error(
        `[email] Resend responded ${response.status} for "${input.subject}": ${await response.text()}`
      );
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.error(`[email] send failed for "${input.subject}":`, error);
    return { ok: false };
  }
}
