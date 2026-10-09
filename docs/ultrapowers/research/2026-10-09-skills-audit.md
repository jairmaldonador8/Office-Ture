# Auditoría de skills · chatbot OfficeTure

Fecha: 9 de octubre de 2026. Insumos: spec y research brief del mismo día.

## Lenguaje y stack

TypeScript en Node 24, funciones de Vercel sin framework, Supabase (Postgres, `pg_cron`, `pg_net`), Claude API con herramientas, WhatsApp Cloud API, Instagram Messaging API, Google Sheets API.

## Mejores prácticas de lenguaje

| Lenguaje | Estado | Skill | Acción |
|----------|--------|-------|--------|
| TypeScript | External | `ultrapowers-dev:typescript-best-practices` y `~/.claude/skills/typescript-best-practices.md` | Ninguna. Usar vitest y biome según la skill. |

## Skills de categoría

| Categoría | Estado | Skill | Acción |
|-----------|--------|-------|--------|
| Testing / TDD | External | `ultrapowers-dev:testing-tdd` | Ninguna |
| Manejo de errores | External | `ultrapowers-dev:error-handling` | Ninguna |
| Patrones de diseño | External | `ultrapowers-dev:design-patterns` | Ninguna |
| Arquitectura | External | `ultrapowers-dev:architecture` | Ninguna |
| Base de datos | External | `ultrapowers-dev:database-design`, `supabase:supabase`, `supabase:supabase-postgres-best-practices`, `~/.claude/skills/supabase-rls-patterns.md` | Ninguna |
| Diseño de API | External | `ultrapowers-dev:api-design` | Ninguna |
| Observabilidad | External | `ultrapowers-dev:observability` | Ninguna |
| Resiliencia | External | `ultrapowers-dev:resilience` | Ninguna |
| Caché | External | `ultrapowers-dev:caching` | Solo aplica al caché de prompt, cubierto por `claude-api`. |
| Seguridad | External | `ultrapowers-dev:auth-security` | Ninguna. Firma HMAC de Meta va en la skill de dominio. |
| Trabajos en segundo plano | External | `ultrapowers-dev:background-jobs` | Ninguna. El debounce con `pg_cron` es único de este proyecto y va en el plan. |
| IA / LLM | External | `claude-api`, `ultrapowers-dev:tool-calling`, `ultrapowers-dev:agent-loop`, `ultrapowers-dev:multi-agent-handoffs` | Ninguna. Nota: el brief registra USD 0.10 por millón en lectura de caché de Sonnet 5.5 según la página de precios; la skill dice 0.20. Usar el valor de la página. |
| CI/CD | External | `ultrapowers-dev:ci-cd`, `vercel:deployments-cicd`, `vercel:vercel-functions`, `vercel:env-vars` | Ninguna |
| Tipado | External | `ultrapowers-dev:type-safety` | Ninguna |

## Competencias de dominio

| Competencia | Estado | Skill existente | Acción |
|-------------|--------|-----------------|--------|
| Webhook de WhatsApp Cloud API: firma, payload, `referral`, deduplicación | Missing | — | Crear `meta-messaging-apis` |
| Envío por WhatsApp: texto, media por id, plantillas, «escribiendo», descarga de media | Missing | — | Incluir en `meta-messaging-apis` |
| Coexistencia y alta como Tech Provider con Embedded Signup v4 | Missing | — | Incluir en `meta-messaging-apis` |
| Ventanas de 24 h y 72 h, precios por mensaje 2026, categorías de plantillas | Missing | — | Incluir en `meta-messaging-apis` |
| Instagram Messaging API: permisos, webhook, eco, envío, ventana | Missing | — | Incluir en `meta-messaging-apis` |
| Diseño conversacional de bots de venta: tono, burbujas, handoff, seguimientos, calidad del número | Missing | — | Crear `whatsapp-sales-bot-patterns` |
| Cumplimiento en México: aviso de privacidad simplificado, datos fiscales, «no me escribas» | Missing | — | Incluir en `whatsapp-sales-bot-patterns` |
| Evals de conversaciones con rúbricas y juez | Missing | — | Incluir en `whatsapp-sales-bot-patterns` |
| Claude con herramientas, caché y salida estructurada | External | `claude-api` | Ninguna |
| Debounce por fila con `pg_cron` y `skip locked` | — | — | Conocimiento de un solo proyecto: va en el plan |
| Google Sheets con cuenta de servicio | — | — | Conocimiento puntual: va en el plan |

Las dos skills nuevas son reutilizables: Top Digital vende «Chatbot con IA» a otros clientes y, como Tech Provider, conectará más números.

## Resumen

- Covered: 0 · Stale: 0 · Missing: 2 skills nuevas (8 competencias) · External: 15

## Skills a crear

1. **`meta-messaging-apis`**: WhatsApp Cloud API, coexistencia, Tech Provider, Instagram Messaging API, ventanas y precios.
2. **`whatsapp-sales-bot-patterns`**: diseño conversacional, handoff, seguimientos, calidad, cumplimiento en México, evals.

Ubicación: `.claude/skills/` del repo, para que viajen con el proyecto.

## Skills a referenciar en el plan

`typescript-best-practices`, `testing-tdd`, `error-handling`, `resilience`, `background-jobs`, `database-design`, `supabase:supabase`, `supabase-rls-patterns`, `claude-api`, `tool-calling`, `vercel:vercel-functions`, `observability`, y las dos nuevas.
