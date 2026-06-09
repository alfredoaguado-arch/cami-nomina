# CLAUDE.md — cami-nomina

## 1. Contexto general del ecosistema CAMI

Este repo (`cami-nomina`) es **uno de varios** que conforman el sistema CAMI de Aceros Manufacturados. Antes de tocar este repo, conviene saber dónde encaja.

CAMI es una plataforma modular para operación interna (construcción / manufactura). Cada módulo es una app web separada, mobile-first, en su propio repo de GitHub bajo `alfredoaguado-arch/`. Todos comparten un backend de autenticación común y se montan vía GitHub Pages.

**Repos del ecosistema:**

| Repo | Propósito |
|---|---|
| `cami-app2` | Hub de login + lanzador de módulos |
| `cami-ot` | Órdenes de trabajo |
| `cami-almacen` | Almacén |
| `cami-presupuesto` | Cotizaciones / presupuestos |
| `cami-requisicion` | Requisiciones de pago |
| `cami-nomina` | **Este repo.** Nómina quincenal |
| `cami-reportes` | Reportes fotográficos |

**Stack global:**
- Frontend: HTML/CSS/JS puro, sin frameworks ni build. Un solo `index.html` por módulo.
- Backend: Google Apps Script. Cada módulo tiene su propio script *bound* a un Google Sheet. Existe además un **Apps Script central** para auth.
- Datos: Google Sheets.
- Documentos: Google Drive (PDFs).
- Hosting: GitHub Pages hoy; migración planeada a Hostinger (`aceroscami.com`).

## 2. Qué es este módulo

`cami-nomina` es el módulo de **nómina quincenal**. Es uno de los módulos más complejos del ecosistema porque maneja flujos múltiples con varios roles, cálculos con tope IMSS y dispersión proporcional.

**Versión actual:** v3.9.0 (sprint selector quincenas + reabrir bulk, 22-may-2026). Modelo de cálculo A/B/C fijado en v3.8.3 (20-may-2026). VERSION (Code.gs) y VERSION_FRONTEND (index.html) deben ir parejos.

## 3. Roles y app keys

| Rol | App key | Qué hace |
|---|---|---|
| RH | `nomina-rh` | CRUD de catálogo de empleados |
| Supervisor de obra | `nomina-supervisor` | Captura días/extras/viáticos de empleados en su obra |
| Aprobador | `nomina-aprobar` | Revisa y aprueba/rechaza capturas de supervisores |
| Finanzas (Mariana) | `nomina-finanzas` | Maneja captura administrativa de empleados de oficina |

## 4. Modelo de quincena

**Quincena:** ciclo de 14 días naturales que empieza un jueves y termina el siguiente miércoles. Pago el sábado posterior.

**Calendario en la app:**
- 12 cuadros (no 14): los domingos NO aparecen porque nadie trabaja domingo
- Internamente los offsets siguen siendo 0-13 (los offsets que caen en domingo simplemente no se renderizan)
- Grid de 6 columnas × 2 filas

**Marcas posibles por día:**
| Marca | Significado | ¿Paga? |
|---|---|---|
| T | Trabajado | Sí |
| D | Descanso / puente / permiso pagado | Sí |
| F | Falta | No |
| B | Baja | No (ese día ni siguientes) |
| vacío | Sin captura | N/A |

## 5. Regla de cálculo (CRÍTICA — no cambiar sin confirmación)

**Bruto base del empleado:**
```
bruto = (días T + días D) × tarifa_diaria + horas_extras + viáticos
```
(Detalle completo del modelo en `Code.gs` líneas 28-77.)

**Tope IMSS quincenal:** $4,410.56 por empleado IMSS.

**Modelo de pago — 3 casos (fijado v3.8.3, 20-may-2026):**

| Caso | Quién | NOMINA_DIRECTO | Pasa por contadores | Comisión 6% | REINTEGRO |
|---|---|---|---|---|---|
| **A** | IMSS con bruto > tope | Tope prorrateado por días T+D entre proyectos | Sí (excedente = bruto − tope) | Sí, sobre bruto del proyecto | Sí, por el tope |
| **B** | IMSS con bruto ≤ tope | Bruto entero (CAMI paga directo como proveedor) | **No** | **No** | **No** |
| **C** | NO_IMSS | $0 | Sí (todo el bruto va por contadores) | Sí, sobre bruto del proyecto | No |

**Implicación:** Caso B y C cambian fundamentalmente cómo se construyen las filas de TRANSACCIONES en Fase 3f. Antes de tocar fórmulas, confirmar contra estos 3 casos.

## 6. Estado actual de las fases

