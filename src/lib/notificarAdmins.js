// src/lib/notificarAdmins.js
// Notifica a todos los admins/rrhh de la app
// Usa una coleccion especial "config" que cualquier usuario autenticado puede leer

import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { crearNotificacion } from "./notificaciones";

export async function notificarAdmins({ titulo, mensaje, tipo = "warning" }) {
  // --- Intento 1: leer usuarios con rol admin/rrhh directamente ---
  try {
    const q = query(
      collection(db, "usuarios"),
      where("rol", "in", ["admin", "rrhh"])
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      // ✅ Aviso explícito: la query funcionó pero no hay admins en la colección
      console.warn("notificarAdmins: la query funcionó pero no hay usuarios con rol admin/rrhh");
    } else {
      await Promise.all(
        snap.docs.map(d =>
          crearNotificacion({ usuarioId: d.id, titulo, mensaje, tipo })
        )
      );
      console.log(`notificarAdmins: notificados ${snap.docs.length} admin(s)/rrhh correctamente`);
      return; // ✅ Éxito — no seguimos al fallback
    }

  } catch (e) {
    // ✅ Error visible: normalmente falta de permisos en Firestore Rules
    console.error("notificarAdmins — no se pudo leer la colección 'usuarios':", e.message);
    console.warn("notificarAdmins — intentando fallback con config/admins...");
  }

  // --- Intento 2 (fallback): leer IDs de admins desde config/admins ---
  try {
    const configSnap = await getDoc(doc(db, "config", "admins"));

    if (!configSnap.exists()) {
      console.error("notificarAdmins — el documento 'config/admins' no existe. Crea el documento con el campo 'ids: [uid1, uid2, ...]'");
      return;
    }

    const adminIds = configSnap.data().ids || [];

    if (adminIds.length === 0) {
      console.warn("notificarAdmins — 'config/admins' existe pero el array 'ids' está vacío");
      return;
    }

    await Promise.all(
      adminIds.map(id =>
        crearNotificacion({ usuarioId: id, titulo, mensaje, tipo })
      )
    );
    console.log(`notificarAdmins (fallback): notificados ${adminIds.length} admin(s) desde config/admins`);

  } catch (e2) {
    console.error("notificarAdmins — fallo total, no se pudo notificar a ningún admin:", e2.message);
  }
}
