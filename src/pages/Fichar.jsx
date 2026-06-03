// src/pages/Fichar.jsx
import React, { useState, useEffect, useCallback } from "react";
import {
  collection, addDoc, query, where, getDocs,
  orderBy, Timestamp, doc, getDoc
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../hooks/useToast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Fichar() {
  const { user, perfil } = useAuth();
  const { showToast, ToastUI } = useToast();
  const [hora, setHora]             = useState(new Date());
  const [registrosHoy, setRegistros] = useState([]);
  const [cargando, setCargando]     = useState(false);
  const [empresa, setEmpresa]       = useState(null);
  const [iniciado, setIniciado]     = useState(false);

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const cargarEmpresa = useCallback(async () => {
    if (!perfil?.empresaId) return;
    try {
      const snap = await getDoc(doc(db, "empresas", perfil.empresaId));
      if (snap.exists()) setEmpresa(snap.data());
    } catch (e) {
      console.error("Error cargando empresa:", e);
    }
  }, [perfil]);

  const cargarRegistrosHoy = useCallback(async () => {
    if (!user) return;
    try {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const manana = new Date(hoy);
      manana.setDate(manana.getDate() + 1);

      const q = query(
        collection(db, "fichajes"),
        where("usuarioId", "==", user.uid),
        where("timestamp", ">=", Timestamp.fromDate(hoy)),
        where("timestamp", "<",  Timestamp.fromDate(manana)),
        orderBy("timestamp", "asc")
      );
      const snap = await getDocs(q);
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRegistros(lista);
    } catch (e) {
      console.error("Error cargando registros:", e);
    }
  }, [user]);

  // Cargar datos al montar y cuando cambie el perfil
  useEffect(() => {
    if (perfil && user && !iniciado) {
      setIniciado(true);
      cargarEmpresa();
      cargarRegistrosHoy();
    }
  }, [perfil, user, iniciado, cargarEmpresa, cargarRegistrosHoy]);

  const registrar = async (tipo) => {
    if (cargando) return;
    setCargando(true);
    try {
      const ahora = new Date();
      await addDoc(collection(db, "fichajes"), {
        usuarioId:     user.uid,
        nombre:        perfil.nombre,
        empresaId:     perfil.empresaId,
        empresaNombre: empresa?.nombre || "",
        tipo:          tipo,
        timestamp:     Timestamp.fromDate(ahora),
        fecha:         format(ahora, "dd/MM/yyyy"),
        hora:          format(ahora, "HH:mm:ss"),
        ip:            "web"
      });
      showToast(
        tipo === "entrada"
          ? `✓ Entrada registrada a las ${format(ahora, "HH:mm")}`
          : `✓ Salida registrada a las ${format(ahora, "HH:mm")}`,
        "success"
      );
      // Recargar registros inmediatamente después de guardar
      await cargarRegistrosHoy();
    } catch (err) {
      console.error("Error registrando fichaje:", err);
      showToast("Error al registrar. Inténtalo de nuevo.", "error");
    }
    setCargando(false);
  };

  const iniciales = (nombre) =>
    (nombre || "?").split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();

  // El último registro determina qué botón mostrar
  const ultimoTipo = registrosHoy.length
    ? registrosHoy[registrosHoy.length - 1].tipo
    : null;

  return (
    <div className="fichar-wrap">
      {ToastUI}
      <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>

        <div className="avatar-emp">{iniciales(perfil?.nombre)}</div>
        <div className="emp-nombre">{perfil?.nombre}</div>
        <div className="emp-empresa">
          {empresa ? empresa.nombre : perfil?.empresaId ? "Cargando..." : "Sin empresa asignada"}
        </div>

        <div className="reloj-grande">{format(hora, "HH:mm:ss")}</div>
        <div className="fecha-txt">
          {format(hora, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </div>

        {/* Botón entrada: si no hay registros o el último fue salida */}
        {ultimoTipo !== "entrada" && (
          <button
            className="btn btn-green btn-lg"
            style={{ marginBottom: 12 }}
            onClick={() => registrar("entrada")}
            disabled={cargando}
          >
            {cargando ? "Registrando..." : "⬇ Registrar ENTRADA"}
          </button>
        )}

        {/* Botón salida: solo si el último registro fue entrada */}
        {ultimoTipo === "entrada" && (
          <button
            className="btn btn-red btn-lg"
            style={{ marginBottom: 12 }}
            onClick={() => registrar("salida")}
            disabled={cargando}
          >
            {cargando ? "Registrando..." : "⬆ Registrar SALIDA"}
          </button>
        )}

        {/* Historial hoy */}
        <div style={{ marginTop: 24, textAlign: "left" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 10 }}>
            REGISTROS DE HOY
          </p>
          {registrosHoy.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "12px 0" }}>
              Sin registros aún hoy
            </p>
          ) : (
            registrosHoy.map(r => (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: "1px solid #F3F4F6", fontSize: 14
              }}>
                <span className={`badge ${r.tipo === "entrada" ? "badge-green" : "badge-red"}`}>
                  {r.tipo === "entrada" ? "⬇ Entrada" : "⬆ Salida"}
                </span>
                <span style={{ fontWeight: 600 }}>{r.hora}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
