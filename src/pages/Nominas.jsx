// src/pages/Nominas.jsx
import React, { useEffect, useState } from "react";
import {
  collection, getDocs, addDoc, deleteDoc,
  doc, query, orderBy, Timestamp, where
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { crearNotificacion } from "../lib/notificaciones";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const VACIA = { empleadoId:"", empleadoNombre:"", empresaId:"", empresaNombre:"",
  mes:"", anyo: new Date().getFullYear(), descripcion:"", linkDrive:"" };

export default function Nominas() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const esAdmin = perfil?.rol === "admin" || perfil?.rol === "rrhh";

  const [nominas,    setNominas]    = useState([]);
  const [empleados,  setEmpleados]  = useState([]);
  const [empresas,   setEmpresas]   = useState([]);
  const [modal,      setModal]      = useState(false);
  const [form,       setForm]       = useState(VACIA);
  const [guardando,  setGuardando]  = useState(false);
  const [filtroEmp,  setFiltroEmp]  = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");

  useEffect(() => { cargar(); }, [perfil]);

  const cargar = async () => {
    if (!perfil) return;
    try {
      // Employee query without orderBy to avoid composite index requirement
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

  // Empleados filtrados por empresa seleccionada en el modal
  const empleadosFiltrados = form.empresaId
    ? empleados.filter(e=>e.empresaId===form.empresaId)
    : empleados;

  const onEmpresaModalChange = (empresaId) => {
    const empresa = empresas.find(e=>e.id===empresaId);
    setForm(f=>({...f, empresaId, empresaNombre:empresa?.nombre||"", empleadoId:"", empleadoNombre:""}));
  };

  const onEmpleadoChange = (uid) => {
    const emp = empleados.find(e=>e.id===uid);
    const empresa = empresas.find(e=>e.id===emp?.empresaId);
    setForm(f=>({...f,
      empleadoId:uid, empleadoNombre:emp?.nombre||"",
      empresaId: emp?.empresaId||f.empresaId,
      empresaNombre: empresa?.nombre||f.empresaNombre
    }));
  };

  const guardar = async () => {
    if (!form.empleadoId || !form.mes || !form.linkDrive) {
      showToast("Empleado, mes y link son obligatorios","error"); return;
    }
    if (!form.linkDrive.startsWith("http")) {
      showToast("El link debe ser una URL válida (https://...)","error"); return;
    }
    setGuardando(true);
    try {
      await addDoc(collection(db,"nominas"), {
        empleadoId: form.empleadoId, empleadoNombre: form.empleadoNombre,
        empresaId: form.empresaId, empresaNombre: form.empresaNombre,
        mes: form.mes, anyo: Number(form.anyo),
        descripcion: form.descripcion||"",
        linkDrive: form.linkDrive,
        creadaEn: Timestamp.now(), creadaPor: perfil.nombre,
      });
      await crearNotificacion({
        usuarioId: form.empleadoId,
        titulo: "Nueva nómina disponible 📄",
        mensaje: `Tu nómina de ${form.mes} ${form.anyo} ya está disponible en la sección Nóminas.`,
        tipo: "info",
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

  // Filtros para la tabla admin
  let lista = nominas;
  if (filtroEmpresa) lista = lista.filter(n=>n.empresaId===filtroEmpresa);
  if (filtroEmp)     lista = lista.filter(n=>n.empleadoId===filtroEmp);

  // Empleados disponibles para filtro de tabla (según empresa seleccionada)
  const empleadosParaFiltro = filtroEmpresa
    ? empleados.filter(e=>e.empresaId===filtroEmpresa)
    : empleados;

  // Agrupado por año para vista empleado
  const porAnyo = lista.reduce((acc,n) => {
    const key = n.anyo||"—";
    if (!acc[key]) acc[key]=[];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <div>
      {ToastUI}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>{esAdmin?"Gestión de nóminas":"Mis nóminas"}</h1>
        {esAdmin && (
          <button className="btn btn-primary" onClick={()=>{ setForm(VACIA); setModal(true); }}>
            + Subir nómina
          </button>
        )}
      </div>

      {/* Filtros admin */}
      {esAdmin && (
        <div className="card" style={{ marginBottom:16, padding:"14px 18px" }}>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
            <div>
              <label className="form-label" style={{ marginBottom:4 }}>Empresa</label>
              <select className="form-input form-select" style={{ width:220 }}
                value={filtroEmpresa} onChange={e=>{ setFiltroEmpresa(e.target.value); setFiltroEmp(""); }}>
                <option value="">Todas las empresas</option>
                {empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ marginBottom:4 }}>Empleado</label>
              <select className="form-input form-select" style={{ width:220 }}
                value={filtroEmp} onChange={e=>setFiltroEmp(e.target.value)}>
                <option value="">Todos los empleados</option>
                {empleadosParaFiltro.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <span className="badge badge-blue">{lista.length} nóminas</span>
          </div>
        </div>
      )}

      {/* Vista empleado */}
      {!esAdmin && (
        <div>
          {Object.keys(porAnyo).length === 0 && (
            <div className="card" style={{ textAlign:"center", padding:40, color:"#9CA3AF" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
              <div style={{ fontSize:15 }}>Aún no tienes nóminas disponibles</div>
              <div style={{ fontSize:13, marginTop:6 }}>Tu empresa las publicará aquí cuando estén listas</div>
            </div>
          )}
          {Object.keys(porAnyo).sort((a,b)=>b-a).map(anyo=>(
            <div key={anyo} style={{ marginBottom:20 }}>
              <div style={{ fontWeight:600, fontSize:16, color:"#1B3A6B", marginBottom:10 }}>{anyo}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10 }}>
                {porAnyo[anyo].map(n=>(
                  <a key={n.id} href={n.linkDrive} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration:"none" }}>
                    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:10,
                      padding:16, textAlign:"center", cursor:"pointer",
                      transition:"box-shadow .15s" }}
                      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)"}
                      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                      <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
                      <div style={{ fontWeight:600, color:"#1B3A6B" }}>{n.mes}</div>
                      <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>{n.empresaNombre}</div>
                      {n.descripcion&&<div style={{ fontSize:11, color:"#9CA3AF", marginTop:2 }}>{n.descripcion}</div>}
                      <div style={{ background:"#EBF2FB", borderRadius:6, padding:"4px 8px",
                        fontSize:12, color:"#2E5FA3", marginTop:8 }}>⬇ Descargar</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vista admin - tabla */}
      {esAdmin && (
        <div className="card">
          <table className="tabla">
            <thead>
              <tr><th>Empleado</th><th>Empresa</th><th>Mes</th><th>Año</th><th>Descripción</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                  No hay nóminas
                </td></tr>
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
                        <button className="btn btn-primary" style={{ padding:"4px 9px", fontSize:12 }}>⬇ Ver</button>
                      </a>
                      <button className="btn btn-red" style={{ padding:"4px 9px", fontSize:12 }}
                        onClick={()=>eliminar(n.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal subir nómina */}
      {modal && esAdmin && (
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Subir nómina</div>

            <div className="form-group">
              <label className="form-label">Empresa *</label>
              <select className="form-input form-select" value={form.empresaId}
                onChange={e=>onEmpresaModalChange(e.target.value)}>
                <option value="">Selecciona empresa...</option>
                {empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Empleado *</label>
              <select className="form-input form-select" value={form.empleadoId}
                onChange={e=>onEmpleadoChange(e.target.value)}
                disabled={!form.empresaId}>
                <option value="">{form.empresaId ? "Selecciona empleado..." : "Primero selecciona empresa"}</option>
                {empleadosFiltrados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div className="form-group">
                <label className="form-label">Mes *</label>
                <select className="form-input form-select" value={form.mes}
                  onChange={e=>setForm({...form, mes:e.target.value})}>
                  <option value="">Selecciona mes...</option>
                  {MESES.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Año *</label>
                <input className="form-input" type="number" value={form.anyo}
                  onChange={e=>setForm({...form, anyo:e.target.value})} min={2020} max={2035} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Link de Google Drive *</label>
              <input className="form-input" type="url" value={form.linkDrive}
                onChange={e=>setForm({...form, linkDrive:e.target.value})}
                placeholder="https://drive.google.com/file/d/..." />
              <small style={{ color:"#9CA3AF", fontSize:12, display:"block", marginTop:4 }}>
                Drive → clic derecho en el PDF → Compartir → "Cualquier persona con el enlace" → Copiar enlace
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">Descripción (opcional)</label>
              <input className="form-input" value={form.descripcion}
                onChange={e=>setForm({...form, descripcion:e.target.value})}
                placeholder="Ej: Nómina ordinaria, con bonus..." />
            </div>

            <div style={{ background:"#E1F5EE", borderRadius:8, padding:"10px 12px",
              fontSize:13, color:"#0F6E56", marginBottom:16 }}>
              ✓ El empleado recibirá una notificación automática al guardar.
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando?"Guardando...":"Guardar y notificar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
