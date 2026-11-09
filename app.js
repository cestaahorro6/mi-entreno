/* Mi Entreno: web app 100% local, sin servicios, librerías ni cuentas. */
(() => {
  'use strict';
  const STORAGE_KEY = 'mi_entreno_offline_data_v1';
  const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const ICONS = ['🦵', '🏋️', '🎯', '🦿', '⚡', '💪'];
  const app = document.getElementById('app');
  const backupInput = document.getElementById('backup-import');
  const excelInput = document.getElementById('excel-import');
  const excelTop = document.getElementById('top-export-excel');
  const indicator = document.getElementById('save-indicator');
  const toastEl = document.getElementById('toast');
  const ui = {routineLimit: {}, weightLimit: 14, manageRoutine: '', weightEditing: '', progressRoutine: '', progressExercise: '', chartAll: false};
  let db, memoryOnly = false, linkedFile = null, filePermission = 'none', writeTimer = 0, isWriting = false, writeAgain = false, toastTimer = 0;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = esc;
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const maxWeek = () => Math.max(1, ...db.sessions.map(s => Number(s.week) || 0), ...db.weights.map(w => Number(w.week) || 0));
  const today = () => {const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const formatDate = (s) => {if(!s) return ''; const [y,m,d] = s.split('-').map(Number); return y && m && d ? new Date(y,m-1,d).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}) : s};
  const dayOfDate = (s) => {const [y,m,d] = s.split('-').map(Number); return (new Date(y,m-1,d).getDay()+6)%7};
  const kg = (v) => `${Number(v).toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:2})} kg`;
  const weekLabel = (w) => `Semana ${w}`;
  const routineOf = (id) => db.routines.find(r => r.id === id);
  const exerciseOf = (r, id) => r.exercises.find(x => x.id === id);
  const activeExercises = (r) => r.exercises.filter(e => !e.archived);
  const newId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const byLatest = (a,b) => (Number(b.week)-Number(a.week)) || String(b.date||'').localeCompare(String(a.date||'')) || String(b.id).localeCompare(String(a.id));
  const recentSessions = (id) => db.sessions.filter(s => s.routineId === id).sort(byLatest);
  const sortedWeights = () => [...db.weights].sort((a,b) => (Number(b.week)-Number(a.week)) || (Number(b.day)-Number(a.day)) || String(b.date||'').localeCompare(String(a.date||'')));
  const labelWeight = (w) => w.date ? formatDate(w.date) + ` · Semana ${w.week}` : `${weekLabel(w.week)} · ${DAYS[w.day]||'Día sin fecha'}`;
  const lastExercise = (rid,eid,excludeId,weekCeiling=Infinity) => db.sessions
    .filter(s => s.routineId===rid && s.id!==excludeId && Number(s.week)<=weekCeiling && s.entries && s.entries[eid])
    .sort(byLatest)[0];
  const iconFor = (r) => ICONS[Math.max(0, db.routines.indexOf(r)) % ICONS.length];
  const historical = (v) => v && v.source === 'excel' ? ' · Importado' : '';

  function validData(d) {
    return d && d.version === 1 && Array.isArray(d.routines) && Array.isArray(d.sessions) && Array.isArray(d.weights) &&
      d.routines.every(r => r && typeof r.id==='string' && typeof r.name==='string' && Array.isArray(r.exercises) && r.exercises.every(e=>e && typeof e.id==='string' && typeof e.name==='string')) &&
      d.sessions.every(s=>s && typeof s.id==='string' && typeof s.routineId==='string' && s.entries && typeof s.entries==='object' && !Array.isArray(s.entries)) &&
      d.weights.every(w=>w && typeof w.id==='string' && Number.isFinite(Number(w.kg)) && Number.isFinite(Number(w.week)));
  }
  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {const parsed = JSON.parse(stored); if (validData(parsed)) return parsed;}
    } catch (err) {console.warn('No se puede leer el almacenamiento',err); memoryOnly=true;}
    return copy(window.ENTRENO_SEED);
  }
  db = load();
  if (!Number.isFinite(Number(db.activeWeek)) || Number(db.activeWeek)<1) db.activeWeek=maxWeek()+1;
  if (!db.sessions.every(s=>typeof s.date==='string')) db.sessions.forEach(s=>{s.date=s.date||''});

  function toast(msg, error=false) {
    toastEl.textContent=msg; toastEl.classList.toggle('error',error); toastEl.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3300);
  }
  function updateIndicator(text,err=false) {
    indicator.innerHTML=`<span class="status-dot" style="${err?'background:#ff8a9b;box-shadow:none;':''}"></span> ${esc(text)}`;
  }
  function save() {
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(db));memoryOnly=false;updateIndicator(linkedFile && filePermission==='granted'?'Guardado · archivo':'Guardado aquí');}
    catch(err){memoryOnly=true;updateIndicator('Sin guardado local',true);toast('El navegador no permite guardar datos. Exporta una copia JSON.',true);console.error(err);}
    scheduleFileWrite();
  }
  save();
  function navigate(hash) {location.hash=hash; if (location.hash===hash) render();}
  const route = () => {const parts=(location.hash||'#inicio').slice(1).split('/');return {screen:parts[0]||'inicio',id:parts[1]||'',extra:parts[2]||''}};
  function heading(eyebrow,title,subtitle='') {return `<div class="page-heading"><div class="eyebrow">${esc(eyebrow)}</div><h1 class="page-title">${esc(title)}</h1>${subtitle?`<p class="subtitle">${esc(subtitle)}</p>`:''}</div>`;}
  const empty = (icon,title,msg) => `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(msg)}</p></div>`;
  function render() {
    const r = route();
    document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(r.screen==='rutina'||r.screen==='sesion'?'entrenos':r.screen)));
    let html='';
    if(r.screen==='inicio') html=homePage();
    else if(r.screen==='entrenos') html=workoutsPage();
    else if(r.screen==='rutina') html=routinePage(r.id);
    else if(r.screen==='sesion') html=sessionPage(r.id,r.extra);
    else if(r.screen==='peso') html=weightPage();
    else if(r.screen==='progreso') html=progressPage();
    else if(r.screen==='ajustes') html=settingsPage();
    else html=homePage();
    app.innerHTML=html;
    document.title=`Mi Entreno · ${({inicio:'Inicio',entrenos:'Rutinas',rutina:'Rutina',sesion:'Registrar sesión',peso:'Peso',progreso:'Progreso',ajustes:'Ajustes'}[r.screen]||'Inicio')}`;
  }
  function workoutCard(r) {
    const last=recentSessions(r.id)[0];
    const done=db.sessions.some(s=>s.routineId===r.id && Number(s.week)===Number(db.activeWeek));
    return `<article class="routine-card"><div class="routine-head"><div class="routine-symbol">${iconFor(r)}</div>${done?'<span class="pill done">✓ Registrado</span>':`<span class="pill">${activeExercises(r).length} ejercicios</span>`}</div><h3>${esc(r.name)}</h3><p>${last?`Último registro: semana ${esc(last.week)}`:'Aún sin registros'}</p><div class="routine-footer"><a href="#rutina/${encodeURIComponent(r.id)}" class="arrow-link">Ver historial ↗</a><a href="#sesion/nueva/${encodeURIComponent(r.id)}" class="btn btn-primary btn-small">+ Registrar</a></div></article>`;
  }
  function homePage() {
    const done=new Set(db.sessions.filter(s=>Number(s.week)===Number(db.activeWeek)).map(s=>s.routineId)).size;
    const all=sortedWeights(),latest=all[0];
    return `${heading('Tu espacio de entrenamiento','Vamos a por otra semana','Tus rutinas, tus marcas y tu evolución. Todo guardado en este dispositivo.')}
      <section class="hero"><div><div class="hero-kicker">Semana de entrenamiento</div><h2 class="hero-title">A tu ritmo.<br>Más fuerte.</h2><p class="hero-description">${done} de ${db.routines.length} rutinas registradas esta semana. Sigue donde lo dejaste.</p></div><div class="week-mini"><div class="week-label">SEMANA ACTIVA</div><div class="week-controller"><button class="week-nav" data-action="week-down" aria-label="Semana anterior">‹</button><span class="week-number">${db.activeWeek}</span><button class="week-nav" data-action="week-up" aria-label="Semana siguiente">›</button></div></div></section>
      <div class="stat-grid"><div class="stat-card"><div class="stat-top">Rutinas <span class="stat-icon">▦</span></div><strong class="stat-value">${db.routines.length}</strong><span class="stat-label">Entrenamientos</span></div><div class="stat-card"><div class="stat-top">Sesiones <span class="stat-icon">↗</span></div><strong class="stat-value">${db.sessions.length}</strong><span class="stat-label">Registradas</span></div><div class="stat-card"><div class="stat-top">Último peso <span class="stat-icon">⚖</span></div><strong class="stat-value">${latest?esc(Number(latest.kg).toLocaleString('es-ES',{maximumFractionDigits:1})):'—'}</strong><span class="stat-label">${latest?'kg · registrado':'Sin datos'}</span></div></div>
      <div class="section-top"><h2 class="section-title">Tus rutinas</h2><a class="arrow-link" href="#entrenos">Ver todas →</a></div><div class="routine-grid">${db.routines.map(workoutCard).join('')}</div>
      <div class="section-top"><h2 class="section-title">Accesos rápidos</h2></div><div class="toolbar-row"><a href="#peso" class="btn btn-outline">⚖ Añadir peso</a><a href="#progreso" class="btn btn-outline">⌁ Ver progreso</a><button class="btn btn-primary" data-action="save-excel">⇩ Guardar Excel</button></div><p class="footer-note">Sin cuentas, sin anuncios y sin conexión obligatoria. Tus datos no salen de este dispositivo.</p>`;
  }
  function workoutsPage() {
    return `${heading('Plan de entrenamiento','Mis rutinas','Consulta el historial de cada ejercicio o apunta la próxima sesión en segundos.')}
      <div class="routine-grid">${db.routines.map(workoutCard).join('')}</div><p class="footer-note">Las semanas originales se han conservado tal como estaban en tu Excel. Puedes seguir registrando desde la semana ${db.activeWeek} o elegir otra.</p>`;
  }
  function routinePage(id) {
    const r=routineOf(id); if(!r)return `${heading('Rutinas','No encuentro esta rutina')}<a href="#entrenos" class="btn btn-outline">Volver</a>`;
    const sessions=recentSessions(r.id), limit=ui.routineLimit[id]||8;
    return `<div class="page-heading"><a href="#entrenos" class="back-link">← Todas las rutinas</a><div class="eyebrow">Mi entrenamiento</div><div class="detail-head"><div><h1 class="page-title">${iconFor(r)} ${esc(r.name)}</h1><p class="subtitle">${r.exercises.length} ejercicios · ${sessions.length} semanas/sesiones registradas</p></div><a class="btn btn-primary" href="#sesion/nueva/${encodeURIComponent(r.id)}">+ Nueva sesión</a></div></div>
      <div class="section-top"><h2 class="section-title">Ejercicios</h2><button class="btn btn-outline btn-small" data-action="manage-exercises" data-id="${attr(r.id)}">${ui.manageRoutine===r.id?'Cerrar edición':'⚙ Gestionar'}</button></div>
      <div class="card exercise-list">${r.exercises.map((e,i)=>`<div class="exercise-list-item"><span class="exercise-number">${i+1}</span><div style="flex:1;min-width:0"><div class="exercise-name">${esc(e.name)}${e.archived?'<span class="muted"> (archivado)</span>':''}</div><div class="exercise-meta">${(() => {const s=lastExercise(r.id,e.id,'');return s?`Sem. ${s.week}: ${esc(s.entries[e.id])}`:'Sin registros todavía'})()}</div></div>${ui.manageRoutine===r.id?`<div class="stack" style="gap:5px"><button class="text-link" data-action="rename-exercise" data-id="${attr(e.id)}" data-routine="${attr(r.id)}">Renombrar</button><button class="text-link" data-action="toggle-exercise" data-id="${attr(e.id)}" data-routine="${attr(r.id)}">${e.archived?'Restaurar':'Archivar'}</button></div>`:''}</div>`).join('')}${ui.manageRoutine===r.id?`<button class="btn btn-soft" data-action="add-exercise" data-routine="${attr(r.id)}">+ Añadir ejercicio</button><div class="hint">Archivar un ejercicio lo oculta de las sesiones nuevas, pero conserva todos sus registros anteriores.</div>`:''}</div>
      <div class="section-top"><h2 class="section-title">Historial <span class="count-bubble">${sessions.length}</span></h2></div>
      <div class="stack">${sessions.length?sessions.slice(0,limit).map(s=>`<article class="session-card"><div class="session-head"><div><strong>${weekLabel(s.week)}</strong><div class="top-muted">${s.date?formatDate(s.date):'Sin fecha'}${historical(s)}</div></div><div class="toolbar-row"><a href="#sesion/editar/${encodeURIComponent(s.id)}" class="btn btn-outline btn-small">Editar</a><button class="btn btn-danger btn-small" data-action="delete-session" data-id="${attr(s.id)}" aria-label="Borrar sesión">✕</button></div></div>${r.exercises.filter(e=>s.entries[e.id]).map(e=>`<div class="session-row"><span>${esc(e.name)}</span><span>${esc(s.entries[e.id])}</span></div>`).join('')}${s.notes?`<div class="session-notes">${esc(s.notes)}</div>`:''}</article>`).join(''):empty('🗓','Todavía no hay sesiones','Añade tu primer entrenamiento.')}</div>
      ${limit<sessions.length?`<div class="section-top"><button data-action="more-sessions" data-id="${attr(r.id)}" class="btn btn-outline btn-block">Ver más sesiones (${sessions.length-limit} pendientes)</button></div>`:''}`;
  }
  function sessionPage(action,id) {
    const editing=action==='editar', session=editing?db.sessions.find(s=>s.id===id):null;
    const r=routineOf(editing?session?.routineId:id);
    if(!r || (editing&&!session))return `${heading('Sesiones','Sesión no encontrada')}<a href="#entrenos" class="btn btn-outline">Volver a rutinas</a>`;
    const week=editing?session.week:db.activeWeek;
    const ent=editing?session.entries:{};
    return `<div class="page-heading"><a href="#rutina/${encodeURIComponent(r.id)}" class="back-link">← ${esc(r.name)}</a><div class="eyebrow">${editing?'Editar registro':'Nuevo entrenamiento'}</div><h1 class="page-title">${esc(r.name)}</h1><p class="subtitle">Anota las cargas y repeticiones a tu manera (por ejemplo, 80x3x8 + D). Se guardan como texto para respetar tu sistema.</p></div>
      <form id="session-form" class="form-card" data-id="${attr(session?.id||'')}" data-routine="${attr(r.id)}">
      <div class="form-grid"><div class="field"><label for="session-date">Fecha de la sesión</label><input class="input" id="session-date" type="date" name="date" value="${attr(editing?session.date:today())}"></div><div class="field"><label for="session-week">Semana del plan</label><input class="input" id="session-week" type="number" min="1" max="9999" required name="week" value="${attr(week)}"></div></div>
      <div class="section-top"><h2 class="section-title">Ejercicios</h2><span class="section-caption">${activeExercises(r).length} activos</span></div>
      ${activeExercises(r).map((e,i)=>{const last=lastExercise(r.id,e.id,session?.id,Number(week));const prev=last?.entries?.[e.id]||'';return `<div class="exercise-entry"><div class="exercise-entry-top"><div><div class="exercise-entry-name">${i+1}. ${esc(e.name)}</div><div class="last-record">${last?`Anterior (sem. ${last.week}): ${esc(prev)}`:'Sin marca anterior'}</div></div></div><div class="entry-inputs"><input class="input" type="text" name="entry:${attr(e.id)}" value="${attr(ent[e.id]||'')}" placeholder="Peso × series × repeticiones" autocomplete="off"><button type="button" class="btn btn-outline btn-small" data-action="copy-last" data-routine="${attr(r.id)}" data-exercise="${attr(e.id)}" data-exclude="${attr(session?.id||'')}">Copiar ↶</button></div></div>`}).join('')}
      ${editing?r.exercises.filter(e=>e.archived && ent[e.id]).map(e=>`<div class="exercise-entry"><div class="exercise-entry-name">${esc(e.name)} · archivado</div><input class="input" name="entry:${attr(e.id)}" value="${attr(ent[e.id]||'')}"></div>`).join(''):''}
      <div class="field" style="margin-top:18px"><label for="session-notes">Notas de la sesión (opcional)</label><textarea class="textarea" id="session-notes" name="notes" placeholder="Sensaciones, técnica, objetivos...">${esc(session?.notes||'')}</textarea></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">✓ Guardar sesión</button><a class="btn btn-outline" href="#rutina/${encodeURIComponent(r.id)}">Cancelar</a></div></form>`;
  }
  function weightAverages() {
    const groups=new Map();
    for(const w of db.weights){const week=Number(w.week);if(!Number.isFinite(week))continue;if(!groups.has(week))groups.set(week,[]);groups.get(week).push(Number(w.kg))}
    return [...groups].sort((a,b)=>a[0]-b[0]).map(([week,values])=>({x:week,y:values.reduce((a,b)=>a+b,0)/values.length,n:values.length}));
  }
  function weightPage() {
    const weights=sortedWeights(),edit=ui.weightEditing?db.weights.find(w=>w.id===ui.weightEditing):null,means=weightAverages();
    const last=weights[0],lastAvg=means[means.length-1];
    return `${heading('Seguimiento corporal','Control de peso','Anota tu peso cuando quieras y compara medias semanales con tu historial del Excel.')}
      <div class="stat-grid"><div class="stat-card"><div class="stat-top">Último registro</div><strong class="stat-value">${last?Number(last.kg).toLocaleString('es-ES',{maximumFractionDigits:2}):'—'}</strong><span class="stat-label">kilogramos</span></div><div class="stat-card"><div class="stat-top">Media · sem. ${lastAvg?.x||'—'}</div><strong class="stat-value">${lastAvg?lastAvg.y.toLocaleString('es-ES',{maximumFractionDigits:2}):'—'}</strong><span class="stat-label">kg de media</span></div><div class="stat-card"><div class="stat-top">Pesajes</div><strong class="stat-value">${weights.length}</strong><span class="stat-label">registros totales</span></div></div>
      <div class="chart-card"><div class="chart-head"><div><div class="chart-title">Evolución del peso</div><div class="chart-sub">Promedio de cada semana (kg)</div></div><button class="btn btn-outline btn-small" data-action="chart-all">${ui.chartAll?'Últimas 20':'Ver todo'}</button></div><div class="chart-wrap">${lineChart(ui.chartAll?means:means.slice(-20),'kg','weight')}</div></div>
      <div class="section-top"><h2 class="section-title">${edit?'Editar peso':'Añadir peso'}</h2></div><div class="weight-layout"><div><form id="weight-form" class="form-card" data-id="${attr(edit?.id||'')}"><div class="form-grid"><div class="field"><label for="weight-date">Fecha ${edit?'(opcional para histórico)':''}</label><input class="input" type="date" id="weight-date" name="date" value="${attr(edit?.date??today())}" ${edit?'':'required'}></div><div class="field"><label for="weight-week">Semana</label><input class="input" type="number" min="1" max="9999" required id="weight-week" name="week" value="${attr(edit?.week??db.activeWeek)}"></div></div><div class="form-grid"><div class="field"><label for="weight-kg">Peso (kg)</label><input class="input" id="weight-kg" name="kg" type="text" inputmode="decimal" required placeholder="Ej. 82,4" value="${attr(edit?.kg??'')}"></div><div class="field"><label for="weight-day">Día de la semana</label><select class="select" id="weight-day" name="day">${DAYS.map((d,i)=>`<option value="${i}" ${(edit?.day??dayOfDate(today()))===i?'selected':''}>${d}</option>`).join('')}</select></div></div><div class="hint">La fecha marca automáticamente el día. Los pesajes antiguos del Excel mantienen su semana y día, ya que no había fechas concretas.</div><div class="form-actions"><button class="btn btn-primary" type="submit">✓ ${edit?'Actualizar':'Guardar'} peso</button>${edit?'<button class="btn btn-outline" type="button" data-action="cancel-weight">Cancelar</button>':''}</div></form></div>
      <div><div class="card"><div class="section-top" style="margin-top:0"><h2 class="section-title">Últimos registros</h2><span class="count-bubble">${weights.length}</span></div>${weights.length?weights.slice(0,ui.weightLimit).map(w=>`<div class="weight-entry"><div><div class="weight-number">${esc(kg(w.kg))}</div><div class="top-muted">${esc(labelWeight(w))}${historical(w)}</div></div><div class="toolbar-row"><button class="btn btn-outline btn-small" data-action="edit-weight" data-id="${attr(w.id)}">Editar</button><button class="btn btn-danger btn-small" data-action="delete-weight" data-id="${attr(w.id)}" aria-label="Eliminar peso">✕</button></div></div>`).join(''):empty('⚖','Sin pesos','Registra el primero.')}${ui.weightLimit<weights.length?`<button class="btn btn-outline btn-block" style="margin-top:15px" data-action="more-weights">Ver más (${weights.length-ui.weightLimit})</button>`:''}</div></div></div>`;
  }
  function parseLoad(raw) {
    const m=String(raw).replace(/^[\s/(]+/,'').match(/(\d{1,3}(?:[\.,']\d+)?)\s*[xX×]\s*\d/);
    const n=m?Number(m[1].replace(/[',]/g,'.')):NaN;
    return n>0&&n<600?n:null;
  }
  function progressPoints(rid,eid) {
    const best=new Map();
    for(const s of db.sessions.filter(s=>s.routineId===rid)) {
      const n=parseLoad(s.entries?.[eid]);if(n===null)continue;
      const week=Number(s.week);if(Number.isFinite(week))best.set(week,n);
    }
    return [...best].sort((a,b)=>a[0]-b[0]).map(([x,y])=>({x,y}));
  }
  function progressPage() {
    if(!routineOf(ui.progressRoutine))ui.progressRoutine=db.routines[0]?.id||'';
    const r=routineOf(ui.progressRoutine);
    if(!r)return heading('Progreso','Sin rutinas');
    if(!exerciseOf(r,ui.progressExercise))ui.progressExercise=r.exercises[0]?.id||'';
    const points=progressPoints(r.id,ui.progressExercise),avg=weightAverages(),first=points[0],last=points[points.length-1];
    return `${heading('Tus estadísticas','Tu progreso','Visualiza la evolución de las cargas anotadas en tus ejercicios y del peso corporal.')}
      <div class="form-card"><div class="form-grid"><div class="field" style="margin-bottom:0"><label for="progress-routine">Rutina</label><select class="select" id="progress-routine">${db.routines.map(o=>`<option value="${attr(o.id)}" ${o.id===r.id?'selected':''}>${esc(o.name)}</option>`).join('')}</select></div><div class="field" style="margin-bottom:0"><label for="progress-exercise">Ejercicio</label><select class="select" id="progress-exercise">${r.exercises.map(e=>`<option value="${attr(e.id)}" ${e.id===ui.progressExercise?'selected':''}>${esc(e.name)}</option>`).join('')}</select></div></div></div>
      <div class="chart-card"><div class="chart-head"><div><div class="chart-title">Carga registrada · ${esc(exerciseOf(r,ui.progressExercise)?.name||'')}</div><div class="chart-sub">Primera carga reconocible de cada anotación</div></div></div><div class="chart-wrap">${lineChart(ui.chartAll?points:points.slice(-24),'kg','load')}</div>${last?`<div class="kpi-strip"><span>Inicial: <strong>${kg(first.y)}</strong> (sem. ${first.x})</span><span>Última: <strong>${kg(last.y)}</strong> (sem. ${last.x})</span></div>`:''}<div class="chart-caption">Orientativo: si una anotación contiene varias cargas, se representa la primera (por ejemplo, «80x3x8» = 80 kg). No interpreta técnicas ni ejercicios alternativos.</div></div>
      <div class="chart-card"><div class="chart-head"><div><div class="chart-title">Peso corporal medio</div><div class="chart-sub">Medias semanales según las pesadas registradas</div></div><button class="btn btn-outline btn-small" data-action="chart-all">${ui.chartAll?'Últimas semanas':'Ver todo'}</button></div><div class="chart-wrap">${lineChart(ui.chartAll?avg:avg.slice(-24),'kg','progressweight')}</div></div>`;
  }
  function lineChart(points,unit,id) {
    if(!points.length)return '<div class="chart-empty">Todavía no hay datos suficientes para crear el gráfico.</div>';
    const W=720,H=230,L=42,R=14,T=20,B=35,plotW=W-L-R,plotH=H-T-B;
    const vals=points.map(p=>p.y), lo=Math.min(...vals),hi=Math.max(...vals), margin=Math.max(0.5,(hi-lo)*0.16),min=lo-margin,max=hi+margin;
    const firstWeek=Number(points[0].x), lastWeek=Number(points[points.length-1].x);
    const xAt=i=>L+(points.length<2||firstWeek===lastWeek?plotW/2:(Number(points[i].x)-firstWeek)/(lastWeek-firstWeek)*plotW);
    const yAt=n=>T+plotH-(n-min)/(max-min)*plotH;
    const positions=points.map((p,i)=>[xAt(i),yAt(p.y)]);
    const path=positions.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' ');
    const area=`${path} L ${positions.at(-1)[0].toFixed(2)} ${T+plotH} L ${positions[0][0].toFixed(2)} ${T+plotH} Z`;
    const ticks=[0,.5,1].map(t=>{const y=T+plotH*(1-t);return `<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#324053" stroke-dasharray="4 5"/><text x="${L-8}" y="${y+4}" text-anchor="end" fill="#91a4b7" font-size="11">${(min+(max-min)*t).toLocaleString('es-ES',{maximumFractionDigits:1})}</text>`}).join('');
    const count=Math.min(points.length,6),indices=[...new Set(Array.from({length:count},(_,i)=>Math.round(i*(points.length-1)/Math.max(1,count-1))))];
    const xlabels=indices.map(i=>`<text x="${xAt(i)}" y="${H-9}" text-anchor="middle" fill="#91a4b7" font-size="11">S${points[i].x}</text>`).join('');
    const circles=positions.length<22?positions.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#c8f46b" stroke="#1f3131" stroke-width="1"><title>Semana ${points[i].x}: ${points[i].y.toLocaleString('es-ES',{maximumFractionDigits:2})} ${unit}</title></circle>`).join(''):'';
    const end=positions[positions.length-1];
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de ${points.length} semanas. Desde semana ${points[0].x} hasta semana ${points.at(-1).x}."><defs><linearGradient id="grad-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c8f46b" stop-opacity=".24"/><stop offset="100%" stop-color="#c8f46b" stop-opacity="0"/></linearGradient></defs>${ticks}<path d="${area}" fill="url(#grad-${id})"/><path d="${path}" fill="none" stroke="#c8f46b" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/>${circles}<circle cx="${end[0]}" cy="${end[1]}" r="5" fill="#c8f46b" stroke="#253537" stroke-width="3"/>${xlabels}</svg>`;
  }
  function settingsPage() {
    const fileReady=typeof window.showSaveFilePicker === 'function';
    const seedHasHistory=window.ENTRENO_SEED.sessions.length>0;
    return `${heading('Datos locales · iPhone','Guardar y recuperar Excel','Cada registro se conserva en la app, aunque no tengas conexión. El Excel es tu copia externa en Archivos.')}
      <section class="surface"><h3>📗 Guardar Excel en el iPhone</h3><p>Al guardar un entrenamiento o un peso, se prepara <strong>mi-entreno.xlsx</strong>. En la ventana de iOS elige <strong>Guardar en Archivos → En mi iPhone</strong>. Puedes guardar con el mismo nombre y aceptar reemplazarlo si el sistema te da esa opción.</p><div class="setting-stack"><button class="btn btn-primary" data-action="save-excel">⇩ Guardar Excel ahora</button><button class="btn btn-outline" data-action="import-excel">↑ Recuperar desde Excel</button></div><div class="hint">El Excel contiene las pestañas Resumen, Rutinas, Entrenamientos, Pesos y Datos app. La última permite recuperar fielmente el historial; no la borres. No incluye la pestaña de dieta.</div></section>
      <section class="surface"><h3>✅ Guardado interno automático</h3><p>Los entrenamientos y pesajes se guardan también de inmediato dentro de esta instalación, sin internet. El archivo Excel externo <strong>no se puede sobrescribir en segundo plano desde una app web de iPhone</strong>: debes confirmar el destino en Archivos cada vez que lo exportes.</p><div class="hint">${memoryOnly?'⚠ El dispositivo ha bloqueado el guardado interno. Guarda el Excel ahora.':'✓ Almacenamiento interno activo en este dispositivo.'}</div></section>
      <section class="surface"><h3>📂 Copia JSON opcional</h3><p>También puedes guardar y recuperar todos los datos con una copia JSON. Es otra forma de hacer respaldo o moverlos a otro dispositivo.</p><div class="setting-stack"><button class="btn btn-outline" data-action="download-backup">⇩ Descargar copia JSON</button><button class="btn btn-outline" data-action="import-backup">↑ Restaurar desde JSON</button></div></section>
      ${fileReady?`<section class="surface"><h3>💻 Opcional en ordenador</h3><p>En Chrome y Edge de escritorio puedes vincular un archivo JSON para sobrescribirlo automáticamente. Este método no está disponible en Safari del iPhone.</p><div class="setting-stack"><button class="btn btn-soft" data-action="link-file">${linkedFile?'Cambiar archivo vinculado':'Vincular archivo JSON'}</button>${linkedFile?`<button class="btn btn-outline" data-action="permission-file">Permitir guardado</button><button class="btn btn-outline" data-action="save-file-now">Guardar ahora</button><button class="btn btn-danger" data-action="unlink-file">Desvincular</button>`:''}</div></section>`:''}
      <section class="surface"><h3>📱 Instalar en el iPhone</h3><p>Publica únicamente el código de la app en un alojamiento estático (por ejemplo, GitHub Pages), ábrelo una vez con conexión desde Safari, pulsa <strong>Compartir → Añadir a pantalla de inicio</strong> y ábrelo una vez. Después la app funciona sin internet. <strong>No necesita un servidor para guardar los entrenamientos.</strong></p></section>
      <section class="surface"><h3>Tu historial</h3><div class="info-list"><div class="info-item"><span class="stat-label">Rutinas</span><strong class="stat-value">${db.routines.length}</strong></div><div class="info-item"><span class="stat-label">Ejercicios</span><strong class="stat-value">${db.routines.reduce((n,r)=>n+r.exercises.length,0)}</strong></div><div class="info-item"><span class="stat-label">Sesiones</span><strong class="stat-value">${db.sessions.length}</strong></div><div class="info-item"><span class="stat-label">Pesajes</span><strong class="stat-value">${db.weights.length}</strong></div></div><p>Se excluyó expresamente la pestaña de dieta. Las semanas antiguas sin fecha mantienen el mismo valor original.</p></section>
      <section class="surface danger-zone"><h3>⚠ Restablecer datos</h3><p>${seedHasHistory?'Recupera el historial inicial.':'Elimina los registros y deja las rutinas vacías.'} Guarda antes una copia Excel o JSON.</p><button class="btn btn-danger" data-action="reset">${seedHasHistory?'Restablecer historial inicial':'Borrar registros locales'}</button></section><p class="footer-note">Mi Entreno iPhone · Datos privados en tu dispositivo · Sin publicidad ni backend.</p>`;
  }

  // Acciones de navegación, edición y guardado
  app.addEventListener('click',async (e)=>{
    const btn=e.target.closest('[data-action]');if(!btn)return;
    const a=btn.dataset.action,id=btn.dataset.id,rid=btn.dataset.routine;
    if (a==='week-down'||a==='week-up') {db.activeWeek=Math.max(1,Number(db.activeWeek)+(a==='week-up'?1:-1));save();render();return;}
    if (a==='more-sessions'){ui.routineLimit[id]=(ui.routineLimit[id]||8)+12;render();return;}
    if (a==='more-weights'){ui.weightLimit+=20;render();return;}
    if (a==='chart-all'){ui.chartAll=!ui.chartAll;render();return;}
    if (a==='manage-exercises'){ui.manageRoutine=ui.manageRoutine===id?'':id;render();return;}
    if (a==='copy-last'){
      const wk=Number(app.querySelector('#session-week')?.value||db.activeWeek);
      const last=lastExercise(btn.dataset.routine,btn.dataset.exercise,btn.dataset.exclude,wk);
      if(!last){toast('Todavía no hay una marca anterior.');return;}
      const input=[...app.querySelectorAll('input[name^="entry:"]')].find(el=>el.name===`entry:${btn.dataset.exercise}`);
      if(input){input.value=last.entries[btn.dataset.exercise];input.focus();toast('Marca anterior copiada.');}
      return;
    }
    if (a==='delete-session'){
      const session=db.sessions.find(s=>s.id===id);if(!session||!confirm(`¿Borrar la sesión de la semana ${session.week}? Esta acción no se puede deshacer.`))return;
      db.sessions=db.sessions.filter(s=>s.id!==id);save();render();toast('Sesión eliminada.');return;
    }
    if (a==='add-exercise'){
      const r=routineOf(rid);if(!r)return;const name=prompt('Nombre del ejercicio nuevo:');if(!name?.trim())return;
      r.exercises.push({id:`ex-${newId()}`,name:name.trim()});save();render();toast('Ejercicio añadido.');return;
    }
    if (a==='rename-exercise'){
      const r=routineOf(rid),ex=r?.exercises.find(x=>x.id===id);if(!ex)return;
      const name=prompt('Nuevo nombre del ejercicio:',ex.name);if(!name?.trim())return;
      ex.name=name.trim();save();render();toast('Nombre actualizado.');return;
    }
    if (a==='toggle-exercise'){
      const r=routineOf(rid),ex=r?.exercises.find(x=>x.id===id);if(!ex)return;
      ex.archived=!ex.archived;save();render();toast(ex.archived?'Ejercicio archivado.':'Ejercicio restaurado.');return;
    }
    if (a==='edit-weight'){ui.weightEditing=id;render();app.querySelector('#weight-form')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if (a==='cancel-weight'){ui.weightEditing='';render();return;}
    if (a==='delete-weight'){
      if(!confirm('¿Eliminar este registro de peso?'))return;
      db.weights=db.weights.filter(w=>w.id!==id);if(ui.weightEditing===id)ui.weightEditing='';save();render();toast('Peso eliminado.');return;
    }
    if (a==='save-excel'){exportExcel();return;}
    if (a==='import-excel'){excelInput.value='';excelInput.click();return;}
    if (a==='download-backup'){downloadBackup();return;}
    if (a==='import-backup'){backupInput.value='';backupInput.click();return;}
    if (a==='link-file'){await linkFile();return;}
    if (a==='permission-file'){await permissionFile();return;}
    if (a==='save-file-now'){await writeLinkedFile(true);return;}
    if (a==='unlink-file'){linkedFile=null;filePermission='none';try{await removeHandle()}catch(_){}render();updateIndicator('Guardado aquí');toast('Archivo desvinculado.');return;}
    if (a==='reset'){
      if(!confirm('¿Eliminar los registros actuales y volver al estado inicial de esta instalación?'))return;
      if(!confirm('Última confirmación: se sustituirá TODO el historial guardado. ¿Continuar?'))return;
      db=copy(window.ENTRENO_SEED);ui.weightEditing='';ui.manageRoutine='';save();navigate('#inicio');toast('Estado inicial restaurado.');return;
    }
  });
  app.addEventListener('change',(e)=>{
    if(e.target.id==='progress-routine'){ui.progressRoutine=e.target.value;ui.progressExercise='';render();}
    else if(e.target.id==='progress-exercise'){ui.progressExercise=e.target.value;render();}
    else if(e.target.id==='weight-date'&&e.target.value){const day=app.querySelector('#weight-day');if(day)day.value=String(dayOfDate(e.target.value))}
  });
  app.addEventListener('submit',(e)=>{
    if(e.target.id==='session-form'){
      e.preventDefault();const form=e.target, f=new FormData(form),rid=form.dataset.routine;
      const week=Number(f.get('week'));if(!Number.isInteger(week)||week<1||week>9999){toast('Indica una semana válida.',true);return;}
      const entries={};for(const [key,value] of f.entries())if(key.startsWith('entry:')&&String(value).trim())entries[key.slice(6)]=String(value).trim();
      const notes=String(f.get('notes')||'').trim();
      if(!Object.keys(entries).length&&!notes){toast('Anota al menos un ejercicio o una nota.',true);return;}
      const record={id:form.dataset.id||newId(),routineId:rid,week,date:String(f.get('date')||''),entries,notes,source:form.dataset.id?'editado':'usuario'};
      const original=db.sessions.findIndex(s=>s.id===record.id);
      if(original>=0)db.sessions[original]=record;else db.sessions.push(record);
      db.activeWeek=week;save();navigate(`#rutina/${encodeURIComponent(rid)}`);exportExcel();return;
    }
    if(e.target.id==='weight-form'){
      e.preventDefault();const form=e.target,f=new FormData(form),number=Number(String(f.get('kg')||'').trim().replace(',','.').replace("'",'.'));
      const week=Number(f.get('week')),date=String(f.get('date')||''),day=date?dayOfDate(date):Number(f.get('day'));
      if(!(number>=20&&number<=400)){toast('Introduce un peso válido entre 20 y 400 kg.',true);return;}
      if(!Number.isInteger(week)||week<1||week>9999){toast('Indica una semana válida.',true);return;}
      if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Fecha incorrecta.',true);return;}
      const existing=date?db.weights.find(w=>w.date===date&&w.id!==form.dataset.id):null;
      if(existing&&!confirm('Ya tienes un peso registrado para esta fecha. ¿Sobrescribirlo?'))return;
      const record={id:form.dataset.id||existing?.id||newId(),week,day,date,kg:number,source:'usuario'};
      db.weights=db.weights.filter(w=>w.id!==record.id && w.id!==existing?.id);db.weights.push(record);
      db.activeWeek=week;ui.weightEditing='';save();render();exportExcel();return;
    }
  });
  excelTop.addEventListener('click',exportExcel);
  excelInput.addEventListener('change', async()=>{
    const file=excelInput.files?.[0];if(!file)return;
    try {
      if(file.size>15_000_000)throw Error('El Excel es demasiado grande.');
      const incoming=window.ENTRENO_EXCEL.restore(await file.arrayBuffer());
      if(!validData(incoming))throw Error('Este Excel no contiene datos válidos de Mi Entreno.');
      if(!confirm(`¿Recuperar ${incoming.sessions.length} sesiones y ${incoming.weights.length} pesajes desde este Excel? Se sustituirán los datos actuales.`))return;
      db=incoming;ui.weightEditing='';ui.progressRoutine='';ui.progressExercise='';save();navigate('#inicio');toast('Historial restaurado desde Excel.');
    }catch(err){console.error(err);toast(`No se pudo restaurar el Excel: ${err.message}`,true);}
  });
  function downloadFile(file) {
    const url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }
  async function exportExcel() {
    try {
      const result=window.ENTRENO_EXCEL.build(db);
      const file=new File([result.bytes],result.name,{type:result.mime,lastModified:Date.now()});
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))) {
        toast('Elige «Guardar en Archivos» para conservar el Excel.');
        try {await navigator.share({files:[file],title:'Mi Entreno · Excel',text:'Copia de mis entrenamientos y pesos'});}
        catch(err){if(err.name!=='AbortError'){console.warn(err);downloadFile(file);toast('Se ha preparado la descarga de mi-entreno.xlsx.');}}
      } else {
        downloadFile(file);
        toast('Excel generado. Guárdalo en Archivos de tu iPhone.');
      }
    }catch(err){console.error(err);toast('No se pudo crear el Excel. Prueba con la copia JSON.',true);}
  }
  backupInput.addEventListener('change', async()=>{
    const file=backupInput.files?.[0];if(!file)return;
    try {
      if(file.size>10_000_000)throw Error('El archivo es demasiado grande.');
      const incoming=JSON.parse(await file.text());
      if(!validData(incoming))throw Error('El archivo no tiene el formato de copia de Mi Entreno.');
      if(!confirm(`¿Restaurar esta copia con ${incoming.sessions.length} sesiones y ${incoming.weights.length} pesajes? Sustituirá todos los datos actuales.`))return;
      db=incoming;if(!Number.isFinite(Number(db.activeWeek)))db.activeWeek=maxWeek()+1;
      ui.weightEditing='';ui.progressRoutine='';ui.progressExercise='';save();navigate('#inicio');toast('Copia restaurada correctamente.');
    }catch(err){toast(`No se pudo restaurar: ${err.message}`,true);}
  });
  window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'})});
  render();

  function downloadBackup() {
    const content=JSON.stringify({...db,backupDate:new Date().toISOString()},null,2);
    const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`mi-entreno-copia-${today()}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    toast('Copia JSON creada. Consérvala en tus archivos.');
  }
  function scheduleFileWrite() {
    if(!linkedFile||filePermission!=='granted')return;
    clearTimeout(writeTimer);writeTimer=setTimeout(()=>writeLinkedFile(false),650);
  }
  async function writeLinkedFile(manual) {
    if(!linkedFile){if(manual)toast('Primero debes vincular un archivo.',true);return;}
    if(isWriting){writeAgain=true;return;}
    isWriting=true;
    try{
      const permit=await linkedFile.queryPermission({mode:'readwrite'});
      if(permit!=='granted'){filePermission=permit;if(manual)toast('Pulsa «Permitir guardado» para autorizar el archivo.',true);return;}
      const writer=await linkedFile.createWritable();await writer.write(JSON.stringify({...db,backupDate:new Date().toISOString()},null,2));await writer.close();
      filePermission='granted';updateIndicator('Guardado · archivo');if(manual)toast(`Archivo ${linkedFile.name} actualizado.`);
    }catch(err){filePermission='error';updateIndicator('Guardado aquí · fallo archivo',true);toast('No se pudo actualizar el archivo vinculado. Tus datos siguen guardados en el navegador.',true);console.error(err);}
    finally{isWriting=false;if(writeAgain){writeAgain=false;scheduleFileWrite()}if(manual&&route().screen==='ajustes')render();}
  }
  async function linkFile() {
    if(typeof window.showSaveFilePicker!=='function'){toast('Tu navegador no permite vincular archivos.',true);return;}
    try {
      const handle=await window.showSaveFilePicker({suggestedName:'mi-entreno-datos.json',types:[{description:'Archivo de datos JSON',accept:{'application/json':['.json']}}]});
      linkedFile=handle;filePermission='granted';
      try{await storeHandle(handle)}catch(err){console.warn('No se pudo recordar el archivo vinculado',err)}
      await writeLinkedFile(true);render();
    } catch(err){if(err.name!=='AbortError')toast(`Error al seleccionar el archivo: ${err.message}`,true);}
  }
  async function permissionFile() {
    if(!linkedFile){toast('No hay un archivo vinculado.',true);return;}
    try {
      filePermission=await linkedFile.requestPermission({mode:'readwrite'});
      if(filePermission==='granted'){await writeLinkedFile(true);toast('Permiso activado.');}else toast('No se concedió acceso al archivo.',true);
      render();
    }catch(err){toast('No se puede activar el permiso en este navegador.',true)}
  }
  function openHandleStore() {
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB)return reject(Error('Sin IndexedDB'));
      const req=indexedDB.open('mi-entreno-file-handle',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('data'))req.result.createObjectStore('data')};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function storeHandle(handle) {
    const idb=await openHandleStore();await new Promise((resolve,reject)=>{
      const tx=idb.transaction('data','readwrite');tx.objectStore('data').put(handle,'backup-handle');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });idb.close();
  }
  async function removeHandle() {
    const idb=await openHandleStore();await new Promise((resolve,reject)=>{
      const tx=idb.transaction('data','readwrite');tx.objectStore('data').delete('backup-handle');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });idb.close();
  }
  async function resumeHandle() {
    if(typeof window.showSaveFilePicker!=='function')return;
    try {
      const idb=await openHandleStore();const handle=await new Promise((resolve,reject)=>{
        const tx=idb.transaction('data','readonly'),request=tx.objectStore('data').get('backup-handle');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });idb.close();
      if(handle){linkedFile=handle;filePermission=await handle.queryPermission({mode:'readwrite'});if(filePermission==='granted')scheduleFileWrite();if(route().screen==='ajustes')render();updateIndicator(filePermission==='granted'?'Guardado · archivo':'Guardado aquí');}
    }catch(err){console.warn('No se pudo reanudar el vínculo de archivo',err)}
  }
  resumeHandle();
  if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Modo offline no disponible:',err)));
  }
})();
