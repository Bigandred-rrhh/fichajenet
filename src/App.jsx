// src/App.jsx
import React, { useEffect } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
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

function Layout({ children, rol }) {
  const { perfil, logout } = useAuth();
  const esAdmin = rol === "admin" || rol === "rrhh";
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
            <div className="nav-section-label">General</div>
            <NavLink to="/dashboard"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">📊</span> Inicio
            </NavLink>
            <NavLink to="/empresas"   className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">🏢</span> Empresas
            </NavLink>
            <NavLink to="/empleados"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">👥</span> Empleados
            </NavLink>
            <div className="nav-section-label">Registros</div>
            <NavLink to="/fichajes"    className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">📋</span> Fichajes
            </NavLink>
            <NavLink to="/incidencias" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">⚠️</span> Incidencias
            </NavLink>
            <NavLink to="/informe-pdf" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">📄</span> Informe PDF
            </NavLink>
            <div className="nav-section-label">RRHH</div>
            <NavLink to="/vacaciones"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">🏖️</span> Vacaciones
            </NavLink>
            <NavLink to="/enfermedad"  className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">🏥</span> Enfermedad
            </NavLink>
            <NavLink to="/nominas"     className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">💰</span> Nóminas
            </NavLink>
          </>}
          <div className="nav-section-label">Mi jornada</div>
          <NavLink to="/fichar"          className={({isActive})=>"nav-link"+(isActive?" active":"")}>
            <span className="nav-icon">👆</span> Fichar
          </NavLink>
          <NavLink to="/mi-historial"    className={({isActive})=>"nav-link"+(isActive?" active":"")}>
            <span className="nav-icon">📅</span> Mi historial
          </NavLink>
          {esEmpleado && <>
            <NavLink to="/incidencias"   className={({isActive})=>"nav-link"+(isActive?" active":"")}>
              <span className="nav-icon">⚠️</span> Incidencias
            </NavLink>
          </>}
          <div className="nav-section-label">Cuenta</div>
          <NavLink to="/cambiar-password" className={({isActive})=>"nav-link"+(isActive?" active":"")}>
            <span className="nav-icon">🔑</span> Contraseña
          </NavLink>
        </div>
        <div style={{ padding:"12px 18px", borderTop:"1px solid rgba(255,255,255,.12)" }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.55)", marginBottom:8 }}>{perfil?.nombre}</div>
          <button onClick={logout} className="btn" style={{
            width:"100%", justifyContent:"center", fontSize:13,
            background:"rgba(255,255,255,.1)", color:"#fff", borderColor:"rgba(255,255,255,.2)"
          }}>Cerrar sesión</button>
        </div>
      </nav>

      <div className="main-wrapper">
        {esAdmin && (
          <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center",
            padding:"10px 24px", background:"#fff", borderBottom:"1px solid #E5E7EB",
            position:"sticky", top:0, zIndex:50 }}>
            <Notificaciones />
          </div>
        )}
        <main className="main-content">{children}</main>
      </div>

      {esAdmin && (
        <nav className="mobile-nav">
          <NavLink to="/dashboard"   className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>📊</span><span>Inicio</span>
          </NavLink>
          <NavLink to="/fichajes"    className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>📋</span><span>Fichajes</span>
          </NavLink>
          <NavLink to="/vacaciones"  className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>🏖️</span><span>Vacaciones</span>
          </NavLink>
          <NavLink to="/empleados"   className={({isActive})=>"mobile-nav-item"+(isActive?" active":"")}>
            <span>👥</span><span>Empleados</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}

function RutaProtegida({ children, soloAdmin }) {
  const { user, perfil, cargando } = useAuth();
  if (cargando) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}>Cargando...</div>;
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
