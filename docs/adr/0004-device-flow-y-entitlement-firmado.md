# ADR 0004 — Device flow + entitlement firmado con Ed25519

- **Fecha:** 2026-10-05
- **Estado:** aceptada (reemplaza el licenciamiento por Gumroad del commit inicial)

## Contexto
La versión inicial validaba claves de Gumroad (pago único). Con suscripción, el desktop debe saber si la cuenta está al día, funcionar offline y resistir la falsificación casual del estado "Pro".

## Decisión
- Vinculación con OAuth 2.0 Device Authorization Grant simplificado (código `XXXX-XXXX` aprobado en la web).
- El servidor emite un **entitlement firmado con Ed25519** (válido 7 días) que el desktop verifica con claves públicas embebidas (`kid` para rotación) y guarda cifrado con una clave derivada del fingerprint de la máquina.
- El servidor local del desktop exige token por arranque y Host local (anti-CSRF / DNS rebinding).

## Alternativas consideradas
| Opción | A favor | En contra |
|---|---|---|
| Device flow + entitlement firmado (elegida) | Offline seguro, sin pegar claves, UX moderna | Más piezas (firma, rotación) |
| Clave de licencia pegada a mano | Simple | Mala UX para suscripción, fácil de compartir |
| Consulta online en cada acción | Simple y difícil de crackear | No funciona offline, latencia |

## Consecuencias
La clave privada vive solo en Vercel; rotación = nueva clave con nuevo `kid`, release del desktop con ambas públicas, luego retirar la vieja. El parcheo del binario sigue siendo posible (riesgo aceptado).
