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
      // Admin ve todas; empleado solo las suyas (filtrando en la query)
      const q = esAdmin
        ? query(collection(db, "incidencias"), orderBy("creadaEn", "desc"))
        : query(
            collection(db, "incidencias"),
            where("empleadoId", "==", user.uid),
            orderBy("creadaEn", "desc")
          );

      const [incSnap, empSnap, usrSnap] = await Promise.all([
        getDocs(q),
        getDocs(collection(db, "empresas")),
        esAdmin ? getDocs(collection(db, "usuarios")) : Promise.resolve({ docs: [] }),
      ]);

      setIncidencias(incSnap.docs.map(d => ({ id:d.id, ...d.data() })));
      setEmpresas(empSnap.docs.map(d => ({ id:d.id, ...d.data() })));
      setEmpleados(usrSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch(e) {
      console.error("Error cargando incidencias:", e);
      showToast("Error al cargar incidencias", "error");
    }
  };

  const abrir = (inc) => {
    if (inc) {
      setForm({ ...inc });
      setEditId(inc.id);
    } else {
      const f = { ...VACIA };
      if (!esAdmin) {
        f.empleadoId     = user.uid;
        f.empleadoNombre = perfil.nombre;
        f.empresaId      = perfil.empresaId;
        f.empresaNombre  = empresas.find(e => e.id === perfil.empresaId)?.nombre || "";
      }
      f.fecha = format(new Date(), "yyyy-MM-dd");
      setForm(f);
      setEditId(null);
    }
    setModal(true);
  };

  const onEmpleadoChange = (uid) => {
    const emp     = empleados.find(e => e.id === uid);
    const empresa = empresas.find(e => e.id === emp?.empresaId);
    setForm(f => ({
      ...f,
      empleadoId:     uid,
      empleadoNombre: emp?.nombre || "",
      empresaId:      emp?.empresaId || "",
      empresaNombre:  empresa?.nombre || ""
    }));
  };

  const guardar = async () => {
    if (!form.empleadoId || !form.fecha || !form.tipo) {
      showToast("Empleado, fecha y tipo son obligatorios", "error"); return;
    }
    setGuardando(true);
    try {
      const datos = {
        empleadoId:     form.empleadoId,
        empleadoNombre: form.empleadoNombre,
        empresaId:      form.empresaId,
        empresaNombre:  form.empresaNombre,
        tipo:           form.tipo,
        fecha:          form.fecha,
        horaCorrecta:   form.horaCorrecta || "",
        descripcion:    form.descripcion  || "",
        estado:         esAdmin ? (form.estado || "pendiente") : "pendiente",
        creadaEn:       editId ? form.creadaEn : Timestamp.now(),
        creadaPor:      editId ? form.creadaPor : perfil.nombre,
        actualizadaEn:  Timestamp.now(),
      };
      if (editId) {
        await updateDoc(doc(db, "incidencias", editId), datos);
        showToast("Incidencia actualizada", "success");
      } else {
        await addDoc(collection(db, "incidencias"), datos);
        showToast("Incidencia registrada", "success");
      }
      setModal(false);
      cargar();
    } catch(e) {
      showToast("Error al guardar: " + e.message, "error");
    }
    setGuardando(false);
  };

  const cambiarEstado = async (id, estado) => {
    await updateDoc(doc(db, "incidencias", id), { estado, actualizadaEn: Timestamp.now() });
    showToast(`Incidencia ${estado}`, "success");
    cargar();
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta incidencia?")) return;
    await deleteDoc(doc(db, "incidencias", id));
    showToast("Incidencia eliminada", "success");
    cargar();
  };

  const lista = filtroEstado
    ? incidencias.filter(i => i.estado === filtroEstado)
    : incidencias;

  const pendientes = incidencias.filter(i => i.estado === "pendiente").length;

  return (
    <div>
      {ToastUI}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Incidencias</h1>
          {pendientes > 0 && (
            <span style={{ fontSize:13, color:"#BA7517" }}>
              ⚠ {pendientes} pendiente{pendientes>1?"s":""}
            </span>
          )}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <select className="form-input form-select" style={{ width:"auto" }}
            value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
          </select>
          <button className="btn btn-primary" onClick={() => abrir(null)}>
            + Nueva incidencia
          </button>
        </div>
      </div>

      <div className="card">
        <table className="tabla">
          <thead>
            <tr>
              <th>Empleado</th>
              {esAdmin && <th>Empresa</th>}
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Hora correcta</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={esAdmin?7:6} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                No hay incidencias
              </td></tr>
            )}
            {lista.map(inc => (
              <tr key={inc.id}>
                <td style={{ fontWeight:500 }}>{inc.empleadoNombre}</td>
                {esAdmin && <td style={{ fontSize:13, color:"#6B7280" }}>{inc.empresaNombre}</td>}
                <td style={{ fontSize:13 }}>{inc.tipo}</td>
                <td>{inc.fecha}</td>
                <td>{inc.horaCorrecta || "—"}</td>
                <td>
                  <span className={`badge ${ESTADOS[inc.estado]?.clase || "badge-gray"}`}>
                    {ESTADOS[inc.estado]?.label || inc.estado}
                  </span>
                </td>
                <td>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <button className="btn" style={{ padding:"4px 9px", fontSize:12 }}
                      onClick={() => abrir(inc)}>
                      {esAdmin ? "✏ Editar" : "Ver"}
                    </button>
                    {esAdmin && inc.estado === "pendiente" && <>
                      <button className="btn btn-green" style={{ padding:"4px 9px", fontSize:12 }}
                        onClick={() => cambiarEstado(inc.id, "aprobada")}>✓</button>
                      <button className="btn btn-red" style={{ padding:"4px 9px", fontSize:12 }}
                        onClick={() => cambiarEstado(inc.id, "rechazada")}>✗</button>
                    </>}
                    {esAdmin && (
                      <button className="btn btn-red" style={{ padding:"4px 9px", fontSize:12 }}
                        onClick={() => eliminar(inc.id)}>🗑</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:520 }}>
            <div className="modal-title">
              {editId ? "Editar incidencia" : "Nueva incidencia"}
            </div>

            {esAdmin ? (
              <div className="form-group">
                <label className="form-label">Empleado *</label>
                <select className="form-input form-select"
                  value={form.empleadoId} onChange={e => onEmpleadoChange(e.target.value)}>
                  <option value="">Selecciona empleado...</option>
                  {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Empleado</label>
                <input className="form-input" value={perfil.nombre} disabled
                  style={{ background:"#F9F9F9", color:"#9CA3AF" }} />
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input className="form-input" type="date"
                  value={form.fecha} onChange={e => setForm({...form, fecha:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Hora correcta (si aplica)</label>
                <input className="form-input" type="time"
                  value={form.horaCorrecta}
                  onChange={e => setForm({...form, horaCorrecta:e.target.value})} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-input form-select"
                value={form.tipo} onChange={e => setForm({...form, tipo:e.target.value})}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Descripción / Justificación</label>
              <textarea className="form-input" rows={3}
                placeholder="Explica brevemente el motivo..."
                value={form.descripcion}
                onChange={e => setForm({...form, descripcion:e.target.value})}
                style={{ resize:"vertical" }} />
            </div>

            {esAdmin && (
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-input form-select"
                  value={form.estado} onChange={e => setForm({...form, estado:e.target.value})}>
                  <option value="pendiente">Pendiente</option>
                  <option value="aprobada">Aprobada</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>
            )}

            {form.creadaPor && (
              <p style={{ fontSize:12, color:"#9CA3AF", marginBottom:12 }}>
                Registrada por: {form.creadaPor}
              </p>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
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
