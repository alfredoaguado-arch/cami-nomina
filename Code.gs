/**
 * CAMI-Nomina v3.8.3
 * Módulo de nómina quincenal — Fases 1, 2, 3a, 3b ✓, 3c.
 *
 * v3.8.3 (20-may-2026): Modelo de pago COMPLETO — 3 casos (A/B/C).
 *
 *   Bug acumulado v3.8.1 y anteriores: el cálculo trataba a TODOS los IMSS
 *   con la misma fórmula (tope IMSS prorrateado), sin distinguir entre
 *   empleados con bruto > tope y empleados con bruto ≤ tope. Y trataba a
 *   NO_IMSS como si recibieran NOMINA_DIRECTO por su bruto entero.
 *
 *   Modelo correcto (fijado tras validación 20-may-2026):
 *
 *   CASO A — IMSS con bruto > tope IMSS quincenal ($4,410.56):
 *     - NOMINA_DIRECTO = tope IMSS, prorrateado por días pagables entre proyectos.
 *     - EXCEDENTE = bruto − tope. Va por contadores (no se registra como tx).
 *     - NOMINA del proyecto incluye este bruto: contribuye bruto × 1.06.
 *     - REINTEGRO_NOMINA recibe el tope (Alfredo → CAMI).
 *
 *   CASO B — IMSS con bruto ≤ tope IMSS:
 *     - NOMINA_DIRECTO = bruto entero. CAMI le paga directo como proveedor.
 *     - EXCEDENTE = $0. Contadores NO intervienen.
 *     - NOMINA del proyecto NO incluye este bruto.
 *     - $0 comisión 6% sobre este bruto.
 *     - $0 REINTEGRO_NOMINA.
 *
 *   CASO C — NO_IMSS (sin tope, ej. Mariana, Eduardo de Hoyos):
 *     - NOMINA_DIRECTO = $0. CAMI NO paga directo.
 *     - EXCEDENTE = bruto entero. Va por contadores.
 *     - NOMINA del proyecto incluye este bruto: contribuye bruto × 1.06.
 *     - $0 REINTEGRO.
 *
 *   Semántica de campos en NOMINA_RESULTADOS:
 *
 *   | Campo              | Caso A           | Caso B    | Caso C     |
 *   |--------------------|------------------|-----------|------------|
 *   | tope_imss_aplicable| tope prorrateado | $0        | $0         |
 *   | nomina_directo     | tope prorrateado | bruto fila| $0         |
 *   | excedente          | bruto − tope     | $0        | bruto fila |
 *   | comision           | bruto × 0.06     | $0        | bruto × 0.06|
 *   | total_neto         | bruto × 1.06     | $0        | bruto × 1.06|
 *
 *   Cuadre §2.7: NOMINA + NOMINA_DIRECTO − REINTEGRO = (brutos A+C)×1.06 + brutos B
 *
 *   Implicación: monto_nomina_transaccion del proyecto = suma de
 *   total_neto de sus filas (casos B contribuyen $0).
 *
 *   Impacto en quincena 2026-05-07:
 *     - Casos A: 6 empleados (Jose Miguel, Paola F., Abraham Juárez, Esquivel
 *       Santiago, Morales Macías, Hernández Sánchez Johan)
 *     - Casos B: 4 empleados (Flores Valencia, Esquivel Gutiérrez Fernando,
 *       Esquivel Gutiérrez Juan, Hernández Sánchez Jose Eduardo)
 *     - Casos C: 2 empleados (Mariana, Eduardo de Hoyos)
 *     - Bruto caso B: $9,816.67 — sale de "a contadores" y se paga directo
 *     - Total a contadores: $75,103.79 → $64,698.12
 *     - Total comisión 6%: $4,251.16 → $3,662.16
 *     - REINTEGRO total: $36,280.03 → $26,463.36
 *     - NOMINA_DIRECTO total: NO cambia ($36,280.03, suma topes A + brutos B)
 *
 * v3.8.1 (20-may-2026): Ajuste a quincenaParaFecha.
 *   - Bug remanente v3.8: días jueves/viernes/sábado de la primera semana
 *     de una quincena nueva caían en la quincena anterior por off-by-one.
 *   - Fix: usar ancla fija (jueves 7-may-2026) y calcular múltiplos de 14
 *     días desde ahí. Elimina ambigüedad de "qué jueves es el de inicio".
 *   - Test _testQuincenaParaFecha valida 6 casos (incluye jueves de
 *     transición y fecha de pago).
 *
 * v3.8 (20-may-2026): Fix quincenaParaFecha - off-by-one en cálculo de
 *   quincena vigente.
 *   - Bug: la función retrocedía al jueves más reciente, lo cual hacía que
 *     la quincena cambiara desde el jueves siguiente al cierre (correcto:
 *     cambia el jueves del día siguiente al miércoles de cierre).
 *   - Resultado del bug: hoy mié 20-may devolvía quincena 14-may a 27-may
 *     cuando correcto era 7-may a 20-may.
 *   - Fix: calcular el cierre como el primer miércoles >= fecha de
 *     referencia. Inicio = cierre - 13, Pago = cierre + 3.
 *   - Sin cambios en otros módulos. quincenaAnterior(n) sigue funcionando
 *     porque consume el id de quincenaParaFecha y retrocede 14*n días.
 *   - Test aislado en _testQuincenaParaFecha (correr desde editor).
 *
 * v3.7 (18-may-2026): Snapshot autocontenido — empleado_nombre.
 *   - Agrega columna `empleado_nombre` en NOMINA_RESULTADOS (col 5, después de id_empleado)
 *   - Escrito al momento de guardarCalculoNomina (no lookup en lectura)
 *   - Razón: si se renombra/elimina un empleado del catálogo, el snapshot histórico
 *     mantiene el nombre vigente al momento del cálculo (verdaderamente inmutable)
 *   - Requiere recrear NOMINA_RESULTADOS (manual delete previo si ya existe con 22 cols)
 *
 * v3.6 (18-may-2026): Auditabilidad del snapshot.
 *   - Agrega columna `guardado_por` en NOMINA_RESULTADOS (col 22) y NOMINA_AGREGADOS (col 12)
 *   - handleGuardarCalculoNomina escribe userName(data) en la nueva columna
 *   - handleObtenerCalculoNomina devuelve guardado_por top-level y por fila
 *   - Requiere recrear las hojas (manual delete previo si ya existían con 21/11 cols)
 *
 * v3.5 (18-may-2026): Fase 3b completada — cálculo y persistencia de snapshot.
 *   - Bloque 1 ✓ calcularNomina(quincenaId) función pura
 *     · Devuelve dias_f, dias_b, excedente, id_captura por fila
 *   - Bloque 2 ✓ Hojas NOMINA_RESULTADOS (21 cols) y NOMINA_AGREGADOS (11 cols)
 *     · asegurarHojasNomina() crea hojas con encabezados idempotentemente
 *   - Bloque 3 ✓ handleInvalidarCalculoNomina (borra snapshot, idempotente)
 *     · Bloqueo PAGADA (hook para Fase 3f)
 *     · Lógica extraída a _invalidarSnapshotInterno (reutilizable)
 *   - Bloque 4 ✓ handleObtenerCalculoNomina (lee snapshot crudo)
 *     · Devuelve calculado:bool, timestamp_calculo, estado_quincena
 *   - Bloque 5 ✓ handleGuardarCalculoNomina (escribe snapshot único)
 *     · Política: rechaza si ya existe (front debe invalidar primero)
 *     · Atómico vía withLock, timestamp uniforme
 *   - Bloque 6 ✓ handleReabrirCaptura y handleReabrirCapturaAdmin
 *     · Bloqueo PAGADA + invalidación automática post-reapertura (best-effort)
 *   - Bloque 7 ✓ Router doPost + appKeyForAction (3 endpoints cableados)
 *     · invalidarCalculoNomina, obtenerCalculoNomina, guardarCalculoNomina
 *     · Validación de permiso (nomina-aprobar O nomina-finanzas) en handlers
 *   - Bloque 8 ✓ Bump a v3.5 + changelog
 *
 * v3.3 (11-may-2026): Fix Bug A — fecha de quincena adelantada.
 *   - handleQuincenaActual devuelve la quincena anterior más reciente
 *     donde el supervisor tenga capturas en BORRADOR / ENVIADA / RECHAZADA.
 *   - Nuevo endpoint `quincenasCapturables` para construir el selector del front.
 *   - Mariana (admin) recibe el mismo trato en obtenerCapturaAdmin.
 *   - Límite: 3 quincenas hacia atrás.
 *
 * Funciones de mantenimiento conservadas:
 *   - inicializarBD()       — Crear todas las hojas desde cero
 *   - asegurarHojasNomina() — Asegura solo NOMINA_RESULTADOS y NOMINA_AGREGADOS
 *   - autorizarPermisos()   — Forzar prompt OAuth tras crear el script
 *   - limpiarCaptura(id)    — Limpia días/extras/viáticos de una captura, regresa a BORRADOR
 *   - _testQuincenaParaFecha() — Test aislado del cálculo de quincena (v3.8)
 */

const VERSION = '3.8.3';
const MODULE_NAME = 'nomina';

// Constante de proyecto para captura administrativa
const PROYECTO_ADMIN = 'INDIRECTOS_OFICINA';

// v3.3: límite de quincenas hacia atrás que la app considera "capturables"
const MAX_QUINCENAS_ATRAS = 3;

// Apps Script central
const URL_CENTRAL = 'https://script.google.com/macros/s/AKfycbw8Ucc9J3_TQcsAR0tn2Lk5DBN2bPWG6HF2pm3GfoEwa2NlRFQn5qZPVj7gy-IaLBSg/exec';

// CAMI TRANSACTION DB — fuente de proyectos
const ID_TRANSACTION_DB = '1ivGPLJtb6mFH-Pj1js1t4c62hFAFlDigHO94M0ZZSso';
const HOJA_PROYECTOS    = 'CAT_PROYECTOS';

// CAMI Usuarios — fuente de obras asignadas por supervisor
const ID_USUARIOS_DB = '1RlQ5UV7zOmSMSypBzck_AWgVDs_Y1_W5EZ1wOhOcmmI';
const HOJA_USUARIOS  = 'Usuarios';

const TZ = 'America/Mexico_City';

const HOJAS = {
  EMPLEADOS:         'EMPLEADOS',
  QUINCENAS:         'QUINCENAS',
  CAPTURAS:          'CAPTURAS',
  CAPTURA_DIAS:      'CAPTURA_DIAS',
  CAPTURA_EXTRAS:    'CAPTURA_EXTRAS',
  CAPTURA_VIATICOS:  'CAPTURA_VIATICOS',
  APROBACIONES_LOG:  'APROBACIONES_LOG',
  NOMINA_RESULTADOS: 'NOMINA_RESULTADOS',
  NOMINA_AGREGADOS:  'NOMINA_AGREGADOS'
};

const HEADERS = {
  EMPLEADOS: ['id','nombre','tipo','nss','curp','rfc','banco','cuenta','tarifa_diaria','tope_imss_quincenal','activo','fecha_alta','fecha_baja','observaciones'],
  QUINCENAS: ['id','fecha_inicio','fecha_fin','fecha_pago','estado','aprobada_por','fecha_aprobacion','creada_por','fecha_creacion'],
  CAPTURAS:  ['id','quincena_id','proyecto','supervisor','estado','comentario_rechazo','fecha_creacion','fecha_envio','aprobada_por','fecha_aprobacion'],
  CAPTURA_DIAS:     ['id','captura_id','empleado_id','dia_offset','marca'],
  CAPTURA_EXTRAS:   ['id','captura_id','empleado_id','horas','monto','descripcion'],
  CAPTURA_VIATICOS: ['id','captura_id','empleado_id','concepto','monto'],
  APROBACIONES_LOG: ['id','captura_id','accion','usuario','fecha','comentario'],
  NOMINA_RESULTADOS: ['id_resultado','id_quincena','id_captura','id_empleado','empleado_nombre','proyecto','dias_t','dias_d','dias_f','dias_b','dias_pagables','tarifa_diaria','bruto_base','extras','viaticos','bruto_total','tope_imss_aplicable','nomina_directo','excedente','comision','total_neto','timestamp_calculo','guardado_por'],
  NOMINA_AGREGADOS:  ['id_quincena','proyecto','total_empleados','total_dias_t','total_dias_d','total_bruto','total_nomina_directo','total_excedente','total_comision','monto_nomina_transaccion','timestamp_calculo','guardado_por']
};

const PRECARGA_EMPLEADOS = [
  { id: 1,  nombre: 'GARCIA MONTALVO JOSE MIGUEL',                tipo: 'IMSS',    nss: '1717-98-2548-8', curp: 'GAMM890529HDFRNG08', rfc: 'GAMM8905295M9', banco: 'NU',         cuenta: '5101 2566 0833 8856',     tarifa: 0, tope: 4410.56 },
  { id: 2,  nombre: 'FERNANDEZ DE ALFARO LOPEZ PAOLA ALEJANDRA',  tipo: 'IMSS',    nss: '4215-98-0378-4', curp: 'FELP980715MMCRPL05', rfc: 'FELP980715UFA', banco: 'BBVA',       cuenta: '4152 3145 1785 2029',     tarifa: 0, tope: 4410.56 },
  { id: 3,  nombre: 'JUAREZ PEREZ ABRAHAM EDUARDO',               tipo: 'IMSS',    nss: '8519-04-3996-9', curp: 'JUPA040318HMCRRBA1', rfc: 'JUPA040318I92', banco: 'AZTECA',     cuenta: '1274 5601 3091 1303 77',  tarifa: 0, tope: 4410.56 },
  { id: 4,  nombre: 'FLORES VALENCIA CARLOS ALFONSO',             tipo: 'IMSS',    nss: '4616-98-5606-2', curp: 'FOVC980323HHGLLR09', rfc: 'FOVC980323JI9', banco: 'BBVA',       cuenta: '012 180 0156 3478 9917',  tarifa: 0, tope: 4410.56 },
  { id: 5,  nombre: 'MARIANA GARCIA BADA ORTIZ',                  tipo: 'NO_IMSS', nss: '',               curp: '',                   rfc: '',              banco: 'SANTANDER',  cuenta: '014180606089250453',      tarifa: 0, tope: 0 },
  { id: 6,  nombre: 'EDUARDO ALEJANDRO DE HOYOS',                 tipo: 'NO_IMSS', nss: '',               curp: '',                   rfc: '',              banco: 'SCOTIABANK', cuenta: '0441 8000 1079 0926 07',  tarifa: 0, tope: 0 },
  { id: 7,  nombre: 'ESQUIVEL GUTIERREZ FERNANDO VALENTIN',       tipo: 'IMSS',    nss: '9013-93-1835-7', curp: 'EUGF930819HDFSTR00', rfc: 'EUGF930819C95', banco: 'AZTECA',     cuenta: '4027 6653 0761 0460',     tarifa: 0, tope: 4410.56 },
  { id: 8,  nombre: 'ESQUIVEL GUTIERREZ JUAN GILBERTO',           tipo: 'IMSS',    nss: '9013-86-0317-1', curp: 'EUGJ861019HDFSTN06', rfc: 'EUGJ861019ISA', banco: 'AZTECA',     cuenta: '5512 3824 2076 3676',     tarifa: 0, tope: 4410.56 },
  { id: 9,  nombre: 'ESQUIVEL SANTIAGO JUAN MARTIN',              tipo: 'IMSS',    nss: '0185-65-1386-4', curp: 'EUSJ650121HDFSNN00', rfc: 'EUSJ650121S79', banco: 'AZTECA',     cuenta: '4027 6600 2860 6806',     tarifa: 0, tope: 4410.56 },
  { id: 10, nombre: 'HERNANDEZ SANCHEZ JOSE EDUARDO',             tipo: 'IMSS',    nss: '2518-04-8360-1', curp: 'HESE040826HMCRNDB3', rfc: 'HESE040826QF5', banco: 'BBVA',       cuenta: '4815 1632 9207 7834',     tarifa: 0, tope: 4410.56 },
  { id: 11, nombre: 'MORALES MACIAS JORGE FRANCISCO',             tipo: 'IMSS',    nss: '9001-83-1977-3', curp: 'MOMJ830218HDFRCR08', rfc: 'MOMJ830218EB5', banco: 'AZTECA',     cuenta: '127 180 001 484 540 001', tarifa: 0, tope: 4410.56 },
  { id: 12, nombre: 'HERNANDEZ SANCHEZ JOHAN ALEXIS',             tipo: 'IMSS',    nss: '1718-99-4860-1', curp: 'HESJ990822HDFRNH08', rfc: 'HESJ990822UI8', banco: 'BBVA',       cuenta: '4815 1630 9881 4125',     tarifa: 0, tope: 4410.56 }
];

