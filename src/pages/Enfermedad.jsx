// src/pages/Enfermedad.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { useLang } from "../lib/LanguageContext";
import { crearNotificacion } from "../lib/notificaciones";
import { format } from "date-fns";

const TIPOS = ["Baja médica","Cita médica","Enfermedad sin baja","Accidente laboral","Otro"];
const VACIA = { empleadoId:"", empleadoNombre:"", empresaId:"", empresaNombre:"",
  fechaInicio:"", fechaFin:"", tipo:"Baja médica", descripcion:"", estado:"reportada" };

export default function Enfermedad() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const { t } = useLang();
  const esAdmin = perfil?.rol==="admin" || perfil?.rol==="rrhh";

  const ESTADOS = {
    reportada:  { label:t("enf_estado_reportada"),  clase:"badge-amber" },
    confirmada: { label:t("enf_estado_confirmada"), clase:"badge-blue"  },
    resuelta:   { label:t("enf_estado_resuelta"),   clase:"badge-green" },
  };

  const [bajas,     setBajas]     = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [empresas,  setEmpresas]  = useState([]);
  const [admins,    setAdmins]    = useState([]);
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState(VACIA);
  const [editId,    setEditId]    = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargar(); }, [perfil]);

  const cargar = async () => {
    if (!perfil) return;
    try {
      const q = esAdmin
        ? query(collection(db,"enfermedades"), orderBy("creadaEn","desc"))
        : query(collection(db,"enfermedades"), where("empleadoId","==",user.uid));
      const queries = [getDocs(q), getDocs(collection(db,"empresas"))];
      if (esAdmin) queries.push(getDocs(collection(db,"usuarios")));
      const results = await Promise.all(queries);
      const [bSnap, eSnap] = results;
      const uSnap = esAdmin ? results[2] : null;
      const bLista = bSnap.docs.map(d=>({id:d.id,...d.data()}));
      if (!esAdmin) bLista.sort((a,b)=>(b.creadaEn?.seconds||0)-(a.creadaEn?.seconds||0));
      setBajas(bLista);
      setEmpresas(eSnap.docs.map(d=>({id:d.id,...d.data()})));
      const usuarios = uSnap ? uSnap.docs.map(d=>({id:d.id,...d.data()})) : [];
      setEmpleados(usuarios.filter(u=>u.rol!=="admin"));
      setAdmins(usuarios.filter(u=>u.rol==="admin"||u.rol==="rrhh"));
    } catch(e) { console.error(e); showToast("Error cargando datos","error"); }
  };

  const abrir = (baja) => {
    if (baja) { setForm({...baja}); setEditId(baja.id); }
    else {
      const f={...VACIA};
      if (!esAdmin) {
        f.empleadoId=user.uid; f.empleadoNombre=perfil.nombre;
        f.empresaId=perfil.empresaId;
        f.empresaNombre=empresas.find(e=>e.id===perfil.empresaId)?.nombre||"";
      }
      f.fechaInicio=format(new Date(),"yyyy-MM-dd");
      setForm(f); setEditId(null);
    }
    setModal(true);
  };

  const onEmpleadoChange = (uid) => {
    const emp=empleados.find(e=>e.id===uid);
    const empresa=empresas.find(e=>e.id===emp?.empresaId);
    setForm(f=>({...f,empleadoId:uid,empleadoNombre:emp?.nombre||"",empresaId:emp?.empresaId||"",empresaNombre:empresa?.nombre||""}));
  };

  const guardar = async () => {
    if (!form.empleadoId||!form.fechaInicio||!form.tipo) {
      showToast("Empleado, fecha y tipo son obligatorios","error"); return;
    }
    setGuardando(true);
    try {
      const datos = {
        empleadoId:form.empleadoId, empleadoNombre:form.empleadoNombre,
        empresaId:form.empresaId, empresaNombre:form.empresaNombre,
        fechaInicio:form.fechaInicio, fechaFin:form.fechaFin||"",
        tipo:form.tipo, descripcion:form.descripcion||"",
        estado:esAdmin?(form.estado||"reportada"):"reportada",
        creadaEn:editId?form.creadaEn:Timestamp.now(),
        creadaPor:editId?form.creadaPor:perfil.nombre,
      };
      if (editId) { await updateDoc(doc(db,"enfermedades",editId),datos); showToast("Registro actualizado","success"); }
      else        { await addDoc(collection(db,"enfermedades"),datos);    showToast("Ausencia reportada correctamente","success"); }
      setModal(false); cargar();
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setGuardando(false);
  };

  const cambiarEstado = async (baja,estado) => {
    await updateDoc(doc(db,"enfermedades",baja.id),{estado,actualizadaEn:Timestamp.now()});
    await crearNotificacion({
      usuarioId:baja.empleadoId,
      titulo:`Ausencia ${estado==="confirmada"?"confirmada ✓":"resuelta ✓"}`,
      mensaje:estado==="confirmada"
        ?`Tu ausencia por ${baja.tipo} desde el ${baja.fechaInicio} ha sido confirmada. No necesitas fichar.`
        :`Tu ausencia por ${baja.tipo} ha sido resuelta. Ya puedes fichar normalmente.`,
      tipo:"info",
    });
    showToast(`Baja ${estado}`,"success"); cargar();
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar este registro?")) return;
    await deleteDoc(doc(db,"enfermedades",id));
    showToast("Registro eliminado","success"); cargar();
  };

  const reportadas = bajas.filter(b=>b.estado==="reportada").length;

  return (
    <div>
      {ToastUI}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>{t("enf_titulo")}</h1>
          {reportadas>0&&esAdmin&&<span style={{fontSize:13,color:"#BA7517"}}>⚠ {reportadas} {t("enf_por_revisar")}</span>}
        </div>
        <button className="btn btn-primary" onClick={()=>abrir(null)} style={{fontSize:13}}>{t("enf_reportar")}</button>
      </div>

      {bajas.length===0 ? (
        <div className="card" style={{textAlign:"center",padding:32,color:"#9CA3AF"}}>{t("enf_sin_datos")}</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {bajas.map(b=>(
            <div key={b.id} className="card" style={{padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:15}}>{b.empleadoNombre}</div>
                  {esAdmin&&<div style={{fontSize:12,color:"#6B7280"}}>{b.empresaNombre}</div>}
                  <div style={{fontSize:13,color:"#374151",marginTop:4}}>🏥 {b.tipo}</div>
                  <div style={{fontSize:13,color:"#6B7280",marginTop:2}}>{b.fechaInicio}{b.fechaFin?" → "+b.fechaFin:""}</div>
                  {b.descripcion&&<div style={{fontSize:12,color:"#9CA3AF",marginTop:2}}>{b.descripcion}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                  <span className={`badge ${ESTADOS[b.estado]?.clase||"badge-gray"}`}>{ESTADOS[b.estado]?.label||b.estado}</span>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button className="btn" style={{padding:"4px 10px",fontSize:12}} onClick={()=>abrir(b)}>
                      {esAdmin?t("editar"):t("ver")}
                    </button>
                    {esAdmin&&b.estado==="reportada"&&<button className="btn btn-primary" style={{padding:"4px 10px",fontSize:12}} onClick={()=>cambiarEstado(b,"confirmada")}>{t("enf_confirmar")}</button>}
                    {esAdmin&&b.estado==="confirmada"&&<button className="btn btn-green"   style={{padding:"4px 10px",fontSize:12}} onClick={()=>cambiarEstado(b,"resuelta")}>{t("enf_resolver")}</button>}
                    {esAdmin&&<button className="btn btn-red" style={{padding:"4px 10px",fontSize:12}} onClick={()=>eliminar(b.id)}>🗑</button>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{editId?t("enf_modal_editar"):t("enf_modal_nueva")}</div>
            {esAdmin?(
              <div className="form-group">
                <label className="form-label">{t("enf_empleado")}</label>
                <select className="form-input form-select" value={form.empleadoId} onChange={e=>onEmpleadoChange(e.target.value)}>
                  <option value="">{t("enf_empleado_sel")}</option>
                  {empleados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            ):(
              <div className="form-group">
                <label className="form-label">{t("enf_empleado")}</label>
                <input className="form-input" value={perfil.nombre} disabled style={{background:"#F9F9F9",color:"#9CA3AF"}}/>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{t("enf_tipo")}</label>
              <select className="form-input form-select" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
                {TIPOS.map(tp=><option key={tp} value={tp}>{tp}</option>)}
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div className="form-group">
                <label className="form-label">{t("enf_fecha_inicio")}</label>
                <input className="form-input" type="date" value={form.fechaInicio} onChange={e=>setForm({...form,fechaInicio:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">{t("enf_fecha_fin")}</label>
                <input className="form-input" type="date" value={form.fechaFin} onChange={e=>setForm({...form,fechaFin:e.target.value})}/>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t("enf_descripcion")}</label>
              <textarea className="form-input" rows={2} value={form.descripcion}
                onChange={e=>setForm({...form,descripcion:e.target.value})}
                placeholder={t("enf_desc_ph")} style={{resize:"vertical"}}/>
            </div>
            {esAdmin&&(
              <div className="form-group">
                <label className="form-label">{t("enf_estado")}</label>
                <select className="form-input form-select" value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})}>
                  <option value="reportada">{t("enf_estado_reportada")}</option>
                  <option value="confirmada">{t("enf_estado_confirmada")}</option>
                  <option value="resuelta">{t("enf_estado_resuelta")}</option>
                </select>
              </div>
            )}
            <div style={{background:"#EBF2FB",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#2E5FA3",marginBottom:16}}>
              {t("enf_info")}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>{t("cancelar")}</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando?t("enf_guardando"):t("enf_guardar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
