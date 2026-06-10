// src/components/Notificaciones.jsx
import React, { useEffect, useState, useRef } from "react";
import { obtenerNotificaciones, marcarLeida, marcarTodasLeidas } from "../lib/notificaciones";
import { useAuth } from "../lib/AuthContext";

export default function Notificaciones() {
  const { user } = useAuth();
  const [notifs,  setNotifs]  = useState([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  const cargar = async () => {
    if (!user) return;
    const lista = await obtenerNotificaciones(user.uid);
    setNotifs(lista);
  };

  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return ()=>clearInterval(t); }, [user]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const noLeidas = notifs.filter(n => !n.leida).length;

  const handleMarcarTodas = async () => { await marcarTodasLeidas(user.uid); cargar(); };

  const handleClick = async (n) => { if (!n.leida) { await marcarLeida(n.id); cargar(); } };

  const iconoTipo  = (t) => ({ success:"✓", warning:"⚠", error:"✗", info:"ℹ" }[t] || "ℹ");
  const colorTipo  = (t) => ({ success:"#0F6E56", warning:"#BA7517", error:"#C0392B", info:"#2E5FA3" }[t] || "#2E5FA3");

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setAbierto(!abierto)} style={{
        position:"relative", background:"transparent", border:"none",
        cursor:"pointer", fontSize:20, padding:"4px 8px", borderRadius:8,
        color: abierto ? "#1B3A6B" : "#6B7280"
      }}>
        🔔
        {noLeidas > 0 && (
          <span style={{
            position:"absolute", top:0, right:0, background:"#C0392B", color:"#fff",
            borderRadius:"50%", fontSize:10, fontWeight:700, width:16, height:16,
            display:"flex", alignItems:"center", justifyContent:"center"
          }}>{noLeidas > 9 ? "9+" : noLeidas}</span>
        )}
      </button>

      {abierto && (
        <div style={{
          position:"absolute", right:0, top:"calc(100% + 8px)", width:300,
          background:"#fff", borderRadius:12, boxShadow:"0 8px 30px rgba(0,0,0,.15)",
          border:"1px solid #E5E7EB", zIndex:999, overflow:"hidden"
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"12px 16px", borderBottom:"1px solid #F3F4F6" }}>
            <span style={{ fontWeight:600, fontSize:14 }}>Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={handleMarcarTodas} style={{
                fontSize:12, color:"#2E5FA3", background:"none", border:"none", cursor:"pointer"
              }}>Marcar todas leídas</button>
            )}
          </div>
          <div style={{ maxHeight:360, overflowY:"auto" }}>
            {notifs.length === 0 ? (
              <div style={{ padding:24, textAlign:"center", color:"#9CA3AF", fontSize:13 }}>Sin notificaciones</div>
            ) : notifs.map(n => (
              <div key={n.id} onClick={() => handleClick(n)} style={{
                padding:"12px 16px", borderBottom:"1px solid #F9FAFB",
                background: n.leida ? "#fff" : "#F0F7FF", cursor:"pointer"
              }}>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <span style={{
                    fontSize:14, color:colorTipo(n.tipo), background: n.leida ? "#F3F4F6" : "#EBF2FB",
                    borderRadius:"50%", width:28, height:28, display:"flex",
                    alignItems:"center", justifyContent:"center", flexShrink:0, fontWeight:700
                  }}>{iconoTipo(n.tipo)}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight: n.leida ? 400 : 600, fontSize:13 }}>{n.titulo}</div>
                    <div style={{ fontSize:12, color:"#6B7280", marginTop:2, lineHeight:1.4 }}>{n.mensaje}</div>
                    <div style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>
                      {n.creadaEn?.toDate?.()?.toLocaleString("es-ES") || ""}
                    </div>
                  </div>
                  {!n.leida && <span style={{ width:8, height:8, borderRadius:"50%", background:"#2E5FA3", flexShrink:0, marginTop:4 }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
