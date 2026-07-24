// src/pages/Fichajes.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useLang } from "../lib/LanguageContext";
import * as XLSX from "xlsx";

function normFecha(f) {
  if (!f) return "";
  if (f.includes("-")) { const [y,m,d] = f.split("-"); return `${d}/${m}/${y}`; }
  return f;
}
function horaAMins(h) {
  if (!h) return null;
  const partes = h.split(":");
  return parseInt(partes[0]) * 60 + parseInt(partes[1]);
}
function calcularTotalMins(eventos) {
  let total = 0;
  const evs = [...eventos].sort((a,b) => a.mins - b.mins);
  for (let i = 0; i < evs.length - 1; i++) {
    if (evs[i].tipo === "entrada" && evs[i+1].tipo === "salida") {
      total += evs[i+1].mins - evs[i].mins; i++;
    }
  }
  return total;
}
function minsATexto(mins) {
  if (mins <= 0) return null;
  return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`;
}

export default function Fichajes() {
  const { t } = useLang();
  const [fichajes,     setFichajes]     = useState([]);
  const [incidencias,  setIncidencias]  = useState([]);
  const [vacaciones,   setVacaciones]   = useState([]);
  const [enfermedades, setEnfermedades] = useState([]);
  const [empresas,     setEmpresas]     = useState([]);
  const [filtroEmp,   setFiltroEmp]   = useState("");
  const [mes,         setMes]         = useState(format(new Date(),"yyyy-MM"));
  const [cargando,    setCargando]    = useState(false);

  useEffect(() => { cargarEmpresas(); }, []);
  useEffect(() => { cargarDatos(); }, [filtroEmp, mes]);

  const cargarEmpresas = async () => {
    const snap = await getDocs(collection(db,"empresas"));
    setEmpresas(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  };

  const cargarDatos = async () => {
    setCargando(true);
    const [y,m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y,m-1));
    const hasta = endOfMonth(new Date(y,m-1));
    const baseQuery = filtroEmp
      ? [where("empresaId","==",filtroEmp), where("timestamp",">=",Timestamp.fromDate(desde)), where("timestamp","<=",Timestamp.fromDate(hasta)), orderBy("timestamp","desc")]
      : [where("timestamp",">=",Timestamp.fromDate(desde)), where("timestamp","<=",Timestamp.fromDate(hasta)), orderBy("timestamp","desc")];
    const [fSnap, iSnap, vSnap, eSnap] = await Promise.all([
      getDocs(query(collection(db,"fichajes"), ...baseQuery)),
      getDocs(query(collection(db,"incidencias"), orderBy("creadaEn","desc"))),
      getDocs(collection(db,"vacaciones")),
      getDocs(collection(db,"enfermedades")),
    ]);
    setFichajes(fSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    setIncidencias(iSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      .filter(i => i.fecha && normFecha(i.fecha).slice(3) === mes.slice(5)+"/"+mes.slice(0,4)));
    setVacaciones(vSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    setEnfermedades(eSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    setCargando(false);
  };

  // Devuelve la ausencia (vacaciones o enfermedad) que cubre una fecha ISO "yyyy-MM-dd" para un empleado
  const ausenciaDeDia = (usuarioId, fechaISO) => {
    const vac = vacaciones.find(v =>
      v.empleadoId === usuarioId &&
      fechaISO >= v.fechaInicio && fechaISO <= v.fechaFin
    );
    if (vac) return { etiqueta: "🏖️ VACACIONES", estado: vac.estado, tipo: "vacaciones" };
    const enf = enfermedades.find(e =>
      e.empleadoId === usuarioId &&
      fechaISO >= e.fechaInicio && (e.fechaFin ? fechaISO <= e.fechaFin : true)
    );
    if (enf) return { etiqueta: `🏥 ${enf.tipo?.toUpperCase() || "BAJA MÉDICA"}`, estado: enf.estado, tipo: "enfermedad" };
    return null;
  };

  // Convierte fecha "dd/MM/yyyy" o "yyyy-MM-dd" a ISO "yyyy-MM-dd"
  const toISO = f => {
    if (!f) return "";
    if (f.includes("-")) return f;
    const [d,m,y] = f.split("/"); return `${y}-${m}-${d}`;
  };

  const calcularResumen = () => {
    const mapa = {};
    const ascendente = [...fichajes].sort((a,b) => (a.timestamp?.seconds||0)-(b.timestamp?.seconds||0));
    ascendente.forEach(f => {
      const clave = `${f.usuarioId}_${f.fecha}`;
      if (!mapa[clave]) mapa[clave] = { usuarioId:f.usuarioId, nombre:f.nombre, empresa:f.empresaNombre, fecha:f.fecha, registros:[] };
      mapa[clave].registros.push(f);
    });
    return Object.values(mapa).map(dia => {
      const fechaNorm = normFecha(dia.fecha);
      const incsAprobadas = incidencias.filter(i => i.empleadoId===dia.usuarioId && normFecha(i.fecha)===fechaNorm && i.estado==="aprobada" && i.horaCorrecta);
      let eventos = dia.registros.map(r => ({ tipo:r.tipo, mins:horaAMins(r.hora), fuente:"fichaje" })).filter(e=>e.mins!==null);
      incsAprobadas.forEach(inc => {
        const minCorr = horaAMins(inc.horaCorrecta);
        if (minCorr===null) return;
        if (inc.tipo==="Olvido de fichaje de entrada") {
          const idx=eventos.findIndex(e=>e.tipo==="entrada");
          if (idx>=0) { if (minCorr<eventos[idx].mins) eventos[idx]={tipo:"entrada",mins:minCorr,fuente:"incidencia"}; }
          else eventos.push({tipo:"entrada",mins:minCorr,fuente:"incidencia"});
        } else if (inc.tipo==="Olvido de fichaje de salida") {
          const idx=eventos.findIndex(e=>e.tipo==="salida");
          if (idx>=0) { if (minCorr>eventos[idx].mins) eventos[idx]={tipo:"salida",mins:minCorr,fuente:"incidencia"}; }
          else eventos.push({tipo:"salida",mins:minCorr,fuente:"incidencia"});
        } else if (inc.tipo==="Error en la hora fichada") {
          const entradas=eventos.filter(e=>e.tipo==="entrada"); const salidas=eventos.filter(e=>e.tipo==="salida");
          if (entradas.length>salidas.length) { const idx=eventos.findIndex(e=>e.tipo==="salida"); if (idx>=0) eventos[idx].mins=minCorr; else eventos.push({tipo:"salida",mins:minCorr,fuente:"incidencia"}); }
          else { const idx=eventos.findIndex(e=>e.tipo==="entrada"); if (idx>=0) eventos[idx].mins=minCorr; else eventos.push({tipo:"entrada",mins:minCorr,fuente:"incidencia"}); }
        }
      });
      const totalMins = calcularTotalMins(eventos);
      const entradaHora = dia.registros.find(r=>r.tipo==="entrada")?.hora || "—";
      const salidaHora  = [...dia.registros].reverse().find(r=>r.tipo==="salida")?.hora || "—";
      const todasIncs = incidencias.filter(i => i.empleadoId===dia.usuarioId && normFecha(i.fecha)===fechaNorm);
      const ausencia = ausenciaDeDia(dia.usuarioId, toISO(dia.fecha));
      return {
        usuarioId:dia.usuarioId, nombre:dia.nombre, empresa:dia.empresa, fecha:dia.fecha,
        entrada:entradaHora, salida:salidaHora,
        total: minsATexto(totalMins) || (salidaHora==="—" ? t("fichajes_en_curso") : "—"),
        incidencias:todasIncs, conIncAprobada:incsAprobadas.length>0,
        ausencia,
      };
    }).sort((a,b) => toISO(b.fecha).localeCompare(toISO(a.fecha)));
  };

  const exportarExcel = () => {
    const resumen = calcularResumen();
    const datosFichajes = resumen.map(r => ({
      "Empleado":r.nombre, "Empresa":r.empresa, "Fecha":r.fecha,
      "Hora entrada":r.entrada, "Hora salida":r.salida, "Horas trabajadas":r.total,
      "Incidencias":r.incidencias.length>0 ? r.incidencias.map(i=>`${i.tipo} (${i.estado})`).join("; ") : "—",
    }));
    const datosInc = incidencias.length>0
      ? incidencias.map(i => ({ "Empleado":i.empleadoNombre,"Empresa":i.empresaNombre,"Fecha":i.fecha,"Tipo":i.tipo,"Hora correcta":i.horaCorrecta||"—","Descripción":i.descripcion||"—","Estado":i.estado,"Registrada por":i.creadaPor||"—" }))
      : [{ "Info":"Sin incidencias este mes" }];
    const wb=XLSX.utils.book_new();
    const ws1=XLSX.utils.json_to_sheet(datosFichajes);
    const ws2=XLSX.utils.json_to_sheet(datosInc);
    ws1["!cols"]=[22,22,12,12,12,16,40].map(w=>({wch:w}));
    ws2["!cols"]=[22,22,12,24,12,30,12,18].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb,ws1,"Fichajes");
    XLSX.utils.book_append_sheet(wb,ws2,"Incidencias");
    XLSX.writeFile(wb,`fichajes_${mes}.xlsx`);
  };

  const resumen = calcularResumen();

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>{t("fichajes_titulo")}</h1>
        <button className="btn btn-primary" onClick={exportarExcel}>{t("fichajes_exportar")}</button>
      </div>

      <div className="card" style={{ marginBottom:16, padding:"14px 18px" }}>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <label className="form-label" style={{ marginBottom:4 }}>{t("fichajes_mes")}</label>
            <input className="form-input" type="month" value={mes}
              onChange={e=>setMes(e.target.value)} style={{ width:170 }} />
          </div>
          <div>
            <label className="form-label" style={{ marginBottom:4 }}>{t("fichajes_empresa")}</label>
            <select className="form-input form-select" style={{ width:220 }}
              value={filtroEmp} onChange={e=>setFiltroEmp(e.target.value)}>
              <option value="">{t("fichajes_todas_emp")}</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div style={{ marginTop:18 }}>
            <span className="badge badge-blue">{resumen.length} {t("fichajes_dias")}</span>
          </div>
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p style={{ textAlign:"center", padding:30, color:"#9CA3AF" }}>{t("cargando")}</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>{t("fichajes_empleado")}</th><th>{t("fichajes_empresa")}</th>
                <th>{t("fichajes_fecha")}</th><th>{t("fichajes_entrada")}</th>
                <th>{t("fichajes_salida")}</th><th>{t("fichajes_total")}</th>
                <th>{t("fichajes_incidencias")}</th>
              </tr>
            </thead>
            <tbody>
              {resumen.length===0 && (
                <tr><td colSpan={7} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                  {t("fichajes_sin_datos")}
                </td></tr>
              )}
              {resumen.map((r,i) => (
                <tr key={i} style={ r.ausencia ? { background: r.ausencia.tipo==="vacaciones" ? "#F0FDF4" : "#FFF7ED" } : {} }>
                  <td style={{ fontWeight:500 }}>{r.nombre}</td>
                  <td style={{ fontSize:13, color:"#6B7280" }}>{r.empresa}</td>
                  <td>
                    {r.fecha}
                    {r.conIncAprobada && <span title="Horas corregidas" style={{ marginLeft:6, fontSize:11, color:"#2E5FA3" }}>✎</span>}
                  </td>
                  {r.ausencia ? (
                    // Fila especial de ausencia: ocupa columnas entrada/salida/total con la etiqueta
                    <td colSpan={3} style={{ fontWeight:600, fontSize:13,
                      color: r.ausencia.tipo==="vacaciones" ? "#0F6E56" : "#BA7517",
                      textAlign:"center", letterSpacing:".03em"
                    }}>
                      {r.ausencia.etiqueta}
                      <span style={{ marginLeft:8, fontSize:11, fontWeight:400,
                        color: r.ausencia.estado==="aprobada"||r.ausencia.estado==="confirmada" ? "#0F6E56"
                             : r.ausencia.estado==="resuelta" ? "#6B7280" : "#BA7517"
                      }}>
                        ({r.ausencia.estado})
                      </span>
                    </td>
                  ) : (
                    <>
                      <td><span className="badge badge-green">{r.entrada}</span></td>
                      <td><span className={`badge ${r.salida==="—"?"badge-gray":"badge-red"}`}>{r.salida}</span></td>
                      <td style={{ fontWeight:600, color:r.total===t("fichajes_en_curso")?"#2E5FA3":r.total==="—"?"#9CA3AF":"#0F6E56" }}>
                        {r.total}{r.conIncAprobada && <span style={{ fontSize:11, color:"#2E5FA3", marginLeft:4 }}>✎</span>}
                      </td>
                    </>
                  )}
                  <td>
                    {r.incidencias.length>0
                      ? <span className="badge badge-amber" title={r.incidencias.map(i=>i.tipo).join(", ")}>⚠ {r.incidencias.length}</span>
                      : <span style={{ color:"#D1D5DB", fontSize:13 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
