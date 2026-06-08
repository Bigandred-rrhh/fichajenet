// src/pages/MiHistorial.jsx
import React, { useEffect, useState, useCallback } from "react";
import { collection, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
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
  if (!m || m<=0) return null;
  return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`;
}

export default function MiHistorial() {
  const { user, perfil } = useAuth();
  const [mes,      setMes]      = useState(format(new Date(),"yyyy-MM"));
  const [fichajes, setFichajes] = useState([]);
  const [incs,     setIncs]     = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    const [y,m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y,m-1));
    const hasta = endOfMonth(new Date(y,m-1));
    const [fSnap, iSnap] = await Promise.all([
      getDocs(query(collection(db,"fichajes"),
        where("usuarioId","==",user.uid),
        where("timestamp",">=",Timestamp.fromDate(desde)),
        where("timestamp","<=",Timestamp.fromDate(hasta)),
        orderBy("timestamp","asc"))),
      getDocs(query(collection(db,"incidencias"),
        where("empleadoId","==",user.uid),
        orderBy("creadaEn","desc"))),
    ]);
    setFichajes(fSnap.docs.map(d=>({id:d.id,...d.data()})));
    setIncs(iSnap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(i => i.fecha && normFecha(i.fecha).slice(3) === mes.slice(5)+"/"+mes.slice(0,4)));
    setCargando(false);
  }, [user, mes]);

  useEffect(() => { cargar(); }, [cargar]);

  // Agrupar por día
  const dias = (() => {
    const mapa = {};
    fichajes.forEach(f => {
      if (!mapa[f.fecha]) mapa[f.fecha] = [];
      mapa[f.fecha].push(f);
    });
    return Object.entries(mapa).sort((a,b) => b[0].localeCompare(a[0])).map(([fecha, regs]) => {
      const incsDia = incs.filter(i => normFecha(i.fecha) === normFecha(fecha));
      const incsAprobadas = incsDia.filter(i => i.estado==="aprobada" && i.horaCorrecta);
      let eventos = regs.map(r => ({ tipo:r.tipo, mins:horaAMins(r.hora) })).filter(e=>e.mins!==null);
      incsAprobadas.forEach(inc => {
        const mc = horaAMins(inc.horaCorrecta);
        if (!mc) return;
        if (inc.tipo==="Olvido de fichaje de entrada") {
          const idx = eventos.findIndex(e=>e.tipo==="entrada");
          if (idx>=0 && mc<eventos[idx].mins) eventos[idx].mins=mc;
          else if (idx<0) eventos.push({tipo:"entrada",mins:mc});
        } else if (inc.tipo==="Olvido de fichaje de salida") {
          const idx = eventos.findIndex(e=>e.tipo==="salida");
          if (idx>=0 && mc>eventos[idx].mins) eventos[idx].mins=mc;
          else if (idx<0) eventos.push({tipo:"salida",mins:mc});
        }
      });
      let totalMins = 0;
      const evs = [...eventos].sort((a,b)=>a.mins-b.mins);
      for (let i=0;i<evs.length-1;i++) {
        if (evs[i].tipo==="entrada"&&evs[i+1].tipo==="salida") { totalMins+=evs[i+1].mins-evs[i].mins; i++; }
      }
      const entrada = regs.find(r=>r.tipo==="entrada")?.hora || "—";
      const salida  = [...regs].reverse().find(r=>r.tipo==="salida")?.hora || "—";
      return { fecha, entrada, salida, total: minsATexto(totalMins), incsDia, regs };
    });
  })();

  // Total del mes
  const totalMes = dias.reduce((acc, d) => {
    if (!d.total) return acc;
    const [h,m] = d.total.replace("h","").replace("m","").trim().split(" ");
    return acc + parseInt(h||0)*60 + parseInt(m||0);
  }, 0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>Mi historial</h1>
        <input className="form-input" type="month" value={mes}
          onChange={e=>setMes(e.target.value)} style={{ width:170 }} />
      </div>

      {/* Resumen del mes */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Días trabajados", value: dias.filter(d=>d.total).length },
          { label:"Total horas mes",  value: minsATexto(totalMes) || "0h 00m" },
          { label:"Incidencias",       value: incs.length },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        {cargando ? <p style={{ textAlign:"center", padding:30, color:"#9CA3AF" }}>Cargando...</p> : (
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Incidencias</th></tr>
            </thead>
            <tbody>
              {dias.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                  Sin registros este mes
                </td></tr>
              )}
              {dias.map((d,i) => (
                <tr key={i}>
                  <td>{d.fecha}</td>
                  <td><span className="badge badge-green">{d.entrada}</span></td>
                  <td><span className={`badge ${d.salida==="—"?"badge-gray":"badge-red"}`}>{d.salida}</span></td>
                  <td style={{ fontWeight:600, color: d.total ? "#0F6E56" : "#9CA3AF" }}>
                    {d.total || (d.salida==="—" ? "En curso" : "—")}
                  </td>
                  <td>
                    {d.incsDia.length > 0 ? (
                      <span className="badge badge-amber" title={d.incsDia.map(i=>i.tipo).join(", ")}>
                        ⚠ {d.incsDia.length}
                      </span>
                    ) : <span style={{ color:"#D1D5DB" }}>—</span>}
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
