// src/pages/Empresas.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useToast } from "../hooks/useToast";
import { useLang } from "../lib/LanguageContext";

const VACIA = { nombre:"", cif:"", domicilio:"", convenio:"", contacto:"" };

export default function Empresas() {
  const { showToast, ToastUI } = useToast();
  const { t } = useLang();
  const [empresas,  setEmpresas]  = useState([]);
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState(VACIA);
  const [editId,    setEditId]    = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    const snap = await getDocs(collection(db,"empresas"));
    setEmpresas(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  };

  const abrir = (empresa) => {
    if (empresa) { setForm(empresa); setEditId(empresa.id); }
    else         { setForm(VACIA);   setEditId(null); }
    setModal(true);
  };

  const guardar = async () => {
    if (!form.nombre || !form.cif) { showToast("Nombre y CIF son obligatorios","error"); return; }
    setGuardando(true);
    try {
      const datos = { nombre:form.nombre, cif:form.cif, domicilio:form.domicilio,
                      convenio:form.convenio, contacto:form.contacto };
      if (editId) await updateDoc(doc(db,"empresas",editId), datos);
      else        await addDoc(collection(db,"empresas"), datos);
      showToast(editId ? "Empresa actualizada" : "Empresa creada","success");
      setModal(false); cargar();
    } catch { showToast("Error al guardar","error"); }
    setGuardando(false);
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta empresa?")) return;
    await deleteDoc(doc(db,"empresas",id));
    showToast("Empresa eliminada","success"); cargar();
  };

  const campos = [
    { key:"nombre",    label:t("emp2_f_nombre"),   ph:"Distribuciones López S.L." },
    { key:"cif",       label:t("emp2_f_cif"),       ph:"B-12345678" },
    { key:"domicilio", label:t("emp2_f_domicilio"), ph:"Calle Gran Vía 45, Madrid" },
    { key:"convenio",  label:t("emp2_f_convenio"),  ph:"Comercio, Hostelería..." },
    { key:"contacto",  label:t("emp2_f_contacto"),  ph:"rrhh@empresa.com" },
  ];

  return (
    <div>
      {ToastUI}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>{t("emp2_titulo")}</h1>
        <button className="btn btn-primary" onClick={()=>abrir(null)}>{t("emp2_nueva")}</button>
      </div>

      <div className="card">
        <table className="tabla">
          <thead>
            <tr>
              <th>{t("emp2_col_nombre")}</th><th>{t("emp2_col_cif")}</th>
              <th>{t("emp2_col_convenio")}</th><th>{t("emp2_col_contacto")}</th>
              <th>{t("emp2_col_acciones")}</th>
            </tr>
          </thead>
          <tbody>
            {empresas.length===0 && (
              <tr><td colSpan={5} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                {t("emp2_sin")}
              </td></tr>
            )}
            {empresas.map(e => (
              <tr key={e.id}>
                <td style={{ fontWeight:600 }}>{e.nombre}</td>
                <td style={{ fontFamily:"monospace" }}>{e.cif}</td>
                <td>{e.convenio||"—"}</td>
                <td>{e.contacto||"—"}</td>
                <td style={{ display:"flex", gap:8 }}>
                  <button className="btn" style={{ padding:"5px 10px", fontSize:13 }} onClick={()=>abrir(e)}>{t("editar")}</button>
                  <button className="btn btn-red" style={{ padding:"5px 10px", fontSize:13 }} onClick={()=>eliminar(e.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{editId ? t("emp2_modal_editar") : t("emp2_modal_nueva")}</div>
            {campos.map(f => (
              <div className="form-group" key={f.key}>
                <label className="form-label">{f.label}</label>
                <input className="form-input" placeholder={f.ph}
                  value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} />
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>{t("cancelar")}</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? t("guardando") : t("emp2_guardar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
