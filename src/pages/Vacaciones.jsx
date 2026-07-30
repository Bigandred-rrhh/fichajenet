// src/pages/Vacaciones.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, Timestamp, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { useLang } from "../lib/LanguageContext";
import { crearNotificacion } from "../lib/notificaciones";
import { notificarAdmins } from "../lib/notificarAdmins";
import { format } from "date-fns";

const VACIA = { empleadoId:"", empleadoNombre:"", empresaId:"", empresaNombre:"",
  fechaInicio:"", fechaFin:"", dias:0, motivo:"", estado:"pendiente" };

const DIAS_DERECHO = 22;
const ANO_ACTUAL = new Date().getFullYear();

// Calcula dias laborables (lunes-viernes) entre dos fechas inclusive
function diasLaborables(fechaInicio, fechaFin) {
  if (!fechaInicio || !fechaFin) return 0;
  const d1 = new Date(fechaInicio);
  const d2 = new Date(fechaFin);
  if (d2 < d1) return 0;
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const dia = cur.getDay();
    if (dia !== 0 && dia !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Contador de dias para un empleado dado el array de solicitudes
function contadorEmpleado(solicitudes, empleadoId) {
  const delAno = solicitudes.filter(s =>
    s.empleadoId === empleadoId &&
    (s.estado === "pendiente" || s.estado === "aprobada") &&
    s.fechaInicio?.startsWith(String(ANO_ACTUAL))
  );
  const reservados = delAno.reduce((acc, s) => acc + (diasLaborables(s.fechaInicio, s.fechaFin) || 0), 0);
  const aprobados  = delAno.filter(s => s.estado === "aprobada")
                           .reduce((acc, s) => acc + (diasLaborables(s.fechaInicio, s.fechaFin) || 0), 0);
  const restantes  = Math.max(0, DIAS_DERECHO - reservados);
  return { reservados, aprobados, restantes };
}

function ContadorVacaciones({ reservados, aprobados, restantes, compact = false }) {
  const pct = Math.min(100, Math.round((reservados / DIAS_DERECHO) * 100));
  const colorBarra = restantes <= 5 ? "#C0392B" : restantes <= 10 ? "#BA7517" : "#0F6E56";

  if (compact) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
        <div style={{ flex:1, background:"#F3F4F6", borderRadius:20, height:6, minWidth:60 }}>
          <div style={{ width:`${pct}%`, background:colorBarra, borderRadius:20, height:6, transition:"width .3s" }} />
        </div>
        <span style={{ color:colorBarra, fontWeight:700, whiteSpace:"nowrap" }}>
          {restantes}d libres
        </span>
      </div>
    );
  }

  return (
    <div style={{ background:"#F9FAFB", border:"1px solid #E5E7EB", borderRadius:10, padding:"12px 16px", marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>
          Vacaciones {ANO_ACTUAL}
        </span>
        <span style={{ fontSize:12, color:"#6B7280" }}>
          {reservados} / {DIAS_DERECHO} dias laborables
        </span>
      </div>
      <div style={{ background:"#E5E7EB", borderRadius:20, height:8, marginBottom:10 }}>
        <div style={{ width:`${pct}%`, background:colorBarra, borderRadius:20, height:8, transition:"width .3s" }} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
        {[
          { label:"Aprobados", value:aprobados, color:"#0F6E56", bg:"#E1F5EE" },
          { label:"Pendientes", value:reservados - aprobados, color:"#BA7517", bg:"#FFF3CD" },
          { label:"Disponibles", value:restantes, color:colorBarra, bg: restantes <= 5 ? "#FDECEA" : restantes <= 10 ? "#FFF3CD" : "#E1F5EE" },
        ].map(item => (
          <div key={item.label} style={{ background:item.bg, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
            <div style={{ fontSize:18, fontWeight:700, color:item.color }}>{item.value}</div>
            <div style={{ fontSize:11, color:"#6B7280" }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Vacaciones() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const { t } = useLang();
  const esAdmin = perfil?.rol==="admin" || perfil?.rol==="rrhh";

  const ESTADOS = {
    pendiente: { label:t("vac_estado_pendiente"), clase:"badge-amber" },
    aprobada:  { label:t("vac_estado_aprobada"),  clase:"badge-green" },
    rechazada: { label:t("vac_estado_rechazada"), clase:"badge-red"   },
  };

  const [solicitudes, setSolicitudes] = useState([]);
  const [empleados,   setEmpleados]   = useState([]);
  const [empresas,    setEmpresas]    = useState([]);
  const [modal,       setModal]       = useState(false);
  const [form,        setForm]        = useState(VACIA);
  const [editId,      setEditId]      = useState(null);
  const [guardando,   setGuardando]   = useState(false);
  const [filtro,      setFiltro]      = useState("");

  useEffect(() => { cargar(); }, [perfil]);

  const cargar = async () => {
    if (!perfil) return;
    try {
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
    setForm(f=>({...f,empleadoId:uid,empleadoNombre:emp?.nombre||"",empresaId:emp?.empresaId||"",empresaNombre:empresa?.nombre||""}));
  };

  const guardar = async () => {
    if (!form.empleadoId||!form.fechaInicio||!form.fechaFin) {
      showToast("Empleado y fechas son obligatorios","error"); return;
    }
    const dias=calcularDias(form.fechaInicio,form.fechaFin);
    if (dias<=0) { showToast("La fecha fin debe ser posterior al inicio","error"); return; }
    // Validar que no supere los dias disponibles
    if (!editId) {
      const { restantes } = contadorEmpleado(solicitudes, form.empleadoId);
      const labSolicitud = diasLaborables(form.fechaInicio, form.fechaFin);
      if (labSolicitud > restantes) {
        showToast(`Solo quedan ${restantes} dias laborables disponibles este ano.`, "error");
        return;
      }
    }
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
        await notificarAdmins({
          titulo: "Nueva solicitud de vacaciones",
          mensaje: `${perfil.nombre} ha solicitado vacaciones del ${form.fechaInicio} al ${form.fechaFin} (${dias} dias).`,
          tipo: "warning",
        });
      }
      setModal(false); cargar();
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setGuardando(false);
  };

  const cambiarEstado = async (sol,estado) => {
    await updateDoc(doc(db,"vacaciones",sol.id),{estado,actualizadaEn:Timestamp.now()});
    await crearNotificacion({
      usuarioId:sol.empleadoId,
      titulo:`Vacaciones ${estado==="aprobada"?"aprobadas":"rechazadas"}`,
      mensaje:estado==="aprobada"
        ?`Tus vacaciones del ${sol.fechaInicio} al ${sol.fechaFin} (${sol.dias} dias) han sido aprobadas.`
        :`Tu solicitud de vacaciones del ${sol.fechaInicio} al ${sol.fechaFin} ha sido rechazada.`,
      tipo:estado==="aprobada"?"success":"error",
    });
    showToast(`Vacaciones ${estado}`,"success"); cargar();
  };

  const eliminar = async (id) => {
    if (!window.confirm("Eliminar esta solicitud?")) return;
    await deleteDoc(doc(db,"vacaciones",id));
    showToast("Solicitud eliminada","success"); cargar();
  };

  const lista = filtro ? solicitudes.filter(s=>s.estado===filtro) : solicitudes;
  const pendientes = solicitudes.filter(s=>s.estado==="pendiente").length;

  // Para admin: agrupar empleados con sus contadores
  const resumenEmpleados = esAdmin ? empleados.map(emp => ({
    ...emp,
    ...contadorEmpleado(solicitudes, emp.id),
  })) : [];

  // Para empleado: su propio contador
  const miContador = !esAdmin ? contadorEmpleado(solicitudes, user?.uid) : null;

  return (
    <div>
      {ToastUI}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>{t("vac_titulo")}</h1>
          {pendientes>0&&esAdmin&&<span style={{fontSize:13,color:"#BA7517"}}>⚠ {pendientes} {pendientes>1?t("vac_pendientes_txt"):t("vac_pendiente_txt")}</span>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select className="form-input form-select" style={{width:"auto",fontSize:13}}
            value={filtro} onChange={e=>setFiltro(e.target.value)}>
            <option value="">{t("vac_opt_todos")}</option>
            <option value="pendiente">{t("vac_opt_pendiente")}</option>
            <option value="aprobada">{t("vac_opt_aprobada")}</option>
            <option value="rechazada">{t("vac_opt_rechazada")}</option>
          </select>
          <button className="btn btn-primary" onClick={()=>abrir(null)} style={{fontSize:13}}>{t("vac_solicitar")}</button>
        </div>
      </div>

      {/* Contador para el empleado */}
      {!esAdmin && miContador && (
        <ContadorVacaciones {...miContador} />
      )}

      {/* Resumen de contadores por empleado para admin */}
      {esAdmin && resumenEmpleados.length > 0 && (
        <div className="card" style={{marginBottom:20,padding:"14px 18px"}}>
          <div style={{fontWeight:600,fontSize:14,marginBottom:12,color:"#374151"}}>
            Resumen de vacaciones {ANO_ACTUAL}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {resumenEmpleados.map(emp => (
              <div key={emp.id} style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{minWidth:160,fontSize:13,fontWeight:500}}>{emp.nombre}</div>
                <div style={{fontSize:11,color:"#6B7280",minWidth:80}}>{emp.empresaNombre||""}</div>
                <div style={{flex:1,minWidth:200}}>
                  <ContadorVacaciones
                    reservados={emp.reservados}
                    aprobados={emp.aprobados}
                    restantes={emp.restantes}
                    compact
                  />
                </div>
                <div style={{fontSize:12,color:"#6B7280",whiteSpace:"nowrap"}}>
                  {emp.aprobados}✓ {emp.reservados - emp.aprobados > 0 ? `+ ${emp.reservados - emp.aprobados} pend.` : ""} / {DIAS_DERECHO}d
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lista.length===0 ? (
        <div className="card" style={{textAlign:"center",padding:32,color:"#9CA3AF"}}>{t("vac_sin_datos")}</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {lista.map(s=>(
            <div key={s.id} className="card" style={{padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:15}}>{s.empleadoNombre}</div>
                  {esAdmin&&<div style={{fontSize:12,color:"#6B7280",marginBottom:4}}>{s.empresaNombre}</div>}
                  <div style={{fontSize:13,color:"#374151",marginTop:4}}>
                    📅 {s.fechaInicio} → {s.fechaFin}
                    <span className="badge badge-blue" style={{marginLeft:8}}>{s.dias}d</span>
                    <span style={{marginLeft:8,fontSize:11,color:"#6B7280"}}>
                      ({diasLaborables(s.fechaInicio,s.fechaFin)} lab.)
                    </span>
                  </div>
                  {s.motivo&&<div style={{fontSize:12,color:"#6B7280",marginTop:4}}>{s.motivo}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                  <span className={`badge ${ESTADOS[s.estado]?.clase||"badge-gray"}`}>{ESTADOS[s.estado]?.label||s.estado}</span>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn" style={{padding:"4px 10px",fontSize:12}} onClick={()=>abrir(s)}>
                      {esAdmin?t("editar"):t("ver")}
                    </button>
                    {esAdmin&&s.estado==="pendiente"&&<>
                      <button className="btn btn-green" style={{padding:"4px 10px",fontSize:12}} onClick={()=>cambiarEstado(s,"aprobada")}>✓</button>
                      <button className="btn btn-red"   style={{padding:"4px 10px",fontSize:12}} onClick={()=>cambiarEstado(s,"rechazada")}>✗</button>
                    </>}
                    {esAdmin&&<button className="btn btn-red" style={{padding:"4px 10px",fontSize:12}} onClick={()=>eliminar(s.id)}>🗑</button>}
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
            <div className="modal-title">{editId?t("vac_modal_editar"):t("vac_modal_nueva")}</div>
            {esAdmin?(
              <div className="form-group">
                <label className="form-label">{t("vac_empleado")}</label>
                <select className="form-input form-select" value={form.empleadoId} onChange={e=>onEmpleadoChange(e.target.value)}>
                  <option value="">{t("vac_empleado_sel")}</option>
                  {empleados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            ):(
              <div className="form-group">
                <label className="form-label">{t("vac_empleado")}</label>
                <input className="form-input" value={perfil.nombre} disabled style={{background:"#F9F9F9",color:"#9CA3AF"}}/>
              </div>
            )}
            {/* Mini contador en el modal para que el empleado sepa cuanto le queda */}
            {form.empleadoId && (() => {
              const c = contadorEmpleado(solicitudes, form.empleadoId);
              return (
                <div style={{background:"#EBF2FB",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:"#2E5FA3"}}>Dias disponibles {ANO_ACTUAL}</span>
                  <strong style={{color: c.restantes<=5?"#C0392B":c.restantes<=10?"#BA7517":"#0F6E56"}}>
                    {c.restantes} / {DIAS_DERECHO} dias lab.
                  </strong>
                </div>
              );
            })()}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div className="form-group">
                <label className="form-label">{t("vac_fecha_inicio")}</label>
                <input className="form-input" type="date" value={form.fechaInicio}
                  onChange={e=>setForm({...form,fechaInicio:e.target.value,dias:calcularDias(e.target.value,form.fechaFin)})}/>
              </div>
              <div className="form-group">
                <label className="form-label">{t("vac_fecha_fin")}</label>
                <input className="form-input" type="date" value={form.fechaFin}
                  onChange={e=>setForm({...form,fechaFin:e.target.value,dias:calcularDias(form.fechaInicio,e.target.value)})}/>
              </div>
            </div>
            {form.fechaInicio&&form.fechaFin&&(
              <div style={{background:"#EBF2FB",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:13,color:"#2E5FA3"}}>
                📅 {calcularDias(form.fechaInicio,form.fechaFin)} dias naturales
                · {diasLaborables(form.fechaInicio,form.fechaFin)} laborables
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{t("vac_motivo")}</label>
              <textarea className="form-input" rows={2} value={form.motivo}
                onChange={e=>setForm({...form,motivo:e.target.value})}
                placeholder={t("vac_motivo_ph")} style={{resize:"vertical"}}/>
            </div>
            {esAdmin&&(
              <div className="form-group">
                <label className="form-label">{t("vac_estado")}</label>
                <select className="form-input form-select" value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})}>
                  <option value="pendiente">{t("vac_estado_pendiente")}</option>
                  <option value="aprobada">{t("vac_estado_aprobada")}</option>
                  <option value="rechazada">{t("vac_estado_rechazada")}</option>
                </select>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={()=>setModal(false)}>{t("cancelar")}</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando?t("vac_guardando"):t("vac_enviar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
