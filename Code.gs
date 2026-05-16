/**
 * CAMI-Nomina v3.3
 * Módulo de nómina quincenal — Fases 1, 2, 3a y 3c.
 *
 * v3.3 (11-may-2026): Fix Bug A — fecha de quincena adelantada.
 *   - handleQuincenaActual ahora devuelve la quincena anterior más reciente
 *     donde el supervisor tenga capturas en BORRADOR / ENVIADA / RECHAZADA.
 *     Si no hay pendientes, devuelve la calendárica.
 *   - Nuevo endpoint `quincenasCapturables` para construir el selector del front.
 *   - Mariana (admin) recibe el mismo trato en obtenerCapturaAdmin (cuando se
 *     llama sin quincena_id explícito).
 *   - Límite: 3 quincenas hacia atrás.
 *
 * v3.2: Fix de race condition en escrituras (handleMarcarDia, handleGuardarExtra,
 *       handleGuardarViatico, handleAgregarEmpleadoCap). Nueva función auxiliar
 *       borrarDatosCaptura(capturaId) para limpiar capturas con datos corruptos.
 *
 * Fase 1: catálogo de empleados (CRUD)
 * Fase 2: quincenas, capturas por obra, días/extras/viáticos, conflictos
 * Fase 3a: panel de aprobación (nomina-aprobar)
 * Fase 3c: captura administrativa de Mariana (nomina-finanzas)
 *
 * Despliegue de v3.3 (sobre v3.2 existente):
 *   1) Pega este código completo en el Apps Script bound a CAMI-Nomina-DB
 *   2) Deploy → Manage deployments → ✏️ → Version: New version → Deploy
 *      (la URL no cambia)
 *   3) No requiere migración de datos.
 */

const VERSION = '3.3';
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

// CAMI Usuarios — fuente de obras asignadas por supervisor (mientras el central no propague esa columna)
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
  NOMINA_RESULTADOS: ['id_resultado','id_quincena','id_captura','id_empleado','proyecto','dias_t','dias_d','dias_f','dias_b','dias_pagables','tarifa_diaria','bruto_base','extras','viaticos','bruto_total','tope_imss_aplicable','nomina_directo','excedente','comision','total_neto','timestamp_calculo'],
  NOMINA_AGREGADOS:  ['id_quincena','proyecto','total_empleados','total_dias_t','total_dias_d','total_bruto','total_nomina_directo','total_excedente','total_comision','monto_nomina_transaccion','timestamp_calculo']
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
      case 'quincenasCapturables': return handleQuincenasCapturables(data); // v3.3
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
      case 'calcularNominaPreview': return handleCalcularNominaPreview(data);

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
  // reabrirCapturaAdmin lo manejamos aparte: lo permite tanto nomina-finanzas como nomina-aprobar
  if (rh.indexOf(action) >= 0)    return 'nomina-rh';
  if (sup.indexOf(action) >= 0)   return 'nomina-supervisor';
  if (aprob.indexOf(action) >= 0) return 'nomina-aprobar';
  if (fin.indexOf(action) >= 0)   return 'nomina-finanzas';
  // reabrirCapturaAdmin: validamos en el handler
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

function quincenaParaFecha(fechaRef) {
  const ref = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), fechaRef.getDate());
  const diaSemana = ref.getDay();
  let retroceso = (diaSemana - 4 + 7) % 7;
  const inicio = new Date(ref);
  inicio.setDate(ref.getDate() - retroceso);

  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 13);

  const pago = new Date(fin);
  pago.setDate(fin.getDate() + 3);

  return {
    id:            Utilities.formatDate(inicio, TZ, 'yyyy-MM-dd'),
    fecha_inicio:  Utilities.formatDate(inicio, TZ, 'yyyy-MM-dd'),
    fecha_fin:     Utilities.formatDate(fin,    TZ, 'yyyy-MM-dd'),
    fecha_pago:    Utilities.formatDate(pago,   TZ, 'yyyy-MM-dd')
  };
}

