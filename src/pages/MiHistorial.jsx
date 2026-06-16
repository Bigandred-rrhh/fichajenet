// src/pages/MiHistorial.jsx
import React, { useEffect, useState, useCallback } from "react";
import { collection, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

function normFecha(f) {
  if (!f) return "";
  if (f.includes("-")) { const [y,m,d] = f.split("-"); return `${d}/${m}/${y}`; }
  return f;
}
function horaAMins(h) {
  if (!h) return null;
  const p = h.split(":"); return parseInt(p[0])*60+parseInt(p[1]);
}
function minsATexto(m) {
  if (!m || m<=0) return null;
  return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`;
}

export default function MiHistorial() {
  const { user, perfil } = useAuth();
  const [mes,      setMes]      = useState(format(new Date(),"yyyy-MM"));
  const [fichajes, setFichajes] = useState([]);
  const [incs,     setIncs]     = useState([]);
  const [empresa,  setEmpresa]  = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    const [y,m] = mes.split("-").map(Number);
    const desde = startOfMonth(new Date(y,m-1));
    const hasta = endOfMonth(new Date(y,m-1));
    const [fSnap, iSnap, eSnap] = await Promise.all([
      getDocs(query(collection(db,"fichajes"),
        where("usuarioId","==",user.uid),
        where("timestamp",">=",Timestamp.fromDate(desde)),
        where("timestamp","<=",Timestamp.fromDate(hasta)),
        orderBy("timestamp","asc"))),
      getDocs(query(collection(db,"incidencias"), where("empleadoId","==",user.uid))),
      getDocs(collection(db,"empresas")),
    ]);
    setFichajes(fSnap.docs.map(d=>({id:d.id,...d.data()})));
    setIncs(iSnap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(i => i.fecha && normFecha(i.fecha).slice(3) === mes.slice(5)+"/"+mes.slice(0,4)));
    const emp = eSnap.docs.find(d => d.id === perfil?.empresaId);
    if (emp) setEmpresa({id:emp.id,...emp.data()});
    setCargando(false);
  }, [user, mes, perfil]);

  useEffect(() => { cargar(); }, [cargar]);

  const dias = (() => {
    const mapa = {};
    fichajes.forEach(f => {
      if (!mapa[f.fecha]) mapa[f.fecha] = [];
      mapa[f.fecha].push(f);
    });
    return Object.entries(mapa).sort((a,b) => b[0].localeCompare(a[0])).map(([fecha, regs]) => {
      const incsDia = incs.filter(i => normFecha(i.fecha) === normFecha(fecha));
      const incsAprobadas = incsDia.filter(i => i.estado==="aprobada" && i.horaCorrecta);
      let eventos = regs.map(r => ({ tipo:r.tipo, mins:horaAMins(r.hora) })).filter(e=>e.mins!==null);
      incsAprobadas.forEach(inc => {
        const mc = horaAMins(inc.horaCorrecta);
        if (!mc) return;
        if (inc.tipo==="Olvido de fichaje de entrada") {
          const idx = eventos.findIndex(e=>e.tipo==="entrada");
          if (idx>=0 && mc<eventos[idx].mins) eventos[idx].mins=mc;
          else if (idx<0) eventos.push({tipo:"entrada",mins:mc});
        } else if (inc.tipo==="Olvido de fichaje de salida") {
          const idx = eventos.findIndex(e=>e.tipo==="salida");
          if (idx>=0 && mc>eventos[idx].mins) eventos[idx].mins=mc;
          else if (idx<0) eventos.push({tipo:"salida",mins:mc});
        }
      });
      let totalMins = 0;
      const evs = [...eventos].sort((a,b)=>a.mins-b.mins);
      for (let i=0;i<evs.length-1;i++) {
        if (evs[i].tipo==="entrada"&&evs[i+1].tipo==="salida") { totalMins+=evs[i+1].mins-evs[i].mins; i++; }
      }
      const entrada = regs.find(r=>r.tipo==="entrada")?.hora || "—";
      const salida  = [...regs].reverse().find(r=>r.tipo==="salida")?.hora || "—";
      return { fecha:normFecha(fecha), entrada, salida, totalMins, incsDia };
    });
  })();

  const totalMes = dias.reduce((acc,d) => acc + (d.totalMins||0), 0);
  const mesTexto = format(new Date(mes+"-01"), "MMMM yyyy", {locale:es});

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display:none!important; }
          .sidebar { display:none!important; }
          .mobile-nav { display:none!important; }
          .desktop-topbar { display:none!important; }
          nav { display:none!important; }
          body { background:#fff; margin:0; padding:0; }
          .main-wrapper { margin-left:0!important; }
          .main-content { padding:0!important; }
          .print-doc { display:block!important; }
          * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        }
        .print-doc { display:none; }
      `}</style>

      {/* Vista normal — no se imprime */}
      <div className="no-print">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <h1 style={{fontSize:22,fontWeight:700}}>Mi historial</h1>
          <div style={{display:"flex",gap:10}}>
            <input className="form-input" type="month" value={mes}
              onChange={e=>setMes(e.target.value)} style={{width:170}}/>
            {dias.length > 0 && (
              <button className="btn btn-primary" onClick={() => window.print()}>
                🖨 Descargar PDF
              </button>
            )}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          {[
            { label:"Días trabajados", value: dias.filter(d=>d.totalMins>0).length },
            { label:"Total horas mes",  value: minsATexto(totalMes) || "0h 00m" },
            { label:"Incidencias",       value: incs.length },
          ].map(s=>(
            <div className="stat-card" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{fontSize:22}}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card">
          {cargando ? <p style={{textAlign:"center",padding:30,color:"#9CA3AF"}}>Cargando...</p> : (
            <table className="tabla">
              <thead>
                <tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Incidencias</th></tr>
              </thead>
              <tbody>
                {dias.length === 0 && (
                  <tr><td colSpan={5} style={{textAlign:"center",color:"#9CA3AF",padding:24}}>Sin registros este mes</td></tr>
                )}
                {dias.map((d,i)=>(
                  <tr key={i}>
                    <td>{d.fecha}</td>
                    <td><span className="badge badge-green">{d.entrada}</span></td>
                    <td><span className={`badge ${d.salida==="—"?"badge-gray":"badge-red"}`}>{d.salida}</span></td>
                    <td style={{fontWeight:600,color:d.totalMins>0?"#0F6E56":"#9CA3AF"}}>
                      {minsATexto(d.totalMins)||(d.salida==="—"?"En curso":"—")}
                    </td>
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

      {/* DOCUMENTO IMPRIMIBLE */}
      <div className="print-doc" style={{background:"#fff",padding:"32px 40px",fontFamily:"Arial,sans-serif"}}>
        <div style={{borderBottom:"3px solid #1B3A6B",paddingBottom:16,marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:700,color:"#1B3A6B",margin:0}}>REGISTRO DE JORNADA LABORAL</h2>
              <p style={{fontSize:13,color:"#6B7280",margin:"4px 0 0"}}>Real Decreto-Ley 8/2019 · Artículo 34.9 ET</p>
            </div>
            <div style={{fontSize:14,fontWeight:600,color:"#1B3A6B",textTransform:"capitalize"}}>{mesTexto}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24,
          background:"#EBF2FB",borderRadius:8,padding:"16px 20px"}}>
          <div>
            <div style={{fontSize:11,color:"#6B7280",fontWeight:600,marginBottom:4}}>EMPRESA</div>
            <div style={{fontWeight:600}}>{empresa?.nombre||"—"}</div>
            <div style={{fontSize:13,color:"#6B7280"}}>CIF: {empresa?.cif||"—"}</div>
            <div style={{fontSize:13,color:"#6B7280"}}>{empresa?.domicilio||""}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:"#6B7280",fontWeight:600,marginBottom:4}}>EMPLEADO</div>
            <div style={{fontWeight:600}}>{perfil?.nombre}</div>
            <div style={{fontSize:13,color:"#6B7280"}}>{perfil?.categoria||"—"} · Jornada {perfil?.jornada}</div>
            <div style={{fontSize:13,color:"#6B7280"}}>{perfil?.email}</div>
          </div>
        </div>

        <table style={{width:"100%",borderCollapse:"collapse",marginBottom:20,fontSize:13}}>
          <thead>
            <tr style={{background:"#1B3A6B"}}>
              {["Fecha","Entrada","Salida","Total horas","Incidencias"].map(h=>(
                <th key={h} style={{color:"#fff",padding:"8px 12px",textAlign:"left",fontWeight:600,fontSize:12}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...dias].reverse().map((d,i)=>(
              <tr key={i} style={{background:i%2===0?"#fff":"#F9FAFB"}}>
                <td style={{padding:"7px 12px",borderBottom:"1px solid #F3F4F6"}}>{d.fecha}</td>
                <td style={{padding:"7px 12px",borderBottom:"1px solid #F3F4F6",color:"#0F6E56",fontWeight:500}}>{d.entrada}</td>
                <td style={{padding:"7px 12px",borderBottom:"1px solid #F3F4F6",color:"#C0392B",fontWeight:500}}>{d.salida}</td>
                <td style={{padding:"7px 12px",borderBottom:"1px solid #F3F4F6",fontWeight:600}}>{minsATexto(d.totalMins)||"—"}</td>
                <td style={{padding:"7px 12px",borderBottom:"1px solid #F3F4F6",fontSize:12,color:"#BA7517"}}>
                  {d.incsDia.length>0?d.incsDia.map(i=>i.tipo).join(", "):"—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{background:"#1B3A6B"}}>
              <td colSpan={3} style={{padding:"10px 12px",color:"#fff",fontWeight:600,textAlign:"right"}}>TOTAL HORAS MES:</td>
              <td style={{padding:"10px 12px",color:"#fff",fontWeight:700,fontSize:15}}>{minsATexto(totalMes)||"0h 00m"}</td>
              <td style={{padding:"10px 12px",color:"rgba(255,255,255,.6)",fontSize:12}}>{dias.filter(d=>d.totalMins>0).length} días trabajados</td>
            </tr>
          </tfoot>
        </table>

        {incs.length > 0 && (
          <div style={{marginBottom:24}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8,color:"#1B3A6B"}}>INCIDENCIAS DEL MES</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"#FFF3CD"}}>
                  {["Fecha","Tipo","Hora correcta","Descripción","Estado"].map(h=>(
                    <th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#633806",fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incs.map((inc,i)=>(
                  <tr key={i} style={{background:i%2===0?"#fff":"#FFFDF5"}}>
                    <td style={{padding:"6px 10px",borderBottom:"1px solid #F3F4F6"}}>{inc.fecha}</td>
                    <td style={{padding:"6px 10px",borderBottom:"1px solid #F3F4F6"}}>{inc.tipo}</td>
                    <td style={{padding:"6px 10px",borderBottom:"1px solid #F3F4F6"}}>{inc.horaCorrecta||"—"}</td>
                    <td style={{padding:"6px 10px",borderBottom:"1px solid #F3F4F6"}}>{inc.descripcion||"—"}</td>
                    <td style={{padding:"6px 10px",borderBottom:"1px solid #F3F4F6",fontWeight:500,
                      color:inc.estado==="aprobada"?"#0F6E56":inc.estado==="rechazada"?"#C0392B":"#BA7517"}}>
                      {inc.estado}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:40,marginTop:40}}>
          {["El/La Trabajador/a","Responsable RRHH"].map(f=>(
            <div key={f} style={{borderTop:"1px solid #CBD5E0",paddingTop:8,textAlign:"center"}}>
              <div style={{fontSize:11,color:"#9CA3AF",marginBottom:50}}>{f}</div>
            </div>
          ))}
        </div>

        <div style={{marginTop:16,background:"#FFF3CD",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#633806",lineHeight:1.6}}>
          <strong>Nota legal:</strong> Documento generado conforme al RDL 8/2019. Los registros se conservarán durante 4 años a disposición de los trabajadores, sus representantes y la Inspección de Trabajo (art. 34.9 ET).
        </div>
      </div>
    </div>
  );
}
