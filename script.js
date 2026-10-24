document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const toast = (message) => {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  };
  $('#year') && ($('#year').textContent = new Date().getFullYear());
  const toggle = $('#menuToggle'), nav = $('#navLinks');
  toggle?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '✕' : '☰';
  });
  const current = location.pathname.split('/').pop() || 'index.html';
  $$('[data-page]').forEach(a => { if (a.dataset.page === current) a.classList.add('active'); });

  const STORAGE = {
    issues: 'qps_issues_v1', activity: 'qps_activity_v1', security: 'qps_security_v1'
  };
  const read = (key, fallback) => { try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const defaultIssues = [
    {id:1,title:'Missing error handling',severity:'high',file:'src/api.js',status:'open'},
    {id:2,title:'Potentially unused variable',severity:'low',file:'src/utils.js',status:'open'},
    {id:3,title:'Large function needs refactoring',severity:'medium',file:'src/dashboard.js',status:'open'},
    {id:4,title:'Input is not validated',severity:'high',file:'src/form.js',status:'open'},
    {id:5,title:'Repeated style declarations',severity:'low',file:'styles.css',status:'open'},
    {id:6,title:'Improve naming clarity',severity:'medium',file:'src/helpers.js',status:'resolved'}
  ];
  let issues = read(STORAGE.issues, defaultIssues);
  let activity = read(STORAGE.activity, [
    {title:'Workspace initialized',detail:'QualityPulse Studio demo is ready to use.',time:new Date(Date.now()-3600000).toISOString()}
  ]);
  function addActivity(title, detail) {
    activity.unshift({title, detail, time:new Date().toISOString()});
    activity = activity.slice(0,100); write(STORAGE.activity, activity);
  }
  const fmtTime = iso => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };

  // Issue tracker
  const tbody = $('#issuesTableBody');
  function renderIssues() {
    if (!tbody) return;
    const search = ($('#issueSearch')?.value || '').toLowerCase();
    const severity = $('#issueFilter')?.value || 'all';
    const status = $('#issueStatusFilter')?.value || 'all';
    const filtered = issues.filter(i => (severity==='all'||i.severity===severity) && (status==='all'||i.status===status) && (i.title+' '+i.file).toLowerCase().includes(search));
    tbody.innerHTML = '';
    filtered.forEach(issue => {
      const tr = document.createElement('tr');
      const title = document.createElement('td'); title.textContent = issue.title;
      const sev = document.createElement('td'); const sevPill=document.createElement('span'); sevPill.className='pill pill-'+issue.severity; sevPill.textContent=issue.severity; sev.append(sevPill);
      const file = document.createElement('td'); file.textContent = issue.file;
      const statusCell = document.createElement('td'); const statusPill=document.createElement('span'); statusPill.className='pill '+(issue.status==='resolved'?'pill-done':'pill-open'); statusPill.textContent=issue.status; statusCell.append(statusPill);
      const action = document.createElement('td'); const btn=document.createElement('button'); btn.className='btn btn-secondary btn-small'; btn.textContent=issue.status==='resolved'?'Reopen':'Resolve'; btn.dataset.issueId=issue.id; action.append(btn);
      tr.append(title,sev,file,statusCell,action); tbody.append(tr);
    });
    $('#issuesEmpty')?.toggleAttribute('hidden', filtered.length !== 0);
    const total=$('#totalIssues'); if(total) total.textContent=issues.length;
    const high=$('#highIssues'); if(high) high.textContent=issues.filter(i=>i.severity==='high'&&i.status==='open').length;
    const resolved=$('#resolvedIssues'); if(resolved) resolved.textContent=issues.filter(i=>i.status==='resolved').length;
    const open=$('#openIssues'); if(open) open.textContent=issues.filter(i=>i.status==='open').length;
    const metricOpen=$('#metricOpenIssues'); if(metricOpen) metricOpen.textContent=issues.filter(i=>i.status==='open').length;
  }
  ['#issueSearch','#issueFilter','#issueStatusFilter'].forEach(s=>$(s)?.addEventListener('input',renderIssues));
  tbody?.addEventListener('click', e => {
    const btn=e.target.closest('[data-issue-id]'); if(!btn) return;
    const issue=issues.find(i=>i.id===Number(btn.dataset.issueId)); if(!issue) return;
    issue.status=issue.status==='resolved'?'open':'resolved'; write(STORAGE.issues,issues);
    addActivity(issue.status==='resolved'?'Issue resolved':'Issue reopened',issue.title);
    renderIssues(); toast(issue.status==='resolved'?'Issue marked as resolved.':'Issue reopened.');
  });
  renderIssues();

  // Analyzer: lightweight heuristics, not a full parser
  const codeInput=$('#codeInput');
  const sample=`function greetUser(name) {
  var message = "Hello, " + name;
  console.log(message);
  return message;
}

// TODO: add input validation
greetUser("Developer");`;
  $('#loadSample')?.addEventListener('click',()=>{codeInput.value=sample; toast('Sample code loaded.');});
  $('#clearCode')?.addEventListener('click',()=>{codeInput.value=''; $('#analysisResults').innerHTML='<div class="empty-state">Paste code and run an analysis to see results.</div>'; $('#resultStatus').textContent='Ready';});
  let scans=0;
  $('#runAnalysis')?.addEventListener('click',()=>{
    const code=codeInput.value;
    if(!code.trim()){toast('Please paste some code first.');codeInput.focus();return;}
    const findings=[];
    const add=(condition, title, detail, warn=false)=>{if(condition) findings.push({title,detail,warn});};
    add(/\bvar\s+/.test(code),'Consider using let or const','The var keyword can create unexpected scope behavior.',true);
    add(/console\.(log|debug)\s*\(/.test(code),'Debug logging found','Remove or manage console output before production.',true);
    add(/\bTODO\b|\bFIXME\b/i.test(code),'TODO/FIXME comment found','Review unfinished work before shipping.',true);
    add(/eval\s*\(/.test(code),'Potentially unsafe eval()','Avoid evaluating dynamic strings as code.',true);
    add(/innerHTML\s*=/.test(code),'Review dynamic HTML insertion','Validate and safely handle untrusted content.',true);
    add(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{500,}/.test(code),'Large function detected','Consider splitting long logic into smaller functions.',true);
    add(!/try\s*\{|catch\s*\(/.test(code)&&/\b(fetch|async|await)\b/.test(code),'Review async error handling','Consider handling rejected requests and network errors.',true);
    add(!/\/\*|\/\//.test(code),'No comments detected','Add comments where they clarify complex decisions.',false);
    if(!findings.length) findings.push({title:'No common warning patterns found',detail:'This quick scan did not detect its listed patterns. It is not a guarantee of correctness or security.',warn:false});
    const results=$('#analysisResults'); results.innerHTML='';
    findings.forEach(f=>{
      const row=document.createElement('div'); row.className='result-line';
      const icon=document.createElement('span'); icon.className='result-icon'+(f.warn?' warn':''); icon.textContent=f.warn?'!':'✓';
      const body=document.createElement('div'); const strong=document.createElement('strong'); strong.textContent=f.title;
      const p=document.createElement('div'); p.className='muted'; p.style.marginTop='4px'; p.textContent=f.detail;
      body.append(strong,p); row.append(icon,body); results.append(row);
    });
    scans++; $('#scanCount').textContent=scans;
    const warnings=findings.filter(f=>f.warn).length;
    const score=Math.max(0,100-warnings*12); $('#lastScore').textContent=score;
    $('#findingCount').textContent=warnings;
    $('#resultStatus').textContent=warnings?'Review suggested':'Looks clear';
    $('#resultStatus').className='pill '+(warnings?'pill-medium':'pill-low');
    addActivity('Code analysis completed',`${warnings} potential finding(s); demo score ${score}/100.`);
    toast('Analysis complete. Review the notes before shipping.');
  });

  // Security checklist
  const securityChecks=$$('[data-security]');
  function renderSecurity(){
    if(!securityChecks.length)return;
    const saved=read(STORAGE.security,{});
    securityChecks.forEach(c=>c.checked=Boolean(saved[c.dataset.security]));
    const done=securityChecks.filter(c=>c.checked).length, pct=Math.round(done/securityChecks.length*100);
    $('#securityPercent').textContent=pct; $('#securityDone').textContent=`${done}/${securityChecks.length}`;
    $('#securityProgress').style.width=pct+'%';
    $('#securityStatus').textContent=done===securityChecks.length?'Checklist done':done===0?'Not started':'In progress';
  }
  securityChecks.forEach(c=>c.addEventListener('change',()=>{
    const saved=read(STORAGE.security,{}); saved[c.dataset.security]=c.checked; write(STORAGE.security,saved);
    renderSecurity(); addActivity('Security checklist updated',`${c.parentElement.querySelector('strong').textContent}: ${c.checked?'checked':'unchecked'}`);
    toast('Checklist progress saved in this browser.');
  }));
  $('#resetSecurity')?.addEventListener('click',()=>{write(STORAGE.security,{});renderSecurity();addActivity('Security checklist reset','All checklist items unchecked.');toast('Checklist reset.');});
  renderSecurity();

  // Activity timeline
  function renderActivity(){
    const list=$('#activityTimeline'); if(!list)return;
    list.innerHTML='';
    $('#activityCount').textContent=activity.length;
    $('#activityEmpty').toggleAttribute('hidden',activity.length!==0);
    activity.forEach(item=>{
      const el=document.createElement('div');el.className='timeline-item';
      const strong=document.createElement('strong');strong.textContent=item.title;
      const p=document.createElement('p');p.textContent=item.detail;
      const time=document.createElement('time');time.textContent=fmtTime(item.time);
      el.append(strong,p,time);list.append(el);
    });
  }
  $('#clearActivity')?.addEventListener('click',()=>{activity=[];write(STORAGE.activity,activity);renderActivity();toast('Activity history cleared.');});
  renderActivity();
});
