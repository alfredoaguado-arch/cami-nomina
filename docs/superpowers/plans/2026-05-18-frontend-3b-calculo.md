# Cami-Nomina Fase 3b Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cablear el frontend del panel `nomina-aprobar` a los 3 endpoints nuevos del backend Fase 3b (`calcularNominaPreview`, `obtenerCalculoNomina`, `guardarCalculoNomina`), con vista propia "Calcular nómina" y badge en el header de la quincena activa.

**Architecture:** Single-file HTML/JS sin framework. Una vista nueva (`panel-aprob-calc`) registrada en el router `cambiarVista()` existente. Una función adaptadora `normalizarCalculo()` unifica los shapes de preview y snapshot a nombres canónicos del snapshot persistido. Estado vive en 3 globals nuevos (`aprobCalculoSnapshot`, `aprobCalculoPreview`, `aprobCalculoLoading`).

**Tech Stack:** HTML5 + Vanilla JS ES5-compatible (sin frameworks, sin build, sin imports). Google Apps Script backend (ya desplegado v3.7). GitHub Pages hosting.

---

## Pre-flight

### Branch y commits previos
- Rama actual: `feature/3b-frontend-calculo` (desde `main`)
- Commits previos en esta rama:
  - `1651ffe` backend v3.6 — agrega `guardado_por`
  - `67abc2b` backend v3.7 — agrega `empleado_nombre` autocontenido en snapshot
- Backend productivo desplegado en v3.7, hojas recreadas con esquemas nuevos.

### Estrategia de validación
- **No hay test framework.** Validación = abrir `index.html` localmente en navegador, ejercitar la UI, monitorear `console` y `Network` tab.
- Frontend apunta a backend productivo (`BACKEND_URL` constante). Lecturas (`obtenerCalculoNomina`, `calcularNominaPreview`) son seguras de ejecutar en cualquier momento. Escrituras (`guardarCalculoNomina`) escriben al sheet productivo — solo ejecutar cuando exista quincena con capturas APROBADA, idealmente jueves 21-may cuando 2026-05-07 cierre.
- **Validación end-to-end completa diferida a jueves 21-may.** Hasta entonces validamos por inspección estructural: sin errores en consola, badge y botón renderizan correctamente, vista calc carga, preview con 0 filas no rompe.

### Archivo único modificado
- `C:\CAMI\cami-nomina\index.html` (~2207 líneas al inicio del plan)

---

## Mapas de referencia (insertion points en `index.html`)

| Sección | Líneas | Para qué |
|---|---|---|
| Variables globales de estado | ~700-720 | Insertar `aprobCalculoSnapshot`, `aprobCalculoPreview`, `aprobCalculoLoading`, `VERSION_FRONTEND` |
| `callBackend` / helpers | ~830-860 | Insertar `round2`, `formatCurrency`, `formatTimestampLocal`, `normalizarCalculo`, `calcularTotalesDesdeResultados` |
| `cambiarVista()` | ~790-822 | Registrar nuevo panel `aprob-calc` |
| `onBack()` | ~824-828 | Agregar caso `aprob-calc → aprob` |
| `initAprob()` | ~1993-2028 | Extender con fetch de snapshot y render de badge/botón |
| `#panel-aprob` HTML | ~327-351 | Inyectar badge + botón en el header |
| Después de `#panel-aprob-cap` (línea 369) | inserción | Nuevo `#panel-aprob-calc` |
| `function toast` | 2436 | Marcador de "fin de funciones JS" |

---

## Shapes de referencia

### Preview (`calcularNominaPreview` → `calcularNomina`):
```js
{ ok, quincena_id, capturas_incluidas, capturas_omitidas, warnings,
  resultados: [{ id_captura, empleado_id, empleado_nombre, empleado_tipo, proyecto,
                 dias_t, dias_d, dias_f, dias_b, dias_pagables, tarifa_diaria,
                 monto_salario, monto_extras, monto_viaticos, bruto_proyecto,
                 tope_imss_aplicado, nomina_directo, excedente, comision_6pct,
                 total_a_contadores }],
  agregados_proyecto: [{ proyecto, num_empleados, dias_t, dias_d, bruto_total,
                         comision_6pct, total_a_contadores, nomina_directo_total }],
  totales: { bruto_total, comision_6pct, total_a_contadores, nomina_directo_total,
             reintegro_total, ... } }
```

### Snapshot (`obtenerCalculoNomina`):
```js
{ ok, quincena_id, calculado, timestamp_calculo, guardado_por, estado_quincena,
  resultados: [{ id_resultado, id_quincena, id_captura, id_empleado, empleado_nombre,
                 proyecto, dias_t, ..., bruto_base, extras, viaticos, bruto_total,
                 tope_imss_aplicable, nomina_directo, excedente, comision, total_neto,
                 timestamp_calculo, guardado_por }],
  agregados: [{ id_quincena, proyecto, total_empleados, total_dias_t, total_dias_d,
                total_bruto, total_nomina_directo, total_excedente, total_comision,
                monto_nomina_transaccion, timestamp_calculo, guardado_por }] }
```

### Shape canónico (después del adapter)
```js
{ source: 'preview'|'snapshot',
  metadata: { timestamp_calculo, guardado_por, estado_quincena, warnings },
  resultados: [{ id_captura, id_empleado, empleado_nombre, proyecto,
                 dias_t, dias_d, dias_f, dias_b, dias_pagables, tarifa_diaria,
                 bruto_base, extras, viaticos, bruto_total, tope_imss_aplicable,
                 nomina_directo, excedente, comision, total_neto }],
  agregados: [{ proyecto, total_empleados, total_dias_t, total_dias_d, total_bruto,
                total_nomina_directo, total_excedente, total_comision,
                monto_nomina_transaccion }],
  totales: { bruto, nomina_directo, excedente, comision, a_contadores,
             tope_imss, num_empleados, num_proyectos } }
```

---

## Task 1: State vars + helpers + adapter

**Files:**
- Modify: `index.html` (insertar en zonas mapeadas arriba)

**Commit:** `frontend 3b-1: state + adapter + helpers`

- [ ] **Step 1.1: Agregar `VERSION_FRONTEND` y 3 state vars**

Insertar después de la última declaración `let` en la zona de globals (~línea 720, justo después del bloque que incluye `quincenasCapturablesAdmin`, `adminQuincenaSeleccionada`):

```js
// ═══ FASE 3b FRONTEND: estado del cálculo de nómina ═══
const VERSION_FRONTEND = '3.5';
let aprobCalculoSnapshot = null;  // shape canónico (source='snapshot') o null si no hay
let aprobCalculoPreview = null;   // shape canónico (source='preview') o null
let aprobCalculoLoading = false;  // anti-doble-click en botones Recalcular/Guardar
```

- [ ] **Step 1.2: Agregar 3 helpers de formato**

Insertar inmediatamente después de la función `sleep` (línea ~860):

```js
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

function formatCurrency(n) {
  const num = Number(n || 0);
  return '$' + num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTimestampLocal(s) {
  if (!s) return '—';
  const str = String(s);
  // Backend devuelve "YYYY-MM-DD HH:MM:SS" en hora del servidor de Apps Script.
  // Mostramos tal cual con formato visualmente compacto.
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return str;
  return m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5];
}
```

