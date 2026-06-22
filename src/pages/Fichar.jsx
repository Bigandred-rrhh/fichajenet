// src/pages/Fichar.jsx
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { useLang } from "../lib/LanguageContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import Notificaciones from "../components/Notificaciones";

function calcularHoras(registros) {
  let totalMinutos = 0;
  const lista = [...registros];
  for (let i = 0; i < lista.length - 1; i++) {
    if (lista[i].tipo === "entrada" && lista[i+1].tipo === "salida") {
      const entrada = lista[i].timestamp?.toDate?.() || new Date();
      const salida  = lista[i+1].timestamp?.toDate?.() || new Date();
      totalMinutos += Math.round((salida - entrada) / 60000);
      i++;
    }
  }
  if (totalMinutos <= 0) return null;
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${h}h ${String(m).padStart(2,"0")}m`;
}

export default function Fichar() {
  const { user, perfil, logout } = useAuth();
  const { showToast, ToastUI } = useToast();
  const { lang, toggleLang, t } = useLang();
  const navigate = useNavigate();
  const [hora, setHora]               = useState(new Date());
  const [registrosHoy, setRegistros]  = useState([]);
  const [cargando, setCargando]       = useState(false);
  const [empresa, setEmpresa]         = useState(null);
  const [iniciado, setIniciado]       = useState(false);
  const [tiempoVivo, setTiempoVivo]   = useState(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ultimoTipo = registrosHoy.length ? registrosHoy[registrosHoy.length-1].tipo : null;
    if (ultimoTipo !== "entrada") { setTiempoVivo(null); return; }
    const ultimaEntrada = registrosHoy[registrosHoy.length-1].timestamp?.toDate?.();
    if (!ultimaEntrada) return;
    const calcular = () => {
      const mins = Math.round((new Date() - ultimaEntrada) / 60000);
      setTiempoVivo(`${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`);
    };
    calcular();
    const timer = setInterval(calcular, 10000);
    return () => clearInterval(timer);
  }, [registrosHoy]);

  const cargarEmpresa = useCallback(async () => {
    if (!perfil?.empresaId) return;
    try {
      const snap = await getDoc(doc(db,"empresas",perfil.empresaId));
      if (snap.exists()) setEmpresa(snap.data());
    } catch(e) { console.error(e); }
  }, [perfil]);

  const cargarRegistrosHoy = useCallback(async () => {
    if (!user) return;
    try {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const manana = new Date(hoy); manana.setDate(manana.getDate()+1);
      const q = query(
        collection(db,"fichajes"),
        where("usuarioId","==",user.uid),
        where("timestamp",">=",Timestamp.fromDate(hoy)),
        where("timestamp","<",Timestamp.fromDate(manana)),
        orderBy("timestamp","asc")
      );
      const snap = await getDocs(q);
      setRegistros(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch(e) { console.error(e); }
  }, [user]);

  useEffect(() => {
    if (perfil && user && !iniciado) {
      setIniciado(true);
      cargarEmpresa();
      cargarRegistrosHoy();
    }
  }, [perfil, user, iniciado, cargarEmpresa, cargarRegistrosHoy]);

  const registrar = async (tipo) => {
    if (cargando) return;
    setCargando(true);
    try {
      const ahora = new Date();
      let horasDia = null;
      if (tipo === "salida" && registrosHoy.length > 0) {
        const ultima = registrosHoy[registrosHoy.length-1].timestamp?.toDate?.();
        if (ultima) {
          let totalMins = 0;
          const lista = [...registrosHoy];
          for (let i = 0; i < lista.length-1; i++) {
            if (lista[i].tipo==="entrada" && lista[i+1].tipo==="salida") {
              const e=lista[i].timestamp?.toDate?.(); const s=lista[i+1].timestamp?.toDate?.();
              if (e&&s) totalMins+=Math.round((s-e)/60000); i++;
            }
          }
          totalMins += Math.round((ahora - ultima) / 60000);
          horasDia = `${Math.floor(totalMins/60)}h ${String(totalMins%60).padStart(2,"0")}m`;
        }
      }
      await addDoc(collection(db,"fichajes"), {
        usuarioId:user.uid, nombre:perfil.nombre,
        empresaId:perfil.empresaId, empresaNombre:empresa?.nombre||"",
        tipo, timestamp:Timestamp.fromDate(ahora),
        fecha:format(ahora,"dd/MM/yyyy"), hora:format(ahora,"HH:mm:ss"),
        horasDia, ip:"web"
      });
      if (tipo==="salida"&&horasDia) {
        showToast(`${t("fichar_total_hoy")} ${horasDia}`,"success");
      } else {
        showToast(`${t("fichar_toast_entrada")} ${format(ahora,"HH:mm")}`,"success");
      }
      await cargarRegistrosHoy();
    } catch(err) {
      console.error(err);
      showToast(t("fichar_error"),"error");
    }
    setCargando(false);
  };

  const handleLogout = async () => {
    if (confirmLogout) { await logout(); }
    else { setConfirmLogout(true); setTimeout(()=>setConfirmLogout(false),4000); }
  };

  const iniciales = (nombre) => (nombre||"?").split(" ").slice(0,2).map(p=>p[0]).join("").toUpperCase();
  const ultimoTipo = registrosHoy.length ? registrosHoy[registrosHoy.length-1].tipo : null;
  const totalHoyFinalizado = calcularHoras(registrosHoy);

  const menuOpciones = [
    { icon:"📅", label:t("fichar_mi_historial"),    ruta:"/mi-historial" },
    { icon:"⚠️", label:t("fichar_mis_incidencias"), ruta:"/incidencias" },
    { icon:"🏖️", label:t("fichar_vacaciones"),       ruta:"/vacaciones" },
    { icon:"🏥", label:t("fichar_enfermedad"),        ruta:"/enfermedad" },
    { icon:"💰", label:t("fichar_mis_nominas"),       ruta:"/nominas" },
    { icon:"🔑", label:t("fichar_cambiar_pwd"),       ruta:"/cambiar-password" },
  ];

  return (
    <div className="fichar-wrap">
      {ToastUI}
      <div className="card" style={{ textAlign:"center", padding:"28px 24px", position:"relative" }}>

        {/* Barra superior móvil */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span className="mobile-show"><Notificaciones /></span>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {/* Botón idioma en móvil */}
            <button
              onClick={toggleLang}
              className="mobile-show"
              style={{
                display:"flex", alignItems:"center",
                border:"1px solid #E5E7EB", background:"transparent",
                borderRadius:8, padding:"6px 10px", fontSize:13,
                fontWeight:700, cursor:"pointer", color:"#6B7280"
              }}
            >
              {lang==="es"?"EN":"ES"}
            </button>

            {/* Menú Mi cuenta */}
            <div style={{ position:"relative" }}>
              <button onClick={()=>setMenuAbierto(!menuAbierto)} className="mobile-show" style={{
                display:"flex", alignItems:"center", gap:6,
                border:"1px solid #E5E7EB", background:"transparent",
                borderRadius:8, padding:"6px 12px", fontSize:13,
                cursor:"pointer", color:"#6B7280"
              }}>
                {t("fichar_mi_cuenta")}
              </button>

              {menuAbierto && (
                <div style={{
                  position:"fixed", top:70, right:8, left:8, width:"auto",
                  background:"#fff", border:"1px solid #E5E7EB",
                  borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,.12)",
                  zIndex:999, overflow:"hidden", maxWidth:320, marginLeft:"auto"
                }}>
                  {menuOpciones.map(op => (
                    <button key={op.ruta} onClick={()=>{ setMenuAbierto(false); navigate(op.ruta); }}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        width:"100%", padding:"11px 16px", border:"none",
                        background:"transparent", cursor:"pointer", fontSize:14,
                        color:"#1A1A2E", textAlign:"left", borderBottom:"1px solid #F3F4F6"
                      }}
                      onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    >
                      <span style={{ fontSize:16 }}>{op.icon}</span>
                      {op.label}
                    </button>
                  ))}
                  <button onClick={handleLogout} style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"11px 16px", border:"none",
                    background:"transparent", cursor:"pointer", fontSize:14,
                    color:confirmLogout?"#C0392B":"#6B7280", textAlign:"left",
                    fontWeight:confirmLogout?600:400
                  }}
                    onMouseEnter={e=>e.currentTarget.style.background="#FFF5F5"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >
                    <span style={{ fontSize:16 }}>🚪</span>
                    {confirmLogout ? t("fichar_confirmar_logout") : t("fichar_cerrar_sesion")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="avatar-emp">{iniciales(perfil?.nombre)}</div>
        <div className="emp-nombre">{perfil?.nombre}</div>
        <div className="emp-empresa">
          {empresa ? empresa.nombre : perfil?.empresaId ? t("cargando") : t("fichar_sin_empresa")}
        </div>

        <div className="reloj-grande">{format(hora,"HH:mm:ss")}</div>
        <div className="fecha-txt">
          {format(hora,"EEEE, d 'de' MMMM 'de' yyyy",{ locale:es })}
        </div>

        {ultimoTipo==="entrada" && tiempoVivo && (
          <div style={{ background:"#EBF2FB", borderRadius:10, padding:"10px 16px", marginBottom:16, display:"inline-block" }}>
            <span style={{ fontSize:12, color:"#2E5FA3", fontWeight:500 }}>
              {t("fichar_tiempo_hoy")} <strong>{tiempoVivo}</strong>
            </span>
          </div>
        )}

        {ultimoTipo==="salida" && totalHoyFinalizado && (
          <div style={{ background:"#E1F5EE", borderRadius:10, padding:"10px 16px", marginBottom:16, display:"inline-block" }}>
            <span style={{ fontSize:12, color:"#0F6E56", fontWeight:500 }}>
              {t("fichar_total_hoy")} <strong>{totalHoyFinalizado}</strong>
            </span>
          </div>
        )}

        {ultimoTipo !== "entrada" && (
          <button className="btn btn-green btn-lg" style={{ marginBottom:12 }}
            onClick={()=>registrar("entrada")} disabled={cargando}>
            {cargando ? t("fichar_registrando") : t("fichar_btn_entrada")}
          </button>
        )}
        {ultimoTipo === "entrada" && (
          <button className="btn btn-red btn-lg" style={{ marginBottom:12 }}
            onClick={()=>registrar("salida")} disabled={cargando}>
            {cargando ? t("fichar_registrando") : t("fichar_btn_salida")}
          </button>
        )}

        <div style={{ marginTop:24, textAlign:"left" }}>
          <p style={{ fontSize:12, fontWeight:600, color:"#6B7280", marginBottom:10 }}>
            {t("fichar_registros_hoy")}
          </p>
          {registrosHoy.length===0 ? (
            <p style={{ fontSize:13, color:"#9CA3AF", textAlign:"center", padding:"12px 0" }}>
              {t("fichar_sin_registros")}
            </p>
          ) : (
            registrosHoy.map(r => (
              <div key={r.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:"1px solid #F3F4F6", fontSize:14
              }}>
                <span className={`badge ${r.tipo==="entrada"?"badge-green":"badge-red"}`}>
                  {r.tipo==="entrada" ? t("dash_entrada") : t("dash_salida")}
                </span>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  {r.horasDia && <span style={{ fontSize:12, color:"#0F6E56", fontWeight:500 }}>{r.horasDia}</span>}
                  <span style={{ fontWeight:600 }}>{r.hora}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
