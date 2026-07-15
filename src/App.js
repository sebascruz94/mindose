import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["L","M","X","J","V","S","D"];

const MOMENT_CONFIG = {
  morning:   { label: "Mañana",  emoji: "🌅", color: "#FFB347" },
  afternoon: { label: "Tarde",   emoji: "☀️",  color: "#FFD700" },
  night:     { label: "Noche",   emoji: "🌙",  color: "#C8F55A" },
};

const TODAY = new Date();

function isoToDateStr(iso) {
  return new Date(iso + 'T12:00:00').toDateString();
}

function dateStrToISO(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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
  const [screen, setScreen] = useState("loading");
  const [user, setUser] = useState(null);
  const [appView, setAppView] = useState("home");
  const [logs, setLogs] = useState({});
  const [purchases, setPurchases] = useState([]);
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState({ moments:[], company:null });
  const [purchaseDraft, setPurchaseDraft] = useState("");
  const [trackingDate, setTrackingDate] = useState({ year: TODAY.getFullYear(), month: TODAY.getMonth() });
  const [dayDetail, setDayDetail] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setTimeout(()=>setMounted(true), 60); }, []);

  useEffect(() => {
    const fallback = setTimeout(() => setScreen("login"), 6000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(fallback);
      if (session?.user) {
        setUser(session.user);
        setScreen("app");
      } else {
        setScreen("login");
      }
    }).catch(() => {
      clearTimeout(fallback);
      setScreen("login");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setScreen("app");
      } else {
        setUser(null);
        setScreen("login");
        setLogs({});
        setPurchases([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchLogs(user.id);
    fetchPurchases(user.id);
  }, [user]);

  async function fetchLogs(userId) {
    const { data } = await supabase
      .from('logs')
      .select('*')
      .eq('user_id', userId);
    if (data) {
      const map = {};
      data.forEach(row => {
        map[isoToDateStr(row.date)] = { smoked: true, moments: row.moments, company: row.company, id: row.id };
      });
      setLogs(map);
    }
  }

  async function fetchPurchases(userId) {
    const { data } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', userId);
    if (data) {
      setPurchases(data.map(row => ({
        id: row.id,
        date: isoToDateStr(row.date),
        amount: row.amount,
      })));
    }
  }


  const todayStr = TODAY.toDateString();
  const todayLog = logs[todayStr];
  const smokedToday = todayLog?.smoked;
  const cleanDaysThisWeek = getWeekCleanDays(logs);

  const thisMonth = getMonthStats(logs, purchases, TODAY.getFullYear(), TODAY.getMonth());

  const chartData = Array.from({length:4},(_,i)=>{
    const m = TODAY.getMonth()-i; const y = m<0?TODAY.getFullYear()-1:TODAY.getFullYear(); const realM=((m%12)+12)%12;
    const s = getMonthStats(logs, purchases, y, realM);
    return { month: MONTHS[realM], year: y, ...s };
  }).reverse();

  function toggleMoment(m) {
    setDraft(d => ({ ...d, moments: d.moments.includes(m)?d.moments.filter(x=>x!==m):[...d.moments,m] }));
  }

  async function confirmConsume() {
    if (!draft.moments.length || !draft.company) return;
    const isoDate = dateStrToISO(todayStr);
    const existing = logs[todayStr];

    if (existing?.id) {
      const { data, error } = await supabase
        .from('logs')
        .update({ moments: draft.moments, company: draft.company })
        .eq('id', existing.id)
        .select()
        .single();
      if (!error && data) {
        setLogs(prev => ({ ...prev, [todayStr]: { smoked: true, moments: data.moments, company: data.company, id: data.id } }));
      }
    } else {
      const { data, error } = await supabase
        .from('logs')
        .insert({ user_id: user.id, date: isoDate, moments: draft.moments, company: draft.company })
        .select()
        .single();
      if (!error && data) {
        setLogs(prev => ({ ...prev, [todayStr]: { smoked: true, moments: data.moments, company: data.company, id: data.id } }));
      }
    }
    setModal(null);
  }

  async function confirmPurchase() {
    const amt = parseInt(purchaseDraft.replace(/\D/g,""));
    if (!amt) return;
    const isoDate = dateStrToISO(todayStr);
    const { data, error } = await supabase
      .from('purchases')
      .insert({ user_id: user.id, date: isoDate, amount: amt })
      .select()
      .single();
    if (!error && data) {
      setPurchases(prev => [...prev, { id: data.id, date: isoToDateStr(data.date), amount: data.amount }]);
    }
    setPurchaseDraft("");
    setModal(null);
  }

  async function deleteLog(logId, dateStr) {
    if (logId) await supabase.from('logs').delete().eq('id', logId);
    setLogs(prev => { const n = {...prev}; delete n[dateStr]; return n; });
  }

  async function updateLog(logId, dateStr, moments, company) {
    const { data, error } = await supabase
      .from('logs')
      .update({ moments, company })
      .eq('id', logId)
      .select()
      .single();
    if (!error && data) {
      setLogs(prev => ({ ...prev, [dateStr]: { smoked: true, moments: data.moments, company: data.company, id: data.id } }));
    }
  }

  async function deletePurchase(purchaseId) {
    await supabase.from('purchases').delete().eq('id', purchaseId);
    setPurchases(prev => prev.filter(p => p.id !== purchaseId));
  }

  async function updatePurchase(purchaseId, amount) {
    const { data, error } = await supabase
      .from('purchases')
      .update({ amount })
      .eq('id', purchaseId)
      .select()
      .single();
    if (!error && data) {
      setPurchases(prev => prev.map(p => p.id === purchaseId ? { ...p, amount: data.amount } : p));
    }
  }

  async function addLogForDate(dateStr, moments, company) {
    const isoDate = dateStrToISO(dateStr);
    const { data, error } = await supabase
      .from('logs')
      .insert({ user_id: user.id, date: isoDate, moments, company })
      .select()
      .single();
    if (!error && data) {
      setLogs(prev => ({ ...prev, [dateStr]: { smoked: true, moments: data.moments, company: data.company, id: data.id } }));
    }
  }

  async function addPurchaseForDate(dateStr, amount) {
    const isoDate = dateStrToISO(dateStr);
    const { data, error } = await supabase
      .from('purchases')
      .insert({ user_id: user.id, date: isoDate, amount })
      .select()
      .single();
    if (!error && data) {
      setPurchases(prev => [...prev, { id: data.id, date: isoToDateStr(data.date), amount: data.amount }]);
    }
  }

  async function removeToday() {
    deleteLog(logs[todayStr]?.id, todayStr);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
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
          {screen==="loading" && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:760 }}>
              <span style={{ color:"rgba(255,255,255,0.2)", fontSize:14 }}>Cargando…</span>
            </div>
          )}
          {screen==="login" && <LoginScreen setScreen={setScreen} />}
          {screen==="signup" && <SignupScreen setScreen={setScreen} />}
          {screen==="app" && (
            <>
              {appView==="home" && <HomeView today={TODAY} smokedToday={smokedToday} todayLog={todayLog} thisMonth={thisMonth} cleanDaysThisWeek={cleanDaysThisWeek} chartData={chartData} openConsume={()=>{setDraft({moments:[],company:null});setModal("consume");}} openPurchase={()=>{setPurchaseDraft("");setModal("purchase");}} removeToday={removeToday} setAppView={setAppView} onLogout={handleLogout} />}
              {appView==="tracking" && <TrackingView trackingDate={trackingDate} trackingStats={trackingStats} trackingCells={trackingCells} logs={logs} purchaseDates={purchaseDates} today={TODAY} navigate={navigateTracking} isCurrentMonth={isTrackingCurrentMonth} setAppView={setAppView} onDayPress={(dateStr) => { setDayDetail(dateStr); setModal("dayDetail"); }} />}
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
      {modal==="dayDetail" && dayDetail && (
        <BottomSheet onClose={()=>{ setModal(null); setDayDetail(null); }}>
          <DayDetailSheet
            dateStr={dayDetail}
            log={logs[dayDetail]}
            dayPurchases={purchases.filter(p => p.date === dayDetail)}
            onDeleteLog={deleteLog}
            onUpdateLog={updateLog}
            onDeletePurchase={deletePurchase}
            onUpdatePurchase={updatePurchase}
            onAddLog={addLogForDate}
            onAddPurchase={addPurchaseForDate}
            onClose={()=>{ setModal(null); setDayDetail(null); }}
          />
        </BottomSheet>
      )}
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const inputErr = { ...inputStyle, border:"1px solid rgba(255,107,107,0.4)" };
const errText = { color:"#FF6B6B", fontSize:12, margin:"5px 0 0 4px", fontWeight:500 };

function FieldError({ msg }) {
  if (!msg) return null;
  return <p style={errText}>{msg}</p>;
}

function LoginScreen({ setScreen }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const errs = {};
    if (!email.trim()) errs.email = "Ingresa tu correo";
    if (!password) errs.password = "Ingresa tu contraseña";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes("invalid login credentials") ||
          error.message.toLowerCase().includes("invalid email or password")) {
        setErrors({ password: "Email o contraseña incorrectos" });
      } else if (error.message.toLowerCase().includes("email not confirmed")) {
        setErrors({ general: "Confirma tu correo antes de entrar" });
      } else {
        setErrors({ general: error.message });
      }
    }
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 32px", minHeight:760 }}>
      <div style={{ marginBottom:48 }}>
        <div style={{ width:52, height:52, background:"#C8F55A", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
          <span style={{ fontSize:26 }}>◎</span>
        </div>
        <h1 style={{ color:"#fff", fontSize:42, fontWeight:900, margin:0, letterSpacing:"-2px" }}>Mindose</h1>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:15, margin:"8px 0 0" }}>Control consciente de tu consumo.</p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:12 }}>
        <input
          placeholder="Correo"
          value={email}
          onChange={e => { setEmail(e.target.value); setErrors(v => ({...v, email:null, general:null})); }}
          style={errors.email ? inputErr : inputStyle}
        />
        <FieldError msg={errors.email} />
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:errors.password||errors.general ? 8 : 24 }}>
        <input
          placeholder="Contraseña"
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setErrors(v => ({...v, password:null, general:null})); }}
          onKeyDown={e => e.key==="Enter" && handleSubmit()}
          style={errors.password ? inputErr : inputStyle}
        />
        <FieldError msg={errors.password} />
        <FieldError msg={errors.general} />
      </div>
      {(errors.password || errors.general) && <div style={{ height:16 }} />}

      <button onClick={handleSubmit} disabled={loading} style={{ ...primaryBtn, opacity:loading?0.7:1 }}>
        {loading ? (
          <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <span style={{ width:14, height:14, border:"2px solid rgba(0,0,0,0.3)", borderTop:"2px solid #0A0A0A", borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }} />
            Entrando…
          </span>
        ) : "Entrar"}
      </button>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <button onClick={() => setScreen("signup")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", fontSize:14, cursor:"pointer", marginTop:20, padding:8, fontFamily:"inherit" }}>
        ¿No tienes cuenta? <span style={{ color:"#C8F55A", fontWeight:700 }}>Créala aquí</span>
      </button>
    </div>
  );
}

