# ADR 0001 — Monorepo con desktop Python + web Next.js

- **Fecha:** 2026-10-05
- **Estado:** aceptada

## Contexto
El escaneo y la limpieza tienen que ocurrir en la PC del usuario (acceso al sistema de archivos), pero la venta por suscripción, las cuentas y el dashboard necesitan un backend en la nube. El producto existente es una app Python (Flask + PyWebView) ya funcional.

## Decisión
Mantener el desktop en Python (`desktop/`) y agregar una plataforma web Next.js + TypeScript (`web/`) en el mismo repositorio, comunicadas por una API REST versionada (`/api/v1`) definida en `docs/CONTRATO-API.md`.

## Alternativas consideradas
| Opción | A favor | En contra |
|---|---|---|
| Monorepo desktop + web (elegida) | Un solo lugar para contrato, CI y docs; cambios atómicos | Dos lenguajes en un repo |
| Reescribir el desktop en Electron/Tauri | Un solo lenguaje (TS) | Semanas de trabajo, se pierde un motor ya probado |
| Multi-repo | Permisos separados | Contrato desincronizado, más fricción para un solo dev |

## Consecuencias
El contrato es el único acoplamiento; cualquier cambio exige actualizar ambos lados en el mismo PR. Revisar si aparece una app macOS.
