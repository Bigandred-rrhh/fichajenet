// src/pages/Login.jsx
import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LanguageContext";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

export default function Login() {
  const { login } = useAuth();
  const { t } = useLang();
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [error, setError]               = useState("");
  const [cargando, setCargando]         = useState(false);
  const [modoReset, setModoReset]       = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

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

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email) { setError("Introduce tu email primero."); return; }
    setError("");
    setCargando(true);
    try {
      await sendPasswordResetEmail(getAuth(), email);
      setResetEnviado(true);
    } catch (err) {
      setError("No se encontro ninguna cuenta con ese email.");
    }
    setCargando(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <h1>FichajeNet</h1>
          <p>{t("login_subtitulo")}</p>
        </div>

        {modoReset ? (
          resetEnviado ? (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📧</div>
              <p style={{ fontWeight:600, marginBottom:8 }}>Email enviado</p>
              <p style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>
                Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contrasena.
              </p>
              <button className="btn btn-primary btn-lg" onClick={() => { setModoReset(false); setResetEnviado(false); }}>
                Volver al inicio de sesion
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset}>
              <p style={{ fontSize:13, color:"#6B7280", marginBottom:16 }}>
                Introduce tu email y te enviaremos un enlace para restablecer tu contrasena.
              </p>
              <div className="form-group">
                <label className="form-label">{t("login_email")}</label>
                <input
                  className="form-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@empresa.com" required autoComplete="email"
                />
              </div>
              {error && (
                <div style={{ background:"#FDECEA", color:"#C0392B", padding:"10px 12px",
                  borderRadius:8, fontSize:13, marginBottom:16 }}>
                  {error}
                </div>
              )}
              <button className="btn btn-primary btn-lg" type="submit" disabled={cargando} style={{ marginBottom:12 }}>
                {cargando ? "Enviando..." : "Enviar enlace"}
              </button>
              <button type="button" className="btn btn-lg" onClick={() => { setModoReset(false); setError(""); }}>
                Cancelar
              </button>
            </form>
          )
        ) : (
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
            <button className="btn btn-primary btn-lg" type="submit" disabled={cargando} style={{ marginBottom:12 }}>
              {cargando ? t("login_cargando") : t("login_btn")}
            </button>
            <button
              type="button"
              onClick={() => { setModoReset(true); setError(""); }}
              style={{ background:"none", border:"none", cursor:"pointer",
                width:"100%", textAlign:"center", fontSize:13,
                color:"#2E5FA3", marginTop:4 }}
            >
              Olvidaste tu contrasena?
            </button>
          </form>
        )}

        <p style={{ textAlign:"center", fontSize:12, color:"#9CA3AF", marginTop:20 }}>
          {t("login_ayuda")}
        </p>
      </div>
    </div>
  );
}