// ─── ENDPOINTS HTTP ──────────────────────────────────────────────────────────

function doGet(e) {
  return jsonResp({ status: 'ok', version: VERSION, module: MODULE_NAME });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const token  = data.token;

    if (!action) return jsonResp({ ok: false, error: 'falta action' });

    if (action === 'health') {
      return jsonResp({ ok: true, version: VERSION, module: MODULE_NAME });
    }

    const tokenInfo = validarTokenViaCentral(token);
    if (!tokenInfo.ok) {
      return jsonResp({ ok: false, error: 'token invalido o expirado' });
    }
    data._user = tokenInfo.user || tokenInfo;

    // Permisos por app key (defensa en profundidad — si el central devuelve apps)
    let userAppsList = userApps(data);
    if (typeof userAppsList === 'string') {
      userAppsList = userAppsList.split(',').map(function (s) { return s.trim(); });
    }
    const requiredApp = appKeyForAction(action);
    if (requiredApp && Array.isArray(userAppsList) && userAppsList.length > 0 && userAppsList.indexOf(requiredApp) < 0) {
      return jsonResp({ ok: false, error: 'sin permiso para ' + requiredApp });
    }

    switch (action) {
      // ── Fase 1: catálogo ──
      case 'listarEmpleados':    return handleListarEmpleados(data);
      case 'obtenerEmpleado':    return handleObtenerEmpleado(data);
      case 'crearEmpleado':      return handleCrearEmpleado(data);
      case 'actualizarEmpleado': return handleActualizarEmpleado(data);
      case 'bajaEmpleado':       return handleBajaEmpleado(data);
      case 'reactivarEmpleado':  return handleReactivarEmpleado(data);

      // ── Fase 2: quincenas / capturas ──
      case 'misProyectos':         return handleMisProyectos(data);
      case 'quincenaActual':       return handleQuincenaActual(data);
      case 'quincenasCapturables': return handleQuincenasCapturables(data);
      case 'listarQuincenas':      return handleListarQuincenas(data);
      case 'misCapturas':          return handleMisCapturas(data);
      case 'crearCaptura':         return handleCrearCaptura(data);
      case 'obtenerCaptura':       return handleObtenerCaptura(data);
      case 'agregarEmpleadoCap':   return handleAgregarEmpleadoCap(data);
      case 'quitarEmpleadoCap':    return handleQuitarEmpleadoCap(data);
      case 'marcarDia':            return handleMarcarDia(data);
      case 'guardarExtra':         return handleGuardarExtra(data);
      case 'eliminarExtra':        return handleEliminarExtra(data);
      case 'guardarViatico':       return handleGuardarViatico(data);
      case 'eliminarViatico':      return handleEliminarViatico(data);
      case 'enviarCaptura':        return handleEnviarCaptura(data);
      case 'volverBorrador':       return handleVolverBorrador(data);
      case 'listarEmpleadosActivos': return handleListarEmpleadosActivos(data);
      case 'capturaAnterior':      return handleCapturaAnterior(data);

      // ── Fase 3a: aprobación ──
      case 'listarCapturasParaAprobar': return handleListarCapturasParaAprobar(data);
      case 'obtenerCapturaParaAprobar': return handleObtenerCapturaParaAprobar(data);
      case 'aprobarCaptura':            return handleAprobarCaptura(data);
      case 'rechazarCaptura':           return handleRechazarCaptura(data);
      case 'reabrirCaptura':            return handleReabrirCaptura(data);
      case 'detectarConflictos':        return handleDetectarConflictos(data);
      case 'calcularNominaPreview':     return handleCalcularNominaPreview(data);
      case 'invalidarCalculoNomina':    return handleInvalidarCalculoNomina(data);
      case 'obtenerCalculoNomina':      return handleObtenerCalculoNomina(data);
      case 'guardarCalculoNomina':      return handleGuardarCalculoNomina(data);

      // ── Fase 3c: captura administrativa (Mariana) ──
      case 'obtenerCapturaAdmin':       return handleObtenerCapturaAdmin(data);
      case 'cerrarCapturaAdmin':        return handleCerrarCapturaAdmin(data);
      case 'reabrirCapturaAdmin':       return handleReabrirCapturaAdmin(data);

      default:
        return jsonResp({ ok: false, error: 'action desconocida: ' + action });
    }
  } catch (err) {
    return jsonResp({ ok: false, error: 'excepcion: ' + err.toString() });
  }
}

function appKeyForAction(action) {
  const rh = ['listarEmpleados','obtenerEmpleado','crearEmpleado','actualizarEmpleado','bajaEmpleado','reactivarEmpleado'];
  const sup = ['misProyectos','quincenaActual','quincenasCapturables','listarQuincenas','misCapturas','crearCaptura','obtenerCaptura',
               'agregarEmpleadoCap','quitarEmpleadoCap','marcarDia','guardarExtra','eliminarExtra',
               'guardarViatico','eliminarViatico','enviarCaptura','volverBorrador','listarEmpleadosActivos','capturaAnterior'];
  const aprob = ['listarCapturasParaAprobar','obtenerCapturaParaAprobar','aprobarCaptura',
               'rechazarCaptura','reabrirCaptura','detectarConflictos','calcularNominaPreview'];
  const fin = ['obtenerCapturaAdmin','cerrarCapturaAdmin'];
  // reabrirCapturaAdmin: validamos en el handler (nomina-finanzas O nomina-aprobar)
  // invalidarCalculoNomina, obtenerCalculoNomina, guardarCalculoNomina:
  //   validamos en el handler (nomina-finanzas O nomina-aprobar, mismo patrón)
  if (rh.indexOf(action) >= 0)    return 'nomina-rh';
  if (sup.indexOf(action) >= 0)   return 'nomina-supervisor';
  if (aprob.indexOf(action) >= 0) return 'nomina-aprobar';
  if (fin.indexOf(action) >= 0)   return 'nomina-finanzas';
  return null;
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;

function validarTokenViaCentral(token) {
  if (!token) return { ok: false, error: 'no token' };
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('tok:' + token);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* ignore */ }

  let info;
  try {
    const resp = UrlFetchApp.fetch(URL_CENTRAL, {
      method: 'post',
      contentType: 'text/plain',
      payload: JSON.stringify({ action: 'validarToken', token: token }),
      muteHttpExceptions: true
    });
    info = JSON.parse(resp.getContentText());
  } catch (err) {
    return { ok: false, error: err.toString() };
  }

  if (info && info.ok) {
    try {
      CacheService.getScriptCache().put('tok:' + token, JSON.stringify(info), Math.floor(TOKEN_CACHE_TTL_MS / 1000));
    } catch (e) { /* ignore */ }
  }
  return info;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(function (r) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = r[i]; });
    return obj;
  });
}

function todayStr() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowStr() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function nextId(sheet, idCol) {
  const rows = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < rows.length; i++) {
    const v = parseInt(rows[i][idCol], 10);
    if (!isNaN(v) && v > max) max = v;
  }
  return max + 1;
}

function findRowById(sheet, id) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function userName(data) {
  const u = data && data._user;
  if (!u) return 'desconocido';
  if (u.usuario && u.usuario.nombre) return u.usuario.nombre;
  if (u.nombre) return u.nombre;
  if (u.user)   return u.user;
  return 'desconocido';
}

function userApps(data) {
  const u = data && data._user;
  if (!u) return null;
  if (u.usuario && u.usuario.apps) return u.usuario.apps;
  if (u.apps) return u.apps;
  return null;
}

function userTieneApp(data, appKey) {
  let apps = userApps(data);
  if (!apps) return false;
  if (typeof apps === 'string') apps = apps.split(',').map(function(s){ return s.trim(); });
  return Array.isArray(apps) && apps.indexOf(appKey) >= 0;
}

function withLock(fn) {
  const lock = LockService.getDocumentLock();
  let acquired = false;
  try {
    lock.waitLock(10000);
    acquired = true;
  } catch (e) {
    Logger.log('withLock: no se pudo tomar lock en 10s, ejecutando sin lock: ' + e);
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch(e) {}
    }
  }
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normFecha(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  return String(v);
}

// ─── PROYECTOS (lee de CAMI TRANSACTION DB) ──────────────────────────────────

function leerProyectosActivos() {
  try {
    const ss = SpreadsheetApp.openById(ID_TRANSACTION_DB);
    const sh = ss.getSheetByName(HOJA_PROYECTOS);
    if (!sh) return [];

    const rows = sh.getDataRange().getValues();
    const headers = rows[2];
    const colProy   = headers.indexOf('Proyecto');
    const colActivo = headers.indexOf('Activo');
    if (colProy < 0) return [];

    const proyectos = [];
    for (let i = 3; i < rows.length; i++) {
      const nombre = String(rows[i][colProy] || '').trim();
      const activo = colActivo >= 0 ? String(rows[i][colActivo] || '').trim().toUpperCase() : 'SI';
      if (nombre && activo === 'SI') proyectos.push(nombre);
    }
    return proyectos;
  } catch (err) {
    Logger.log('Error leyendo proyectos: ' + err.toString());
    return [];
  }
}

function proyectosDelSupervisor(data) {
  const nombre = userName(data);
  if (!nombre || nombre === 'desconocido') {
    Logger.log('proyectosDelSupervisor: sin nombre. data._user=' + JSON.stringify(data._user || {}));
    return [];
  }

  const norm = function (s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  };
  const objetivo = norm(nombre);

  try {
    const ss = SpreadsheetApp.openById(ID_USUARIOS_DB);
    const sh = ss.getSheetByName(HOJA_USUARIOS);
    if (!sh) { Logger.log('proyectosDelSupervisor: hoja Usuarios no existe'); return []; }

    const rows = sh.getDataRange().getValues();
    if (rows.length < 2) return [];

    const headers = rows[0];
    const colNombre = headers.indexOf('Nombre');
    let colObras = headers.indexOf('Obras asignadas');
    if (colObras < 0) colObras = headers.indexOf('Proyectos');
    if (colNombre < 0 || colObras < 0) {
      Logger.log('proyectosDelSupervisor: faltan columnas. headers=' + JSON.stringify(headers));
      return [];
    }

    for (let i = 1; i < rows.length; i++) {
      if (norm(rows[i][colNombre]) === objetivo) {
        const txt = String(rows[i][colObras] || '');
        const obras = txt.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
        Logger.log('proyectosDelSupervisor: ' + nombre + ' → ' + obras.length + ' obras');
        return obras;
      }
    }
    Logger.log('proyectosDelSupervisor: no encontré "' + nombre + '" (normalizado: "' + objetivo + '") en sheet Usuarios');
    return [];
  } catch (err) {
    Logger.log('proyectosDelSupervisor error: ' + err.toString());
    let lista = data.mis_proyectos || '';
    if (typeof lista !== 'string') lista = String(lista || '');
    return lista.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  }
}

// ─── CRUD EMPLEADOS (Fase 1) ─────────────────────────────────────────────────

function handleListarEmpleados(data) {
  const sh = getSheet(HOJAS.EMPLEADOS);
  if (!sh) return jsonResp({ ok: false, error: 'hoja EMPLEADOS no existe (corre inicializarBD)' });

  const empleados = rowsToObjects(sh.getDataRange().getValues());
  const incluirInactivos = data.incluir_inactivos === true;
  const filtrados = incluirInactivos
    ? empleados
    : empleados.filter(function (e) { return e.activo === 'SI' || e.activo === true; });

  return jsonResp({ ok: true, empleados: filtrados });
}

function handleListarEmpleadosActivos(data) {
  const sh = getSheet(HOJAS.EMPLEADOS);
  if (!sh) return jsonResp({ ok: false, error: 'hoja EMPLEADOS no existe' });
  const empleados = rowsToObjects(sh.getDataRange().getValues())
    .filter(function (e) { return e.activo === 'SI' || e.activo === true; })
    .map(function (e) {
      return {
        id:            e.id,
        nombre:        e.nombre,
        tipo:          e.tipo,
        banco:         e.banco,
        tarifa_diaria: e.tarifa_diaria,
        activo:        e.activo
      };
    });
  return jsonResp({ ok: true, empleados: empleados });
}

function handleObtenerEmpleado(data) {
  const id = data.id;
  if (!id) return jsonResp({ ok: false, error: 'falta id' });
  const sh = getSheet(HOJAS.EMPLEADOS);
  const empleados = rowsToObjects(sh.getDataRange().getValues());
  const emp = empleados.find(function (e) { return String(e.id) === String(id); });
  if (!emp) return jsonResp({ ok: false, error: 'empleado no encontrado' });
  return jsonResp({ ok: true, empleado: emp });
}

function handleCrearEmpleado(data) {
  const e = data.empleado;
  if (!e || !e.nombre || !String(e.nombre).trim()) {
    return jsonResp({ ok: false, error: 'falta nombre' });
  }
  const sh = getSheet(HOJAS.EMPLEADOS);
  const headers = sh.getDataRange().getValues()[0];
  const nuevoId = nextId(sh, 0);
  const fila = headers.map(function (h) {
    if (h === 'id')          return nuevoId;
    if (h === 'fecha_alta')  return todayStr();
    if (h === 'activo')      return 'SI';
    if (h === 'fecha_baja')  return '';
    const val = e[h];
    return val === undefined || val === null ? '' : val;
  });
  sh.appendRow(fila);
  return jsonResp({ ok: true, id: nuevoId });
}

function handleActualizarEmpleado(data) {
  const id = data.id, e = data.empleado;
  if (!id || !e) return jsonResp({ ok: false, error: 'falta id o datos' });
  const sh = getSheet(HOJAS.EMPLEADOS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const PROTEGIDOS = ['id','fecha_alta','fecha_baja','activo'];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      headers.forEach(function (h, j) {
        if (PROTEGIDOS.indexOf(h) >= 0) return;
        if (e[h] !== undefined) sh.getRange(i + 1, j + 1).setValue(e[h]);
      });
      return jsonResp({ ok: true, id: id });
    }
  }
  return jsonResp({ ok: false, error: 'empleado no encontrado' });
}

