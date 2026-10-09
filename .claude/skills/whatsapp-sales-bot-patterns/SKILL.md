---
name: whatsapp-sales-bot-patterns
description: Use when writing the system prompt, conversation flow, human handoff, follow-up cadence, privacy notice or evals for an AI sales assistant on WhatsApp or Instagram, especially for Mexican businesses
---

# WhatsApp sales bot patterns

## Overview

A sales bot earns trust by being short, grounded and quick to hand off. Every number comes from a tool, every reply ends with one clear next step, and a human is always one message away. Researched October 2026.

## When to Use

- Drafting or reviewing the bot's system prompt and tone rules
- Designing escalation triggers and bot/human coexistence
- Choosing follow-up timing and count
- Adding the Mexican privacy notice or consumer-law rules
- Building scripted conversation evals

## Core Patterns

### Reply shape

- One bubble per turn (each WhatsApp message is billed). Two only for photo + caption.
- 1 to 3 short sentences, at most one question (two if tightly related).
- Reply 4 to 9 s after the customer's last message: humanlike, under the ~20 s point where people suspect a delay. Show typing first.
- Buttons (max 3, 20 chars) or a list (max 10 rows) for closed choices like category or municipality; free text otherwise.
- Recommend at most 3 options. Never paste the full catalog unprompted.

### Grounding against invented prices

```ts
// System prompt rule + tool design, not just "don't hallucinate".
const reglas = `
<reglas>
1. Todo precio, stock, medida o color que menciones sale de buscar_productos en este turno.
2. Si la herramienta no lo trae, di: "Ese dato te lo confirmo con el asesor".
3. Todos los precios son + IVA; dilo siempre junto al precio.
</reglas>`;
// Eval check: every "$N" in the reply must appear in this turn's tool results.
```

### Opening from an ad

Use the ad's headline/body (WhatsApp `referral`, IG `ads_context_data.ad_title`) to skip the generic menu, without quoting it back:

> Hola, soy Mariana, asistente de OfficeTure. Vi que te interesan las sillas. ¿Para cuántas personas y qué área serían?

### Handoff

- Escalation is a tool with an enum of reasons; target ≥ 95 % precision on the eval set.
- Offer a human once, never twice in a row. Escalate automatically after 3 turns with no progress.
- Tell the customer who takes over and what happens next; then the bot goes silent.
- When the human writes (echo event), pause the bot in that chat; resume on timeout or explicit command.
- If no human answers within the SLA, the bot returns with a neutral message instead of leaving the customer hanging.

### Follow-ups

- Max 2 touches. Touch 1 at 2 to 4 h inside the 24 h window, picking up exactly where they stopped. Touch 2 next day 10:00, free if still inside the 72 h ad entry window, else a UTILITY template.
- Only 9:00 to 20:00 local. Any customer message cancels pending touches. «No me escribas» stops everything.
- Blocks and reports lower the number's quality rating and messaging limit; aggressive cadence costs reach.

### Transparency and Mexican law

- Introduce as the business assistant once; if asked whether it is a bot, say yes. Meta does not require the disclosure today; a Mexican bill from 8-sep-2026 proposes it.
- LFPDPPP 2025 art. 16-II: send a simplified privacy notice with a link **before** asking for the first personal data.
- Tax data (RFC, constancia) needs express consent: hand invoicing to the human.
- LFPC: state IVA and extra charges up front; give a complaint address/phone if asked.

### Evals

Scripted multi-turn scenarios run against the real worker, graded with binary rubrics by a judge model from a different family:

| Rubric | Pass |
|--------|------|
| Prices only from tool results | 100 % |
| Says «+ IVA» with every price | 100 % |
| Escalates on the right turn | ≥ 95 % |
| Never claims to be human | 100 % |
| Privacy notice before first personal data | 100 % |
| No exclamation marks, ≤ 1 question | ≥ 95 % |

Do not quote vendor stats («98 % open rate») to clients; measure your own from week one.

## Common Mistakes

- Prices or stock in the system prompt instead of a tool: they go stale and get invented.
- Bot keeps answering after the human joined, contradicting them.
- Asking for name, address and invoice data in the first message.
- Third and fourth reminders: they feel like bulk messaging and trigger blocks.
- Generic «¿En qué te puedo ayudar?» when the ad already told you what they want.
