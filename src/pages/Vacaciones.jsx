// src/pages/Vacaciones.jsx
import React, { useEffect, useState } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, Timestamp, where
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { crearNotificacion } from "../lib/notificaciones";
import { format } from "date-fns";

const ESTADOS = {
  pendiente: { label:"Pendiente",  clase:"badge-amber" },
  aprobada:  { label:"Aprobada",   clase:"badge-green" },
  rechazada: { label:"Rechazada",  clase:"badge-red"   },
};
const VACIA = { empleadoId:"", empleadoNombre:"", empresaId:"", empresaNombre:"",
  fechaInicio:"", fechaFin:"", dias:0, motivo:"", estado:"pendiente" };

export default function Vacaciones() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const esAdmin = perfil?.rol === "admin" || perfil?.rol === "rrhh";

  const [solicitudes, setSolicitudes] = useState([]);
  const [empleados,   setEmpleados]   = useState([]);
  const [empresas,    setEmpresas]    = useState([]);
  const [admins,      setAdmins]      = useState([]);
  const [modal,       setModal]       = useState(false);
  const [form,        setForm]        = useState(VACIA);
  const [editId,      setEditId]      = useState(null);
  const [guardando,   setGuardando]   = useState(false);
  const [filtro,      setFiltro]      = useState("");

  useEffect(() => { cargar(); }, [perfil]);

  const cargar = async () => {
    if (!perfil) return;
    try {
      // Empleado: sin orderBy compuesto para evitar índice
      const q = esAdmin
        ? query(collection(db,"vacaciones"), orderBy("creadaEn","desc"))
        : query(collection(db,"vacaciones"), where("empleadoId","==",user.uid));
      const queries = [getDocs(q), getDocs(collection(db,"empresas"))];
      if (esAdmin) queries.push(getDocs(collection(db,"usuarios")));
      const results = await Promise.all(queries);
      const [vSnap, eSnap] = results;
      const uSnap = esAdmin ? results[2] : null;
      const vLista = vSnap.docs.map(d=>({id:d.id,...d.data()}));
      if (!esAdmin) vLista.sort((a,b)=>(b.creadaEn?.seconds||0)-(a.creadaEn?.seconds||0));
      setSolicitudes(vLista);
      setEmpresas(eSnap.docs.map(d=>({id:d.id,...d.data()})));
      const usuarios = uSnap ? uSnap.docs.map(d=>({id:d.id,...d.data()})) : [];
      setEmpleados(usuarios.filter(u=>u.rol!=="admin"));
      setAdmins(usuarios.filter(u=>u.rol==="admin"||u.rol==="rrhh"));
    } catch(e) { console.error(e); showToast("Error cargando datos","error"); }
  };

  const calcularDias = (ini,fin) => {
    if (!ini||!fin) return 0;
    const d1=new Date(ini), d2=new Date(fin);
    if (d2<d1) return 0;
    return Math.round((d2-d1)/(1000*60*60*24))+1;
  };

  const abrir = (sol) => {
    if (sol) { setForm({...sol}); setEditId(sol.id); }
    else {
      const f={...VACIA};
      if (!esAdmin) {
        f.empleadoId=user.uid; f.empleadoNombre=perfil.nombre;
        f.empresaId=perfil.empresaId;
        f.empresaNombre=empresas.find(e=>e.id===perfil.empresaId)?.nombre||"";
      }
      f.fechaInicio=format(new Date(),"yyyy-MM-dd");
      f.fechaFin=format(new Date(),"yyyy-MM-dd");
      setForm(f); setEditId(null);
    }
    setModal(true);
  };

  const onEmpleadoChange = (uid) => {
    const emp=empleados.find(e=>e.id===uid);
    const empresa=empresas.find(e=>e.id===emp?.empresaId);
    setForm(f=>({...f,empleadoId:uid,empleadoNombre:emp?.nombre||"",
      empresaId:emp?.empresaId||"",empresaNombre:empresa?.nombre||""}));
  };

  const guardar = async () => {
    if (!form.empleadoId||!form.fechaInicio||!form.fechaFin) {
      showToast("Empleado y fechas son obligatorios","error"); return;
    }
    const dias=calcularDias(form.fechaInicio,form.fechaFin);
    if (dias<=0) { showToast("La fecha fin debe ser posterior al inicio","error"); return; }
    setGuardando(true);
    try {
      const datos = {
        empleadoId:form.empleadoId, empleadoNombre:form.empleadoNombre,
        empresaId:form.empresaId, empresaNombre:form.empresaNombre,
        fechaInicio:form.fechaInicio, fechaFin:form.fechaFin, dias,
        motivo:form.motivo||"", estado:esAdmin?(form.estado||"pendiente"):"pendiente",
        creadaEn:editId?form.creadaEn:Timestamp.now(),
        creadaPor:editId?form.creadaPor:perfil.nombre,
      };
      if (editId) {
        await updateDoc(doc(db,"vacaciones",editId),datos);
        showToast("Solicitud actualizada","success");
      } else {
        await addDoc(collection(db,"vacaciones"),datos);
        showToast("Solicitud enviada correctamente","success");
        // Notificar a todos los admins
        await Promise.all(admins.map(a=>crearNotificacion({
          usuarioId:a.id,
          titulo:"Nueva solicitud de vacaciones 🏖️",
          mensaje:`${perfil.nombre} ha solicitado vacaciones del ${form.fechaInicio} al ${form.fechaFin} (${dias} días).`,
          tipo:"warning",
        })));
      }
      setModal(false); cargar();
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setGuardando(false);
  };

  const cambiarEstado = async (sol,estado) => {
    await updateDoc(doc(db,"vacaciones",sol.id),{estado,actualizadaEn:Timestamp.now()});
    await crearNotificacion({
      usuarioId:sol.empleadoId,
      titulo:`Vacaciones ${estado==="aprobada"?"aprobadas ✓":"rechazadas ✗"}`,
      mensaje:estado==="aprobada"
        ?`Tus vacaciones del ${sol.fechaInicio} al ${sol.fechaFin} (${sol.dias} días) han sido aprobadas.`
        :`Tu solicitud de vacaciones del ${sol.fechaInicio} al ${sol.fechaFin} ha sido rechazada.`,
      tipo:estado==="aprobada"?"success":"error",
    });
    showToast(`Vacaciones ${estado}`,"success");
    cargar();
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta solicitud?")) return;
    await deleteDoc(doc(db,"vacaciones",id));
    showToast("Solicitud eliminada","success"); cargar();
  };

  const lista=filtro?solicitudes.filter(s=>s.estado===filtro):solicitudes;
  const pendientes=solicitudes.filter(s=>s.estado==="pendiente").length;

  return (
    <div>
      {ToastUI}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Vacaciones</h1>
          {pendientes>0&&esAdmin&&<span style={{fontSize:13,color:"#BA7517"}}>⚠ {pendientes} solicitud{pendientes>1?"es":""} pendiente{pendientes>1?"s":""}</span>}
        </div>
        <div style={{display:"flex",gap:10}}>
          <select className="form-input form-select" style={{width:"auto"}}
            value={filtro} onChange={e=>setFiltro(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
          </select>
          <button className="btn btn-primary" onClick={()=>abrir(null)}>+ Solicitar vacaciones</button>
        </div>
      </div>
      <div className="card">
        <table className="tabla">
          <thead>
            <tr><th>Empleado</th>{esAdmin&&<th>Empresa</th>}<th>Desde</th><th>Hasta</th><th>Días</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {lista.length===0&&<tr><td colSpan={esAdmin?7:6} style={{textAlign:"center",color:"#9CA3AF",padding:24}}>No hay solicitudes</td></tr>}
            {lista.map(s=>(
              <tr key={s.id}>
                <td style={{fontWeight:500}}>{s.empleadoNombre}</td>
                {esAdmin&&<td style={{fontSize:13,color:"#6B7280"}}>{s.empresaNombre}</td>}
                <td>{s.fechaInicio}</td><td>{s.fechaFin}</td>
                <td><span className="badge badge-blue">{s.dias}d</span></td>
                <td><span className={`badge ${ESTADOS[s.estado]?.clase||"badge-gray"}`}>{ESTADOS[s.estado]?.label||s.estado}</span></td>
                <td>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn" style={{padding:"4px 9px",fontSize:12}} onClick={()=>abrir(s)}>{esAdmin?"✏ Editar":"Ver"}</button>
                    {esAdmin&&s.estado==="pendiente"&&<>
                      <button className="btn btn-green" style={{padding:"4px 9px",fontSize:12}} onClick={()=>cambiarEstado(s,"aprobada")}>✓</button>
                      <button className="btn btn-red" style={{padding:"4px 9px",fontSize:12}} onClick={()=>cambiarEstado(s,"rechazada")}>✗</button>
                    </>}
                    {esAdmin&&<button className="btn btn-red" style={{padding:"4px 9px",fontSize:12}} onClick={()=>eliminar(s.id)}>🗑</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{editId?"Editar solicitud":"Nueva solicitud de vacaciones"}</div>
            {esAdmin?(
              <div className="form-group">
                <label className="form-label">Empleado *</label>
                <select className="form-input form-select" value={form.empleadoId} onChange={e=>onEmpleadoChange(e.target.value)}>
                  <option value="">Selecciona empleado...</option>
                  {empleados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            ):(
              <div className="form-group">
                <label className="form-label">Empleado</label>
                <input className="form-input" value={perfil.nombre} disabled style={{background:"#F9F9F9",color:"#9CA3AF"}}/>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div className="form-group">
                <label className="form-label">Fecha inicio *</label>
                <input className="form-input" type="date" value={form.fechaInicio}
                  onChange={e=>setForm({...form,fechaInicio:e.target.value,dias:calcularDias(e.target.value,form.fechaFin)})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha fin *</label>
                <input className="form-input" type="date" value={form.fechaFin}
                  onChange={e=>setForm({...form,fechaFin:e.target.value,dias:calcularDias(form.fechaInicio,e.target.value)})}/>
              </div>
            </div>
            {form.fechaInicio&&form.fechaFin&&(
              <div style={{background:"#EBF2FB",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:13,color:"#2E5FA3"}}>
                📅 {calcularDias(form.fechaInicio,form.fechaFin)} días naturales
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Motivo (opcional)</label>
              <textarea className="form-input" rows={2} value={form.motivo}
                onChange={e=>setForm({...form,motivo:e.target.value})}
                placeholder="Vacaciones de verano, asunto personal..." style={{resize:"vertical"}}/>
            </div>
            {esAdmin&&(
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-input form-select" value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})}>
                  <option value="pendiente">Pendiente</option>
                  <option value="aprobada">Aprobada</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Enviar solicitud"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
