// src/App.jsx
import React, { useEffect } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import { useLang } from "./lib/LanguageContext";
import Login           from "./pages/Login";
import Dashboard       from "./pages/Dashboard";
import Empresas        from "./pages/Empresas";
import Empleados       from "./pages/Empleados";
import Fichajes        from "./pages/Fichajes";
import Fichar          from "./pages/Fichar";
import Incidencias     from "./pages/Incidencias";
import MiHistorial     from "./pages/MiHistorial";
import CambiarPassword from "./pages/CambiarPassword";
import InformePDF      from "./pages/InformePDF";
import Vacaciones      from "./pages/Vacaciones";
import Enfermedad      from "./pages/Enfermedad";
import Nominas         from "./pages/Nominas";
import Notificaciones  from "./components/Notificaciones";

function BotonIdioma({ toggleLang, lang, style = {} }) {
  return (
    <button
      onClick={toggleLang}
      title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
      style={{
        background: "none", border: "1px solid rgba(255,255,255,.25)",
        borderRadius: 8, padding: "5px 10px", cursor: "pointer",
        fontSize: 13, fontWeight: 700, letterSpacing: ".04em",
        display: "flex", alignItems: "center",
        color: "#fff", transition: "all .15s", lineHeight: 1,
        ...style
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.15)"}
      onMouseLeave={e => e.currentTarget.style.background = "none"}
    >
      {lang === "es" ? "EN" : "ES"}
    </button>
  );
}

function Layout({ children, rol }) {
  const { perfil, logout } = useAuth();
  const { lang, toggleLang, t } = useLang();
  const esAdmin    = rol === "admin" || rol === "rrhh";
  const esEmpleado = rol === "empleado";

  useEffect(() => {
    if (esEmpleado) document.body.classList.add("es-empleado");
    else document.body.classList.remove("es-empleado");
    return () => document.body.classList.remove("es-empleado");
  }, [esEmpleado]);

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <h1>⏱ FichajeNet</h1>
          <small>RDL 8/2019</small>
        </div>
        <div style={{ flex:1, paddingTop:8, overflowY:"auto" }}>
          {esAdmin && <>
            <div className="nav-section-label">{t("nav_general")}</div>
            <NavLink to="/dashboard"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">📊</span> {t("nav_inicio")}
            </NavLink>
            <NavLink to="/empresas"   className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">🏢</span> {t("nav_empresas")}
            </NavLink>
            <NavLink to="/empleados"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">👥</span> {t("nav_empleados")}
            </NavLink>
            <div className="nav-section-label">{t("nav_registros")}</div>
            <NavLink to="/fichajes"    className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">📋</span> {t("nav_fichajes")}
            </NavLink>
            <NavLink to="/incidencias" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">⚠️</span> {t("nav_incidencias")}
            </NavLink>
            <NavLink to="/informe-pdf" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">📄</span> {t("nav_informe_pdf")}
            </NavLink>
            <div className="nav-section-label">{t("nav_rrhh")}</div>
            <NavLink to="/vacaciones"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">🏖️</span> {t("nav_vacaciones")}
            </NavLink>
            <NavLink to="/enfermedad"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">🏥</span> {t("nav_enfermedad")}
            </NavLink>
            <NavLink to="/nominas"     className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">💰</span> {t("nav_nominas")}
            </NavLink>
          </>}
          <div className="nav-section-label">{t("nav_jornada")}</div>
          <NavLink to="/fichar"       className={({isActive})=>"nav-link"+(isActive?" active":"")}>
            <span className="nav-icon">👆</span> {t("nav_fichar")}
          </NavLink>
          <NavLink to="/mi-historial" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
            <span className="nav-icon">📅</span> {t("nav_historial")}
          </NavLink>
          {esEmpleado && <>
            <NavLink to="/incidencias" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">⚠️</span> {t("nav_incidencias")}
            </NavLink>
          </>}
          <div className="nav-section-label">{t("nav_cuenta")}</div>
          <NavLink to="/cambiar-password" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
            <span className="nav-icon">🔑</span> {t("nav_password")}
          </NavLink>
        </div>
        <div style={{ padding:"12px 18px", borderTop:"1px solid rgba(255,255,255,.12)" }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.55)", marginBottom:8 }}>{perfil?.nombre}</div>
          {/* Botón idioma en sidebar (visible en escritorio) */}
          <div style={{ marginBottom:8 }}>
            <BotonIdioma toggleLang={toggleLang} lang={lang} />
          </div>
          <button onClick={logout} className="btn" style={{
            width:"100%", justifyContent:"center", fontSize:13,
            background:"rgba(255,255,255,.1)", color:"#fff", borderColor:"rgba(255,255,255,.2)"
          }}>{t("nav_cerrar_sesion")}</button>
        </div>
      </nav>

      <div className="main-wrapper">
        {/* Topbar escritorio */}
        <div className="desktop-topbar" style={{
          display:"flex", justifyContent:"flex-end", alignItems:"center",
          gap:"8px", padding:"10px 24px", background:"#fff",
          borderBottom:"1px solid #E5E7EB", position:"sticky", top:0, zIndex:50
        }}>
          <Notificaciones />
        </div>
        <main className="main-content">{children}</main>
      </div>

      {esAdmin && (
        <nav className="mobile-nav">
          <NavLink to="/dashboard"  className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>📊</span><span>{t("nav_inicio")}</span>
          </NavLink>
          <NavLink to="/fichajes"   className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>📋</span><span>{t("nav_fichajes")}</span>
          </NavLink>
          <NavLink to="/vacaciones" className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>🏖️</span><span>{t("nav_vacaciones")}</span>
          </NavLink>
          <NavLink to="/empleados"  className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>👥</span><span>{t("nav_empleados")}</span>
          </NavLink>
          {/* Botón idioma en barra móvil */}
          <button
            onClick={toggleLang}
            style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center",
              padding:"10px 6px", background:"none", border:"none", cursor:"pointer",
              color:"rgba(255,255,255,.6)", fontSize:10, gap:3, textDecoration:"none"
            }}
          >
            <span style={{ fontSize:18, fontWeight:700, color:"rgba(255,255,255,.6)" }}>
              {lang === "es" ? "EN" : "ES"}
            </span>
            <span>{lang === "es" ? "English" : "Español"}</span>
          </button>
        </nav>
      )}
    </div>
  );
}