/**
 * v3.3: dado un quincena_id (jueves), devuelve la quincena N quincenas hacia
 * atrás (siempre jueves). Retorna objeto con id, fecha_inicio, fecha_fin, fecha_pago.
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

function normFecha(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  return String(v);
}

/**
 * v3.3: Cuenta las capturas pendientes (BORRADOR/ENVIADA/RECHAZADA) de un
 * usuario en una quincena dada. Acepta un filtro opcional de proyecto
 * (usado para distinguir admin de obras normales).
 *
 * @param {string} quincenaId
 * @param {string} supervisor  Nombre del usuario en el campo supervisor
 * @param {Object} opts        { proyecto: 'INDIRECTOS_OFICINA' | null, excluirProyectoAdmin: bool }
 */
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

/**
 * v3.3: nueva lógica de `handleQuincenaActual`.
 * Si el supervisor tiene capturas pendientes en quincenas anteriores
 * (dentro de las últimas MAX_QUINCENAS_ATRAS), devuelve la quincena anterior
 * más reciente con pendientes. Si no, devuelve la calendárica.
 *
 * Para distinguir Mariana (admin) de supervisores de obra, miramos qué app
 * tiene el usuario:
 *   - nomina-supervisor → contamos pendientes excluyendo PROYECTO_ADMIN
 *   - nomina-finanzas (Mariana sin nomina-supervisor) → contamos pendientes
 *     solo de PROYECTO_ADMIN
 *   - ambas (caso raro pero posible) → contamos cualquier pendiente
 */
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

  // Buscar la quincena anterior más reciente (dentro del límite) con pendientes
  let qElegida = qActual;
  for (let i = 1; i <= MAX_QUINCENAS_ATRAS; i++) {
    const qPrev = quincenaAnterior(qActual.id, i);
    const pend = contarPendientes(capturasRows, qPrev.id, supervisor, optsConteo);
    if (pend > 0) {
      asegurarQuincena(qPrev.id, supervisor);
      qElegida = qPrev;
      break; // tomamos la más reciente con pendientes
    }
  }

  // Construir respuesta. Re-leer del sheet para obtener el estado real
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
    actual_id:  qActual.id   // siempre incluimos la calendárica de hoy para que el front decida
  });
}

/**
 * v3.3: Devuelve la lista de quincenas capturables para el usuario.
 * Incluye:
 *   - La quincena calendárica de hoy (siempre)
 *   - Hasta MAX_QUINCENAS_ATRAS hacia atrás donde el usuario tenga pendientes
 * Ordenadas de más vieja a más nueva.
 * Cada entrada trae { id, fecha_inicio, fecha_fin, fecha_pago, pendientes, es_default, es_actual }
 */
function handleQuincenasCapturables(data) {
  const ahora = new Date();
  const qActual = quincenaParaFecha(ahora);
  const supervisor = userName(data);
  const esSup = userTieneApp(data, 'nomina-supervisor');
  const esFin = userTieneApp(data, 'nomina-finanzas');

  let optsConteo = { excluirProyectoAdmin: !esFin && esSup };
  if (esFin && !esSup) optsConteo = { proyecto: PROYECTO_ADMIN };

  const capturasRows = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());

  // Recopilar quincenas anteriores con pendientes
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

  // Quincena calendárica actual
  const pendActuales = contarPendientes(capturasRows, qActual.id, supervisor, optsConteo);
  const itemActual = {
    id: qActual.id,
    fecha_inicio: qActual.fecha_inicio,
    fecha_fin:    qActual.fecha_fin,
    fecha_pago:   qActual.fecha_pago,
    pendientes:   pendActuales,
    es_actual:    true
  };

  // Default: la más reciente con pendientes; si no hay, la actual
  let defaultId = qActual.id;
  if (anteriores.length > 0) {
    // anteriores van de más reciente (i=1) a más vieja (i=MAX); la primera es la más reciente
    defaultId = anteriores[0].id;
  }

  // Ordenar todas de más vieja a más nueva
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
    // v3.3: las capturas admin no aparecen en "mis capturas" del supervisor
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
    return jsonResp({ ok: false, error: 'columna aprobada_por no existe — corre migrarAprobada() en el Apps Script' });
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

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      const estado = rows[i][colEstado];
      if (estado !== 'APROBADA') {
        return jsonResp({ ok: false, error: 'solo capturas APROBADAS pueden reabrirse, está en ' + estado });
      }
      sh.getRange(i+1, colEstado+1).setValue('BORRADOR');
      if (colAprobador >= 0) sh.getRange(i+1, colAprobador+1).setValue('');
      if (colFecha >= 0)     sh.getRange(i+1, colFecha+1).setValue('');

      logAprobacion(capturaId, 'REABRIR', aprobador, motivo);
      return jsonResp({ ok: true });
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