function handleBajaEmpleado(data) {
  const id = data.id;
  if (!id) return jsonResp({ ok: false, error: 'falta id' });
  const fechaBaja = data.fecha_baja || todayStr();
  const sh = getSheet(HOJAS.EMPLEADOS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colA = headers.indexOf('activo'), colB = headers.indexOf('fecha_baja');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sh.getRange(i + 1, colA + 1).setValue('NO');
      sh.getRange(i + 1, colB + 1).setValue(fechaBaja);
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'empleado no encontrado' });
}

function handleReactivarEmpleado(data) {
  const id = data.id;
  if (!id) return jsonResp({ ok: false, error: 'falta id' });
  const sh = getSheet(HOJAS.EMPLEADOS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colA = headers.indexOf('activo'), colB = headers.indexOf('fecha_baja');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sh.getRange(i + 1, colA + 1).setValue('SI');
      sh.getRange(i + 1, colB + 1).setValue('');
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'empleado no encontrado' });
}

// ─── PROYECTOS DEL SUPERVISOR ────────────────────────────────────────────────

function handleMisProyectos(data) {
  const proyectosCatalogo = leerProyectosActivos();
  const misProyectos      = proyectosDelSupervisor(data);

  const interseccion = misProyectos.filter(function (p) {
    return proyectosCatalogo.indexOf(p) >= 0;
  });

  return jsonResp({
    ok: true,
    proyectos: interseccion,
    asignados: misProyectos,
    catalogo: proyectosCatalogo
  });
}

// ─── QUINCENAS ───────────────────────────────────────────────────────────────

/**
 * v3.8 FIX: calcula la quincena vigente para una fecha de referencia.
 *
 * Modelo: quincenas jueves -> miércoles (14 días), pago el sábado siguiente.
 * Una fecha de referencia pertenece a la quincena cuyo MIÉRCOLES DE CIERRE
 * es el primer miércoles >= fechaRef. Esto hace que la quincena cambie al
 * día siguiente del cierre (jueves), no al jueves anterior.
 *
 * Bug v3.7 y anteriores: retrocedía al jueves más reciente, lo cual hacía
 * que hoy mié 20-may devolviera la quincena 14-may a 27-may. El correcto
 * es 7-may a 20-may, pago 23-may.
 *
 * Tabla de verificación:
 *   | Hoy           | Cierre próximo | Inicio (cierre-13) | Pago (cierre+3) |
 *   |---------------|----------------|--------------------|-----------------|
 *   | mié 20-may    | mié 20-may     | jue 7-may          | sáb 23-may      |
 *   | jue 21-may    | mié 3-jun      | jue 21-may         | sáb 6-jun       |
 *   | vie 22-may    | mié 3-jun      | jue 21-may         | sáb 6-jun       |
 *   | dom 17-may    | mié 20-may     | jue 7-may          | sáb 23-may      |
 *   | jue 7-may     | mié 20-may     | jue 7-may          | sáb 23-may      |
 */
// ============================================================================
// FIX v3.8.1: quincenaParaFecha con ANCLA fija
// ============================================================================
//
// Razón del ajuste sobre v3.8:
//   El fix anterior tenía off-by-one con días jueves/viernes/sábado de la
//   primera semana de una quincena nueva. Causa: "retroceder al jueves
//   anterior" no distingue entre el jueves de inicio y el jueves de la
//   segunda semana — ambos están a < 14 días de retroceso, pero pertenecen
//   a quincenas distintas.
//
// Solución: usar un jueves conocido como ANCLA y calcular múltiplos de 14
// días desde ahí. Anclaje elegido: jueves 7-may-2026, inicio de la quincena
// "2026-05-07" (confirmado explícitamente por Alfredo).
//
// Tabla de verificación completa:
//   | Fecha de referencia       | Días desde ancla | Períodos | Inicio    |
//   |---------------------------|------------------|----------|-----------|
//   | jue 7-may-2026 (HOY-13)   | 0                | 0        | 7-may     |
//   | mié 20-may-2026 (HOY)     | 13               | 0        | 7-may     |
//   | jue 21-may-2026 (HOY+1)   | 14               | 1        | 21-may    |
//   | vie 22-may-2026           | 15               | 1        | 21-may    |
//   | sáb 23-may-2026           | 16               | 1        | 21-may    |
//   | dom 17-may-2026           | 10               | 0        | 7-may     |
//   | mié 3-jun-2026            | 27               | 1        | 21-may    |
//   | jue 4-jun-2026            | 28               | 2        | 4-jun     |
//   | jue 23-abr-2026 (atrás)   | -14              | -1       | 23-abr    |
//
// 
// ============================================================================
// QUINCENA_PARA_FECHA_v3.8.1 — Reemplaza la función actual
// ============================================================================

/**
 * v3.8.1: calcula la quincena vigente usando ANCLA fija.
 *
 * Modelo: quincenas jueves -> miércoles (14 días), pago el sábado siguiente.
 * Ancla: jueves 7-may-2026 = inicio de la quincena "2026-05-07".
 *
 * Cualquier otra quincena se calcula como múltiplo de 14 días desde el ancla.
 * Esto garantiza alineación correcta del calendario sin off-by-one en los
 * jueves de inicio.
 */
function quincenaParaFecha(fechaRef) {
  const ANCLA = new Date(2026, 4, 7);  // 7-may-2026 (mes 4 = mayo, 0-indexado)
  const ref = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), fechaRef.getDate());
  const MS_DIA = 24 * 60 * 60 * 1000;
  const diasDesdeAncla = Math.floor((ref.getTime() - ANCLA.getTime()) / MS_DIA);
  const periodos = Math.floor(diasDesdeAncla / 14);  // puede ser negativo para fechas pasadas
  const inicio = new Date(ANCLA);
  inicio.setDate(ANCLA.getDate() + periodos * 14);
  const cierre = new Date(inicio);
  cierre.setDate(inicio.getDate() + 13);
  const pago = new Date(cierre);
  pago.setDate(cierre.getDate() + 3);
  return {
    id:            Utilities.formatDate(inicio, TZ, 'yyyy-MM-dd'),
    fecha_inicio:  Utilities.formatDate(inicio, TZ, 'yyyy-MM-dd'),
    fecha_fin:     Utilities.formatDate(cierre, TZ, 'yyyy-MM-dd'),
    fecha_pago:    Utilities.formatDate(pago,   TZ, 'yyyy-MM-dd')
  };
}


// ============================================================================
// CHANGELOG_v3.8.1 — agregar al inicio del archivo, antes de v3.8
// ============================================================================

/*
 * v3.8.1 (20-may-2026): Ajuste a quincenaParaFecha.
 *   - Bug remanente v3.8: días jueves/viernes/sábado de la primera semana
 *     de una quincena nueva caían en la quincena anterior por off-by-one.
 *   - Fix: usar ancla fija (jueves 7-may-2026) y calcular múltiplos de 14
 *     días desde ahí. Elimina ambigüedad de "qué jueves es el de inicio".
 *   - Test _testQuincenaParaFecha valida 6 casos (incluye jueves de
 *     transición y fecha de pago).
 */

function quincenaAnterior(quincenaId, n) {
  if (!n) n = 1;
  const partes = String(quincenaId).split('-');
  const inicio = new Date(parseInt(partes[0],10), parseInt(partes[1],10)-1, parseInt(partes[2],10));
  inicio.setDate(inicio.getDate() - 14 * n);
  return quincenaParaFecha(inicio);
}

function asegurarQuincena(quincenaId, creadaPor) {
  const sh = getSheet(HOJAS.QUINCENAS);

  const findRow = function () {
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (normFecha(rows[i][0]) === quincenaId) {
        const headers = rows[0];
        const obj = {};
        headers.forEach(function (h, j) { obj[h] = normFecha(rows[i][j]) || rows[i][j]; });
        return obj;
      }
    }
    return null;
  };

  let existente = findRow();
  if (existente) return existente;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    Logger.log('No se pudo obtener lock: ' + err);
  }

  try {
    existente = findRow();
    if (existente) return existente;

    const partes = quincenaId.split('-');
    const inicio = new Date(parseInt(partes[0],10), parseInt(partes[1],10)-1, parseInt(partes[2],10));
    const q = quincenaParaFecha(inicio);
    if (q.id !== quincenaId) {
      throw new Error('quincena_id ' + quincenaId + ' no coincide con un jueves válido (debería ser ' + q.id + ')');
    }

    const lastRow = sh.getLastRow();
    const newRowIndex = lastRow + 1;
    sh.getRange(newRowIndex, 1, 1, 4).setNumberFormat('@');
    sh.getRange(newRowIndex, 1, 1, 9).setValues([[
      q.id, q.fecha_inicio, q.fecha_fin, q.fecha_pago,
      'ABIERTA', '', '', creadaPor || '', nowStr()
    ]]);

    return Object.assign({ estado:'ABIERTA' }, q);
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function contarPendientes(capturasRows, quincenaId, supervisor, opts) {
  opts = opts || {};
  const ESTADOS_PENDIENTES = ['BORRADOR','ENVIADA','RECHAZADA'];
  return capturasRows.filter(function (c) {
    if (normFecha(c.quincena_id) !== quincenaId) return false;
    if (c.supervisor !== supervisor) return false;
    if (ESTADOS_PENDIENTES.indexOf(c.estado) < 0) return false;
    if (opts.proyecto && c.proyecto !== opts.proyecto) return false;
    if (opts.excluirProyectoAdmin && c.proyecto === PROYECTO_ADMIN) return false;
    return true;
  }).length;
}

function handleQuincenaActual(data) {
  const ahora = new Date();
  const qActual = quincenaParaFecha(ahora);
  asegurarQuincena(qActual.id, userName(data));

  const supervisor = userName(data);
  const esSup = userTieneApp(data, 'nomina-supervisor');
  const esFin = userTieneApp(data, 'nomina-finanzas');

  const capturasRows = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());

  let optsConteo = { excluirProyectoAdmin: !esFin && esSup };
  if (esFin && !esSup) optsConteo = { proyecto: PROYECTO_ADMIN };

  let qElegida = qActual;
  for (let i = 1; i <= MAX_QUINCENAS_ATRAS; i++) {
    const qPrev = quincenaAnterior(qActual.id, i);
    const pend = contarPendientes(capturasRows, qPrev.id, supervisor, optsConteo);
    if (pend > 0) {
      asegurarQuincena(qPrev.id, supervisor);
      qElegida = qPrev;
      break;
    }
  }

  let creada = asegurarQuincena(qElegida.id, supervisor);
  creada = {
    id:           normFecha(creada.id) || qElegida.id,
    fecha_inicio: normFecha(creada.fecha_inicio) || qElegida.fecha_inicio,
    fecha_fin:    normFecha(creada.fecha_fin) || qElegida.fecha_fin,
    fecha_pago:   normFecha(creada.fecha_pago) || qElegida.fecha_pago,
    estado:       creada.estado || 'ABIERTA'
  };

  return jsonResp({
    ok: true,
    quincena: creada,
    es_actual:  creada.id === qActual.id,
    actual_id:  qActual.id
  });
}

function handleQuincenasCapturables(data) {
  const ahora = new Date();
  const qActual = quincenaParaFecha(ahora);
  const supervisor = userName(data);
  const esSup = userTieneApp(data, 'nomina-supervisor');
  const esFin = userTieneApp(data, 'nomina-finanzas');

  let optsConteo = { excluirProyectoAdmin: !esFin && esSup };
  if (esFin && !esSup) optsConteo = { proyecto: PROYECTO_ADMIN };

  const capturasRows = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());

  const anteriores = [];
  for (let i = 1; i <= MAX_QUINCENAS_ATRAS; i++) {
    const qPrev = quincenaAnterior(qActual.id, i);
    const pend = contarPendientes(capturasRows, qPrev.id, supervisor, optsConteo);
    if (pend > 0) {
      anteriores.push({
        id: qPrev.id,
        fecha_inicio: qPrev.fecha_inicio,
        fecha_fin:    qPrev.fecha_fin,
        fecha_pago:   qPrev.fecha_pago,
        pendientes:   pend,
        es_actual:    false
      });
    }
  }

  const pendActuales = contarPendientes(capturasRows, qActual.id, supervisor, optsConteo);
  const itemActual = {
    id: qActual.id,
    fecha_inicio: qActual.fecha_inicio,
    fecha_fin:    qActual.fecha_fin,
    fecha_pago:   qActual.fecha_pago,
    pendientes:   pendActuales,
    es_actual:    true
  };

  let defaultId = qActual.id;
  if (anteriores.length > 0) {
    defaultId = anteriores[0].id;
  }

  const lista = anteriores.slice().reverse().concat([itemActual]);
  lista.forEach(function (q) { q.es_default = (q.id === defaultId); });

  return jsonResp({ ok: true, quincenas: lista });
}

function handleListarQuincenas(data) {
  const sh = getSheet(HOJAS.QUINCENAS);
  let lista = rowsToObjects(sh.getDataRange().getValues());
  lista = lista.map(function (q) {
    return {
      id:               normFecha(q.id),
      fecha_inicio:     normFecha(q.fecha_inicio),
      fecha_fin:        normFecha(q.fecha_fin),
      fecha_pago:       normFecha(q.fecha_pago),
      estado:           q.estado,
      aprobada_por:     q.aprobada_por,
      fecha_aprobacion: q.fecha_aprobacion
    };
  });
  lista.sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });
  return jsonResp({ ok: true, quincenas: lista.slice(0, data.limit || 12) });
}

// ─── CAPTURAS (Fase 2) ───────────────────────────────────────────────────────

function handleMisCapturas(data) {
  const supervisor = userName(data);
  const quincenaId = data.quincena_id;

  const shCap = getSheet(HOJAS.CAPTURAS);
  let capturas = rowsToObjects(shCap.getDataRange().getValues());

  capturas = capturas.map(function (c) {
    return Object.assign({}, c, { quincena_id: normFecha(c.quincena_id) });
  });

  capturas = capturas.filter(function (c) {
    if (c.supervisor !== supervisor) return false;
    if (quincenaId && c.quincena_id !== quincenaId) return false;
    if (c.proyecto === PROYECTO_ADMIN) return false;
    return true;
  });

  const shDias = getSheet(HOJAS.CAPTURA_DIAS);
  const dias = rowsToObjects(shDias.getDataRange().getValues());
  capturas.forEach(function (c) {
    const empleadosDistintos = {};
    dias.forEach(function (d) {
      if (String(d.captura_id) === String(c.id)) empleadosDistintos[d.empleado_id] = true;
    });
    c.num_empleados = Object.keys(empleadosDistintos).length;
  });

  return jsonResp({ ok: true, capturas: capturas });
}