- [ ] **Step 1.3: Agregar el adapter `normalizarCalculo` y `calcularTotalesDesdeResultados`**

Insertar inmediatamente después de los 3 helpers anteriores:

```js
function calcularTotalesDesdeResultados(resultados) {
  let bruto = 0, nd = 0, tope = 0;
  const empleados = {}, proyectos = {};
  resultados.forEach(function (r) {
    bruto += r.bruto_total;
    nd   += r.nomina_directo;
    tope += r.tope_imss_aplicable;
    empleados[r.id_empleado] = true;
    proyectos[r.proyecto] = true;
  });
  return {
    bruto:          round2(bruto),
    nomina_directo: round2(nd),
    excedente:      round2(bruto - nd),
    comision:       round2(bruto * 0.06),
    a_contadores:   round2(bruto * 1.06),
    tope_imss:      round2(tope),
    num_empleados:  Object.keys(empleados).length,
    num_proyectos:  Object.keys(proyectos).length
  };
}

// Adapter: normaliza calcularNominaPreview() y obtenerCalculoNomina() al mismo shape.
// Nombres canónicos = nombres del snapshot persistido (bruto_base, bruto_total,
// tope_imss_aplicable, comision, total_neto). El frontend SIEMPRE consume este shape.
function normalizarCalculo(raw, source) {
  if (source === 'snapshot') {
    const resultados = (raw.resultados || []).map(function (r) {
      return {
        id_captura:          r.id_captura,
        id_empleado:         r.id_empleado,
        empleado_nombre:     r.empleado_nombre || ('(empleado #' + r.id_empleado + ')'),
        proyecto:            r.proyecto,
        dias_t:              Number(r.dias_t || 0),
        dias_d:              Number(r.dias_d || 0),
        dias_f:              Number(r.dias_f || 0),
        dias_b:              Number(r.dias_b || 0),
        dias_pagables:       Number(r.dias_pagables || 0),
        tarifa_diaria:       Number(r.tarifa_diaria || 0),
        bruto_base:          Number(r.bruto_base || 0),
        extras:              Number(r.extras || 0),
        viaticos:            Number(r.viaticos || 0),
        bruto_total:         Number(r.bruto_total || 0),
        tope_imss_aplicable: Number(r.tope_imss_aplicable || 0),
        nomina_directo:      Number(r.nomina_directo || 0),
        excedente:           Number(r.excedente || 0),
        comision:            Number(r.comision || 0),
        total_neto:          Number(r.total_neto || 0)
      };
    });
    const agregados = (raw.agregados || []).map(function (a) {
      return {
        proyecto:                 a.proyecto,
        total_empleados:          Number(a.total_empleados || 0),
        total_dias_t:             Number(a.total_dias_t || 0),
        total_dias_d:             Number(a.total_dias_d || 0),
        total_bruto:              Number(a.total_bruto || 0),
        total_nomina_directo:     Number(a.total_nomina_directo || 0),
        total_excedente:          Number(a.total_excedente || 0),
        total_comision:           Number(a.total_comision || 0),
        monto_nomina_transaccion: Number(a.monto_nomina_transaccion || 0)
      };
    });
    return {
      source: 'snapshot',
      metadata: {
        timestamp_calculo: raw.timestamp_calculo,
        guardado_por:      raw.guardado_por,
        estado_quincena:   raw.estado_quincena,
        warnings:          []
      },
      resultados: resultados,
      agregados:  agregados,
      totales:    calcularTotalesDesdeResultados(resultados)
    };
  }
  // source === 'preview'
  const resultados = (raw.resultados || []).map(function (r) {
    return {
      id_captura:          r.id_captura,
      id_empleado:         r.empleado_id,
      empleado_nombre:     r.empleado_nombre || ('(empleado #' + r.empleado_id + ')'),
      proyecto:            r.proyecto,
      dias_t:              Number(r.dias_t || 0),
      dias_d:              Number(r.dias_d || 0),
      dias_f:              Number(r.dias_f || 0),
      dias_b:              Number(r.dias_b || 0),
      dias_pagables:       Number(r.dias_pagables || 0),
      tarifa_diaria:       Number(r.tarifa_diaria || 0),
      bruto_base:          Number(r.monto_salario || 0),
      extras:              Number(r.monto_extras || 0),
      viaticos:            Number(r.monto_viaticos || 0),
      bruto_total:         Number(r.bruto_proyecto || 0),
      tope_imss_aplicable: Number(r.tope_imss_aplicado || 0),
      nomina_directo:      Number(r.nomina_directo || 0),
      excedente:           Number(r.excedente || 0),
      comision:            Number(r.comision_6pct || 0),
      total_neto:          Number(r.total_a_contadores || 0)
    };
  });
  const agregados = (raw.agregados_proyecto || []).map(function (a) {
    const totalBruto = Number(a.bruto_total || 0);
    const totalNd    = Number(a.nomina_directo_total || 0);
    return {
      proyecto:                 a.proyecto,
      total_empleados:          Number(a.num_empleados || 0),
      total_dias_t:             Number(a.dias_t || 0),
      total_dias_d:             Number(a.dias_d || 0),
      total_bruto:              totalBruto,
      total_nomina_directo:     totalNd,
      total_excedente:          round2(totalBruto - totalNd),
      total_comision:           Number(a.comision_6pct || 0),
      monto_nomina_transaccion: Number(a.total_a_contadores || 0)
    };
  });
  return {
    source: 'preview',
    metadata: {
      timestamp_calculo: null,
      guardado_por:      null,
      estado_quincena:   null,
      warnings:          raw.warnings || []
    },
    resultados: resultados,
    agregados:  agregados,
    totales:    calcularTotalesDesdeResultados(resultados)
  };
}
```

- [ ] **Step 1.4: Validación en browser**