function SignupScreen({ setScreen }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    const errs = {};
    if (!name.trim()) errs.name = "Ingresa tu nombre";
    if (!email.trim()) {
      errs.email = "Ingresa tu correo";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = "Correo no válido";
    }
    if (!password) {
      errs.password = "Ingresa una contraseña";
    } else if (password.length < 6) {
      errs.password = "Mínimo 6 caracteres";
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already exists")) {
        setErrors({ email: "Este correo ya tiene una cuenta" });
      } else if (msg.includes("password")) {
        setErrors({ password: "Mínimo 6 caracteres" });
      } else if (msg.includes("email") || msg.includes("invalid format")) {
        setErrors({ email: "Correo no válido" });
      } else {
        setErrors({ general: error.message });
      }
    } else if (!data.session) {
      setSuccess(true);
    }
    // si hay session, onAuthStateChange en root redirige automáticamente
  }

  if (success) {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"0 32px", minHeight:760, textAlign:"center" }}>
        <div style={{ width:64, height:64, background:"rgba(200,245,90,0.12)", border:"1px solid rgba(200,245,90,0.3)", borderRadius:20, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:24, fontSize:28 }}>✉️</div>
        <h2 style={{ color:"#fff", fontSize:26, fontWeight:900, margin:"0 0 10px", letterSpacing:"-0.5px" }}>Revisa tu correo</h2>
        <p style={{ color:"rgba(255,255,255,0.4)", fontSize:15, margin:"0 0 6px", lineHeight:1.5 }}>Te enviamos un link de confirmación a</p>
        <p style={{ color:"#C8F55A", fontSize:15, fontWeight:700, margin:"0 0 36px" }}>{email}</p>
        <button onClick={() => setScreen("login")} style={{ ...primaryBtn, maxWidth:220 }}>Ir al inicio</button>
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 32px", minHeight:760 }}>
      <button onClick={() => setScreen("login")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontSize:22, cursor:"pointer", padding:0, marginBottom:28, textAlign:"left", fontFamily:"inherit" }}>←</button>
      <div style={{ marginBottom:36 }}>
        <div style={{ width:52, height:52, background:"#C8F55A", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
          <span style={{ fontSize:26 }}>◎</span>
        </div>
        <h1 style={{ color:"#fff", fontSize:34, fontWeight:900, margin:0, letterSpacing:"-1px" }}>Crear cuenta</h1>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:14, margin:"6px 0 0" }}>Tu información es privada y solo tuya.</p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:12 }}>
        <input
          placeholder="Tu nombre"
          value={name}
          onChange={e => { setName(e.target.value); setErrors(v => ({...v, name:null})); }}
          style={errors.name ? inputErr : inputStyle}
        />
        <FieldError msg={errors.name} />
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:12 }}>
        <input
          placeholder="Correo"
          value={email}
          onChange={e => { setEmail(e.target.value); setErrors(v => ({...v, email:null})); }}
          style={errors.email ? inputErr : inputStyle}
        />
        <FieldError msg={errors.email} />
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:errors.password||errors.general ? 8 : 28 }}>
        <input
          placeholder="Contraseña (mín. 6 caracteres)"
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setErrors(v => ({...v, password:null})); }}
          onKeyDown={e => e.key==="Enter" && handleSubmit()}
          style={errors.password ? inputErr : inputStyle}
        />
        <FieldError msg={errors.password} />
        <FieldError msg={errors.general} />
      </div>
      {(errors.password || errors.general) && <div style={{ height:20 }} />}

      <button onClick={handleSubmit} disabled={loading} style={{ ...primaryBtn, opacity:loading?0.7:1 }}>
        {loading ? (
          <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <span style={{ width:14, height:14, border:"2px solid rgba(0,0,0,0.3)", borderTop:"2px solid #0A0A0A", borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }} />
            Creando cuenta…
          </span>
        ) : "Crear cuenta"}
      </button>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeView({ today, smokedToday, todayLog, thisMonth, cleanDaysThisWeek, chartData, openConsume, openPurchase, removeToday, setAppView, onLogout }) {
  const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const prev = chartData[chartData.length-2];
  const trend = prev ? prev.days - thisMonth.days : 0;

  return (
    <div style={{ padding:"20px 24px 0" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
        <div>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:13, fontWeight:600, margin:0, letterSpacing:"0.05em", textTransform:"uppercase" }}>{dayNames[today.getDay()]}</p>
          <h1 style={{ color:"#fff", fontSize:30, fontWeight:900, margin:"3px 0 0", letterSpacing:"-0.8px" }}>{today.getDate()} de {monthNames[today.getMonth()]}</h1>
        </div>
        <button onClick={onLogout} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"8px 14px", color:"rgba(255,255,255,0.3)", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", marginTop:4, whiteSpace:"nowrap" }}>Salir</button>
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
function TrackingView({ trackingDate, trackingStats, trackingCells, logs, purchaseDates, today, navigate, isCurrentMonth, setAppView, onDayPress }) {
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

          const isClickable = !isFuture;
          return (
            <div key={i} onClick={isClickable ? () => onDayPress(date.toDateString()) : undefined} style={{ aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderRadius:12, background:log?`${mainColor}18`:isToday?"rgba(255,255,255,0.07)":"transparent", border:isToday?"1px solid rgba(255,255,255,0.18)":log?`1px solid ${mainColor}35`:"1px solid transparent", gap:1, cursor:isClickable?"pointer":"default", transition:"opacity 0.15s", WebkitTapHighlightColor:"transparent" }}>
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

// ─── DAY DETAIL SHEET ─────────────────────────────────────────────────────────
function DayDetailSheet({ dateStr, log, dayPurchases, onDeleteLog, onUpdateLog, onDeletePurchase, onUpdatePurchase, onAddLog, onAddPurchase, onClose }) {
  const [mode, setMode] = useState("view");
  const [logDraft, setLogDraft] = useState({ moments: log?.moments ? [...log.moments] : [], company: log?.company || null });
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [purchaseAmountDraft, setPurchaseAmountDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (log) setLogDraft({ moments: [...log.moments], company: log.company });
  }, [log]);

  const dateObj = new Date(dateStr);
  const DAY_NAMES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const dateLabel = `${DAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()} de ${MONTH_NAMES[dateObj.getMonth()]}`;

  function toggleLogMoment(m) {
    setLogDraft(d => ({ ...d, moments: d.moments.includes(m) ? d.moments.filter(x => x !== m) : [...d.moments, m] }));
  }

  async function handleSaveLog() {
    if (!logDraft.moments.length || !logDraft.company) return;
    setSaving(true);
    if (log) {
      await onUpdateLog(log.id, dateStr, logDraft.moments, logDraft.company);
    } else {
      await onAddLog(dateStr, logDraft.moments, logDraft.company);
    }
    setSaving(false);
    setMode("view");
  }

  async function handleSavePurchase() {
    const amt = parseInt(purchaseAmountDraft.replace(/\D/g, ""));
    if (!amt) return;
    setSaving(true);
    if (editingPurchaseId) {
      await onUpdatePurchase(editingPurchaseId, amt);
    } else {
      await onAddPurchase(dateStr, amt);
    }
    setSaving(false);
    setPurchaseAmountDraft("");
    setMode("view");
  }

  async function handleDeleteLog() {
    setSaving(true);
    await onDeleteLog(log.id, dateStr);
    setSaving(false);
  }

  async function handleDeletePurchase(id) {
    setSaving(true);
    await onDeletePurchase(id);
    setSaving(false);
  }

  if (mode === "editLog") {
    const canSave = logDraft.moments.length > 0 && logDraft.company;
    const isAdding = !log;
    return (
      <>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <button onClick={() => { setMode("view"); setLogDraft({ moments: log?.moments ? [...log.moments] : [], company: log?.company || null }); }} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontSize:22, cursor:"pointer", padding:0, fontFamily:"inherit" }}>←</button>
          <p style={{ color:"rgba(255,255,255,0.4)", fontSize:13, fontWeight:600, margin:0 }}>{isAdding ? "Agregar consumo" : "Editar consumo"} · {dateLabel}</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
          {Object.entries(MOMENT_CONFIG).map(([key, cfg]) => {
            const sel = logDraft.moments.includes(key);
            return (
              <button key={key} onClick={() => toggleLogMoment(key)} style={{ padding:"14px 18px", borderRadius:16, cursor:"pointer", background:sel?`${cfg.color}15`:"rgba(255,255,255,0.04)", border:sel?`1px solid ${cfg.color}50`:"1px solid rgba(255,255,255,0.07)", color:sel?cfg.color:"rgba(255,255,255,0.7)", fontSize:15, fontWeight:600, display:"flex", alignItems:"center", gap:12, textAlign:"left", transition:"all 0.15s", fontFamily:"inherit" }}>
                <span style={{ fontSize:20 }}>{cfg.emoji}</span>
                <span>{cfg.label}</span>
                {sel && <span style={{ marginLeft:"auto" }}>✓</span>}
              </button>
            );
          })}
        </div>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", margin:"0 0 10px" }}>¿Con quién?</p>
        <div style={{ display:"flex", gap:8, marginBottom:22 }}>
          {[{key:"solo",emoji:"🧘",label:"Solo"},{key:"acompañado",emoji:"👥",label:"Acompañado"}].map(opt => {
            const sel = logDraft.company === opt.key;
            return (
              <button key={opt.key} onClick={() => setLogDraft(d => ({...d, company: opt.key}))} style={{ flex:1, padding:"14px", borderRadius:14, cursor:"pointer", background:sel?"rgba(200,245,90,0.12)":"rgba(255,255,255,0.04)", border:sel?"1px solid rgba(200,245,90,0.3)":"1px solid rgba(255,255,255,0.07)", color:sel?"#C8F55A":"rgba(255,255,255,0.5)", fontSize:14, fontWeight:700, transition:"all 0.15s", fontFamily:"inherit" }}>
                {opt.emoji} {opt.label}
              </button>
            );
          })}
        </div>
        <button onClick={handleSaveLog} disabled={!canSave || saving} style={{ ...primaryBtn, opacity:canSave&&!saving?1:0.35, cursor:canSave&&!saving?"pointer":"default" }}>{saving?"Guardando…": isAdding ? "Guardar" : "Guardar cambios"}</button>
      </>
    );
  }

  if (mode === "editPurchase") {
    const canSave = purchaseAmountDraft && parseInt(purchaseAmountDraft) > 0;
    const isAdding = !editingPurchaseId;
    return (
      <>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <button onClick={() => { setMode("view"); setPurchaseAmountDraft(""); setEditingPurchaseId(null); }} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontSize:22, cursor:"pointer", padding:0, fontFamily:"inherit" }}>←</button>
          <p style={{ color:"rgba(255,255,255,0.4)", fontSize:13, fontWeight:600, margin:0 }}>{isAdding ? "Agregar compra" : "Editar compra"} · {dateLabel}</p>
        </div>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"18px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:"rgba(255,255,255,0.3)", fontSize:22, fontWeight:700 }}>$</span>
          <input autoFocus type="number" placeholder="0" value={purchaseAmountDraft} onChange={e => setPurchaseAmountDraft(e.target.value)} style={{ background:"none", border:"none", outline:"none", color:"#fff", fontSize:32, fontWeight:900, letterSpacing:"-1px", width:"100%", fontFamily:"inherit" }} />
          <span style={{ color:"rgba(255,255,255,0.2)", fontSize:14 }}>COP</span>
        </div>
        {canSave && <p style={{ color:"rgba(255,255,255,0.3)", fontSize:14, textAlign:"center", margin:"0 0 18px" }}>${parseInt(purchaseAmountDraft).toLocaleString("es-CO")} pesos</p>}
        <button onClick={handleSavePurchase} disabled={!canSave || saving} style={{ ...primaryBtn, opacity:canSave&&!saving?1:0.35, cursor:canSave&&!saving?"pointer":"default" }}>{saving?"Guardando…": isAdding ? "Guardar" : "Guardar cambios"}</button>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom:20 }}>
        <p style={{ color:"rgba(255,255,255,0.3)", fontSize:11, fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase", margin:"0 0 4px" }}>Detalle del día</p>
        <h2 style={{ color:"#fff", fontSize:22, fontWeight:900, margin:0, letterSpacing:"-0.5px" }}>{dateLabel}</h2>
      </div>

      {log ? (
        <div style={{ background:"rgba(200,245,90,0.06)", border:"1px solid rgba(200,245,90,0.15)", borderRadius:20, padding:"18px", marginBottom:12 }}>
          <p style={{ color:"#C8F55A", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", margin:"0 0 12px" }}>Consumo registrado</p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
            {log.moments.map(m => (
              <span key={m} style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:"5px 12px", color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:600 }}>
                {MOMENT_CONFIG[m].emoji} {MOMENT_CONFIG[m].label}
              </span>
            ))}
            <span style={{ background:"rgba(255,255,255,0.06)", borderRadius:10, padding:"5px 12px", color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:600 }}>
              {log.company === "solo" ? "🧘 Solo" : "👥 Acompañado"}
            </span>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button disabled={saving} onClick={() => { setLogDraft({ moments: [...log.moments], company: log.company }); setMode("editLog"); }} style={{ flex:1, padding:"11px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"rgba(255,255,255,0.65)", fontSize:14, fontWeight:600, cursor:saving?"default":"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}>Editar</button>
            <button disabled={saving} onClick={handleDeleteLog} style={{ flex:1, padding:"11px", background:"rgba(255,80,80,0.08)", border:"1px solid rgba(255,80,80,0.18)", borderRadius:12, color:saving?"rgba(255,107,107,0.4)":"#FF6B6B", fontSize:14, fontWeight:600, cursor:saving?"default":"pointer", fontFamily:"inherit" }}>{saving?"Borrando…":"Borrar"}</button>
          </div>
        </div>
      ) : (
        <button disabled={saving} onClick={() => { setLogDraft({ moments: [], company: null }); setMode("editLog"); }} style={{ width:"100%", padding:"14px", background:"rgba(200,245,90,0.05)", border:"1px dashed rgba(200,245,90,0.25)", borderRadius:18, color:"rgba(200,245,90,0.6)", fontSize:14, fontWeight:600, cursor:"pointer", marginBottom:12, fontFamily:"inherit" }}>
          + Agregar consumo
        </button>
      )}

      {dayPurchases.length > 0 ? (
        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:20, padding:"18px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <p style={{ color:"rgba(255,255,255,0.4)", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", margin:0 }}>💰 Compra{dayPurchases.length > 1 ? "s" : ""}</p>
            <button disabled={saving} onClick={() => { setEditingPurchaseId(null); setPurchaseAmountDraft(""); setMode("editPurchase"); }} style={{ background:"none", border:"none", color:"rgba(200,245,90,0.5)", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", padding:0 }}>+ Agregar</button>
          </div>
          {dayPurchases.map(p => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:dayPurchases.length > 1 ? 10 : 0 }}>
              <span style={{ color:"#fff", fontSize:20, fontWeight:900, letterSpacing:"-0.5px", flex:1 }}>{formatCOP(p.amount)}</span>
              <button disabled={saving} onClick={() => { setEditingPurchaseId(p.id); setPurchaseAmountDraft(String(p.amount)); setMode("editPurchase"); }} style={{ padding:"8px 14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"rgba(255,255,255,0.65)", fontSize:13, fontWeight:600, cursor:saving?"default":"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}>Editar</button>
              <button disabled={saving} onClick={() => handleDeletePurchase(p.id)} style={{ padding:"8px 14px", background:"rgba(255,80,80,0.08)", border:"1px solid rgba(255,80,80,0.18)", borderRadius:10, color:saving?"rgba(255,107,107,0.4)":"#FF6B6B", fontSize:13, fontWeight:600, cursor:saving?"default":"pointer", fontFamily:"inherit" }}>{saving?"…":"Borrar"}</button>
            </div>
          ))}
        </div>
      ) : (
        <button disabled={saving} onClick={() => { setEditingPurchaseId(null); setPurchaseAmountDraft(""); setMode("editPurchase"); }} style={{ width:"100%", padding:"14px", background:"rgba(255,255,255,0.03)", border:"1px dashed rgba(255,255,255,0.12)", borderRadius:18, color:"rgba(255,255,255,0.3)", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
          + Agregar compra
        </button>
      )}
    </>
  );
}
