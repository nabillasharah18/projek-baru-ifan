const API = "/api/data";
const POLL_INTERVAL = 30000;

const els = {
  app: document.getElementById("app"),
  setup: document.getElementById("setup"),
  banner: document.getElementById("status-banner"),
  bannerText: document.getElementById("status-banner-text"),
  grid: document.getElementById("grid"),
  chips: document.getElementById("chips"),
  search: document.getElementById("search"),
  empty: document.getElementById("empty"),
  statMembers: document.getElementById("stat-members"),
  statTotal: document.getElementById("stat-total"),
  statDone: document.getElementById("stat-done"),
  statProgress: document.getElementById("stat-progress"),
};

const EXTRA_COMMENTERS = [];

let members = [];
let allTasks = [];
let tasksByMember = new Map();
let commentsByTask = new Map();
let activeMember = "all";
let searchTerm = "";
const openPanels = new Set();
let pollTimer = null;

checkAuth();

async function checkAuth() {
  try {
    const res = await fetch("/api/auth");
    const data = await res.json();
    if (data.authenticated) {
      setBanner("loading", "Menghubungkan ke GitHub…");
      loadData();
      addLogoutBtn();
    } else {
      showLogin();
    }
  } catch (_) {
    setBanner("loading", "Menghubungkan ke GitHub…");
    loadData();
  }
}

function showLogin() {
  els.banner.style.display = "none";
  els.app.style.display = "none";
  const overlay = document.createElement("div");
  overlay.className = "login-overlay";
  overlay.innerHTML = `
    <div class="login-card">
      <svg class="login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <h2 class="heading-font">Dashboard Terkunci</h2>
      <p>Masukkan password untuk mengakses dashboard.</p>
      <form class="login-form">
        <input type="password" class="login-input" placeholder="Password" autocomplete="current-password" />
        <button type="submit" class="login-btn heading-font">Masuk</button>
      </form>
      <div class="login-error" style="display:none"></div>
    </div>
  `;
  document.querySelector(".wrap").prepend(overlay);
  const form = overlay.querySelector(".login-form");
  const input = overlay.querySelector(".login-input");
  const btn = overlay.querySelector(".login-btn");
  const errorEl = overlay.querySelector(".login-error");
  input.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = input.value.trim();
    if (!password) return;
    btn.disabled = true;
    btn.textContent = "Memverifikasi…";
    errorEl.style.display = "none";
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        window.location.reload();
      } else {
        errorEl.textContent = data.error || "Password salah";
        errorEl.style.display = "block";
        input.value = "";
        input.focus();
      }
    } catch (_) {
      errorEl.textContent = "Gagal terhubung ke server";
      errorEl.style.display = "block";
    }
    btn.disabled = false;
    btn.textContent = "Masuk";
  });
}

function addLogoutBtn() {
  const btn = document.createElement("button");
  btn.className = "logout-btn";
  btn.textContent = "Logout";
  btn.addEventListener("click", async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.reload();
  });
  document.querySelector(".page-header").appendChild(btn);
}

async function loadData() {
  try {
    const res = await fetch(API);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      if ((err.error && err.error.includes("GITHUB_TOKEN")) || res.status === 404) {
        els.setup.style.display = "block";
        els.app.style.display = "none";
        els.banner.style.display = "none";
        return;
      }
      throw new Error(err.error || res.statusText);
    }
    const data = await res.json();
    applyData(data);
    setBanner("live", "Tersambung ke Google Sheets + GitHub — data di-refresh otomatis tiap 30 detik");
    startPolling();
  } catch (err) {
    console.error(err);
    setBanner("error", "Gagal memuat data: " + err.message);
  }
}