Abrir `C:\CAMI\cami-nomina\index.html` en navegador (file://). Login con sesión válida (lo redirige al hub si no la hay — abrir hub primero o usar sesión existente en localStorage).

En consola del navegador:
```js
typeof normalizarCalculo  // → "function"
typeof round2             // → "function"
round2(3.14159)           // → 3.14
formatCurrency(1234567.89)// → "$1,234,567.89"
formatTimestampLocal('2026-05-18 18:30:42')  // → "18/05/2026 18:30"
normalizarCalculo({resultados:[], agregados:[]}, 'snapshot')
// → {source:'snapshot', metadata:{...nulls}, resultados:[], agregados:[], totales:{bruto:0,...}}
```

Expected: 0 errores en consola. Helpers retornan valores esperados.

- [ ] **Step 1.5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
frontend 3b-1: state + adapter + helpers

Bloque 1/7 del cierre de Fase 3b frontend.

- VERSION_FRONTEND = '3.5' (primera versión "real" del frontend con const)
- Estado nuevo: aprobCalculoSnapshot, aprobCalculoPreview, aprobCalculoLoading
- Helpers: round2, formatCurrency, formatTimestampLocal
- Adapter normalizarCalculo(raw, source): unifica preview y snapshot al
  shape canónico (nombres del snapshot persistido). Decisión arquitectural:
  las funciones de render no saben si pintan preview o snapshot.
- calcularTotalesDesdeResultados: ya no depende de preview.totales

Sin cambios visuales aún. Pieza inerte que valida solo en consola.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: HTML scaffold + trigger logic + badge

**Files:**
- Modify: `index.html`

**Commit:** `frontend 3b-2: scaffold panel + badge + botón en header`

- [ ] **Step 2.1: Inyectar badge + botón en el header de `#panel-aprob`**

Reemplazar las líneas 328-336 (`<div class="cap-toolbar">...</div>`) con:

```html
  <div class="cap-toolbar">
    <div class="cap-toolbar-row">
      <span class="cap-info">Quincena: <b id="aprob-quin-id">—</b></span>
      <span id="aprob-badge-snapshot"></span>
      <button class="btn btn-secondary btn-sm" onclick="initAprob()">↻ Recargar</button>
    </div>
    <div class="cap-toolbar-row">
      <span class="cap-info" id="aprob-quin-fechas">—</span>
    </div>
    <div class="cap-toolbar-row" id="aprob-fila-boton-calcular" style="display:none">
      <button id="aprob-btn-calcular" class="btn btn-primary btn-block" onclick="irACalcular()">Calcular nómina</button>
    </div>
  </div>
```

(El botón va en su propia fila para que tenga ancho completo en mobile. `display:none` por default; lo habilitamos al renderear.)

- [ ] **Step 2.2: Insertar el nuevo panel `#panel-aprob-calc` después de `#panel-aprob-cap`**

Insertar después de la línea 369 (el `</div>` que cierra `#panel-aprob-cap`):

```html

<!-- ═══ PANEL APROBACIÓN — VISTA DE CÁLCULO DE NÓMINA (Fase 3b) ═══ -->
<div id="panel-aprob-calc" class="container" style="display:none">
  <div class="cap-toolbar" id="aprob-calc-header"></div>
  <div id="aprob-calc-banner"></div>
  <div id="aprob-calc-metrics"></div>
  <div id="aprob-calc-tabla-proyecto"></div>
  <div id="aprob-calc-detalle-empleado"></div>
  <div class="fab-bar" id="aprob-calc-fab"></div>
</div>
```

- [ ] **Step 2.3: Registrar el panel en `cambiarVista()` (línea ~790-822)**

En la lista de `display = (v === '...') ? 'block' : 'none'` (líneas 800-805), agregar después de la línea de `panel-aprob-cap`:

```js
  document.getElementById('panel-aprob-calc').style.display = (v === 'aprob-calc') ? 'block' : 'none';
```

En el `tabActiva` ternario (línea 797), extender:

```js
    const tabActiva = (v === 'cap-detail') ? 'sup' : (v === 'aprob-cap' || v === 'aprob-calc') ? 'aprob' : v;
```

En el subtítulo del topbar (líneas 807-814), agregar caso para `aprob-calc`:

```js
    v === 'aprob-calc' ? 'Nómina · Calcular ' + (aprobQuincena ? aprobQuincena.id : '') :
```

(Insertar entre la línea de `aprob-cap` y `admin`.)

Al final de `cambiarVista()` (líneas 816-821), agregar trigger del init:

```js
  if (v === 'aprob-calc')                                  initAprobCalc();
```

- [ ] **Step 2.4: Agregar caso en `onBack()` (líneas 824-828)**

Modificar `onBack` para insertar antes del fallback:

```js
function onBack() {
  if (vista === 'cap-detail')      { cambiarVista('sup'); return; }
  if (vista === 'aprob-cap')       { cambiarVista('aprob'); return; }
  if (vista === 'aprob-calc')      { cambiarVista('aprob'); return; }
  window.location.href = HUB_URL;
}
```

- [ ] **Step 2.5: Agregar `puedeCalcularQuincena()`**

Insertar inmediatamente antes de `initAprob` (línea ~1992):

```js
function puedeCalcularQuincena() {
  if (!aprobCapturas || aprobCapturas.length === 0) {
    return { enabled: false, reason: 'Aún no hay capturas en esta quincena' };
  }
  const enviadas = aprobCapturas.filter(function (c) { return c.estado === 'ENVIADA'; }).length;
  if (enviadas > 0) {
    return { enabled: false, reason: 'Aún hay ' + enviadas + ' captura' + (enviadas === 1 ? '' : 's') + ' pendiente' + (enviadas === 1 ? '' : 's') + ' de revisar' };
  }
  return { enabled: true, reason: '' };
}
```

- [ ] **Step 2.6: Agregar `renderAprobHeaderBadge` y `renderAprobHeaderBoton`**

Insertar inmediatamente después de `puedeCalcularQuincena()`:

```js
function renderAprobHeaderBadge(calc) {
  const el = document.getElementById('aprob-badge-snapshot');
  if (!el) return;
  if (calc && calc.source === 'snapshot' && calc.metadata.timestamp_calculo) {
    el.innerHTML = '<span class="snap-badge calculada">✓ Calculada · ' +
                   escapeHtml(formatTimestampLocal(calc.metadata.timestamp_calculo)) + '</span>';
  } else {
    el.innerHTML = '<span class="snap-badge sin-snapshot">Sin snapshot</span>';
  }
}

function renderAprobHeaderBoton() {
  const fila = document.getElementById('aprob-fila-boton-calcular');
  const btn  = document.getElementById('aprob-btn-calcular');
  if (!fila || !btn) return;
  fila.style.display = 'flex';
  const estado = puedeCalcularQuincena();
  if (estado.enabled) {
    btn.disabled = false;
    btn.removeAttribute('title');
    btn.classList.remove('btn-disabled-tooltip');
  } else {
    btn.disabled = true;
    btn.setAttribute('title', estado.reason);
    btn.classList.add('btn-disabled-tooltip');
  }
}
```

- [ ] **Step 2.7: Modificar `initAprob()` para fetcheo secuencial del snapshot**

En `initAprob` (línea 1993-2028), reemplazar el bloque actual del `Promise.all` y el resto del try:

**Reemplazar líneas 1999-2027** (desde `try {` hasta el cierre del `try` antes del `catch`):

```js
  try {
    const r = await callBackend('listarCapturasParaAprobar', {});
    aprobQuincena = r.quincena;
    aprobCapturas = r.capturas || [];

    const quincenaId = aprobQuincena ? aprobQuincena.id : null;

    const [c, s] = await Promise.all([
      callBackend('detectarConflictos', {}),
      quincenaId
        ? callBackend('obtenerCalculoNomina', { quincena_id: quincenaId })
        : Promise.resolve({ ok: true, calculado: false })
    ]);
    aprobConflictos = c.conflictos || [];
    aprobCalculoSnapshot = s.calculado ? normalizarCalculo(s, 'snapshot') : null;

    document.getElementById('aprob-quin-id').textContent = aprobQuincena.id;
    if (aprobQuincena.fecha_inicio) {
      document.getElementById('aprob-quin-fechas').textContent =
        `Del ${aprobQuincena.fecha_inicio} al ${aprobQuincena.fecha_fin} · Pago: ${aprobQuincena.fecha_pago}`;
    } else {
      document.getElementById('aprob-quin-fechas').textContent = '';
    }

    const res = r.resumen || {};
    document.getElementById('rs-enviada').textContent   = res.ENVIADA   || 0;
    document.getElementById('rs-aprobada').textContent  = res.APROBADA  || 0;
    document.getElementById('rs-borrador').textContent  = res.BORRADOR  || 0;
    document.getElementById('rs-rechazada').textContent = res.RECHAZADA || 0;

    renderConflictosBanner();
    renderAprobLista();
    renderAprobHeaderBadge(aprobCalculoSnapshot);
    renderAprobHeaderBoton();
  } catch(err) {
    lista.innerHTML = '<div class="empty">Error: ' + err.message + '</div>';
    toast(err.message, 'error');
  }
}
```

Nota: el patrón es secuencial para `listarCapturasParaAprobar` (necesitamos el `quincena_id` para luego pedir el snapshot), pero `detectarConflictos` y `obtenerCalculoNomina` corren en paralelo. Aproximadamente +1 round-trip vs el original.

- [ ] **Step 2.8: Stubs de `initAprobCalc` e `irACalcular`**

Insertar al final de la sección "FASE 3a" o justo antes de "FASE 3c" (después de `confirmarReabrir`, ~línea 2220), para que los `onclick` no truenen:

```js
// ═══════════════════════════════════════════════════════════════════════════════
// ═══ FASE 3b: VISTA DE CÁLCULO DE NÓMINA                                    ═══
// ═══════════════════════════════════════════════════════════════════════════════

function irACalcular() {
  if (!aprobQuincena) { toast('Cargá la quincena primero', 'error'); return; }
  cambiarVista('aprob-calc');
}

async function initAprobCalc() {
  // Stub temporal — Task 3 lo implementa completo
  document.getElementById('aprob-calc-header').innerHTML =
    '<div class="cap-toolbar-row"><div class="cap-info">Vista de cálculo (en construcción)</div></div>';
}
```

- [ ] **Step 2.9: Validación en browser**

Abrir `index.html`, login con sesión válida, ir al tab "Aprobar":

| Check | Esperado |
|---|---|
| Badge "Sin snapshot" o "Calculada · …" visible en header | ✓ |
| Botón "Calcular nómina" visible debajo del header | ✓ |
| Si no hay capturas o todas ENVIADA: botón disabled, tooltip explica | ✓ |
| Si capturas todas terminales: botón habilitado | ✓ |
| Click "Calcular nómina" → cambia a vista nueva con "Vista de cálculo (en construcción)" | ✓ |
| Botón back (`←` del topbar): regresa a la lista de aprobar | ✓ |
| 0 errores en consola | ✓ |

- [ ] **Step 2.10: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
frontend 3b-2: scaffold panel + badge + botón en header

Bloque 2/7 del cierre de Fase 3b frontend.

- HTML: badge #aprob-badge-snapshot + botón #aprob-btn-calcular en header de
  #panel-aprob. Nuevo contenedor #panel-aprob-calc (cuerpo vacío, lo llena
  el siguiente bloque).
