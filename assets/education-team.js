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

const EXTRA_COMMENTERS = ["Dewi"];

let members = [];
let tasksByMember = new Map();
let commentsByTask = new Map();
let activeMember = "all";
let searchTerm = "";
const openPanels = new Set();
let pollTimer = null;

setBanner("loading", "Menghubungkan ke GitHub…");
loadData();

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
    setBanner("live", "Tersambung ke GitHub — data di-refresh otomatis tiap 30 detik");
    startPolling();
  } catch (err) {
    console.error(err);
    setBanner("error", "Gagal memuat data: " + err.message);
  }
}

function applyData(data) {
  members = data.members || [];
  tasksByMember = new Map(members.map((m) => [m.name, []]));
  (data.tasks || []).forEach((t) => {
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

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(API);
      if (!res.ok) return;
      const data = await res.json();
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
  members.forEach((member) => {
    const tasks = tasksByMember.get(member.name) || [];
    const doneCount = tasks.filter((t) => t.done).length;

    const card = document.createElement("article");
    card.className = "card";
    card.dataset.member = member.name;
    card.style.setProperty("--card-bg", `var(--${member.accent}-bg)`);
    card.style.setProperty("--card-fg", `var(--${member.accent}-fg)`);

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="card-head-top">
        <div class="avatar">${initials(member.name)}</div>
        <div>
          <div class="card-name">${member.name}</div>
          <div class="card-count">${doneCount} dari ${tasks.length} selesai</div>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${tasks.length ? (doneCount / tasks.length) * 100 : 0}%"></div></div>
    `;
    card.appendChild(head);

    const list = document.createElement("ul");
    list.className = "task-list";
    tasks.forEach((task) => list.appendChild(buildTaskItem(member, task)));
    card.appendChild(list);

    const addRow = document.createElement("div");
    addRow.className = "add-task-row";
    addRow.innerHTML = `
      <form class="add-task-form">
        <input type="text" placeholder="Tambah tugas baru…" maxlength="300" />
        <button type="submit">+ Tambah</button>
      </form>
    `;
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
        await apiAction({ action: "add_task", member_name: member.name, body });
        input.value = "";
        const res = await fetch(API);
        if (res.ok) applyData(await res.json());
      } catch (err) {
        alert("Gagal menambah tugas: " + err.message);
      }
      btn.disabled = false;
      btn.textContent = "+ Tambah";
    });
    card.appendChild(addRow);

    els.grid.appendChild(card);
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

  meta.appendChild(commentBtn);
  meta.appendChild(deleteBtn);

  row.appendChild(checkbox);
  row.appendChild(label);
  row.appendChild(meta);
  li.appendChild(row);

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
  [...els.grid.children].forEach((card) => {
    const memberMatches = activeMember === "all" || activeMember === card.dataset.member;
    card.querySelectorAll(".task-item").forEach((item) => {
      const textMatches = !searchTerm || item.dataset.text.includes(searchTerm);
      item.classList.toggle("hidden", !(memberMatches && textMatches));
    });
    card.style.display = memberMatches ? "" : "none";
    if (memberMatches) anyVisible = true;
  });
  els.empty.style.display = anyVisible ? "none" : "block";
  els.grid.style.display = anyVisible ? "grid" : "none";
}

els.search.addEventListener("input", (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  render();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
