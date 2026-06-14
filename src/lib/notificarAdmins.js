// src/lib/notificarAdmins.js
// Notifica a todos los admins/rrhh de la app
// Usa una coleccion especial "config" que cualquier usuario autenticado puede leer

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { crearNotificacion } from "./notificaciones";

export async function notificarAdmins({ titulo, mensaje, tipo }) {
  try {
    // Buscar todos los usuarios con rol admin o rrhh
    // Esta query solo funciona si el usuario tiene permiso de leer usuarios
    // Como alternativa, leemos el documento de config/admins
    const q = query(
      collection(db, "usuarios"),
      where("rol", "in", ["admin", "rrhh"])
    );
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map(d => crearNotificacion({
        usuarioId: d.id,
        titulo,
        mensaje,
        tipo: tipo || "warning"
      }))
    );
  } catch(e) {
    // Si no tiene permiso para leer usuarios, intentar con config/admins
    try {
      const { getDoc, doc } = await import("firebase/firestore");
      const configSnap = await getDoc(doc(db, "config", "admins"));
      if (configSnap.exists()) {
        const adminIds = configSnap.data().ids || [];
        await Promise.all(
          adminIds.map(id => crearNotificacion({ usuarioId:id, titulo, mensaje, tipo: tipo||"warning" }))
        );
      }
    } catch(e2) {
      console.error("No se pudo notificar a admins:", e2);
    }
  }
}