function RutaProtegida({ children, soloAdmin }) {
  const { user, perfil, cargando } = useAuth();
  const { t } = useLang();
  if (cargando) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}>{t("cargando")}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (soloAdmin && perfil?.rol === "empleado") return <Navigate to="/fichar" replace />;
  return <Layout rol={perfil?.rol}>{children}</Layout>;
}

export default function App() {
  const { user, perfil, cargando } = useAuth();
  if (cargando) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontSize:16, color:"#6B7280" }}>
      Cargando...
    </div>
  );
  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to={perfil?.rol==="empleado"?"/fichar":"/dashboard"} />} />
      <Route path="/dashboard"        element={<RutaProtegida soloAdmin><Dashboard /></RutaProtegida>} />
      <Route path="/empresas"         element={<RutaProtegida soloAdmin><Empresas /></RutaProtegida>} />
      <Route path="/empleados"        element={<RutaProtegida soloAdmin><Empleados /></RutaProtegida>} />
      <Route path="/fichajes"         element={<RutaProtegida soloAdmin><Fichajes /></RutaProtegida>} />
      <Route path="/incidencias"      element={<RutaProtegida><Incidencias /></RutaProtegida>} />
      <Route path="/informe-pdf"      element={<RutaProtegida soloAdmin><InformePDF /></RutaProtegida>} />
      <Route path="/mi-historial"     element={<RutaProtegida><MiHistorial /></RutaProtegida>} />
      <Route path="/cambiar-password" element={<RutaProtegida><CambiarPassword /></RutaProtegida>} />
      <Route path="/vacaciones"       element={<RutaProtegida><Vacaciones /></RutaProtegida>} />
      <Route path="/enfermedad"       element={<RutaProtegida><Enfermedad /></RutaProtegida>} />
      <Route path="/nominas"          element={<RutaProtegida><Nominas /></RutaProtegida>} />
      <Route path="/fichar"           element={<RutaProtegida><Fichar /></RutaProtegida>} />
      <Route path="/" element={<Navigate to={user?(perfil?.rol==="empleado"?"/fichar":"/dashboard"):"/login"} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
