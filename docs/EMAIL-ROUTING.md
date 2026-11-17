# Support email — Cloudflare Email Routing

## What this is (and is not)

`support@infolange.ir` is **not a mailbox**. Cloudflare Email Routing only
receives mail for the domain and forwards it to an existing inbox. There is no
storage, no IMAP, no SMTP, and **no ability to send from that address**.

That is fine for a contact address: users write to `support@`, the message
lands in the owner's inbox, and the reply goes out from the owner's own address.

If sending *as* `support@` is ever required, Cloudflare cannot do it. Use a real
mailbox provider instead (Zoho Mail's free plan, or any IMAP/SMTP host) and
point the MX records there.

## Current configuration

| Item | Value |
|---|---|
| Zone | `infolange.ir` |
| Status | enabled / ready |
| MX records | `route1.mx.cloudflare.net` (3), `route3` (47), `route2` (94) |
| Destination | `akouldash@outlook.com` — verified |
| Rule | `support@infolange.ir` → forward to the destination, enabled |

The MX records were created by Cloudflare when Email Routing was enabled, so no
manual DNS work was needed.

## Changing the destination inbox

1. Cloudflare Dashboard → `infolange.ir` → **Email → Email Routing**
2. **Destination addresses** → add the new address, then open the verification
   email and click the link (Cloudflare refuses to forward to unverified
   addresses, which prevents the domain being used as a spam relay).
3. **Routing rules** → edit the `support` rule and point it at the new address.

## Adding more aliases

Add a rule per address, for example:

- `privacy@infolange.ir` — data-deletion and privacy requests
- `legal@infolange.ir` — legal notices
- `abuse@infolange.ir` — abuse reports

A catch-all rule also exists but is **disabled** on purpose: an open catch-all on
a public domain becomes a spam magnet within days.

## Why this matters for Google OAuth verification

Google's OAuth consent screen requires a reachable contact. It does **not**
require a branded address, and it does not send a verification email to it — but
a dead address on a privacy policy looks negligent, and users will use it.

## Sending mail from a Worker (if ever needed)

Cloudflare Workers can *receive* email (Email Workers) but the free sending path
(MailChannels) was discontinued. For transactional email from the backend
(verification codes, receipts), use an HTTP email API such as Resend, Brevo, or
Postmark, and keep the API key as a Worker secret.