function applyData(data) {
  members = data.members || [];
  allTasks = data.tasks || [];
  tasksByMember = new Map(members.map((m) => [m.name, []]));
  allTasks.forEach((t) => {
    if (!tasksByMember.has(t.member_name)) tasksByMember.set(t.member_name, []);
    tasksByMember.get(t.member_name).push(t);
  });
  commentsByTask = new Map();
  (data.comments || []).forEach((c) => {
    if (!commentsByTask.has(c.task_id)) commentsByTask.set(c.task_id, []);
    commentsByTask.get(c.task_id).push(c);
  });

  buildChips();
  buildGrid();
  updateStats();
  render();
}

function isUserTyping() {
  const inputs = els.grid.querySelectorAll("input[type='text'], input[type='password'], input[type='url'], textarea");
  for (const inp of inputs) {
    if (inp.value.trim()) return true;
  }
  const active = document.activeElement;
  if (active && active.closest && (active.closest(".comment-form") || active.closest(".task-edit-area") || active.closest(".task-link-area") || active.closest(".add-task-form"))) {
    return true;
  }
  return false;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      if (isUserTyping()) return;
      const res = await fetch(API);
      if (!res.ok) return;
      const data = await res.json();
      if (isUserTyping()) return;
      applyData(data);
    } catch (_) {}
  }, POLL_INTERVAL);
}

async function apiAction(body) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Request failed");
  return result;
}

function setBanner(state, text) {
  els.banner.className = "status-banner " + (state === "live" ? "live" : state === "error" ? "error" : "");
  els.bannerText.textContent = text;
}

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

function buildChips() {
  els.chips.innerHTML = "";
  const allChip = document.createElement("button");
  allChip.className = "chip all active";
  allChip.textContent = "Semua anggota";
  allChip.addEventListener("click", () => setActiveMember("all"));
  els.chips.appendChild(allChip);

  members.forEach((m) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.style.setProperty("--dot", `var(--${m.accent}-bg)`);
    chip.innerHTML = `<span class="dot"></span>${m.name}`;
    chip.addEventListener("click", () => setActiveMember(m.name));
    els.chips.appendChild(chip);
  });
}

function setActiveMember(name) {
  activeMember = name;
  [...els.chips.children].forEach((chip, idx) => {
    chip.classList.toggle("active", (idx === 0 && name === "all") || (idx > 0 && members[idx - 1].name === name));
  });
  render();
}

function buildGrid() {
  els.grid.innerHTML = "";

  const columns = [
    { key: "pending", label: "Belum Mulai" },
    { key: "ongoing", label: "On Going" },
    { key: "done", label: "Selesai" },
  ];

  const grouped = { pending: [], ongoing: [], done: [] };
  allTasks.forEach((t) => {
    grouped[statusColumn(t)].push(t);
  });

  columns.forEach(({ key, label }) => {
    const col = document.createElement("div");
    col.className = "kanban-col";
    col.dataset.status = key;

    const header = document.createElement("div");
    header.className = "kanban-header";
    header.innerHTML = `${label} <span class="kanban-count">${grouped[key].length}</span>`;
    col.appendChild(header);

    const list = document.createElement("div");
    list.className = "kanban-list";

    grouped[key].forEach((task) => {
      const member = members.find((m) => m.name === task.member_name) || { name: task.member_name, accent: "primary" };
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.member = task.member_name;
      card.dataset.text = task.body.toLowerCase();

      const badge = document.createElement("div");
      badge.className = "task-member-badge";
      badge.innerHTML = `<span class="member-dot" style="background:var(--${member.accent}-fg)"></span>${escapeHtml(member.name)}`;
      card.appendChild(badge);

      const taskList = document.createElement("ul");
      taskList.className = "task-list";
      taskList.appendChild(buildTaskItem(member, task));
      card.appendChild(taskList);

      list.appendChild(card);
    });

    if (key === "pending") {
      const addRow = document.createElement("div");
      addRow.className = "add-task-row";
      addRow.innerHTML = `
        <form class="add-task-form">
          <select class="add-task-member"></select>
          <input type="text" placeholder="Tambah tugas baru…" maxlength="300" />
          <button type="submit">+ Tambah</button>
        </form>
      `;
      const memberSelect = addRow.querySelector(".add-task-member");
      members.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = m.name;
        memberSelect.appendChild(opt);
      });
      const form = addRow.querySelector("form");
      const input = addRow.querySelector("input");
      const btn = addRow.querySelector("button");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = input.value.trim();
        if (!body) return;
        btn.disabled = true;
        btn.textContent = "Menyimpan…";
        try {
          await apiAction({ action: "add_task", member_name: memberSelect.value, body });
          input.value = "";
          const res = await fetch(API);
          if (res.ok) applyData(await res.json());
        } catch (err) {
          alert("Gagal menambah tugas: " + err.message);
        }
        btn.disabled = false;
        btn.textContent = "+ Tambah";
      });
      col.appendChild(addRow);
    }

    col.appendChild(list);
    els.grid.appendChild(col);
  });
}

