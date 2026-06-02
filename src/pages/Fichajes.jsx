// src/pages/Fichajes.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { format, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";

export default function Fichajes() {
  const [fichajes,  setFichajes]  = useState([]);
  const [empresas,  setEmpresas]  = useState([]);
  const [filtroEmp, setFiltroEmp] = useState("");
  const [mes,       setMes]       = useState(format(new Date(), "yyyy-MM"));
  const [cargando,  setCargando]  = useState(false);

  useEffect(() => { cargarEmpresas(); }, []);
  useEffect(() => { cargarFichajes(); }, [filtroEmp, mes]);

  const cargarEmpresas = async () => {
    const snap = await getDocs(collection(db, "empresas"));
    setEmpresas(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  };

  const cargarFichajes = async () => {
    setCargando(true);
    const [y, m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y, m-1));
    const hasta = endOfMonth(new Date(y, m-1));

    let q = query(
      collection(db, "fichajes"),
      where("timestamp", ">=", Timestamp.fromDate(desde)),
      where("timestamp", "<=", Timestamp.fromDate(hasta)),
      orderBy("timestamp", "desc")
    );
    if (filtroEmp) {
      q = query(
        collection(db, "fichajes"),
        where("empresaId", "==", filtroEmp),
        where("timestamp", ">=", Timestamp.fromDate(desde)),
        where("timestamp", "<=", Timestamp.fromDate(hasta)),
        orderBy("timestamp", "desc")
      );
    }
    const snap = await getDocs(q);
    setFichajes(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    setCargando(false);
  };

  const exportarExcel = () => {
    const datos = fichajes.map(f => ({
      "Empleado":  f.nombre,
      "Empresa":   f.empresaNombre,
      "Tipo":      f.tipo,
      "Fecha":     f.fecha,
      "Hora":      f.hora,
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fichajes");
    XLSX.writeFile(wb, `fichajes_${mes}.xlsx`);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>Registro de fichajes</h1>
        <button className="btn btn-primary" onClick={exportarExcel}>⬇ Exportar Excel</button>
      </div>

      {/* Filtros */}
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
            <span className="badge badge-blue">{fichajes.length} registros</span>
          </div>
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p style={{ textAlign:"center", padding:30, color:"#9CA3AF" }}>Cargando...</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr><th>Empleado</th><th>Empresa</th><th>Tipo</th><th>Fecha</th><th>Hora</th></tr>
            </thead>
            <tbody>
              {fichajes.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                  No hay fichajes en este período
                </td></tr>
              )}
              {fichajes.map(f => (
                <tr key={f.id}>
                  <td style={{ fontWeight:500 }}>{f.nombre}</td>
                  <td style={{ fontSize:13, color:"#6B7280" }}>{f.empresaNombre}</td>
                  <td>
                    <span className={`badge ${f.tipo==="entrada" ? "badge-green" : "badge-red"}`}>
                      {f.tipo === "entrada" ? "⬇ Entrada" : "⬆ Salida"}
                    </span>
                  </td>
                  <td>{f.fecha}</td>
                  <td style={{ fontWeight:600 }}>{f.hora}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
