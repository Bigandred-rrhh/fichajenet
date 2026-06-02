// src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { format } from "date-fns";

export default function Dashboard() {
  const { perfil } = useAuth();
  const [stats, setStats]     = useState({ empresas: 0, empleados: 0, fichajesHoy: 0 });
  const [ultimos, setUltimos] = useState([]);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);

    const [empSnap, usrSnap, fichSnap] = await Promise.all([
      getDocs(collection(db, "empresas")),
      getDocs(query(collection(db, "usuarios"), where("rol", "==", "empleado"))),
      getDocs(query(collection(db, "fichajes"),
        where("timestamp", ">=", Timestamp.fromDate(hoy)))),
    ]);

    setStats({
      empresas:    empSnap.size,
      empleados:   usrSnap.size,
      fichajesHoy: fichSnap.size,
    });

    const todos = fichSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => b.timestamp?.seconds - a.timestamp?.seconds)
      .slice(0, 8);
    setUltimos(todos);
  };

  return (
    <div>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:20 }}>
        Bienvenido, {perfil?.nombre} 👋
      </h1>

      <div className="stats-grid">
        {[
          { label:"Empresas S.L.", value: stats.empresas,    sub:"registradas" },
          { label:"Empleados",     value: stats.empleados,   sub:"activos" },
          { label:"Fichajes hoy",  value: stats.fichajesHoy, sub:"registros de hoy" },
          { label:"Estado",        value: "✓",               sub:"Sistema activo" },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Últimos fichajes de hoy</h2>
          <button className="btn" onClick={cargar}>↺ Actualizar</button>
        </div>
        <table className="tabla">
          <thead>
            <tr>
              <th>Empleado</th><th>Empresa</th><th>Tipo</th><th>Hora</th>
            </tr>
          </thead>
          <tbody>
            {ultimos.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                Sin fichajes hoy todavía
              </td></tr>
            )}
            {ultimos.map(f => (
              <tr key={f.id}>
                <td style={{ fontWeight:500 }}>{f.nombre}</td>
                <td style={{ color:"#6B7280", fontSize:13 }}>{f.empresaNombre}</td>
                <td>
                  <span className={`badge ${f.tipo==="entrada" ? "badge-green" : "badge-red"}`}>
                    {f.tipo === "entrada" ? "⬇ Entrada" : "⬆ Salida"}
                  </span>
                </td>
                <td style={{ fontWeight:600 }}>{f.hora}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
