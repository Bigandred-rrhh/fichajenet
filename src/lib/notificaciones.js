// src/lib/notificaciones.js
// Sistema de notificaciones internas en la app
import {
  collection, addDoc, getDocs, updateDoc, doc,
  query, where, orderBy, Timestamp, onSnapshot
} from "firebase/firestore";
import { db } from "./firebase";

// Crea una notificación para un usuario concreto
export async function crearNotificacion({ usuarioId, titulo, mensaje, tipo = "info", enlace = "" }) {
  await addDoc(collection(db, "notificaciones"), {
    usuarioId, titulo, mensaje, tipo, enlace,
    leida: false,
    creadaEn: Timestamp.now()
  });
}

// ✅ Suscripción en tiempo real — reemplaza a obtenerNotificaciones()
// Llama a callback cada vez que llega una notificación nueva o cambia una existente.
// Devuelve la función `unsubscribe` — úsala en el cleanup del useEffect:
//   useEffect(() => { const unsub = suscribirNotificaciones(uid, setNotifs); return () => unsub(); }, [uid]);
// IMPORTANTE: requiere índice compuesto en Firestore:
//   Colección: notificaciones | Campos: usuarioId ASC, creadaEn DESC
//   Firebase lo propone automáticamente en la consola si no existe.
export function suscribirNotificaciones(usuarioId, callback) {
  const q = query(
    collection(db, "notificaciones"),
    where("usuarioId", "==", usuarioId),
    orderBy("creadaEn", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(notifs);
    },
    (error) => console.error("Error en suscripción de notificaciones:", error)
  );
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