function handleCrearCaptura(data) {
  const supervisor = userName(data);
  const proyecto = String(data.proyecto || '').trim();
  let quincenaId = data.quincena_id;
  const heredarEmpleados = data.heredar_empleados !== false;

  if (!proyecto) return jsonResp({ ok: false, error: 'falta proyecto' });

  const proyectosOk = leerProyectosActivos();
  if (proyectosOk.indexOf(proyecto) < 0) {
    return jsonResp({ ok: false, error: 'proyecto no existe en el catálogo de TRANSACCIONES' });
  }
  const mios = proyectosDelSupervisor(data);
  if (mios.length > 0 && mios.indexOf(proyecto) < 0) {
    return jsonResp({ ok: false, error: 'no tienes asignada la obra ' + proyecto });
  }

  if (!quincenaId) quincenaId = quincenaParaFecha(new Date()).id;
  asegurarQuincena(quincenaId, supervisor);

  const sh = getSheet(HOJAS.CAPTURAS);
  const existentes = rowsToObjects(sh.getDataRange().getValues());
  const dup = existentes.find(function (c) {
    return normFecha(c.quincena_id) === quincenaId && c.proyecto === proyecto && c.supervisor === supervisor;
  });
  if (dup) return jsonResp({ ok: true, captura_id: dup.id, ya_existia: true });

  const nuevoId = nextId(sh, 0);
  sh.appendRow([
    nuevoId, "'" + quincenaId, proyecto, supervisor,
    'BORRADOR', '', nowStr(), '', '', ''
  ]);

  let heredados = 0;
  if (heredarEmpleados) {
    const anterior = encontrarCapturaAnterior(supervisor, proyecto, quincenaId, existentes);
    if (anterior) {
      const empIds = empleadosEnCaptura(anterior.id);
      const shDias = getSheet(HOJAS.CAPTURA_DIAS);
      empIds.forEach(function (empId) {
        shDias.appendRow([nextId(shDias, 0), nuevoId, empId, -1, '']);
        heredados++;
      });
    }
  }

  return jsonResp({ ok: true, captura_id: nuevoId, empleados_heredados: heredados });
}

function encontrarCapturaAnterior(supervisor, proyecto, quincenaId, capturasRows) {
  const candidatas = capturasRows
    .filter(function (c) {
      return c.supervisor === supervisor &&
             c.proyecto === proyecto &&
             normFecha(c.quincena_id) < quincenaId;
    })
    .sort(function (a, b) {
      return String(normFecha(b.quincena_id)).localeCompare(String(normFecha(a.quincena_id)));
    });
  return candidatas[0] || null;
}

function empleadosEnCaptura(capturaId) {
  const set = {};
  const sheets = [HOJAS.CAPTURA_DIAS, HOJAS.CAPTURA_EXTRAS, HOJAS.CAPTURA_VIATICOS];
  sheets.forEach(function (name) {
    const sh = getSheet(name);
    if (!sh) return;
    const rows = sh.getDataRange().getValues();
    const headers = rows[0];
    const colCap = headers.indexOf('captura_id');
    const colEmp = headers.indexOf('empleado_id');
    if (colCap < 0 || colEmp < 0) return;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][colCap]) === String(capturaId)) {
        set[rows[i][colEmp]] = true;
      }
    }
  });
  return Object.keys(set);
}

function handleCapturaAnterior(data) {
  const supervisor = userName(data);
  const proyecto = String(data.proyecto || '').trim();
  const quincenaId = String(data.quincena_id || '').trim();
  if (!proyecto || !quincenaId) return jsonResp({ ok: false, error: 'falta proyecto o quincena_id' });

  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = rowsToObjects(sh.getDataRange().getValues());
  const anterior = encontrarCapturaAnterior(supervisor, proyecto, quincenaId, rows);
  if (!anterior) return jsonResp({ ok: true, anterior: null });

  const empIds = empleadosEnCaptura(anterior.id);
  return jsonResp({
    ok: true,
    anterior: {
      id: anterior.id,
      quincena_id: normFecha(anterior.quincena_id),
      empleados_count: empIds.length,
      empleado_ids: empIds
    }
  });
}

function handleObtenerCaptura(data) {
  const capturaId = data.captura_id;
  if (!capturaId) return jsonResp({ ok: false, error: 'falta captura_id' });

  const shCap = getSheet(HOJAS.CAPTURAS);
  const capturas = rowsToObjects(shCap.getDataRange().getValues());
  let cap = capturas.find(function (c) { return String(c.id) === String(capturaId); });
  if (!cap) return jsonResp({ ok: false, error: 'captura no encontrada' });
  cap = Object.assign({}, cap, { quincena_id: normFecha(cap.quincena_id) });

  if (cap.supervisor !== userName(data)) {
    return jsonResp({ ok: false, error: 'no tienes acceso a esta captura' });
  }

  return jsonResp(payloadCaptura(cap));
}

function payloadCaptura(cap) {
  const capturaId = cap.id;

  const dias = rowsToObjects(getSheet(HOJAS.CAPTURA_DIAS).getDataRange().getValues())
    .filter(function (d) { return String(d.captura_id) === String(capturaId); });
  const extras = rowsToObjects(getSheet(HOJAS.CAPTURA_EXTRAS).getDataRange().getValues())
    .filter(function (e) { return String(e.captura_id) === String(capturaId); });
  const viaticos = rowsToObjects(getSheet(HOJAS.CAPTURA_VIATICOS).getDataRange().getValues())
    .filter(function (v) { return String(v.captura_id) === String(capturaId); });

  const empIds = {};
  dias.forEach(function (d)     { empIds[d.empleado_id] = true; });
  extras.forEach(function (e)   { empIds[e.empleado_id] = true; });
  viaticos.forEach(function (v) { empIds[v.empleado_id] = true; });

  const empAll = rowsToObjects(getSheet(HOJAS.EMPLEADOS).getDataRange().getValues());
  const empleados = empAll.filter(function (e) { return empIds[e.id]; });

  const qAll = rowsToObjects(getSheet(HOJAS.QUINCENAS).getDataRange().getValues());
  const targetId = String(cap.quincena_id);
  let quincena = qAll.find(function (q) { return normFecha(q.id) === targetId; });
  if (quincena) {
    quincena = {
      id:               normFecha(quincena.id),
      fecha_inicio:     normFecha(quincena.fecha_inicio),
      fecha_fin:        normFecha(quincena.fecha_fin),
      fecha_pago:       normFecha(quincena.fecha_pago),
      estado:           quincena.estado,
      aprobada_por:     quincena.aprobada_por,
      fecha_aprobacion: quincena.fecha_aprobacion
    };
  } else {
    const partes = targetId.split('-');
    if (partes.length === 3) {
      const inicio = new Date(parseInt(partes[0],10), parseInt(partes[1],10)-1, parseInt(partes[2],10));
      const q = quincenaParaFecha(inicio);
      quincena = Object.assign({ estado: 'ABIERTA' }, q);
    }
  }

  return {
    ok: true,
    captura: cap,
    quincena: quincena,
    empleados: empleados,
    dias: dias,
    extras: extras,
    viaticos: viaticos
  };
}

function getCapturaSafe(capturaId, supervisor, dataCtx) {
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      const obj = {};
      headers.forEach(function (h, j) { obj[h] = rows[i][j]; });

      const esAdmin = obj.proyecto === PROYECTO_ADMIN;
      if (esAdmin) {
        if (!dataCtx || !userTieneApp(dataCtx, 'nomina-finanzas')) {
          return { error: 'no tienes acceso (admin requiere nomina-finanzas)' };
        }
        if (obj.estado !== 'BORRADOR') {
          return { error: 'captura administrativa ' + obj.estado + ' no editable' };
        }
        return { ok: true, captura: obj };
      }

      if (obj.supervisor !== supervisor) return { error: 'no tienes acceso' };
      if (['BORRADOR','RECHAZADA','ENVIADA'].indexOf(obj.estado) < 0) {
        return { error: 'captura ' + obj.estado + ' no editable' };
      }
      return { ok: true, captura: obj };
    }
  }
  return { error: 'captura no encontrada' };
}

function handleAgregarEmpleadoCap(data) {
  const r = getCapturaSafe(data.captura_id, userName(data), data);
  if (r.error) return jsonResp({ ok: false, error: r.error });
  return withLock(function () {
    const sh = getSheet(HOJAS.CAPTURA_DIAS);
    const filas = rowsToObjects(sh.getDataRange().getValues());
    const yaEsta = filas.some(function (d) {
      return String(d.captura_id) === String(data.captura_id) && String(d.empleado_id) === String(data.empleado_id);
    });
    if (!yaEsta) {
      sh.appendRow([nextId(sh,0), data.captura_id, data.empleado_id, -1, '']);
    }
    return jsonResp({ ok: true });
  });
}

function handleQuitarEmpleadoCap(data) {
  const r = getCapturaSafe(data.captura_id, userName(data), data);
  if (r.error) return jsonResp({ ok: false, error: r.error });

  const eliminarDe = function (sheetName) {
    const sh = getSheet(sheetName);
    const rows = sh.getDataRange().getValues();
    const headers = rows[0];
    const colCap = headers.indexOf('captura_id');
    const colEmp = headers.indexOf('empleado_id');
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][colCap]) === String(data.captura_id) && String(rows[i][colEmp]) === String(data.empleado_id)) {
        sh.deleteRow(i + 1);
      }
    }
  };
  eliminarDe(HOJAS.CAPTURA_DIAS);
  eliminarDe(HOJAS.CAPTURA_EXTRAS);
  eliminarDe(HOJAS.CAPTURA_VIATICOS);
  return jsonResp({ ok: true });
}

function handleMarcarDia(data) {
  const r = getCapturaSafe(data.captura_id, userName(data), data);
  if (r.error) return jsonResp({ ok: false, error: r.error });
  const cap = r.captura;

  const empleadoId = data.empleado_id;
  const diaOffset  = parseInt(data.dia_offset, 10);
  const marca      = String(data.marca || '').toUpperCase();

  if (isNaN(diaOffset) || diaOffset < 0 || diaOffset > 13) {
    return jsonResp({ ok: false, error: 'dia_offset fuera de rango (0-13)' });
  }
  if (['','T','D','F','B'].indexOf(marca) < 0) {
    return jsonResp({ ok: false, error: 'marca inválida' });
  }

  return withLock(function () {
    if (marca === 'T') {
      const todasCapturas = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());
      const todosDias     = rowsToObjects(getSheet(HOJAS.CAPTURA_DIAS).getDataRange().getValues());
      const capturasOtras = todasCapturas.filter(function (c) {
        return normFecha(c.quincena_id) === normFecha(cap.quincena_id) && String(c.id) !== String(cap.id);
      });
      for (let i = 0; i < capturasOtras.length; i++) {
        const otraCap = capturasOtras[i];
        const conflicto = todosDias.find(function (d) {
          return String(d.captura_id) === String(otraCap.id)
              && String(d.empleado_id) === String(empleadoId)
              && parseInt(d.dia_offset,10) === diaOffset
              && String(d.marca).toUpperCase() === 'T';
        });
        if (conflicto) {
          return jsonResp({
            ok: false,
            error: 'CONFLICTO',
            conflicto: {
              otro_proyecto:   otraCap.proyecto,
              otro_supervisor: otraCap.supervisor,
              dia_offset:      diaOffset
            }
          });
        }
      }
    }

    const sh = getSheet(HOJAS.CAPTURA_DIAS);
    const rows = sh.getDataRange().getValues();

    const matches = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) === String(data.captura_id) &&
          String(rows[i][2]) === String(empleadoId) &&
          parseInt(rows[i][3],10) === diaOffset) {
        matches.push(i + 1);
      }
    }

    if (matches.length > 0) {
      if (marca === '') {
        for (let k = matches.length - 1; k >= 0; k--) {
          sh.deleteRow(matches[k]);
        }
      } else {
        sh.getRange(matches[0], 5).setValue(marca);
        for (let k = matches.length - 1; k >= 1; k--) {
          sh.deleteRow(matches[k]);
        }
      }
      return jsonResp({ ok: true });
    }

    if (marca !== '') {
      sh.appendRow([nextId(sh,0), data.captura_id, empleadoId, diaOffset, marca]);
    }

    const rows2 = sh.getDataRange().getValues();
    for (let i = rows2.length - 1; i >= 1; i--) {
      if (String(rows2[i][1]) === String(data.captura_id) &&
          String(rows2[i][2]) === String(empleadoId) &&
          parseInt(rows2[i][3],10) === -1) {
        sh.deleteRow(i + 1);
      }
    }
    return jsonResp({ ok: true });
  });
}

function handleGuardarExtra(data) {
  const r = getCapturaSafe(data.captura_id, userName(data), data);
  if (r.error) return jsonResp({ ok: false, error: r.error });

  return withLock(function () {
    const sh = getSheet(HOJAS.CAPTURA_EXTRAS);
    if (data.extra_id) {
      const rows = sh.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.extra_id)) {
          sh.getRange(i+1, 4).setValue(parseFloat(data.horas || 0));
          sh.getRange(i+1, 5).setValue(parseFloat(data.monto || 0));
          sh.getRange(i+1, 6).setValue(data.descripcion || '');
          return jsonResp({ ok: true, extra_id: data.extra_id });
        }
      }
      return jsonResp({ ok: false, error: 'extra no encontrado' });
    } else {
      const id = nextId(sh, 0);
      sh.appendRow([id, data.captura_id, data.empleado_id,
                    parseFloat(data.horas||0), parseFloat(data.monto||0), data.descripcion||'']);
      return jsonResp({ ok: true, extra_id: id });
    }
  });
}

function handleEliminarExtra(data) {
  const r = getCapturaSafe(data.captura_id, userName(data), data);
  if (r.error) return jsonResp({ ok: false, error: r.error });
  const sh = getSheet(HOJAS.CAPTURA_EXTRAS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.extra_id)) {
      sh.deleteRow(i+1);
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'extra no encontrado' });
}

function handleGuardarViatico(data) {
  const r = getCapturaSafe(data.captura_id, userName(data), data);
  if (r.error) return jsonResp({ ok: false, error: r.error });

  return withLock(function () {
    const sh = getSheet(HOJAS.CAPTURA_VIATICOS);
    if (data.viatico_id) {
      const rows = sh.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.viatico_id)) {
          sh.getRange(i+1, 4).setValue(data.concepto || '');
          sh.getRange(i+1, 5).setValue(parseFloat(data.monto || 0));
          return jsonResp({ ok: true, viatico_id: data.viatico_id });
        }
      }
      return jsonResp({ ok: false, error: 'viático no encontrado' });
    } else {
      const id = nextId(sh, 0);
      sh.appendRow([id, data.captura_id, data.empleado_id, data.concepto||'', parseFloat(data.monto||0)]);
      return jsonResp({ ok: true, viatico_id: id });
    }
  });
}

function handleEliminarViatico(data) {
  const r = getCapturaSafe(data.captura_id, userName(data), data);
  if (r.error) return jsonResp({ ok: false, error: r.error });
  const sh = getSheet(HOJAS.CAPTURA_VIATICOS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.viatico_id)) {
      sh.deleteRow(i+1);
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'viático no encontrado' });
}