/**
 * v3.3: Si no se pasa quincena_id, aplicamos la misma lógica de quincenaActual:
 * si hay captura admin BORRADOR/ENVIADA/RECHAZADA en quincenas anteriores
 * (dentro del límite), devolvemos esa; si no, la calendárica.
 */
function handleObtenerCapturaAdmin(data) {
  const usuario = userName(data);
  let quincenaId = data.quincena_id;

  if (!quincenaId) {
    const qActual = quincenaParaFecha(new Date());
    const capturasRows = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());

    // Para admin: misma lógica pero filtrando por PROYECTO_ADMIN
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

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(capturaId)) {
      if (rows[i][colProyecto] !== PROYECTO_ADMIN) {
        return jsonResp({ ok: false, error: 'esta no es una captura administrativa' });
      }
      const estado = rows[i][colEstado];
      if (estado !== 'CERRADA') {
        return jsonResp({ ok: false, error: 'solo CERRADA puede reabrirse, está en ' + estado });
      }
      sh.getRange(i+1, colEstado+1).setValue('BORRADOR');
      if (colAprobador >= 0) sh.getRange(i+1, colAprobador+1).setValue('');
      if (colFecha >= 0)     sh.getRange(i+1, colFecha+1).setValue('');

      logAprobacion(capturaId, 'REABRIR_ADMIN', usuario, motivo);
      return jsonResp({ ok: true });
    }
  }
  return jsonResp({ ok: false, error: 'captura no encontrada' });
}

// ─── INICIALIZACIÓN ──────────────────────────────────────────────────────────

/**
 * Asegura que existan las hojas NOMINA_RESULTADOS y NOMINA_AGREGADOS con
 * sus headers correctos. Idempotente y barato: si ambas existen ya con
 * headers OK, no escribe nada y retorna.
 *
 * Pensado para llamarse al inicio de endpoints que toquen estas hojas
 * (Bloques 4-5 de Fase 3b). También se llama desde inicializarBD().
 *
 * Si una hoja existe pero los headers no coinciden, escribe warning con
 * Logger.log (esperados vs encontrados). No auto-corrige ni lanza.
 */
