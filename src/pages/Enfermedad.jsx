// src/pages/Enfermedad.jsx
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

const TIPOS = ["Baja médica","Cita médica","Enfermedad sin baja","Accidente laboral","Otro"];
const ESTADOS = {
  reportada:  { label:"Reportada",  clase:"badge-amber" },
  confirmada: { label:"Confirmada", clase:"badge-blue"  },
  resuelta:   { label:"Resuelta",   clase:"badge-green" },
};
const VACIA = { empleadoId:"", empleadoNombre:"", empresaId:"", empresaNombre:"",
  fechaInicio:"", fechaFin:"", tipo:"Baja médica", descripcion:"", estado:"reportada" };

export default function Enfermedad() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const esAdmin = perfil?.rol === "admin" || perfil?.rol === "rrhh";

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
      // Sin orderBy compuesto para empleado — evita índice
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
    setForm(f=>({...f,empleadoId:uid,empleadoNombre:emp?.nombre||"",
      empresaId:emp?.empresaId||"",empresaNombre:empresa?.nombre||""}));
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
      if (editId) {
        await updateDoc(doc(db,"enfermedades",editId),datos);
        showToast("Registro actualizado","success");
      } else {
        await addDoc(collection(db,"enfermedades"),datos);
        showToast("Ausencia reportada correctamente","success");
        // Notificar a todos los admins
        await Promise.all(admins.map(a=>crearNotificacion({
          usuarioId:a.id,
          titulo:"Nueva ausencia por enfermedad 🏥",
          mensaje:`${perfil.nombre} ha reportado una ausencia: ${form.tipo} desde el ${form.fechaInicio}.`,
          tipo:"warning",
        })));
      }
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
        ?`Tu ausencia por ${baja.tipo} desde el ${baja.fechaInicio} ha sido confirmada. No necesitas fichar durante este período.`
        :`Tu ausencia por ${baja.tipo} ha sido marcada como resuelta. Ya puedes fichar normalmente.`,
      tipo:"info",
    });
    showToast(`Baja ${estado}`,"success");
    cargar();
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Enfermedad y ausencias</h1>
          {reportadas>0&&esAdmin&&<span style={{fontSize:13,color:"#BA7517"}}>⚠ {reportadas} ausencia{reportadas>1?"s":""} por revisar</span>}
        </div>
        <button className="btn btn-primary" onClick={()=>abrir(null)}>+ Reportar ausencia</button>
      </div>
      <div className="card">
        <table className="tabla">
          <thead>
            <tr><th>Empleado</th>{esAdmin&&<th>Empresa</th>}<th>Tipo</th><th>Desde</th><th>Hasta</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {bajas.length===0&&<tr><td colSpan={esAdmin?7:6} style={{textAlign:"center",color:"#9CA3AF",padding:24}}>Sin registros</td></tr>}
            {bajas.map(b=>(
              <tr key={b.id}>
                <td style={{fontWeight:500}}>{b.empleadoNombre}</td>
                {esAdmin&&<td style={{fontSize:13,color:"#6B7280"}}>{b.empresaNombre}</td>}
                <td style={{fontSize:13}}>{b.tipo}</td>
                <td>{b.fechaInicio}</td><td>{b.fechaFin||"—"}</td>
                <td><span className={`badge ${ESTADOS[b.estado]?.clase||"badge-gray"}`}>{ESTADOS[b.estado]?.label||b.estado}</span></td>
                <td>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn" style={{padding:"4px 9px",fontSize:12}} onClick={()=>abrir(b)}>{esAdmin?"✏ Editar":"Ver"}</button>
                    {esAdmin&&b.estado==="reportada"&&<button className="btn btn-primary" style={{padding:"4px 9px",fontSize:12}} onClick={()=>cambiarEstado(b,"confirmada")}>Confirmar</button>}
                    {esAdmin&&b.estado==="confirmada"&&<button className="btn btn-green" style={{padding:"4px 9px",fontSize:12}} onClick={()=>cambiarEstado(b,"resuelta")}>Resolver</button>}
                    {esAdmin&&<button className="btn btn-red" style={{padding:"4px 9px",fontSize:12}} onClick={()=>eliminar(b.id)}>🗑</button>}
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
            <div className="modal-title">{editId?"Editar ausencia":"Reportar ausencia por enfermedad"}</div>
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
            <div className="form-group">
              <label className="form-label">Tipo de ausencia *</label>
              <select className="form-input form-select" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
                {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div className="form-group">
                <label className="form-label">Fecha inicio *</label>
                <input className="form-input" type="date" value={form.fechaInicio}
                  onChange={e=>setForm({...form,fechaInicio:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha fin (si se conoce)</label>
                <input className="form-input" type="date" value={form.fechaFin}
                  onChange={e=>setForm({...form,fechaFin:e.target.value})}/>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea className="form-input" rows={2} value={form.descripcion}
                onChange={e=>setForm({...form,descripcion:e.target.value})}
                placeholder="Detalles adicionales..." style={{resize:"vertical"}}/>
            </div>
            {esAdmin&&(
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-input form-select" value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})}>
                  <option value="reportada">Reportada</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="resuelta">Resuelta</option>
                </select>
              </div>
            )}
            <div style={{background:"#EBF2FB",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#2E5FA3",marginBottom:16}}>
              ℹ Durante el período de ausencia confirmada no será necesario fichar.
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
