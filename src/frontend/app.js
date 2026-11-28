'use strict';
const app = document.getElementById('app');
const modal = document.getElementById('modal-root');
const PALETTE = ['#2dd4a8','#5b8dee','#e8a840','#3abcd5','#e85470','#3cc88a','#f472b6','#9b7bea','#fb923c','#a78bfa'];
const S = {user:null,csrf:null,workspaces:[],wid:null,projects:[],view:'home',project:null,
  assets:[],total:0,page:1,split:'',state:'',query:'',editor:null,img:null,editMode:'select',drawClass:0,
  selected:null,selectedSet:new Set(),hoveredBox:null,dirty:false,zoom:1,pan:{x:0,y:0},undo:[],redo:[],drag:null,colorMode:'class',autosave:false,
  readonly:true,lease:false,heartbeat:null,railQuery:'',projectStats:null,members:[],annotatedBy:0,assignedTo:0,classFilter:-1};
const el = id => document.getElementById(id);
const enc = encodeURIComponent;
const html = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const filename = s => String(s??'').split('/').pop();
const short = (s,n=38)=>String(s??'').length>n?String(s).slice(0,n-3)+'...':String(s??'');
const color = n => S.project?.class_colors?.[n] || PALETTE[n % PALETTE.length];
function boxColor(box,index){
  // In "Mỗi khung" mode, each rectangle is colored by its class so the
  // color itself identifies the label; the label text is hidden on canvas.
  if(S.colorMode==='box') return color(box.cls);
  if(S.colorMode==='single') return '#2dd4a8';
  return color(box.cls);
}
const iconPaths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 2-.06-.06a1.7 1.7 0 0 0-1.88-.34l-.12.05a1.7 1.7 0 0 0-1 1.56V21h-3v-.09a1.7 1.7 0 0 0-1-1.56l-.12-.05a1.7 1.7 0 0 0-1.88.34l-.06.06-2-2 .06-.06A1.7 1.7 0 0 0 7 15.76l-.05-.12a1.7 1.7 0 0 0-1.56-1H5v-3h.09a1.7 1.7 0 0 0 1.56-1l.05-.12a1.7 1.7 0 0 0-.34-1.88L6.3 8.6l2-2 .06.06a1.7 1.7 0 0 0 1.88.34l.12-.05a1.7 1.7 0 0 0 1-1.56V5h3v.09a1.7 1.7 0 0 0 1 1.56l.12.05a1.7 1.7 0 0 0 1.88-.34l.06-.06 2 2-.06.06A1.7 1.7 0 0 0 19 10.24l.05.12a1.7 1.7 0 0 0 1.56 1H21v3h-.09a1.7 1.7 0 0 0-1.56 1Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.4"/><path d="m21 15-5-5L5 21"/>',
  arrow:'<path d="m9 18 6-6-6-6"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  target:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>',
  cursor:'<path d="m5 3 14 9-7 1-3 7-4-17Z"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  exit:'<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
  zoom:'<circle cx="10" cy="10" r="7"/><path d="m16 16 5 5M7 10h6M10 7v6"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  undo:'<path d="M9 14 4 9l5-5M4 9h11a6 6 0 0 1 0 12"/>',
  redo:'<path d="m15 14 5-5-5-5M20 9H9a6 6 0 0 0 0 12"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  alert:'<path d="m12 3 10 18H2L12 3ZM12 9v5M12 18h.01"/>',
  close:'<path d="M18 6 6 18M6 6l12 12"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 6 5 12 0 18M12 3c-5 6-5 12 0 18"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-8M22 20v-5"/>',
  folder:'<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  multi:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="m14 17 2.5 2.5 4.5-4.5"/>',
};
function ic(name,sz=''){return `<svg class="ico ${sz}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name]||iconPaths.layers}</svg>`}
function btn(text,action,cls='quiet',extra=''){return `<button class="btn ${cls}" data-action="${action}" ${extra}>${text}</button>`}
function toast(msg,error=false){const e=document.createElement('div');e.className='toast'+(error?' error':'');e.textContent=msg;el('toast-region').appendChild(e);setTimeout(()=>e.remove(),4700)}
async function api(url,options={}){const headers={...(options.headers||{})};if(options.body && typeof options.body==='object' && !(options.body instanceof FormData)){options.body=JSON.stringify(options.body);headers['Content-Type']='application/json'}
 if(S.csrf && options.method && !['GET','HEAD'].includes(options.method)) headers['X-CSRF-Token']=S.csrf;
 const r=await fetch('/api'+url,{...options,headers,credentials:'same-origin',cache:'no-store'});
 let data;try{data=await r.json()}catch{data={detail:`HTTP ${r.status}`}}
 if(!r.ok){const e=new Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail));e.status=r.status;throw e}return data}
function send(method,url,body={}){return api(url,{method,body})}
function secureAction(fn){return async (...args)=>{try{await fn(...args)}catch(e){toast(e.message||String(e),true)}}}
function logo(){return `<button type="button" class="logo-mark" ${S.user?'data-action="home" title="Về trang chủ"':'disabled'}>✦</button><span>AEGIS VISION<small>ANNOTATION CLOUD / LOCAL</small></span>`}
function renderLogin(){S.view='login';app.innerHTML=`<div class="login-wrap"><section class="login-cover"><div class="row" style="gap:12px">${logo()}</div><div class="eyebrow" style="margin-top:76px">COLLABORATIVE VISION WORKSPACE</div><h1>Annotate together.<br><span style="color:var(--accent)">Build better datasets.</span></h1><p>Aegis Vision quản lý project và chỉnh nhãn YOLO ngay trên máy chủ của bạn. Không upload dữ liệu lên dịch vụ bên ngoài.</p><div class="row" style="z-index:1;margin-top:26px">${ic('lock')} <span style="font-size:12px;color:var(--muted)">Private by design · Tailscale-ready</span></div></section><section class="login-pane"><div class="logo" style="margin:0">${logo()}</div><h2>Welcome back <span style="color:var(--accent)">✦</span></h2><p>Đăng nhập để truy cập workspace của nhóm.</p><form id="login-form"><label>USERNAME</label><input class="field" name="username" autocomplete="username" autofocus required placeholder="your.username"><label>PASSWORD</label><input class="field" name="password" type="password" autocomplete="current-password" required placeholder="••••••••••"> <button class="btn primary" type="submit">${ic('exit')} Sign in to Workspace</button></form><div class="login-footer">Trước tiên, tạo admin bằng lệnh <strong>python server.py init-admin</strong></div></section></div>`}
function shell(content,crumbs='Overview'){
 const ws=S.workspaces.find(w=>w.id===S.wid);
 app.innerHTML=`<div class="shell"><aside class="side"><div class="logo">${logo()}</div><div class="side-section">Workspace</div><select class="workspace-select" id="workspace-picker">${S.workspaces.map(w=>`<option value="${w.id}" ${w.id===S.wid?'selected':''}>◈ ${html(w.name)}</option>`).join('')}${S.workspaces.length?'':'<option>Chưa có workspace</option>'}</select>
 ${btn(ic('plus')+' Tạo workspace','newWorkspace','quiet small','style="margin-top:9px;width:100%"')}
 <div class="side-section">Manage</div>
 <button class="nav-btn ${S.view==='home'?'active':''}" data-action="home">${ic('grid')}<span>Overview</span></button>
 <button class="nav-btn ${S.view==='project'?'active':''}" data-action="datasets">${ic('layers')}<span>Datasets</span><span class="count">${S.projects.length}</span></button>
 <button class="nav-btn ${S.view==='team'?'active':''}" data-action="team">${ic('people')}<span>Members</span></button>
 <div class="side-section">Projects</div>${S.projects.slice(0,7).map(p=>`<button class="nav-btn" data-action="project" data-id="${p.id}">${ic('image')}<span title="${html(p.name)}">${html(short(p.name,17))}</span></button>`).join('')}
 <div class="side-bottom"><div class="side-user"><div class="avatar">${html(S.user.display_name[0]?.toUpperCase()||'U')}</div><div style="overflow:hidden"><div class="username">${html(short(S.user.display_name,17))}</div><div class="small-muted">${S.user.is_admin?'System Admin':'Team Member'}</div></div></div><button class="nav-btn" data-action="logout">${ic('exit')}<span>Sign out</span></button></div></aside><main class="main"><div class="topbar"><div class="crumbs"><span>Workspace</span>${ic('arrow','sm')}<strong>${html(ws?.name||'Untitled')}</strong>${crumbs==='Overview'?'':`${ic('arrow','sm')}<strong>${html(crumbs)}</strong>`}</div><div class="topbar-right"><span class="tag green"><span class="online-dot"></span> LOCAL SECURE</span><div class="avatar">${html(S.user.display_name[0]?.toUpperCase()||'U')}</div></div></div><div id="body-view">${content}</div></main></div>`}
