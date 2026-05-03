import { useState, useEffect } from "react";

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["L","M","X","J","V","S","D"];

const MOMENT_CONFIG = {
  morning:   { label: "Mañana",  emoji: "🌅", color: "#FFB347" },
  afternoon: { label: "Tarde",   emoji: "☀️",  color: "#FFD700" },
  night:     { label: "Noche",   emoji: "🌙",  color: "#C8F55A" },
};

// Mock data across 4 months
const TODAY = new Date();
function buildMockLogs() {
  const data = {};
  // Current month
  [1,3,4,7,8,9,12,15,16,17,18,22,23].forEach(d => {
    const date = new Date(TODAY.getFullYear(), TODAY.getMonth(), d);
    data[date.toDateString()] = { smoked:true, moments:[["morning","night"],["afternoon"],["morning","afternoon","night"],["night"],["morning"]][d%5], company: d%2===0?"solo":"acompañado" };
  });
  // Previous 3 months
  [[22,[2,5,6,8,10,12,14,15,17,18,19,20,21,22,24,25,26,27,28,29,30]],
   [18,[1,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30]],
   [13,[3,6,9,12,15,18,21,24,27,30]]
  ].forEach(([,days], mi) => {
    const m = TODAY.getMonth() - (mi+1);
    const y = m < 0 ? TODAY.getFullYear()-1 : TODAY.getFullYear();
    const realM = ((m % 12) + 12) % 12;
    days.forEach(d => {
      try {
        const date = new Date(y, realM, d);
        if (date.getMonth() === realM)
          data[date.toDateString()] = { smoked:true, moments:[["morning"],["night"],["afternoon","night"]][d%3], company: d%2===0?"solo":"acompañado" };
      } catch(e) {}
    });
  });
  return data;
}

const MOCK_LOGS = buildMockLogs();

function buildMockPurchases() {
  const p = [];
  for (let mi = 0; mi < 4; mi++) {
    const m = TODAY.getMonth() - mi;
    const y = m < 0 ? TODAY.getFullYear()-1 : TODAY.getFullYear();
    const realM = ((m%12)+12)%12;
    const amounts = [[80000,120000],[100000,150000],[90000],[200000]][mi];
    const days = [[2,14],[3,17],[5],[1]][mi];
    days.forEach((d,i) => {
      try {
        const date = new Date(y, realM, d);
        if (date.getMonth()===realM) p.push({ id: mi*10+i, date: date.toDateString(), amount: amounts[i] });
      } catch(e){}
    });
  }
  return p;
}

const MOCK_PURCHASES = buildMockPurchases();

function formatCOP(n) { return "$" + Math.abs(n).toLocaleString("es-CO"); }

function getWeekCleanDays(logs) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay()+6)%7));
  let clean = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    if (d > today) break;
    if (!logs[d.toDateString()]?.smoked) clean++;
  }
  return clean;
}

function getMonthStats(logs, purchases, year, month) {
  const days = Object.keys(logs).filter(d => { const dt = new Date(d); return dt.getFullYear()===year && dt.getMonth()===month; }).length;
  const spent = purchases.filter(p => { const dt = new Date(p.date); return dt.getFullYear()===year && dt.getMonth()===month; }).reduce((s,p)=>s+p.amount,0);
  return { days, spent };
}