function handleEnviarCaptura(data) {
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colEstado = headers.indexOf('estado');
  const colComent = headers.indexOf('comentario_rechazo');
  const colEnvio  = headers.indexOf('fecha_envio');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.captura_id)) {
      const sup = rows[i][3];
      if (sup !== userName(data)) {
        return jsonResp({ ok: false, error: 'no tienes acceso' });
      }
      const estado = rows[i][colEstado];
      if (['BORRADOR','RECHAZADA'].indexOf(estado) < 0) {
        return jsonResp({ ok: false, error: 'solo BORRADOR o RECHAZADA pueden enviarse, está en ' + estado });
      }
      sh.getRange(i+1, colEstado+1).setValue('ENVIADA');
      sh.getRange(i+1, colComent+1).setValue('');
      sh.getRange(i+1, colEnvio+1).setValue(nowStr());
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

function handleVolverBorrador(data) {
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colEstado = headers.indexOf('estado');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.captura_id)) {
      const sup = rows[i][3];
      if (sup !== userName(data)) {
        return jsonResp({ ok: false, error: 'no tienes acceso' });
      }
      const estado = rows[i][colEstado];
      if (estado !== 'ENVIADA') {
        return jsonResp({ ok: false, error: 'solo capturas ENVIADAS pueden volver a borrador' });
      }
      sh.getRange(i+1, colEstado+1).setValue('BORRADOR');
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══ FASE 3a: PANEL DE APROBACIÓN (nomina-aprobar)                           ═══
// ═══════════════════════════════════════════════════════════════════════════════

function handleListarCapturasParaAprobar(data) {
  let quincenaId = data.quincena_id;
  if (!quincenaId) {
    quincenaId = quincenaParaFecha(new Date()).id;
    asegurarQuincena(quincenaId, userName(data));
  }

  const shCap = getSheet(HOJAS.CAPTURAS);
  let capturas = rowsToObjects(shCap.getDataRange().getValues());

  capturas = capturas
    .map(function (c) { return Object.assign({}, c, { quincena_id: normFecha(c.quincena_id) }); })
    .filter(function (c) {
      return c.quincena_id === quincenaId && c.proyecto !== PROYECTO_ADMIN;
    });

  const dias     = rowsToObjects(getSheet(HOJAS.CAPTURA_DIAS).getDataRange().getValues());
  const extras   = rowsToObjects(getSheet(HOJAS.CAPTURA_EXTRAS).getDataRange().getValues());
  const viaticos = rowsToObjects(getSheet(HOJAS.CAPTURA_VIATICOS).getDataRange().getValues());
  const empAll   = rowsToObjects(getSheet(HOJAS.EMPLEADOS).getDataRange().getValues());
  const tarifas  = {};
  empAll.forEach(function (e) { tarifas[e.id] = parseFloat(e.tarifa_diaria || 0); });

  capturas.forEach(function (c) {
    const empSet = {};
    let diasT = 0;
    let totalDias = 0;
    dias.forEach(function (d) {
      if (String(d.captura_id) !== String(c.id)) return;
      empSet[d.empleado_id] = true;
      if (String(d.marca).toUpperCase() === 'T') {
        diasT++;
        totalDias += (tarifas[d.empleado_id] || 0);
      }
    });
    let totalExtras = 0;
    extras.forEach(function (e) {
      if (String(e.captura_id) === String(c.id)) totalExtras += parseFloat(e.monto || 0);
    });
    let totalViaticos = 0;
    viaticos.forEach(function (v) {
      if (String(v.captura_id) === String(c.id)) totalViaticos += parseFloat(v.monto || 0);
    });

    c.num_empleados = Object.keys(empSet).length;
    c.dias_t        = diasT;
    c.total         = totalDias + totalExtras + totalViaticos;
  });

  const resumen = { BORRADOR:0, ENVIADA:0, RECHAZADA:0, APROBADA:0 };
  capturas.forEach(function (c) {
    if (resumen.hasOwnProperty(c.estado)) resumen[c.estado]++;
  });

  const qAll = rowsToObjects(getSheet(HOJAS.QUINCENAS).getDataRange().getValues());
  let quincena = qAll.find(function (q) { return normFecha(q.id) === quincenaId; });
  if (quincena) {
    quincena = {
      id:               normFecha(quincena.id),
      fecha_inicio:     normFecha(quincena.fecha_inicio),
      fecha_fin:        normFecha(quincena.fecha_fin),
      fecha_pago:       normFecha(quincena.fecha_pago),
      estado:           quincena.estado
    };
  }

  const ordenEstado = { ENVIADA:0, BORRADOR:1, RECHAZADA:2, APROBADA:3 };
  capturas.sort(function (a, b) {
    const ea = ordenEstado[a.estado] !== undefined ? ordenEstado[a.estado] : 9;
    const eb = ordenEstado[b.estado] !== undefined ? ordenEstado[b.estado] : 9;
    if (ea !== eb) return ea - eb;
    return String(a.proyecto).localeCompare(String(b.proyecto));
  });

  return jsonResp({
    ok: true,
    quincena: quincena || { id: quincenaId },
    capturas: capturas,
    resumen: resumen
  });
}

function handleObtenerCapturaParaAprobar(data) {
  const capturaId = data.captura_id;
  if (!capturaId) return jsonResp({ ok: false, error: 'falta captura_id' });

  const shCap = getSheet(HOJAS.CAPTURAS);
  const capturas = rowsToObjects(shCap.getDataRange().getValues());
  let cap = capturas.find(function (c) { return String(c.id) === String(capturaId); });
  if (!cap) return jsonResp({ ok: false, error: 'captura no encontrada' });
  cap = Object.assign({}, cap, { quincena_id: normFecha(cap.quincena_id) });

  return jsonResp(payloadCaptura(cap));
}

function handleAprobarCaptura(data) {
  const capturaId = data.captura_id;
  if (!capturaId) return jsonResp({ ok: false, error: 'falta captura_id' });

  const aprobador = userName(data);
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colEstado    = headers.indexOf('estado');
  const colAprobador = headers.indexOf('aprobada_por');
  const colFecha     = headers.indexOf('fecha_aprobacion');
  const colComent    = headers.indexOf('comentario_rechazo');

  if (colAprobador < 0) {
    return jsonResp({ ok: false, error: 'columna aprobada_por no existe' });
  }

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      const estado = rows[i][colEstado];
      if (estado !== 'ENVIADA') {
        return jsonResp({ ok: false, error: 'solo capturas ENVIADAS pueden aprobarse, está en ' + estado });
      }
      sh.getRange(i+1, colEstado+1).setValue('APROBADA');
      sh.getRange(i+1, colAprobador+1).setValue(aprobador);
      sh.getRange(i+1, colFecha+1).setValue(nowStr());
      sh.getRange(i+1, colComent+1).setValue('');

      logAprobacion(capturaId, 'APROBAR', aprobador, '');
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

function handleRechazarCaptura(data) {
  const capturaId = data.captura_id;
  const comentario = String(data.comentario || '').trim();
  if (!capturaId) return jsonResp({ ok: false, error: 'falta captura_id' });
  if (!comentario) return jsonResp({ ok: false, error: 'el comentario es obligatorio' });

  const aprobador = userName(data);
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colEstado = headers.indexOf('estado');
  const colComent = headers.indexOf('comentario_rechazo');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      const estado = rows[i][colEstado];
      if (estado !== 'ENVIADA') {
        return jsonResp({ ok: false, error: 'solo capturas ENVIADAS pueden rechazarse, está en ' + estado });
      }
      sh.getRange(i+1, colEstado+1).setValue('RECHAZADA');
      sh.getRange(i+1, colComent+1).setValue(comentario);

      logAprobacion(capturaId, 'RECHAZAR', aprobador, comentario);
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

function handleReabrirCaptura(data) {
  const capturaId = data.captura_id;
  const motivo = String(data.motivo || '').trim();
  if (!capturaId) return jsonResp({ ok: false, error: 'falta captura_id' });

  const aprobador = userName(data);
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colEstado    = headers.indexOf('estado');
  const colAprobador = headers.indexOf('aprobada_por');
  const colFecha     = headers.indexOf('fecha_aprobacion');
  const colQuincena  = headers.indexOf('quincena_id');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      const estado = rows[i][colEstado];
      if (estado !== 'APROBADA') {
        return jsonResp({ ok: false, error: 'solo capturas APROBADAS pueden reabrirse, está en ' + estado });
      }

      const quincenaId = normFecha(rows[i][colQuincena]);

      // Bloqueo: quincena PAGADA es inamovible
      const shQ = getSheet(HOJAS.QUINCENAS);
      if (shQ && quincenaId) {
        const qRows = shQ.getDataRange().getValues();
        const headersQ = qRows[0];
        const colEstadoQ = headersQ.indexOf('estado');
        for (let j = 1; j < qRows.length; j++) {
          if (normFecha(qRows[j][0]) === quincenaId) {
            const estadoQ = colEstadoQ >= 0 ? qRows[j][colEstadoQ] : '';
            if (estadoQ === 'PAGADA') {
              return jsonResp({
                ok: false,
                error: 'no se puede reabrir: la quincena ' + quincenaId + ' ya fue PAGADA'
              });
            }
            break;
          }
        }
      }

      // Paso 1: reabrir captura
      sh.getRange(i+1, colEstado+1).setValue('BORRADOR');
      if (colAprobador >= 0) sh.getRange(i+1, colAprobador+1).setValue('');
      if (colFecha >= 0)     sh.getRange(i+1, colFecha+1).setValue('');

      logAprobacion(capturaId, 'REABRIR', aprobador, motivo);

      // Paso 2: invalidar snapshot si existe (best-effort, no rompe si falla)
      let snapshotInvalidado = false;
      let filasBorradas = { resultados: 0, agregados: 0 };
      let warningInvalidacion = null;
      try {
        asegurarHojasNomina();
        filasBorradas = withLock(function () {
          return _invalidarSnapshotInterno(quincenaId);
        });
        snapshotInvalidado = (filasBorradas.resultados + filasBorradas.agregados) > 0;
      } catch (err) {
        warningInvalidacion = 'No se pudo invalidar snapshot automáticamente: ' + err.toString() +
                              '. Invalida manualmente la quincena ' + quincenaId + '.';
        Logger.log('handleReabrirCaptura: ' + warningInvalidacion);
      }

      const resp = { ok: true, snapshot_invalidado: snapshotInvalidado, filas_borradas: filasBorradas };
      if (warningInvalidacion) resp.warning = warningInvalidacion;
      return jsonResp(resp);
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

function handleDetectarConflictos(data) {
  let quincenaId = data.quincena_id;
  if (!quincenaId) quincenaId = quincenaParaFecha(new Date()).id;

  const capturas = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues())
    .map(function (c) { return Object.assign({}, c, { quincena_id: normFecha(c.quincena_id) }); })
    .filter(function (c) { return c.quincena_id === quincenaId; });

  if (capturas.length < 2) return jsonResp({ ok: true, conflictos: [] });

  const capById = {};
  capturas.forEach(function (c) { capById[c.id] = c; });

  const dias = rowsToObjects(getSheet(HOJAS.CAPTURA_DIAS).getDataRange().getValues())
    .filter(function (d) {
      const off = parseInt(d.dia_offset, 10);
      return capById[d.captura_id] && off >= 0 && off <= 13 && String(d.marca || '').trim() !== '';
    });

  const grupos = {};
  dias.forEach(function (d) {
    const k = d.empleado_id + '|' + d.dia_offset;
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(d);
  });

  const empAll = rowsToObjects(getSheet(HOJAS.EMPLEADOS).getDataRange().getValues());
  const empById = {};
  empAll.forEach(function (e) { empById[e.id] = e; });

  const conflictos = [];
  Object.keys(grupos).forEach(function (k) {
    const lista = grupos[k];
    if (lista.length < 2) return;
    const capIds = {};
    lista.forEach(function (d) { capIds[d.captura_id] = true; });
    if (Object.keys(capIds).length < 2) return;
    const marcas = {};
    lista.forEach(function (d) { marcas[String(d.marca).toUpperCase()] = true; });
    if (Object.keys(marcas).length < 2) return;

    const partes = k.split('|');
    const empId = partes[0];
    const off   = parseInt(partes[1], 10);
    const emp = empById[empId];

    conflictos.push({
      empleado_id: empId,
      empleado_nombre: emp ? emp.nombre : '(empleado #' + empId + ')',
      dia_offset: off,
      marcas: lista.map(function (d) {
        const c = capById[d.captura_id];
        return {
          captura_id: d.captura_id,
          proyecto:   c ? c.proyecto : '',
          supervisor: c ? c.supervisor : '',
          marca:      String(d.marca).toUpperCase()
        };
      })
    });
  });

  return jsonResp({ ok: true, conflictos: conflictos });
}

function logAprobacion(capturaId, accion, usuario, comentario) {
  try {
    const sh = getSheet(HOJAS.APROBACIONES_LOG);
    if (!sh) return;
    const id = nextId(sh, 0);
    sh.appendRow([id, capturaId, accion, usuario, nowStr(), comentario || '']);
  } catch (err) {
    Logger.log('logAprobacion error: ' + err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══ FASE 3c: CAPTURA ADMINISTRATIVA (nomina-finanzas)                       ═══
// ═══════════════════════════════════════════════════════════════════════════════

function handleObtenerCapturaAdmin(data) {
  const usuario = userName(data);
  let quincenaId = data.quincena_id;

  if (!quincenaId) {
    const qActual = quincenaParaFecha(new Date());
    const capturasRows = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());

    quincenaId = qActual.id;
    for (let i = 1; i <= MAX_QUINCENAS_ATRAS; i++) {
      const qPrev = quincenaAnterior(qActual.id, i);
      const pend = capturasRows.filter(function (c) {
        return normFecha(c.quincena_id) === qPrev.id
            && c.proyecto === PROYECTO_ADMIN
            && ['BORRADOR','ENVIADA','RECHAZADA'].indexOf(c.estado) >= 0;
      }).length;
      if (pend > 0) {
        quincenaId = qPrev.id;
        break;
      }
    }
  }
  asegurarQuincena(quincenaId, usuario);

  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];

  let capturaIdExistente = null;
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    headers.forEach(function (h, j) { obj[h] = rows[i][j]; });
    if (normFecha(obj.quincena_id) === quincenaId && obj.proyecto === PROYECTO_ADMIN) {
      capturaIdExistente = obj.id;
      break;
    }
  }

  if (!capturaIdExistente) {
    const lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(e) { Logger.log('lock fail: ' + e); }
    try {
      const rows2 = sh.getDataRange().getValues();
      for (let i = 1; i < rows2.length; i++) {
        const obj = {};
        headers.forEach(function (h, j) { obj[h] = rows2[i][j]; });
        if (normFecha(obj.quincena_id) === quincenaId && obj.proyecto === PROYECTO_ADMIN) {
          capturaIdExistente = obj.id;
          break;
        }
      }
      if (!capturaIdExistente) {
        const nuevoId = nextId(sh, 0);
        sh.appendRow([
          nuevoId, "'" + quincenaId, PROYECTO_ADMIN, usuario,
          'BORRADOR', '', nowStr(), '', '', ''
        ]);
        capturaIdExistente = nuevoId;

        const todasCapturas = rowsToObjects(sh.getDataRange().getValues());
        const adminAnteriores = todasCapturas
          .filter(function (c) {
            return c.proyecto === PROYECTO_ADMIN &&
                   normFecha(c.quincena_id) < quincenaId &&
                   String(c.id) !== String(nuevoId);
          })
          .sort(function (a, b) {
            return String(normFecha(b.quincena_id)).localeCompare(String(normFecha(a.quincena_id)));
          });
        const anterior = adminAnteriores[0];
        if (anterior) {
          const empIds = empleadosEnCaptura(anterior.id);
          const shDias = getSheet(HOJAS.CAPTURA_DIAS);
          empIds.forEach(function (empId) {
            shDias.appendRow([nextId(shDias, 0), nuevoId, empId, -1, '']);
          });
        }
      }
    } finally {
      try { lock.releaseLock(); } catch(e) {}
    }
  }

  const capturas = rowsToObjects(sh.getDataRange().getValues());
  let cap = capturas.find(function (c) { return String(c.id) === String(capturaIdExistente); });
  cap = Object.assign({}, cap, { quincena_id: normFecha(cap.quincena_id) });
  return jsonResp(payloadCaptura(cap));
}

function handleCerrarCapturaAdmin(data) {
  const capturaId = data.captura_id;
  if (!capturaId) return jsonResp({ ok: false, error: 'falta captura_id' });

  const usuario = userName(data);
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colEstado    = headers.indexOf('estado');
  const colProyecto  = headers.indexOf('proyecto');
  const colAprobador = headers.indexOf('aprobada_por');
  const colFecha     = headers.indexOf('fecha_aprobacion');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      if (rows[i][colProyecto] !== PROYECTO_ADMIN) {
        return jsonResp({ ok: false, error: 'esta no es una captura administrativa' });
      }
      const estado = rows[i][colEstado];
      if (estado !== 'BORRADOR') {
        return jsonResp({ ok: false, error: 'solo BORRADOR puede cerrarse, está en ' + estado });
      }
      sh.getRange(i+1, colEstado+1).setValue('CERRADA');
      if (colAprobador >= 0) sh.getRange(i+1, colAprobador+1).setValue(usuario);
      if (colFecha >= 0)     sh.getRange(i+1, colFecha+1).setValue(nowStr());

      logAprobacion(capturaId, 'CERRAR_ADMIN', usuario, '');
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

function handleReabrirCapturaAdmin(data) {
  if (!userTieneApp(data, 'nomina-finanzas') && !userTieneApp(data, 'nomina-aprobar')) {
    return jsonResp({ ok: false, error: 'sin permiso (requiere nomina-finanzas o nomina-aprobar)' });
  }

  const capturaId = data.captura_id;
  const motivo = String(data.motivo || '').trim();
  if (!capturaId) return jsonResp({ ok: false, error: 'falta captura_id' });

  const usuario = userName(data);
  const sh = getSheet(HOJAS.CAPTURAS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const colEstado    = headers.indexOf('estado');
  const colProyecto  = headers.indexOf('proyecto');
  const colAprobador = headers.indexOf('aprobada_por');
  const colFecha     = headers.indexOf('fecha_aprobacion');
  const colQuincena  = headers.indexOf('quincena_id');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      if (rows[i][colProyecto] !== PROYECTO_ADMIN) {
        return jsonResp({ ok: false, error: 'esta no es una captura administrativa' });
      }
      const estado = rows[i][colEstado];
      if (estado !== 'CERRADA') {
        return jsonResp({ ok: false, error: 'solo CERRADA puede reabrirse, está en ' + estado });
      }

      const quincenaId = normFecha(rows[i][colQuincena]);

      // Bloqueo: quincena PAGADA es inamovible
      const shQ = getSheet(HOJAS.QUINCENAS);
      if (shQ && quincenaId) {
        const qRows = shQ.getDataRange().getValues();
        const headersQ = qRows[0];
        const colEstadoQ = headersQ.indexOf('estado');
        for (let j = 1; j < qRows.length; j++) {
          if (normFecha(qRows[j][0]) === quincenaId) {
            const estadoQ = colEstadoQ >= 0 ? qRows[j][colEstadoQ] : '';
            if (estadoQ === 'PAGADA') {
              return jsonResp({
                ok: false,
                error: 'no se puede reabrir: la quincena ' + quincenaId + ' ya fue PAGADA'
              });
            }
            break;
          }
        }
      }

      // Paso 1: reabrir captura admin
      sh.getRange(i+1, colEstado+1).setValue('BORRADOR');
      if (colAprobador >= 0) sh.getRange(i+1, colAprobador+1).setValue('');
      if (colFecha >= 0)     sh.getRange(i+1, colFecha+1).setValue('');

      logAprobacion(capturaId, 'REABRIR_ADMIN', usuario, motivo);

      // Paso 2: invalidar snapshot si existe (best-effort)
      let snapshotInvalidado = false;
      let filasBorradas = { resultados: 0, agregados: 0 };
      let warningInvalidacion = null;
      try {
        asegurarHojasNomina();
        filasBorradas = withLock(function () {
          return _invalidarSnapshotInterno(quincenaId);
        });
        snapshotInvalidado = (filasBorradas.resultados + filasBorradas.agregados) > 0;
      } catch (err) {
        warningInvalidacion = 'No se pudo invalidar snapshot automáticamente: ' + err.toString() +
                              '. Invalida manualmente la quincena ' + quincenaId + '.';
        Logger.log('handleReabrirCapturaAdmin: ' + warningInvalidacion);
      }

      const resp = { ok: true, snapshot_invalidado: snapshotInvalidado, filas_borradas: filasBorradas };
      if (warningInvalidacion) resp.warning = warningInvalidacion;
      return jsonResp(resp);
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══ FASE 3b — Cálculo de nómina                                             ═══
// ═══════════════════════════════════════════════════════════════════════════════
//
// Modelo (v3.8.3 — 3 casos):
//   - bruto = (T + D) × tarifa + extras + viáticos
//   - Tope IMSS $4,410.56 quincenal por empleado IMSS
//
//   CASO A — IMSS con bruto > tope:
//     · NOMINA_DIRECTO = tope IMSS prorrateado por días T+D entre proyectos
//     · Contadores dispersan el excedente (no se registra en TRANSACCIONES)
//     · NOMINA proyecto = bruto × 1.06 (comisión 6% adentro)
//     · REINTEGRO recibe el tope
//
//   CASO B — IMSS con bruto ≤ tope:
//     · NOMINA_DIRECTO = bruto entero (CAMI paga directo, como proveedor)
//     · NO pasa por contadores, NO comisión 6%, NO REINTEGRO
//     · Bruto NO entra en NOMINA del proyecto
//
//   CASO C — NO_IMSS:
//     · NOMINA_DIRECTO = $0
//     · Contadores dispersan TODO el bruto (no se registra)
//     · NOMINA proyecto = bruto × 1.06
//     · NO REINTEGRO
//
// Endpoints (todos cableados en doPost desde Bloque 7):
//   - calcularNominaPreview — preview en vivo, no escribe
//   - invalidarCalculoNomina — borra snapshot, idempotente (Bloque 3)
//   - obtenerCalculoNomina — lee snapshot crudo (Bloque 4)
//   - guardarCalculoNomina — escribe snapshot único (Bloque 5)

/**
 * Función pura de cálculo. Lee capturas APROBADA y CERRADA de la quincena,
 * aplica el modelo y devuelve el desglose completo. NO escribe en sheets.
 *
 * Reutilizada por handleCalcularNominaPreview (preview) y handleGuardarCalculoNomina
 * (snapshot inmutable).
 *
 * Cada fila de `resultados` incluye:
 *   id_captura, empleado_id, empleado_nombre, empleado_tipo, proyecto,
 *   dias_t, dias_d, dias_f, dias_b, dias_pagables, tarifa_diaria,
 *   monto_salario, monto_extras, monto_viaticos, bruto_proyecto,
 *   tope_imss_aplicado, nomina_directo, excedente, comision_6pct, total_a_contadores
 */
function calcularNomina(quincenaId) {
  if (!quincenaId) return { ok: false, error: 'falta quincena_id' };

  const TOPE_IMSS = 4410.56;
  const COMISION = 0.06;
  const PROYECTO_REINTEGRO = 'TRANSITO';

  // 1. Leer capturas APROBADA y CERRADA de esta quincena
  const capturasAll = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());
  const capturasIncluidas = capturasAll.filter(function (c) {
    return normFecha(c.quincena_id) === quincenaId &&
           (c.estado === 'APROBADA' || c.estado === 'CERRADA');
  });

  const capturasOmitidas = capturasAll.filter(function (c) {
    return normFecha(c.quincena_id) === quincenaId &&
           c.estado !== 'APROBADA' && c.estado !== 'CERRADA';
  });

  if (capturasIncluidas.length === 0) {
    return {
      ok: true,
      quincena_id: quincenaId,
      warnings: ['No hay capturas APROBADA ni CERRADA en esta quincena'],
      capturas_omitidas: capturasOmitidas.map(function (c) {
        return { proyecto: c.proyecto, supervisor: c.supervisor, estado: c.estado };
      }),
      resultados: [],
      agregados_proyecto: [],
      filas_nomina_directo: [],
      totales: {}
    };
  }

  const idsIncluidas = {};
  capturasIncluidas.forEach(function (c) { idsIncluidas[c.id] = c; });

  // 2. Leer días, extras, viáticos solo de las capturas incluidas
  const dias = rowsToObjects(getSheet(HOJAS.CAPTURA_DIAS).getDataRange().getValues())
    .filter(function (d) { return idsIncluidas[d.captura_id]; });
  const extras = rowsToObjects(getSheet(HOJAS.CAPTURA_EXTRAS).getDataRange().getValues())
    .filter(function (e) { return idsIncluidas[e.captura_id]; });
  const viaticos = rowsToObjects(getSheet(HOJAS.CAPTURA_VIATICOS).getDataRange().getValues())
    .filter(function (v) { return idsIncluidas[v.captura_id]; });

  // 3. Catálogo de empleados
  const empAll = rowsToObjects(getSheet(HOJAS.EMPLEADOS).getDataRange().getValues());
  const empById = {};
  empAll.forEach(function (e) { empById[e.id] = e; });

  // 4. Agrupar por (empleado, proyecto)
  const agregado = {};
  function keyEP(empId, proy) { return empId + '|' + proy; }

  dias.forEach(function (d) {
    const marca = String(d.marca || '').toUpperCase();
    if (['T','D','F','B'].indexOf(marca) < 0) return;
    const offset = parseInt(d.dia_offset, 10);
    if (isNaN(offset) || offset < 0 || offset > 13) return;
    const cap = idsIncluidas[d.captura_id];
    if (!cap) return;
    const emp = empById[d.empleado_id];
    if (!emp) return;
    const tarifa = parseFloat(emp.tarifa_diaria || 0);
    const k = keyEP(d.empleado_id, cap.proyecto);
    if (!agregado[k]) {
      agregado[k] = {
        empleado_id: d.empleado_id, proyecto: cap.proyecto,
        dias_t: 0, dias_d: 0, dias_f: 0, dias_b: 0, dias_pagables: 0,
        monto_salario: 0, monto_extras: 0, monto_viaticos: 0,
        id_captura: cap.id
      };
    }
    if (marca === 'T') {
      agregado[k].dias_t++;
      agregado[k].dias_pagables++;
      agregado[k].monto_salario += tarifa;
    } else if (marca === 'D') {
      agregado[k].dias_d++;
      agregado[k].dias_pagables++;
      agregado[k].monto_salario += tarifa;
    } else if (marca === 'F') {
      agregado[k].dias_f++;
    } else if (marca === 'B') {
      agregado[k].dias_b++;
    }
  });

  extras.forEach(function (e) {
    const cap = idsIncluidas[e.captura_id];
    if (!cap) return;
    const monto = parseFloat(e.monto || 0);
    if (!monto) return;
    const k = keyEP(e.empleado_id, cap.proyecto);
    if (!agregado[k]) {
      agregado[k] = {
        empleado_id: e.empleado_id, proyecto: cap.proyecto,
        dias_t: 0, dias_d: 0, dias_f: 0, dias_b: 0, dias_pagables: 0,
        monto_salario: 0, monto_extras: 0, monto_viaticos: 0,
        id_captura: cap.id
      };
    }
    agregado[k].monto_extras += monto;
  });

  viaticos.forEach(function (v) {
    const cap = idsIncluidas[v.captura_id];
    if (!cap) return;
    const monto = parseFloat(v.monto || 0);
    if (!monto) return;
    const k = keyEP(v.empleado_id, cap.proyecto);
    if (!agregado[k]) {
      agregado[k] = {
        empleado_id: v.empleado_id, proyecto: cap.proyecto,
        dias_t: 0, dias_d: 0, dias_f: 0, dias_b: 0, dias_pagables: 0,
        monto_salario: 0, monto_extras: 0, monto_viaticos: 0,
        id_captura: cap.id
      };
    }
    agregado[k].monto_viaticos += monto;
  });

  // 5. Calcular bruto por (empleado, proyecto) y totales por empleado
  const totalesEmpleado = {};
  Object.keys(agregado).forEach(function (k) {
    const a = agregado[k];
    a.bruto_proyecto = a.monto_salario + a.monto_extras + a.monto_viaticos;
    if (!totalesEmpleado[a.empleado_id]) {
      totalesEmpleado[a.empleado_id] = { dias_pagables: 0, bruto_total: 0 };
    }
    totalesEmpleado[a.empleado_id].dias_pagables += a.dias_pagables;
    totalesEmpleado[a.empleado_id].bruto_total += a.bruto_proyecto;
  });

  // 6. Clasificar cada empleado en caso A, B o C y aplicar reglas de pago
  //
  //   A: IMSS con bruto_total > tope IMSS → NOMINA_DIRECTO = tope, va a contadores
  //   B: IMSS con bruto_total ≤ tope IMSS → NOMINA_DIRECTO = bruto, NO va a contadores
  //   C: NO_IMSS → NOMINA_DIRECTO = $0, bruto entero va a contadores
  //
  // El caso se determina por empleado (no por fila empleado×proyecto), luego se
  // prorratea entre los proyectos del empleado proporcional a días pagables.
  const filasNominaDirecto = [];
  Object.keys(agregado).forEach(function (k) {
    const a = agregado[k];
    const emp = empById[a.empleado_id];
    if (!emp) return;
    const tipo = emp.tipo;
    const totales = totalesEmpleado[a.empleado_id];
    const proporcion = totales.dias_pagables > 0 ? a.dias_pagables / totales.dias_pagables : 0;

    // Clasificación A/B/C
    let caso;
    if (tipo === 'IMSS') {
      caso = (totales.bruto_total > TOPE_IMSS) ? 'A' : 'B';
    } else {
      caso = 'C';
    }
    a.caso_pago = caso;

    // Calcular nomina_directo, tope_imss_aplicable, excedente, comisión, total_neto
    // segun el caso
    if (caso === 'A') {
      // NOMINA_DIRECTO = tope prorrateado. Bruto fila va a contadores con comisión.
      a.nomina_directo = TOPE_IMSS * proporcion;
      a.tope_imss_aplicado = TOPE_IMSS * proporcion;
      a.excedente = a.bruto_proyecto - a.nomina_directo;
      a.comision_6pct = a.bruto_proyecto * COMISION;
      a.total_a_contadores = a.bruto_proyecto * (1 + COMISION);
    } else if (caso === 'B') {
      // NOMINA_DIRECTO = bruto fila completo. NO pasa por contadores.
      a.nomina_directo = a.bruto_proyecto;
      a.tope_imss_aplicado = 0;
      a.excedente = 0;
      a.comision_6pct = 0;
      a.total_a_contadores = 0;
    } else {
      // Caso C — NO_IMSS. Bruto fila entero a contadores, $0 directo.
      a.nomina_directo = 0;
      a.tope_imss_aplicado = 0;
      a.excedente = a.bruto_proyecto;
      a.comision_6pct = a.bruto_proyecto * COMISION;
      a.total_a_contadores = a.bruto_proyecto * (1 + COMISION);
    }

    filasNominaDirecto.push({
      empleado_id: a.empleado_id,
      empleado_nombre: emp.nombre,
      empleado_tipo: tipo,
      caso_pago: caso,
      proyecto: a.proyecto,
      monto: round2(a.nomina_directo)
    });
  });

  // 7. Construir resultados detallados (incluye id_captura, dias_f, dias_b, excedente, caso_pago)
  const resultados = Object.keys(agregado).map(function (k) {
    const a = agregado[k];
    const emp = empById[a.empleado_id];
    return {
      id_captura: a.id_captura || '',
      empleado_id: a.empleado_id,
      empleado_nombre: emp ? emp.nombre : '(empleado #' + a.empleado_id + ')',
      empleado_tipo: emp ? emp.tipo : '',
      caso_pago: a.caso_pago || '',
      proyecto: a.proyecto,
      dias_t: a.dias_t,
      dias_d: a.dias_d,
      dias_f: a.dias_f,
      dias_b: a.dias_b,
      dias_pagables: a.dias_pagables,
      tarifa_diaria: emp ? parseFloat(emp.tarifa_diaria || 0) : 0,
      monto_salario: round2(a.monto_salario),
      monto_extras: round2(a.monto_extras),
      monto_viaticos: round2(a.monto_viaticos),
      bruto_proyecto: round2(a.bruto_proyecto),
      tope_imss_aplicado: round2(a.tope_imss_aplicado),
      nomina_directo: round2(a.nomina_directo),
      excedente: round2(a.excedente),
      comision_6pct: round2(a.comision_6pct),
      total_a_contadores: round2(a.total_a_contadores)
    };
  });

  // 8. Agregados por proyecto
  const porProyecto = {};
  resultados.forEach(function (r) {
    if (!porProyecto[r.proyecto]) {
      porProyecto[r.proyecto] = {
        proyecto: r.proyecto, num_empleados_set: {},
        bruto_total: 0, comision_6pct: 0, total_a_contadores: 0,
        nomina_directo_total: 0, dias_t: 0, dias_d: 0
      };
    }
    const p = porProyecto[r.proyecto];
    p.num_empleados_set[r.empleado_id] = true;
    p.bruto_total += r.bruto_proyecto;
    p.comision_6pct += r.comision_6pct;
    p.total_a_contadores += r.total_a_contadores;
    p.nomina_directo_total += r.nomina_directo;
    p.dias_t += r.dias_t;
    p.dias_d += r.dias_d;
  });
  const agregadosProyecto = Object.keys(porProyecto).map(function (k) {
    const p = porProyecto[k];
    return {
      proyecto: p.proyecto,
      num_empleados: Object.keys(p.num_empleados_set).length,
      dias_t: p.dias_t,
      dias_d: p.dias_d,
      bruto_total: round2(p.bruto_total),
      comision_6pct: round2(p.comision_6pct),
      total_a_contadores: round2(p.total_a_contadores),
      nomina_directo_total: round2(p.nomina_directo_total)
    };
  });
  agregadosProyecto.sort(function (a, b) { return String(a.proyecto).localeCompare(String(b.proyecto)); });

  // 9. Totales globales
  //   - bruto_total: suma de TODOS los brutos (incluye casos A, B, C)
  //   - comision_total / total_a_contadores: suma sobre filas
  //     (caso B aporta $0 porque ya quedó así en la fila)
  //   - reintegro_total: suma de tope_imss_aplicado (caso B y C aportan $0)
  let brutoTotal = 0, ndTotal = 0, topeImssTotal = 0;
  let comisionTotal = 0, totalContadoresTotal = 0;
  resultados.forEach(function (r) {
    brutoTotal += r.bruto_proyecto;
    ndTotal += r.nomina_directo;
    topeImssTotal += r.tope_imss_aplicado;
    comisionTotal += r.comision_6pct;
    totalContadoresTotal += r.total_a_contadores;
  });

  const totales = {
    bruto_total: round2(brutoTotal),
    comision_6pct: round2(comisionTotal),
    total_a_contadores: round2(totalContadoresTotal),
    nomina_directo_total: round2(ndTotal),
    reintegro_total: round2(topeImssTotal),
    reintegro_proyecto: PROYECTO_REINTEGRO,
    num_empleados: Object.keys(totalesEmpleado).length,
    num_proyectos: Object.keys(porProyecto).length
  };

  // 10. Warnings
  const warnings = [];
  if (capturasOmitidas.length > 0) {
    capturasOmitidas.forEach(function (c) {
      warnings.push('Captura ' + c.proyecto + ' (' + c.supervisor + ') NO incluida — estado ' + c.estado);
    });
  }

  return {
    ok: true,
    quincena_id: quincenaId,
    capturas_incluidas: capturasIncluidas.length,
    capturas_omitidas: capturasOmitidas.length,
    warnings: warnings,
    resultados: resultados,
    agregados_proyecto: agregadosProyecto,
    filas_nomina_directo: filasNominaDirecto,
    totales: totales
  };
}

/**
 * Wrapper HTTP — preview en vivo. La lógica vive en calcularNomina().
 */
function handleCalcularNominaPreview(data) {
  return jsonResp(calcularNomina(data.quincena_id));
}

/**
 * Función interna de borrado de snapshot. NO valida permisos ni estado PAGADA
 * — el caller debe haber validado ya. Devuelve { resultados: N, agregados: M }.
 *
 * Usada por:
 *   - handleInvalidarCalculoNomina (endpoint público, valida permiso y PAGADA)
 *   - handleReabrirCaptura / handleReabrirCapturaAdmin (post-reapertura)
 *
 * Debe llamarse dentro de un withLock por el caller.
 */
function _invalidarSnapshotInterno(quincenaId) {
  let borradasResultados = 0;
  let borradasAgregados = 0;

  // NOMINA_RESULTADOS: id_quincena en columna 1
  const shR = getSheet(HOJAS.NOMINA_RESULTADOS);
  if (shR && shR.getLastRow() > 1) {
    const rows = shR.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (normFecha(rows[i][1]) === quincenaId) {
        shR.deleteRow(i + 1);
        borradasResultados++;
      }
    }
  }

  // NOMINA_AGREGADOS: id_quincena en columna 0
  const shA = getSheet(HOJAS.NOMINA_AGREGADOS);
  if (shA && shA.getLastRow() > 1) {
    const rows = shA.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (normFecha(rows[i][0]) === quincenaId) {
        shA.deleteRow(i + 1);
        borradasAgregados++;
      }
    }
  }

  return { resultados: borradasResultados, agregados: borradasAgregados };
}

/**
 * Bloque 3 — Endpoint público: invalida el snapshot de cálculo de una quincena.
 *
 * Idempotente: si no hay filas, retorna éxito con contadores en 0.
 * Bloqueo: si la quincena está PAGADA (Fase 3f), no se permite invalidar.
 * Permiso: nomina-aprobar O nomina-finanzas (validado en handler).
 */
function handleInvalidarCalculoNomina(data) {
  const quincenaId = String(data.quincena_id || '').trim();
  if (!quincenaId) return jsonResp({ ok: false, error: 'falta quincena_id' });

  if (!userTieneApp(data, 'nomina-aprobar') && !userTieneApp(data, 'nomina-finanzas')) {
    return jsonResp({ ok: false, error: 'sin permiso (requiere nomina-aprobar o nomina-finanzas)' });
  }

  asegurarHojasNomina();

  // Bloqueo: quincena PAGADA
  const shQ = getSheet(HOJAS.QUINCENAS);
  if (shQ) {
    const qRows = shQ.getDataRange().getValues();
    const headersQ = qRows[0];
    const colEstadoQ = headersQ.indexOf('estado');
    for (let i = 1; i < qRows.length; i++) {
      if (normFecha(qRows[i][0]) === quincenaId) {
        const estadoQ = colEstadoQ >= 0 ? qRows[i][colEstadoQ] : '';
        if (estadoQ === 'PAGADA') {
          return jsonResp({
            ok: false,
            error: 'no se puede invalidar: la quincena ' + quincenaId + ' ya fue PAGADA'
          });
        }
        break;
      }
    }
  }

  return withLock(function () {
    const filasBorradas = _invalidarSnapshotInterno(quincenaId);
    return jsonResp({ ok: true, filasBorradas: filasBorradas });
  });
}

/**
 * Bloque 4 — Obtiene el snapshot guardado de una quincena.
 *
 * Solo lectura. Devuelve filas crudas + estado de la quincena.
 * Si no hay snapshot, retorna calculado: false.
 * Permiso: nomina-aprobar O nomina-finanzas (validado en handler).
 */
function handleObtenerCalculoNomina(data) {
  const quincenaId = String(data.quincena_id || '').trim();
  if (!quincenaId) return jsonResp({ ok: false, error: 'falta quincena_id' });

  if (!userTieneApp(data, 'nomina-aprobar') && !userTieneApp(data, 'nomina-finanzas')) {
    return jsonResp({ ok: false, error: 'sin permiso (requiere nomina-aprobar o nomina-finanzas)' });
  }

  asegurarHojasNomina();

  // Estado de la quincena
  let estadoQuincena = null;
  const shQ = getSheet(HOJAS.QUINCENAS);
  if (shQ) {
    const qRows = shQ.getDataRange().getValues();
    const headersQ = qRows[0];
    const colEstadoQ = headersQ.indexOf('estado');
    for (let i = 1; i < qRows.length; i++) {
      if (normFecha(qRows[i][0]) === quincenaId) {
        estadoQuincena = colEstadoQ >= 0 ? qRows[i][colEstadoQ] : null;
        break;
      }
    }
  }

  // NOMINA_RESULTADOS: id_quincena en columna 1
  const resultados = [];
  const shR = getSheet(HOJAS.NOMINA_RESULTADOS);
  if (shR && shR.getLastRow() > 1) {
    const rows = shR.getDataRange().getValues();
    const headers = rows[0];
    for (let i = 1; i < rows.length; i++) {
      if (normFecha(rows[i][1]) === quincenaId) {
        const obj = {};
        headers.forEach(function (h, j) { obj[h] = rows[i][j]; });
        resultados.push(obj);
      }
    }
  }

  // NOMINA_AGREGADOS: id_quincena en columna 0
  const agregados = [];
  const shA = getSheet(HOJAS.NOMINA_AGREGADOS);
  if (shA && shA.getLastRow() > 1) {
    const rows = shA.getDataRange().getValues();
    const headers = rows[0];
    for (let i = 1; i < rows.length; i++) {
      if (normFecha(rows[i][0]) === quincenaId) {
        const obj = {};
        headers.forEach(function (h, j) { obj[h] = rows[i][j]; });
        agregados.push(obj);
      }
    }
  }

  const calculado = resultados.length > 0;
  const timestampCalculo = calculado ? resultados[0].timestamp_calculo : null;
  const guardadoPor      = calculado ? resultados[0].guardado_por      : null;

  return jsonResp({
    ok: true,
    quincena_id: quincenaId,
    calculado: calculado,
    timestamp_calculo: timestampCalculo,
    guardado_por: guardadoPor,
    estado_quincena: estadoQuincena,
    resultados: resultados,
    agregados: agregados
  });
}

/**
 * Bloque 5 — Guarda el snapshot de cálculo de una quincena.
 *
 * Política snapshot único: rechaza si ya existe (front debe invalidar primero).
 * Bloqueo: quincena PAGADA no se puede guardar.
 * Atómico: escribe R y A en un solo lock, con setValues() por bloques.
 * Permiso: nomina-aprobar O nomina-finanzas.
 */
function handleGuardarCalculoNomina(data) {
  const quincenaId = String(data.quincena_id || '').trim();
  if (!quincenaId) return jsonResp({ ok: false, error: 'falta quincena_id' });

  if (!userTieneApp(data, 'nomina-aprobar') && !userTieneApp(data, 'nomina-finanzas')) {
    return jsonResp({ ok: false, error: 'sin permiso (requiere nomina-aprobar o nomina-finanzas)' });
  }

  asegurarHojasNomina();

  // Bloqueo: quincena PAGADA
  const shQ = getSheet(HOJAS.QUINCENAS);
  if (shQ) {
    const qRows = shQ.getDataRange().getValues();
    const headersQ = qRows[0];
    const colEstadoQ = headersQ.indexOf('estado');
    for (let i = 1; i < qRows.length; i++) {
      if (normFecha(qRows[i][0]) === quincenaId) {
        const estadoQ = colEstadoQ >= 0 ? qRows[i][colEstadoQ] : '';
        if (estadoQ === 'PAGADA') {
          return jsonResp({
            ok: false,
            error: 'no se puede guardar: la quincena ' + quincenaId + ' ya fue PAGADA'
          });
        }
        break;
      }
    }
  }

  return withLock(function () {
    const shR = getSheet(HOJAS.NOMINA_RESULTADOS);
    const shA = getSheet(HOJAS.NOMINA_AGREGADOS);

    // Verificación dentro del lock: snapshot único
    if (shR && shR.getLastRow() > 1) {
      const rowsR = shR.getDataRange().getValues();
      for (let i = 1; i < rowsR.length; i++) {
        if (normFecha(rowsR[i][1]) === quincenaId) {
          return jsonResp({
            ok: false,
            error: 'ya existe snapshot para ' + quincenaId + '. Invalida primero con invalidarCalculoNomina.'
          });
        }
      }
    }

    // Ejecutar cálculo
    const calc = calcularNomina(quincenaId);
    if (!calc.ok) {
      return jsonResp({ ok: false, error: 'error al calcular: ' + (calc.error || 'desconocido') });
    }

    // Sin filas para guardar
    if (!calc.resultados || calc.resultados.length === 0) {
      return jsonResp({
        ok: true,
        quincena_id: quincenaId,
        filasGuardadas: { resultados: 0, agregados: 0 },
        timestamp_calculo: null,
        warnings: calc.warnings || ['Sin capturas APROBADA/CERRADA para calcular']
      });
    }

    const timestampCalculo = nowStr();
    const guardadoPor = userName(data);

    // Construir filas para NOMINA_RESULTADOS (23 columnas)
    const proximoIdR = nextId(shR, 0);
    const filasR = calc.resultados.map(function (r, idx) {
      return [
        proximoIdR + idx,            // id_resultado
        quincenaId,                  // id_quincena
        r.id_captura,                // id_captura
        r.empleado_id,               // id_empleado
        r.empleado_nombre,           // empleado_nombre
        r.proyecto,                  // proyecto
        r.dias_t,                    // dias_t
        r.dias_d,                    // dias_d
        r.dias_f,                    // dias_f
        r.dias_b,                    // dias_b
        r.dias_pagables,             // dias_pagables
        r.tarifa_diaria,             // tarifa_diaria
        r.monto_salario,             // bruto_base
        r.monto_extras,              // extras
        r.monto_viaticos,            // viaticos
        r.bruto_proyecto,            // bruto_total
        r.tope_imss_aplicado,        // tope_imss_aplicable
        r.nomina_directo,            // nomina_directo
        r.excedente,                 // excedente
        r.comision_6pct,             // comision
        r.total_a_contadores,        // total_neto
        timestampCalculo,            // timestamp_calculo
        guardadoPor                  // guardado_por
      ];
    });

    // Construir filas para NOMINA_AGREGADOS (12 columnas)
    const filasA = calc.agregados_proyecto.map(function (a) {
      const totalExcedente = round2(a.bruto_total - a.nomina_directo_total);
      return [
        quincenaId,                  // id_quincena
        a.proyecto,                  // proyecto
        a.num_empleados,             // total_empleados
        a.dias_t,                    // total_dias_t
        a.dias_d,                    // total_dias_d
        a.bruto_total,               // total_bruto
        a.nomina_directo_total,      // total_nomina_directo
        totalExcedente,              // total_excedente
        a.comision_6pct,             // total_comision
        a.total_a_contadores,        // monto_nomina_transaccion
        timestampCalculo,            // timestamp_calculo
        guardadoPor                  // guardado_por
      ];
    });

    // Escribir NOMINA_RESULTADOS primero (bloque)
    if (filasR.length > 0) {
      const startRowR = shR.getLastRow() + 1;
      shR.getRange(startRowR, 1, filasR.length, filasR[0].length).setValues(filasR);
    }

    // Si R completó, escribir NOMINA_AGREGADOS
    if (filasA.length > 0) {
      const startRowA = shA.getLastRow() + 1;
      shA.getRange(startRowA, 1, filasA.length, filasA[0].length).setValues(filasA);
    }

    return jsonResp({
      ok: true,
      quincena_id: quincenaId,
      filasGuardadas: {
        resultados: filasR.length,
        agregados: filasA.length
      },
      timestamp_calculo: timestampCalculo,
      warnings: calc.warnings || []
    });
  });
}

// ─── INICIALIZACIÓN Y MANTENIMIENTO ──────────────────────────────────────────

/**
 * Asegura que existan NOMINA_RESULTADOS y NOMINA_AGREGADOS con headers correctos.
 * Idempotente. Llamada por endpoints de Fase 3b al inicio.
 */
function asegurarHojasNomina() {
  const ss = SpreadsheetApp.getActive();

  const defs = [
    { nombre: HOJAS.NOMINA_RESULTADOS, headers: HEADERS.NOMINA_RESULTADOS },
    { nombre: HOJAS.NOMINA_AGREGADOS,  headers: HEADERS.NOMINA_AGREGADOS  }
  ];

  let needsWork = false;
  for (let i = 0; i < defs.length; i++) {
    const sh = ss.getSheetByName(defs[i].nombre);
    if (!sh) { needsWork = true; break; }
    const cols = Math.max(sh.getLastColumn(), defs[i].headers.length);
    const existing = sh.getRange(1, 1, 1, cols).getValues()[0];
    const match = defs[i].headers.every(function (h, j) { return existing[j] === h; });
    if (!match) { needsWork = true; break; }
  }
  if (!needsWork) return;

  defs.forEach(function (d) {
    let sh = ss.getSheetByName(d.nombre);
    if (!sh) {
      sh = ss.insertSheet(d.nombre);
      sh.getRange(1, 1, 1, d.headers.length).setValues([d.headers]);
      sh.getRange(1, 1, 1, d.headers.length).setFontWeight('bold').setBackground('#1A1A18').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
      return;
    }
    const cols = Math.max(sh.getLastColumn(), d.headers.length);
    const existing = sh.getRange(1, 1, 1, cols).getValues()[0];
    const match = d.headers.every(function (h, i) { return existing[i] === h; });
    if (!match) {
      Logger.log('⚠️ Hoja ' + d.nombre + ' existe con headers distintos. NO se sobreescribe.\n' +
                 '  Esperados:   ' + JSON.stringify(d.headers) + '\n' +
                 '  Encontrados: ' + JSON.stringify(existing.slice(0, d.headers.length)));
    }
  });
}

/**
 * Crea todas las hojas desde cero. Útil para clonar el sheet.
 */
function inicializarBD() {
  const ss = SpreadsheetApp.getActive();

  function asegurarHoja(nombre, headers) {
    let sh = ss.getSheetByName(nombre);
    if (!sh) {
      sh = ss.insertSheet(nombre);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1A1A18').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    } else {
      const existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
      const ok = headers.every(function (h, i) { return existing[i] === h; });
      if (!ok) {
        Logger.log('⚠️ Hoja ' + nombre + ' existe con headers distintos. NO se sobreescribe.');
      }
    }
    return sh;
  }

  const shEmp = asegurarHoja(HOJAS.EMPLEADOS, HEADERS.EMPLEADOS);
  if (shEmp.getLastRow() < 2) {
    const fechaAlta = todayStr();
    const filas = PRECARGA_EMPLEADOS.map(function (e) {
      return [e.id, e.nombre, e.tipo, e.nss||'', e.curp||'', e.rfc||'',
              e.banco||'', e.cuenta||'', e.tarifa||0, e.tope||0,
              'SI', fechaAlta, '', ''];
    });
    if (filas.length > 0) {
      shEmp.getRange(2, 1, filas.length, HEADERS.EMPLEADOS.length).setValues(filas);
    }
    [50,320,80,130,170,130,110,200,100,130,60,100,100,200].forEach(function(w,i){
      shEmp.setColumnWidth(i+1, w);
    });
  }

  asegurarHoja(HOJAS.QUINCENAS,         HEADERS.QUINCENAS);
  asegurarHoja(HOJAS.CAPTURAS,          HEADERS.CAPTURAS);
  asegurarHoja(HOJAS.CAPTURA_DIAS,      HEADERS.CAPTURA_DIAS);
  asegurarHoja(HOJAS.CAPTURA_EXTRAS,    HEADERS.CAPTURA_EXTRAS);
  asegurarHoja(HOJAS.CAPTURA_VIATICOS,  HEADERS.CAPTURA_VIATICOS);
  asegurarHoja(HOJAS.APROBACIONES_LOG,  HEADERS.APROBACIONES_LOG);

  asegurarHojasNomina();

  Logger.log('Inicialización v' + VERSION + ' completa.');
}

/**
 * Fuerza el prompt OAuth tras crear el script. Correr una vez desde el editor.
 */
function autorizarPermisos() {
  SpreadsheetApp.getActive().getName();
  UrlFetchApp.fetch('https://www.google.com');
  try { SpreadsheetApp.openById(ID_TRANSACTION_DB).getName(); } catch(e) { Logger.log(e); }
  try { SpreadsheetApp.openById(ID_USUARIOS_DB).getName(); }    catch(e) { Logger.log(e); }
  Logger.log('Permisos OK');
}

/**
 * Limpia días/extras/viáticos de una captura y la regresa a BORRADOR.
 * Útil cuando una captura quedó con datos corruptos.
 */
function limpiarCaptura(capturaId) {
  if (!capturaId) {
    Logger.log('Falta capturaId. Ej: limpiarCaptura(8)');
    return;
  }

  const ss = SpreadsheetApp.getActive();

  const hojas = [HOJAS.CAPTURA_DIAS, HOJAS.CAPTURA_EXTRAS, HOJAS.CAPTURA_VIATICOS];
  hojas.forEach(function (nombreHoja) {
    const sh = ss.getSheetByName(nombreHoja);
    if (!sh) { Logger.log('Hoja ' + nombreHoja + ' no existe'); return; }
    const rows = sh.getDataRange().getValues();
    const headers = rows[0];
    const colCap = headers.indexOf('captura_id');
    if (colCap < 0) { Logger.log('Hoja ' + nombreHoja + ' sin columna captura_id'); return; }

    let borradas = 0;
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][colCap]) === String(capturaId)) {
        sh.deleteRow(i + 1);
        borradas++;
      }
    }
    Logger.log(nombreHoja + ': ' + borradas + ' filas borradas');
  });

  const shCap = ss.getSheetByName(HOJAS.CAPTURAS);
  const rows = shCap.getDataRange().getValues();
  const headers = rows[0];
  const colEstado    = headers.indexOf('estado');
  const colAprobador = headers.indexOf('aprobada_por');
  const colFechaApr  = headers.indexOf('fecha_aprobacion');
  const colComent    = headers.indexOf('comentario_rechazo');
  const colEnvio     = headers.indexOf('fecha_envio');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      const estado = rows[i][colEstado];
      shCap.getRange(i+1, colEstado+1).setValue('BORRADOR');
      if (colAprobador >= 0) shCap.getRange(i+1, colAprobador+1).setValue('');
      if (colFechaApr >= 0)  shCap.getRange(i+1, colFechaApr+1).setValue('');
      if (colComent >= 0)    shCap.getRange(i+1, colComent+1).setValue('');
      if (colEnvio >= 0)     shCap.getRange(i+1, colEnvio+1).setValue('');
      Logger.log('Captura ' + capturaId + ' regresada a BORRADOR (estaba en ' + estado + ')');
      break;
    }
  }

  Logger.log('✓ Captura ' + capturaId + ' limpiada.');
}

