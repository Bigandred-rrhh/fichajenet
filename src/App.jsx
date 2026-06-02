// src/App.jsx
import React from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Login      from "./pages/Login";
import Dashboard  from "./pages/Dashboard";
import Empresas   from "./pages/Empresas";
import Empleados  from "./pages/Empleados";
import Fichajes   from "./pages/Fichajes";
import Fichar     from "./pages/Fichar";

function Layout({ children, rol }) {
  const { perfil, logout } = useAuth();
  const esAdmin = rol === "admin" || rol === "rrhh";

  return (
    <div className="app-shell">
      {/* Sidebar desktop */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <h1>⏱ FichajeNet</h1>
          <small>RDL 8/2019</small>
        </div>

        <div style={{ flex:1, paddingTop:8 }}>
          {esAdmin && <>
            <div className="nav-section-label">General</div>
            <NavLink to="/dashboard" className={({isActive}) => "nav-link" + (isActive?" active":"")}>
              <span className="nav-icon">📊</span> Inicio
            </NavLink>
            <NavLink to="/empresas" className={({isActive}) => "nav-link" + (isActive?" active":"")}>
              <span className="nav-icon">🏢</span> Empresas
            </NavLink>
            <NavLink to="/empleados" className={({isActive}) => "nav-link" + (isActive?" active":"")}>
              <span className="nav-icon">👥</span> Empleados
            </NavLink>
            <div className="nav-section-label">Registros</div>
            <NavLink to="/fichajes" className={({isActive}) => "nav-link" + (isActive?" active":"")}>
              <span className="nav-icon">📋</span> Fichajes
            </NavLink>
          </>}

          <div className="nav-section-label">Mi jornada</div>
          <NavLink to="/fichar" className={({isActive}) => "nav-link" + (isActive?" active":"")}>
            <span className="nav-icon">👆</span> Fichar
          </NavLink>
        </div>

        <div style={{ padding:"12px 18px", borderTop:"1px solid rgba(255,255,255,.12)" }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.55)", marginBottom:8 }}>
            {perfil?.nombre}
          </div>
          <button onClick={logout} className="btn" style={{
            width:"100%", justifyContent:"center", fontSize:13,
            background:"rgba(255,255,255,.1)", color:"#fff", borderColor:"rgba(255,255,255,.2)"
          }}>
            Cerrar sesión
          </button>
        </div>
      </nav>

      {/* Contenido principal */}
      <main className="main-content">{children}</main>

      {/* Nav móvil */}
      <nav className="mobile-nav">
        {esAdmin && <>
          <NavLink to="/dashboard" className={({isActive}) => "mobile-nav-item" + (isActive?" active":"")}>
            <span>📊</span><span>Inicio</span>
          </NavLink>
          <NavLink to="/fichajes" className={({isActive}) => "mobile-nav-item" + (isActive?" active":"")}>
            <span>📋</span><span>Fichajes</span>
          </NavLink>
        </>}
        <NavLink to="/fichar" className={({isActive}) => "mobile-nav-item" + (isActive?" active":"")}>
          <span>👆</span><span>Fichar</span>
        </NavLink>
        {esAdmin && (
          <NavLink to="/empleados" className={({isActive}) => "mobile-nav-item" + (isActive?" active":"")}>
            <span>👥</span><span>Empleados</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}

function RutaProtegida({ children, soloAdmin }) {
  const { user, perfil, cargando } = useAuth();
  if (cargando) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}>Cargando...</div>;
  if (!user)    return <Navigate to="/login" replace />;
  if (soloAdmin && perfil?.rol === "empleado") return <Navigate to="/fichar" replace />;
  return <Layout rol={perfil?.rol}>{children}</Layout>;
}

export default function App() {
  const { user, perfil, cargando } = useAuth();

  if (cargando) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", fontSize:16, color:"#6B7280" }}>
      Cargando...
    </div>
  );

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to={perfil?.rol === "empleado" ? "/fichar" : "/dashboard"} />} />

      <Route path="/dashboard" element={<RutaProtegida soloAdmin><Dashboard /></RutaProtegida>} />
      <Route path="/empresas"  element={<RutaProtegida soloAdmin><Empresas /></RutaProtegida>} />
      <Route path="/empleados" element={<RutaProtegida soloAdmin><Empleados /></RutaProtegida>} />
      <Route path="/fichajes"  element={<RutaProtegida soloAdmin><Fichajes /></RutaProtegida>} />
      <Route path="/fichar"    element={<RutaProtegida><Fichar /></RutaProtegida>} />

      <Route path="/" element={<Navigate to={user ? (perfil?.rol === "empleado" ? "/fichar" : "/dashboard") : "/login"} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