| Fase | Estado | Notas |
|---|---|---|
| 1 — Catálogo de empleados | ✓ Desplegado | CRUD completo, 12 empleados precargados |
| 2 — Captura por obra (supervisores) | ✓ En uso real | Quincena automática, calendario, bloqueo de doble captura, extras, viáticos, herencia de empleados |
| 3a — Panel de aprobación | ✓ Desplegado | Revisión consolidada, aprobar/rechazar, detección de conflictos |
| 3c — Captura administrativa (Mariana) | ✓ Desplegado | Cierre directo sin aprobación |
| 3b — Cálculo automático al aprobar | ✓ Completada (18-may-2026) | Tope IMSS, dispersión proporcional por días T+D, snapshot en NOMINA_RESULTADOS + agregados en NOMINA_AGREGADOS |
| **3e — Excel + email a contadores** | ⏳ Pendiente | Workbook con pestañas por proyecto + ADMINISTRATIVA, envío automático |
| 3d — PDFs detallado / resumido | ⏳ Pendiente | Post-migración |
| 3f — Marcar pagada + TRANSACCIONES | ⏳ Pendiente | Post-migración |

## 7. Estructura del Sheet (CAMI-Nomina-DB)

**Hojas:**
- `EMPLEADOS` — catálogo (Fase 1)
- `QUINCENAS` — registro de quincenas creadas (id, fechas, estado)
- `CAPTURAS` — una fila por (supervisor, proyecto, quincena)
- `CAPTURA_DIAS` — una fila por (captura, empleado, dia_offset, marca)
- `CAPTURA_EXTRAS` — horas extras
- `CAPTURA_VIATICOS` — viáticos
- `APROBACIONES_LOG` — log de aprobaciones / rechazos / reaperturas
- `NOMINA_RESULTADOS` — snapshot por empleado×proyecto del cálculo (Fase 3b)
- `NOMINA_AGREGADOS` — totales por empleado por quincena, sin desglose por proyecto (Fase 3b)

**Columnas de NOMINA_RESULTADOS** (autoritativas en `Code.gs:194`):
`id_resultado, id_quincena, id_captura, id_empleado, empleado_nombre, proyecto, dias_t, dias_d, dias_f, dias_b, dias_pagables, tarifa_diaria, bruto_base, extras, viaticos, bruto_total, tope_imss_aplicable, nomina_directo, excedente, comision, total_neto, timestamp_calculo, guardado_por`

**Columnas de NOMINA_AGREGADOS** (autoritativas en `Code.gs:195`):
`id_quincena, proyecto, total_empleados, total_dias_t, total_dias_d, total_bruto, total_nomina_directo, total_excedente, total_comision, monto_nomina_transaccion, timestamp_calculo, guardado_por`

## 8. Categorías de TRANSACCIONES (cuando se implemente 3f)

**SOLO 3 categorías** (no 4 como inicialmente planeado):

| Categoría | Quién paga | Quién recibe | Cuándo |
|---|---|---|---|
| `NOMINA` | CAMI | Contadores | 1 fila por proyecto. Monto = bruto_proyecto × 1.06 (comisión 6% incluida). |
| `REINTEGRO_NOMINA` | Alfredo | CAMI | 1 fila por quincena, proyecto = TRANSITO. Suma de topes IMSS efectivos. |
| `NOMINA_DIRECTO` | CAMI | Empleado IMSS | 1 fila por (empleado, proyecto). Tope IMSS repartido proporcional a días T+D. |

**La comisión 6% va DENTRO del monto de NOMINA. No es categoría separada.**

## 9. Flujo del dinero (importante para entender 3b y 3f)

```
PASO 1 — CAMI → Contadores
  Transferencia por proyecto, monto = bruto_del_proyecto × 1.06
  Se registra como NOMINA en TRANSACCIONES (1 fila por proyecto)

PASO 2 — Contadores → Empleado (flujo externo, NO se registra)
  Contadores le pagan al empleado el excedente del tope IMSS (o el sueldo completo si es NO_IMSS)

PASO 3 — Contadores → Alfredo (cuenta personal, flujo externo, NO se registra)
  Contadores le pagan a Alfredo la suma de los topes IMSS

PASO 4 — Alfredo → CAMI
  Alfredo deposita a CAMI la suma de los topes IMSS
  Se registra como REINTEGRO_NOMINA en TRANSACCIONES (1 fila, proyecto = TRANSITO)

PASO 5 — CAMI → Empleado IMSS
  CAMI dispersa el tope al empleado, repartido por proyecto según días T+D
  Se registra una fila NOMINA_DIRECTO por cada (empleado, proyecto)
```

## 10. Patrón de autenticación

Como todos los módulos del ecosistema:

1. Lee `sessionStorage.cami_session` (JSON con `{token, nombre, rol, apps, proyectos}`)
2. Manda `token` en cada request a su propio Apps Script
3. El Apps Script valida el token vía HTTP contra el central antes de procesar
4. Si el token expiró (4h), redirige a login

**Cache local de tokens:** El backend cachea tokens validados por 10 minutos para reducir round-trips al central.

## 11. Detalles operativos importantes