function getCalendarCells(year, month) {
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let firstDay = new Date(year, month, 1).getDay();
  firstDay = firstDay===0?6:firstDay-1;
  return [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
}

const inputStyle = { width:"100%", padding:"16px 18px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, color:"#fff", fontSize:16, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };
const primaryBtn = { width:"100%", padding:"17px", background:"#C8F55A", border:"none", borderRadius:18, color:"#0A0A0A", fontSize:16, fontWeight:800, cursor:"pointer", letterSpacing:"-0.2px", fontFamily:"inherit" };

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function Mindose() {
  const [screen, setScreen] = useState("login");
  const [authForm, setAuthForm] = useState({ email:"", password:"", name:"" });
  const [appView, setAppView] = useState("home");
  const [logs, setLogs] = useState(MOCK_LOGS);
  const [purchases, setPurchases] = useState(MOCK_PURCHASES);
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState({ moments:[], company:null });
  const [purchaseDraft, setPurchaseDraft] = useState("");
  const [trackingDate, setTrackingDate] = useState({ year: TODAY.getFullYear(), month: TODAY.getMonth() });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setTimeout(()=>setMounted(true), 60); }, []);

  const todayStr = TODAY.toDateString();
  const todayLog = logs[todayStr];
  const smokedToday = todayLog?.smoked;
  const cleanDaysThisWeek = getWeekCleanDays(logs);

  const thisMonth = getMonthStats(logs, purchases, TODAY.getFullYear(), TODAY.getMonth());

  // Build chart data from last 4 months
  const chartData = Array.from({length:4},(_,i)=>{
    const m = TODAY.getMonth()-i; const y = m<0?TODAY.getFullYear()-1:TODAY.getFullYear(); const realM=((m%12)+12)%12;
    const s = getMonthStats(logs, purchases, y, realM);
    return { month: MONTHS[realM], year: y, ...s };
  }).reverse();

  function toggleMoment(m) {
    setDraft(d => ({ ...d, moments: d.moments.includes(m)?d.moments.filter(x=>x!==m):[...d.moments,m] }));
  }

  function confirmConsume() {
    if (!draft.moments.length || !draft.company) return;
    setLogs(prev => ({ ...prev, [todayStr]:{ smoked:true, moments:draft.moments, company:draft.company } }));
    setModal(null);
  }

  function confirmPurchase() {
    const amt = parseInt(purchaseDraft.replace(/\D/g,""));
    if (!amt) return;
    setPurchases(prev => [...prev, { id:Date.now(), date:todayStr, amount:amt }]);
    setPurchaseDraft(""); setModal(null);
  }

  function removeToday() {
    setLogs(prev => { const n={...prev}; delete n[todayStr]; return n; });
  }

  function navigateTracking(dir) {
    setTrackingDate(prev => {
      let m = prev.month + dir, y = prev.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      const future = y > TODAY.getFullYear() || (y===TODAY.getFullYear() && m > TODAY.getMonth());
      if (future) return prev;
      return { year:y, month:m };
    });
  }

  const isTrackingCurrentMonth = trackingDate.year===TODAY.getFullYear() && trackingDate.month===TODAY.getMonth();
  const trackingStats = getMonthStats(logs, purchases, trackingDate.year, trackingDate.month);
  const trackingCells = getCalendarCells(trackingDate.year, trackingDate.month);
  const purchaseDates = new Set(purchases.map(p=>p.date));

  return (
    <div style={{ minHeight:"100vh", background:"#080808", display:"flex", justifyContent:"center", alignItems:"center", fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <div style={{ width:390, minHeight:844, background:"#0F0F0F", borderRadius:52, overflow:"hidden", position:"relative", boxShadow:"0 50px 130px rgba(0,0,0,0.9),0 0 0 1px rgba(255,255,255,0.07),inset 0 1px 0 rgba(255,255,255,0.05)", display:"flex", flexDirection:"column", opacity:mounted?1:0, transform:mounted?"translateY(0) scale(1)":"translateY(16px) scale(0.98)", transition:"all 0.6s cubic-bezier(0.16,1,0.3,1)" }}>

        {/* Status bar */}
        <div style={{ padding:"16px 28px 0", display:"flex", justifyContent:"space-between", alignItems:"center", color:"rgba(255,255,255,0.4)", fontSize:13, fontWeight:600, position:"relative", flexShrink:0 }}>
          <span>9:41</span>
          <div style={{ width:110, height:32, background:"#000", borderRadius:16, position:"absolute", left:"50%", transform:"translateX(-50%)", top:14 }} />
          <span style={{ fontSize:15 }}>●●●</span>
        </div>

        <div style={{ flex:1, overflowY:"auto" }}>
          {screen==="login" && <LoginScreen authForm={authForm} setAuthForm={setAuthForm} setScreen={setScreen} />}
          {screen==="signup" && <SignupScreen authForm={authForm} setAuthForm={setAuthForm} setScreen={setScreen} />}
          {screen==="app" && (
            <>
              {appView==="home" && <HomeView today={TODAY} smokedToday={smokedToday} todayLog={todayLog} thisMonth={thisMonth} cleanDaysThisWeek={cleanDaysThisWeek} chartData={chartData} openConsume={()=>{setDraft({moments:[],company:null});setModal("consume");}} openPurchase={()=>{setPurchaseDraft("");setModal("purchase");}} removeToday={removeToday} setAppView={setAppView} />}
              {appView==="tracking" && <TrackingView trackingDate={trackingDate} trackingStats={trackingStats} trackingCells={trackingCells} logs={logs} purchaseDates={purchaseDates} today={TODAY} navigate={navigateTracking} isCurrentMonth={isTrackingCurrentMonth} setAppView={setAppView} />}
              {appView==="tendencia" && <TendenciaView chartData={chartData} logs={logs} thisMonth={thisMonth} setAppView={setAppView} />}
            </>
          )}
        </div>

        {screen==="app" && (
          <div style={{ display:"flex", justifyContent:"space-around", padding:"12px 20px 28px", borderTop:"1px solid rgba(255,255,255,0.05)", background:"rgba(15,15,15,0.97)", flexShrink:0 }}>
            {[{id:"home",icon:"○",label:"Hoy"},{id:"tracking",icon:"▦",label:"Tracking"},{id:"tendencia",icon:"↗",label:"Tendencia"}].map(t=>(
              <button key={t.id} onClick={()=>setAppView(t.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, color:appView===t.id?"#C8F55A":"rgba(255,255,255,0.25)", transition:"color 0.2s", padding:"4px 16px" }}>
                <span style={{ fontSize:18 }}>{t.icon}</span>
                <span style={{ fontSize:11, fontWeight:600, letterSpacing:"0.03em" }}>{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {modal==="consume" && <BottomSheet onClose={()=>setModal(null)}><ConsumeModal draft={draft} toggleMoment={toggleMoment} setDraft={setDraft} confirmConsume={confirmConsume} /></BottomSheet>}
      {modal==="purchase" && <BottomSheet onClose={()=>setModal(null)}><PurchaseModal value={purchaseDraft} setValue={setPurchaseDraft} confirm={confirmPurchase} /></BottomSheet>}
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function LoginScreen({ authForm, setAuthForm, setScreen }) {
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 32px", minHeight:760 }}>
      <div style={{ marginBottom:48 }}>
        <div style={{ width:52, height:52, background:"#C8F55A", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
          <span style={{ fontSize:26 }}>◎</span>
        </div>
        <h1 style={{ color:"#fff", fontSize:42, fontWeight:900, margin:0, letterSpacing:"-2px" }}>Mindose</h1>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:15, margin:"8px 0 0" }}>Control consciente de tu consumo.</p>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:24 }}>
        <input placeholder="Correo" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))} style={inputStyle} />
        <input placeholder="Contraseña" type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} style={inputStyle} />
      </div>
      <button onClick={()=>setScreen("app")} style={primaryBtn}>Entrar</button>
      <button onClick={()=>setScreen("signup")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", fontSize:14, cursor:"pointer", marginTop:20, padding:8, fontFamily:"inherit" }}>
        ¿No tienes cuenta? <span style={{ color:"#C8F55A", fontWeight:700 }}>Créala aquí</span>
      </button>
    </div>
  );
}

function SignupScreen({ authForm, setAuthForm, setScreen }) {
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 32px", minHeight:760 }}>
      <button onClick={()=>setScreen("login")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontSize:22, cursor:"pointer", padding:0, marginBottom:28, textAlign:"left", fontFamily:"inherit" }}>←</button>
      <div style={{ marginBottom:40 }}>
        <div style={{ width:52, height:52, background:"#C8F55A", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
          <span style={{ fontSize:26 }}>◎</span>
        </div>
        <h1 style={{ color:"#fff", fontSize:34, fontWeight:900, margin:0, letterSpacing:"-1px" }}>Crear cuenta</h1>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:14, margin:"6px 0 0" }}>Tu información es privada y solo tuya.</p>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:24 }}>
        <input placeholder="Tu nombre" value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))} style={inputStyle} />
        <input placeholder="Correo" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))} style={inputStyle} />
        <input placeholder="Contraseña" type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} style={inputStyle} />
      </div>
      <button onClick={()=>setScreen("app")} style={primaryBtn}>Crear cuenta</button>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeView({ today, smokedToday, todayLog, thisMonth, cleanDaysThisWeek, chartData, openConsume, openPurchase, removeToday, setAppView }) {
  const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const prev = chartData[chartData.length-2];
  const trend = prev ? prev.days - thisMonth.days : 0;

  return (
    <div style={{ padding:"20px 24px 0" }}>
      <div style={{ marginBottom:22 }}>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:13, fontWeight:600, margin:0, letterSpacing:"0.05em", textTransform:"uppercase" }}>{dayNames[today.getDay()]}</p>
        <h1 style={{ color:"#fff", fontSize:30, fontWeight:900, margin:"3px 0 0", letterSpacing:"-0.8px" }}>{today.getDate()} de {monthNames[today.getMonth()]}</h1>
      </div>

      {/* Weekly */}
      <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:20, padding:"14px 18px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 2px" }}>Esta semana</p>
          <p style={{ color:"#fff", fontSize:16, fontWeight:700, margin:0 }}>
            <span style={{ color:"#C8F55A", fontSize:24, fontWeight:900, letterSpacing:"-0.5px" }}>{cleanDaysThisWeek}</span>
            <span style={{ color:"rgba(255,255,255,0.4)", fontSize:14, marginLeft:6 }}>días sin consumir</span>
          </p>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {Array.from({length:7},(_,i)=>(
            <div key={i} style={{ width:8, height:8, borderRadius:"50%", background: i<cleanDaysThisWeek?"#C8F55A":"rgba(255,255,255,0.1)" }} />
          ))}
        </div>
      </div>

      {/* Consume card */}
      <div style={{ background:smokedToday?"rgba(200,245,90,0.07)":"rgba(255,255,255,0.03)", border:smokedToday?"1px solid rgba(200,245,90,0.2)":"1px solid rgba(255,255,255,0.07)", borderRadius:28, padding:"22px", marginBottom:10, transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
        {smokedToday ? (
          <>
            <p style={{ color:"#C8F55A", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", margin:"0 0 8px" }}>Registrado hoy</p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
              {todayLog.moments.map(m=>(
                <span key={m} style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:"5px 12px", color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:600 }}>
                  {MOMENT_CONFIG[m].emoji} {MOMENT_CONFIG[m].label}
                </span>
              ))}
              <span style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:"5px 12px", color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:600 }}>
                {todayLog.company==="solo"?"🧘 Solo":"👥 Acompañado"}
              </span>
            </div>
            <button onClick={removeToday} style={{ width:"100%", padding:"13px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, color:"rgba(255,255,255,0.35)", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Quitar registro</button>
          </>
        ) : (
          <>
            <p style={{ color:"rgba(255,255,255,0.35)", fontSize:14, margin:"0 0 4px" }}>Sin registro hoy</p>
            <p style={{ color:"#fff", fontSize:20, fontWeight:800, margin:"0 0 20px", letterSpacing:"-0.3px" }}>¿Consumiste hoy?</p>
            <button onClick={openConsume} style={primaryBtn}>Sí, registrar</button>
          </>
        )}
      </div>

      {/* Purchase */}
      <button onClick={openPurchase} style={{ width:"100%", padding:"14px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:18, color:"rgba(255,255,255,0.45)", fontSize:14, fontWeight:600, cursor:"pointer", marginBottom:12, display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"inherit" }}>
        💰 Registrar compra
      </button>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <StatCard label="Este mes" value={thisMonth.days} sub="días" />
        <StatCard label={prev?`vs ${prev.month}`:"Tendencia"} value={trend>0?`−${trend}`:`+${Math.abs(trend)}`} sub={trend>0?"menos 🎯":"más"} accent={trend>0} negative={trend<0} />
      </div>
      <div style={{ marginBottom:12 }}>
        <StatCard label="Gasto este mes" value={formatCOP(thisMonth.spent)} sub={thisMonth.days>0?`≈ ${formatCOP(Math.round(thisMonth.spent/thisMonth.days))}/día`:"—"} wide />
      </div>

      {/* Chart preview */}
      <button onClick={()=>setAppView("tendencia")} style={{ width:"100%", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:22, padding:"18px", cursor:"pointer", textAlign:"left", marginBottom:24, fontFamily:"inherit" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:0 }}>Tendencia</p>
          <span style={{ color:"rgba(255,255,255,0.2)", fontSize:12 }}>ver más →</span>
        </div>
        <MiniBar data={chartData} />
      </button>
    </div>
  );
}

function StatCard({ label, value, sub, accent, negative, wide }) {
  return (
    <div style={{ background:accent?"rgba(200,245,90,0.06)":negative?"rgba(255,90,90,0.06)":"rgba(255,255,255,0.03)", border:accent?"1px solid rgba(200,245,90,0.15)":negative?"1px solid rgba(255,90,90,0.12)":"1px solid rgba(255,255,255,0.06)", borderRadius:20, padding:"18px 16px" }}>
      <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", margin:"0 0 5px" }}>{label}</p>
      <p style={{ color:accent?"#C8F55A":negative?"#FF6B6B":"#fff", fontSize:wide?22:32, fontWeight:900, margin:0, letterSpacing:"-1px", lineHeight:1 }}>{value}</p>
      <p style={{ color:"rgba(255,255,255,0.25)", fontSize:12, margin:"4px 0 0" }}>{sub}</p>
    </div>
  );
}

function MiniBar({ data }) {
  const max = Math.max(...data.map(d=>d.days),1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:48 }}>
      {data.map((item,i)=>{
        const isLast = i===data.length-1;
        const h = Math.max(4,(item.days/max)*48);
        return (
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div style={{ width:"100%", height:h, background:isLast?"#C8F55A":"rgba(255,255,255,0.1)", borderRadius:5 }} />
            <span style={{ color:"rgba(255,255,255,0.25)", fontSize:10, fontWeight:600 }}>{item.month}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── TRACKING ─────────────────────────────────────────────────────────────────
function TrackingView({ trackingDate, trackingStats, trackingCells, logs, purchaseDates, today, navigate, isCurrentMonth, setAppView }) {
  const { year, month } = trackingDate;
  const todayStr = today.toDateString();

  return (
    <div style={{ padding:"20px 24px 0" }}>
      {/* Header with navigation */}
      <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
        <button onClick={()=>setAppView("home")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontSize:20, cursor:"pointer", padding:"0 12px 0 0", fontFamily:"inherit" }}>←</button>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={()=>navigate(-1)} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"rgba(255,255,255,0.6)", fontSize:16, fontFamily:"inherit" }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <h2 style={{ color:"#fff", fontSize:22, fontWeight:900, margin:0, letterSpacing:"-0.5px" }}>{MONTHS_FULL[month]}</h2>
            <p style={{ color:"rgba(255,255,255,0.3)", fontSize:12, margin:"2px 0 0", fontWeight:600 }}>{year}</p>
          </div>
          <button onClick={()=>navigate(1)} style={{ background: isCurrentMonth?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", cursor: isCurrentMonth?"default":"pointer", color: isCurrentMonth?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.6)", fontSize:16, fontFamily:"inherit" }}>›</button>
        </div>
      </div>

      {/* Month summary pills */}
      <div style={{ display:"flex", gap:10, marginBottom:18 }}>
        <div style={{ flex:1, background:"rgba(200,245,90,0.06)", border:"1px solid rgba(200,245,90,0.15)", borderRadius:16, padding:"12px 14px" }}>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 3px" }}>Días</p>
          <p style={{ color:"#C8F55A", fontSize:26, fontWeight:900, margin:0, letterSpacing:"-1px" }}>{trackingStats.days}</p>
        </div>
        <div style={{ flex:1, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"12px 14px" }}>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 3px" }}>Gasto</p>
          <p style={{ color:"#fff", fontSize:18, fontWeight:900, margin:0, letterSpacing:"-0.5px" }}>{trackingStats.spent>0?formatCOP(trackingStats.spent):"—"}</p>
        </div>
        <div style={{ flex:1, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"12px 14px" }}>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 3px" }}>$/día</p>
          <p style={{ color:"#fff", fontSize:18, fontWeight:900, margin:0, letterSpacing:"-0.5px" }}>{trackingStats.days>0&&trackingStats.spent>0?formatCOP(Math.round(trackingStats.spent/trackingStats.days)):"—"}</p>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6 }}>
        {DAYS_SHORT.map(d=><div key={d} style={{ color:"rgba(255,255,255,0.2)", fontSize:11, fontWeight:700, textAlign:"center", padding:"4px 0", letterSpacing:"0.04em" }}>{d}</div>)}
      </div>

      {/* Calendar grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
        {trackingCells.map((day,i)=>{
          if (!day) return <div key={i} />;
          const date = new Date(year, month, day);
          const log = logs[date.toDateString()];
          const hasPurchase = purchaseDates.has(date.toDateString());
          const isToday = date.toDateString()===todayStr;
          const isFuture = date > today;
          const mainColor = log ? MOMENT_CONFIG[log.moments?.[0]]?.color || "#C8F55A" : null;

          return (
            <div key={i} style={{ aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderRadius:12, background:log?`${mainColor}18`:isToday?"rgba(255,255,255,0.07)":"transparent", border:isToday?"1px solid rgba(255,255,255,0.18)":log?`1px solid ${mainColor}35`:"1px solid transparent", gap:1 }}>
              <span style={{ fontSize:13, fontWeight:isToday?800:500, color:isFuture?"rgba(255,255,255,0.1)":log?mainColor:"rgba(255,255,255,0.55)" }}>{day}</span>
              {hasPurchase && <span style={{ fontSize:6, lineHeight:1 }}>💰</span>}
              {log && log.moments?.length > 1 && <span style={{ fontSize:6, color:mainColor, lineHeight:1 }}>●●</span>}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:12, marginTop:18, flexWrap:"wrap" }}>
        {Object.entries(MOMENT_CONFIG).map(([k,cfg])=>(
          <div key={k} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:9, height:9, borderRadius:3, background:`${cfg.color}30`, border:`1px solid ${cfg.color}50` }} />
            <span style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>{cfg.label}</span>
          </div>
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:9 }}>💰</span>
          <span style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>Compra</span>
        </div>
      </div>
      <div style={{ height:24 }} />
    </div>
  );
}

// ─── TENDENCIA ────────────────────────────────────────────────────────────────
function TendenciaView({ chartData, logs, thisMonth, setAppView }) {
  const max = Math.max(...chartData.map(d=>d.days),1);
  const first = chartData[0];
  const dropped = first.days - thisMonth.days;
  const savedMoney = first.spent - thisMonth.spent;

  const momentCount = { morning:0, afternoon:0, night:0 };
  const companyCount = { solo:0, acompañado:0 };
  Object.values(logs).forEach(l => {
    l.moments?.forEach(m => { momentCount[m]=(momentCount[m]||0)+1; });
    if (l.company) companyCount[l.company]=(companyCount[l.company]||0)+1;
  });

  return (
    <div style={{ padding:"20px 24px 0" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
        <button onClick={()=>setAppView("home")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontSize:22, cursor:"pointer", padding:0, fontFamily:"inherit" }}>←</button>
        <h2 style={{ color:"#fff", fontSize:26, fontWeight:900, margin:0, letterSpacing:"-0.6px" }}>Tendencia</h2>
      </div>

      {/* Hero stats */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        <div style={{ background:dropped>0?"rgba(200,245,90,0.06)":"rgba(255,90,90,0.06)", border:dropped>0?"1px solid rgba(200,245,90,0.15)":"1px solid rgba(255,90,90,0.15)", borderRadius:22, padding:"20px 18px" }}>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 4px" }}>{dropped>0?"Bajaste":"Subiste"}</p>
          <p style={{ color:dropped>0?"#C8F55A":"#FF6B6B", fontSize:44, fontWeight:900, margin:0, letterSpacing:"-2px", lineHeight:1 }}>{Math.abs(dropped)}</p>
          <p style={{ color:"rgba(255,255,255,0.25)", fontSize:12, margin:"4px 0 0" }}>días vs {first.month}</p>
        </div>
        <div style={{ background:savedMoney>0?"rgba(200,245,90,0.06)":"rgba(255,90,90,0.06)", border:savedMoney>0?"1px solid rgba(200,245,90,0.15)":"1px solid rgba(255,90,90,0.15)", borderRadius:22, padding:"20px 18px" }}>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 4px" }}>{savedMoney>0?"Ahorraste":"Gastaste más"}</p>
          <p style={{ color:savedMoney>0?"#C8F55A":"#FF6B6B", fontSize:20, fontWeight:900, margin:0, letterSpacing:"-0.5px", lineHeight:1.2 }}>{formatCOP(Math.abs(savedMoney))}</p>
          <p style={{ color:"rgba(255,255,255,0.25)", fontSize:12, margin:"4px 0 0" }}>vs {first.month}</p>
        </div>
      </div>

      {/* Bar chart */}
      <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:22, padding:"20px", marginBottom:12 }}>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 18px" }}>Días por mes</p>
        <div style={{ display:"flex", alignItems:"flex-end", gap:10, height:100 }}>
          {chartData.map((item,i)=>{
            const isLast = i===chartData.length-1;
            const h = Math.max(6,(item.days/max)*100);
            return (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
                <span style={{ color:isLast?"#C8F55A":"rgba(255,255,255,0.35)", fontSize:12, fontWeight:700 }}>{item.days}</span>
                <div style={{ width:"100%", height:h, background:isLast?"#C8F55A":"rgba(255,255,255,0.09)", borderRadius:7 }} />
                <span style={{ color:"rgba(255,255,255,0.25)", fontSize:11, fontWeight:600 }}>{item.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Moment breakdown */}
      <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:22, padding:"20px", marginBottom:12 }}>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 14px" }}>¿Cuándo más?</p>
        {Object.entries(MOMENT_CONFIG).map(([key,cfg])=>{
          const count = momentCount[key]||0;
          const total = Object.values(momentCount).reduce((a,b)=>a+b,0);
          const pct = total>0?count/total:0;
          return (
            <div key={key} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ color:"rgba(255,255,255,0.55)", fontSize:14 }}>{cfg.emoji} {cfg.label}</span>
                <span style={{ color:"rgba(255,255,255,0.3)", fontSize:13, fontWeight:600 }}>{count} veces</span>
              </div>
              <div style={{ height:5, background:"rgba(255,255,255,0.06)", borderRadius:3 }}>
                <div style={{ width:`${pct*100}%`, height:"100%", background:cfg.color, borderRadius:3, transition:"width 0.6s" }} />
              </div>
            </div>
          );
        })}
        <div style={{ height:1, background:"rgba(255,255,255,0.05)", margin:"14px 0" }} />
        <div style={{ display:"flex", gap:10 }}>
          {[{key:"solo",emoji:"🧘",label:"Solo"},{key:"acompañado",emoji:"👥",label:"Acompañado"}].map(opt=>(
            <div key={opt.key} style={{ flex:1, background:"rgba(255,255,255,0.03)", borderRadius:14, padding:"12px", textAlign:"center" }}>
              <p style={{ fontSize:20, margin:"0 0 4px" }}>{opt.emoji}</p>
              <p style={{ color:"#fff", fontSize:20, fontWeight:900, margin:"0 0 2px", letterSpacing:"-0.5px" }}>{companyCount[opt.key]||0}</p>
              <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, margin:0 }}>{opt.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height:24 }} />
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function BottomSheet({ onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100 }} onClick={onClose}>
      <style>{`@keyframes su{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={e=>e.stopPropagation()} style={{ width:390, background:"#1A1A1A", borderRadius:"30px 30px 0 0", padding:"28px 28px 44px", border:"1px solid rgba(255,255,255,0.08)", animation:"su 0.35s cubic-bezier(0.16,1,0.3,1)" }}>
        {children}
      </div>
    </div>
  );
}

function ConsumeModal({ draft, toggleMoment, setDraft, confirmConsume }) {
  const canConfirm = draft.moments.length>0 && draft.company;
  return (
    <>
      <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", margin:"0 0 6px" }}>Registrar consumo</p>
      <h2 style={{ color:"#fff", fontSize:24, fontWeight:800, margin:"0 0 6px", letterSpacing:"-0.5px" }}>¿Cuándo consumiste?</h2>
      <p style={{ color:"rgba(255,255,255,0.3)", fontSize:13, margin:"0 0 14px" }}>Podés marcar más de uno</p>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
        {Object.entries(MOMENT_CONFIG).map(([key,cfg])=>{
          const sel = draft.moments.includes(key);
          return (
            <button key={key} onClick={()=>toggleMoment(key)} style={{ padding:"14px 18px", borderRadius:16, cursor:"pointer", background:sel?`${cfg.color}15`:"rgba(255,255,255,0.04)", border:sel?`1px solid ${cfg.color}50`:"1px solid rgba(255,255,255,0.07)", color:sel?cfg.color:"rgba(255,255,255,0.7)", fontSize:15, fontWeight:600, display:"flex", alignItems:"center", gap:12, textAlign:"left", transition:"all 0.15s", fontFamily:"inherit" }}>
              <span style={{ fontSize:20 }}>{cfg.emoji}</span>
              <span>{cfg.label}</span>
              {sel&&<span style={{ marginLeft:"auto" }}>✓</span>}
            </button>
          );
        })}
      </div>
      <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 10px" }}>¿Con quién?</p>
      <div style={{ display:"flex", gap:8, marginBottom:22 }}>
        {[{key:"solo",emoji:"🧘",label:"Solo"},{key:"acompañado",emoji:"👥",label:"Acompañado"}].map(opt=>{
          const sel = draft.company===opt.key;
          return (
            <button key={opt.key} onClick={()=>setDraft(d=>({...d,company:opt.key}))} style={{ flex:1, padding:"14px", borderRadius:14, cursor:"pointer", background:sel?"rgba(200,245,90,0.12)":"rgba(255,255,255,0.04)", border:sel?"1px solid rgba(200,245,90,0.3)":"1px solid rgba(255,255,255,0.07)", color:sel?"#C8F55A":"rgba(255,255,255,0.5)", fontSize:14, fontWeight:700, transition:"all 0.15s", fontFamily:"inherit" }}>
              {opt.emoji} {opt.label}
            </button>
          );
        })}
      </div>
      <button onClick={confirmConsume} disabled={!canConfirm} style={{ ...primaryBtn, opacity:canConfirm?1:0.35, cursor:canConfirm?"pointer":"default" }}>Guardar</button>
    </>
  );
}

function PurchaseModal({ value, setValue, confirm }) {
  return (
    <>
      <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", margin:"0 0 6px" }}>Registrar compra</p>
      <h2 style={{ color:"#fff", fontSize:24, fontWeight:800, margin:"0 0 22px", letterSpacing:"-0.5px" }}>¿Cuánto gastaste?</h2>
      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"18px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ color:"rgba(255,255,255,0.3)", fontSize:22, fontWeight:700 }}>$</span>
        <input type="number" placeholder="0" value={value} onChange={e=>setValue(e.target.value)} style={{ background:"none", border:"none", outline:"none", color:"#fff", fontSize:32, fontWeight:900, letterSpacing:"-1px", width:"100%", fontFamily:"inherit" }} />
        <span style={{ color:"rgba(255,255,255,0.2)", fontSize:14 }}>COP</span>
      </div>
      {value && parseInt(value)>0 && <p style={{ color:"rgba(255,255,255,0.3)", fontSize:14, textAlign:"center", margin:"0 0 18px" }}>${parseInt(value).toLocaleString("es-CO")} pesos</p>}
      <button onClick={confirm} disabled={!value||parseInt(value)<=0} style={{ ...primaryBtn, opacity:value&&parseInt(value)>0?1:0.35, cursor:value&&parseInt(value)>0?"pointer":"default" }}>Guardar compra</button>
    </>
  );
}