function buildTaskItem(member, task) {
  const comments = commentsByTask.get(task.id) || [];
  const li = document.createElement("li");
  li.className = "task-item" + (task.done ? " done" : "");
  li.dataset.text = task.body.toLowerCase();

  const row = document.createElement("div");
  row.className = "task-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = !!task.done;
  checkbox.id = "chk-" + task.id;
  checkbox.addEventListener("change", async () => {
    li.classList.toggle("done", checkbox.checked);
    try {
      await apiAction({ action: "toggle_task", id: task.id, done: checkbox.checked });
      const res = await fetch(API);
      if (res.ok) applyData(await res.json());
    } catch (err) {
      checkbox.checked = !checkbox.checked;
      li.classList.toggle("done", checkbox.checked);
      alert("Gagal menyimpan: " + err.message);
    }
  });

  const label = document.createElement("label");
  label.className = "task-text";
  label.setAttribute("for", checkbox.id);
  label.textContent = task.body;

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const commentBtn = document.createElement("button");
  commentBtn.type = "button";
  commentBtn.className = "comment-toggle";
  commentBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span>${comments.length}</span>`;
  commentBtn.addEventListener("click", () => {
    if (openPanels.has(task.id)) openPanels.delete(task.id);
    else openPanels.add(task.id);
    panel.classList.toggle("open", openPanels.has(task.id));
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "task-delete";
  deleteBtn.title = "Hapus tugas";
  deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"></path></svg>`;
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Hapus tugas "${task.body}"?`)) return;
    try {
      await apiAction({ action: "delete_task", id: task.id });
      const res = await fetch(API);
      if (res.ok) applyData(await res.json());
    } catch (err) {
      alert("Gagal menghapus: " + err.message);
    }
  });

  const progressSelect = document.createElement("select");
  progressSelect.className = "progress-select " + progressClass(task.progress || "");
  ["", "Belum mulai", "On going", "Selesai"].forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt || "— Pilih —";
    if ((task.progress || "") === opt) o.selected = true;
    progressSelect.appendChild(o);
  });
  progressSelect.addEventListener("change", async () => {
    const prev = progressSelect.className;
    progressSelect.className = "progress-select " + progressClass(progressSelect.value);
    progressSelect.disabled = true;
    try {
      await apiAction({ action: "update_progress", id: task.id, progress: progressSelect.value });
      const res = await fetch(API);
      if (res.ok) applyData(await res.json());
    } catch (err) {
      progressSelect.className = prev;
      alert("Gagal update progress: " + err.message);
    }
    progressSelect.disabled = false;
  });
  meta.appendChild(progressSelect);

  const linkBtn = document.createElement("button");
  linkBtn.type = "button";
  linkBtn.className = "task-link-btn";
  linkBtn.title = task.link ? "Edit link" : "Tambah link";
  linkBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  if (task.link) linkBtn.classList.add("has-link");
  meta.appendChild(linkBtn);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "task-edit-btn";
  editBtn.title = "Edit tugas";
  editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
  meta.appendChild(editBtn);
  meta.appendChild(commentBtn);
  meta.appendChild(deleteBtn);

  row.appendChild(checkbox);
  row.appendChild(label);
  row.appendChild(meta);
  li.appendChild(row);

  if (task.original_body) {
    const origRow = document.createElement("div");
    origRow.className = "task-original";
    origRow.textContent = task.original_body;
    li.appendChild(origRow);
  }

  const editArea = document.createElement("div");
  editArea.className = "task-edit-area";
  editArea.style.display = "none";
  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.className = "task-edit-input";
  editInput.value = task.body;
  editInput.maxLength = 300;
  const saveEditBtn = document.createElement("button");
  saveEditBtn.type = "button";
  saveEditBtn.className = "task-edit-save";
  saveEditBtn.textContent = "Simpan";
  const cancelEditBtn = document.createElement("button");
  cancelEditBtn.type = "button";
  cancelEditBtn.className = "task-edit-cancel";
  cancelEditBtn.textContent = "Batal";

  editBtn.addEventListener("click", () => {
    const show = editArea.style.display === "none";
    editArea.style.display = show ? "flex" : "none";
    if (show) { editInput.value = task.body; editInput.focus(); }
  });
  cancelEditBtn.addEventListener("click", () => { editArea.style.display = "none"; });
  saveEditBtn.addEventListener("click", async () => {
    const newBody = editInput.value.trim();
    if (!newBody || newBody === task.body) { editArea.style.display = "none"; return; }
    saveEditBtn.disabled = true;
    saveEditBtn.textContent = "Menyimpan…";
    try {
      await apiAction({ action: "edit_task", id: task.id, body: newBody, original_body: task.original_body || task.body });
      editArea.style.display = "none";
      const res = await fetch(API);
      if (res.ok) applyData(await res.json());
    } catch (err) {
      alert("Gagal mengedit: " + err.message);
    }
    saveEditBtn.disabled = false;
    saveEditBtn.textContent = "Simpan";
  });

  editArea.appendChild(editInput);
  editArea.appendChild(saveEditBtn);
  editArea.appendChild(cancelEditBtn);
  li.appendChild(editArea);

  if (task.link) {
    const linkRow = document.createElement("a");
    linkRow.className = "task-link-display";
    linkRow.href = task.link;
    linkRow.target = "_blank";
    linkRow.rel = "noopener";
    linkRow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> ${escapeHtml(task.link)}`;
    li.appendChild(linkRow);
  }

  const linkArea = document.createElement("div");
  linkArea.className = "task-link-area";
  linkArea.style.display = "none";
  const linkInput = document.createElement("input");
  linkInput.type = "url";
  linkInput.className = "task-link-input";
  linkInput.value = task.link || "";
  linkInput.placeholder = "Paste URL dokumen…";
  const saveLinkBtn = document.createElement("button");
  saveLinkBtn.type = "button";
  saveLinkBtn.className = "task-edit-save";
  saveLinkBtn.textContent = "Simpan";
  const cancelLinkBtn = document.createElement("button");
  cancelLinkBtn.type = "button";
  cancelLinkBtn.className = "task-edit-cancel";
  cancelLinkBtn.textContent = "Batal";
  const removeLinkBtn = document.createElement("button");
  removeLinkBtn.type = "button";
  removeLinkBtn.className = "task-link-remove";
  removeLinkBtn.textContent = "Hapus";
  removeLinkBtn.style.display = task.link ? "" : "none";

  linkBtn.addEventListener("click", () => {
    const show = linkArea.style.display === "none";
    linkArea.style.display = show ? "flex" : "none";
    if (show) { linkInput.value = task.link || ""; linkInput.focus(); }
  });
  cancelLinkBtn.addEventListener("click", () => { linkArea.style.display = "none"; });
  saveLinkBtn.addEventListener("click", async () => {
    const url = linkInput.value.trim();
    if (!url) { linkArea.style.display = "none"; return; }
    saveLinkBtn.disabled = true;
    saveLinkBtn.textContent = "Menyimpan…";
    try {
      await apiAction({ action: "set_link", id: task.id, link: url });
      linkArea.style.display = "none";
      const res = await fetch(API);
      if (res.ok) applyData(await res.json());
    } catch (err) {
      alert("Gagal menyimpan link: " + err.message);
    }
    saveLinkBtn.disabled = false;
    saveLinkBtn.textContent = "Simpan";
  });
  removeLinkBtn.addEventListener("click", async () => {
    removeLinkBtn.disabled = true;
    try {
      await apiAction({ action: "set_link", id: task.id, link: "" });
      linkArea.style.display = "none";
      const res = await fetch(API);
      if (res.ok) applyData(await res.json());
    } catch (err) {
      alert("Gagal menghapus link: " + err.message);
    }
    removeLinkBtn.disabled = false;
  });

  linkArea.appendChild(linkInput);
  linkArea.appendChild(saveLinkBtn);
  linkArea.appendChild(removeLinkBtn);
  linkArea.appendChild(cancelLinkBtn);
  li.appendChild(linkArea);

  const panel = document.createElement("div");
  panel.className = "comment-panel" + (openPanels.has(task.id) ? " open" : "");

  const commentList = document.createElement("div");
  commentList.className = "comment-list";
  if (comments.length === 0) {
    commentList.innerHTML = `<div class="comment-empty">Belum ada komentar.</div>`;
  } else {
    comments.forEach((c) => {
      const item = document.createElement("div");
      item.className = "comment-item";

      const headerRow = document.createElement("div");
      headerRow.className = "comment-header-row";
      const headerLeft = document.createElement("span");
      headerLeft.innerHTML = `<span class="comment-author">${escapeHtml(c.author_name)}</span><span class="comment-time">${formatTime(c.created_at)}${c.edited_at ? " (diedit)" : ""}</span>`;
      headerRow.appendChild(headerLeft);

      const actions = document.createElement("span");
      actions.className = "comment-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "comment-action-btn";
      editBtn.title = "Edit komentar";
      editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
      editBtn.addEventListener("click", () => {
        if (editArea.style.display === "flex") {
          editArea.style.display = "none";
          return;
        }
        editInput.value = c.body;
        editArea.style.display = "flex";
        editInput.focus();
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "comment-action-btn comment-action-delete";
      delBtn.title = "Hapus komentar";
      delBtn.innerHTML = "&times;";
      delBtn.addEventListener("click", async () => {
        if (!confirm("Hapus komentar ini?")) return;
        try {
          await apiAction({ action: "delete_comment", id: c.id });
          const res = await fetch(API);
          if (res.ok) applyData(await res.json());
        } catch (err) {
          alert("Gagal menghapus komentar: " + err.message);
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      headerRow.appendChild(actions);
      item.appendChild(headerRow);

      if (c.original_body) {
        const originalDiv = document.createElement("div");
        originalDiv.className = "comment-original";
        originalDiv.textContent = c.original_body;
        item.appendChild(originalDiv);
      }

      const bodyDiv = document.createElement("div");
      bodyDiv.className = "comment-body";
      bodyDiv.textContent = c.body;
      item.appendChild(bodyDiv);

      const editArea = document.createElement("div");
      editArea.className = "comment-edit-area";
      editArea.style.display = "none";
      const editInput = document.createElement("input");
      editInput.type = "text";
      editInput.className = "comment-edit-input";
      editInput.maxLength = 500;
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "comment-edit-save";
      saveBtn.textContent = "Simpan";
      saveBtn.addEventListener("click", async () => {
        const newBody = editInput.value.trim();
        if (!newBody || newBody === c.body) { editArea.style.display = "none"; return; }
        saveBtn.disabled = true;
        saveBtn.textContent = "Menyimpan…";
        try {
          await apiAction({ action: "edit_comment", id: c.id, body: newBody });
          openPanels.add(task.id);
          const res = await fetch(API);
          if (res.ok) applyData(await res.json());
        } catch (err) {
          alert("Gagal mengedit: " + err.message);
        }
        saveBtn.disabled = false;
        saveBtn.textContent = "Simpan";
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "comment-edit-cancel";
      cancelBtn.textContent = "Batal";
      cancelBtn.addEventListener("click", () => { editArea.style.display = "none"; });
      editArea.appendChild(editInput);
      editArea.appendChild(saveBtn);
      editArea.appendChild(cancelBtn);
      item.appendChild(editArea);

      commentList.appendChild(item);
    });
  }
  panel.appendChild(commentList);

  const form = document.createElement("form");
  form.className = "comment-form";
  const select = document.createElement("select");
  const allNames = members.map((m) => m.name).concat(EXTRA_COMMENTERS);
  allNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  const row2 = document.createElement("div");
  row2.className = "comment-form-row";
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = "Tulis komentar…";
  textInput.maxLength = 500;
  const sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.textContent = "Kirim";

  row2.appendChild(select);
  row2.appendChild(textInput);
  row2.appendChild(sendBtn);
  form.appendChild(row2);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = textInput.value.trim();
    if (!body) return;
    sendBtn.disabled = true;
    sendBtn.textContent = "Mengirim…";
    try {
      await apiAction({
        action: "add_comment",
        task_id: task.id,
        author_name: select.value,
        body,
      });
      textInput.value = "";
      openPanels.add(task.id);
      const res = await fetch(API);
      if (res.ok) applyData(await res.json());
    } catch (err) {
      alert("Gagal mengirim komentar: " + err.message);
    }
    sendBtn.disabled = false;
    sendBtn.textContent = "Kirim";
  });

  panel.appendChild(form);
  li.appendChild(panel);

  return li;
}

function updateStats() {
  let total = 0, done = 0;
  members.forEach((m) => {
    const tasks = tasksByMember.get(m.name) || [];
    total += tasks.length;
    done += tasks.filter((t) => t.done).length;
  });
  els.statMembers.textContent = members.length;
  els.statTotal.textContent = total;
  els.statDone.textContent = done;
  els.statProgress.textContent = total ? Math.round((done / total) * 100) + "%" : "0%";
}

function render() {
  let anyVisible = false;
  els.grid.querySelectorAll(".kanban-col").forEach((col) => {
    let colVisible = false;
    col.querySelectorAll(".card").forEach((card) => {
      const memberMatches = activeMember === "all" || activeMember === card.dataset.member;
      const textMatches = !searchTerm || (card.dataset.text && card.dataset.text.includes(searchTerm));
      const show = memberMatches && textMatches;
      card.style.display = show ? "" : "none";
      if (show) { colVisible = true; anyVisible = true; }
    });
    const count = col.querySelectorAll('.card:not([style*="display: none"])').length;
    const countEl = col.querySelector(".kanban-count");
    if (countEl) countEl.textContent = count;
  });
  els.empty.style.display = anyVisible ? "none" : "block";
  els.grid.style.display = anyVisible ? "grid" : "none";
}

els.search.addEventListener("input", (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  render();
});

function statusColumn(task) {
  if (task.done) return "done";
  const t = (task.progress || "").toLowerCase();
  if (t.includes("selesai") || t.includes("done") || t.includes("complete")) return "done";
  if (t.includes("proses") || t.includes("progress") || t.includes("on going") || t.includes("ongoing") || t.includes("berjalan")) return "ongoing";
  return "pending";
}

function memberAccent(name) {
  const m = members.find((x) => x.name === name);
  return m ? m.accent : "primary";
}

function progressClass(text) {
  const t = text.toLowerCase();
  if (t.includes("selesai") || t.includes("done") || t.includes("complete")) return "progress-done";
  if (t.includes("proses") || t.includes("progress") || t.includes("on going") || t.includes("ongoing") || t.includes("berjalan")) return "progress-ongoing";
  if (t.includes("belum") || t.includes("not") || t.includes("pending") || t.includes("tunggu")) return "progress-pending";
  return "progress-default";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
