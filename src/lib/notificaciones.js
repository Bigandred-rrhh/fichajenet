// src/lib/notificaciones.js
// Sistema de notificaciones internas en la app
import { collection, addDoc, getDocs, updateDoc, doc, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function crearNotificacion({ usuarioId, titulo, mensaje, tipo = "info", enlace = "" }) {
  await addDoc(collection(db, "notificaciones"), {
    usuarioId, titulo, mensaje, tipo, enlace,
    leida: false,
    creadaEn: Timestamp.now()
  });
}

export async function obtenerNotificaciones(usuarioId) {
  const q = query(
    collection(db, "notificaciones"),
    where("usuarioId", "==", usuarioId),
    orderBy("creadaEn", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function marcarLeida(notifId) {
  await updateDoc(doc(db, "notificaciones", notifId), { leida: true });
}

export async function marcarTodasLeidas(usuarioId) {
  const q = query(
    collection(db, "notificaciones"),
    where("usuarioId", "==", usuarioId),
    where("leida", "==", false)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { leida: true })));
}