function statCard(icon,title,value,detail){return `<div class="stat-card"><div class="stat-label">${title}</div><div class="stat-value">${value}</div><div class="stat-detail">${detail}</div><div class="stat-icon">${ic(icon)}</div></div>`}
function percent(reviewed,total){if(!total)return 0;const value=reviewed/total*100;return value>0&&value<1?Number(value.toFixed(2)):Math.round(value)}
function safeColor(value,index){return /^#[0-9a-f]{6}$/i.test(String(value||''))?value:PALETTE[index%PALETTE.length]}
function projectCard(p,i){const pct=percent(p.reviewed,p.total),bar=p.reviewed>0?Math.max(pct,.35):0;return `<article class="project-card" data-action="project" data-id="${p.id}"><div class="project-art p${i%3+1}">${p.cover_asset_id?`<img src="/api/projects/${p.id}/assets/${p.cover_asset_id}/thumbnail" alt="Ảnh đại diện ${html(p.name)}" loading="lazy">`:''}<span class="tag outline" style="position:absolute;top:11px;left:11px">YOLO DETECTION</span></div><div class="row between"><h3>${html(p.name)}</h3>${ic('arrow')}</div><div class="row between" style="margin-top:19px;margin-bottom:8px"><span class="tiny muted">${p.total.toLocaleString()} images</span><span class="tiny" style="color:var(--emerald);font-weight:600">${pct}% reviewed</span></div><div class="progress"><div style="width:${bar}%"></div></div><div class="project-card-foot"><div class="project-labels">${p.classes.map((name,index)=>{const c=safeColor(p.class_colors?.[index],index);return `<span class="project-label" style="--label-color:${c}"><i></i>${html(name)}</span>`}).join('')}</div>${S.user?.is_admin?`<button class="btn danger small" data-action="deleteProject" data-id="${p.id}">Delete</button>`:''}</div></article>`}
function dashboard(){S.view='home';shell(`<div class="content"><div style="margin-bottom:24px"><div class="eyebrow">WORKSPACE OVERVIEW</div><h1 class="page-title" style="margin-top:7px">Your annotation hub</h1><p class="page-sub">Quản lý dữ liệu, cộng tác nhóm và tăng tốc review nhãn.</p></div><div class="hero"><div><div class="eyebrow">✦ &nbsp; VISION WORKSPACE</div><h2 class="hero-title">One workspace.<br>Unlimited possibilities.</h2><p>Import một lần. Review cùng nhau. Lưu nhãn YOLO trực tiếp.</p></div>${btn(ic('plus')+' Import dataset','newProject','primary')}</div><div class="section-heading"><h2 class="sec-title">Recent projects</h2><div class="row">${btn(ic('people')+' Manage team','team','quiet small')}</div></div>${S.projects.length?`<div class="project-grid">${S.projects.map(projectCard).join('')}</div>`:`<div class="empty"><div class="empty-ico">${ic('layers','lg')}</div><h3>No projects yet</h3><p>Nhấn Import dataset ở phía trên để bắt đầu.</p></div>`}</div>`)}
function assetCard(a){const tag=a.lock?`<span class="tag red overlay-chip">${ic('lock','sm')} ${html(short(a.lock.name,11))}</span>`:a.state==='reviewed'?`<span class="tag green overlay-chip">${ic('check','sm')} Reviewed</span>`:a.state==='in_progress'?`<span class="tag orange overlay-chip">Editing</span>`:`<span class="tag overlay-chip">To do</span>`;
 return `<article class="asset-card" data-action="openAsset" data-id="${a.id}"><div class="asset-thumb"><img loading="lazy" src="/api/projects/${S.project.id}/assets/${a.id}/thumbnail" alt="${html(a.image_rel)}">${tag}</div><div class="asset-foot"><b title="${html(a.image_rel)}">${html(filename(a.image_rel))}</b><div class="row"><span class="tiny muted">${html(a.state==='reviewed'&&a.reviewed_by?'✓ '+a.reviewed_by:(a.updated_by?'✎ '+a.updated_by:a.split))} · r${a.revision}</span><span class="tiny" style="color:var(--accent);font-weight:600">Open ${ic('arrow','sm')}</span></div>${a.assigned_to?`<div class="tiny" style="margin-top:6px;color:var(--text2)">${ic('people','sm')} Giao cho: ${html(a.assigned_to)}</div>`:'<div class="tiny muted" style="margin-top:6px">Chưa phân công</div>'}</div></article>`}
function paginationBar(){
 const maxPage=Math.max(1,Math.ceil(S.total/48));
 if(S.total<=0)return '';
 const from=(S.page-1)*48+1,to=Math.min(S.page*48,S.total);
 let pages=[];
 if(maxPage<=7){
   for(let i=1;i<=maxPage;i++)pages.push(i);
 }else{
   pages.push(1);
   if(S.page>3)pages.push('...');
   const start=Math.max(2,S.page-1),end=Math.min(maxPage-1,S.page+1);
   for(let i=start;i<=end;i++)pages.push(i);
   if(S.page<maxPage-2)pages.push('...');
   pages.push(maxPage);
 }
 return `<nav class="pagination-bar" aria-label="Pagination"><div class="pagination-info"><span>Ảnh <b>${from.toLocaleString()} – ${to.toLocaleString()}</b> / <b>${S.total.toLocaleString()}</b></span><span class="muted tiny"> · Trang ${S.page} / ${maxPage}</span></div><div class="pagination-controls"><button class="btn quiet small pagination-nav" data-action="prevPage" ${S.page<=1?'disabled':''}>${ic('back')} <span>Trang trước</span></button><div class="pagination-pills">${pages.map(p=>p==='...'?'<span class="pagination-ellipsis">…</span>':`<button class="pagination-pill ${p===S.page?'active':''}" data-action="jumpPage" data-page="${p}">${p}</button>`).join('')}</div><button class="btn quiet small pagination-nav" data-action="nextPage" ${S.page>=maxPage?'disabled':''}><span>Trang sau</span> ${ic('arrow')}</button></div></nav>`;
}
function classStatsBar(stats){
 const classes = stats.class_stats || [];
 if(!classes.length) return '';
 return `<div class="class-stats-card"><div class="class-stats-header"><span>${ic('chart','sm')} Thống kê nhãn (${(stats.total_boxes||0).toLocaleString()} boxes)</span><span class="muted tiny">Nhấp để lọc ảnh</span></div><div class="class-stats-pills"><button class="class-stat-pill ${S.classFilter===-1?'active':''}" data-action="filterClass" data-id="-1"><span>Tất cả nhãn</span><span class="class-stat-badge">${(stats.total_boxes||0).toLocaleString()}</span></button>${classes.map(c=>`<button class="class-stat-pill ${S.classFilter===c.id?'active':''}" data-action="filterClass" data-id="${c.id}" title="${html(c.name)}: ${c.boxes.toLocaleString()} boxes trong ${c.images.toLocaleString()} ảnh"><span class="class-stat-dot" style="background:${c.color};color:${c.color}"></span><span>${html(c.name)}</span><span class="class-stat-badge">${c.boxes.toLocaleString()}</span></button>`).join('')}${stats.unlabeled>0?`<button class="class-stat-pill ${S.classFilter===-2?'active':''}" data-action="filterClass" data-id="-2" title="${stats.unlabeled} ảnh chưa có bounding box"><span class="class-stat-dot" style="background:var(--dim);color:var(--dim)"></span><span>Chưa có nhãn</span><span class="class-stat-badge">${stats.unlabeled.toLocaleString()}</span></button>`:''}</div></div>`;
}
function projectPage(){S.view='project';const p=S.project,stats=S.projectStats||{reviewed:0,total:0,in_progress:0,locked:0,splits:[],class_stats:[],total_boxes:0,unlabeled:0};const pct=percent(stats.reviewed,stats.total);const canAssign=S.user?.is_admin||['owner','manager'].includes(S.project?.role);
 shell(`<div class="content project-view-container"><div class="project-header-card"><div class="row between wrap"><div><div class="row" style="gap:8px;margin-bottom:8px"><button class="btn quiet small" data-action="home">${ic('back')} Tổng quan</button><span class="eyebrow">DATASET WORKSPACE</span></div><h1 class="page-title">${html(p.name)}</h1><p class="page-sub project-path-badge" title="${html(p.dataset_root)}">${ic('layers','sm')} <code>${html(p.dataset_root)}</code></p></div><div class="row wrap project-actions-toolbar"><label class="btn primary small" style="cursor:pointer">${ic('plus')} <span>Upload ảnh</span><input id="upload-images" type="file" accept="image/*" multiple hidden></label><button class="btn accent-cyan small" data-action="pipeline">${ic('target')} <span>Pipeline Auto-Label</span></button><button class="btn quiet small" data-action="editLabels">${ic('settings')} <span>Nhãn & Màu</span></button>${canAssign?`<button class="btn quiet small" data-action="distributeAssets">${ic('people')} <span>Phân chia ảnh</span></button>`:''}<button class="btn quiet small" data-action="exportProject">${ic('save')} <span>Xuất ZIP</span></button><button class="btn quiet small icon-btn" data-action="refreshProject" title="Tải lại">${ic('history')}</button></div></div></div><div class="stats">${statCard('image','Tổng số ảnh',stats.total.toLocaleString(),'Toàn bộ splits')}${statCard('check','Đã hoàn thành',stats.reviewed.toLocaleString(),pct+'% tiến độ')}${statCard('target','Đang thực hiện',stats.in_progress.toLocaleString(),'Bản nháp đã lưu')}${statCard('lock','Đang khóa',stats.locked.toLocaleString(),'Đang có người mở')}</div>${classStatsBar(stats)}<div class="filterbar-card"><div class="row between wrap" style="gap:12px"><div class="row wrap" style="gap:10px"><div class="segment"><button data-action="filterSplit" data-value="" class="${S.split===''?'active':''}">Tất cả <span class="count-bubble">${stats.total}</span></button>${stats.splits.map(s=>`<button data-action="filterSplit" data-value="${html(s.split)}" class="${S.split===s.split?'active':''}">${html(s.split)} <span class="count-bubble">${s.n}</span></button>`).join('')}</div><select class="field" id="class-filter"><option value="-1">Tất cả nhãn (${(stats.total_boxes||0).toLocaleString()} boxes)</option><option value="-2" ${S.classFilter===-2?'selected':''}>○ Chưa có nhãn (${stats.unlabeled||0})</option>${(stats.class_stats||[]).map(c=>`<option value="${c.id}" ${S.classFilter===c.id?'selected':''}>● ${html(c.name)} (${c.boxes.toLocaleString()})</option>`).join('')}</select><select class="field" id="review-filter"><option value="">Tất cả trạng thái</option><option value="todo" ${S.state==='todo'?'selected':''}>○ To do</option><option value="in_progress" ${S.state==='in_progress'?'selected':''}>◐ In progress</option><option value="reviewed" ${S.state==='reviewed'?'selected':''}>✓ Reviewed</option></select><select class="field" id="annotator-filter"><option value="0">Tất cả người đánh nhãn</option>${S.members.map(m=>`<option value="${m.id}" ${S.annotatedBy===m.id?'selected':''}>${html(m.display_name)}</option>`).join('')}</select><select class="field" id="assignee-filter"><option value="0">Tất cả phân công</option><option value="-1" ${S.assignedTo===-1?'selected':''}>Chưa phân công</option>${S.members.map(m=>`<option value="${m.id}" ${S.assignedTo===m.id?'selected':''}>${html(m.display_name)}</option>`).join('')}</select></div><div class="searchwrap">${ic('search')}<input id="project-search" class="field" placeholder="Tìm tên ảnh…" value="${html(S.query)}"></div></div></div>${paginationBar()}<div class="asset-grid-section">${S.assets.length?`<div class="asset-grid">${S.assets.map(assetCard).join('')}</div>`:`<div class="empty"><div class="empty-ico">${ic('image','lg')}</div><h3>Không có ảnh nào</h3><p>Không tìm thấy ảnh phù hợp với bộ lọc hiện tại.</p></div>`}</div>${paginationBar()}</div>`,p.name);
 const up=el('upload-images');if(up)up.onchange=uploadImages;}
function teamPage(members){S.view='team';const ws=S.workspaces.find(w=>w.id===S.wid);shell(`<div class="content"><div class="row between wrap"><div><div class="eyebrow">ACCESS CONTROL</div><h1 class="page-title">People & permissions</h1><p class="page-sub">Quản lý người dùng trong workspace <strong>${html(ws?.name)}</strong>.</p></div><div class="row">${S.user.is_admin?btn(ic('plus')+' Create account','newUser','quiet'):''}${['owner','manager'].includes(ws?.role)||S.user.is_admin?btn(ic('plus')+' Add member','newMember','primary'):''}</div></div><div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">${statCard('people','Team members',members.length,'Workspace access')}${statCard('lock','Access','Role based','Owner / Manager / Editor / Viewer')}</div><div class="section-heading"><h2 class="sec-title">Workspace members</h2></div><div class="stat-card"><table class="members-table"><thead><tr><th>NAME</th><th>USERNAME</th><th>ROLE</th></tr></thead><tbody>${members.map(m=>`<tr><td><div class="row"><span class="avatar">${html(m.display_name[0].toUpperCase())}</span><strong>${html(m.display_name)}</strong></div></td><td>@${html(m.username)}</td><td><span class="tag ${m.role==='owner'?'purple':m.role==='viewer'?'':'green'}">${html(m.role)}</span></td></tr>`).join('')}</tbody></table></div></div>`,'Members')}
function modalOpen(title,desc,body,submitLabel,handler){modal.innerHTML=`<div class="overlay" data-close-modal="1"><form class="modal" id="the-modal"><div class="row between"><h2>${title}</h2><button type="button" class="btn ghost icon-btn" data-action="closeModal">${ic('close')}</button></div><p>${desc}</p>${body}<div class="modal-foot"><button type="button" class="btn quiet" data-action="closeModal">Cancel</button><button type="submit" class="btn primary">${submitLabel}</button></div></form></div>`;
 el('the-modal').addEventListener('submit',async e=>{e.preventDefault();const submit=e.currentTarget.querySelector('[type=submit]');submit.disabled=true;try{await handler(new FormData(e.currentTarget));modal.innerHTML=''}catch(err){toast(err.message,true)}finally{submit.disabled=false}})}
function newWorkspace(){modalOpen('Create workspace','Một không gian riêng cho team và các projects.','<label>Workspace name</label><input name="name" required minlength="2" placeholder="e.g. Computer Vision Team">','Create workspace',async f=>{const v=await send('POST','/workspaces',{name:f.get('name')});await fetchWorkspaces();S.wid=v.id;await loadWorkspace();toast('Đã tạo workspace')})}
function newProject(){
  if(!S.wid){toast('Hãy tạo workspace trước',true);return}
  const workspace=S.wid;
  let running=false, result=null, browseTarget=null;
  modal.innerHTML=`<div class="overlay"><form class="modal" id="dataset-import-form" style="max-width:720px">
    <div class="row between"><h2>Import dataset</h2><button type="button" class="btn quiet" id="import-close">Đóng</button></div>
    <p>Chọn đường dẫn trên máy đang chạy web. Ảnh và nhãn được ghép theo cùng tên file và thư mục con.</p>
    <fieldset id="import-fields" style="border:0;padding:0;margin:0">
      <label>Tên project</label><input name="name" required minlength="2" maxlength="100" placeholder="Ví dụ: Lớp 6A1 — Review" autocomplete="off">
      <label>Chế độ import</label><select name="import_mode" id="import-mode" class="field">
        <option value="auto">Tự nhận ảnh và nhãn YOLO có sẵn</option>
        <option value="same_folder">Ảnh và nhãn cùng thư mục</option>
        <option value="separate">Chọn thư mục ảnh và nhãn riêng</option>
        <option value="labeled">Dataset YOLO: images / labels</option>
        <option value="images">Chỉ có ảnh — tạo nhãn sau</option>
        <option value="split">Dataset đã chia train / val / test</option>
      </select>
      <div id="import-root-fields"><label>Thư mục dataset</label><div class="row" style="gap:8px">
        <input name="dataset_path" id="import-root" class="field" placeholder="F:/backup_4070/6A1/D01" style="flex:1" required>
        <button type="button" class="btn quiet" data-import-browse="import-root">Chọn thư mục</button>
      </div></div>
      <div id="import-separate-fields" hidden>
        <label>Thư mục ảnh</label><div class="row" style="gap:8px"><input name="image_path" id="import-images" class="field" placeholder="D:/dataset/images" style="flex:1"><button type="button" class="btn quiet" data-import-browse="import-images">Chọn ảnh</button></div>
        <label>Thư mục nhãn YOLO (.txt)</label><div class="row" style="gap:8px"><input name="label_path" id="import-labels" class="field" placeholder="D:/dataset/labels" style="flex:1"><button type="button" class="btn quiet" data-import-browse="import-labels">Chọn nhãn</button></div>
      </div>
      <p class="tiny muted" id="import-help"></p>
    </fieldset>
    <div id="import-browser" hidden class="stat-card" style="margin:12px 0">
      <div class="row between"><strong>Chọn thư mục trên server</strong><button type="button" class="btn quiet small" id="import-browser-close">Đóng</button></div>
      <div class="row" style="gap:8px;margin:10px 0"><input id="import-browser-path" class="field" placeholder="Nhập đường dẫn hoặc chọn ổ đĩa" style="flex:1"><button type="button" class="btn quiet small" id="import-browser-go">Mở</button></div>
      <div id="import-browser-list" style="max-height:180px;overflow:auto"></div>
      <button type="button" class="btn primary small" id="import-browser-use" style="margin-top:10px" disabled>Dùng thư mục này</button>
    </div>
    <div id="import-status" hidden class="stat-card" style="margin-top:16px" role="status" aria-live="polite">
      <div class="row between"><strong id="import-stage">Đang chuẩn bị</strong><span id="import-percent"></span></div>
      <progress id="import-progress" max="100" style="width:100%;height:18px;margin:12px 0;accent-color:var(--accent)"></progress>
      <div id="import-counts" class="tiny"></div><div id="import-current" class="tiny muted" style="margin-top:8px;overflow-wrap:anywhere"></div>
    </div>
    <p id="import-error" style="color:var(--danger,#f87171);white-space:pre-wrap" role="alert"></p>
    <div class="modal-foot"><button type="button" class="btn quiet" id="import-cancel">Đóng</button><button type="submit" class="btn primary" id="import-submit">Bắt đầu import</button></div>
  </form></div>`;
  const form=el('dataset-import-form'),mode=el('import-mode'),submit=el('import-submit');
  const close=()=>{if(!running)modal.innerHTML=''};
  el('import-close').onclick=close;el('import-cancel').onclick=close;
  function setMode(){
    const separate=mode.value==='separate';
    el('import-root-fields').hidden=separate;el('import-separate-fields').hidden=!separate;
    el('import-root').required=!separate;el('import-root').disabled=separate;
    for(const id of ['import-images','import-labels']){el(id).required=separate;el(id).disabled=!separate}
    el('import-help').textContent={
      auto:'Tự tìm .txt cùng tên cạnh ảnh hoặc trong labels/. Hỗ trợ chọn thư mục dataset, images/ hoặc images/train. Ảnh chưa có nhãn vẫn được nhập.',
      same_folder:'Quét cả thư mục con. Ảnh chưa có .txt vẫn được nhập để bạn đánh nhãn.',
      separate:'Ví dụ: images/train/a.jpg ghép với labels/train/a.txt. Nhập hai thư mục trên cùng ổ đĩa; tất cả ảnh cần có nhãn.',
      labeled:'Chọn thư mục cha có images/ và labels/. Tất cả ảnh cần có nhãn YOLO.',
      images:'Nhập ảnh để đánh nhãn thủ công hoặc chạy pipeline. Nhãn mới được lưu trong thư mục labels.',
      split:'Hỗ trợ images/train và labels/train hoặc train/images và train/labels. Cần ít nhất hai tập, ví dụ train và val.'
    }[mode.value];
  }
  mode.onchange=setMode;setMode();
  async function browse(path){
    const list=el('import-browser-list'),use=el('import-browser-use');
    list.textContent='Đang đọc thư mục…';use.disabled=true;
    try{
      const data=await api('/system/browse-folders?path='+enc(path||''));
      el('import-browser-path').value=data.current;
      list.innerHTML='';
      const add=(label,target)=>{const b=document.createElement('button');b.type='button';b.className='btn quiet small';b.style.margin='3px';b.textContent=label;b.onclick=()=>browse(target);list.appendChild(b)};
      for(const drive of data.drives||[])add(drive,drive);
      if(data.parent)add('↑ Thư mục cha',data.parent);
      for(const folder of data.folders||[])add(folder.name,folder.path);
      use.disabled=false;
    }catch(e){list.textContent=e.message}
  }
  form.querySelectorAll('[data-import-browse]').forEach(b=>b.onclick=()=>{
    browseTarget=el(b.dataset.importBrowse);el('import-browser').hidden=false;browse(browseTarget.value.trim());
  });
  el('import-browser-close').onclick=()=>{el('import-browser').hidden=true};
  el('import-browser-go').onclick=()=>browse(el('import-browser-path').value.trim());
  el('import-browser-path').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();browse(e.target.value.trim())}};
  el('import-browser-use').onclick=()=>{
    if(browseTarget)browseTarget.value=el('import-browser-path').value;
    el('import-browser').hidden=true;
  };
  function showProgress(job,started){
    el('import-status').hidden=false;
    el('import-stage').textContent=job.message||'Đang import';
    const bar=el('import-progress');
    if(job.status==='completed'){bar.value=100;el('import-percent').textContent='100%'}
    else if(job.stage==='saving'&&job.total){bar.value=Math.round(job.inserted/job.total*100);el('import-percent').textContent=bar.value+'%'}
    else{bar.removeAttribute('value');el('import-percent').textContent='Đang quét…'}
    el('import-counts').textContent=`Ảnh: ${(job.scanned||0).toLocaleString()} · Có nhãn: ${(job.paired||0).toLocaleString()} · Chưa có nhãn: ${(job.missing||0).toLocaleString()} · Đã lưu: ${(job.inserted||0).toLocaleString()} · ${Math.round((Date.now()-started)/1000)} giây`;
    el('import-current').textContent=job.current||'';
  }
  form.onsubmit=async e=>{
    e.preventDefault();
    if(result){modal.innerHTML='';await loadWorkspace();await openProject(result.id);return}
    if(running)return;
    const payload=Object.fromEntries(new FormData(form));
    running=true;el('import-error').textContent='';el('import-fields').disabled=true;
    el('import-browser').hidden=true;el('import-close').disabled=true;el('import-cancel').disabled=true;
    submit.disabled=true;submit.textContent='Đang import…';
    const started=Date.now();showProgress({message:'Đang gửi yêu cầu import'},started);
    let jobId=null;
    try{
      const startedJob=await send('POST',`/workspaces/${workspace}/imports`,payload);
      jobId=startedJob.job_id;
      let retries=0;
      while(form.isConnected){
        let job;
        try{job=await api(`/workspaces/${workspace}/imports/${jobId}`);retries=0}
        catch(err){
          if(err.status&&err.status<500)throw err;
          retries++;el('import-stage').textContent='Đang kết nối lại để lấy tiến độ…';
          await new Promise(resolve=>setTimeout(resolve,Math.min(1000*retries,5000)));continue;
        }
        showProgress(job,started);
        if(job.status==='failed')throw new Error(job.message);
        if(job.status==='completed'){
          result=job.result;submit.textContent='Mở project';
          toast(`Đã import ${result.count.toLocaleString()} ảnh`);break;
        }
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
    }catch(err){
      el('import-error').textContent=err.message;
      el('import-stage').textContent='Import chưa hoàn tất';
      el('import-progress').value=0;el('import-percent').textContent='';
      submit.textContent='Thử lại';el('import-fields').disabled=false;
    }finally{
      running=false;submit.disabled=false;el('import-close').disabled=false;el('import-cancel').disabled=false;
    }
  };
}
function newUser(){modalOpen('Create user account','Tài khoản sẽ đăng nhập riêng. Thêm vào workspace ở bước tiếp theo.','<label>Username</label><input name="username" required pattern="[a-zA-Z0-9_.-]{3,40}" placeholder="team.member"><label>Display name</label><input name="display_name" required placeholder="Nguyễn Văn A"><label>Password (≥ 10 characters)</label><input name="password" type="password" required minlength="10" autocomplete="new-password">','Create account',async f=>{await send('POST','/users',Object.fromEntries(f));toast('Tạo tài khoản thành công')})}
function newMember(){modalOpen('Add workspace member','Tài khoản cần được admin tạo trước. Quyền editor mới được sửa nhãn.','<label>Existing username</label><input name="username" required placeholder="team.member"><label>Workspace role</label><select name="role"><option value="editor">Editor — annotate & review</option><option value="viewer">Viewer — read only</option><option value="manager">Manager — manage projects & people</option></select>','Add member',async f=>{await send('POST',`/workspaces/${S.wid}/members`,Object.fromEntries(f));await openTeam();toast('Cập nhật quyền thành công')})}
async function fetchWorkspaces(){S.workspaces=await api('/workspaces');if(!S.workspaces.some(w=>w.id===S.wid))S.wid=S.workspaces[0]?.id||null}
async function loadWorkspace(){S.projects=S.wid?await api(`/workspaces/${S.wid}/projects`):[];dashboard()}
async function openProject(id,record=true){S.project=await api(`/projects/${id}`);S.split='';S.state='';S.query='';S.annotatedBy=0;S.assignedTo=0;S.page=1;S.members=await api(`/workspaces/${S.wid}/members`);await reloadProject();if(record)history.pushState({view:'project',wid:S.wid,pid:S.project.id,page:S.page},'',`#project-${S.project.id}`)}
async function reloadProject(){S.projectStats=await api(`/projects/${S.project.id}/stats`);await listAssets();projectPage();installDatasetTools()}
async function goToProjectPage(page, record=true){
 page=Math.max(1,Math.min(page,Math.max(1,Math.ceil(S.total/48))));
 if(page===S.page&&!record)return;
 S.page=page;
 await listAssets();
 projectPage();
 installDatasetTools();
 if(record)history.pushState({view:'project',wid:S.wid,pid:S.project.id,page:S.page},'',`#project-${S.project.id}-page-${S.page}`);
 window.scrollTo({top:0,behavior:'smooth'});
}
function installDatasetTools(){
 const up=el('upload-images');if(up)up.onchange=uploadImages;
}
async function distributeAssets(){
 try {
 S.members=await api(`/workspaces/${S.project.workspace_id||S.wid}/members`);
 const eligible=S.members.filter(m=>['owner','manager','editor'].includes(m.role));
 if(!eligible.length){toast('Workspace chưa có thành viên có quyền đánh nhãn',true);return}
 const rows=eligible.map(m=>`<div class="assignment-row"><label class="assignment-member"><input type="checkbox" name="member_ids" value="${m.id}"><span><b>${html(m.display_name)}</b><small>@${html(m.username)} · ${html(m.role)}</small></span></label><label class="assignment-percent"><input type="number" name="percent_${m.id}" min="0.01" max="100" step="0.01" value="100" disabled aria-label="Tỷ lệ cho ${html(m.display_name)}"><span>%</span></label></div>`).join('');
 modalOpen('Phân chia ảnh theo tỷ lệ','Chọn người nhận và nhập tỷ lệ. Tổng tỷ lệ phải bằng 100%.',`<div class="assignment-list">${rows}</div><div class="row between assignment-summary"><span id="assignment-total">Chưa chọn thành viên</span><button type="button" class="btn quiet small" id="assignment-equal">Chia đều tỷ lệ</button></div><label>Phạm vi split</label><select name="split"><option value="">Tất cả split</option>${(S.projectStats?.splits||[]).map(s=>`<option value="${html(s.split)}">${html(s.split)} (${s.n})</option>`).join('')}</select><label>Trạng thái ảnh</label><select name="state"><option value="">Tất cả trạng thái</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="reviewed">Reviewed</option></select><label class="assignment-check"><input type="checkbox" name="only_unassigned" checked> Chỉ chia ảnh chưa được phân công</label>`,'Phân chia ảnh',async f=>{
 const member_ids=f.getAll('member_ids').map(Number),percentages=member_ids.map(id=>Number(f.get(`percent_${id}`)));
 if(!member_ids.length)throw new Error('Hãy chọn ít nhất một thành viên');
 if(percentages.some(v=>!Number.isFinite(v)||v<=0)||Math.abs(percentages.reduce((a,b)=>a+b,0)-100)>.001)throw new Error('Tổng tỷ lệ phải bằng 100%, mỗi người phải lớn hơn 0%');
 const result=await send('POST',`/projects/${S.project.id}/assignments/distribute`,{member_ids,percentages,split:f.get('split'),state:f.get('state'),only_unassigned:f.get('only_unassigned')==='on'});
 if(!result.assigned)throw new Error('Không có ảnh phù hợp. Hãy kiểm tra split, trạng thái hoặc bỏ chọn “Chỉ chia ảnh chưa được phân công” để chia lại.');
 toast(`Đã chia ${result.assigned} ảnh: `+member_ids.map(id=>`${eligible.find(m=>m.id===id).display_name}: ${result.counts[id]}`).join(' · '));await reloadProject();
 });
 const form=el('the-modal');
 const selected=()=>[...form.querySelectorAll('.assignment-row')].filter(row=>row.querySelector('[type=checkbox]').checked);
 const update=()=>{const total=selected().reduce((sum,row)=>sum+Number(row.querySelector('[type=number]').value),0);el('assignment-total').textContent=`Tổng tỷ lệ: ${Number(total.toFixed(2))}% / 100%`;};
 const equal=()=>{const rows=selected();rows.forEach((row,i)=>{row.querySelector('[type=number]').value=(Math.floor(10000/rows.length)+(i<10000%rows.length?1:0))/100});update()};
 form.querySelectorAll('.assignment-row [type=checkbox]').forEach(check=>check.onchange=()=>{check.closest('.assignment-row').querySelector('[type=number]').disabled=!check.checked;equal()});
 form.querySelectorAll('.assignment-row [type=number]').forEach(input=>input.oninput=update);
 el('assignment-equal').onclick=equal;
 }catch(err){toast(err.message,true)}
}
async function uploadImages(e){const files=[...e.target.files];if(!files.length)return;const form=new FormData();files.forEach(f=>form.append('files',f));const d=await send('POST',`/projects/${S.project.id}/upload`,form);toast(`Đã thêm ${d.count} ảnh`);await reloadProject()}
function inferProject(){modalOpen('Upload model & Infer','Chọn model trực tiếp từ máy. Model được lưu cục bộ trong Aegis Vision rồi dùng để nhận diện toàn bộ ảnh của project.','<label>Model YOLO</label><input class="field" name="model" type="file" accept=".pt,.onnx,.engine" required><label>Confidence</label><input class="field" name="confidence" type="number" min="0" max="1" step="0.01" value="0.25" required><label class="row" style="justify-content:flex-start;margin-top:14px"><input name="update_classes" type="checkbox" checked> Đồng bộ tên nhãn theo model</label><p class="tiny muted">Hỗ trợ .pt, .onnx và .engine. Quá trình infer có thể mất vài phút.</p>','Upload & Infer',async f=>{const file=f.get('model');const confidence=Number(f.get('confidence'));if(!(file instanceof File)||!file.size)throw new Error('Hãy chọn file model');if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new Error('Confidence phải nằm trong khoảng 0 đến 1');const upload=new FormData();upload.append('model',file);toast(`Đang upload ${file.name}…`);const saved=await api(`/projects/${S.project.id}/models/upload`,{method:'POST',body:upload});toast('Upload xong, đang infer…');console.log('[INFER] start',{project:S.project.id,model:saved.model_path,confidence});const d=await send('POST',`/projects/${S.project.id}/infer`,{model_path:saved.model_path,confidence,asset_ids:[],update_classes:f.get('update_classes')==='on'});console.log('[INFER] done',d);toast(`Infer xong ${d.results.length} ảnh, ${d.classes.length} class`);await reloadProject()})}
const PIPELINE_EXAMPLE={schema_version:'1.0',name:'human-behavior-pipeline',detector:{id:'human_detector',type:'detection',model:{source:'upload',filename:'human_detection.pt'},confidence:.25,selected_classes:['head','visible_person']},classification_groups:[{id:'visible_person_attributes',input:{from:'human_detector',class:'visible_person',mode:'bbox_crop'},classifiers:[{id:'sleep_classifier',type:'classification',model:{source:'upload',filename:'sleep_classifier.pt'},confidence:.5,selected_classes:['sleep']},{id:'raisehand_classifier',type:'classification',model:{source:'upload',filename:'raisehand_classifier.pt'},confidence:.5,selected_classes:['raisehand']}]}],resolution:{mode:'priority',priority:['raisehand','sleep','visible_person'],fallback:'visible_person'},output:{format:'yolo_detection',class_order:['head','visible_person','sleep','raisehand'],save_predictions_json:true}};
function pipelinePreview(config){const detector=config.detector||{};const classifiers=(config.classification_groups||[]).flatMap(g=>g.classifiers||[]);const labels=config.output?.class_order||[];return `<div class="stat-card" style="margin-top:14px"><div class="row between"><b>${html(config.name||'Unnamed pipeline')}</b><span class="tag purple">${1+classifiers.length} models</span></div><p class="tiny muted">Detection: ${html(detector.model?.filename||detector.id||'chưa gắn')} · ${html((detector.selected_classes||[]).join(', '))}</p>${classifiers.map(c=>`<p class="tiny">Classification: <b>${html(c.model?.filename||c.id)}</b> → ${html((c.selected_classes||[]).join(', '))}</p>`).join('')}<div class="row wrap">${labels.map((x,i)=>`<span class="tag">${i} ${html(x)}</span>`).join('')}</div></div>`}
const csv=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
function classifierFields(c={},i=0){return `<div class="stat-card classifier-row" style="margin-top:10px"><div class="row between"><b>Classifier ${i+1}</b><button type="button" class="btn danger small remove-classifier">Remove</button></div><label>Name</label><input class="field classifier-id" value="${html(c.id||`classifier_${i+1}`)}"><label>Model classify</label><input class="field classifier-file" type="file" accept=".pt,.onnx,.engine"><p class="tiny muted">${html(c.model?.filename||'Chưa gắn model')}</p><div class="row"><label style="flex:1">Output cần giữ<input class="field classifier-classes" value="${html((c.selected_classes||[]).join(', '))}" placeholder="sleep"></label><label style="width:130px">Confidence<input class="field classifier-conf" type="number" min="0" max="1" step=".01" value="${Number(c.confidence??.5)}"></label></div></div>`}
async function uploadPipelineModel(file,expected){if(!file?.size)return null;const body=new FormData();body.append('model',file);toast(`Đang đọc model ${file.name}…`);const model=await api(`/projects/${S.project.id}/models/upload`,{method:'POST',body});const task=model.task==='detect'?'detection':model.task==='classify'?'classification':model.task;if(task!==expected)throw new Error(`${file.name} là ${model.task}, cần model ${expected}`);return {source:'registry',model_id:model.model_id,filename:model.name,path:model.model_path,task:model.task,classes:model.classes}}
function renderInferProgress(s){let box=el('infer-progress');if(!box){box=document.createElement('aside');box.id='infer-progress';box.className='infer-progress';document.body.appendChild(box)}const pct=s.total?Math.round(s.processed/s.total*100):0;box.innerHTML=`<div class="row between"><b>${s.status==='completed'?'Infer completed':'Pipeline infer'}</b><span class="tag purple">${pct}%</span></div><div class="progress" style="margin:12px 0"><div style="width:${pct}%"></div></div><div class="tiny">Ảnh: ${s.processed||0} / ${s.total||0} · Đã ghi: ${s.images||0}</div><div class="tiny">BBox: ${s.boxes||0} · Bỏ qua: ${s.skipped||0}</div><div class="tiny muted" style="margin-top:8px;word-break:break-all">${html(s.current||s.last_label||'Đang chuẩn bị model…')}</div><div class="tiny muted" style="margin-top:6px;word-break:break-all">Labels: ${html(s.labels_root||'')}</div>${s.status==='completed'?'<button class="btn quiet small" style="margin-top:10px" onclick="this.parentNode.remove()">Close</button>':''}`}
function renderInferProgress(s){let box=el('infer-progress');if(!box){box=document.createElement('aside');box.id='infer-progress';box.className='infer-progress';document.body.appendChild(box)}const pct=s.total?Math.round(s.processed/s.total*100):0;const detail=s.status==='completed'?'Hoàn tất ghi nhãn':(s.current||s.last_label||'Đang chuẩn bị model…');box.innerHTML=`<div class="row between"><b>${s.status==='completed'?'Infer completed':'Pipeline infer'}</b><span class="tag purple">${pct}%</span></div><div class="progress" style="margin:12px 0"><div style="width:${pct}%"></div></div><div class="tiny">Ảnh đã duyệt: ${s.processed||0} / ${s.total||0} · Đã ghi: ${s.images||0}</div><div class="tiny">BBox: ${s.boxes||0} · Bỏ qua do có label: ${s.skipped||0}</div><div class="tiny muted" style="margin-top:8px;word-break:break-all">${html(detail)}</div><div class="tiny muted" style="margin-top:6px;word-break:break-all">Thư mục labels: ${html(s.labels_root||'')}</div>${s.status==='completed'?'<button class="btn quiet small" style="margin-top:10px" onclick="this.parentNode.remove()">Close</button>':''}`}
function watchPipeline(pid){let stopped=false;const tick=async()=>{if(stopped)return;try{const s=await api(`/projects/${pid}/pipeline/status`);renderInferProgress(s);if(s.status==='completed')stopped=true}catch{}};tick();const timer=setInterval(()=>{tick();if(stopped)clearInterval(timer)},800);return()=>{stopped=true;clearInterval(timer)}}
async function openPipeline(){const current=await api(`/projects/${S.project.id}/pipeline`);let config=current.config||PIPELINE_EXAMPLE;const existingClassifiers=(config.classification_groups||[]).flatMap(g=>g.classifiers||[]);const hasClassify=existingClassifiers.length>0;modal.innerHTML=`<div class="overlay"><form class="modal" id="pipeline-builder"><div class="row between"><h2>Inference Pipeline</h2><button type="button" class="btn ghost icon-btn" data-action="closeModal">${ic('close')}</button></div><p>Chọn loại pipeline, gắn model và class. JSON được tạo tự động.</p><label>Pipeline type</label><select id="pipeline-type" class="field"><option value="detect">Only Detection</option><option value="detect_classify" ${hasClassify?'selected':''}>Detection + Classification</option></select><label>Pipeline name</label><input id="pipeline-name" class="field" value="${html(config.name||'my-pipeline')}" required><div class="stat-card" style="margin-top:12px"><b>Detection</b><label>Model detection</label><input id="detector-file" class="field" type="file" accept=".pt,.onnx,.engine"><p class="tiny muted">${html(config.detector?.model?.filename||'Chưa gắn model')}</p><div class="row"><label style="flex:1">Classes cần giữ<input id="detector-classes" class="field" value="${html((config.detector?.selected_classes||[]).join(', '))}" placeholder="head, visible_person" required></label><label style="width:130px">Confidence<input id="detector-conf" class="field" type="number" min="0" max="1" step=".01" value="${Number(config.detector?.confidence??.25)}"></label></div></div><div id="classify-builder" style="display:${hasClassify?'block':'none'}"><label>Class bbox đưa vào classifiers</label><input id="classifier-input" class="field" value="${html(config.classification_groups?.[0]?.input?.class||'visible_person')}"><div id="classifier-list">${existingClassifiers.map(classifierFields).join('')}</div><button id="add-classifier" type="button" class="btn quiet small" style="margin-top:10px">+ Add classifier</button></div><details style="margin-top:14px"><summary class="tiny muted">Import / xem JSON nâng cao</summary><label>Import pipeline.json</label><input id="pipeline-file" class="field" type="file" accept=".json,application/json"><pre id="pipeline-json-preview" style="max-height:220px;overflow:auto;font-size:11px"></pre></details><div class="modal-foot"><button type="button" class="btn quiet" data-action="closeModal">Cancel</button><button type="submit" class="btn primary">Save Pipeline</button></div></form></div>`;
 const form=el('pipeline-builder'),type=el('pipeline-type'),list=el('classifier-list');form.querySelector('.modal-foot').insertAdjacentHTML('beforebegin','<label class="row" style="justify-content:flex-start"><input id="pipeline-overwrite" type="checkbox" style="width:auto"> Ghi đè label hiện có khi infer lại</label><p class="tiny muted">Bật tùy chọn này nếu ảnh đang chỉ có head hoặc nhãn từ lần infer cũ.</p>');type.onchange=()=>{el('classify-builder').style.display=type.value==='detect_classify'?'block':'none';refreshJson()};el('add-classifier').onclick=()=>{list.insertAdjacentHTML('beforeend',classifierFields({},list.children.length));refreshJson()};list.onclick=e=>{if(e.target.classList.contains('remove-classifier')){e.target.closest('.classifier-row').remove();refreshJson()}};
 form.querySelector('[type=submit]').remove();const runButton=document.createElement('button');runButton.type='submit';runButton.className='btn primary';runButton.textContent='Save & Infer';form.querySelector('.modal-foot').appendChild(runButton);runButton.onclick=()=>{form.dataset.run='1'};
 function draft(){const detectorClasses=csv(el('detector-classes').value),input=el('classifier-input')?.value.trim()||'visible_person';const classifiers=[...list.querySelectorAll('.classifier-row')].map(row=>({id:row.querySelector('.classifier-id').value.trim(),type:'classification',model:{source:'upload',filename:row.querySelector('.classifier-file').files[0]?.name||'model.pt'},confidence:Number(row.querySelector('.classifier-conf').value),selected_classes:csv(row.querySelector('.classifier-classes').value)}));const outputs=classifiers.flatMap(x=>x.selected_classes);return {schema_version:'1.0',name:el('pipeline-name').value.trim(),detector:{id:'human_detector',type:'detection',model:{source:'upload',filename:el('detector-file').files[0]?.name||config.detector?.model?.filename||'model.pt'},confidence:Number(el('detector-conf').value),selected_classes:detectorClasses},classification_groups:type.value==='detect_classify'?[{id:`${input}_attributes`,input:{from:'human_detector',class:input,mode:'bbox_crop'},classifiers}]:[],resolution:{mode:'priority',priority:[...outputs].reverse().concat(input),fallback:input},output:{format:'yolo_detection',class_order:[...new Set(detectorClasses.concat(outputs))],save_predictions_json:true}}}
 function refreshJson(){el('pipeline-json-preview').textContent=JSON.stringify(draft(),null,2)}form.addEventListener('input',refreshJson);refreshJson();
 el('pipeline-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const imported=JSON.parse(await file.text());const report=await send('POST',`/projects/${S.project.id}/pipeline/validate`,{config:imported});if(!report.valid)throw new Error(report.errors.join('; '));await send('PUT',`/projects/${S.project.id}/pipeline`,{config:imported});toast('Đã import pipeline JSON');modal.innerHTML='';await openPipeline()}catch(err){toast(err.message,true)}};
 form.onsubmit=async e=>{e.preventDefault();const submit=runButton,runAfter=form.dataset.run==='1',overwrite=el('pipeline-overwrite').checked;form.dataset.run='';submit.disabled=true;try{const built=draft();const detectorUpload=await uploadPipelineModel(el('detector-file').files[0],'detection');built.detector.model=detectorUpload||config.detector?.model||built.detector.model;if(type.value==='detect_classify'){const old=existingClassifiers;for(const [i,row] of [...list.querySelectorAll('.classifier-row')].entries()){const uploaded=await uploadPipelineModel(row.querySelector('.classifier-file').files[0],'classification');built.classification_groups[0].classifiers[i].model=uploaded||old[i]?.model||built.classification_groups[0].classifiers[i].model}}el('pipeline-json-preview').textContent=JSON.stringify(built,null,2);config=built;const report=await send('PUT',`/projects/${S.project.id}/pipeline`,{config:built});if(runAfter){toast(overwrite?'Đang infer lại và ghi đè nhãn cũ…':'Đang infer các ảnh chưa có nhãn…');modal.innerHTML='';renderInferProgress({status:'running',processed:0,total:S.project.total||0,images:0,boxes:0,skipped:0,labels_root:`${S.project.dataset_root}\\labels`});const stopWatch=watchPipeline(S.project.id);try{const result=await send('POST',`/projects/${S.project.id}/pipeline/run`,{overwrite});renderInferProgress({...result,status:'completed',processed:result.images+result.skipped,total:result.images+result.skipped});toast(`Infer xong ${result.images} ảnh · ${result.boxes} bbox · bỏ qua ${result.skipped}`);await reloadProject()}finally{stopWatch()}}else{toast(`Đã lưu ${report.model_count} models · ${report.final_classes.length} labels`);modal.innerHTML=''}}catch(err){toast(err.message,true)}finally{submit.disabled=false}}}
function labelEditorRow(name = '', value = PALETTE[0], idx = 0) {
  return `<div class="label-editor-row" draggable="true">
    <span class="drag-handle" title="Kéo thả để sắp xếp">☰</span>
    <span class="class-index-badge" title="Chỉ số YOLO class ID">#${idx}</span>
    <input name="label_color" type="color" value="${html(value)}" title="Chọn màu nhãn">
    <input name="label_name" class="field" value="${html(name)}" placeholder="Tên nhãn (e.g. phone, sleep)" required>
    <div class="reorder-btn-group">
      <button type="button" class="btn quiet reorder-btn move-up-label" title="Di chuyển lên (giảm index)">▲</button>
      <button type="button" class="btn quiet reorder-btn move-down-label" title="Di chuyển xuống (tăng index)">▼</button>
    </div>
    <button type="button" class="btn danger reorder-btn remove-label" title="Xóa nhãn">✕</button>
  </div>`;
}

function editLabels() {
  const rows = S.project.classes.map((name, i) => labelEditorRow(name, color(i), i)).join('');
  const modalBody = `
    <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
      <span class="tiny muted">Dùng nút ▲/▼ hoặc kéo biểu tượng ☰ để thay đổi thứ tự (class ID từ #0).</span>
    </div>
    <div id="label-editor-list" style="max-height:360px;overflow-y:auto;padding-right:4px">${rows}</div>
    <div class="row between" style="margin-top:12px">
      <button id="add-label" type="button" class="btn quiet small">+ Thêm nhãn mới</button>
      <span id="label-total-badge" class="tag outline">${S.project.classes.length} nhãn</span>
    </div>
    <div style="margin-top:14px;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:600">
        <input type="checkbox" name="remap_existing" id="remap-existing">
        <span>Tự động đổi class ID trong các file nhãn (.txt) hiện có theo thứ tự mới</span>
      </label>
      <p class="tiny muted" style="margin:4px 0 0 24px;line-height:1.4">
        • <b>Bật:</b> Nếu bạn vừa đổi vị trí nhãn và muốn các bounding box đã vẽ chuyển sang ID mới theo đúng tên nhãn.<br>
        • <b>Tắt:</b> Giữ nguyên số ID trong file .txt (dành cho trường hợp sắp xếp lại danh sách để khớp với file đã có sẵn).
      </p>
    </div>
  `;

  modalOpen('Nhãn & Thứ tự Class ID', 'Chỉnh sửa tên, màu sắc và thứ tự class ID trong dataset YOLO.', modalBody, 'Lưu nhãn & thứ tự', async f => {
    const names = f.getAll('label_name').map(n => n.trim()).filter(Boolean);
    const colors = f.getAll('label_color');
    const remap = f.get('remap_existing') === 'on';
    if (!names.length) throw new Error('Cần ít nhất một nhãn');
    if (new Set(names).size !== names.length) throw new Error('Tên các nhãn không được trùng nhau');
    const result = await send('PUT', `/projects/${S.project.id}/labels`, {
      labels: names.map((name, i) => ({ name, color: colors[i] })),
      remap_existing: remap
    });
    S.project.classes = result.classes;
    S.project.class_colors = result.class_colors;
    S.projects = await api(`/workspaces/${S.wid}/projects`);
    if (result.remapped_count > 0) {
      toast(`Đã lưu và cập nhật ${result.remapped_count} file nhãn theo thứ tự mới`);
    } else {
      toast('Đã lưu thứ tự và màu nhãn');
    }
    if (S.view === 'editor') {
      if (S.editor) {
        try {
          const info = await api(`/projects/${S.project.id}/assets/${S.editor.id}`);
          S.editor = info;
        } catch {}
      }
      renderEditor();
    } else {
      await reloadProject();
    }
  });

  const list = el('label-editor-list');
  function updateIndices() {
    const rows = [...list.querySelectorAll('.label-editor-row')];
    rows.forEach((row, i) => {
      const badge = row.querySelector('.class-index-badge');
      if (badge) badge.textContent = `#${i}`;
      const up = row.querySelector('.move-up-label');
      if (up) up.disabled = i === 0;
      const down = row.querySelector('.move-down-label');
      if (down) down.disabled = i === rows.length - 1;
    });
    const totalBadge = el('label-total-badge');
    if (totalBadge) totalBadge.textContent = `${rows.length} nhãn`;
  }

  let dragSrc = null;
  function bindDnD(row) {
    row.addEventListener('dragstart', e => {
      dragSrc = row;
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.label-editor-row').forEach(r => r.classList.remove('drag-over'));
      updateIndices();
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (row !== dragSrc) row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over');
      if (dragSrc && row !== dragSrc) {
        const rows = [...list.children];
        const srcIdx = rows.indexOf(dragSrc);
        const tgtIdx = rows.indexOf(row);
        if (srcIdx < tgtIdx) {
          list.insertBefore(dragSrc, row.nextSibling);
        } else {
          list.insertBefore(dragSrc, row);
        }
        updateIndices();
      }
    });
  }

  list.querySelectorAll('.label-editor-row').forEach(bindDnD);
  updateIndices();

  el('add-label').onclick = () => {
    const idx = list.children.length;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = labelEditorRow(`class_${idx}`, PALETTE[idx % PALETTE.length], idx);
    const newRow = tempDiv.firstElementChild;
    list.appendChild(newRow);
    bindDnD(newRow);
    updateIndices();
    newRow.querySelector('input[name="label_name"]')?.focus();
  };

  list.onclick = e => {
    const upBtn = e.target.closest('.move-up-label');
    const downBtn = e.target.closest('.move-down-label');
    const removeBtn = e.target.closest('.remove-label');
    if (upBtn) {
      const row = upBtn.closest('.label-editor-row');
      if (row && row.previousElementSibling) {
        list.insertBefore(row, row.previousElementSibling);
        updateIndices();
      }
    } else if (downBtn) {
      const row = downBtn.closest('.label-editor-row');
      if (row && row.nextElementSibling) {
        list.insertBefore(row.nextElementSibling, row);
        updateIndices();
      }
    } else if (removeBtn) {
      if (list.children.length <= 1) {
        toast('Cần ít nhất một nhãn', true);
        return;
      }
      const row = removeBtn.closest('.label-editor-row');
      if (row) {
        row.remove();
        updateIndices();
      }
    }
  };
}
async function checkQuality(){
 const d=await api(`/projects/${S.project.id}/quality`);
 if(d.error_count){toast(`Phát hiện ${d.error_count} lỗi nhãn`,true);alert(`Có ${d.error_count} lỗi nhãn. Ví dụ:\n`+d.errors.slice(0,10).map(x=>`${x.image}: ${x.error}`).join('\n'))}
 else toast(`Nhãn hợp lệ: ${d.images} ảnh, ${Object.values(d.classes).reduce((a,b)=>a+b,0)} bbox`);
}
function exportProject(){window.location.href=`/api/projects/${S.project.id}/export`}
async function listAssets(){const d=await api(`/projects/${S.project.id}/assets?page=${S.page}&limit=48&split=${enc(S.split)}&state=${enc(S.state)}&annotated_by=${S.annotatedBy||0}&assigned_to=${S.assignedTo||0}&class_id=${S.classFilter!==undefined?S.classFilter:-1}&q=${enc(S.query)}`);S.assets=d.items;S.total=d.total}
async function openTeam(){if(!S.wid){toast('Tạo workspace trước',true);return}const members=await api(`/workspaces/${S.wid}/members`);teamPage(members);installAdminControls(members)}
function installAdminControls(members){
 if(!S.user?.is_admin)return;
 const heading=document.querySelector('.section-heading');
 if(heading&&!heading.querySelector('#delete-workspace')){const b=document.createElement('button');b.id='delete-workspace';b.className='btn danger small';b.dataset.action='deleteWorkspace';b.textContent='Delete workspace';heading.appendChild(b)}
 document.querySelectorAll('.members-table tbody tr').forEach((tr,i)=>{const m=members[i];if(!m||m.role==='owner')return;const cell=document.createElement('td');const b=document.createElement('button');b.className='btn danger small';b.textContent='Remove';b.dataset.action='removeMember';b.dataset.id=m.id;cell.appendChild(b);tr.appendChild(cell)})
}
async function deleteProject(e){if(!confirm('Xóa project khỏi Workspace? Ảnh và nhãn gốc trên ổ đĩa sẽ được giữ nguyên.'))return;await send('DELETE',`/projects/${e.dataset.id}`);await fetchWorkspaces();S.wid=S.wid;await loadWorkspace();toast('Đã xóa project')}
async function deleteWorkspace(){if(!confirm('Xóa workspace và toàn bộ project/index review trong đó? Ảnh và nhãn gốc trên ổ đĩa sẽ được giữ nguyên.'))return;await send('DELETE',`/workspaces/${S.wid}`);S.wid=null;await fetchWorkspaces();await loadWorkspace();toast('Đã xóa workspace')}
async function removeMember(e){if(!confirm('Xóa member này khỏi workspace?'))return;await send('DELETE',`/workspaces/${S.wid}/members/${e.dataset.id}`);await openTeam();toast('Đã xóa member')}
function promptDirty(){return !S.dirty || confirm('Bạn chưa lưu thay đổi. Bỏ thay đổi để chuyển ảnh?')}
const copyBoxes=()=>JSON.parse(JSON.stringify(S.editor?.boxes||[]));
function snapshot(){if(S.editor){S.undo.push(copyBoxes());if(S.undo.length>60)S.undo.shift();S.redo=[]}}
function commitChange(){S.dirty=true;refreshInspector();drawCanvas()}
function undoRedo(kind){if(S.readonly)return;let from=kind==='undo'?S.undo:S.redo,to=kind==='undo'?S.redo:S.undo;if(!from.length)return;to.push(copyBoxes());S.editor.boxes=from.pop();S.selected=null;if(S.selectedSet)S.selectedSet.clear();S.hoveredBox=null;commitChange()}
async function releaseEditor(){clearInterval(S.heartbeat);S.heartbeat=null;if(S.editor && S.lease){try{await send('POST',`/projects/${S.project.id}/assets/${S.editor.id}/unlock`)}catch{}}S.editor=null;S.img=null;S.lease=false}
async function openAsset(id,record=true){if(S.dirty&&S.autosave){await saveImage(false)}else if(!promptDirty())return;await releaseEditor();
 let p=S.project.id;let lease=false;const canEdit=['owner','manager','editor'].includes(S.project.role);if(canEdit){try{await send('POST',`/projects/${p}/assets/${id}/lock`);lease=true}catch(e){toast(e.message+' — read-only',true)}}
 let info;try{info=await api(`/projects/${p}/assets/${id}`)}catch(e){if(lease){await send('POST',`/projects/${p}/assets/${id}/unlock`).catch(()=>{})}throw e}
 S.lease=lease;S.readonly=!lease;S.editor=info;S.selected=null;if(S.selectedSet)S.selectedSet.clear();S.hoveredBox=null;S.zoom=1;S.pan={x:0,y:0};S.dirty=false;S.undo=[];S.redo=[];S.editMode='select';S.drawClass=0;
 const im=new Image();im.onload=()=>{if(S.editor?.id===id){S.img=im;renderEditor()}};im.onerror=()=>toast('Lỗi tải ảnh từ máy chủ',true);im.src=`/api/projects/${p}/assets/${id}/image`;
 S.heartbeat=setInterval(async()=>{if(S.lease && S.editor){try{await send('POST',`/projects/${p}/assets/${S.editor.id}/lock`)}catch(e){S.lease=false;S.readonly=true;toast('Đã mất khóa ảnh; không thể lưu cho đến khi mở lại',true);renderEditor()}}},65000)
 if(record)history.pushState({view:'editor',wid:S.wid,pid:p,aid:id,page:S.page},'',`#project-${p}-asset-${id}`)
}
function editorFilmstrip(){
  let list=S.assets.filter(a=>!S.railQuery || a.image_rel.toLowerCase().includes(S.railQuery.toLowerCase()));
  return `<div class="editor-filmstrip">
    <div class="filmstrip-info">
      <div class="row between">
        <span class="tiny bold">${S.total} ảnh</span>
        <input class="field mini" id="rail-search" value="${html(S.railQuery)}" placeholder="Lọc ảnh...">
      </div>
    </div>
    <div class="filmstrip-scroll" id="rail-content">
      ${filmstripItems(list)}
    </div>
  </div>`;
}

function filmstripItems(list){
  return list.map((a, idx)=>{
    const isCur = S.editor?.id === a.id;
    return `<div class="filmstrip-thumb ${isCur?'active':''}" data-action="openAsset" data-id="${a.id}" title="${html(a.image_rel)}">
      <img loading="lazy" src="/api/projects/${S.project.id}/assets/${a.id}/thumbnail" alt="">
      <span class="filmstrip-badge ${a.state==='reviewed'?'done':(a.state==='in_progress'?'prog':'')}">
        ${a.state==='reviewed'?'✓':(a.state==='in_progress'?'◐':'')}
      </span>
      <span class="filmstrip-num">${idx+1}</span>
    </div>`;
  }).join('');
}
function boxClass(name,i,active=false){return `<button class="class-row ${active?'box-row selected':''}" data-action="chooseClass" data-id="${i}"><span><span class="class-dot" style="background:${color(i)}"></span> ${html(name)}</span><span class="tag">${i<9?`<span class="kbd">${i+1}</span>`:i}</span></button>`}

function boxZoneDescription(b, W, H){
  const yZone = b.y < 0.35 ? 'Trên' : (b.y > 0.65 ? 'Dưới' : 'Giữa');
  const xZone = b.x < 0.35 ? 'Trái' : (b.x > 0.65 ? 'Phải' : 'Giữa');
  let zone = `${yZone} - ${xZone}`;
  if(yZone === 'Giữa' && xZone === 'Giữa') zone = 'Chính giữa';
  else if(yZone === 'Giữa') zone = `Bên ${xZone}`;
  else if(xZone === 'Giữa') zone = `Phía ${yZone}`;
  const pxX = Math.round(b.x * (W || 1));
  const pxY = Math.round(b.y * (H || 1));
  return { zone, coords: `(${pxX}, ${pxY})` };
}

function isBoxSelected(i){
  return S.selected === i || (S.selectedSet && S.selectedSet.has(i));
}

function getSelectedIndices(){
  const s = new Set(S.selectedSet ? Array.from(S.selectedSet) : []);
  if(S.selected != null) s.add(S.selected);
  if(!S.editor?.boxes) return [];
  return Array.from(s).filter(i => i >= 0 && i < S.editor.boxes.length).sort((a,b)=>a-b);
}

function toggleSelectBox(i, multi = false){
  if(!S.selectedSet) S.selectedSet = new Set();
  if(!multi){
    S.selectedSet.clear();
    if(i != null) {
      S.selected = i;
      S.selectedSet.add(i);
    } else {
      S.selected = null;
    }
  } else {
    if(i != null){
      if(S.selectedSet.has(i)){
        S.selectedSet.delete(i);
        if(S.selected === i) S.selected = S.selectedSet.size ? Array.from(S.selectedSet)[0] : null;
      }else{
        S.selectedSet.add(i);
        S.selected = i;
      }
    }
  }
  refreshInspector();
  updateFloatingBar();
  drawCanvas();
}

function selectAllBoxes(select = true){
  if(!S.selectedSet) S.selectedSet = new Set();
  S.selectedSet.clear();
  if(select && S.editor?.boxes){
    S.editor.boxes.forEach((_, i) => S.selectedSet.add(i));
    S.selected = S.editor.boxes.length ? 0 : null;
  }else{
    S.selected = null;
  }
  refreshInspector();
  updateFloatingBar();
  drawCanvas();
}

function deleteBox(){
  deleteSelectedBoxes();
}

function deleteSelectedBoxes(){
  if(S.readonly) return;
  const indices = getSelectedIndices();
  if(!indices.length) return;
  snapshot();
  indices.sort((a,b)=>b-a).forEach(idx => {
    S.editor.boxes.splice(idx, 1);
  });
  S.selected = null;
  if(S.selectedSet) S.selectedSet.clear();
  commitChange();
  updateFloatingBar();
  toast(`✓ Đã xóa ${indices.length} bounding box`);
}

function updateFloatingBar(){
  const bar = el('canvas-floating-bar');
  if(!bar) return;
  const indices = getSelectedIndices();
  const count = indices.length;
  if(count === 0 && S.editMode !== 'multi'){
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  if(count === 0 && S.editMode === 'multi'){
    bar.innerHTML = `
      <span class="badge" style="background:#805ad5;color:#fff">⚡ Chế độ Chọn nhiều</span>
      <span style="font-size:11px;color:var(--text2)">Click các box trên ảnh để gom chọn hoặc kéo chuột để quét</span>
      <button class="btn quiet mini" type="button" data-action="selectAllBoxes" style="border-radius:99px;padding:3px 9px">Chọn tất cả</button>
      <button class="btn quiet mini" type="button" data-action="modeSelect" style="border-radius:99px;padding:3px 9px">Thoát (V)</button>
    `;
    return;
  }
  bar.innerHTML = `
    <span class="badge" style="background:var(--accent);color:#0c0c10">✓ Đã chọn: ${count} box</span>
    <button class="btn danger small" type="button" data-action="deleteSelectedBoxes" style="border-radius:99px;padding:4px 12px;font-weight:700;display:flex;align-items:center;gap:5px" title="Xóa các box đã chọn trong ảnh này (Phím Del)">
      ${ic('trash','sm')} Xóa (${count}) [Del]
    </button>
    <button class="btn small" type="button" data-action="batchAddModal" style="background:#2b6cb0;color:#fff;border:none;border-radius:99px;padding:4px 12px;font-weight:700;display:flex;align-items:center;gap:5px" title="Bổ sung các box tại vị trí này vào tất cả các ảnh khác trong dataset">
      ➕ Thêm vào MỌI ẢNH
    </button>
    <button class="btn small" type="button" data-action="batchDeleteModal" style="background:#805ad5;color:#fff;border:none;border-radius:99px;padding:4px 12px;font-weight:700;display:flex;align-items:center;gap:5px" title="Tìm và xóa các box ở cùng tọa độ này trên tất cả các ảnh khác trong dataset">
      ⚡ Xóa ở MỌI ẢNH
    </button>
    <button class="btn quiet small" type="button" data-action="deselectAllBoxes" style="border-radius:99px;padding:4px 9px" title="Bỏ chọn tất cả (Esc)">
      ✕ Bỏ chọn
    </button>
  `;
}

function installBoxHoverListeners(){
  document.querySelectorAll('.box-list-item').forEach(item => {
    const id = Number(item.dataset.boxId);
    item.onmouseenter = () => {
      S.hoveredBox = id;
      drawCanvas();
    };
    item.onmouseleave = () => {
      if(S.hoveredBox === id){
        S.hoveredBox = null;
        drawCanvas();
      }
    };
  });
}

async function openBatchDeleteModal(){
  const indices = getSelectedIndices();
  if(!indices.length){
    toast('Vui lòng chọn ít nhất 1 box cần xóa ở mọi ảnh', true);
    return;
  }
  const targets = indices.map(i => ({ ...S.editor.boxes[i] }));
  const W = S.editor.width, H = S.editor.height;

  const listHTML = targets.map((b, idx) => {
    const { zone, coords } = boxZoneDescription(b, W, H);
    return `
      <div class="row between" style="padding:6px 10px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);margin-bottom:6px">
        <div class="row" style="gap:8px">
          <span class="tag" style="background:#805ad5;color:#fff">#${idx+1}</span>
          <span style="font-weight:600">${html(S.project.classes[b.cls])}</span>
        </div>
        <div class="row tiny muted" style="gap:10px">
          <span class="tag outline">${zone}</span>
          <span>Tâm: ${coords} · W:${Math.round(b.w*W)}px H:${Math.round(b.h*H)}px</span>
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="overlay" data-close-modal="1">
      <div class="modal" id="batch-delete-dialog" style="max-width:680px">
        <div class="row between">
          <h2>⚡ Xóa box ở cùng tọa độ này trên TẤT CẢ CÁC ẢNH KHÁC</h2>
          <button type="button" class="btn ghost icon-btn" data-action="closeModal">${ic('close')}</button>
        </div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:12px">
          Vì camera cố định (như camera góc lớp học), <b>các ảnh khác trong dataset cũng sẽ bị dính box ở cùng tọa độ này</b> (ví dụ tranh/poster vẽ người trên tường).<br>Hệ thống sẽ quét toàn bộ <b>${S.total||S.assets.length} ảnh khác</b> trong dataset để tìm và xóa sạch các box xuất hiện tại đúng vị trí này!
        </p>
        <div style="margin-bottom:12px">
          <label class="tiny muted" style="font-weight:600;display:block;margin-bottom:6px">CÁC VỊ TRÍ ĐÃ CHỌN (${targets.length} box):</label>
          <div style="max-height:160px;overflow-y:auto;padding-right:4px">${listHTML}</div>
        </div>
        <div style="background:var(--card);padding:12px;border-radius:8px;border:1px solid var(--border);display:flex;flex-direction:column;gap:10px">
          <label class="row" style="gap:8px;cursor:pointer;font-size:12px">
            <input type="checkbox" id="batch-match-class" style="accent-color:var(--accent);cursor:pointer">
            <span>Chỉ xóa nếu <b>trùng đúng nhãn class</b> (bỏ tích nếu muốn xóa mọi nhãn tại vị trí này)</span>
          </label>
          <div class="row between" style="gap:10px">
            <label class="tiny muted" style="flex:1">
              <span>Độ nhạy khớp vị trí:</span>
              <select id="batch-iou-tol" class="field mini" style="width:100%;margin-top:4px">
                <option value="0.25">Rộng rãi (IoU ≥ 0.25 hoặc tâm sai số ≤ 8%)</option>
                <option value="0.35" selected>Chuẩn (IoU ≥ 0.35 hoặc tâm sai số ≤ 6%)</option>
                <option value="0.50">Chặt chẽ (IoU ≥ 0.50 hoặc tâm sai số ≤ 4%)</option>
              </select>
            </label>
            <label class="tiny muted" style="flex:1">
              <span>Phạm vi áp dụng:</span>
              <select id="batch-split" class="field mini" style="width:100%;margin-top:4px">
                <option value="all" selected>Toàn bộ dataset (${S.total || S.assets.length} ảnh)</option>
                <option value="${html(S.editor.split || 'train')}">Chỉ split hiện tại (${html(S.editor.split || 'train')})</option>
              </select>
            </label>
          </div>
        </div>
        <div id="batch-delete-result" style="margin-top:12px"></div>
        <div class="modal-foot" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
          <button type="button" class="btn quiet" data-action="closeModal">Đóng</button>
          <div class="row" style="gap:8px">
            <button type="button" class="btn quiet" id="btn-batch-preview">🔍 Xem trước (Preview)</button>
            <button type="button" class="btn danger" id="btn-batch-confirm">🗑️ Tiến hành Xóa ở mọi ảnh</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const btnPreview = el('btn-batch-preview');
  const btnConfirm = el('btn-batch-confirm');
  const resBox = el('batch-delete-result');

  function renderBatchProgress(info, mode) {
    if (!resBox) return;
    const isDel = mode === 'delete';
    const percent = Math.min(100, Math.max(0, info.percent || 0));
    const processed = info.processed || 0;
    const total = info.total || (S.total || S.assets.length);
    const matchedBoxes = info.matched_boxes || 0;
    const matchedImages = info.matched_images || 0;
    const curFile = info.current_file ? filename(info.current_file) : '';
    const title = isDel ? '🗑️ Đang tiến hành xóa box...' : '🔍 Đang quét xem trước toàn bộ dataset...';
    const themeCol = isDel ? '#f87171' : 'var(--accent)';

    resBox.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:6px">
        <div class="row between" style="margin-bottom:8px">
          <span style="font-weight:700;font-size:12px;color:${themeCol};display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${themeCol};display:inline-block;box-shadow:0 0 8px ${themeCol}"></span>
            ${title}
          </span>
          <span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${themeCol}">${percent.toFixed(1)}%</span>
        </div>
        <div style="background:var(--surface3);height:9px;border-radius:5px;overflow:hidden;margin-bottom:10px;border:1px solid var(--border)">
          <div style="width:${percent}%;height:100%;background:${themeCol};transition:width 0.15s ease-out"></div>
        </div>
        <div class="row between tiny muted" style="font-size:11px">
          <span>Tiến trình: <b>${processed.toLocaleString()}</b> / <b>${total.toLocaleString()}</b> ảnh</span>
          <span style="color:var(--text)">Đã phát hiện: <b style="color:${themeCol}">${matchedBoxes.toLocaleString()}</b> box (<b style="color:${themeCol}">${matchedImages.toLocaleString()}</b> ảnh)</span>
        </div>
        ${curFile ? `<div class="tiny muted" style="margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--font-mono);font-size:10px;color:var(--dim)">Đang xử lý: ${html(curFile)}</div>` : ''}
      </div>
    `;
  }

  if(btnPreview){
    btnPreview.onclick = async () => {
      btnPreview.disabled = true;
      if(btnConfirm) btnConfirm.disabled = true;
      let stopped = false;
      renderBatchProgress({ percent: 0, processed: 0, total: S.total || S.assets.length, matched_boxes: 0, matched_images: 0, current_file: '' }, 'preview');
      const timer = setInterval(async () => {
        if(stopped || !resBox || !resBox.isConnected) return;
        try {
          const s = await api(`/projects/${S.project.id}/batch-delete-boxes/status`);
          if(!stopped && s && s.status === 'running') renderBatchProgress(s, 'preview');
        } catch(e) {}
      }, 180);

      try{
        const matchClass = el('batch-match-class')?.checked || false;
        const iouTol = Number(el('batch-iou-tol')?.value || 0.35);
        const split = el('batch-split')?.value || 'all';
        const res = await send('POST', `/projects/${S.project.id}/batch-delete-boxes`, {
          target_boxes: targets,
          match_class: matchClass,
          iou_threshold: iouTol,
          center_tol: iouTol === 0.25 ? 0.08 : (iouTol === 0.5 ? 0.04 : 0.06),
          split: split,
          dry_run: true
        });
        stopped = true;
        clearInterval(timer);
        if(resBox){
          resBox.innerHTML = `
            <div style="background:rgba(45,212,168,0.1);border:1px solid var(--accent);padding:12px;border-radius:8px;font-size:12px">
              <div class="row between" style="margin-bottom:6px">
                <b style="color:var(--accent);font-size:13px">✓ Kết quả quét xem trước hoàn tất (100%):</b>
                <span class="tag green">Khớp ${res.matched_boxes.toLocaleString()} box</span>
              </div>
              <div>Tìm thấy <b>${res.matched_boxes.toLocaleString()}</b> box ở vị trí này trên <b>${res.matched_images.toLocaleString()}</b> ảnh trong dataset!</div>
              ${res.sample_images && res.sample_images.length ? `
                <div class="tiny muted" style="margin-top:8px">
                  <b>Một số ảnh có xuất hiện box này:</b>
                  <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
                    ${res.sample_images.map(img => `<code style="background:var(--surface3);padding:2px 6px;border-radius:4px;font-size:10px">${html(filename(img))}</code>`).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }
      }catch(err){
        stopped = true;
        clearInterval(timer);
        if(resBox) resBox.innerHTML = `<p class="tiny red" style="margin-top:6px">Lỗi: ${err.message}</p>`;
      }finally{
        btnPreview.disabled = false;
        if(btnConfirm) btnConfirm.disabled = false;
      }
    };
  }

  if(btnConfirm){
    btnConfirm.onclick = async () => {
      const matchClass = el('batch-match-class')?.checked || false;
      const iouTol = Number(el('batch-iou-tol')?.value || 0.35);
      const split = el('batch-split')?.value || 'all';
      if(!confirm(`Xác nhận xóa vĩnh viễn các box tại ${targets.length} vị trí này trên toàn bộ dataset?`)) return;
      btnConfirm.disabled = true;
      if(btnPreview) btnPreview.disabled = true;
      let stopped = false;
      renderBatchProgress({ percent: 0, processed: 0, total: S.total || S.assets.length, matched_boxes: 0, matched_images: 0, current_file: '' }, 'delete');
      const timer = setInterval(async () => {
        if(stopped || !resBox || !resBox.isConnected) return;
        try {
          const s = await api(`/projects/${S.project.id}/batch-delete-boxes/status`);
          if(!stopped && s && s.status === 'running') renderBatchProgress(s, 'delete');
        } catch(e) {}
      }, 180);

      try{
        const res = await send('POST', `/projects/${S.project.id}/batch-delete-boxes`, {
          target_boxes: targets,
          match_class: matchClass,
          iou_threshold: iouTol,
          center_tol: iouTol === 0.25 ? 0.08 : (iouTol === 0.5 ? 0.04 : 0.06),
          split: split,
          dry_run: false
        });
        stopped = true;
        clearInterval(timer);
        toast(`✓ Đã xóa thành công ${res.matched_boxes} box trên ${res.matched_images} ảnh!`);
        modal.innerHTML = '';
        await openAsset(S.editor.id);
      }catch(err){
        stopped = true;
        clearInterval(timer);
        if(resBox) resBox.innerHTML = `<p class="tiny red" style="margin-top:6px">Lỗi khi xóa: ${err.message}</p>`;
        btnConfirm.disabled = false;
        if(btnPreview) btnPreview.disabled = false;
      }
    };
  }
}


async function openBatchAddModal(){
  const indices = getSelectedIndices();
  if(!indices.length){
    toast('Vui lòng chọn ít nhất 1 box cần bổ sung vào mọi ảnh', true);
    return;
  }
  const targets = indices.map(i => ({ ...S.editor.boxes[i] }));
  const W = S.editor.width, H = S.editor.height;

  const listHTML = targets.map((b, idx) => {
    const { zone, coords } = boxZoneDescription(b, W, H);
    return `
      <div class="row between" style="padding:6px 10px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);margin-bottom:6px">
        <div class="row" style="gap:8px">
          <span class="tag" style="background:#2b6cb0;color:#fff">#${idx+1}</span>
          <span style="font-weight:600">${html(S.project.classes[b.cls])}</span>
        </div>
        <div class="row tiny muted" style="gap:10px">
          <span class="tag outline">${zone}</span>
          <span>Tâm: ${coords} · W:${Math.round(b.w*W)}px H:${Math.round(b.h*H)}px</span>
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="overlay" data-close-modal="1">
      <div class="modal" id="batch-add-dialog" style="max-width:680px">
        <div class="row between">
          <h2>➕ Bổ sung box tại tọa độ này vào TẤT CẢ CÁC ẢNH KHÁC</h2>
          <button type="button" class="btn ghost icon-btn" data-action="closeModal">${ic('close')}</button>
        </div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:10px">
          Áp dụng cho camera cố định (như camera góc lớp học): Bổ sung bounding box tại <b>đúng vị trí này với nhãn tương ứng</b> vào các ảnh khác trong dataset (rất hữu ích khi mô hình bị sót phát hiện người/vật thể ở vị trí cố định).
        </p>
        <div style="background:rgba(43,108,176,0.15);border:1px solid #3182ce;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;display:flex;align-items:flex-start;gap:8px">
          <span style="font-size:15px;line-height:1">🛡️</span>
          <div style="color:var(--text);line-height:1.5">
            <b>Cơ chế kiểm tra chống trùng lặp:</b> Hệ thống sẽ kiểm tra từng ảnh một. Nếu tại vị trí này ảnh <b>đã có sẵn box</b> (IoU ≥ 0.35 hoặc tâm trùng khớp), hệ thống sẽ <b>TỰ ĐỘNG BỎ QUA</b> để không bị thêm đè box trùng lặp! Chỉ những ảnh <b>chưa có box</b> mới được bổ sung.
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label class="tiny muted" style="font-weight:600;display:block;margin-bottom:6px">CÁC VỊ TRÍ & NHÃN ĐÃ CHỌN (${targets.length} box):</label>
          <div style="max-height:160px;overflow-y:auto;padding-right:4px">${listHTML}</div>
        </div>
        <label class="row" style="gap:8px;cursor:pointer;font-size:12px;margin-bottom:10px">
          <input type="checkbox" id="batch-add-match-class" checked style="accent-color:var(--accent);cursor:pointer">
          <span>Chỉ coi là trùng nếu <b>trùng đúng nhãn class</b> (Khuyên dùng: Bật để tránh nhầm giữa Người và Đầu)</span>
        </label>
        <div style="background:var(--card);padding:12px;border-radius:8px;border:1px solid var(--border);display:flex;flex-direction:column;gap:10px">
          <div class="row between" style="gap:10px">
            <label class="tiny muted" style="flex:1">
              <span>Gán nhãn (Class):</span>
              <select id="batch-add-override-class" class="field mini" style="width:100%;margin-top:4px">
                <option value="-1" selected>Giữ nguyên nhãn của từng box đã chọn</option>
                ${S.project.classes.map((cName, cIdx) => `<option value="${cIdx}">Đổi tất cả sang: ${html(cName)}</option>`).join('')}
              </select>
            </label>
            <label class="tiny muted" style="flex:1">
              <span>Quy tắc bổ sung:</span>
              <select id="batch-add-mode" class="field mini" style="width:100%;margin-top:4px">
                <option value="skip_if_exists" selected>✓ Chỉ thêm nếu CHƯA CÓ box cùng vị trí & nhãn (Chống trùng)</option>
                <option value="always_add">⚡ Luôn luôn thêm box mới (Bỏ qua kiểm tra trùng / Ép buộc thêm)</option>
                <option value="update_class">Cập nhật lại nhãn nếu đã có box (hoặc thêm nếu chưa có)</option>
              </select>
            </label>
          </div>
          <div class="row between" style="gap:10px">
            <label class="tiny muted" style="flex:1">
              <span>Độ nhạy kiểm tra trùng vị trí:</span>
              <select id="batch-add-iou-tol" class="field mini" style="width:100%;margin-top:4px">
                <option value="0.25">Rộng rãi (IoU ≥ 0.25 hoặc tâm sai số ≤ 8%)</option>
                <option value="0.35" selected>Chuẩn (IoU ≥ 0.35 hoặc tâm sai số ≤ 6%)</option>
                <option value="0.50">Chặt chẽ (IoU ≥ 0.50 hoặc tâm sai số ≤ 4%)</option>
              </select>
            </label>
            <label class="tiny muted" style="flex:1">
              <span>Phạm vi áp dụng:</span>
              <select id="batch-add-split" class="field mini" style="width:100%;margin-top:4px">
                <option value="all" selected>Toàn bộ dataset (${S.total || S.assets.length} ảnh)</option>
                <option value="${html(S.editor.split || 'train')}">Chỉ split hiện tại (${html(S.editor.split || 'train')})</option>
              </select>
            </label>
          </div>
        </div>
        <div id="batch-add-result" style="margin-top:12px"></div>
        <div class="modal-foot" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
          <button type="button" class="btn quiet" data-action="closeModal">Đóng</button>
          <div class="row" style="gap:8px">
            <button type="button" class="btn quiet" id="btn-batch-add-preview">🔍 Xem trước (Preview)</button>
            <button type="button" class="btn primary" id="btn-batch-add-confirm" style="background:#2b6cb0;border-color:#2b6cb0">➕ Tiến hành Bổ sung vào mọi ảnh</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const btnPreview = el('btn-batch-add-preview');
  const btnConfirm = el('btn-batch-add-confirm');
  const resBox = el('batch-add-result');

  function renderBatchAddProgress(info, mode) {
    if (!resBox) return;
    const isConfirm = mode === 'add';
    const percent = Math.min(100, Math.max(0, info.percent || 0));
    const processed = info.processed || 0;
    const total = info.total || (S.total || S.assets.length);
    const addedBoxes = info.added_boxes || 0;
    const updatedImages = info.updated_images || 0;
    const alreadyExisted = info.already_existed || 0;
    const curFile = info.current_file ? filename(info.current_file) : '';
    const title = isConfirm ? '➕ Đang bổ sung box vào các file nhãn...' : '🔍 Đang quét xem trước toàn bộ dataset...';
    const themeCol = '#3182ce';

    resBox.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:6px">
        <div class="row between" style="margin-bottom:8px">
          <span style="font-weight:700;font-size:12px;color:${themeCol};display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${themeCol};display:inline-block;box-shadow:0 0 8px ${themeCol}"></span>
            ${title}
          </span>
          <span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${themeCol}">${percent.toFixed(1)}%</span>
        </div>
        <div style="background:var(--surface3);height:9px;border-radius:5px;overflow:hidden;margin-bottom:10px;border:1px solid var(--border)">
          <div style="width:${percent}%;height:100%;background:${themeCol};transition:width 0.15s ease-out"></div>
        </div>
        <div class="row between tiny muted" style="font-size:11px">
          <span>Tiến trình: <b>${processed.toLocaleString()}</b> / <b>${total.toLocaleString()}</b> ảnh</span>
          <span style="color:var(--text)">Sẽ thêm: <b style="color:${themeCol}">${addedBoxes.toLocaleString()}</b> box (<b style="color:${themeCol}">${updatedImages.toLocaleString()}</b> ảnh) · Trùng: <b>${alreadyExisted.toLocaleString()}</b></span>
        </div>
        ${curFile ? `<div class="tiny muted" style="margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--font-mono);font-size:10px;color:var(--dim)">Đang xử lý: ${html(curFile)}</div>` : ''}
      </div>
    `;
  }

  if(btnPreview){
    btnPreview.onclick = async () => {
      btnPreview.disabled = true;
      if(btnConfirm) btnConfirm.disabled = true;
      let stopped = false;
      renderBatchAddProgress({ percent: 0, processed: 0, total: S.total || S.assets.length, added_boxes: 0, updated_images: 0, already_existed: 0, current_file: '' }, 'preview');
      const timer = setInterval(async () => {
        if(stopped || !resBox || !resBox.isConnected) return;
        try {
          const s = await api(`/projects/${S.project.id}/batch-add-boxes/status`);
          if(!stopped && s && s.status === 'running') renderBatchAddProgress(s, 'preview');
        } catch(e) {}
      }, 180);

      try{
        const overrideCls = Number(el('batch-add-override-class')?.value || -1);
        const mode = el('batch-add-mode')?.value || 'skip_if_exists';
        const iouTol = Number(el('batch-add-iou-tol')?.value || 0.35);
        const split = el('batch-add-split')?.value || 'all';
        const matchClass = el('batch-add-match-class')?.checked ?? true;
        const res = await send('POST', `/projects/${S.project.id}/batch-add-boxes`, {
          target_boxes: targets,
          override_class: overrideCls >= 0 ? overrideCls : null,
          match_class: matchClass,
          mode: mode,
          iou_threshold: iouTol,
          center_tol: iouTol === 0.25 ? 0.08 : (iouTol === 0.5 ? 0.04 : 0.06),
          split: split,
          dry_run: true
        });
        stopped = true;
        clearInterval(timer);
        if(resBox){
          resBox.innerHTML = `
            <div style="background:rgba(43,108,176,0.12);border:1px solid #3182ce;padding:12px;border-radius:8px;font-size:12px">
              <div class="row between" style="margin-bottom:6px">
                <b style="color:#63b3ed;font-size:13px">✓ Kết quả quét xem trước hoàn tất (100%):</b>
                <span class="tag" style="background:#2b6cb0;color:#fff">Sẽ thêm ${res.added_boxes.toLocaleString()} box</span>
              </div>
              <div style="line-height:1.7">
                • <b>${res.updated_images.toLocaleString()} ảnh</b> CHƯA CÓ box tại vị trí này → <b>Sẽ được bổ sung ${res.added_boxes.toLocaleString()} box mới</b>.<br>
                • <b>${res.already_existed.toLocaleString()} ảnh</b> ĐÃ CÓ SẴN box tại vị trí này → <b>Được tự động bỏ qua (không thêm trùng)</b>.
              </div>
              ${res.sample_images && res.sample_images.length ? `
                <div class="tiny muted" style="margin-top:8px">
                  <b>Một số ảnh sẽ được bổ sung:</b>
                  <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
                    ${res.sample_images.map(img => `<code style="background:var(--surface3);padding:2px 6px;border-radius:4px;font-size:10px">${html(filename(img))}</code>`).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }
      }catch(err){
        stopped = true;
        clearInterval(timer);
        if(resBox) resBox.innerHTML = `<p class="tiny red" style="margin-top:6px">Lỗi: ${err.message}</p>`;
      }finally{
        btnPreview.disabled = false;
        if(btnConfirm) btnConfirm.disabled = false;
      }
    };
  }

  if(btnConfirm){
    btnConfirm.onclick = async () => {
      const overrideCls = Number(el('batch-add-override-class')?.value || -1);
      const mode = el('batch-add-mode')?.value || 'skip_if_exists';
      const iouTol = Number(el('batch-add-iou-tol')?.value || 0.35);
      const split = el('batch-add-split')?.value || 'all';
      if(!confirm(`Xác nhận bổ sung ${targets.length} box tại vị trí này vào các ảnh trên toàn bộ dataset?`)) return;
      btnConfirm.disabled = true;
      if(btnPreview) btnPreview.disabled = true;
      let stopped = false;
      renderBatchAddProgress({ percent: 0, processed: 0, total: S.total || S.assets.length, added_boxes: 0, updated_images: 0, already_existed: 0, current_file: '' }, 'add');
      const timer = setInterval(async () => {
        if(stopped || !resBox || !resBox.isConnected) return;
        try {
          const s = await api(`/projects/${S.project.id}/batch-add-boxes/status`);
          if(!stopped && s && s.status === 'running') renderBatchAddProgress(s, 'add');
        } catch(e) {}
      }, 180);

      try{
        const matchClass = el('batch-add-match-class')?.checked ?? true;
        const res = await send('POST', `/projects/${S.project.id}/batch-add-boxes`, {
          target_boxes: targets,
          override_class: overrideCls >= 0 ? overrideCls : null,
          match_class: matchClass,
          mode: mode,
          iou_threshold: iouTol,
          center_tol: iouTol === 0.25 ? 0.08 : (iouTol === 0.5 ? 0.04 : 0.06),
          split: split,
          dry_run: false
        });
        stopped = true;
        clearInterval(timer);
        toast(`✓ Đã bổ sung thành công ${res.added_boxes} box vào ${res.updated_images} ảnh!`);
        modal.innerHTML = '';
        await openAsset(S.editor.id);
      }catch(err){
        stopped = true;
        clearInterval(timer);
        if(resBox) resBox.innerHTML = `<p class="tiny red" style="margin-top:6px">Lỗi khi bổ sung: ${err.message}</p>`;
        btnConfirm.disabled = false;
        if(btnPreview) btnPreview.disabled = false;
      }
    };
  }
}

function inspectorHTML(){const a=S.editor,sel=S.selected!=null?a.boxes[S.selected]:null;const W=a.width,H=a.height;
 const coords=sel?(()=>{const c=boxEdges(sel);return [c.x1*W,c.y1*H,c.x2*W,c.y2*H]})():[0,0,0,0];
 return `<div class="inspector-head"><div class="row between"><strong>Annotation panel</strong><span class="tag">${a.boxes.length} boxes</span></div><p class="tiny muted" style="margin-bottom:0">${S.readonly?'Read-only mode':'Click bounding box to inspect & edit'}</p></div><div class="inspector-section"><div class="inspector-title" style="display:flex;justify-content:space-between;align-items:center"><span>Label classes <span class="tag">${S.project.classes.length}</span></span><button class="btn quiet mini" type="button" data-action="editLabels" title="Sửa & sắp xếp thứ tự nhãn" style="padding:2px 8px;font-size:11px">Sắp xếp</button></div>${S.project.classes.map((n,i)=>boxClass(n,i,sel?sel.cls===i:S.drawClass===i)).join('')}</div><div class="inspector-section"><div class="inspector-title" style="display:flex;justify-content:space-between;align-items:center"><span>Objects <span class="tag">${a.boxes.length}</span></span><div class="row" style="gap:5px"><button class="btn quiet mini" type="button" data-action="selectAllBoxes" title="Chọn tất cả box" style="padding:2px 7px;font-size:11px">Tất cả</button><button class="btn quiet mini" type="button" data-action="deselectAllBoxes" title="Bỏ chọn" style="padding:2px 7px;font-size:11px">Bỏ</button></div></div>${getSelectedIndices().length>0?`<div class="selected-boxes-bar row between" style="background:var(--surface3);padding:6px 10px;border-radius:6px;margin-bottom:8px;border:1px solid var(--border2)"><span class="tiny" style="color:var(--accent);font-weight:700">Đã chọn: ${getSelectedIndices().length}</span><div class="row" style="gap:5px"><button class="btn danger mini" type="button" data-action="deleteSelectedBoxes" title="Xóa các box đã chọn trong ảnh này" style="padding:3px 8px;font-size:11px">${ic('trash','sm')} Xóa (${getSelectedIndices().length})</button><button class="btn mini" type="button" data-action="batchAddModal" style="background:#2b6cb0;color:#fff;border:none;font-weight:700;padding:3px 8px;font-size:11px" title="Bổ sung các vị trí này vào mọi ảnh khác trong dataset">➕ Thêm mọi ảnh</button><button class="btn mini" type="button" data-action="batchDeleteModal" style="background:#805ad5;color:#fff;border:none;font-weight:700;padding:3px 8px;font-size:11px" title="Xóa các vị trí này trên toàn bộ dataset">⚡ Xóa mọi ảnh</button></div></div>`:''}<div class="objects-list-wrap" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">${a.boxes.map((b,i)=>{const isSel=isBoxSelected(i),isHov=S.hoveredBox===i,desc=boxZoneDescription(b,W,H),col=boxColor(b,i);return `<div class="box-list-item ${isSel?'selected':''} ${isHov?'hovered':''}" data-box-id="${i}" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:5px;border:1px solid ${isSel?'var(--accent)':(isHov?'#fff':'var(--border)')};background:${isSel?'var(--surface-hover)':'var(--surface2)'};cursor:pointer;font-size:11px"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0" data-action="toggleBoxSelect" data-id="${i}"><input type="checkbox" ${isSel?'checked':''} style="accent-color:var(--accent);cursor:pointer;pointer-events:none"><span style="font-weight:700;font-family:var(--font-mono);color:${col}">${html(`#${i+1}`)}</span><span class="class-dot" style="background:${col};flex-shrink:0"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600" title="${html(S.project.classes[b.cls])}">${html(S.project.classes[b.cls])}</span></label><div class="row" style="gap:6px;flex-shrink:0;align-items:center" data-action="chooseBox" data-id="${i}"><span class="tag outline" style="font-size:10px;padding:1px 5px;background:rgba(255,255,255,0.04)" title="Khu vực: ${desc.zone} ${desc.coords}">${desc.zone}</span><button class="icon-btn-danger" type="button" data-action="deleteSingleBox" data-id="${i}" title="Xóa riêng box này" style="background:transparent;border:none;color:var(--dim);cursor:pointer;padding:2px;display:flex;align-items:center">${ic('trash','sm')}</button></div></div>`}).join('')||'<p class="small-muted">No bounding boxes in this image.</p>'}</div></div><div class="inspector-section"><div class="inspector-title">Coordinates <span class="tag">pixels</span></div>${sel?`<div class="coordinate-grid">${['X min','Y min','X max','Y max'].map((lbl,i)=>`<label>${lbl}<input class="field coord" id="coord${i}" type="number" min="0" step="0.1" value="${coords[i].toFixed(1)}" ${S.readonly?'disabled':''}></label>`).join('')}</div><div class="row" style="margin-top:11px;gap:8px">${btn('Apply coordinates','applyCoords','quiet small',S.readonly?'disabled':'')}${btn(ic('trash')+' Delete ảnh này','deleteBox','danger small',S.readonly?'disabled':'')}</div><div class="row" style="gap:6px;margin-top:9px"><button class="btn" type="button" data-action="batchAddModal" style="flex:1;background:#2b6cb0;color:#fff;border:none;font-weight:700;font-size:11px;padding:7px 8px;display:flex;align-items:center;justify-content:center;gap:4px" title="Bổ sung box ở tọa độ này vào tất cả các ảnh khác trong dataset">➕ Thêm MỌI ẢNH</button><button class="btn" type="button" data-action="batchDeleteModal" style="flex:1;background:#805ad5;color:#fff;border:none;font-weight:700;font-size:11px;padding:7px 8px;display:flex;align-items:center;justify-content:center;gap:4px" title="Xóa box ở tọa độ này trên tất cả các ảnh khác">⚡ Xóa MỌI ẢNH</button></div>`:(getSelectedIndices().length>1?`<div style="background:var(--surface2);padding:10px;border-radius:6px;border:1px solid var(--border)"><p class="tiny" style="color:var(--accent);font-weight:700;margin-bottom:6px">Đang chọn ${getSelectedIndices().length} bounding box ở các vị trí này.</p><div class="row" style="gap:8px;margin-bottom:8px"><button class="btn danger small" type="button" data-action="deleteSelectedBoxes" style="flex:1">🗑️ Xóa ở ảnh này</button></div><div class="row" style="gap:6px"><button class="btn" type="button" data-action="batchAddModal" style="flex:1;background:#2b6cb0;color:#fff;border:none;font-weight:700;font-size:11px;padding:7px 8px">➕ Thêm ${getSelectedIndices().length} vị trí</button><button class="btn" type="button" data-action="batchDeleteModal" style="flex:1;background:#805ad5;color:#fff;border:none;font-weight:700;font-size:11px;padding:7px 8px">⚡ Xóa ${getSelectedIndices().length} vị trí</button></div></div>`:'<p class="small-muted">Select a box to edit its position.</p>')}</div><div class="inspector-section"><div class="inspector-title">Review status</div>${a.state==='reviewed'&&a.reviewed_by?`<p class="tiny" style="color:var(--emerald)">✓ Đã hoàn thành bởi <b>${html(a.reviewed_by)}</b><br>${a.reviewed_at?new Date(a.reviewed_at*1000).toLocaleString('vi-VN'):''}</p>`:''}<select id="review-state" class="field" ${S.readonly?'disabled':''}><option value="todo" ${a.state==='todo'?'selected':''}>○ To do</option><option value="in_progress" ${a.state==='in_progress'?'selected':''}>◐ In progress</option><option value="reviewed" ${a.state==='reviewed'?'selected':''}>✓ Reviewed</option></select><div style="margin-top:13px">${btn(ic('history')+' Version history','history','quiet small')}</div></div><div class="inspector-section"><div class="inspector-title">Keyboard shortcuts</div><div class="help-note"><span class="kbd">1-9</span> Class quick select<br><span class="kbd">V</span> Select / Move &nbsp; <span class="kbd">B</span> Draw<br><span class="kbd">Del</span> Delete &nbsp; <span class="kbd">Ctrl+Z</span> Undo<br><span class="kbd">Ctrl+S</span> Save &nbsp; <span class="kbd">←/→</span> Prev/Next</div></div>`}
function renderEditor(){S.view='editor';const a=S.editor,items=S.assets.map(x=>x.id),i=items.indexOf(a.id);
 shell(`<div class="editor roboflow-layout">
   <div class="editor-top">
     <div class="row" style="gap:12px;min-width:0">
       <button class="btn quiet back-btn" data-action="backProject" title="Quay lại Dataset">${ic('back')} <span>Quay lại</span></button>
       <div class="editor-title-wrap">
         <div class="filename" title="${html(a.image_rel)}">${html(filename(a.image_rel))}</div>
         <div class="editor-subtitle">
           <span class="tag purple">${html(a.split||'inbox')}</span>
           <span class="tag outline">r${a.revision}</span>
           <span class="tag outline">${a.width}×${a.height}</span>
         </div>
       </div>
     </div>
     <div class="editor-center-nav row">
       <button class="btn quiet small editor-nav-btn" data-action="previousAsset" title="Ảnh trước (Phím ←)">${ic('back')}</button>
       <div class="editor-pos-badge"><b>${i>=0?i+1:'—'}</b> <span class="muted">/ ${S.total||S.assets.length}</span></div>
       <button class="btn quiet small editor-nav-btn" data-action="nextAsset" title="Ảnh sau (Phím →)">${ic('arrow')}</button>
     </div>
     <div class="editor-actions row">
       ${a.lock?`<span class="tag ${S.lease?'green':'red'}">${ic('lock','sm')} ${S.lease?'Đang khóa':html(a.lock.name)}</span>`:''}
       <span id="save-status-badge" class="tag ${S.dirty?'orange':'green'}">${S.dirty?'● Chưa lưu':'✓ Đã lưu'}</span>
       <button class="btn quiet" data-action="save" ${S.readonly?'disabled':''}>${ic('save')} <span>Lưu</span></button>
       <button class="btn complete-btn" data-action="completeAsset" ${S.readonly?'disabled':''}>${ic('check')} <span>Xong (Tiếp)</span></button>
     </div>
   </div>

   <div class="editor-body">
     <!-- Left Vertical Toolbar (Roboflow style) -->
     <aside class="editor-vtoolbar">
       <button class="vtool-btn ${S.editMode==='select'?'active':''}" data-action="modeSelect" title="Chọn 1 box / Di chuyển (V)">
         ${ic('cursor')}
         <span>Select</span>
       </button>
       <button class="vtool-btn ${S.editMode==='multi'?'active':''}" data-action="modeMulti" title="Chế độ chọn nhiều box để xóa 1 thể (M)">
         ${ic('multi')}
         <span>Multi</span>
       </button>
       <button class="vtool-btn ${S.editMode==='draw'?'active':''}" data-action="modeDraw" title="Vẽ Bounding Box (B)">
         ${ic('target')}
         <span>Draw</span>
       </button>
       <div class="vtool-divider"></div>
       <button class="vtool-btn" data-action="undo" title="Hoàn tác (Ctrl+Z)" ${!S.undo.length||S.readonly?'disabled':''}>
         ${ic('undo')}
         <span>Undo</span>
       </button>
       <button class="vtool-btn" data-action="redo" title="Làm lại (Ctrl+Y)" ${!S.redo.length||S.readonly?'disabled':''}>
         ${ic('redo')}
         <span>Redo</span>
       </button>
       <div class="vtool-divider"></div>
       <button class="vtool-btn" data-action="zoomIn" title="Phóng to (+)">
         ${ic('zoom')}
         <span>+</span>
       </button>
       <button class="vtool-btn" data-action="resetZoom" title="Đặt lại 100%">
         <span style="font-size:10px;font-weight:700">${Math.round(S.zoom*100)}%</span>
         <span>Reset</span>
       </button>
       <button class="vtool-btn" data-action="zoomOut" title="Thu nhỏ (-)">
         <span style="font-size:16px;font-weight:700">−</span>
         <span>Minus</span>
       </button>
       <div class="vtool-divider"></div>
       <button class="vtool-btn" data-action="setProjectCover" title="Đặt làm ảnh bìa">
         ${ic('image')}
         <span>Cover</span>
       </button>
     </aside>

     <!-- Center Workspace (Canvas + Bottom Filmstrip) -->
     <main class="editor-center-stage">
       <div id="canvas-area" class="canvas-container">
         <canvas id="edit-canvas"></canvas>
         <div id="canvas-floating-bar" class="canvas-floating-bar" style="display:none"></div>
         <div class="canvas-help">${S.readonly?'CHẾ ĐỘ CHỈ XEM — Ảnh đang bị khóa':'V: Chọn · M: Chọn nhiều box · B: Vẽ Box · Del: Xóa đã chọn · Giữ Shift để cuộn'}</div>
       </div>

       <!-- Bottom Subbar -->
       <div class="canvas-info-bar">
         <div id="canvas-meta" class="row" style="gap:10px">
           <span>${a.width} × ${a.height} px</span>
           <span>·</span>
           <span>${a.boxes.length} nhãn bboxes</span>
           <span>·</span>
           <code>${html(a.label_rel)}</code>
         </div>
         <div class="row" style="gap:12px">
           <label class="row tiny muted" style="gap:5px;cursor:pointer">
             <span>Màu:</span>
             <select id="color-mode" class="field mini">
               <option value="class" ${S.colorMode==='class'?'selected':''}>Theo lớp</option>
               <option value="box" ${S.colorMode==='box'?'selected':''}>Mỗi khung</option>
               <option value="single" ${S.colorMode==='single'?'selected':''}>Một màu</option>
             </select>
           </label>
           <label class="row tiny muted" style="gap:5px;cursor:pointer">
             <input id="autosave-mode" type="checkbox" ${S.autosave?'checked':''} style="accent-color:var(--accent);cursor:pointer">
             <span>Autosave</span>
           </label>
         </div>
       </div>

       <!-- Bottom Horizontal Filmstrip Carousel -->
       ${editorFilmstrip()}
     </main>

     <!-- Right Properties Inspector -->
     <aside class="inspector" id="inspector">
       ${inspectorHTML()}
     </aside>
   </div>
 </div>`, S.project.name);

 requestAnimationFrame(()=>{
   bindCanvas();
   updateFloatingBar();
   const colorSelect=el('color-mode');
   if(colorSelect)colorSelect.onchange=e=>{S.colorMode=e.target.value;drawCanvas();refreshInspector();};
   const autoCheck=el('autosave-mode');
   if(autoCheck)autoCheck.onchange=e=>{S.autosave=e.target.checked;};
   const curThumb = document.querySelector('.filmstrip-thumb.active');
   if(curThumb) curThumb.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
 });
}
function refreshInspector(){
  if(S.view!=='editor'||!S.editor)return;
  const pane=el('inspector');
  if(pane)pane.innerHTML=inspectorHTML();
  const badge=el('save-status-badge');
  if(badge){
    badge.className=`tag ${S.dirty?'orange':'green'}`;
    badge.textContent=S.dirty?'● Chưa lưu':'✓ Đã lưu';
  }
  installBoxHoverListeners();
  updateFloatingBar();
  const meta=el('canvas-meta');
  if(meta){
    meta.innerHTML=`<span>${S.editor.width} × ${S.editor.height} px</span><span>·</span><span>${S.editor.boxes.length} nhãn bboxes</span><span>·</span><code>${html(S.editor.label_rel)}</code>`;
  }
}
function boxEdges(b){return {x1:b.x-b.w/2,y1:b.y-b.h/2,x2:b.x+b.w/2,y2:b.y+b.h/2}}
function fromEdges(c,cls){return {cls,x:(c.x1+c.x2)/2,y:(c.y1+c.y2)/2,w:c.x2-c.x1,h:c.y2-c.y1}}
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function canvasGeometry(){const canvas=el('edit-canvas'),r=canvas?.getBoundingClientRect();if(!r||!S.img)return null;const sc=Math.min((r.width-44)/S.img.width,(r.height-44)/S.img.height)*S.zoom;return {canvas,r,sc,px:(r.width-S.img.width*sc)/2+S.pan.x,py:(r.height-S.img.height*sc)/2+S.pan.y}}
function toCanvas(g,x,y){return {x:g.px+x*S.img.width*g.sc,y:g.py+y*S.img.height*g.sc}}
function fromCanvas(g,x,y){return {x:clamp((x-g.px)/(S.img.width*g.sc)),y:clamp((y-g.py)/(S.img.height*g.sc))}}
function drawCanvas(){if(S.view!=='editor'||!S.img)return;const g=canvasGeometry();if(!g)return;const {canvas,r,sc,px,py}=g,dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.drawImage(S.img,px,py,S.img.width*sc,S.img.height*sc);
  S.editor.boxes.forEach((b,i)=>{
    const c=boxEdges(b),p1=toCanvas(g,c.x1,c.y1),p2=toCanvas(g,c.x2,c.y2),x=p1.x,y=p1.y,w=p2.x-p1.x,h=p2.y-p1.y;
    const selected=isBoxSelected(i), hovered=S.hoveredBox===i, col=boxColor(b,i);
    ctx.strokeStyle=hovered?'#ffffff':col;
    ctx.lineWidth=hovered?4:(selected?3:2);
    ctx.strokeRect(x,y,w,h);
    if(hovered){
      ctx.fillStyle=col+'4d';
      ctx.fillRect(x,y,w,h);
      ctx.strokeStyle='#ffffff';
      ctx.lineWidth=1.5;
      const cx=x+w/2,cy=y+h/2;
      ctx.beginPath();
      ctx.moveTo(cx-10,cy);ctx.lineTo(cx+10,cy);
      ctx.moveTo(cx,cy-10);ctx.lineTo(cx,cy+10);
      ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy,5,0,Math.PI*2);ctx.stroke();
    }else if(selected){
      ctx.fillStyle=col+'26';
      ctx.fillRect(x,y,w,h);
      [p1,{x:p2.x,y:p1.y},{x:p1.x,y:p2.y},p2].forEach(p=>{
        ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);
        ctx.fillStyle='#ffffff';ctx.fill();
        ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
      });
    }
    if(S.colorMode!=='box' || hovered || selected){
      const label=(selected?"✓ ":"")+`#${i+1} `+(S.project.classes[b.cls]||'Class '+b.cls);
      ctx.font='600 11px JetBrains Mono, Inter, ui-monospace, sans-serif';
      const tw=ctx.measureText(label).width+14;
      const above=y>=24?y-22:y;
      ctx.fillStyle=hovered?'#ffffff':(selected?'#2dd4a8':col);
      if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,above,tw,20,4);ctx.fill();}
      else{ctx.fillRect(x,above,tw,20);}
      ctx.fillStyle='#0c0c10';
      ctx.fillText(label,x+7,above+14);
    }
  });
  if(S.drag?.kind==='marquee'){
    const m1=toCanvas(g,Math.min(S.drag.origin.x,S.drag.current.x),Math.min(S.drag.origin.y,S.drag.current.y));
    const m2=toCanvas(g,Math.max(S.drag.origin.x,S.drag.current.x),Math.max(S.drag.origin.y,S.drag.current.y));
    ctx.save();
    ctx.strokeStyle='#2dd4a8';
    ctx.lineWidth=1.5;
    ctx.setLineDash([5,3]);
    ctx.strokeRect(m1.x,m1.y,m2.x-m1.x,m2.y-m1.y);
    ctx.fillStyle='rgba(45, 212, 168, 0.15)';
    ctx.fillRect(m1.x,m1.y,m2.x-m1.x,m2.y-m1.y);
    ctx.restore();
  }
}
function hitBox(g,x,y){for(let i=S.editor.boxes.length-1;i>=0;i--){const b=S.editor.boxes[i],c=boxEdges(b),p1=toCanvas(g,c.x1,c.y1),p2=toCanvas(g,c.x2,c.y2);for(const [key,p] of Object.entries({tl:p1,tr:{x:p2.x,y:p1.y},bl:{x:p1.x,y:p2.y},br:p2})){if(Math.abs(x-p.x)<11&&Math.abs(y-p.y)<11)return {i,kind:key}}
 if(x>=p1.x&&x<=p2.x&&y>=p1.y&&y<=p2.y)return {i,kind:'move'}}return null}
let spaceHeld=false;
let multiClickTimer=null;
let clickStreak=0;
function setEditMode(mode){
  if(S.editMode===mode)return;
  S.editMode=mode;
  const btnSelect=document.querySelector('[data-action=modeSelect]');
  const btnMulti=document.querySelector('[data-action=modeMulti]');
  const btnDraw=document.querySelector('[data-action=modeDraw]');
  if(btnSelect)btnSelect.classList.toggle('active',mode==='select');
  if(btnMulti)btnMulti.classList.toggle('active',mode==='multi');
  if(btnDraw)btnDraw.classList.toggle('active',mode==='draw');
  updateCanvasCursor();
  const helpText = mode==='select'
    ? 'Chế độ: Chọn & Di chuyển (V)'
    : (mode==='multi'
        ? 'Chế độ: Chọn nhiều box để xóa 1 thể (M) — Click từng box để gom chọn, phím Del để xóa'
        : 'Chế độ: Vẽ Box (B)');
  toast(helpText);
  updateFloatingBar();
  drawCanvas();
}
function zoomAtPoint(targetZoom,clientX,clientY){
  const g=canvasGeometry();if(!g)return;
  const {r,sc}=g;
  const newZoom=clamp(targetZoom,0.25,15);
  if(Math.abs(newZoom-S.zoom)<1e-4)return;
  let x,y;
  if(clientX!=null&&clientY!=null){
    x=clientX-r.left;
    y=clientY-r.top;
  }else if(S.selected!=null&&S.editor?.boxes?.[S.selected]){
    const b=S.editor.boxes[S.selected];
    const pt=toCanvas(g,b.x,b.y);
    x=pt.x;
    y=pt.y;
  }else{
    x=r.width/2;
    y=r.height/2;
  }
  const baseSc=sc/S.zoom;
  const scNew=baseSc*newZoom;
  const k=newZoom/S.zoom;
  const pxNew=x-(x-g.px)*k;
  const pyNew=y-(y-g.py)*k;
  S.pan={
    x:pxNew-(r.width-S.img.width*scNew)/2,
    y:pyNew-(r.height-S.img.height*scNew)/2
  };
  S.zoom=newZoom;
  drawCanvas();
  renderZoom();
}
function updateCanvasCursor(e){
  const c=el('edit-canvas');if(!c)return;
  if(S.drag?.kind==='pan'||(spaceHeld&&S.drag)){c.style.cursor='grabbing';return}
  if(spaceHeld){c.style.cursor='grab';return}
  if(S.editMode==='draw'){c.style.cursor='crosshair';return}
  if(S.editMode==='multi'){
    if(e&&!S.readonly){
      const g=canvasGeometry();
      if(g){
        const r=c.getBoundingClientRect();
        const hit=hitBox(g,e.clientX-r.left,e.clientY-r.top);
        if(hit){c.style.cursor='pointer';return}
      }
    }
    c.style.cursor='cell';
    return;
  }
  if(e&&!S.readonly){
    const g=canvasGeometry();
    if(g){
      const r=c.getBoundingClientRect();
      const hit=hitBox(g,e.clientX-r.left,e.clientY-r.top);
      if(hit){
        if(hit.kind==='move'){c.style.cursor='move';return}
        if(hit.kind==='tl'||hit.kind==='br'){c.style.cursor='nwse-resize';return}
        if(hit.kind==='tr'||hit.kind==='bl'){c.style.cursor='nesw-resize';return}
      }
    }
  }
  c.style.cursor='default';
}
function bindCanvas(){
  const c=el('edit-canvas');if(!c||!S.img)return;drawCanvas();
  c.oncontextmenu=e=>{if(spaceHeld||e.shiftKey)e.preventDefault()};
  c.onauxclick=e=>{if(e.button===1)e.preventDefault()};
  c.onpointerdown=e=>{
    const isPan=e.button===1||e.shiftKey||spaceHeld;
    if(isPan){
      e.preventDefault();
      const r=c.getBoundingClientRect();
      S.drag={kind:'pan',x:e.clientX-r.left,y:e.clientY-r.top,pan:{...S.pan}};
      c.setPointerCapture(e.pointerId);
      updateCanvasCursor();
      return;
    }
    if(e.button!==0)return;
    if(e.altKey){
      e.preventDefault();
      const factor=e.shiftKey?(1/1.4):1.4;
      zoomAtPoint(S.zoom*factor,e.clientX,e.clientY);
      return;
    }
    clickStreak++;
    clearTimeout(multiClickTimer);
    multiClickTimer=setTimeout(()=>{clickStreak=0;},380);
    const clickCount=Math.max(e.detail||0,clickStreak);
    if(clickCount===2){
      setEditMode('select');
    }else if(clickCount>=3){
      setEditMode('draw');
      clickStreak=0;
    }
    const g=canvasGeometry();if(!g)return;
    const r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,pt=fromCanvas(g,x,y);
    if(S.readonly)return;
    if(S.editMode==='draw'){
      snapshot();const b={cls:S.drawClass,x:pt.x,y:pt.y,w:0,h:0};
      S.editor.boxes.push(b);S.selected=S.editor.boxes.length-1;
      if(S.selectedSet){S.selectedSet.clear();S.selectedSet.add(S.selected);}
      S.drag={kind:'draw',origin:pt};
    }else if(S.editMode==='multi'){
      const hit=hitBox(g,x,y);
      if(hit){
        toggleSelectBox(hit.i, true);
        S.drag=null;
      }else{
        S.drag={kind:'marquee',origin:pt,current:pt,multi:true};
      }
    }else{
      const hit=hitBox(g,x,y);
      if(hit){
        if(e.ctrlKey||e.metaKey||e.shiftKey){
          toggleSelectBox(hit.i,true);
        }else{
          if(!isBoxSelected(hit.i)) toggleSelectBox(hit.i,false);
        }
        snapshot();S.drag={kind:hit.kind,origin:pt,old:{...S.editor.boxes[hit.i]}};
      }else{
        if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
          S.selected=null;if(S.selectedSet)S.selectedSet.clear();
        }
        S.drag={kind:'marquee',origin:pt,current:pt};
      }
    }
    if(S.drag)c.setPointerCapture(e.pointerId);
    refreshInspector();drawCanvas();
  };
  c.onpointermove=e=>{
    if(!S.drag){updateCanvasCursor(e);return}
    const g=canvasGeometry(),r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    if(S.drag.kind==='pan'){
      S.pan={x:S.drag.pan.x+x-S.drag.x,y:S.drag.pan.y+y-S.drag.y};
      drawCanvas();return;
    }
    const pt=fromCanvas(g,x,y);
    if(S.drag.kind==='marquee'){
      S.drag.current=pt;drawCanvas();return;
    }
    const d=S.drag,b=S.editor.boxes[S.selected];if(!b)return;
    const minX=1/S.editor.width,minY=1/S.editor.height;
    if(d.kind==='draw'){
      const x1=Math.min(pt.x,d.origin.x),x2=Math.max(pt.x,d.origin.x),y1=Math.min(pt.y,d.origin.y),y2=Math.max(pt.y,d.origin.y);
      Object.assign(b,fromEdges({x1,y1,x2,y2},b.cls));
    }else if(d.kind==='move'){
      const old=boxEdges(d.old);let dx=pt.x-d.origin.x,dy=pt.y-d.origin.y;
      dx=clamp(dx,-old.x1,1-old.x2);dy=clamp(dy,-old.y1,1-old.y2);
      Object.assign(b,fromEdges({x1:old.x1+dx,x2:old.x2+dx,y1:old.y1+dy,y2:old.y2+dy},b.cls));
    }else{
      const z=boxEdges(d.old);
      if(d.kind.includes('l'))z.x1=clamp(pt.x,0,z.x2-minX);
      if(d.kind.includes('r'))z.x2=clamp(pt.x,z.x1+minX,1);
      if(d.kind.includes('t'))z.y1=clamp(pt.y,0,z.y2-minY);
      if(d.kind.includes('b'))z.y2=clamp(pt.y,z.y1+minY,1);
      Object.assign(b,fromEdges(z,b.cls));
    }
    S.dirty=true;drawCanvas();
  };
  c.onpointerup=e=>{
    if(!S.drag)return;
    const d=S.drag;S.drag=null;
    if(d.kind==='marquee'){
      const x1=Math.min(d.origin.x,d.current.x),x2=Math.max(d.origin.x,d.current.x);
      const y1=Math.min(d.origin.y,d.current.y),y2=Math.max(d.origin.y,d.current.y);
      if(x2-x1>0.005||y2-y1>0.005){
        if(!d.multi&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&S.editMode!=='multi'){
          if(!S.selectedSet)S.selectedSet=new Set();
          S.selectedSet.clear();
        }
        let added=0;
        S.editor.boxes.forEach((b,i)=>{
          const c=boxEdges(b);
          if(c.x1<x2&&c.x2>x1&&c.y1<y2&&c.y2>y1){
            S.selectedSet.add(i);S.selected=i;added++;
          }
        });
        if(added>0){toast(`Đã chọn ${S.selectedSet.size} box trong vùng quét`);}
      }
      refreshInspector();drawCanvas();return;
    }
    if(d.kind==='draw'&&S.selected!=null){
      const b=S.editor.boxes[S.selected];
      if(b.w<3/S.editor.width||b.h<3/S.editor.height){
        S.editor.boxes.splice(S.selected,1);S.selected=null;
        if(S.selectedSet)S.selectedSet.clear();
      }
    }
    updateCanvasCursor(e);refreshInspector();drawCanvas();
  };
  c.onpointercancel=c.onpointerup;
  c.ondblclick=e=>{
    e.preventDefault();
    setEditMode('select');
  };
  c.onclick=e=>{
    if(e.button!==0||spaceHeld||e.shiftKey||e.altKey)return;
    if(e.detail===2){
      setEditMode('select');
    }else if(e.detail>=3){
      setEditMode('draw');
      clickStreak=0;
    }
  };
  c.onwheel=e=>{
    e.preventDefault();
    let factor;
    if(Math.abs(e.deltaY)<40){
      factor=Math.exp(-e.deltaY*0.006);
    }else{
      factor=e.deltaY<0?1.18:(1/1.18);
    }
    zoomAtPoint(S.zoom*factor,e.clientX,e.clientY);
  };
  new ResizeObserver(()=>{if(c.isConnected)drawCanvas()}).observe(c);
}
async function saveImage(next=false){if(S.readonly){toast('Không có quyền sửa ảnh hoặc khóa đã hết hạn',true);return}if(!S.editor)return;const id=S.editor.id,pid=S.project.id;
 const d=await send('PATCH',`/projects/${pid}/assets/${id}/annotations`,{revision:S.editor.revision,boxes:S.editor.boxes,state:S.editor.state});S.editor.revision=d.revision;S.editor.state=d.state;S.dirty=false;
 const a=S.assets.find(a=>a.id===id);if(a){a.revision=d.revision;a.state=d.state;a.updated_by=S.user.display_name;a.reviewed_by=d.state==='reviewed'?S.user.display_name:null;a.reviewed_at=d.state==='reviewed'?Math.floor(Date.now()/1000):null;}S.editor.updated_by=S.user.display_name;S.editor.reviewed_by=d.state==='reviewed'?S.user.display_name:null;S.editor.reviewed_at=d.state==='reviewed'?Math.floor(Date.now()/1000):null;S.projects=await api(`/workspaces/${S.wid}/projects`);toast('✓ Saved YOLO annotations');if(next){await navigateAsset(1)}else renderEditor()}
async function completeAsset(){if(!S.editor||S.readonly)return;S.editor.state='reviewed';S.dirty=true;await saveImage(true);toast('✓ Đã đánh dấu hoàn thành và lưu người review')}
async function setProjectCover(){if(!S.editor||!S.project)return;await send('PUT',`/projects/${S.project.id}/cover/${S.editor.id}`);S.project.cover_asset_id=S.editor.id;const project=S.projects.find(p=>p.id===S.project.id);if(project)project.cover_asset_id=S.editor.id;toast('Đã đặt ảnh này làm ảnh đại diện dataset')}
async function navigateAsset(delta){
 if(S.dirty && S.autosave){await saveImage(false)}else if(!promptDirty())return;
 if(!S.editor)return;
 if(!S.assets||!S.assets.length){if(S.project)await listAssets()}
 let ids=S.assets.map(a=>a.id),i=ids.indexOf(S.editor.id);
 if(i<0&&S.assets.length){await openAsset(delta>0?S.assets[0].id:S.assets[S.assets.length-1].id);return}
 const idx=i+delta;
 if(idx>=0&&idx<ids.length){await openAsset(ids[idx]);return}
 const maxPage=Math.max(1,Math.ceil(S.total/48));
 if(delta>0&&S.page<maxPage){
   S.page+=1;toast(`Đang sang trang ${S.page} / ${maxPage}…`);await listAssets();
   if(S.assets.length){await openAsset(S.assets[0].id);return}
 }else if(delta<0&&S.page>1){
   S.page-=1;toast(`Đang về trang ${S.page} / ${maxPage}…`);await listAssets();
   if(S.assets.length){await openAsset(S.assets[S.assets.length-1].id);return}
 }
 toast(delta>0?'Đã tới ảnh cuối cùng của danh sách':'Đã tới ảnh đầu tiên của danh sách');
}
function deleteBox(){if(S.readonly||S.selected==null)return;snapshot();S.editor.boxes.splice(S.selected,1);S.selected=null;commitChange()}
function applyCoords(){if(S.readonly||S.selected==null)return;let nums=[0,1,2,3].map(i=>Number(el('coord'+i)?.value));const [x1,y1,x2,y2]=nums,W=S.editor.width,H=S.editor.height;
 if(nums.some(n=>!Number.isFinite(n))||x1<0||y1<0||x2>W||y2>H||x2<=x1||y2<=y1){toast('Tọa độ pixel không hợp lệ',true);return}snapshot();S.editor.boxes[S.selected]=fromEdges({x1:x1/W,y1:y1/H,x2:x2/W,y2:y2/H},S.editor.boxes[S.selected].cls);commitChange()}
async function showHistory(){const h=await api(`/projects/${S.project.id}/assets/${S.editor.id}/history`);modalOpen('Annotation history',`Recent saved versions for ${html(filename(S.editor.image_rel))}`,h.length?`<div style="max-height:350px;overflow:auto">${h.map(x=>`<div class="row between" style="border-bottom:1px solid var(--border);padding:12px 0"><div>Revision ${x.revision} <span class="tag">${html(x.author)}</span></div><span class="tiny muted">${new Date(x.changed_at*1000).toLocaleString('vi-VN')}</span></div>`).join('')}</div>`:'<p>Chưa có phiên bản lưu.</p>','Close',async()=>{})}
const handlers={
 home:async()=>{if(S.view==='editor'&& !promptDirty())return;if(S.view==='editor')await releaseEditor();dashboard();history.pushState({view:'home',wid:S.wid},'','#overview')},
 datasets:async()=>{if(S.view==='editor'&&!promptDirty())return;if(S.view==='editor')await releaseEditor();if(S.project)await reloadProject();else dashboard()},
 project:async e=>{if(S.view==='editor'&&!promptDirty())return;if(S.view==='editor')await releaseEditor();await openProject(Number(e.dataset.id))},
 newWorkspace, newProject,team:openTeam,newUser,newMember,
 closeModal:async()=>{modal.innerHTML=''},
 logout:async()=>{if(S.view==='editor'&&!promptDirty())return;if(S.editor)await releaseEditor();await send('POST','/auth/logout');S.user=null;S.csrf=null;renderLogin()},
 refreshProject:reloadProject,quality:checkQuality,exportProject,inferProject,pipeline:openPipeline,editLabels,distributeAssets,
 filterClass:async e=>{const id=Number(e.dataset.id);S.classFilter=(S.classFilter===id)?-1:id;S.page=1;await listAssets();projectPage();installDatasetTools()},
 filterSplit:async e=>{S.split=e.dataset.value;S.page=1;await listAssets();projectPage()},
 prevPage:async()=>{if(S.page>1)await goToProjectPage(S.page-1);else toast('Bạn đang ở trang đầu tiên')},
 nextPage:async()=>{const maxPage=Math.max(1,Math.ceil(S.total/48));if(S.page<maxPage)await goToProjectPage(S.page+1);else toast('Bạn đang ở trang cuối cùng')},
 jumpPage:async e=>{const p=Number(e.dataset.page);if(p&&p!==S.page)await goToProjectPage(p)},
 openAsset:async e=>openAsset(Number(e.dataset.id)),deleteProject,deleteWorkspace,removeMember,
 backProject:async()=>{
   if(S.view==='editor'&&!promptDirty())return;
   if(S.editor)await releaseEditor();
   if(S.project){
     await reloadProject();
     history.pushState({view:'project',wid:S.wid,pid:S.project.id,page:S.page},'',`#project-${S.project.id}`);
   }else{
     dashboard();
     history.pushState({view:'home',wid:S.wid},'','#overview');
   }
 },
 previousAsset:()=>navigateAsset(-1),nextAsset:()=>navigateAsset(1),
 modeSelect:()=>setEditMode('select'),modeMulti:()=>setEditMode('multi'),modeDraw:()=>setEditMode('draw'),
 chooseBox:e=>toggleSelectBox(Number(e.dataset.id),S.editMode==='multi'),
  toggleBoxSelect:e=>toggleSelectBox(Number(e.dataset.id),true),
  selectAllBoxes:()=>selectAllBoxes(true),
  deselectAllBoxes:()=>selectAllBoxes(false),
  deleteSelectedBoxes,
  deleteSingleBox:e=>{const id=Number(e.dataset.id);if(S.readonly)return;snapshot();S.editor.boxes.splice(id,1);S.selected=null;if(S.selectedSet)S.selectedSet.delete(id);commitChange();toast('✓ Đã xóa box #'+(id+1));},
  batchDeleteModal:openBatchDeleteModal,batchAddModal:openBatchAddModal,
 chooseClass:e=>{const i=Number(e.dataset.id);S.drawClass=i;if(S.selected!=null&&!S.readonly){snapshot();S.editor.boxes[S.selected].cls=i;commitChange()}else refreshInspector()},
 deleteBox,applyCoords,undo:()=>undoRedo('undo'),redo:()=>undoRedo('redo'),
 zoomIn:()=>zoomAtPoint(S.zoom*1.25),
 zoomOut:()=>zoomAtPoint(S.zoom/1.25),
 resetZoom:()=>{S.zoom=1;S.pan={x:0,y:0};drawCanvas();renderZoom();},
 save:()=>saveImage(false),saveNext:()=>saveImage(true),completeAsset,setProjectCover,history:showHistory,
};
function renderZoom(){
  const b=document.querySelector('[data-action=resetZoom] span');
  if(b)b.textContent=Math.round(S.zoom*100)+'%';
}
document.addEventListener('click',e=>{if(e.target.matches('.overlay')){modal.innerHTML='';return}const target=e.target.closest('[data-action]');if(!target||target.disabled)return;const h=handlers[target.dataset.action];if(h)secureAction(h)(target)});
document.addEventListener('change',e=>{if(e.target.id==='workspace-picker')secureAction(async()=>{if(S.view==='editor'&&!promptDirty())return;if(S.editor)await releaseEditor();S.wid=Number(e.target.value);S.project=null;await loadWorkspace()})();if(e.target.id==='class-filter')secureAction(async()=>{S.classFilter=Number(e.target.value);S.page=1;await listAssets();projectPage();installDatasetTools()})();if(e.target.id==='review-filter')secureAction(async()=>{S.state=e.target.value;S.page=1;await listAssets();projectPage();installDatasetTools()})();if(e.target.id==='annotator-filter')secureAction(async()=>{S.annotatedBy=Number(e.target.value);S.page=1;await listAssets();projectPage();installDatasetTools()})();if(e.target.id==='assignee-filter')secureAction(async()=>{S.assignedTo=Number(e.target.value);S.page=1;await listAssets();projectPage();installDatasetTools()})();if(e.target.id==='review-state'&&S.editor){S.editor.state=e.target.value;S.dirty=true;refreshInspector()}});
let timer;
document.addEventListener('input',e=>{if(e.target.id==='project-search'){clearTimeout(timer);const value=e.target.value;timer=setTimeout(()=>secureAction(async()=>{S.query=value;S.page=1;await listAssets();projectPage();el('project-search')?.focus();el('project-search')?.setSelectionRange(value.length,value.length)})(),320)}
 if(e.target.id==='rail-search'){S.railQuery=e.target.value;const rail=el('rail-content');if(rail)rail.innerHTML=filmstripItems(S.assets.filter(a=>a.image_rel.toLowerCase().includes(S.railQuery.toLowerCase())))}});
document.addEventListener('submit',e=>{if(e.target.id!=='login-form')return;e.preventDefault();secureAction(async()=>{const f=new FormData(e.target);const d=await send('POST','/auth/login',{username:f.get('username'),password:f.get('password')});S.user=d.user;S.csrf=d.csrf;await fetchWorkspaces();await loadWorkspace()})()});
document.addEventListener('keydown',e=>{if(S.view!=='editor')return;const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')||document.activeElement?.isContentEditable;if(typing)return;
 const cmd=e.ctrlKey||e.metaKey;
 if(e.code==='Space'&&!spaceHeld){e.preventDefault();spaceHeld=true;updateCanvasCursor();return}
 if(!cmd&&(e.key==='+'||e.key==='=')){e.preventDefault();handlers.zoomIn();return}
 if(!cmd&&(e.key==='-'||e.key==='_')){e.preventDefault();handlers.zoomOut();return}
 if(!cmd&&e.key==='0'){e.preventDefault();handlers.resetZoom();return}if(cmd&&e.key.toLowerCase()==='a'&&!typing){e.preventDefault();selectAllBoxes(true);return}
 if(cmd&&e.key.toLowerCase()==='s'){e.preventDefault();secureAction(()=>saveImage(false))();return}if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();undoRedo('undo');return}if(cmd&&e.key.toLowerCase()==='y'){e.preventDefault();undoRedo('redo');return}if(e.key==='ArrowLeft'){e.preventDefault();secureAction(()=>navigateAsset(-1))();return}if(e.key==='ArrowRight'){e.preventDefault();secureAction(()=>navigateAsset(1))();return}if(e.key==='Escape'){e.preventDefault();if(getSelectedIndices().length>0){selectAllBoxes(false);return}secureAction(()=>handlers.backProject())();return}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteBox()}if(e.key.toLowerCase()==='v'&&!cmd){setEditMode('select')}if(e.key.toLowerCase()==='m'&&!cmd){setEditMode(S.editMode==='multi'?'select':'multi')}if(e.key.toLowerCase()==='b'&&!cmd){setEditMode('draw')}if(!cmd&&/^[1-9]$/.test(e.key)){const num=Number(e.key)-1;if(num<S.project.classes.length){S.drawClass=num;if(S.selected!=null&&!S.readonly){snapshot();S.editor.boxes[S.selected].cls=num;commitChange()}else refreshInspector()}}});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;updateCanvasCursor()}});