// ─── TESTS AISLADOS ──────────────────────────────────────────────────────────

/**
 * v3.8 — Test aislado de quincenaParaFecha. Correr desde el editor.
 * No toca el sheet. Espera 6 casos PASS en el log.
 */
function _testQuincenaParaFecha() {
  const casos = [
    { desc: 'miercoles 20-may-2026 (HOY)', fecha: new Date(2026, 4, 20), esperaInicio: '2026-05-07', esperaFin: '2026-05-20', esperaPago: '2026-05-23' },
    { desc: 'jueves 21-may-2026',           fecha: new Date(2026, 4, 21), esperaInicio: '2026-05-21', esperaFin: '2026-06-03', esperaPago: '2026-06-06' },
    { desc: 'viernes 22-may-2026',          fecha: new Date(2026, 4, 22), esperaInicio: '2026-05-21', esperaFin: '2026-06-03', esperaPago: '2026-06-06' },
    { desc: 'domingo 17-may-2026',          fecha: new Date(2026, 4, 17), esperaInicio: '2026-05-07', esperaFin: '2026-05-20', esperaPago: '2026-05-23' },
    { desc: 'jueves 7-may-2026 (inicio)',   fecha: new Date(2026, 4,  7), esperaInicio: '2026-05-07', esperaFin: '2026-05-20', esperaPago: '2026-05-23' },
    { desc: 'sabado 23-may-2026 (pago)',    fecha: new Date(2026, 4, 23), esperaInicio: '2026-05-21', esperaFin: '2026-06-03', esperaPago: '2026-06-06' }
  ];
  let allPass = true;
  casos.forEach(function (c) {
    const q = quincenaParaFecha(c.fecha);
    const pass = (q.id === c.esperaInicio) && (q.fecha_fin === c.esperaFin) && (q.fecha_pago === c.esperaPago);
    if (!pass) allPass = false;
    Logger.log((pass ? 'PASS ' : 'FAIL ') + c.desc +
      ' -> id=' + q.id + ' fin=' + q.fecha_fin + ' pago=' + q.fecha_pago +
      (pass ? '' : ' (esperado: id=' + c.esperaInicio + ' fin=' + c.esperaFin + ' pago=' + c.esperaPago + ')'));
  });
  Logger.log(allPass ? 'TODOS LOS CASOS PASARON' : 'HAY FALLAS - REVISAR');
}
function _verQuincenasAhora() {
  const sh = getSheet(HOJAS.QUINCENAS);
  const datos = sh.getDataRange().getValues();
  for (var i = 0; i < datos.length; i++) {
    Logger.log('Fila ' + i + ': ' + JSON.stringify(datos[i]));
  }
}
function _verCapturasDeQuincena_2026_05_14() {
  const sh = getSheet(HOJAS.CAPTURAS);
  const datos = sh.getDataRange().getValues();
  Logger.log('Headers: ' + JSON.stringify(datos[0]));
  let cuenta = 0;
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][1]) === '2026-05-14' || datos[i].indexOf('2026-05-14') >= 0) {
      Logger.log('Fila ' + i + ': ' + JSON.stringify(datos[i]));
      cuenta++;
    }
  }
  Logger.log('Total capturas vinculadas: ' + cuenta);
}
function _borrarQuincena_2026_05_14() {
  const ss = SpreadsheetApp.getActive();

  // 1. Borrar captura ID 1 (la única vinculada a esta quincena)
  // No tiene CAPTURA_DIAS, CAPTURA_EXTRAS ni CAPTURA_VIATICOS porque esta en
  // BORRADOR sin datos. Aun asi limpiamos por si acaso (defensa profundidad).
  const idCaptura = 1;
  const hojasHijas = ['CAPTURA_DIAS', 'CAPTURA_EXTRAS', 'CAPTURA_VIATICOS', 'APROBACIONES_LOG'];
  hojasHijas.forEach(function(nombre) {
    const sh = ss.getSheetByName(nombre);
    if (!sh) return;
    const rows = sh.getDataRange().getValues();
    if (rows.length < 2) return;
    const headers = rows[0];
    const colCap = headers.indexOf('captura_id');
    if (colCap < 0) return;
    let borradas = 0;
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][colCap]) === String(idCaptura)) {
        sh.deleteRow(i + 1);
        borradas++;
      }
    }
    Logger.log(nombre + ': borradas ' + borradas + ' filas vinculadas a captura ' + idCaptura);
  });

  // 2. Borrar la captura
  const shCap = ss.getSheetByName('CAPTURAS');
  const rowsC = shCap.getDataRange().getValues();
  for (let i = rowsC.length - 1; i >= 1; i--) {
    if (String(rowsC[i][0]) === String(idCaptura)) {
      shCap.deleteRow(i + 1);
      Logger.log('CAPTURAS: borrada fila captura id=' + idCaptura);
    }
  }

  // 3. Borrar la quincena
  const shQ = ss.getSheetByName('QUINCENAS');
  const rowsQ = shQ.getDataRange().getValues();
  for (let i = rowsQ.length - 1; i >= 1; i--) {
    if (String(rowsQ[i][0]) === '2026-05-14') {
      shQ.deleteRow(i + 1);
      Logger.log('QUINCENAS: borrada fila quincena 2026-05-14');
    }
  }

  // 4. Estado final
  Logger.log('=== ESTADO FINAL ===');
  ['QUINCENAS', 'CAPTURAS', 'CAPTURA_DIAS', 'CAPTURA_EXTRAS', 'CAPTURA_VIATICOS', 'APROBACIONES_LOG'].forEach(function(nombre) {
    const sh = ss.getSheetByName(nombre);
    if (!sh) return;
    const rows = sh.getDataRange().getValues();
    Logger.log(nombre + ': ' + Math.max(0, rows.length - 1) + ' filas de datos');
  });
}

