// Glue between request data and the email templates/transport. These are the
// only two functions the rest of the app calls: one on submit, one on an
// admin status change. Both inherit sendEmail's never-throws guarantee.

import type { RequestStatus } from "@/lib/requests/status";
import { sendEmail } from "./send";
import { confirmationEmail, emailForStatusChange } from "./templates";

// Absolute link for emails: Vercel's deploy URL in production,
// http://localhost:3000 locally.
export function statusPageUrl(accessToken: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/aanvraag/status/${accessToken}`;
}

export async function sendConfirmationEmail(input: {
  to: string;
  customerName: string;
  accessToken: string;
}): Promise<void> {
  const { subject, html } = confirmationEmail({
    customerName: input.customerName,
    statusUrl: statusPageUrl(input.accessToken),
  });
  await sendEmail({ to: input.to, subject, html });
}

// Snake_case fields so callers can pass a requests row (plus the freshly
// saved fees) without renaming.
export type StatusEmailRequest = {
  email: string;
  customer_name: string;
  access_token: string;
  quote_design_fee: number | string | null;
  quote_print_fee: number | string | null;
};

export async function sendStatusEmail(
  request: StatusEmailRequest,
  newStatus: RequestStatus
): Promise<void> {
  const content = emailForStatusChange(newStatus, {
    customerName: request.customer_name,
    designFee: request.quote_design_fee,
    printFee: request.quote_print_fee,
    statusUrl: statusPageUrl(request.access_token),
  });
  if (content === null) {
    return; // received / approved / printing: no email by design.
  }
  await sendEmail({ to: request.email, subject: content.subject, html: content.html });
}