- cambiarVista y onBack registran el nuevo panel.
- puedeCalcularQuincena(): predicado del trigger (capturas existen Y ninguna
  en ENVIADA). Botón siempre visible, disabled con tooltip si no aplica.
- renderAprobHeaderBadge / renderAprobHeaderBoton: pintan estado.
- initAprob extendido: fetch secuencial de listarCapturasParaAprobar primero
  (para obtener quincena_id), luego paralelo detectarConflictos +
  obtenerCalculoNomina. Un round-trip extra, vale la pena.
- initAprobCalc + irACalcular: stubs para no romper onclick (Task 3 los completa).

Validación visual: badge y botón render correcto, click navega, back regresa.
Sin lógica de cálculo aún.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Vista "Sin snapshot" + carga de preview

**Files:**
- Modify: `index.html`

**Commit:** `frontend 3b-3: vista sin snapshot + preview`

- [ ] **Step 3.1: Reemplazar stub `initAprobCalc` con implementación completa**

Reemplazar la función stub del Step 2.8 con:

```js
async function initAprobCalc() {
  if (!aprobQuincena) {
    toast('Cargá la quincena primero', 'error');
    cambiarVista('aprob');
    return;
  }
  aprobCalculoPreview = null;
  const hdr = document.getElementById('aprob-calc-header');
  hdr.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando snapshot...</div>';
  document.getElementById('aprob-calc-banner').innerHTML = '';
  document.getElementById('aprob-calc-metrics').innerHTML = '';
  document.getElementById('aprob-calc-tabla-proyecto').innerHTML = '';
  document.getElementById('aprob-calc-detalle-empleado').innerHTML = '';
  document.getElementById('aprob-calc-fab').innerHTML = '';

  try {
    const s = await callBackend('obtenerCalculoNomina', { quincena_id: aprobQuincena.id });
    aprobCalculoSnapshot = s.calculado ? normalizarCalculo(s, 'snapshot') : null;
    renderAprobCalcVista();
  } catch (err) {
    hdr.innerHTML = '<div class="cap-toolbar-row"><div class="cap-info" style="color:var(--err)">Error: ' + escapeHtml(err.message) + '</div></div>';
    toast(err.message, 'error');
  }
}
```

- [ ] **Step 3.2: Implementar `renderAprobCalcVista` (router de estado)**

Insertar después de `initAprobCalc`:

```js
function renderAprobCalcVista() {
  // Header común
  const hdr = document.getElementById('aprob-calc-header');
  const calc = aprobCalculoSnapshot;
  const pillHtml = (calc && calc.source === 'snapshot' && calc.metadata.timestamp_calculo)
    ? '<span class="snap-badge calculada">✓ Calculada · ' + escapeHtml(formatTimestampLocal(calc.metadata.timestamp_calculo)) + '</span>'
    : '<span class="snap-badge sin-snapshot">Sin snapshot</span>';
  hdr.innerHTML = `
    <div class="cap-toolbar-row">
      <div>
        <div class="cap-proj">🧮 Calcular nómina</div>
        <div class="cap-quin">Quincena ${escapeHtml(aprobQuincena.id)} · ${escapeHtml(aprobQuincena.fecha_inicio || '')} → ${escapeHtml(aprobQuincena.fecha_fin || '')}</div>
      </div>
      ${pillHtml}
    </div>
  `;

  if (aprobCalculoSnapshot) {
    renderCalcCalculada(aprobCalculoSnapshot);
  } else {
    renderCalcSinSnapshot(aprobCalculoPreview);
  }
}
```

- [ ] **Step 3.3: Implementar `renderCalcSinSnapshot`**

Insertar después de `renderAprobCalcVista`:

