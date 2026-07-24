// src/pages/Nominas.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { useLang } from "../lib/LanguageContext";
import { crearNotificacion } from "../lib/notificaciones";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const VACIA = { empleadoId:"", empleadoNombre:"", empresaId:"", empresaNombre:"", mes:"", anyo:new Date().getFullYear(), descripcion:"", linkDrive:"" };

export default function Nominas() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const { t } = useLang();
  const esAdmin = perfil?.rol==="admin" || perfil?.rol==="rrhh";

  const [nominas,       setNominas]       = useState([]);
  const [empleados,     setEmpleados]     = useState([]);
  const [empresas,      setEmpresas]      = useState([]);
  const [modal,         setModal]         = useState(false);
  const [form,          setForm]          = useState(VACIA);
  const [guardando,     setGuardando]     = useState(false);
  const [filtroEmp,     setFiltroEmp]     = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");

  useEffect(() => { cargar(); }, [perfil]);

  const cargar = async () => {
    if (!perfil) return;
    try {
      const q = esAdmin
        ? query(collection(db,"nominas"), orderBy("creadaEn","desc"))
        : query(collection(db,"nominas"), where("empleadoId","==",user.uid));
      const queries = [getDocs(q), getDocs(collection(db,"empresas"))];
      if (esAdmin) queries.push(getDocs(collection(db,"usuarios")));
      const results = await Promise.all(queries);
      const [nSnap, eSnap] = results;
      const uSnap = esAdmin ? results[2] : null;
      const nLista = nSnap.docs.map(d=>({id:d.id,...d.data()}));
      if (!esAdmin) nLista.sort((a,b)=>(b.creadaEn?.seconds||0)-(a.creadaEn?.seconds||0));
      setNominas(nLista);
      setEmpresas(eSnap.docs.map(d=>({id:d.id,...d.data()})));
      setEmpleados(uSnap ? uSnap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.rol!=="admin") : []);
    } catch(e) { console.error(e); showToast("Error cargando datos","error"); }
  };

  const empleadosFiltrados = form.empresaId ? empleados.filter(e=>e.empresaId===form.empresaId) : empleados;

  const onEmpresaModalChange = (empresaId) => {
    const empresa = empresas.find(e=>e.id===empresaId);
    setForm(f=>({...f, empresaId, empresaNombre:empresa?.nombre||"", empleadoId:"", empleadoNombre:""}));
  };

  const onEmpleadoChange = (uid) => {
    const emp=empleados.find(e=>e.id===uid);
    const empresa=empresas.find(e=>e.id===emp?.empresaId);
    setForm(f=>({...f, empleadoId:uid, empleadoNombre:emp?.nombre||"", empresaId:emp?.empresaId||f.empresaId, empresaNombre:empresa?.nombre||f.empresaNombre}));
  };

  const guardar = async () => {
    if (!form.empleadoId||!form.mes||!form.linkDrive) { showToast("Empleado, mes y link son obligatorios","error"); return; }
    if (!form.linkDrive.startsWith("http")) { showToast("El link debe ser una URL válida (https://...)","error"); return; }
    setGuardando(true);
    try {
      await addDoc(collection(db,"nominas"), {
        empleadoId:form.empleadoId, empleadoNombre:form.empleadoNombre,
        empresaId:form.empresaId, empresaNombre:form.empresaNombre,
        mes:form.mes, anyo:Number(form.anyo), descripcion:form.descripcion||"",
        linkDrive:form.linkDrive, creadaEn:Timestamp.now(), creadaPor:perfil.nombre,
      });
      await crearNotificacion({
        usuarioId:form.empleadoId, titulo:"Nueva nómina disponible 📄",
        mensaje:`Tu nómina de ${form.mes} ${form.anyo} ya está disponible en la sección Nóminas.`, tipo:"info",
      });
      showToast("Nómina añadida y empleado notificado","success");
      setModal(false); setForm(VACIA); cargar();
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setGuardando(false);
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta nómina?")) return;
    await deleteDoc(doc(db,"nominas",id));
    showToast("Nómina eliminada","success"); cargar();
  };

  let lista = nominas;
  if (filtroEmpresa) lista = lista.filter(n=>n.empresaId===filtroEmpresa);
  if (filtroEmp)     lista = lista.filter(n=>n.empleadoId===filtroEmp);
  const empleadosParaFiltro = filtroEmpresa ? empleados.filter(e=>e.empresaId===filtroEmpresa) : empleados;
  const porAnyo = lista.reduce((acc,n) => { const k=n.anyo||"—"; if (!acc[k]) acc[k]=[]; acc[k].push(n); return acc; }, {});

  return (
    <div>
      {ToastUI}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>{esAdmin?t("nom_titulo_admin"):t("nom_titulo_emp")}</h1>
        {esAdmin && <button className="btn btn-primary" onClick={()=>{ setForm(VACIA); setModal(true); }}>{t("nom_subir")}</button>}
      </div>

      {esAdmin && (
        <div className="card" style={{ marginBottom:16, padding:"14px 18px" }}>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
            <div>
              <label className="form-label" style={{ marginBottom:4 }}>{t("nom_empresa")}</label>
              <select className="form-input form-select" style={{ width:220 }}
                value={filtroEmpresa} onChange={e=>{ setFiltroEmpresa(e.target.value); setFiltroEmp(""); }}>
                <option value="">{t("nom_todas_emp")}</option>
                {empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ marginBottom:4 }}>{t("nom_empleado")}</label>
              <select className="form-input form-select" style={{ width:220 }}
                value={filtroEmp} onChange={e=>setFiltroEmp(e.target.value)}>
                <option value="">{t("nom_todos_emp")}</option>
                {empleadosParaFiltro.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <span className="badge badge-blue">{lista.length} {t("nom_count")}</span>
          </div>
        </div>
      )}

      {!esAdmin && (
        <div>
          {Object.keys(porAnyo).length===0 && (
            <div className="card" style={{ textAlign:"center", padding:40, color:"#9CA3AF" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
              <div style={{ fontSize:15 }}>{t("nom_vacia_titulo")}</div>
              <div style={{ fontSize:13, marginTop:6 }}>{t("nom_vacia_sub")}</div>
            </div>
          )}
          {Object.keys(porAnyo).sort((a,b)=>b-a).map(anyo=>(
            <div key={anyo} style={{ marginBottom:20 }}>
              <div style={{ fontWeight:600, fontSize:16, color:"#1B3A6B", marginBottom:10 }}>{anyo}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10 }}>
                {porAnyo[anyo].map(n=>(
                  <a key={n.id} href={n.linkDrive} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:10, padding:16, textAlign:"center", cursor:"pointer", transition:"box-shadow .15s" }}
                      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)"}
                      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                      <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
                      <div style={{ fontWeight:600, color:"#1B3A6B" }}>{n.mes}</div>
                      <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>{n.empresaNombre}</div>
                      {n.descripcion&&<div style={{ fontSize:11, color:"#9CA3AF", marginTop:2 }}>{n.descripcion}</div>}
                      <div style={{ background:"#EBF2FB", borderRadius:6, padding:"4px 8px", fontSize:12, color:"#2E5FA3", marginTop:8 }}>{t("nom_descargar")}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {esAdmin && (
        <div className="card">
          <table className="tabla">
            <thead>
              <tr>
                <th>{t("nom_empleado")}</th><th>{t("nom_empresa")}</th>
                <th>{t("nom_col_mes")}</th><th>{t("nom_col_anyo")}</th>
                <th>{t("nom_col_desc")}</th><th>{t("nom_col_acciones")}</th>
              </tr>
            </thead>
            <tbody>
              {lista.length===0 && (
                <tr><td colSpan={6} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>{t("nom_sin_datos")}</td></tr>
              )}
              {lista.map(n=>(
                <tr key={n.id}>
                  <td style={{ fontWeight:500 }}>{n.empleadoNombre}</td>
                  <td style={{ fontSize:13, color:"#6B7280" }}>{n.empresaNombre}</td>
                  <td>{n.mes}</td><td>{n.anyo}</td>
                  <td style={{ fontSize:13, color:"#6B7280" }}>{n.descripcion||"—"}</td>
                  <td>
                    <div style={{ display:"flex", gap:6 }}>
                      <a href={n.linkDrive} target="_blank" rel="noopener noreferrer">
                        <button className="btn btn-primary" style={{ padding:"4px 9px", fontSize:12 }}>{t("nom_ver")}</button>
                      </a>
                      <button className="btn btn-red" style={{ padding:"4px 9px", fontSize:12 }} onClick={()=>eliminar(n.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal&&esAdmin&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{t("nom_modal_titulo")}</div>
            <div className="form-group">
              <label className="form-label">{t("nom_empresa_label")}</label>
              <select className="form-input form-select" value={form.empresaId} onChange={e=>onEmpresaModalChange(e.target.value)}>
                <option value="">{t("nom_empresa_sel")}</option>
                {empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t("nom_empleado_label")}</label>
              <select className="form-input form-select" value={form.empleadoId} onChange={e=>onEmpleadoChange(e.target.value)} disabled={!form.empresaId}>
                <option value="">{form.empresaId?t("nom_empleado_sel"):t("nom_empleado_primero")}</option>
                {empleadosFiltrados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div className="form-group">
                <label className="form-label">{t("nom_mes_label")}</label>
                <select className="form-input form-select" value={form.mes} onChange={e=>setForm({...form,mes:e.target.value})}>
                  <option value="">{t("nom_mes_sel")}</option>
                  {MESES.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("nom_anyo_label")}</label>
                <input className="form-input" type="number" value={form.anyo} onChange={e=>setForm({...form,anyo:e.target.value})} min={2020} max={2035} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t("nom_link_label")}</label>
              <input className="form-input" type="url" value={form.linkDrive} onChange={e=>setForm({...form,linkDrive:e.target.value})} placeholder="https://drive.google.com/file/d/..." />
              <small style={{ color:"#9CA3AF", fontSize:12, display:"block", marginTop:4 }}>{t("nom_link_hint")}</small>
            </div>
            <div className="form-group">
              <label className="form-label">{t("nom_desc_label")}</label>
              <input className="form-input" value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder={t("nom_desc_ph")} />
            </div>
            <div style={{ background:"#E1F5EE", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#0F6E56", marginBottom:16 }}>
              {t("nom_aviso")}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>{t("cancelar")}</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando?t("nom_guardando"):t("nom_guardar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
