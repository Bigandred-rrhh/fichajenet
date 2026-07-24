// src/pages/MiHistorial.jsx
import React, { useEffect, useState, useCallback } from "react";
import { collection, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LanguageContext";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

function normFecha(f) {
  if (!f) return "";
  if (f.includes("-")) { const [y,m,d]=f.split("-"); return `${d}/${m}/${y}`; }
  return f;
}
function horaAMins(h) { if (!h) return null; const p=h.split(":"); return parseInt(p[0])*60+parseInt(p[1]); }
function minsATexto(m) { if (!m||m<=0) return null; return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`; }

export default function MiHistorial() {
  const { user, perfil } = useAuth();
  const { t } = useLang();
  const [mes,      setMes]      = useState(format(new Date(),"yyyy-MM"));
  const [fichajes,     setFichajes]     = useState([]);
  const [incs,         setIncs]         = useState([]);
  const [vacaciones,   setVacaciones]   = useState([]);
  const [enfermedades, setEnfermedades] = useState([]);
  const [empresa,      setEmpresa]      = useState(null);
  const [cargando,     setCargando]     = useState(false);

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    const [y,m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y,m-1));
    const hasta = endOfMonth(new Date(y,m-1));
    const [fSnap, iSnap, eSnap, vSnap, enfSnap] = await Promise.all([
      getDocs(query(collection(db,"fichajes"),
        where("usuarioId","==",user.uid),
        where("timestamp",">=",Timestamp.fromDate(desde)),
        where("timestamp","<=",Timestamp.fromDate(hasta)),
        orderBy("timestamp","asc"))),
      getDocs(query(collection(db,"incidencias"), where("empleadoId","==",user.uid))),
      getDocs(collection(db,"empresas")),
      getDocs(query(collection(db,"vacaciones"), where("empleadoId","==",user.uid))),
      getDocs(query(collection(db,"enfermedades"), where("empleadoId","==",user.uid))),
    ]);
    setFichajes(fSnap.docs.map(d=>({id:d.id,...d.data()})));
    setIncs(iSnap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(i => i.fecha && normFecha(i.fecha).slice(3)===mes.slice(5)+"/"+mes.slice(0,4)));
    setVacaciones(vSnap.docs.map(d=>({id:d.id,...d.data()})));
    setEnfermedades(enfSnap.docs.map(d=>({id:d.id,...d.data()})));
    const emp = eSnap.docs.find(d => d.id===perfil?.empresaId);
    if (emp) setEmpresa({id:emp.id,...emp.data()});
    setCargando(false);
  }, [user, mes, perfil]);

  useEffect(() => { cargar(); }, [cargar]);

  const toISO = f => {
    if (!f) return "";
    if (f.includes("-")) return f;
    const [d,m,y] = f.split("/"); return `${y}-${m}-${d}`;
  };

  const ausenciaDeDia = (fechaISO) => {
    const vac = vacaciones.find(v => fechaISO >= v.fechaInicio && fechaISO <= v.fechaFin);
    if (vac) return { etiqueta: "🏖️ VACACIONES", estado: vac.estado, tipo: "vacaciones" };
    const enf = enfermedades.find(e => fechaISO >= e.fechaInicio && (e.fechaFin ? fechaISO <= e.fechaFin : true));
    if (enf) return { etiqueta: `🏥 ${enf.tipo?.toUpperCase() || "BAJA MÉDICA"}`, estado: enf.estado, tipo: "enfermedad" };
    return null;
  };

  const dias = (() => {
    const mapa = {};
    fichajes.forEach(f => { if (!mapa[f.fecha]) mapa[f.fecha]=[]; mapa[f.fecha].push(f); });
    return Object.entries(mapa).sort((a,b)=>b[0].localeCompare(a[0])).map(([fecha,regs]) => {
      const incsDia = incs.filter(i=>normFecha(i.fecha)===normFecha(fecha));
      const incsAprobadas = incsDia.filter(i=>i.estado==="aprobada"&&i.horaCorrecta);
      let eventos = regs.map(r=>({tipo:r.tipo,mins:horaAMins(r.hora)})).filter(e=>e.mins!==null);
      incsAprobadas.forEach(inc => {
        const mc=horaAMins(inc.horaCorrecta); if (!mc) return;
        if (inc.tipo==="Olvido de fichaje de entrada") {
          const idx=eventos.findIndex(e=>e.tipo==="entrada");
          if (idx>=0&&mc<eventos[idx].mins) eventos[idx].mins=mc; else if (idx<0) eventos.push({tipo:"entrada",mins:mc});
        } else if (inc.tipo==="Olvido de fichaje de salida") {
          const idx=eventos.findIndex(e=>e.tipo==="salida");
          if (idx>=0&&mc>eventos[idx].mins) eventos[idx].mins=mc; else if (idx<0) eventos.push({tipo:"salida",mins:mc});
        }
      });
      let totalMins=0;
      const evs=[...eventos].sort((a,b)=>a.mins-b.mins);
      for (let i=0;i<evs.length-1;i++) { if (evs[i].tipo==="entrada"&&evs[i+1].tipo==="salida") { totalMins+=evs[i+1].mins-evs[i].mins; i++; } }
      const entrada=regs.find(r=>r.tipo==="entrada")?.hora||"—";
      const salida=[...regs].reverse().find(r=>r.tipo==="salida")?.hora||"—";
      const ausencia = ausenciaDeDia(toISO(normFecha(fecha)));
      return { fecha:normFecha(fecha), entrada, salida, totalMins, incsDia, ausencia };
    });
  })();

  const totalMes = dias.reduce((acc,d)=>acc+(d.totalMins||0),0);
  const descargarPDF = () => {
    // Safari iOS no soporta bien window.print() con elementos ocultos.
    // Generamos el HTML del informe y lo abrimos en una nueva pestaña para imprimir/guardar.
    const mesTexto = format(new Date(mes + "-01"), "MMMM yyyy", { locale: es });
    const filasTabla = [...dias].reverse().map((d, i) => {
      const bg = d.ausencia
        ? (d.ausencia.tipo === "vacaciones" ? "#F0FDF4" : "#FFF7ED")
        : (i % 2 === 0 ? "#fff" : "#F9FAFB");
      const celdaCentral = d.ausencia
        ? `<td colspan="3" style="padding:7px 12px;border-bottom:1px solid #F3F4F6;font-weight:600;font-size:12px;text-align:center;color:${d.ausencia.tipo === "vacaciones" ? "#0F6E56" : "#BA7517"}">
            ${d.ausencia.etiqueta} <span style="font-weight:400;font-size:11px">(${d.ausencia.estado})</span>
           </td>`
        : `<td style="padding:7px 12px;border-bottom:1px solid #F3F4F6;color:#0F6E56;font-weight:500">${d.entrada}</td>
           <td style="padding:7px 12px;border-bottom:1px solid #F3F4F6;color:#C0392B;font-weight:500">${d.salida}</td>
           <td style="padding:7px 12px;border-bottom:1px solid #F3F4F6;font-weight:600">${minsATexto(d.totalMins) || "—"}</td>`;
      return `<tr style="background:${bg}">
        <td style="padding:7px 12px;border-bottom:1px solid #F3F4F6">${d.fecha}</td>
        ${celdaCentral}
        <td style="padding:7px 12px;border-bottom:1px solid #F3F4F6;font-size:12px;color:#BA7517">
          ${d.incsDia.length > 0 ? d.incsDia.map(i => i.tipo).join(", ") : "—"}
        </td>
      </tr>`;
    }).join("");

    const filasIncs = incs.length > 0 ? incs.map((inc, i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#FFFDF5"}">
        <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6">${inc.fecha}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6">${inc.tipo}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6">${inc.horaCorrecta || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6">${inc.descripcion || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;font-weight:500;color:${inc.estado === "aprobada" ? "#0F6E56" : inc.estado === "rechazada" ? "#C0392B" : "#BA7517"}">${inc.estado}</td>
      </tr>`).join("") : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Registro Jornada ${mesTexto}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 32px 40px; background: #fff; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        @media print { body { padding: 16px; } button { display: none !important; } }
      </style>
    </head><body>
      <div style="border-bottom:3px solid #1B3A6B;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h2 style="font-size:22px;font-weight:700;color:#1B3A6B;margin:0">REGISTRO DE JORNADA LABORAL</h2>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Real Decreto-Ley 8/2019 · Artículo 34.9 ET</p>
        </div>
        <div style="font-size:14px;font-weight:600;color:#1B3A6B;text-transform:capitalize">${mesTexto}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;background:#EBF2FB;border-radius:8px;padding:16px 20px">
        <div>
          <div style="font-size:11px;color:#6B7280;font-weight:600;margin-bottom:4px">EMPRESA</div>
          <div style="font-weight:600">${empresa?.nombre || "—"}</div>
          <div style="font-size:13px;color:#6B7280">CIF: ${empresa?.cif || "—"}</div>
          <div style="font-size:13px;color:#6B7280">${empresa?.domicilio || ""}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#6B7280;font-weight:600;margin-bottom:4px">EMPLEADO</div>
          <div style="font-weight:600">${perfil?.nombre}</div>
          <div style="font-size:13px;color:#6B7280">${perfil?.categoria || "—"} · Jornada ${perfil?.jornada}</div>
          <div style="font-size:13px;color:#6B7280">${perfil?.email}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr style="background:#1B3A6B">
            ${["Fecha","Entrada","Salida","Total horas","Incidencias"].map(h =>
              `<th style="color:#fff;padding:8px 12px;text-align:left;font-weight:600;font-size:12px">${h}</th>`
            ).join("")}
          </tr>
        </thead>
        <tbody>${filasTabla}</tbody>
        <tfoot>
          <tr style="background:#1B3A6B">
            <td colspan="3" style="padding:10px 12px;color:#fff;font-weight:600;text-align:right">TOTAL HORAS MES:</td>
            <td style="padding:10px 12px;color:#fff;font-weight:700;font-size:15px">${minsATexto(totalMes) || "0h 00m"}</td>
            <td style="padding:10px 12px;color:rgba(255,255,255,.6);font-size:12px">${dias.filter(d => d.totalMins > 0).length} días trabajados</td>
          </tr>
        </tfoot>
      </table>
      ${incs.length > 0 ? `
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:#1B3A6B">INCIDENCIAS DEL MES</div>
      <table>
        <thead>
          <tr style="background:#FFF3CD">
            ${["Fecha","Tipo","Hora correcta","Descripción","Estado"].map(h =>
              `<th style="padding:6px 10px;text-align:left;color:#633806;font-weight:600">${h}</th>`
            ).join("")}
          </tr>
        </thead>
        <tbody>${filasIncs}</tbody>
      </table>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px">
        ${["El/La Trabajador/a","Responsable RRHH"].map(f =>
          `<div style="border-top:1px solid #CBD5E0;padding-top:8px;text-align:center">
            <div style="font-size:11px;color:#9CA3AF;margin-bottom:50px">${f}</div>
          </div>`
        ).join("")}
      </div>
      <div style="margin-top:16px;background:#FFF3CD;border-radius:8px;padding:10px 14px;font-size:11px;color:#633806;line-height:1.6">
        <strong>Nota legal:</strong> Documento generado conforme al RDL 8/2019. Los registros se conservarán durante 4 años a disposición de los trabajadores, sus representantes y la Inspección de Trabajo (art. 34.9 ET).
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  return (
    <div>

      <div className="no-print">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <h1 style={{fontSize:22,fontWeight:700}}>{t("hist_titulo")}</h1>
          <div style={{display:"flex",gap:10}}>
            <input className="form-input" type="month" value={mes} onChange={e=>setMes(e.target.value)} style={{width:170}}/>
            {dias.length>0&&(
              <button className="btn btn-primary" onClick={descargarPDF}>
                {t("hist_descargar")}
              </button>
            )}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          {[
            { label:t("hist_dias_trabajados"), value:dias.filter(d=>d.totalMins>0).length },
            { label:t("hist_total_horas"),     value:minsATexto(totalMes)||"0h 00m" },
            { label:t("hist_incidencias"),     value:incs.length },
          ].map(s=>(
            <div className="stat-card" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{fontSize:22}}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card">
          {cargando ? <p style={{textAlign:"center",padding:30,color:"#9CA3AF"}}>{t("cargando")}</p> : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>{t("hist_fecha")}</th><th>{t("hist_entrada")}</th>
                  <th>{t("hist_salida")}</th><th>{t("hist_total")}</th>
                  <th>{t("hist_incidencias")}</th>
                </tr>
              </thead>
              <tbody>
                {dias.length===0&&(
                  <tr><td colSpan={5} style={{textAlign:"center",color:"#9CA3AF",padding:24}}>{t("hist_sin_datos")}</td></tr>
                )}
                {dias.map((d,i)=>(
                  <tr key={i} style={ d.ausencia ? { background: d.ausencia.tipo==="vacaciones" ? "#F0FDF4" : "#FFF7ED" } : {} }>
                    <td>{d.fecha}</td>
                    {d.ausencia ? (
                      <td colSpan={3} style={{ fontWeight:600, fontSize:13, textAlign:"center",
                        color: d.ausencia.tipo==="vacaciones" ? "#0F6E56" : "#BA7517"
                      }}>
                        {d.ausencia.etiqueta}
                        <span style={{ marginLeft:8, fontSize:11, fontWeight:400,
                          color: d.ausencia.estado==="aprobada"||d.ausencia.estado==="confirmada" ? "#0F6E56"
                               : d.ausencia.estado==="resuelta" ? "#6B7280" : "#BA7517"
                        }}>({d.ausencia.estado})</span>
                      </td>
                    ) : (
                      <>
                        <td><span className="badge badge-green">{d.entrada}</span></td>
                        <td><span className={`badge ${d.salida==="—"?"badge-gray":"badge-red"}`}>{d.salida}</span></td>
                        <td style={{fontWeight:600,color:d.totalMins>0?"#0F6E56":"#9CA3AF"}}>
                          {minsATexto(d.totalMins)||(d.salida==="—"?t("hist_en_curso"):"—")}
                        </td>
                      </>
                    )}
                    <td>
                      {d.incsDia.length>0
                        ?<span className="badge badge-amber">⚠ {d.incsDia.length}</span>
                        :<span style={{color:"#D1D5DB"}}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