```js
function renderCalcSinSnapshot(preview) {
  // Banner azul informativo (siempre)
  document.getElementById('aprob-calc-banner').innerHTML = `
    <div class="calc-banner info">
      <b>El snapshot es inmutable.</b> Una vez guardado, los datos quedan congelados. Reabrir una captura invalida el snapshot automáticamente.
    </div>
  `;

  // Metric cards: ceros si no hay preview, valores si sí
  const totales = preview ? preview.totales : { bruto:0, tope_imss:0, excedente:0, comision:0, num_empleados:0, num_proyectos:0 };
  renderMetricCards(totales);

  // Tablas: vacías si no hay preview, llenas si sí
  if (preview) {
    renderTablaPorProyecto(preview.agregados);
    renderDetallePorEmpleado(preview.resultados, false); // false = colapsado por default
  } else {
    document.getElementById('aprob-calc-tabla-proyecto').innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">Sin preview cargado</div><div class="empty-state-msg">Click "Calcular preview" para generar los números a partir de las capturas APROBADA / CERRADA.</div></div>';
    document.getElementById('aprob-calc-detalle-empleado').innerHTML = '';
  }

  // Warnings del preview
  if (preview && preview.metadata.warnings.length > 0) {
    const items = preview.metadata.warnings.map(function (w) { return '<li>' + escapeHtml(w) + '</li>'; }).join('');
    document.getElementById('aprob-calc-banner').innerHTML +=
      '<div class="calc-banner warn"><b>Avisos:</b><ul>' + items + '</ul></div>';
  }

  // FAB con botones de acción
  const fab = document.getElementById('aprob-calc-fab');
  const labelRecalc = preview ? 'Recalcular' : 'Calcular preview';
  const guardarHtml = preview && preview.resultados.length > 0
    ? '<button class="btn btn-primary" id="btn-guardar-calc" onclick="confirmarGuardarCalculo()">💾 Guardar cálculo</button>'
    : '';
  fab.innerHTML = `
    <button class="btn btn-secondary" id="btn-recalc" onclick="cargarPreview()">${labelRecalc}</button>
    ${guardarHtml}
  `;
}
```

- [ ] **Step 3.4: Implementar `cargarPreview`**

Insertar después de `renderCalcSinSnapshot`:

```js
async function cargarPreview() {
  if (aprobCalculoLoading) return;
  aprobCalculoLoading = true;
  const btn = document.getElementById('btn-recalc');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando…'; }

  try {
    const r = await callBackend('calcularNominaPreview', { quincena_id: aprobQuincena.id });
    aprobCalculoPreview = normalizarCalculo(r, 'preview');
    renderAprobCalcVista();
  } catch (err) {
    toast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Calcular preview'; }
  } finally {
    aprobCalculoLoading = false;
  }
}
```

- [ ] **Step 3.5: Implementar `renderMetricCards`, `renderTablaPorProyecto`, `renderDetallePorEmpleado`**

Insertar después de `cargarPreview`:

```js
function renderMetricCards(totales) {
  const cont = document.getElementById('aprob-calc-metrics');
  cont.innerHTML = `
    <div class="calc-metric-grid">
      <div class="calc-metric-card">
        <div class="calc-metric-label">Bruto total</div>
        <div class="calc-metric-value">${formatCurrency(totales.bruto)}</div>
        <div class="calc-metric-meta">${totales.num_empleados} empleado${totales.num_empleados===1?'':'s'} · ${totales.num_proyectos} proyecto${totales.num_proyectos===1?'':'s'}</div>
      </div>
      <div class="calc-metric-card">
        <div class="calc-metric-label">Tope IMSS aplicado</div>
        <div class="calc-metric-value">${formatCurrency(totales.tope_imss)}</div>
        <div class="calc-metric-meta">Reintegro a CAMI</div>
      </div>
      <div class="calc-metric-card">
        <div class="calc-metric-label">Excedente</div>
        <div class="calc-metric-value">${formatCurrency(totales.excedente)}</div>
        <div class="calc-metric-meta">Lo dispersan contadores</div>
      </div>
      <div class="calc-metric-card">
        <div class="calc-metric-label">Comisión 6%</div>
        <div class="calc-metric-value">${formatCurrency(totales.comision)}</div>
        <div class="calc-metric-meta">Dentro de NOMINA</div>
      </div>
    </div>
  `;
}

function renderTablaPorProyecto(agregados) {
  const cont = document.getElementById('aprob-calc-tabla-proyecto');
  if (!agregados || agregados.length === 0) {
    cont.innerHTML = '';
    return;
  }
  let totBruto = 0, totTope = 0, totContadores = 0, totEmp = 0;
  const filas = agregados.map(function (a) {
    totBruto += a.total_bruto;
    totTope  += (a.total_bruto - a.total_excedente); // tope = bruto - excedente
    totContadores += a.monto_nomina_transaccion;
    totEmp   += a.total_empleados;
    const topeProy = a.total_bruto - a.total_excedente;
    return `
      <tr>
        <td>${escapeHtml(a.proyecto)}</td>
        <td class="num">${a.total_empleados}</td>
        <td class="num">${formatCurrency(a.total_bruto)}</td>
        <td class="num">${formatCurrency(topeProy)}</td>
        <td class="num">${formatCurrency(a.monto_nomina_transaccion)}</td>
      </tr>
    `;
  }).join('');
  cont.innerHTML = `
    <div class="section-header"><span>Por proyecto</span></div>
    <table class="calc-table">
      <thead><tr><th>Proyecto</th><th class="num">Empleados</th><th class="num">Bruto</th><th class="num">Tope IMSS</th><th class="num">A contadores</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr class="calc-table-total">
          <td><b>Total</b></td>
          <td class="num"><b>${totEmp}</b></td>
          <td class="num"><b>${formatCurrency(totBruto)}</b></td>
          <td class="num"><b>${formatCurrency(totTope)}</b></td>
          <td class="num"><b>${formatCurrency(totContadores)}</b></td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderDetallePorEmpleado(resultados, abierto) {
  const cont = document.getElementById('aprob-calc-detalle-empleado');
  if (!resultados || resultados.length === 0) {
    cont.innerHTML = '';
    return;
  }
  const filas = resultados.map(function (r) {
    return `
      <tr>
        <td>${escapeHtml(r.empleado_nombre)}</td>
        <td>${escapeHtml(r.proyecto)}</td>
        <td class="num">${r.dias_pagables}</td>
        <td class="num">${formatCurrency(r.bruto_total)}</td>
        <td class="num">${formatCurrency(r.tope_imss_aplicable)}</td>
      </tr>
    `;
  }).join('');
  cont.innerHTML = `
    <details class="calc-detalle" ${abierto ? 'open' : ''}>
      <summary>Detalle por empleado × proyecto (${resultados.length} fila${resultados.length===1?'':'s'})</summary>
      <table class="calc-table">
        <thead><tr><th>Empleado</th><th>Proyecto</th><th class="num">Días T+D</th><th class="num">Bruto</th><th class="num">Tope IMSS</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </details>
  `;
}
```

- [ ] **Step 3.6: Validación en browser**

Abrir, ir al tab Aprobar, click "Calcular nómina":

| Check | Esperado |
|---|---|
| Header pinta "🧮 Calcular nómina" + folio quincena + pill ámbar "Sin snapshot" | ✓ |
| Banner azul informativo "El snapshot es inmutable…" | ✓ |
| 4 metric cards mostrando $0.00 (no preview cargado aún) | ✓ |
| Empty state "Sin preview cargado" | ✓ |
| Botón "Calcular preview" disponible (no "Recalcular") | ✓ |
| Click "Calcular preview" → llama backend | ✓ |
| Si 2026-05-07 sin APROBADAs aún: warnings se muestran, metric cards quedan en $0, tabla queda vacía con empty state — sin error | ✓ |
| Si hay APROBADAs (post 21-may): metric cards pueblan, tabla por proyecto aparece, `<details>` colapsado con count | ✓ |
| Botón cambia a "Recalcular" + aparece "Guardar cálculo" si hay filas | ✓ |
| 0 errores en consola | ✓ |

- [ ] **Step 3.7: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
frontend 3b-3: vista sin snapshot + carga de preview

Bloque 3/7 del cierre de Fase 3b frontend.

- initAprobCalc: fetch obtenerCalculoNomina al entrar, decide estado.
- renderAprobCalcVista: router que pinta header común y delega a sin/calculada.
- renderCalcSinSnapshot: banner azul informativo, metric cards (ceros o
  preview), empty state si sin preview, lista warnings si los hay, botones
  Recalcular + Guardar (Guardar solo si hay resultados).
- cargarPreview: llama calcularNominaPreview, anti-doble-click con
  aprobCalculoLoading.
- renderMetricCards, renderTablaPorProyecto, renderDetallePorEmpleado:
  helpers de render compartidos con vista calculada (Task 5).

renderCalcCalculada queda como stub conceptual hasta Task 5. La vista de
snapshot existente devuelve aquí por defecto (sin renderCalcCalculada)
y se quedará renderizada con la última pintada del adapter — no se valida
hasta Task 5.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Acción Guardar cálculo

**Files:**
- Modify: `index.html`

**Commit:** `frontend 3b-4: acción guardar snapshot`

- [ ] **Step 4.1: Implementar `confirmarGuardarCalculo`**

Insertar después de `renderDetallePorEmpleado`:

```js
async function confirmarGuardarCalculo() {
  if (aprobCalculoLoading) return;
  if (!aprobCalculoPreview || aprobCalculoPreview.resultados.length === 0) {
    toast('No hay datos para guardar', 'error');
    return;
  }
  const tot = aprobCalculoPreview.totales;
  const msg = '¿Guardar snapshot inmutable de la quincena ' + aprobQuincena.id + '?\n\n' +
              '· ' + tot.num_empleados + ' empleados, ' + tot.num_proyectos + ' proyectos\n' +
              '· Bruto: ' + formatCurrency(tot.bruto) + '\n' +
              '· A contadores: ' + formatCurrency(tot.a_contadores) + '\n\n' +
              'Una vez guardado, solo se puede modificar reabriendo una captura.';
  if (!confirm(msg)) return;

  aprobCalculoLoading = true;
  const btn = document.getElementById('btn-guardar-calc');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    const r = await callBackend('guardarCalculoNomina', { quincena_id: aprobQuincena.id });
    if (!r.ok) {
      throw new Error(r.error || 'error desconocido al guardar');
    }
    toast('Snapshot guardado', 'success');
    aprobCalculoPreview = null;
    // Re-fetcheo del snapshot guardado para mostrar estado "Calculada"
    await initAprobCalc();
  } catch (err) {
    toast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar cálculo'; }
  } finally {
    aprobCalculoLoading = false;
  }
}
```

- [ ] **Step 4.2: Validación en browser**

Esta validación tiene 2 niveles:

**Nivel estructural (ahora):** abrir vista calc, verificar que `typeof confirmarGuardarCalculo === 'function'` en consola, que el botón "Guardar cálculo" tiene `onclick="confirmarGuardarCalculo()"` (inspeccionar HTML).

**Nivel funcional (post 21-may, con APROBADAs reales):** click "Guardar", responde el `confirm()`, ver `Network` que dispara `guardarCalculoNomina`, ver que después de OK la vista se re-renderiza al estado "Calculada" (cuando esté implementado en Task 5).

| Check estructural | Esperado |
|---|---|
| `typeof confirmarGuardarCalculo` en consola | "function" |
| Botón "Guardar cálculo" tiene `id="btn-guardar-calc"` | ✓ |
| 0 errores en consola | ✓ |

- [ ] **Step 4.3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
frontend 3b-4: acción guardar snapshot

Bloque 4/7 del cierre de Fase 3b frontend.

- confirmarGuardarCalculo: confirm() con resumen (empleados, proyectos,
  bruto, a contadores). Llama guardarCalculoNomina. Anti-doble-click vía
  aprobCalculoLoading. Re-fetch del snapshot al guardar exitoso (initAprobCalc
  vuelve a entrar y ahora encuentra calculado=true).
- Error handling: backend devuelve {ok:false, error} en conflicto de snapshot
  duplicado o quincena PAGADA — se muestra como toast.

Validación funcional completa pendiente para post 21-may (necesita capturas
APROBADA en 2026-05-07). Validación estructural OK ahora.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Vista calculada

**Files:**
- Modify: `index.html`

**Commit:** `frontend 3b-5: vista calculada + banner verde`

- [ ] **Step 5.1: Implementar `renderCalcCalculada`**

Insertar después de `confirmarGuardarCalculo`:

```js
function renderCalcCalculada(calc) {
  // Banner verde con candado
  const guardadoPor = calc.metadata.guardado_por || 'desconocido';
  const ts          = formatTimestampLocal(calc.metadata.timestamp_calculo);
  document.getElementById('aprob-calc-banner').innerHTML = `
    <div class="calc-banner lock">
      🔒 <b>Snapshot guardado por ${escapeHtml(guardadoPor)}</b> el ${escapeHtml(ts)}.
      Los datos están congelados. Para modificar, reabre una captura desde la lista de aprobación.
    </div>
  `;

  // Metric cards desde totales del snapshot
  renderMetricCards(calc.totales);

  // Tablas (snapshot)
  renderTablaPorProyecto(calc.agregados);
  renderDetallePorEmpleado(calc.resultados, false);

  // FAB: 3 botones placeholder deshabilitados + leyenda
  document.getElementById('aprob-calc-fab').innerHTML = `
    <div class="calc-placeholder-row">
      <button class="btn btn-placeholder" disabled title="Disponible en Fase 3e">📧 Excel para contadores</button>
      <button class="btn btn-placeholder" disabled title="Disponible en Fase 3d">📄 PDFs</button>
      <button class="btn btn-placeholder" disabled title="Disponible en Fase 3f">✓ Marcar pagada</button>
    </div>
    <div class="calc-placeholder-hint">
      <i>Excel, PDFs y marcar pagada llegan en próximas fases (3d, 3e, 3f).</i>
    </div>
  `;
}
```

- [ ] **Step 5.2: Validación en browser**

Esta también es 2-niveles. Estructural ahora, funcional post 21-may.

**Estructural:**

| Check | Esperado |
|---|---|
| `typeof renderCalcCalculada` en consola | "function" |
| Si `aprobCalculoSnapshot` es no-null al entrar a la vista (simular con DevTools setting `aprobCalculoSnapshot = {...}` y llamando `renderAprobCalcVista()`): banner verde + cards + tablas + 3 botones placeholder | ✓ |
| Botones placeholder tienen `disabled` + tooltip | ✓ |
| Texto al pie en itálica con leyenda | ✓ |
| 0 errores en consola | ✓ |

**Funcional (post 21-may):** después de guardar, la vista se re-renderiza automáticamente a este estado.

- [ ] **Step 5.3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
frontend 3b-5: vista calculada + banner verde

Bloque 5/7 del cierre de Fase 3b frontend.

- renderCalcCalculada: banner verde con candado mostrando "Snapshot guardado
  por <nombre> el <fecha>" (lee calc.metadata.guardado_por y .timestamp_calculo
  del snapshot persistido — v3.6/v3.7 backend). Metric cards, tablas y detalle
  reusan los mismos helpers que renderCalcSinSnapshot.
- 3 botones placeholder deshabilitados (Excel, PDFs, Marcar pagada) con
  tooltip explicando la fase futura + leyenda al pie en itálica. Diseñado
  para que cuando lleguen 3d/3e/3f solo se habiliten, sin rediseño.

renderAprobCalcVista ya enrutaba a esta función desde Task 3, así que la
integración es automática.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CSS pulido

**Files:**
- Modify: `index.html` (bloque `<style>` existente)

**Commit:** `frontend 3b-6: CSS para badges, banners, metric cards`

- [ ] **Step 6.1: Localizar el bloque `<style>` final**

Buscar el último selector relevante en el `<style>` del head. Usar `Grep` con patrón `\.aprob-resumen-card` o similar para ubicar la zona de estilos de la fase aprobar. Insertar el bloque nuevo justo después.

- [ ] **Step 6.2: Agregar bloque CSS**

Insertar al final del bloque `<style>`:

```css
/* ═══ FASE 3b: cálculo de nómina ═══ */
.snap-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
  white-space: nowrap;
}
.snap-badge.sin-snapshot {
  background: #FEF3C7;
  color: #92400E;
  border: 1px solid #FCD34D;
}
.snap-badge.calculada {
  background: #D1FAE5;
  color: #065F46;
  border: 1px solid #6EE7B7;
}

