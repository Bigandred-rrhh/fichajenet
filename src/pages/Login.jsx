// src/pages/Login.jsx
import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LanguageContext";

export default function Login() {
  const { login } = useAuth();
  const { t } = useLang();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(t("login_error"));
    }
    setCargando(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <h1>⏱ FichajeNet</h1>
          <p>{t("login_subtitulo")}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t("login_email")}</label>
            <input
              className="form-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@empresa.com" required autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("login_password")}</label>
            <input
              className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password"
            />
          </div>
          {error && (
            <div style={{ background:"#FDECEA", color:"#C0392B", padding:"10px 12px",
              borderRadius:8, fontSize:13, marginBottom:16 }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary btn-lg" type="submit" disabled={cargando}>
            {cargando ? t("login_cargando") : t("login_btn")}
          </button>
        </form>

        <p style={{ textAlign:"center", fontSize:12, color:"#9CA3AF", marginTop:20 }}>
          {t("login_ayuda")}
        </p>
      </div>
    </div>
  );
}
