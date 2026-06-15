// src/pages/Incidencias.jsx
import React, { useEffect, useState } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, Timestamp, where
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { format } from "date-fns";
import { notificarAdmins } from "../lib/notificarAdmins";
import { crearNotificacion } from "../lib/notificaciones";

const TIPOS = [
  "Olvido de fichaje de entrada",
  "Olvido de fichaje de salida",
  "Error en la hora fichada",
  "Ausencia justificada",
  "Baja médica",
  "Vacaciones",
  "Otro"
];

const ESTADOS = {
  pendiente: { label:"Pendiente",  clase:"badge-amber" },
  aprobada:  { label:"Aprobada",   clase:"badge-green" },
  rechazada: { label:"Rechazada",  clase:"badge-red"   },
};

const VACIA = {
  empleadoId:"", empleadoNombre:"", empresaId:"", empresaNombre:"",
  tipo:"Olvido de fichaje de entrada", fecha:"", horaCorrecta:"",
  descripcion:"", estado:"pendiente"
};

export default function Incidencias() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const esAdmin = perfil?.rol === "admin" || perfil?.rol === "rrhh";

  const [incidencias,  setIncidencias]  = useState([]);
  const [empleados,    setEmpleados]    = useState([]);
  const [empresas,     setEmpresas]     = useState([]);
  const [modal,        setModal]        = useState(false);
  const [form,         setForm]         = useState(VACIA);
  const [editId,       setEditId]       = useState(null);
  const [guardando,    setGuardando]    = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");

  useEffect(() => { cargar(); }, [perfil]);

  const cargar = async () => {
    if (!perfil) return;
    try {
      const q = esAdmin
        ? query(collection(db, "incidencias"), orderBy("creadaEn", "desc"))
        : query(collection(db, "incidencias"), where("empleadoId", "==", user.uid));
      const queries = [getDocs(q), getDocs(collection(db, "empresas"))];
      if (esAdmin) queries.push(getDocs(collection(db, "usuarios")));
      const results = await Promise.all(queries);
      const [incSnap, empSnap] = results;
      const uSnap = esAdmin ? results[2] : null;
      let lista = incSnap.docs.map(d => ({ id:d.id, ...d.data() }));
      if (!esAdmin) lista.sort((a,b) => (b.creadaEn?.seconds||0) - (a.creadaEn?.seconds||0));
      setIncidencias(lista);
      setEmpresas(empSnap.docs.map(d => ({ id:d.id, ...d.data() })));
      const usuarios = uSnap ? uSnap.docs.map(d => ({ id:d.id, ...d.data() })) : [];
      setEmpleados(usuarios.filter(u => u.rol !== "admin"));
    } catch(e) { console.error(e); showToast("Error cargando incidencias","error"); }
  };

  const abrir = (inc) => {
    if (inc) { setForm({...inc}); setEditId(inc.id); }
    else {
      const f = {...VACIA};
      if (!esAdmin) {
        f.empleadoId     = user.uid;
        f.empleadoNombre = perfil.nombre;
        f.empresaId      = perfil.empresaId;
        f.empresaNombre  = empresas.find(e => e.id === perfil.empresaId)?.nombre || "";
      }
      f.fecha = format(new Date(), "yyyy-MM-dd");
      setForm(f); setEditId(null);
    }
    setModal(true);
  };

  const onEmpleadoChange = (uid) => {
    const emp     = empleados.find(e => e.id === uid);
    const empresa = empresas.find(e => e.id === emp?.empresaId);
    setForm(f => ({
      ...f, empleadoId:uid, empleadoNombre:emp?.nombre||"",
      empresaId:emp?.empresaId||"", empresaNombre:empresa?.nombre||""
    }));
  };

  const guardar = async () => {
    if (!form.empleadoId || !form.fecha || !form.tipo) {
      showToast("Empleado, fecha y tipo son obligatorios","error"); return;
    }
    setGuardando(true);
    try {
      const datos = {
        empleadoId:form.empleadoId, empleadoNombre:form.empleadoNombre,
        empresaId:form.empresaId, empresaNombre:form.empresaNombre,
        tipo:form.tipo, fecha:form.fecha, horaCorrecta:form.horaCorrecta||"",
        descripcion:form.descripcion||"",
        estado:esAdmin ? (form.estado||"pendiente") : "pendiente",
        creadaEn:editId ? form.creadaEn : Timestamp.now(),
        creadaPor:editId ? form.creadaPor : perfil.nombre,
        actualizadaEn:Timestamp.now(),
      };
      if (editId) {
        await updateDoc(doc(db,"incidencias",editId), datos);
        showToast("Incidencia actualizada","success");
      } else {
        await addDoc(collection(db,"incidencias"), datos);
        showToast("Incidencia registrada","success");
        
        if (!esAdmin) {
          await notificarAdmins({
            titulo: "Nueva incidencia registrada ⚠️",
            mensaje: perfil.nombre + " ha registrado una incidencia: " + form.tipo + " el " + form.fecha + ".",
            tipo: "warning"
          });
        }
      }
      setModal(false); cargar();
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setGuardando(false);
  };

  const cambiarEstado = async (inc, estado) => {
    await updateDoc(doc(db,"incidencias",inc.id), { estado, actualizadaEn:Timestamp.now() });
    await crearNotificacion({
      usuarioId: inc.empleadoId,
      titulo: `Incidencia ${estado === "aprobada" ? "aprobada ✓" : "rechazada ✗"}`,
      mensaje: `Tu incidencia "${inc.tipo}" del ${inc.fecha} ha sido ${estado}.`,
      tipo: estado === "aprobada" ? "success" : "error"
    });
    showToast(`Incidencia ${estado}`,"success");
    cargar();
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta incidencia?")) return;
    await deleteDoc(doc(db,"incidencias",id));
    showToast("Incidencia eliminada","success"); cargar();
  };

  const lista = filtroEstado
    ? incidencias.filter(i => i.estado === filtroEstado)
    : incidencias;

  const pendientes = incidencias.filter(i => i.estado === "pendiente").length;

  return (
    <div>
      {ToastUI}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Incidencias</h1>
          {pendientes > 0 && (
            <span style={{fontSize:13,color:"#BA7517"}}>⚠ {pendientes} pendiente{pendientes>1?"s":""}</span>
          )}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select className="form-input form-select" style={{width:"auto",fontSize:13}}
            value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
          </select>
          <button className="btn btn-primary" onClick={()=>abrir(null)} style={{fontSize:13}}>
            + Nueva incidencia
          </button>
        </div>
      </div>

      {/* Vista tarjetas */}
      {lista.length === 0 ? (
        <div className="card" style={{textAlign:"center",padding:32,color:"#9CA3AF"}}>
          No hay incidencias
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {lista.map(inc => (
            <div key={inc.id} className="card" style={{padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:15}}>{inc.empleadoNombre}</div>
                  {esAdmin && <div style={{fontSize:12,color:"#6B7280"}}>{inc.empresaNombre}</div>}
                  <div style={{fontSize:13,color:"#374151",marginTop:4}}>
                    {inc.tipo}
                  </div>
                  <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>
                    📅 {inc.fecha}
                    {inc.horaCorrecta && <span style={{marginLeft:8}}>🕐 {inc.horaCorrecta}</span>}
                  </div>
                  {inc.descripcion && (
                    <div style={{fontSize:12,color:"#9CA3AF",marginTop:4}}>{inc.descripcion}</div>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                  <span className={`badge ${ESTADOS[inc.estado]?.clase||"badge-gray"}`}>
                    {ESTADOS[inc.estado]?.label||inc.estado}
                  </span>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button className="btn" style={{padding:"4px 10px",fontSize:12}} onClick={()=>abrir(inc)}>
                      {esAdmin ? "✏ Editar" : "Ver"}
                    </button>
                    {esAdmin && inc.estado === "pendiente" && <>
                      <button className="btn btn-green" style={{padding:"4px 10px",fontSize:12}}
                        onClick={()=>cambiarEstado(inc,"aprobada")}>✓</button>
                      <button className="btn btn-red" style={{padding:"4px 10px",fontSize:12}}
                        onClick={()=>cambiarEstado(inc,"rechazada")}>✗</button>
                    </>}
                    {esAdmin && (
                      <button className="btn btn-red" style={{padding:"4px 10px",fontSize:12}}
                        onClick={()=>eliminar(inc.id)}>🗑</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
            <div className="modal-title">
              {editId ? "Editar incidencia" : "Nueva incidencia"}
            </div>

            {esAdmin ? (
              <div className="form-group">
                <label className="form-label">Empleado *</label>
                <select className="form-input form-select" value={form.empleadoId}
                  onChange={e=>onEmpleadoChange(e.target.value)}>
                  <option value="">Selecciona empleado...</option>
                  {empleados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Empleado</label>
                <input className="form-input" value={perfil.nombre} disabled
                  style={{background:"#F9F9F9",color:"#9CA3AF"}}/>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input className="form-input" type="date" value={form.fecha}
                  onChange={e=>setForm({...form,fecha:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">Hora correcta</label>
                <input className="form-input" type="time" value={form.horaCorrecta}
                  onChange={e=>setForm({...form,horaCorrecta:e.target.value})}/>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-input form-select" value={form.tipo}
                onChange={e=>setForm({...form,tipo:e.target.value})}>
                {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Descripción / Justificación</label>
              <textarea className="form-input" rows={3} value={form.descripcion}
                onChange={e=>setForm({...form,descripcion:e.target.value})}
                placeholder="Explica brevemente el motivo..."
                style={{resize:"vertical"}}/>
            </div>

            {esAdmin && (
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-input form-select" value={form.estado}
                  onChange={e=>setForm({...form,estado:e.target.value})}>
                  <option value="pendiente">Pendiente</option>
                  <option value="aprobada">Aprobada</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>
            )}

            {form.creadaPor && (
              <p style={{fontSize:12,color:"#9CA3AF",marginBottom:12}}>
                Registrada por: {form.creadaPor}
              </p>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar incidencia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