window.addEventListener('blur',()=>{spaceHeld=false;updateCanvasCursor()});
let revertingPopstate=false;
window.addEventListener('popstate',e=>secureAction(async()=>{
 const state=e.state||{view:'home',wid:S.wid};
 if(revertingPopstate){revertingPopstate=false;return}
 if(S.view==='editor'&&!promptDirty()){
   // The browser already moved back. Restore the editor entry without
   // running the guard a second time.
   revertingPopstate=true;
   history.forward();
   return;
 }
 if(S.editor)await releaseEditor();
 if(state.wid&&state.wid!==S.wid){S.wid=state.wid;S.projects=await api(`/workspaces/${S.wid}/projects`)}
 if(state.view==='editor'&&state.pid&&state.aid){await openProject(state.pid,false);S.page=state.page||1;await listAssets();await openAsset(state.aid,false)}
 else if(state.view==='project'&&state.pid){
   if(!S.project||S.project.id!==state.pid)await openProject(state.pid,false);
   await goToProjectPage(state.page||1,false);
 }
 else{S.project=null;dashboard()}
})());
window.addEventListener('beforeunload',e=>{if(S.dirty){e.preventDefault();e.returnValue=''}});
async function boot(){try{const d=await api('/auth/me');S.user=d.user;S.csrf=d.csrf;await fetchWorkspaces();await loadWorkspace();history.replaceState({view:'home',wid:S.wid},'','#overview')}catch{renderLogin()}}
boot();