**Quincenas con capturas pendientes:**
- Si el supervisor tiene capturas en BORRADOR/ENVIADA/RECHAZADA de quincenas anteriores, la app le abre por default la quincena más reciente con pendientes
- Máximo 3 quincenas hacia atrás
- Selector dropdown aparece solo si hay 2 o más quincenas capturables

**Conflictos entre capturas:**
- Bloqueo en tiempo real: si dos supervisores intentan marcar T para el mismo empleado el mismo día, el segundo recibe toast de CONFLICTO
- Aplica también entre captura admin (Mariana) y supervisor de obra
- Conflictos no-T (ej. T en una vs D en otra) se detectan al aprobar pero no se bloquean al capturar

**Estados:**
- Capturas normales: BORRADOR → ENVIADA → APROBADA / RECHAZADA
- Capturas admin: BORRADOR → CERRADA (sin aprobación intermedia)

## 12. Sueldos actuales (al 8-may-2026)

Los datos de tarifas viven en el catálogo EMPLEADOS del sheet. Valores actuales de referencia (no editar a mano sin sincronizar con el sheet):

- Eduardo Alejandro de Hoyos: $3,000/semana = $500/día (NO_IMSS)
- JM García Montalvo: $7,000/semana = $1,166.67/día (IMSS)
- Mariana Bada: $2,000/semana = $333.33/día (NO_IMSS)

Tope IMSS quincenal: $4,410.56 para todos los IMSS.

## 13. Conexiones con otros módulos

**Con TRANSACTION DB (Google Sheet externo):**
- Lee `CAT_PROYECTOS` para mostrar proyectos activos
- (Futuro) Escribirá en `TRANSACCIONES` al marcar pagada (fase 3f)

**Con Sheet de Usuarios (auth):**
- Lee columna `Obras asignadas` para filtrar proyectos del supervisor

**Con `cami-requisicion`:**
- La categoría NOMINA en requisición es el flujo manual antiguo. Cuando 3f esté listo, cami-nomina automatizará esos pagos.

## 14. Reglas de modificación

**SÍ tocar este repo cuando:**
- Implementar fases pendientes (3b, 3d, 3e, 3f)
- Bugs en captura de días / extras / viáticos
- Ajustes al flujo de aprobación
- Mejoras de performance (lentitud reportada al cambiar pestañas)

**NO tocar este repo cuando:**
- Cambios al patrón de auth global (eso es cami-app2 + central)
- Cambios a las reglas de cálculo SIN confirmar con Alfredo
- Cambios al modelo de quincena (jue-mié) sin confirmar

**Antes de cualquier cambio:**
- Confirmar el plan conmigo (Alfredo) antes de generar código
- Si toca cálculo monetario, validar contra ejemplos concretos antes de desplegar
- Si toca estructura de datos del sheet, verificar que no rompe capturas existentes

## 15. Despliegue

**Frontend (GitHub Pages):**
- Push a `main` despliega automáticamente
- URL: `https://alfredoaguado-arch.github.io/cami-nomina/`
- Tarda 1-2 minutos. Recarga forzada (Ctrl+Shift+R) después

**Backend (Apps Script):**
- Editar en el editor de Apps Script bound a CAMI-Nomina-DB
- Deploy → Manage deployments → ✏️ → New version → Deploy
- La URL del endpoint NO cambia entre versiones

## 16. Pendientes inmediatos

> **Sprint v3.9.0 cerrado 22-may-2026.** Panel Aprobación ahora tiene: selector de últimas 4 quincenas (multi-app), badge `estado_calculo` (calculada / sin-snapshot), botón "Reabrir toda la quincena" (endpoint `reabrirQuincenaCompleta`), textos contextuales según snapshot.
>
> **Modelo de pago A/B/C fijado en v3.8.3 (20-may-2026)** tras validación operativa.

1. **Fase 3e — Excel + email a contadores** (siguiente sprint)
2. **Fase 3d — PDFs detallado / resumido** (rama en progreso: `feature/3d-pdf-detallado-adapter`, WIP v3.7)
3. **Performance:** lentitud reportada al cambiar pestañas. Quick win: spinner global más prominente. Optimización profunda: endpoint combinado `initSupervisorData`, cache local en sessionStorage. Esto último post-migración.

## 17. Migración planeada

A futuro, este módulo se mueve a Hostinger bajo `aceroscami.com/nomina/`. Antes de migrar:
- Cerrar Fases 3b y 3e
- Tener al menos 2 quincenas reales validadas con la app

## 18. Patrón de colaboración con Claude

- Alfredo confirma plan antes de codear cualquier cambio
- Para temas de cálculo de nómina, validar reglas contra documento maestro y memoria antes de tocar fórmulas
- Los cambios se prueban primero en local antes de hacer commit
- Siempre commit con mensaje descriptivo (`vX.Y — qué cambia`)
- Después de commit, recarga forzada en la app para validar