function asegurarHojasNomina() {
  const ss = SpreadsheetApp.getActive();

  const defs = [
    { nombre: HOJAS.NOMINA_RESULTADOS, headers: HEADERS.NOMINA_RESULTADOS },
    { nombre: HOJAS.NOMINA_AGREGADOS,  headers: HEADERS.NOMINA_AGREGADOS  }
  ];

  // Fast path: si ambas existen con headers OK, no hacer nada.
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

function autorizarPermisos() {
  SpreadsheetApp.getActive().getName();
  UrlFetchApp.fetch('https://www.google.com');
  try { SpreadsheetApp.openById(ID_TRANSACTION_DB).getName(); } catch(e) { Logger.log(e); }
  try { SpreadsheetApp.openById(ID_USUARIOS_DB).getName(); }    catch(e) { Logger.log(e); }
  Logger.log('Permisos OK');
}

function migrarAprobada() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(HOJAS.CAPTURAS);
  if (!sh) {
    Logger.log('CAPTURAS no existe; corre inicializarBD() primero.');
    return;
  }

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Logger.log('Headers actuales de CAPTURAS: ' + JSON.stringify(headers));

  const yaTiene = headers.indexOf('aprobada_por') >= 0;
  if (yaTiene) {
    Logger.log('La columna aprobada_por ya existe. Nada que migrar.');
  } else {
    const colEnvio = headers.indexOf('fecha_envio');
    if (colEnvio < 0) {
      Logger.log('ERROR: no encuentro la columna fecha_envio. Headers: ' + JSON.stringify(headers));
      return;
    }
    sh.insertColumnAfter(colEnvio + 1);
    sh.getRange(1, colEnvio + 2).setValue('aprobada_por').setFontWeight('bold').setBackground('#1A1A18').setFontColor('#FFFFFF');
    Logger.log('✓ Columna aprobada_por insertada en CAPTURAS (columna ' + (colEnvio + 2) + ').');
  }

  let shLog = ss.getSheetByName(HOJAS.APROBACIONES_LOG);
  if (!shLog) {
    shLog = ss.insertSheet(HOJAS.APROBACIONES_LOG);
    shLog.getRange(1, 1, 1, HEADERS.APROBACIONES_LOG.length).setValues([HEADERS.APROBACIONES_LOG]);
    shLog.getRange(1, 1, 1, HEADERS.APROBACIONES_LOG.length).setFontWeight('bold').setBackground('#1A1A18').setFontColor('#FFFFFF');
    shLog.setFrozenRows(1);
    [50, 80, 100, 200, 160, 400].forEach(function (w, i) { shLog.setColumnWidth(i + 1, w); });
    Logger.log('✓ Hoja APROBACIONES_LOG creada.');
  } else {
    Logger.log('Hoja APROBACIONES_LOG ya existe.');
  }

  Logger.log('✓ Migración v3.0 completa.');
}

function fixFechasQuincenas() {
  const ss = SpreadsheetApp.getActive();

  const shQ = ss.getSheetByName(HOJAS.QUINCENAS);
  if (shQ && shQ.getLastRow() > 1) {
    const rows = shQ.getRange(2, 1, shQ.getLastRow() - 1, 4).getValues();
    const fixed = rows.map(function (r) {
      return [normFecha(r[0]), normFecha(r[1]), normFecha(r[2]), normFecha(r[3])];
    });
    shQ.getRange(2, 1, fixed.length, 4).setNumberFormat('@').setValues(fixed);
    Logger.log('QUINCENAS: ' + fixed.length + ' filas normalizadas');
  }

  const shC = ss.getSheetByName(HOJAS.CAPTURAS);
  if (shC && shC.getLastRow() > 1) {
    const rows = shC.getRange(2, 2, shC.getLastRow() - 1, 1).getValues();
    const fixed = rows.map(function (r) { return [normFecha(r[0])]; });
    shC.getRange(2, 2, fixed.length, 1).setNumberFormat('@').setValues(fixed);
    Logger.log('CAPTURAS: ' + fixed.length + ' filas normalizadas');
  }

  Logger.log('Fix completo.');
}

