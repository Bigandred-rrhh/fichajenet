// src/pages/CambiarPassword.jsx
import React, { useState } from "react";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { useLang } from "../lib/LanguageContext";

export default function CambiarPassword() {
  const { perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const { t } = useLang();
  const [actual,    setActual]    = useState("");
  const [nueva,     setNueva]     = useState("");
  const [repetir,   setRepetir]   = useState("");
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (nueva !== repetir) { showToast("Las contraseñas no coinciden","error"); return; }
    if (nueva.length < 6)  { showToast("Mínimo 6 caracteres","error"); return; }
    setGuardando(true);
    try {
      const user = auth.currentUser;
      const cred = EmailAuthProvider.credential(user.email, actual);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, nueva);
      showToast("Contraseña actualizada correctamente","success");
      setActual(""); setNueva(""); setRepetir("");
    } catch(err) {
      if (err.code==="auth/wrong-password" || err.code==="auth/invalid-credential")
        showToast("La contraseña actual es incorrecta","error");
      else
        showToast("Error: "+err.message,"error");
    }
    setGuardando(false);
  };

  return (
    <div style={{ maxWidth:440 }}>
      {ToastUI}
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:20 }}>{t("pwd_titulo")}</h1>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t("pwd_actual")}</label>
            <input className="form-input" type="password" value={actual}
              onChange={e=>setActual(e.target.value)} required placeholder={t("pwd_ph_actual")} />
          </div>
          <div className="form-group">
            <label className="form-label">{t("pwd_nueva")}</label>
            <input className="form-input" type="password" value={nueva}
              onChange={e=>setNueva(e.target.value)} required placeholder={t("pwd_ph_nueva")} />
          </div>
          <div className="form-group">
            <label className="form-label">{t("pwd_repetir")}</label>
            <input className="form-input" type="password" value={repetir}
              onChange={e=>setRepetir(e.target.value)} required placeholder={t("pwd_ph_repetir")} />
          </div>
          <button className="btn btn-primary btn-lg" type="submit" disabled={guardando}>
            {guardando ? t("pwd_guardando") : t("pwd_btn")}
          </button>
        </form>
      </div>
      <div style={{ marginTop:16, padding:"12px 16px", background:"#FFF3CD",
        borderRadius:8, fontSize:13, color:"#633806" }}>
        {t("pwd_aviso")}
      </div>
    </div>
  );
}
