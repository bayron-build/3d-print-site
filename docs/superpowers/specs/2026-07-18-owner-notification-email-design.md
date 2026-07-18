# Owner notification email on new submissions — design

**Date:** 2026-07-18
**Status:** Approved

## Problem

The site owner only finds out about new orders and requests by checking the
admin site. Every submission should also send the owner an email showing who
submitted and what they asked for, so the inbox becomes the alert channel.

## Approach

Send the notification from the same server action that already sends the
customer confirmation (`submitRequest` in `app/aanvraag/actions.ts`). One new
template, one new notification function, one extra call. No new
infrastructure, no new dependencies; inherits the existing "email failure can
never break a submission" guarantee.

A Supabase database webhook was considered and rejected: it decouples the
email from the action, but requires an edge function plus secrets in Supabase
— complexity with no payoff for a one-owner site.

## Recipient configuration

New environment variable `ADMIN_EMAIL`, set in `.env.local` and in Vercel.
If unset, the notification is skipped with a console warning (same pattern as
the existing `RESEND_API_KEY`/`EMAIL_FROM` guard). Not hardcoded, so the
address stays out of the repo and can change without a deploy.

While Resend is still in test mode (no verified domain), delivery only works
to the address the Resend account was registered with — which is exactly the
owner notification case, so this feature works before domain verification.

## Email content

Subject, chosen so the inbox list alone answers "who and which flow":

- Catalog order: `Nieuwe bestelling van {naam}`
- Custom/file request: `Nieuwe aanvraag van {naam}`

Body (reusing the existing `layout()` / `escapeHtml()` helpers in
`lib/email/templates.ts`):

- **Who:** customer name, email, phone.
- **What (catalog):** product name, quantity, unit price, total.
- **What (custom/file):** description, color, material, quantity, and the
  number of attached photos (custom) or model files (file).
- **Link:** direct link to the request's admin detail page
  (`{NEXT_PUBLIC_SITE_URL}/admin/aanvragen/{id}`).

All customer-supplied strings are HTML-escaped, as in the existing templates.

## Components

1. **`lib/email/templates.ts`** — new pure function
   `ownerNotificationEmail(input): EmailContent`. No I/O, no env access;
   unit-testable like the other templates.
2. **`lib/email/notifications.ts`** — new `sendNewRequestNotification(...)`:
   reads `process.env.ADMIN_EMAIL`, warns and returns if unset, builds the
   admin URL, calls `sendEmail`. Never throws.
3. **`app/aanvraag/actions.ts`** — one extra awaited call after
   `sendConfirmationEmail`. Side change: the catalog price lookup selects
   `name, indicative_price` instead of only `indicative_price`, so the email
   can name the product.

## Error handling

Identical to existing emails: `sendEmail` never throws; a Resend outage or a
missing env var logs a warning and the submission still succeeds. A missed
notification is acceptable — the admin site remains the source of truth.

## Testing

- Unit tests for `ownerNotificationEmail`: catalog variant (product name,
  totals, subject) and custom/file variant (description, file count,
  subject), plus HTML-escaping of customer input.
- Manual verification: submit a test request locally with `ADMIN_EMAIL` set
  and confirm the email arrives with correct content and a working admin
  link.
