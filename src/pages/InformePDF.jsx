// src/pages/InformePDF.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

function normFecha(f) {
  if (!f) return "";
  if (f.includes("-")) { const [y,m,d] = f.split("-"); return `${d}/${m}/${y}`; }
  return f;
}
function horaAMins(h) {
  if (!h) return null;
  const p = h.split(":"); return parseInt(p[0])*60+parseInt(p[1]);
}
function minsATexto(m) {
  if (!m||m<=0) return "0h 00m";
  return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`;
}

// ─── Lógica reutilizable: procesar fichajes + incidencias de UN empleado ───────
// Convierte "dd/MM/yyyy" o "yyyy-MM-dd" a ISO "yyyy-MM-dd"
function toISO(f) {
  if (!f) return "";
  if (f.includes("-")) return f;
  const [d, m, y] = f.split("/"); return `${y}-${m}-${d}`;
}

async function procesarEmpleado(empId, desde, hasta) {
  // Ampliar ventana de búsqueda 30h antes para capturar entradas de turno nocturno
  const desdeAmpliado = new Date(desde.getTime() - 30 * 60 * 60 * 1000);

  const [fSnap, iSnap, vSnap, eSnap] = await Promise.all([
    getDocs(query(
      collection(db, "fichajes"),
      where("usuarioId", "==", empId),
      where("timestamp", ">=", Timestamp.fromDate(desdeAmpliado)),
      where("timestamp", "<=", Timestamp.fromDate(hasta)),
      orderBy("timestamp", "asc")
    )),
    getDocs(query(
      collection(db, "incidencias"),
      where("empleadoId", "==", empId),
      orderBy("creadaEn", "desc")
    )),
    getDocs(query(collection(db, "vacaciones"),   where("empleadoId", "==", empId))),
    getDocs(query(collection(db, "enfermedades"), where("empleadoId", "==", empId))),
  ]);

  const fichajes     = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const incs         = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const vacaciones   = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const enfermedades = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const ausenciaDeDia = (fechaISO) => {
    const vac = vacaciones.find(v => fechaISO >= v.fechaInicio && fechaISO <= v.fechaFin);
    if (vac) return { etiqueta: "🏖️ VACACIONES", estado: vac.estado, tipo: "vacaciones" };
    const enf = enfermedades.find(e => fechaISO >= e.fechaInicio && (e.fechaFin ? fechaISO <= e.fechaFin : true));
    if (enf) return { etiqueta: `🏥 ${enf.tipo?.toUpperCase() || "BAJA MÉDICA"}`, estado: enf.estado, tipo: "enfermedad" };
    return null;
  };

  // ── Emparejar por turno (soporta turnos nocturnos que cruzan medianoche) ──
  const turnos = [];
  let entradaActual = null;

  fichajes.forEach(r => {
    if (r.tipo === "entrada") {
      if (entradaActual) turnos.push({ entrada: entradaActual, salida: null });
      entradaActual = r;
    } else if (r.tipo === "salida") {
      if (entradaActual) {
        turnos.push({ entrada: entradaActual, salida: r });
        entradaActual = null;
      } else {
        turnos.push({ entrada: null, salida: r });
      }
    }
  });
  if (entradaActual) turnos.push({ entrada: entradaActual, salida: null });

  // Filtrar solo turnos que pertenecen al rango del mes (por fecha de entrada o salida)
  const diasOrdenados = turnos
    .filter(({ entrada, salida }) => {
      const ref = entrada || salida;
      const ts = ref?.timestamp?.toDate?.();
      return ts >= desdeAmpliado && ts <= hasta;
    })
    .map(({ entrada, salida }) => {
      const ref = entrada || salida;
      const fecha = normFecha(ref.fecha || "");
      const fechaISO = toISO(fecha);
      const entradaHora = entrada?.hora || "—";
      const salidaHora  = salida?.hora  || "—";
      const turnoNocturno = entrada && salida && entrada.fecha !== salida.fecha;

      // Calcular minutos usando timestamps reales (correcto para turnos nocturnos)
      let totalMins = 0;
      if (entrada && salida) {
        const tsE = entrada.timestamp?.toDate?.();
        const tsS = salida.timestamp?.toDate?.();
        if (tsE && tsS) totalMins = Math.round((tsS - tsE) / 60000);
      }

      // Aplicar incidencia de olvido de salida si no hay salida real
      const incsDia = incs.filter(i => normFecha(i.fecha) === fecha);
      if (!salida) {
        const incSalida = incsDia.find(i => i.tipo === "Olvido de fichaje de salida" && i.estado === "aprobada" && i.horaCorrecta);
        if (incSalida && entrada) {
          const minsS = horaAMins(incSalida.horaCorrecta);
          const minsE = horaAMins(entradaHora);
          if (minsS !== null && minsE !== null) {
            totalMins = minsS >= minsE ? minsS - minsE : (1440 - minsE) + minsS;
          }
        }
      }

      const ausencia = ausenciaDeDia(fechaISO);
      return { fecha, entrada: entradaHora, salida: salidaHora, totalMins, incidencias: incsDia, ausencia, turnoNocturno };
    })
    .sort((a, b) => toISO(a.fecha).localeCompare(toISO(b.fecha)));

  const totalMes = diasOrdenados.reduce((a, d) => a + d.totalMins, 0);
  return { diasOrdenados, totalMes, incs, vacaciones, enfermedades };
}

// ─── Bloque de informe de un empleado (reutilizable para individual y para "todos") ──
function InformeEmpleado({ datos, mesTexto, pageBreak = false }) {
  return (
    <div
      className="print-area"
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: "32px 40px",
        maxWidth: 800,
        margin: pageBreak ? "0 auto" : "0 auto",
        pageBreakAfter: pageBreak ? "always" : "auto",
      }}
    >
      {/* Cabecera */}
      <div style={{ borderBottom: "3px solid #1B3A6B", paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1B3A6B", margin: 0 }}>
              REGISTRO DE JORNADA LABORAL
            </h2>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
              Real Decreto-Ley 8/2019 · Artículo 34.9 ET
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1B3A6B", textTransform: "capitalize" }}>
              {mesTexto}
            </div>
          </div>
        </div>
      </div>

      {/* Datos empresa y empleado */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24,
        background: "#EBF2FB", borderRadius: 8, padding: "16px 20px"
      }}>
        <div>
          <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, marginBottom: 4 }}>EMPRESA</div>
          <div style={{ fontWeight: 600 }}>{datos.empresa?.nombre || "—"}</div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>CIF: {datos.empresa?.cif || "—"}</div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>{datos.empresa?.domicilio || ""}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, marginBottom: 4 }}>EMPLEADO</div>
          <div style={{ fontWeight: 600 }}>{datos.emp?.nombre}</div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>{datos.emp?.categoria || "—"} · Jornada {datos.emp?.jornada}</div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>{datos.emp?.email}</div>
        </div>
      </div>

      {/* Tabla de registros */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#1B3A6B" }}>
            {["Fecha", "Entrada", "Salida", "Total", "Incidencias"].map(h => (
              <th key={h} style={{ color: "#fff", padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.diasOrdenados.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: "16px 12px", textAlign: "center", color: "#9CA3AF", fontStyle: "italic" }}>
                Sin registros este mes
              </td>
            </tr>
          ) : datos.diasOrdenados.map((d, i) => (
            <tr key={i} style={{ background: d.ausencia
              ? (d.ausencia.tipo === "vacaciones" ? "#F0FDF4" : "#FFF7ED")
              : (i % 2 === 0 ? "#fff" : "#F9FAFB")
            }}>
              <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6" }}>{d.fecha}{d.turnoNocturno && <span style={{ marginLeft:6, fontSize:11, color:"#6B7280" }}>🌙</span>}</td>
              {d.ausencia ? (
                <td colSpan={3} style={{
                  padding: "7px 12px", borderBottom: "1px solid #F3F4F6",
                  fontWeight: 600, fontSize: 12, textAlign: "center",
                  color: d.ausencia.tipo === "vacaciones" ? "#0F6E56" : "#BA7517",
                }}>
                  {d.ausencia.etiqueta}{" "}
                  <span style={{ fontWeight: 400, fontSize: 11 }}>({d.ausencia.estado})</span>
                </td>
              ) : (
                <>
                  <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6", color: "#0F6E56", fontWeight: 500 }}>{d.entrada}</td>
                  <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6", color: "#C0392B", fontWeight: 500 }}>{d.salida}</td>
                  <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6", fontWeight: 600 }}>{minsATexto(d.totalMins)}</td>
                </>
              )}
              <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6", fontSize: 12, color: "#BA7517" }}>
                {d.incidencias.length > 0 ? d.incidencias.map(i => i.tipo).join(", ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "#1B3A6B" }}>
            <td colSpan={3} style={{ padding: "10px 12px", color: "#fff", fontWeight: 600, textAlign: "right" }}>
              TOTAL HORAS MES:
            </td>
            <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 700, fontSize: 15 }}>
              {minsATexto(datos.totalMes)}
            </td>
            <td style={{ padding: "10px 12px", color: "rgba(255,255,255,.6)", fontSize: 12 }}>
              {datos.diasOrdenados.filter(d => d.totalMins > 0).length} días trabajados
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Incidencias del mes */}
      {datos.incs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#1B3A6B" }}>
            INCIDENCIAS DEL MES
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FFF3CD" }}>
                {["Fecha", "Tipo", "Hora correcta", "Descripción", "Estado"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#633806", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.incs.map((inc, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FFFDF5" }}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{inc.fecha}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{inc.tipo}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{inc.horaCorrecta || "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{inc.descripcion || "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6", fontWeight: 500,
                    color: inc.estado === "aprobada" ? "#0F6E56" : inc.estado === "rechazada" ? "#C0392B" : "#BA7517" }}>
                    {inc.estado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vacaciones del mes */}
      {datos.vacaciones?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#0F6E56" }}>🏖️ VACACIONES</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F0FDF4" }}>
                {["Desde", "Hasta", "Días", "Motivo", "Estado"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#0F6E56", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.vacaciones.map((v, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F0FDF4" }}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{v.fechaInicio}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{v.fechaFin}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{v.dias}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{v.motivo || "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6", fontWeight: 500,
                    color: v.estado === "aprobada" ? "#0F6E56" : v.estado === "rechazada" ? "#C0392B" : "#BA7517" }}>
                    {v.estado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Enfermedades/bajas del mes */}
      {datos.enfermedades?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#BA7517" }}>🏥 AUSENCIAS POR ENFERMEDAD</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FFF7ED" }}>
                {["Tipo", "Desde", "Hasta", "Descripción", "Estado"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#BA7517", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.enfermedades.map((e, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FFF7ED" }}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{e.tipo}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{e.fechaInicio}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{e.fechaFin || "En curso"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6" }}>{e.descripcion || "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6", fontWeight: 500,
                    color: e.estado === "confirmada" || e.estado === "resuelta" ? "#0F6E56" : "#BA7517" }}>
                    {e.estado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Firmas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginTop: 32 }}>
        {["El/La Trabajador/a", "Responsable RRHH", "Sello empresa"].map(f => (
          <div key={f} style={{ borderTop: "1px solid #CBD5E0", paddingTop: 8, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 40 }}>{f}</div>
          </div>
        ))}
      </div>

      {/* Nota legal */}
      <div style={{
        marginTop: 16, background: "#FFF3CD", borderRadius: 8,
        padding: "10px 14px", fontSize: 11, color: "#633806", lineHeight: 1.6
      }}>
        <strong>Nota legal:</strong> Documento generado conforme al RDL 8/2019.
        Los registros se conservarán durante 4 años a disposición de los trabajadores,
        sus representantes y la Inspección de Trabajo (art. 34.9 ET).
      </div>
    </div>
  );
}

import { useAuth } from "../lib/AuthContext";

// ─── Componente principal ──────────────────────────────────────────────────────
export default function InformePDF() {
  const { perfil } = useAuth();
  const esRRHH = perfil?.rol === "rrhh";
  const miEmpresaId = perfil?.empresaId;

  const [empresas,      setEmpresas]      = useState([]);
  const [empleados,     setEmpleados]     = useState([]);
  const [empresa,       setEmpresa]       = useState("");
  const [empleado,      setEmpleado]      = useState("");
  const [mes,           setMes]           = useState(format(new Date(), "yyyy-MM"));
  const [datos,         setDatos]         = useState(null);
  const [datosMulti,    setDatosMulti]    = useState(null);
  const [cargando,      setCargando]      = useState(false);
  const [progreso,      setProgreso]      = useState({ actual: 0, total: 0 });

  useEffect(() => { cargarBase(); }, [perfil]);

  const cargarBase = async () => {
    if (!perfil) return;
    const [eSnap, uSnap] = await Promise.all([
      getDocs(collection(db, "empresas")),
      esRRHH
        ? getDocs(query(collection(db, "usuarios"), where("empresaId", "==", miEmpresaId)))
        : getDocs(collection(db, "usuarios")),
    ]);
    const todasEmpresas = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // RRHH solo ve su empresa
    setEmpresas(esRRHH ? todasEmpresas.filter(e => e.id === miEmpresaId) : todasEmpresas);
    setEmpleados(uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.rol === "empleado" || u.rol === "rrhh"));
    // Preseleccionar empresa si es RRHH
    if (esRRHH) setEmpresa(miEmpresaId);
  };

  // Empleados visibles en el desplegable según empresa seleccionada
  const empsFiltrados = empresa
    ? empleados.filter(e => e.empresaId === empresa)
    : empleados;

  // ── Generar informe individual ──────────────────────────────────────────────
  const generarIndividual = async () => {
    if (!empleado || !mes) return;
    setCargando(true);
    setDatos(null);
    setDatosMulti(null);

    const emp  = empleados.find(e => e.id === empleado);
    const emp2 = empresas.find(e => e.id === emp?.empresaId);
    const [y, m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y, m - 1));
    const hasta = endOfMonth(new Date(y, m - 1));

    const { diasOrdenados, totalMes, incs, vacaciones, enfermedades } = await procesarEmpleado(empleado, desde, hasta);

    setDatos({ emp, empresa: emp2, mes, diasOrdenados, totalMes, incs, vacaciones, enfermedades });
    setCargando(false);
  };

  // ── Generar informe de TODOS los empleados de la empresa ───────────────────
  const generarTodos = async () => {
    if (!empresa || !mes) return;
    setCargando(true);
    setDatos(null);
    setDatosMulti(null);

    const emp2 = empresas.find(e => e.id === empresa);
    const lista = empleados.filter(e => e.empresaId === empresa);
    const [y, m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y, m - 1));
    const hasta = endOfMonth(new Date(y, m - 1));

    setProgreso({ actual: 0, total: lista.length });

    const resultados = [];
    for (let i = 0; i < lista.length; i++) {
      const emp = lista[i];
      setProgreso({ actual: i + 1, total: lista.length });
      const { diasOrdenados, totalMes, incs, vacaciones, enfermedades } = await procesarEmpleado(emp.id, desde, hasta);
      resultados.push({ emp, empresa: emp2, mes, diasOrdenados, totalMes, incs, vacaciones, enfermedades });
    }

    setDatosMulti(resultados);
    setCargando(false);
  };

  // ── Decidir qué botón / acción ejecutar ────────────────────────────────────
  const modoTodos    = empleado === "TODOS";
  const puedeGenerar = mes && (modoTodos ? !!empresa : !!empleado);

  const generarDatos = () => {
    if (modoTodos) generarTodos();
    else           generarIndividual();
  };

  const imprimir = () => window.print();

  const mesTexto = (datos || datosMulti?.[0])
    ? format(new Date((datos?.mes || datosMulti[0].mes) + "-01"), "MMMM yyyy", { locale: es })
    : "";

  const hayInforme = !!datos || !!datosMulti;

  return (
    <div>
      <style>{`
        @media print {
          /* Ocultar toda la UI de la app */
          .no-print,
          .sidebar,
          .mobile-nav,
          .desktop-topbar,
          nav,
          header { display:none!important; }

          /* Quitar márgenes del layout */
          .main-wrapper { margin-left:0!important; width:100%!important; }
          .main-content { padding:0!important; }
          .app-shell { display:block!important; }

          /* Fondo blanco, sin sombras */
          body { background:#fff!important; margin:0; padding:0; }
          .print-area {
            box-shadow:none!important;
            border:none!important;
            margin-bottom:0!important;
            page-break-after: always;
          }
          .print-area:last-child { page-break-after: auto; }

          /* Forzar colores en impresión */
          * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        }
        .print-area { margin-bottom: 32px; }
      `}</style>

      {/* ── Controles — no se imprimen ── */}
      <div className="no-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Informe mensual PDF</h1>
          {hayInforme && (
            <button className="btn btn-primary" onClick={imprimir}>🖨 Imprimir / Guardar PDF</button>
          )}
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

            {/* Empresa — oculta para RRHH (ya preseleccionada) */}
            {!esRRHH && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Empresa</label>
              <select
                className="form-input form-select"
                value={empresa}
                onChange={e => { setEmpresa(e.target.value); setEmpleado(""); }}
              >
                <option value="">Todas las empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            )}

            {/* Empleado — incluye opción "Todos los empleados" cuando hay empresa seleccionada */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Empleado</label>
              <select
                className="form-input form-select"
                value={empleado}
                onChange={e => setEmpleado(e.target.value)}
              >
                <option value="">Selecciona empleado...</option>
                {empresa && (
                  <option value="TODOS" style={{ fontWeight: 600, color: "#1B3A6B" }}>
                    📋 Todos los empleados de la empresa
                  </option>
                )}
                {empsFiltrados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>

            {/* Mes */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Mes</label>
              <input
                className="form-input"
                type="month"
                value={mes}
                onChange={e => setMes(e.target.value)}
              />
            </div>
          </div>

          {/* Info contextual cuando se elige "Todos" */}
          {modoTodos && empresa && (
            <div style={{
              marginTop: 12, padding: "10px 14px", background: "#EBF2FB",
              borderRadius: 8, fontSize: 13, color: "#1B3A6B"
            }}>
              ℹ️ Se generará un informe por cada empleado de la empresa seleccionada
              ({empsFiltrados.length} empleado{empsFiltrados.length !== 1 ? "s" : ""}).
              Al imprimir obtendrás un PDF con una página por empleado.
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 16 }}>
            <button
              className="btn btn-primary"
              onClick={generarDatos}
              disabled={!puedeGenerar || cargando}
            >
              {cargando
                ? modoTodos
                  ? `Generando ${progreso.actual}/${progreso.total}...`
                  : "Generando..."
                : modoTodos
                  ? "Generar informe de todos"
                  : "Generar informe"
              }
            </button>

            {/* Barra de progreso para modo "todos" */}
            {cargando && modoTodos && progreso.total > 0 && (
              <div style={{ flex: 1, height: 8, background: "#E5E7EB", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${(progreso.actual / progreso.total) * 100}%`,
                  background: "#1B3A6B",
                  transition: "width .3s ease",
                  borderRadius: 4,
                }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── INFORME INDIVIDUAL ── */}
      {datos && (
        <InformeEmpleado datos={datos} mesTexto={mesTexto} pageBreak={false} />
      )}

      {/* ── INFORME TODOS LOS EMPLEADOS ── */}
      {datosMulti && (
        <div>
          {/* Portada resumen — solo visible en pantalla */}
          <div className="no-print" style={{
            background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
            padding: "24px 32px", maxWidth: 800, margin: "0 auto 24px",
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B", marginBottom: 12 }}>
              Resumen — {datosMulti[0]?.empresa?.nombre} · {mesTexto}
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#EBF2FB" }}>
                  {["Empleado", "Días trabajados", "Total horas mes"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#1B3A6B", fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datosMulti.map((d, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6", fontWeight: 500 }}>{d.emp.nombre}</td>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6" }}>
                      {d.diasOrdenados.filter(x => x.totalMins > 0).length}
                    </td>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid #F3F4F6", fontWeight: 600 }}>
                      {minsATexto(d.totalMes)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#1B3A6B" }}>
                  <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 600 }}>
                    TOTAL EMPRESA
                  </td>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,.7)", fontSize: 12 }}>
                    {datosMulti.reduce((a, d) => a + d.diasOrdenados.filter(x => x.totalMins > 0).length, 0)} días
                  </td>
                  <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 700, fontSize: 15 }}>
                    {minsATexto(datosMulti.reduce((a, d) => a + d.totalMes, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Un informe por empleado, cada uno en su propia página al imprimir */}
          {datosMulti.map((d, i) => (
            <InformeEmpleado
              key={d.emp.id}
              datos={d}
              mesTexto={mesTexto}
              pageBreak={i < datosMulti.length - 1}  // salto de página entre empleados
            />
          ))}
        </div>
      )}
    </div>
  );
}