function borrarDatosCaptura(capturaId) {
  if (!capturaId) {
    Logger.log('Falta capturaId. Ej: borrarDatosCaptura(8)');
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

  Logger.log('✓ Captura ' + capturaId + ' limpiada. Mariana puede recapturar desde cero.');
}

function dedupTodos() {
  const ss = SpreadsheetApp.getActive();

  const shDias = ss.getSheetByName(HOJAS.CAPTURA_DIAS);
  if (shDias) {
    const rows = shDias.getDataRange().getValues();
    const seen = {};
    const toDelete = [];
    for (let i = 1; i < rows.length; i++) {
      const key = rows[i][1] + '|' + rows[i][2] + '|' + rows[i][3];
      if (seen[key]) {
        toDelete.push(i + 1);
      } else {
        seen[key] = true;
      }
    }
    toDelete.reverse().forEach(function (r) { shDias.deleteRow(r); });
    Logger.log('CAPTURA_DIAS: ' + toDelete.length + ' duplicados eliminados');
  }

  [HOJAS.CAPTURA_DIAS, HOJAS.CAPTURA_EXTRAS, HOJAS.CAPTURA_VIATICOS].forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre);
    if (!sh) return;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const ids = [];
    for (let i = 0; i < lastRow - 1; i++) ids.push([i + 1]);
    sh.getRange(2, 1, ids.length, 1).setValues(ids);
    Logger.log(nombre + ': ' + ids.length + ' IDs reasignados secuencialmente');
  });

  Logger.log('✓ dedupTodos() completo.');
}

function dedupQuincenas() {
  const sh = getSheet(HOJAS.QUINCENAS);
  if (!sh || sh.getLastRow() < 2) { Logger.log('Nada que limpiar'); return; }

  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const seen = {};
  const toDelete = [];

  for (let i = 1; i < rows.length; i++) {
    const id = normFecha(rows[i][0]);
    if (!id) continue;
    if (seen[id]) {
      toDelete.push(i + 1);
    } else {
      seen[id] = true;
    }
  }

  toDelete.reverse().forEach(function (rowIndex) {
    sh.deleteRow(rowIndex);
  });

  Logger.log('Eliminadas ' + toDelete.length + ' filas duplicadas. Quedan ' + Object.keys(seen).length + ' quincenas únicas.');

  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).setNumberFormat('@');
  }
}

function limpiarAdmin() {
  borrarDatosCaptura(8);
}
// ═══════════════════════════════════════════════════════════════════════════
// ═══ FASE 3b PREVIEW — Cálculo de nómina (solo lectura, no escribe)       ═══
// ═══════════════════════════════════════════════════════════════════════════
//
// Endpoint: calcularNominaPreview
// Lee capturas APROBADA y CERRADA de una quincena, aplica el modelo y devuelve
// el desglose completo. NO escribe en sheets, es solo preview.
//
// Modelo:
//   - bruto = (T + D) × tarifa + extras + viáticos
//   - Tope IMSS $4,410.56 quincenal por empleado IMSS
//   - CAMI paga el tope vía NOMINA_DIRECTO (proporcional a días por proyecto)
//   - Contadores dispersan el excedente (no se registra en TRANSACCIONES)
//   - NO_IMSS: CAMI paga TODO vía NOMINA_DIRECTO
//   - NOMINA a contadores: bruto_proyecto × 1.06 (comisión 6% adentro)
//   - REINTEGRO: 1 fila por quincena, proyecto=TRANSITO, suma topes IMSS
//
// Para agregar al backend: pegar este código al FINAL de Code.gs y agregar
// el case 'calcularNominaPreview' en el switch del doPost (instrucciones abajo).

