// src/pages/InformeVacaciones.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../lib/AuthContext";

const ANO_ACTUAL = new Date().getFullYear();
const ANOS = [ANO_ACTUAL - 1, ANO_ACTUAL, ANO_ACTUAL + 1];

function diasLaborables(fechaInicio, fechaFin) {
  if (!fechaInicio || !fechaFin) return 0;
  const d1 = new Date(fechaInicio), d2 = new Date(fechaFin);
  if (d2 < d1) return 0;
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const dia = cur.getDay();
    if (dia !== 0 && dia !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function colorEstado(estado) {
  if (estado === "aprobada") return "#0F6E56";
  if (estado === "rechazada") return "#C0392B";
  return "#BA7517";
}

export default function InformeVacaciones() {
  const { perfil } = useAuth();
  const esRRHH = perfil?.rol === "rrhh";
  const miEmpresaId = perfil?.empresaId;

  const [empresas,   setEmpresas]   = useState([]);
  const [empleados,  setEmpleados]  = useState([]);
  const [empresa,    setEmpresa]    = useState("");
  const [empleado,   setEmpleado]   = useState("");
  const [ano,        setAno]        = useState(String(ANO_ACTUAL));
  const [datos,      setDatos]      = useState(null);
  const [cargando,   setCargando]   = useState(false);

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
    setEmpresas(esRRHH ? todasEmpresas.filter(e => e.id === miEmpresaId) : todasEmpresas);
    setEmpleados(uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.rol === "empleado" || u.rol === "rrhh"));
    if (esRRHH) setEmpresa(miEmpresaId);
  };

  const empsFiltrados = empresa ? empleados.filter(e => e.empresaId === empresa) : empleados;

  const generar = async () => {
    if (!empleado || !ano) return;
    setCargando(true);
    setDatos(null);
    const emp  = empleados.find(e => e.id === empleado);
    const emp2 = empresas.find(e => e.id === emp?.empresaId);

    // Cargar todas las vacaciones del empleado
    const vSnap = await getDocs(query(collection(db, "vacaciones"), where("empleadoId", "==", empleado)));
    const todas = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filtrar por año seleccionado (fechaInicio empieza por el año)
    const vacAno = todas
      .filter(v => v.fechaInicio?.startsWith(ano))
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));

    setDatos({ emp, empresa: emp2, ano, vacaciones: vacAno });
    setCargando(false);
  };

  const imprimir = () => window.print();

  const hayInforme = !!datos;
  const totalDias = datos?.vacaciones?.reduce((acc, v) => acc + (v.dias || 0), 0) || 0;
  const totalLab  = datos?.vacaciones?.reduce((acc, v) => acc + diasLaborables(v.fechaInicio, v.fechaFin), 0) || 0;
  const aprobadas = datos?.vacaciones?.filter(v => v.estado === "aprobada").reduce((acc, v) => acc + (v.dias || 0), 0) || 0;
  const pendientes = datos?.vacaciones?.filter(v => v.estado === "pendiente").reduce((acc, v) => acc + (v.dias || 0), 0) || 0;

  return (
    <div>
      <style>{`
        @media print {
          .no-print,
          .sidebar,
          .mobile-nav,
          .desktop-topbar,
          nav,
          header { display:none!important; }
          .main-wrapper { margin-left:0!important; width:100%!important; }
          .main-content { padding:0!important; }
          .app-shell { display:block!important; }
          body { background:#fff!important; margin:0; padding:0; }
          .print-area { box-shadow:none!important; border:none!important; }
          * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        }
      `}</style>

      {/* ── Controles ── */}
      <div className="no-print">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Informe de vacaciones</h1>
          {hayInforme && (
            <button className="btn btn-primary" onClick={imprimir}>🖨 Imprimir / Guardar PDF</button>
          )}
        </div>

        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {!esRRHH && (
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Empresa</label>
                <select className="form-input form-select" value={empresa}
                  onChange={e => { setEmpresa(e.target.value); setEmpleado(""); }}>
                  <option value="">Todas las empresas</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            )}
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Empleado</label>
              <select className="form-input form-select" value={empleado}
                onChange={e => setEmpleado(e.target.value)}>
                <option value="">Selecciona empleado...</option>
                {empsFiltrados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Año</label>
              <select className="form-input form-select" value={ano}
                onChange={e => setAno(e.target.value)}>
                {ANOS.map(a => <option key={a} value={String(a)}>{a}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop:14 }}>
            <button className="btn btn-primary" onClick={generar}
              disabled={!empleado || !ano || cargando}>
              {cargando ? "Generando..." : "Generar informe"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Informe imprimible ── */}
      {hayInforme && (
        <div className="print-area" style={{
          background:"#fff", borderRadius:12, border:"1px solid #E5E7EB",
          padding:"32px 40px", fontFamily:"Arial,sans-serif", maxWidth:900, margin:"0 auto"
        }}>
          {/* Cabecera */}
          <div style={{ borderBottom:"3px solid #1B3A6B", paddingBottom:16, marginBottom:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <h2 style={{ fontSize:22, fontWeight:700, color:"#1B3A6B", margin:0 }}>
                  INFORME DE VACACIONES
                </h2>
                <p style={{ fontSize:13, color:"#6B7280", margin:"4px 0 0" }}>
                  Real Decreto-Ley 8/2019 · Artículo 34.9 ET
                </p>
              </div>
              <div style={{ fontSize:14, fontWeight:600, color:"#1B3A6B" }}>
                Año {datos.ano}
              </div>
            </div>
          </div>

          {/* Datos empresa y empleado */}
          <div style={{
            display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24,
            background:"#EBF2FB", borderRadius:8, padding:"16px 20px"
          }}>
            <div>
              <div style={{ fontSize:11, color:"#6B7280", fontWeight:600, marginBottom:4 }}>EMPRESA</div>
              <div style={{ fontWeight:600 }}>{datos.empresa?.nombre || "—"}</div>
              <div style={{ fontSize:13, color:"#6B7280" }}>CIF: {datos.empresa?.cif || "—"}</div>
              <div style={{ fontSize:13, color:"#6B7280" }}>{datos.empresa?.domicilio || ""}</div>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6B7280", fontWeight:600, marginBottom:4 }}>EMPLEADO</div>
              <div style={{ fontWeight:600 }}>{datos.emp?.nombre}</div>
              <div style={{ fontSize:13, color:"#6B7280" }}>{datos.emp?.categoria || "—"} · Jornada {datos.emp?.jornada}</div>
              <div style={{ fontSize:13, color:"#6B7280" }}>{datos.emp?.email}</div>
            </div>
          </div>

          {/* Resumen de días */}
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24
          }}>
            {[
              { label:"Total días naturales", value: totalDias, color:"#1B3A6B", bg:"#EBF2FB" },
              { label:"Días laborables",      value: totalLab,  color:"#1B3A6B", bg:"#EBF2FB" },
              { label:"Aprobados",            value: aprobadas, color:"#0F6E56", bg:"#E1F5EE" },
              { label:"Pendientes",           value: pendientes,color:"#BA7517", bg:"#FFF3CD" },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:700, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:"#6B7280", marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabla de vacaciones */}
          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:24, fontSize:13 }}>
            <thead>
              <tr style={{ background:"#1B3A6B" }}>
                {["Desde","Hasta","Días naturales","Días laborables","Motivo","Estado"].map(h => (
                  <th key={h} style={{ color:"#fff", padding:"8px 12px", textAlign:"left", fontWeight:600, fontSize:12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.vacaciones.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding:"16px 12px", textAlign:"center", color:"#9CA3AF", fontStyle:"italic" }}>
                    Sin vacaciones registradas para {datos.ano}
                  </td>
                </tr>
              ) : datos.vacaciones.map((v, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                  <td style={{ padding:"7px 12px", borderBottom:"1px solid #F3F4F6" }}>{v.fechaInicio}</td>
                  <td style={{ padding:"7px 12px", borderBottom:"1px solid #F3F4F6" }}>{v.fechaFin}</td>
                  <td style={{ padding:"7px 12px", borderBottom:"1px solid #F3F4F6", fontWeight:600 }}>{v.dias}</td>
                  <td style={{ padding:"7px 12px", borderBottom:"1px solid #F3F4F6", fontWeight:600 }}>
                    {diasLaborables(v.fechaInicio, v.fechaFin)}
                  </td>
                  <td style={{ padding:"7px 12px", borderBottom:"1px solid #F3F4F6", color:"#6B7280" }}>{v.motivo || "—"}</td>
                  <td style={{ padding:"7px 12px", borderBottom:"1px solid #F3F4F6", fontWeight:600, color:colorEstado(v.estado) }}>
                    {v.estado}
                  </td>
                </tr>
              ))}
            </tbody>
            {datos.vacaciones.length > 0 && (
              <tfoot>
                <tr style={{ background:"#1B3A6B" }}>
                  <td colSpan={2} style={{ padding:"10px 12px", color:"#fff", fontWeight:600, textAlign:"right" }}>TOTALES:</td>
                  <td style={{ padding:"10px 12px", color:"#fff", fontWeight:700 }}>{totalDias} días nat.</td>
                  <td style={{ padding:"10px 12px", color:"#fff", fontWeight:700 }}>{totalLab} días lab.</td>
                  <td colSpan={2} style={{ padding:"10px 12px", color:"rgba(255,255,255,.6)", fontSize:12 }}>
                    {datos.vacaciones.length} período{datos.vacaciones.length !== 1 ? "s" : ""}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* Firmas */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:40, marginTop:40 }}>
            {["El/La Trabajador/a", "Responsable RRHH", "Sello empresa"].map(f => (
              <div key={f} style={{ borderTop:"1px solid #CBD5E0", paddingTop:8, textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#9CA3AF", marginBottom:50 }}>{f}</div>
              </div>
            ))}
          </div>

          {/* Nota legal */}
          <div style={{
            marginTop:16, background:"#FFF3CD", borderRadius:8,
            padding:"10px 14px", fontSize:11, color:"#633806", lineHeight:1.6
          }}>
            <strong>Nota legal:</strong> Documento generado conforme al RDL 8/2019.
            Los registros se conservarán durante 4 años a disposición de los trabajadores,
            sus representantes y la Inspección de Trabajo (art. 34.9 ET).
          </div>
        </div>
      )}
    </div>
  );
}
