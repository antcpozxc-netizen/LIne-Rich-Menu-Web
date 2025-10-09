/** ===== Config ===== */
const CFG = {
  SPREADSHEET_ID: '',        // bound script ไม่ต้องใส่
  SHEET_USERS: 'users',
  SHEET_TASKS: 'tasks',
  APP_SHARED_KEY: '',        // แนะนำเก็บใน Script Properties (APP_SHARED_KEY)
};

// ✅ กำหนด "สคีมา" กลาง (หัวคอลัมน์) ใช้ทุกที่ให้ตรงกัน
const USERS_HEADERS = ['user_id','username','real_name','role','status','created_at','updated_at'];
const TASKS_HEADERS = ['task_id','assigner_name','assignee_name','assignee_id','task_detail','status','created_date','updated_date','deadline','note','assigner_id'];

/** ===== Context for current request ===== */
var __CTX_BODY = null;

/** ===== Utils ===== */
function getSS() {
  var sid = (__CTX_BODY && __CTX_BODY.sheet_id) || CFG.SPREADSHEET_ID;
  return sid ? SpreadsheetApp.openById(sid) : SpreadsheetApp.getActiveSpreadsheet();
}
function ensureSchema_(ss) {
  const sheets = ss.getSheets().map(s => s.getName());
  if (!sheets.includes(CFG.SHEET_USERS)) {
    const sh = ss.insertSheet(CFG.SHEET_USERS);
    sh.getRange(1,1,1,USERS_HEADERS.length).setValues([USERS_HEADERS]);
  }
  if (!sheets.includes(CFG.SHEET_TASKS)) {
    const sh = ss.insertSheet(CFG.SHEET_TASKS);
    sh.getRange(1,1,1,TASKS_HEADERS.length).setValues([TASKS_HEADERS]);
  }
}
function getSheet(name, headers) {
  const ss = getSS();

  // 1) ถ้ามีอยู่แล้วก็ใช้เลย
  let sh = ss.getSheetByName(name);
  if (sh) return sh;

  // 2) พยายาม ensure schema (สร้าง users/tasks ถ้ายังไม่มี)
  ensureSchema_(ss);
  sh = ss.getSheetByName(name);
  if (sh) return sh;

  // 3) ยังไม่มีจริง ๆ → พยายามรีเนมชีตว่างชื่อเริ่มต้น (เช่น "Sheet1") มาเป็นชื่อที่ต้องการ
  const all = ss.getSheets();
  if (all.length === 1) {
    const only = all[0];
    const looksDefault = /^Sheet\d*$/i.test(only.getName()) || /^ชีต\d*$/i.test(only.getName());
    const isEmpty = only.getLastRow() === 0 && only.getLastColumn() === 0;
    if (looksDefault) {
      only.setName(name);
      sh = only;
    }
  }

  // 4) ถ้ายังไม่มี → แทรกแท็บใหม่
  if (!sh) sh = ss.insertSheet(name);

  // ใส่ header ถ้าระบุมา
  if (headers && headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function ensureHeaders(sh, headers) {
  const first = sh.getRange(1,1,1,headers.length).getValues()[0];
  const has = first.some(v => String(v||'').trim() !== '');
  if (!has) sh.getRange(1,1,1,headers.length).setValues([headers]);
}
function findRowByValue(sh, colIndex1based, value) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const vals = sh.getRange(2, colIndex1based, last-1, 1).getValues();
  for (let i=0;i<vals.length;i++) if (String(vals[i][0]) === String(value)) return i+2;
  return -1;
}
function nowISO() { return new Date().toISOString(); }
function getProp(key) { return PropertiesService.getScriptProperties().getProperty(key) || ''; }
function checkSharedKey(body) {
  const want = getProp('APP_SHARED_KEY') || (CFG.APP_SHARED_KEY || '');
  if (!want) return;
  const got = String(body.app_key || body.key || '');
  if (got !== want) throw new Error('unauthorized');
}
function normalizeRole(r){
  const x = String(r||'').trim().toLowerCase();
  if (x === 'dev') return 'developer';
  const allowed = ['admin','supervisor','user','developer'];
  return allowed.includes(x) ? x : (x ? 'user' : '');
}

/** ===== Upserts ===== */
function upsertUser(d) {
  const sh = getSheet(CFG.SHEET_USERS, USERS_HEADERS);
  ensureHeaders(sh, USERS_HEADERS);

  const id = d.user_id; if (!id) throw new Error('user_id required');
  const row = findRowByValue(sh, 1, id);

  // ฐานข้อมูลเดิม (ถ้ามี)
  let cur = {
    user_id: id, username:'', real_name:'', role:'user', status:'Active',
    created_at: nowISO(), updated_at: nowISO(),
  };
  if (row !== -1) {
    const old = sh.getRange(row, 1, 1, USERS_HEADERS.length).getValues()[0];
    USERS_HEADERS.forEach((h,i)=> cur[h] = (old[i] !== '' && old[i] != null) ? old[i] : cur[h]);
    // preserve created_at เดิม
    if (old[USERS_HEADERS.indexOf('created_at')]) {
      cur.created_at = old[USERS_HEADERS.indexOf('created_at')];
    }
    cur.updated_at = nowISO();
  }

  // patch เฉพาะที่ส่งมา
  if (d.username !== undefined)   cur.username   = String(d.username || '');
  if (d.real_name !== undefined)  cur.real_name  = String(d.real_name || '');
  if (d.role !== undefined) {
    const nr = normalizeRole(d.role);
    if (nr) cur.role = nr;
  }
  if (d.status !== undefined) {
    const st = String(d.status || '').toLowerCase();
    if (st === 'active' || st === 'inactive') cur.status = (st === 'active' ? 'Active' : 'Inactive');
  }
  cur.updated_at = nowISO();

  const rowVals = USERS_HEADERS.map(h => cur[h] || '');
  if (row === -1) sh.appendRow(rowVals);
  else sh.getRange(row, 1, 1, USERS_HEADERS.length).setValues([rowVals]);

  return { ok:true, user_id:id };
}

function upsertTask(d) {
  const sh = getSheet(CFG.SHEET_TASKS, TASKS_HEADERS);
  ensureHeaders(sh, TASKS_HEADERS);

  const id  = d.task_id || ('TASK_' + Date.now());
  const row = findRowByValue(sh, 1, id);

  const cur = {
    task_id: id,
    assigner_name: d.assigner_name || '',
    assigner_id:   d.assigner_id   || '',
    assignee_name: d.assignee_name || '',
    assignee_id:   d.assignee_id   || '',
    task_detail:   d.task_detail   || '',
    status:        (d.status||'pending').toLowerCase(),
    created_date:  d.created_date || nowISO(),
    updated_date:  nowISO(),
    deadline:      d.deadline || '',
    note:          d.note || ''
  };

  const rowVals = TASKS_HEADERS.map(h => cur[h] || '');
  if (row === -1) sh.appendRow(rowVals);
  else sh.getRange(row, 1, 1, TASKS_HEADERS.length).setValues([rowVals]);

  return { ok:true, task_id:id };
}

function updateTaskStatus(d) {
  const sh = getSheet(CFG.SHEET_TASKS, TASKS_HEADERS);
  ensureHeaders(sh, TASKS_HEADERS);

  const id = d.task_id; if (!id) throw new Error('task_id required');
  const row = findRowByValue(sh, 1, id); if (row === -1) throw new Error('task not found: ' + id);

  const colStatus  = TASKS_HEADERS.indexOf('status') + 1;
  const colUpdated = TASKS_HEADERS.indexOf('updated_date') + 1;
  sh.getRange(row, colStatus).setValue((d.status || 'doing').toLowerCase());
  sh.getRange(row, colUpdated).setValue(nowISO());

  return { ok:true, task_id:id, status: (d.status || 'doing').toLowerCase() };
}

function updateTask(d) {
  const sh = getSheet(CFG.SHEET_TASKS, TASKS_HEADERS);
  ensureHeaders(sh, TASKS_HEADERS);

  const id = d.task_id; if (!id) throw new Error('task_id required');
  const row = findRowByValue(sh, 1, id); if (row === -1) throw new Error('task not found: ' + id);

  const old = sh.getRange(row, 1, 1, TASKS_HEADERS.length).getValues()[0];
  const cur = {}; TASKS_HEADERS.forEach((h,i)=> cur[h] = old[i]);

  // patch
  if (d.task_detail   !== undefined) cur.task_detail   = String(d.task_detail   || '');
  if (d.deadline      !== undefined) cur.deadline      = String(d.deadline      || '');
  if (d.note          !== undefined) cur.note          = String(d.note          || '');
  if (d.status        !== undefined) cur.status        = String(d.status        || '').toLowerCase();
  if (d.assigner_name !== undefined) cur.assigner_name = String(d.assigner_name || '');
  if (d.assignee_name !== undefined) cur.assignee_name = String(d.assignee_name || '');
  if (d.assignee_id   !== undefined) cur.assignee_id   = String(d.assignee_id   || '');
  if (d.assigner_id   !== undefined) cur.assigner_id   = String(d.assigner_id   || '');
  cur.updated_date = nowISO();

  const rowVals = TASKS_HEADERS.map(h => cur[h] || '');
  sh.getRange(row, 1, 1, TASKS_HEADERS.length).setValues([rowVals]);

  return { ok:true, task_id:id };
}

/** ===== Users Read/Manage ===== */
function getUser(d) {
  const sh = getSheet(CFG.SHEET_USERS, USERS_HEADERS);
  ensureHeaders(sh, USERS_HEADERS);

  const uid = d.user_id; if (!uid) throw new Error('user_id required');
  const row = findRowByValue(sh, 1, uid);
  if (row === -1) return { ok:true, found:false };
  const vals = sh.getRange(row, 1, 1, USERS_HEADERS.length).getValues()[0];
  const user = {}; USERS_HEADERS.forEach((h,i)=>user[h]=vals[i]);
  return { ok:true, found:true, user };
}

function listUsers() {
  const sh = getSheet(CFG.SHEET_USERS, USERS_HEADERS);
  ensureHeaders(sh, USERS_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return { ok:true, users: [] };

  const values = sh.getRange(2,1,last-1,USERS_HEADERS.length).getValues();
  const users = values.map(r => {
    const o = {}; USERS_HEADERS.forEach((h,i)=>o[h]=r[i]); return o;
  });
  return { ok:true, users };
}

function setUserRole(d) {
  const sh = getSheet(CFG.SHEET_USERS, USERS_HEADERS);
  ensureHeaders(sh, USERS_HEADERS);

  const uid = d.user_id; if (!uid) throw new Error('user_id required');
  const role = normalizeRole(d.role);
  if (!['admin','supervisor','user','developer'].includes(role)) throw new Error('invalid role');

  const row = findRowByValue(sh, 1, uid); if (row === -1) throw new Error('user not found');

  const colRole = USERS_HEADERS.indexOf('role') + 1;
  const colUpd  = USERS_HEADERS.indexOf('updated_at') + 1;
  sh.getRange(row, colRole).setValue(role);
  sh.getRange(row, colUpd).setValue(nowISO());
  return { ok:true };
}

function setUserStatus(d) {
  const sh = getSheet(CFG.SHEET_USERS, USERS_HEADERS);
  ensureHeaders(sh, USERS_HEADERS);

  const uid = d.user_id; if (!uid) throw new Error('user_id required');
  const status = String(d.status || '').toLowerCase(); // 'active' | 'inactive'
  if (['active','inactive'].indexOf(status) === -1) throw new Error('invalid status');

  const row = findRowByValue(sh, 1, uid); if (row === -1) throw new Error('user not found');

  const colStatus = USERS_HEADERS.indexOf('status') + 1;
  const colUpd    = USERS_HEADERS.indexOf('updated_at') + 1;
  sh.getRange(row, colStatus).setValue(status === 'active' ? 'Active' : 'Inactive');
  sh.getRange(row, colUpd).setValue(nowISO());
  return { ok:true };
}

/** ===== Reads ===== */
function getTask(d) {
  const sh = getSheet(CFG.SHEET_TASKS, TASKS_HEADERS);
  ensureHeaders(sh, TASKS_HEADERS);

  const id = d.task_id; if (!id) throw new Error('task_id required');
  const row = findRowByValue(sh, 1, id);
  if (row === -1) return { ok:true, found:false };

  const vals = sh.getRange(row, 1, 1, TASKS_HEADERS.length).getValues()[0];
  const o = {}; TASKS_HEADERS.forEach((h,i)=> o[h]=vals[i]);

  o.created_date = o.created_date ? new Date(o.created_date).toISOString() : '';
  o.updated_date = o.updated_date ? new Date(o.updated_date).toISOString() : '';
  o.status = String(o.status || '').toLowerCase();

  return { ok:true, found:true, task:o };
}

function listTasks(d) {
  const sh = getSheet(CFG.SHEET_TASKS, TASKS_HEADERS);
  ensureHeaders(sh, TASKS_HEADERS);

  const last = sh.getLastRow();
  if (last < 2) return { ok: true, tasks: [] };

  const values = sh.getRange(2, 1, last - 1, TASKS_HEADERS.length).getValues();
  const rows = values.map(r => {
    const o = {}; TASKS_HEADERS.forEach((h, i) => o[h] = r[i]);
    o.created_date = o.created_date ? new Date(o.created_date).toISOString() : '';
    o.updated_date = o.updated_date ? new Date(o.updated_date).toISOString() : '';
    o.deadline     = o.deadline ? String(o.deadline) : '';
    o.status       = String(o.status || '').toLowerCase();
    return o;
  });

  const wantAssignee = String(d.assignee_id || '').trim();
  const wantStatus   = String(d.status || '').trim().toLowerCase();
  const fromISO      = String(d.from_date || '').trim();
  const toISO        = String(d.to_date || '').trim();

  const filtered = rows.filter(o => {
    if (wantAssignee && String(o.assignee_id) !== wantAssignee) return false;
    if (wantStatus && o.status !== wantStatus) return false;
    const t = o.updated_date ? Date.parse(o.updated_date) : NaN;
    if (fromISO && !isNaN(t) && t < Date.parse(fromISO)) return false;
    if (toISO   && !isNaN(t) && t > Date.parse(toISO))   return false;
    return true;
  });

  filtered.sort((a,b)=>{
    const ta = Date.parse(a.updated_date || '') || 0;
    const tb = Date.parse(b.updated_date || '') || 0;
    return tb - ta;
  });

  const tasks = filtered.map(o => ({
    task_id:o.task_id, assigner_name:o.assigner_name, assigner_id:o.assigner_id,
    assignee_name:o.assignee_name, assignee_id:o.assignee_id,
    task_detail:o.task_detail, status:o.status,
    created_date:o.created_date, updated_date:o.updated_date,
    deadline:o.deadline, note:o.note
  }));

  const limit  = Math.max(0, Number(d.limit || 0) | 0);
  const offset = Math.max(0, Number(d.offset || 0) | 0);
  const paged  = limit ? tasks.slice(offset, offset + limit) : tasks;

  return { ok: true, tasks: paged, total: tasks.length, offset, limit };
}

/** ===== Health / Entry ===== */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok:true, service:'Task Bot API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    __CTX_BODY = body;
    checkSharedKey(body);

    // ✅ สร้างแท็บ/สคีมาอัตโนมัติถ้ายังไม่มี
    ensureSchema_(getSS());

    const action = String(body.action || '').toLowerCase();
    let result;
    if (action === 'upsert_user')              result = upsertUser(body);
    else if (action === 'upsert_task')         result = upsertTask(body);
    else if (action === 'update_task_status')  result = updateTaskStatus(body);
    else if (action === 'update_task')         result = updateTask(body);
    else if (action === 'get_user')            result = getUser(body);
    else if (action === 'list_users')          result = listUsers();
    else if (action === 'set_user_role')       result = setUserRole(body);
    else if (action === 'set_user_status')     result = setUserStatus(body);
    else if (action === 'list_tasks')          result = listTasks(body);
    else if (action === 'get_task')            result = getTask(body);
    else if (action === 'propagate_user_name') result = propagateUserName(body);
    else if (action === 'verify' || action === 'ping') result = { ok: true, time: nowISO() };
    else result = { ok:false, error:'unknown_action' };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    __CTX_BODY = null;
  }
}
