// src/pages/Fichajes.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { format, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";

export default function Fichajes() {
  const [fichajes,   setFichajes]   = useState([]);
  const [incidencias,setIncidencias]= useState([]);
  const [empresas,   setEmpresas]   = useState([]);
  const [filtroEmp,  setFiltroEmp]  = useState("");
  const [mes,        setMes]        = useState(format(new Date(), "yyyy-MM"));
  const [cargando,   setCargando]   = useState(false);

  useEffect(() => { cargarEmpresas(); }, []);
  useEffect(() => { cargarDatos(); }, [filtroEmp, mes]);

  const cargarEmpresas = async () => {
    const snap = await getDocs(collection(db, "empresas"));
    setEmpresas(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  };

  const cargarDatos = async () => {
    setCargando(true);
    const [y, m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y, m-1));
    const hasta = endOfMonth(new Date(y, m-1));

    const base = filtroEmp
      ? [where("empresaId","==",filtroEmp), where("timestamp",">=",Timestamp.fromDate(desde)), where("timestamp","<=",Timestamp.fromDate(hasta)), orderBy("timestamp","desc")]
      : [where("timestamp",">=",Timestamp.fromDate(desde)), where("timestamp","<=",Timestamp.fromDate(hasta)), orderBy("timestamp","desc")];

    const [fSnap, iSnap] = await Promise.all([
      getDocs(query(collection(db,"fichajes"), ...base)),
      getDocs(query(collection(db,"incidencias"), orderBy("creadaEn","desc"))),
    ]);
    setFichajes(fSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    setIncidencias(iSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    setCargando(false);
  };

  // Agrupa fichajes por empleado+fecha
  const calcularResumen = () => {
    const mapa = {};
    [...fichajes].reverse().forEach(f => {
      const clave = `${f.usuarioId}_${f.fecha}`;
      if (!mapa[clave]) mapa[clave] = {
        usuarioId: f.usuarioId, nombre:f.nombre,
        empresa:f.empresaNombre, fecha:f.fecha, registros:[]
      };
      mapa[clave].registros.push(f);
    });

    return Object.values(mapa).map(dia => {
      let totalMins = 0;
      const regs = dia.registros;
      for (let i = 0; i < regs.length-1; i++) {
        if (regs[i].tipo==="entrada" && regs[i+1].tipo==="salida") {
          const e = regs[i].timestamp?.toDate?.();
          const s = regs[i+1].timestamp?.toDate?.();
          if (e && s) totalMins += Math.round((s-e)/60000);
          i++;
        }
      }
      const entrada = regs.find(r=>r.tipo==="entrada")?.hora || "—";
      const salida  = [...regs].reverse().find(r=>r.tipo==="salida")?.hora || "—";
      const h = Math.floor(totalMins/60);
      const m = totalMins%60;

      // Buscar incidencias del mismo empleado y fecha
      const incs = incidencias.filter(i =>
        i.empleadoId === dia.usuarioId && i.fecha === dia.fecha
      );

      return {
        usuarioId: dia.usuarioId,
        nombre:    dia.nombre,
        empresa:   dia.empresa,
        fecha:     dia.fecha,
        entrada,
        salida,
        total:     totalMins > 0 ? `${h}h ${String(m).padStart(2,"0")}m`
                   : salida==="—" ? "En curso" : "—",
        incidencias: incs
      };
    }).sort((a,b) => b.fecha.localeCompare(a.fecha));
  };

  const exportarExcel = () => {
    const resumen = calcularResumen();

    // Hoja 1: Fichajes
    const datosFichajes = resumen.map(r => ({
      "Empleado":         r.nombre,
      "Empresa":          r.empresa,
      "Fecha":            r.fecha,
      "Hora entrada":     r.entrada,
      "Hora salida":      r.salida,
      "Horas trabajadas": r.total,
      "Incidencias":      r.incidencias.length > 0
        ? r.incidencias.map(i => i.tipo).join("; ")
        : "—",
    }));

    // Hoja 2: Incidencias del mes
    const mesStr = mes; // yyyy-MM
    const incsDelMes = incidencias.filter(i => i.fecha?.startsWith(mesStr.slice(0,7)));
    const datosInc = incsDelMes.map(i => ({
      "Empleado":      i.empleadoNombre,
      "Empresa":       i.empresaNombre,
      "Fecha":         i.fecha,
      "Tipo":          i.tipo,
      "Hora correcta": i.horaCorrecta || "—",
      "Descripción":   i.descripcion || "—",
      "Estado":        i.estado,
      "Registrada por":i.creadaPor || "—",
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(datosFichajes);
    const ws2 = XLSX.utils.json_to_sheet(datosInc.length ? datosInc : [{"Info":"Sin incidencias este mes"}]);
    ws1["!cols"] = [22,22,12,12,12,16,30].map(w=>({wch:w}));
    ws2["!cols"] = [22,22,12,24,12,30,12,18].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws1, "Fichajes");
    XLSX.utils.book_append_sheet(wb, ws2, "Incidencias");
    XLSX.writeFile(wb, `fichajes_${mes}.xlsx`);
  };

  const resumen = calcularResumen();

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>Registro de fichajes</h1>
        <button className="btn btn-primary" onClick={exportarExcel}>⬇ Exportar Excel</button>
      </div>

      <div className="card" style={{ marginBottom:16, padding:"14px 18px" }}>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <label className="form-label" style={{ marginBottom:4 }}>Mes</label>
            <input className="form-input" type="month" value={mes}
              onChange={e => setMes(e.target.value)} style={{ width:170 }} />
          </div>
          <div>
            <label className="form-label" style={{ marginBottom:4 }}>Empresa</label>
            <select className="form-input form-select" style={{ width:220 }}
              value={filtroEmp} onChange={e => setFiltroEmp(e.target.value)}>
              <option value="">Todas las empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div style={{ marginTop:18 }}>
            <span className="badge badge-blue">{resumen.length} días registrados</span>
          </div>
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p style={{ textAlign:"center", padding:30, color:"#9CA3AF" }}>Cargando...</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Empleado</th><th>Empresa</th><th>Fecha</th>
                <th>Entrada</th><th>Salida</th><th>Total horas</th><th>Incidencias</th>
              </tr>
            </thead>
            <tbody>
              {resumen.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                  No hay fichajes en este período
                </td></tr>
              )}
              {resumen.map((r,i) => (
                <tr key={i}>
                  <td style={{ fontWeight:500 }}>{r.nombre}</td>
                  <td style={{ fontSize:13, color:"#6B7280" }}>{r.empresa}</td>
                  <td>{r.fecha}</td>
                  <td><span className="badge badge-green">{r.entrada}</span></td>
                  <td><span className={`badge ${r.salida==="—"?"badge-gray":"badge-red"}`}>{r.salida}</span></td>
                  <td style={{ fontWeight:600, color:r.total==="En curso"?"#2E5FA3":r.total==="—"?"#9CA3AF":"#0F6E56" }}>
                    {r.total}
                  </td>
                  <td>
                    {r.incidencias.length > 0 ? (
                      <span className="badge badge-amber" title={r.incidencias.map(i=>i.tipo).join(", ")}>
                        ⚠ {r.incidencias.length}
                      </span>
                    ) : (
                      <span style={{ color:"#D1D5DB", fontSize:13 }}>—</span>
                    )}
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