.btn-disabled-tooltip {
  opacity: 0.6;
  cursor: not-allowed;
}

.calc-banner {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.5;
}
.calc-banner.info {
  background: #DBEAFE;
  color: #1E3A8A;
  border-left: 4px solid #3B82F6;
}
.calc-banner.lock {
  background: #D1FAE5;
  color: #065F46;
  border-left: 4px solid #10B981;
}
.calc-banner.warn {
  background: #FEF3C7;
  color: #92400E;
  border-left: 4px solid #F59E0B;
}
.calc-banner ul { margin: 6px 0 0 18px; padding: 0; }

.calc-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
@media (max-width: 720px) {
  .calc-metric-grid { grid-template-columns: repeat(2, 1fr); }
}
.calc-metric-card {
  background: var(--bg2, #F9FAFB);
  border: 1px solid var(--border, #E5E7EB);
  border-radius: 8px;
  padding: 12px;
  text-align: left;
}
.calc-metric-label {
  font-size: 11px;
  color: var(--muted, #6B7280);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.calc-metric-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--fg, #111827);
}
.calc-metric-meta {
  font-size: 11px;
  color: var(--muted, #6B7280);
  margin-top: 2px;
}

.calc-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 13px;
}
.calc-table th, .calc-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #E5E7EB);
  text-align: left;
}
.calc-table th {
  font-weight: 600;
  background: var(--bg2, #F9FAFB);
}
.calc-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.calc-table-total { background: var(--bg2, #F9FAFB); }

.calc-detalle {
  border: 1px solid var(--border, #E5E7EB);
  border-radius: 8px;
  margin-bottom: 16px;
  background: var(--bg, #FFFFFF);
}
.calc-detalle summary {
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}
.calc-detalle[open] summary {
  border-bottom: 1px solid var(--border, #E5E7EB);
}
.calc-detalle .calc-table { margin-bottom: 0; }

.calc-placeholder-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn-placeholder {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
  background: var(--bg2, #F9FAFB);
  color: var(--muted, #6B7280);
  border: 1px dashed var(--border, #D1D5DB);
}
.calc-placeholder-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted, #6B7280);
  text-align: center;
}
```

Nota: los tokens `--bg`, `--bg2`, `--border`, `--muted`, `--fg`, `--err` referenciados pueden o no existir en el CSS actual. Los fallbacks con `var(--token, #color)` cubren el caso. Si los tokens existen, los usa.

- [ ] **Step 6.3: Validación en browser**

| Check | Esperado |
|---|---|
| Badge "Sin snapshot" ámbar / "Calculada" verde renderiza con bordes y padding | ✓ |
| 4 metric cards en grid 4-cols desktop, 2-cols mobile (< 720px) | ✓ |
| Banner azul informativo, verde candado, ámbar warning con border-left | ✓ |
| Tabla por proyecto: headers en bold con fondo, total al pie también con fondo, números alineados a la derecha | ✓ |
| `<details>` colapsado, click expande mostrando tabla interior | ✓ |
| Botones placeholder: opacity, cursor not-allowed, border dashed | ✓ |
| Mobile: redimensionar viewport a 375px, layout responde | ✓ |
| 0 errores en consola | ✓ |

- [ ] **Step 6.4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
frontend 3b-6: CSS para badges, banners, metric cards

Bloque 6/7 del cierre de Fase 3b frontend.

- .snap-badge {sin-snapshot|calculada}: pills ámbar/verde para el header
- .calc-banner {info|lock|warn}: banners con border-left de color
- .calc-metric-grid + .calc-metric-card: grid responsive 4→2 cols (< 720px)
- .calc-table: tabla compacta con totales destacados, números tabulares
- .calc-detalle: <details> con summary estilizado
- .btn-placeholder + .calc-placeholder-hint: botones deshabilitados visuales
- .btn-disabled-tooltip: variante del botón principal cuando trigger no aplica

Usa var(--token, #fallback) — si los tokens ya existen en el CSS, los usa;
si no, fallback inline. Sin introducir tokens nuevos.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Bump VERSION_FRONTEND + changelog

**Files:**
- Modify: `index.html`

**Commit:** `frontend 3b-7: bump VERSION_FRONTEND 3.5 + changelog`

- [ ] **Step 7.1: Verificar VERSION_FRONTEND**

```bash
grep -n "VERSION_FRONTEND" index.html
```

Expected: `const VERSION_FRONTEND = '3.5';` (1 ocurrencia, ya agregado en Task 1).

- [ ] **Step 7.2: Agregar changelog al inicio del `<script>` principal**

Localizar el inicio del bloque `<script>` que contiene `function init()`. Insertar inmediatamente después del `<script>` tag (antes de la primera línea de código):

```js
/**
 * cami-nomina frontend
 *
 * v3.5 (18-may-2026): Fase 3b — cálculo y snapshot de nómina.
 *   - Nueva vista panel-aprob-calc con dos estados (sin snapshot / calculada).
 *   - Adapter normalizarCalculo(raw, source) unifica preview y snapshot.
 *   - Badge "Calculada · <fecha>" o "Sin snapshot" en el header de la quincena.
 *   - Botón "Calcular nómina" con trigger (no capturas en ENVIADA + al menos
 *     una captura existente). Tooltip explicativo cuando no aplica.
 *   - Banner inmutable verde con guardado_por + timestamp del snapshot
 *     persistido (requiere backend v3.7 con empleado_nombre y guardado_por).
 *   - Placeholders deshabilitados para Excel/PDFs/Marcar pagada (Fases 3d/3e/3f).
 *
 * v3.4 (13-may-2026): calendario sin domingos en captura.
 * v3.3 (11-may-2026): selector de quincena para supervisor/admin.
 */
```

(El bloque solo es comentario JS — no afecta funcionalidad.)

- [ ] **Step 7.3: Validación final completa en browser**

Smoke test integral end-to-end estructural:

| Check | Esperado |
|---|---|
| Tab Aprobar carga sin errores | ✓ |
| Badge en header refleja estado del snapshot | ✓ |
| Botón "Calcular nómina" con estado correcto según trigger | ✓ |
| Click → entra a vista calc | ✓ |
| Sin snapshot: banner azul, cards en ceros, botón "Calcular preview" | ✓ |
| Click "Calcular preview" → llama backend, muestra resultado (vacío si no APROBADAs) | ✓ |
| Back → regresa a aprobar, badge actualizado | ✓ |
| `console.log("v" + VERSION_FRONTEND)` muestra "v3.5" | ✓ |

- [ ] **Step 7.4: Commit final**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
frontend 3b-7: bump VERSION_FRONTEND 3.5 + changelog

Bloque 7/7 — cierre de Fase 3b frontend.

- Verifica VERSION_FRONTEND = '3.5'
- Agrega bloque de changelog en el header del <script> principal:
  resumen de v3.5 con la lista de cambios visibles, más histórico breve
  de v3.4 y v3.3.

Lista cerrada de la Fase 3b frontend:
✓ Vista panel-aprob-calc dos estados (sin snapshot / calculada)
✓ Adapter normalizarCalculo unifica preview/snapshot
✓ Badge en header de la quincena
✓ Trigger predicado puedeCalcularQuincena con tooltip
✓ Banner inmutable verde con guardado_por + timestamp
✓ Placeholders deshabilitados Excel/PDFs/Marcar pagada
✓ CSS responsive (tokens + fallbacks)
✓ VERSION_FRONTEND constante + changelog

Validación end-to-end funcional pendiente para jueves 21-may
(cuando 2026-05-07 cierre y tenga capturas APROBADA reales).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Post-execution: deploy y validación productiva

Después del último commit, antes de merge a main:

1. `git push origin feature/3b-frontend-calculo` — sube los 9 commits (2 backend + 7 frontend) al remoto
2. Alfredo abre `index.html` desde `https://alfredoaguado-arch.github.io/cami-nomina/` (Pages despliega automáticamente desde main, así que hay que mergear primero)
3. Estrategia de merge: `git checkout main && git merge --no-ff feature/3b-frontend-calculo -m "Merge branch 'feature/3b-frontend-calculo' — Fase 3b backend+frontend completa"` (igual al patrón que usamos con `feature/3b-calculo`)
4. `git push origin main` para que Pages despliegue
5. Ctrl+Shift+R en el dominio de Pages para refrescar cache
6. Validación productiva conjunta (Alfredo + asistente):
   - Tab Aprobar carga, badge correcto
   - Click "Calcular nómina" si trigger aplica
   - Si quincena ya tiene APROBADAs: ejecutar preview, validar números contra cálculo manual
   - Si todo OK: guardar snapshot, validar banner verde con nombre real + timestamp local
   - Reabrir una captura desde panel-aprob-cap, volver a entrar a vista calc → debe mostrar "Sin snapshot" (invalidación auto del backend funcionó)

---

## Self-review

**Spec coverage** (cada requirement del plan original mapeado a un task):
- ✓ Pantalla nueva "Calcular nómina" → Tasks 2-5
- ✓ Badge "Calculada · [fecha]" en header → Task 2
- ✓ Trigger del botón → Task 2 (puedeCalcularQuincena)
- ✓ Tooltip cuando no aplica → Task 2 (renderAprobHeaderBoton)
- ✓ 4 metric cards → Task 3 (renderMetricCards)
- ✓ Tabla por proyecto con total al pie → Task 3 (renderTablaPorProyecto)
- ✓ Detalle empleado×proyecto en `<details>` → Task 3 (renderDetallePorEmpleado)
- ✓ Banner azul informativo en sin snapshot → Task 3 (renderCalcSinSnapshot)
- ✓ Banner verde candado en calculada → Task 5 (renderCalcCalculada)
- ✓ Botón Recalcular + Guardar → Tasks 3-4
- ✓ Placeholders Excel/PDFs/Marcar pagada → Task 5
- ✓ Adapter normalizarCalculo → Task 1
- ✓ VERSION_FRONTEND + changelog → Tasks 1, 7
- ✓ Manejo invalidación tras reapertura → Task 2-3 (initAprob/initAprobCalc re-fetcha)
- ✓ Botón siempre visible, disabled con tooltip → Task 2

**Placeholder scan:** ninguno. Cada step contiene código completo o instrucciones concretas.

**Type consistency:** el shape canónico definido al inicio se usa exactamente igual en todos los renderers (Tasks 3-5). Adapter y renderers comparten vocabulario (bruto_total, tope_imss_aplicable, etc.).

**Asunciones a verificar al ejecutar:**
- Tokens CSS `--bg`, `--bg2`, etc. — si existen, se usan; si no, fallbacks inline funcionan. **Verificar con grep antes de Task 6 que no rompa diseño existente.**
- Línea exacta de inserción para el bloque `<style>` — buscar el último selector pre-existente con grep.
- `escapeHtml` y `toast` ya existen (verificado en pre-flight).

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-frontend-3b-calculo.md`.**

Dos opciones de ejecución:

**1. Subagent-Driven** — dispatch fresh subagent por task, review entre tasks, iteración rápida. **No recomendado aquí** porque cada task hace cambios en el mismo archivo y se beneficia del contexto in-line.

**2. Inline Execution (recomendado)** — ejecuto las 7 tasks en esta sesión con checkpoints de revisión entre cada commit. Cada task = 1 commit. Tú validas en browser entre commits y autorizas el siguiente.

**Sugerencia operativa:** después de cada commit, te muestro `git log --oneline -3` para que veas dónde estamos. Tú haces la validación en browser. Cuando confirmes OK, sigo. Si encuentras issue, ajustamos antes de avanzar.

¿Inline execution o ajustes al plan antes de arrancar?
