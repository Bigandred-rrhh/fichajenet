// src/lib/notificarAdmins.js
// Notifica a admins globales y al RRHH de la empresa indicada
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { crearNotificacion } from "./notificaciones";

// empresaId: si se indica, los RRHH solo reciben notificación si son de esa empresa.
//            Los admin (rol=="admin") reciben siempre independientemente de empresa.
export async function notificarAdmins({ titulo, mensaje, tipo = "warning", empresaId = null }) {
  // --- Intento 1: leer usuarios con rol admin/rrhh directamente ---
  try {
    const q = query(
      collection(db, "usuarios"),
      where("rol", "in", ["admin", "rrhh"])
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      console.warn("notificarAdmins: la query funcionó pero no hay usuarios con rol admin/rrhh");
    } else {
      const destinatarios = snap.docs.filter(d => {
        const data = d.data();
        if (data.rol === "admin") return true; // admin siempre recibe
        if (data.rol === "rrhh") {
          // RRHH solo recibe si no se especifica empresa o si es de esa empresa
          return !empresaId || data.empresaId === empresaId;
        }
        return false;
      });

      await Promise.all(
        destinatarios.map(d =>
          crearNotificacion({ usuarioId: d.id, titulo, mensaje, tipo })
        )
      );
      console.log(`notificarAdmins: notificados ${destinatarios.length} usuario(s) correctamente`);
      return;
    }
  } catch (e) {
    console.error("notificarAdmins — no se pudo leer la colección 'usuarios':", e.message);
    console.warn("notificarAdmins — intentando fallback con config/admins...");
  }

  // --- Intento 2 (fallback): leer IDs desde config/admins (solo admins globales) ---
  try {
    const configSnap = await getDoc(doc(db, "config", "admins"));
    if (!configSnap.exists()) {
      console.error("notificarAdmins — el documento 'config/admins' no existe.");
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
    console.error("notificarAdmins — fallo total:", e2.message);
  }
}
