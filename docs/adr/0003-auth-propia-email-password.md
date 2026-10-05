# ADR 0003 — Autenticación propia con email + contraseña y sesiones opacas

- **Fecha:** 2026-10-05
- **Estado:** aceptada

## Contexto
Se necesitan cuentas simples (email + contraseña, verificación, reset) sin costo por usuario activo y sin depender de un tercero para el login, que además es el punto de entrada del device flow.

## Decisión
Implementación propia: hash scrypt (crypto nativo de Node), sesiones opacas aleatorias en cookie HttpOnly con solo el hash en DB, tokens de email de un uso, rate limit en login/signup/reset.

## Alternativas consideradas
| Opción | A favor | En contra |
|---|---|---|
| Propia (elegida) | Sin costo ni dependencia, control total, simple de auditar | Responsabilidad de seguridad propia |
| Auth.js | OAuth fácil | Credentials provider desaconsejado, más configuración |
| Clerk / Auth0 | Rápido, MFA incluido | Costo por MAU, lock-in |

## Consecuencias
Login social (Google/GitHub) y 2FA quedan para una fase posterior; si se agregan, considerar migrar a una librería.
