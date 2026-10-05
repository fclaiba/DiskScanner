# ADR 0002 — Stripe Billing para suscripciones

- **Fecha:** 2026-10-05
- **Estado:** propuesta (a validar según país y entidad legal del titular)

## Contexto
Hay que cobrar una suscripción mensual/anual a clientes de todo el mundo, con prueba gratuita, autogestión (cambiar tarjeta, cancelar) y notificación confiable de cambios de estado.

## Decisión
Stripe Billing: Checkout (mode=subscription) + Customer Portal + webhooks. Precios definidos en Stripe y referenciados por variables de entorno. La lógica queda aislada en `web/src/server/billing`, y el resto del sistema solo lee la tabla `subscriptions` (proyección), para poder cambiar de proveedor sin tocar devices/entitlement.

## Alternativas consideradas
| Opción | A favor | En contra |
|---|---|---|
| Stripe Billing (elegida) | Mejor API y docs, portal listo, trial y cupones nativos | Requiere entidad en país soportado (no Argentina directo: Stripe Atlas/LLC); impuestos a cargo del vendedor salvo Stripe Tax |
| Paddle / Lemon Squeezy (merchant of record) | Ellos facturan y liquidan IVA/impuestos globales; aceptan vendedores de más países | Comisión mayor (~5 % + 0,50); menos control |
| Mercado Pago suscripciones | Ideal para LatAm en moneda local | Pobre para clientes globales en USD |

## Consecuencias
Si el titular no puede abrir Stripe, se implementa un adaptador Paddle/Lemon Squeezy en `server/billing` que escriba la misma tabla `subscriptions` (≈ 1 sprint). Revisar antes del lanzamiento.
