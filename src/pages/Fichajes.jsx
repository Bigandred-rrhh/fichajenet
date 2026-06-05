// src/pages/Fichajes.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { format, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";

// Normaliza cualquier formato de fecha a dd/MM/yyyy
function normFecha(f) {
  if (!f) return "";
  if (f.includes("-")) { const [y,m,d] = f.split("-"); return `${d}/${m}/${y}`; }
  return f;
}

// Convierte "HH:mm" o "HH:mm:ss" a minutos desde medianoche
function horaAMins(h) {
  if (!h) return null;
  const partes = h.split(":");
  return parseInt(partes[0]) * 60 + parseInt(partes[1]);
}

// Calcula horas trabajadas dado un array de eventos {tipo, mins}
function calcularTotalMins(eventos) {
  let total = 0;
  const evs = [...eventos].sort((a,b) => a.mins - b.mins);
  for (let i = 0; i < evs.length - 1; i++) {
    if (evs[i].tipo === "entrada" && evs[i+1].tipo === "salida") {
      total += evs[i+1].mins - evs[i].mins;
      i++;
    }
  }
  return total;
}

function minsATexto(mins) {
  if (mins <= 0) return null;
  return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`;
}

export default function Fichajes() {
  const [fichajes,    setFichajes]    = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [empresas,    setEmpresas]    = useState([]);
  const [filtroEmp,   setFiltroEmp]   = useState("");
  const [mes,         setMes]         = useState(format(new Date(), "yyyy-MM"));
  const [cargando,    setCargando]    = useState(false);

  useEffect(() => { cargarEmpresas(); }, []);
  useEffect(() => { cargarDatos(); }, [filtroEmp, mes]);

  const cargarEmpresas = async () => {
    const snap = await getDocs(collection(db, "empresas"));
    setEmpresas(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  };

  const cargarDatos = async () => {
    setCargando(true);
    const [y, m] = mes.split("-").map(Number);
    const desde  = startOfMonth(new Date(y, m-1));
    const hasta  = endOfMonth(new Date(y, m-1));
    const baseQuery = filtroEmp
      ? [where("empresaId","==",filtroEmp), where("timestamp",">=",Timestamp.fromDate(desde)), where("timestamp","<=",Timestamp.fromDate(hasta)), orderBy("timestamp","desc")]
      : [where("timestamp",">=",Timestamp.fromDate(desde)), where("timestamp","<=",Timestamp.fromDate(hasta)), orderBy("timestamp","desc")];

    const [fSnap, iSnap] = await Promise.all([
      getDocs(query(collection(db,"fichajes"), ...baseQuery)),
      getDocs(query(collection(db,"incidencias"), orderBy("creadaEn","desc"))),
    ]);

    setFichajes(fSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    setIncidencias(iSnap.docs
      .map(d => ({ id:d.id, ...d.data() }))
      .filter(i => i.fecha && normFecha(i.fecha).endsWith(mes.slice(5)+"/"+mes.slice(0,4)) === false
        ? normFecha(i.fecha).slice(3) === mes.slice(5)+"/"+mes.slice(0,4) // MM/yyyy
        : true
      )
    );
    setCargando(false);
  };

  const calcularResumen = () => {
    const mapa = {};
    const ascendente = [...fichajes].sort((a,b) =>
      (a.timestamp?.seconds||0) - (b.timestamp?.seconds||0)
    );

    ascendente.forEach(f => {
      const clave = `${f.usuarioId}_${f.fecha}`;
      if (!mapa[clave]) mapa[clave] = {
        usuarioId: f.usuarioId, nombre: f.nombre,
        empresa: f.empresaNombre, fecha: f.fecha, registros: []
      };
      mapa[clave].registros.push(f);
    });

    return Object.values(mapa).map(dia => {
      const fechaNorm = normFecha(dia.fecha);

      // Incidencias aprobadas del empleado en este día
      const incsAprobadas = incidencias.filter(i =>
        i.empleadoId === dia.usuarioId &&
        normFecha(i.fecha) === fechaNorm &&
        i.estado === "aprobada" &&
        i.horaCorrecta
      );

      // Construir eventos del día a partir de fichajes reales
      let eventos = dia.registros.map(r => ({
        tipo:   r.tipo,
        mins:   horaAMins(r.hora),
        fuente: "fichaje"
      })).filter(e => e.mins !== null);

      // Aplicar incidencias aprobadas
      incsAprobadas.forEach(inc => {
        const minCorr = horaAMins(inc.horaCorrecta);
        if (minCorr === null) return;

        if (inc.tipo === "Olvido de fichaje de entrada") {
          const idxEntrada = eventos.findIndex(e => e.tipo === "entrada");
          if (idxEntrada >= 0) {
            // Si la hora de la incidencia es ANTERIOR a la entrada existente,
            // reemplazarla (el empleado llegó antes pero olvidó fichar)
            if (minCorr < eventos[idxEntrada].mins) {
              eventos[idxEntrada] = { tipo:"entrada", mins:minCorr, fuente:"incidencia" };
            }
          } else {
            // No había entrada → añadirla
            eventos.push({ tipo:"entrada", mins:minCorr, fuente:"incidencia" });
          }
        }
        else if (inc.tipo === "Olvido de fichaje de salida") {
          const idxSalida = eventos.findIndex(e => e.tipo === "salida");
          if (idxSalida >= 0) {
            // Si la hora de la incidencia es POSTERIOR a la salida existente,
            // reemplazarla (el empleado salió más tarde pero olvidó fichar)
            if (minCorr > eventos[idxSalida].mins) {
              eventos[idxSalida] = { tipo:"salida", mins:minCorr, fuente:"incidencia" };
            }
          } else {
            // No había salida → añadirla
            eventos.push({ tipo:"salida", mins:minCorr, fuente:"incidencia" });
          }
        }
        else if (inc.tipo === "Error en la hora fichada") {
          // Reemplazar el fichaje más cercano en tiempo con la hora correcta
          const entradas = eventos.filter(e => e.tipo==="entrada");
          const salidas  = eventos.filter(e => e.tipo==="salida");
          if (entradas.length > salidas.length) {
            const idx = eventos.findIndex(e => e.tipo==="salida");
            if (idx >= 0) eventos[idx].mins = minCorr;
            else eventos.push({ tipo:"salida", mins:minCorr, fuente:"incidencia" });
          } else {
            const idx = eventos.findIndex(e => e.tipo==="entrada");
            if (idx >= 0) eventos[idx].mins = minCorr;
            else eventos.push({ tipo:"entrada", mins:minCorr, fuente:"incidencia" });
          }
        }
      });

      const totalMins  = calcularTotalMins(eventos);
      const evOrdenado = [...eventos].sort((a,b) => a.mins - b.mins);
      const entradaEv  = evOrdenado.find(e => e.tipo==="entrada");
      const salidaEv   = [...evOrdenado].reverse().find(e => e.tipo==="salida");

      // Para mostrar usamos las horas originales de fichaje si existen
      const entradaHora = dia.registros.find(r=>r.tipo==="entrada")?.hora
        || (entradaEv ? `${String(Math.floor(entradaEv.mins/60)).padStart(2,"0")}:${String(entradaEv.mins%60).padStart(2,"0")}` : "—");
      const salidaHora  = [...dia.registros].reverse().find(r=>r.tipo==="salida")?.hora
        || (salidaEv ? `${String(Math.floor(salidaEv.mins/60)).padStart(2,"0")}:${String(salidaEv.mins%60).padStart(2,"0")}` : "—");

      // Todas las incidencias del día (para mostrar marca)
      const todasIncs = incidencias.filter(i =>
        i.empleadoId === dia.usuarioId && normFecha(i.fecha) === fechaNorm
      );

      return {
        usuarioId:   dia.usuarioId,
        nombre:      dia.nombre,
        empresa:     dia.empresa,
        fecha:       dia.fecha,
        entrada:     entradaHora,
        salida:      salidaHora,
        total:       minsATexto(totalMins) || (salidaHora==="—" ? "En curso" : "—"),
        incidencias: todasIncs,
        conIncAprobada: incsAprobadas.length > 0
      };
    }).sort((a,b) => {
      const toISO = f => {
        if (f.includes("-")) return f;
        const [d,m,y] = f.split("/"); return `${y}-${m}-${d}`;
      };
      return toISO(b.fecha).localeCompare(toISO(a.fecha));
    });
  };

  const exportarExcel = () => {
    const resumen = calcularResumen();
    const datosFichajes = resumen.map(r => ({
      "Empleado":         r.nombre,
      "Empresa":          r.empresa,
      "Fecha":            r.fecha,
      "Hora entrada":     r.entrada,
      "Hora salida":      r.salida,
      "Horas trabajadas": r.total,
      "Incidencias":      r.incidencias.length > 0
        ? r.incidencias.map(i=>`${i.tipo} (${i.estado})`).join("; ")
        : "—",
    }));
    const datosInc = incidencias.length > 0
      ? incidencias.map(i => ({
          "Empleado":       i.empleadoNombre,
          "Empresa":        i.empresaNombre,
          "Fecha":          i.fecha,
          "Tipo":           i.tipo,
          "Hora correcta":  i.horaCorrecta || "—",
          "Descripción":    i.descripcion  || "—",
          "Estado":         i.estado,
          "Registrada por": i.creadaPor    || "—",
        }))
      : [{ "Info":"Sin incidencias este mes" }];

    const wb  = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(datosFichajes);
    const ws2 = XLSX.utils.json_to_sheet(datosInc);
    ws1["!cols"] = [22,22,12,12,12,16,40].map(w=>({wch:w}));
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
                  <td>
                    {r.fecha}
                    {r.conIncAprobada && (
                      <span title="Horas corregidas por incidencia aprobada"
                        style={{ marginLeft:6, fontSize:11, color:"#2E5FA3" }}>✎</span>
                    )}
                  </td>
                  <td><span className="badge badge-green">{r.entrada}</span></td>
                  <td><span className={`badge ${r.salida==="—"?"badge-gray":"badge-red"}`}>{r.salida}</span></td>
                  <td style={{ fontWeight:600,
                    color: r.total==="En curso" ? "#2E5FA3"
                         : r.total==="—" ? "#9CA3AF" : "#0F6E56" }}>
                    {r.total}
                    {r.conIncAprobada && (
                      <span style={{ fontSize:11, color:"#2E5FA3", marginLeft:4 }}>✎</span>
                    )}
                  </td>
                  <td>
                    {r.incidencias.length > 0 ? (
                      <span className="badge badge-amber"
                        title={r.incidencias.map(i=>i.tipo).join(", ")}>
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
