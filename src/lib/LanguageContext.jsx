// src/lib/LanguageContext.jsx
import React, { createContext, useContext, useState } from "react";

const translations = {
  es: {
    // Navegación — secciones
    nav_general:      "General",
    nav_registros:    "Registros",
    nav_rrhh:         "RRHH",
    nav_jornada:      "Mi jornada",
    nav_cuenta:       "Cuenta",
    // Navegación — enlaces
    nav_inicio:       "Inicio",
    nav_empresas:     "Empresas",
    nav_empleados:    "Empleados",
    nav_fichajes:     "Fichajes",
    nav_incidencias:  "Incidencias",
    nav_informe_pdf:  "Informe PDF",
    nav_vacaciones:   "Vacaciones",
    nav_enfermedad:   "Enfermedad",
    nav_nominas:      "Nóminas",
    nav_fichar:       "Fichar",
    nav_historial:    "Mi historial",
    nav_password:     "Contraseña",
    nav_cerrar_sesion:"Cerrar sesión",
    // General
    cargando:         "Cargando...",
  },
  en: {
    // Navigation — sections
    nav_general:      "General",
    nav_registros:    "Records",
    nav_rrhh:         "HR",
    nav_jornada:      "My Shift",
    nav_cuenta:       "Account",
    // Navigation — links
    nav_inicio:       "Home",
    nav_empresas:     "Companies",
    nav_empleados:    "Employees",
    nav_fichajes:     "Time Logs",
    nav_incidencias:  "Incidents",
    nav_informe_pdf:  "PDF Report",
    nav_vacaciones:   "Holidays",
    nav_enfermedad:   "Sick Leave",
    nav_nominas:      "Payslips",
    nav_fichar:       "Clock In/Out",
    nav_historial:    "My History",
    nav_password:     "Password",
    nav_cerrar_sesion:"Log out",
    // General
    cargando:         "Loading...",
  },
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState("es");
  const t = (key) => translations[lang][key] ?? key;
  const toggleLang = () => setLang((l) => (l === "es" ? "en" : "es"));
  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
