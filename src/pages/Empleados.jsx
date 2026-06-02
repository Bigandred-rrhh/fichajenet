// src/pages/Empleados.jsx
import React, { useEffect, useState } from "react";
import {
  collection, getDocs, query, where,
  doc, updateDoc, deleteDoc
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword
} from "firebase/auth";
import { setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useToast } from "../hooks/useToast";

const VACIO = { nombre:"", email:"", password:"", empresaId:"", categoria:"", jornada:"completa", rol:"empleado" };

export default function Empleados() {
  const { showToast, ToastUI } = useToast();
  const [empleados, setEmpleados] = useState([]);
  const [empresas,  setEmpresas]  = useState([]);
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState(VACIO);
  const [editId,    setEditId]    = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [filtro,    setFiltro]    = useState("");

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    const [empSnap, usrSnap] = await Promise.all([
      getDocs(collection(db, "empresas")),
      getDocs(collection(db, "usuarios")),
    ]);
    setEmpresas(empSnap.docs.map(d => ({ id:d.id, ...d.data() })));
    setEmpleados(usrSnap.docs.map(d => ({ id:d.id, ...d.data() })));
  };

  const abrir = (emp) => {
    if (emp) { setForm({...emp, password:""}); setEditId(emp.id); }
    else     { setForm(VACIO); setEditId(null); }
    setModal(true);
  };

  const guardar = async () => {
    if (!form.nombre || !form.email || !form.empresaId) {
      showToast("Nombre, email y empresa son obligatorios", "error"); return;
    }
    if (!editId && !form.password) {
      showToast("La contraseña es obligatoria para nuevos empleados", "error"); return;
    }
    setGuardando(true);
    try {
      if (editId) {
        // Solo actualizar datos (no email/pass desde aquí)
        await updateDoc(doc(db, "usuarios", editId), {
          nombre: form.nombre, empresaId: form.empresaId,
          categoria: form.categoria, jornada: form.jornada, rol: form.rol
        });
        showToast("Empleado actualizado", "success");
      } else {
        // Crear usuario en Firebase Auth
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        // Guardar perfil en Firestore
        await setDoc(doc(db, "usuarios", cred.user.uid), {
          nombre: form.nombre, email: form.email,
          empresaId: form.empresaId, categoria: form.categoria,
          jornada: form.jornada, rol: form.rol, activo: true
        });
        showToast("Empleado creado. Ya puede iniciar sesión.", "success");
      }
      setModal(false);
      cargar();
    } catch (err) {
      if (err.code === "auth/email-already-in-use")
        showToast("Ese email ya está registrado", "error");
      else if (err.code === "auth/weak-password")
        showToast("La contraseña debe tener al menos 6 caracteres", "error");
      else
        showToast("Error: " + err.message, "error");
    }
    setGuardando(false);
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar este empleado?")) return;
    await deleteDoc(doc(db, "usuarios", id));
    showToast("Empleado eliminado", "success");
    cargar();
  };

  const empNombre = (id) => empresas.find(e => e.id === id)?.nombre || "—";

  const lista = filtro
    ? empleados.filter(e => e.empresaId === filtro)
    : empleados;

  return (
    <div>
      {ToastUI}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>Empleados</h1>
        <div style={{ display:"flex", gap:10 }}>
          <select className="form-input form-select" style={{ width:"auto" }}
            value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todas las empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => abrir(null)}>+ Nuevo empleado</button>
        </div>
      </div>

      <div className="card">
        <table className="tabla">
          <thead>
            <tr><th>Nombre</th><th>Email</th><th>Empresa</th><th>Categoría</th><th>Rol</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign:"center", color:"#9CA3AF", padding:24 }}>
                No hay empleados. Añade el primero.
              </td></tr>
            )}
            {lista.map(e => (
              <tr key={e.id}>
                <td style={{ fontWeight:600 }}>{e.nombre}</td>
                <td style={{ fontSize:13, color:"#6B7280" }}>{e.email}</td>
                <td style={{ fontSize:13 }}>{empNombre(e.empresaId)}</td>
                <td>{e.categoria || "—"}</td>
                <td>
                  <span className={`badge ${e.rol === "admin" ? "badge-blue" : "badge-gray"}`}>
                    {e.rol}
                  </span>
                </td>
                <td style={{ display:"flex", gap:8 }}>
                  <button className="btn" style={{ padding:"5px 10px", fontSize:13 }} onClick={() => abrir(e)}>✏ Editar</button>
                  <button className="btn btn-red" style={{ padding:"5px 10px", fontSize:13 }} onClick={() => eliminar(e.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editId ? "Editar empleado" : "Nuevo empleado"}</div>

            <div className="form-group">
              <label className="form-label">Nombre completo *</label>
              <input className="form-input" placeholder="María López García"
                value={form.nombre} onChange={e => setForm({...form, nombre:e.target.value})} />
            </div>
            {!editId && <>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-input" type="email" placeholder="maria@empresa.com"
                  value={form.email} onChange={e => setForm({...form, email:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña inicial *</label>
                <input className="form-input" type="text" placeholder="Mínimo 6 caracteres"
                  value={form.password} onChange={e => setForm({...form, password:e.target.value})} />
                <small style={{ color:"#9CA3AF", fontSize:12 }}>El empleado podrá cambiarla después.</small>
              </div>
            </>}
            <div className="form-group">
              <label className="form-label">Empresa *</label>
              <select className="form-input form-select"
                value={form.empresaId} onChange={e => setForm({...form, empresaId:e.target.value})}>
                <option value="">Selecciona empresa...</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div className="form-group">
                <label className="form-label">Categoría profesional</label>
                <input className="form-input" placeholder="Comercial, Técnico..."
                  value={form.categoria} onChange={e => setForm({...form, categoria:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de jornada</label>
                <select className="form-input form-select"
                  value={form.jornada} onChange={e => setForm({...form, jornada:e.target.value})}>
                  <option value="completa">Completa (40h)</option>
                  <option value="parcial">Parcial</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Rol en el sistema</label>
              <select className="form-input form-select"
                value={form.rol} onChange={e => setForm({...form, rol:e.target.value})}>
                <option value="empleado">Empleado (solo ficha)</option>
                <option value="rrhh">RRHH (ve su empresa)</option>
                <option value="admin">Administrador (acceso total)</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