function calcularNomina(quincenaId) {
  if (!quincenaId) return { ok: false, error: 'falta quincena_id' };

  const TOPE_IMSS = 4410.56;
  const COMISION = 0.06;
  const PROYECTO_REINTEGRO = 'TRANSITO';

  // ── 1. Leer capturas APROBADA y CERRADA de esta quincena ──
  const capturasAll = rowsToObjects(getSheet(HOJAS.CAPTURAS).getDataRange().getValues());
  const capturasIncluidas = capturasAll.filter(function (c) {
    return normFecha(c.quincena_id) === quincenaId &&
           (c.estado === 'APROBADA' || c.estado === 'CERRADA');
  });

  // Capturas omitidas (warnings)
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
      totales: {}
    };
  }

  const idsIncluidas = {};
  capturasIncluidas.forEach(function (c) { idsIncluidas[c.id] = c; });

  // ── 2. Leer días, extras, viáticos solo de las capturas incluidas ──
  const dias = rowsToObjects(getSheet(HOJAS.CAPTURA_DIAS).getDataRange().getValues())
    .filter(function (d) { return idsIncluidas[d.captura_id]; });
  const extras = rowsToObjects(getSheet(HOJAS.CAPTURA_EXTRAS).getDataRange().getValues())
    .filter(function (e) { return idsIncluidas[e.captura_id]; });
  const viaticos = rowsToObjects(getSheet(HOJAS.CAPTURA_VIATICOS).getDataRange().getValues())
    .filter(function (v) { return idsIncluidas[v.captura_id]; });

  // ── 3. Catálogo de empleados (tarifa y tipo) ──
  const empAll = rowsToObjects(getSheet(HOJAS.EMPLEADOS).getDataRange().getValues());
  const empById = {};
  empAll.forEach(function (e) { empById[e.id] = e; });

  // ── 4. Agrupar días pagables por (empleado, proyecto) ──
  // dias_pagables = T + D
  const agregado = {}; // key: empleado_id|proyecto → { dias, salario, extras, viaticos }

  function keyEP(empId, proy) { return empId + '|' + proy; }

  dias.forEach(function (d) {
    const marca = String(d.marca || '').toUpperCase();
    if (marca !== 'T' && marca !== 'D') return;
    const offset = parseInt(d.dia_offset, 10);
    if (isNaN(offset) || offset < 0 || offset > 13) return;
    const cap = idsIncluidas[d.captura_id];
    if (!cap) return;
    const emp = empById[d.empleado_id];
    if (!emp) return;
    const tarifa = parseFloat(emp.tarifa_diaria || 0);
    const k = keyEP(d.empleado_id, cap.proyecto);
    if (!agregado[k]) {
      agregado[k] = { empleado_id: d.empleado_id, proyecto: cap.proyecto, dias_t: 0, dias_d: 0, dias_pagables: 0, monto_salario: 0, monto_extras: 0, monto_viaticos: 0 };
    }
    if (marca === 'T') agregado[k].dias_t++;
    else agregado[k].dias_d++;
    agregado[k].dias_pagables++;
    agregado[k].monto_salario += tarifa;
  });

  extras.forEach(function (e) {
    const cap = idsIncluidas[e.captura_id];
    if (!cap) return;
    const monto = parseFloat(e.monto || 0);
    if (!monto) return;
    const k = keyEP(e.empleado_id, cap.proyecto);
    if (!agregado[k]) {
      agregado[k] = { empleado_id: e.empleado_id, proyecto: cap.proyecto, dias_t: 0, dias_d: 0, dias_pagables: 0, monto_salario: 0, monto_extras: 0, monto_viaticos: 0 };
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
      agregado[k] = { empleado_id: v.empleado_id, proyecto: cap.proyecto, dias_t: 0, dias_d: 0, dias_pagables: 0, monto_salario: 0, monto_extras: 0, monto_viaticos: 0 };
    }
    agregado[k].monto_viaticos += monto;
  });

  // ── 5. Calcular bruto por (empleado, proyecto) y totales por empleado ──
  const totalesEmpleado = {}; // empleado_id → { dias_pagables, bruto_total }
  Object.keys(agregado).forEach(function (k) {
    const a = agregado[k];
    a.bruto_proyecto = a.monto_salario + a.monto_extras + a.monto_viaticos;
    if (!totalesEmpleado[a.empleado_id]) {
      totalesEmpleado[a.empleado_id] = { dias_pagables: 0, bruto_total: 0 };
    }
    totalesEmpleado[a.empleado_id].dias_pagables += a.dias_pagables;
    totalesEmpleado[a.empleado_id].bruto_total += a.bruto_proyecto;
  });

  // ── 6. Aplicar tope IMSS y calcular NOMINA_DIRECTO por (empleado, proyecto) ──
  // CAMI paga el tope. Contadores pagan el excedente (no se registra).
  // NO_IMSS: CAMI paga TODO el bruto.
  const filasNominaDirecto = []; // {empleado_id, empleado_nombre, empleado_tipo, proyecto, monto}
  Object.keys(agregado).forEach(function (k) {
    const a = agregado[k];
    const emp = empById[a.empleado_id];
    if (!emp) return;
    const tipo = emp.tipo;
    const totales = totalesEmpleado[a.empleado_id];
    let ndEmpleado;
    if (tipo === 'IMSS') {
      ndEmpleado = Math.min(totales.bruto_total, TOPE_IMSS);
    } else {
      ndEmpleado = totales.bruto_total;
    }
    // Distribución proporcional a días pagables
    const proporcion = totales.dias_pagables > 0 ? a.dias_pagables / totales.dias_pagables : 0;
    const ndProyecto = ndEmpleado * proporcion;
    a.tope_imss_aplicado = (tipo === 'IMSS') ? ndEmpleado * proporcion : 0;
    a.nomina_directo = ndProyecto;
    a.comision_6pct = a.bruto_proyecto * COMISION;
    a.total_a_contadores = a.bruto_proyecto * (1 + COMISION);

    filasNominaDirecto.push({
      empleado_id: a.empleado_id,
      empleado_nombre: emp.nombre,
      empleado_tipo: tipo,
      proyecto: a.proyecto,
      monto: round2(ndProyecto)
    });
  });

  // ── 7. Construir resultados detallados ──
  const resultados = Object.keys(agregado).map(function (k) {
    const a = agregado[k];
    const emp = empById[a.empleado_id];
    return {
      empleado_id: a.empleado_id,
      empleado_nombre: emp ? emp.nombre : '(empleado #' + a.empleado_id + ')',
      empleado_tipo: emp ? emp.tipo : '',
      proyecto: a.proyecto,
      dias_t: a.dias_t,
      dias_d: a.dias_d,
      dias_pagables: a.dias_pagables,
      tarifa_diaria: emp ? parseFloat(emp.tarifa_diaria || 0) : 0,
      monto_salario: round2(a.monto_salario),
      monto_extras: round2(a.monto_extras),
      monto_viaticos: round2(a.monto_viaticos),
      bruto_proyecto: round2(a.bruto_proyecto),
      tope_imss_aplicado: round2(a.tope_imss_aplicado),
      nomina_directo: round2(a.nomina_directo),
      comision_6pct: round2(a.comision_6pct),
      total_a_contadores: round2(a.total_a_contadores)
    };
  });

  // ── 8. Agregados por proyecto ──
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

  // ── 9. Totales globales ──
  let brutoTotal = 0, ndTotal = 0, topeImssTotal = 0;
  resultados.forEach(function (r) {
    brutoTotal += r.bruto_proyecto;
    ndTotal += r.nomina_directo;
    topeImssTotal += r.tope_imss_aplicado;
  });

  const totales = {
    bruto_total: round2(brutoTotal),
    comision_6pct: round2(brutoTotal * COMISION),
    total_a_contadores: round2(brutoTotal * (1 + COMISION)),
    nomina_directo_total: round2(ndTotal),
    reintegro_total: round2(topeImssTotal),
    reintegro_proyecto: PROYECTO_REINTEGRO,
    num_empleados: Object.keys(totalesEmpleado).length,
    num_proyectos: Object.keys(porProyecto).length
  };

  // ── 10. Warnings ──
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

// Wrapper HTTP — Fase 3b. La lógica vive en calcularNomina() para que
// guardarCalculoNomina la reutilice sin duplicar.
function handleCalcularNominaPreview(data) {
  return jsonResp(calcularNomina(data.quincena_id));
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}