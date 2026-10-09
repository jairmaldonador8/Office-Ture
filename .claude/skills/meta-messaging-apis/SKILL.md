---
name: meta-messaging-apis
description: Use when receiving or sending messages through WhatsApp Cloud API or Instagram Messaging API, handling Meta webhooks, connecting a number in coexistence mode, onboarding a client as Tech Provider, or estimating WhatsApp message costs
---

# Meta messaging APIs (WhatsApp + Instagram)

## Overview

One Meta app, two webhooks objects (`whatsapp_business_account`, `instagram`), same HMAC signature. Persist first, answer 200 fast, process later. Verified October 2026; Graph API v26.0 is current, docs show v25.0. Keep the version in an env var.

## When to Use

- Writing a webhook handler or send client for WhatsApp or Instagram DMs
- Detecting when a human replied from the WhatsApp Business app or the IG app
- Planning templates, follow-ups or costs
- Onboarding a client number (coexistence, Embedded Signup)

## Core Patterns

### Webhook: verify, dedupe, ack

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function firmaValida(raw: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", appSecret).update(raw).digest("hex");
  const a = Buffer.from(header.slice(7)), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
// Sign the RAW body, never re-serialized JSON.
// Meta retries up to 7 days (WA) / 36 h (IG) and duplicates:
// insert by unique external id (wamid / mid) with ON CONFLICT DO NOTHING.
// Respond 200 in < 1 s; do the work with waitUntil or a queue.
```

### WhatsApp specifics

- Inbound `messages[]`: `text`, `image`, `audio`, `location`, `interactive`, `button`, `reaction`. First message from a Click-to-WhatsApp ad carries `referral { source_id, headline, body, source_url, ctwa_clid? }`; only on that first message.
- Media URL from `GET /{media-id}` needs the Bearer token and **expires in 5 minutes**: download inside the webhook.
- Send: `POST /{phone_number_id}/messages`. Images: upload and send by `media id` (sending by `link` is discouraged). Read receipt and typing indicator in one call: `{ status: "read", message_id, typing_indicator: { type: "text" } }`, lasts 25 s.
- Official npm `whatsapp` package is archived. Use plain `fetch` (or `whatsapp-api-js@6.3.0`).
- Throughput in coexistence: fixed 20 messages per second.

### Coexistence (Business app + Cloud API, same number)

- Only through Embedded Signup **v4** (`whatsapp_business_app_onboarding`) run by a **Tech Provider or BSP**. A business cannot do it alone from the App Dashboard. v2/v3 expire 15-oct-2026.
- Tech Provider path: business verification of the agency, App Review (advanced) for `whatsapp_business_messaging` + `whatsapp_business_management`.
- Requirements and limits: app 2.24.17+; history syncs once; no groups or broadcasts via API; Windows linked device unsupported; owner must open the app every ~14 days or Meta disconnects (`PRIMARY_INACTIVITY`).
- Messages the owner sends from the app arrive as webhook field `smb_message_echoes` (`value.message_echoes[]`, also `edit`/`revoke`). Use them to pause the bot in that chat.
- Reversible from the app: Settings › Account › Business Platform › Disconnect.

### Instagram specifics

- Use Instagram Messaging API with **Facebook Login** and a Page token (long-lived page token does not expire). Permissions: `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, `business_management`. Real customers need Advanced Access: App Review with screencast + Business Verification.
- Echo of messages sent from the IG app comes in `messages` with `is_echo: true`. Your own bot sends also echo: store your sent `mid`s to tell them apart.
- Ad referral: `referral { ad_id, ref, source: "ADS", type: "OPEN_THREAD", ads_context_data.ad_title }`.
- Send `POST /me/messages` to the IGSID; text max 1,000 bytes; image jpeg/png ≤ 8 MB; `sender_action: typing_on | mark_seen`.
- No templates. 24 h window; outside it only `HUMAN_AGENT` tag (manual, 7 days, extra App Review).

### Windows and prices (Mexico, from 1-oct-2026)

| Message | Cost (USD) |
|---------|-----------|
| Service / utility inside 24 h window | 0.0085 each |
| Marketing template | 0.0397 |
| Anything inside the 72 h free entry window (user came from CTWA ad and you answered within 24 h) | 0 |
| Messages the owner sends from the Business app | 0 |

Unconfirmed in Meta docs: 1,000 free service messages per month; free window extended to 7 days on 28-sep-2026. Do not budget on them.

Template review takes up to 24 h. A neutral quote reminder is UTILITY but Meta may reclassify it as MARKETING. Alerts to the owner's personal number are paid too; use a UTILITY template when the owner has not written in 24 h.

## Common Mistakes

- Parsing JSON before checking the signature (breaks HMAC).
- Fetching customer media later from a queue: the URL is already dead.
- Splitting every reply into several bubbles: each one is billed since 1-oct-2026.
- Treating an IG echo as a human takeover when it was the bot's own message.
- Using Embedded Signup v2/v3 or assuming coexistence works without a Tech Provider/BSP.
- Retrying marketing templates after error 131049 (per-user marketing cap): wait 24 h.