/**
 * v3.8.2+ — Función ad-hoc para invalidar el snapshot de una quincena
 * desde el editor de Apps Script.
 *
 * Razón: el botón "Invalidar" no está cableado en el frontend del
 * panel-aprob-calc. Esta función es el escape hatch cuando se necesita
 * invalidar manualmente.
 *
 * USO:
 *   1. Modifica la constante quincenaId si no es 2026-05-07
 *   2. Selecciona la función en el dropdown del editor
 *   3. Click Run (▶)
 *   4. View → Executions para confirmar resultado
 *
 * NO valida permisos ni estado PAGADA porque se ejecuta directamente
 * desde el editor por el dueño del script.
 */
function _invalidarSnapshotAdHoc() {
  const quincenaId = '2026-05-07';
  Logger.log('Invalidando snapshot de quincena ' + quincenaId + '...');

  const filasBorradas = withLock(function () {
    return _invalidarSnapshotInterno(quincenaId);
  });

  Logger.log('Filas borradas:');
  Logger.log('  NOMINA_RESULTADOS: ' + filasBorradas.resultados);
  Logger.log('  NOMINA_AGREGADOS:  ' + filasBorradas.agregados);
  Logger.log('');
  if (filasBorradas.resultados > 0 || filasBorradas.agregados > 0) {
    Logger.log('OK — invalidación exitosa.');
  } else {
    Logger.log('No había snapshot para esta quincena (ya estaba limpio).');
  }
}