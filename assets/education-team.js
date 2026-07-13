import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase-config.js";

const ACCENT_FALLBACK = [
  { name: "Sharah", accent: "rose" },
  { name: "Raras", accent: "peach" },
  { name: "Elyska", accent: "yellow" },
  { name: "Syika", accent: "mint" },
  { name: "Wulan", accent: "blue" },
  { name: "Tasya", accent: "lavender" },
];

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

const isConfigured = SUPABASE_URL && !SUPABASE_URL.includes("YOUR-PROJECT-REF") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR-ANON");

if (!isConfigured) {
  els.setup.style.display = "block";
  els.app.style.display = "none";
  els.banner.style.display = "none";
} else {
  runApp();
}

async function runApp() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let members = ACCENT_FALLBACK.map((m, i) => ({ ...m, sort_order: i + 1 }));
  let tasksByMember = new Map(members.map((m) => [m.name, []]));
  let commentsByTask = new Map();
  let activeMember = "all";
  let searchTerm = "";
  const openPanels = new Set();

  setBanner("loading", "Menghubungkan ke database…");

  try {
    const [membersRes, tasksRes, commentsRes] = await Promise.all([
      supabase.from("members").select("*").order("sort_order"),
      supabase.from("tasks").select("*").order("created_at"),
      supabase.from("task_comments").select("*").order("created_at"),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (commentsRes.error) throw commentsRes.error;

    if (membersRes.data && membersRes.data.length) members = membersRes.data;
    tasksByMember = new Map(members.map((m) => [m.name, []]));
    (tasksRes.data || []).forEach((t) => {
      if (!tasksByMember.has(t.member_name)) tasksByMember.set(t.member_name, []);
      tasksByMember.get(t.member_name).push(t);
    });
    commentsByTask = new Map();
    (commentsRes.data || []).forEach((c) => {
      if (!commentsByTask.has(c.task_id)) commentsByTask.set(c.task_id, []);
      commentsByTask.get(c.task_id).push(c);
    });

    setBanner("live", "Tersambung — perubahan tersinkron otomatis untuk semua anggota tim");
  } catch (err) {
    console.error(err);
    setBanner("error", "Gagal memuat data dari Supabase: " + (err.message || err));
    return;
  }

  buildChips();
  buildGrid();
  updateStats();
  render();

  supabase
    .channel("education-team-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, async () => {
      await refetchTasks();
      buildGrid();
      updateStats();
      render();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, async () => {
      await refetchComments();
      buildGrid();
      render();
    })
    .subscribe();

  async function refetchTasks() {
    const { data, error } = await supabase.from("tasks").select("*").order("created_at");
    if (error) return console.error(error);
    tasksByMember = new Map(members.map((m) => [m.name, []]));
    (data || []).forEach((t) => {
      if (!tasksByMember.has(t.member_name)) tasksByMember.set(t.member_name, []);
      tasksByMember.get(t.member_name).push(t);
    });
  }

  async function refetchComments() {
    const { data, error } = await supabase.from("task_comments").select("*").order("created_at");
    if (error) return console.error(error);
    commentsByTask = new Map();
    (data || []).forEach((c) => {
      if (!commentsByTask.has(c.task_id)) commentsByTask.set(c.task_id, []);
      commentsByTask.get(c.task_id).push(c);
    });
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

      tasks.forEach((task) => {
        list.appendChild(buildTaskItem(member, task));
      });
      card.appendChild(list);

      const addRow = document.createElement("div");
      addRow.className = "add-task-row";
      addRow.innerHTML = `
        <form class="add-task-form">
          <input type="text" placeholder="Tambah tugas baru untuk ${member.name}…" maxlength="300" />
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
        const { error } = await supabase.from("tasks").insert({ member_name: member.name, body });
        btn.disabled = false;
        if (error) {
          alert("Gagal menambah tugas: " + error.message);
          return;
        }
        input.value = "";
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
      const { error } = await supabase.from("tasks").update({ done: checkbox.checked }).eq("id", task.id);
      if (error) {
        checkbox.checked = !checkbox.checked;
        li.classList.toggle("done", checkbox.checked);
        alert("Gagal menyimpan: " + error.message);
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
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) alert("Gagal menghapus: " + error.message);
    });

    meta.appendChild(commentBtn);
    meta.appendChild(deleteBtn);

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(meta);
    li.appendChild(row);

    const panel = document.createElement("div");
    panel.className = "comment-panel" + (openPanels.has(task.id) ? " open" : "");

    const list = document.createElement("div");
    list.className = "comment-list";
    if (comments.length === 0) {
      list.innerHTML = `<div class="comment-empty">Belum ada komentar.</div>`;
    } else {
      comments.forEach((c) => {
        const item = document.createElement("div");
        item.className = "comment-item";
        item.innerHTML = `<span class="comment-author">${escapeHtml(c.author_name)}</span><span class="comment-time">${formatTime(c.created_at)}</span><div class="comment-body">${escapeHtml(c.body)}</div>`;
        list.appendChild(item);
      });
    }
    panel.appendChild(list);

    const form = document.createElement("form");
    form.className = "comment-form";
    const select = document.createElement("select");
    members.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.name;
      opt.textContent = m.name;
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
      const { error } = await supabase.from("task_comments").insert({
        task_id: task.id,
        author_name: select.value,
        body,
      });
      sendBtn.disabled = false;
      if (error) {
        alert("Gagal mengirim komentar: " + error.message);
        return;
      }
      textInput.value = "";
      openPanels.add(task.id);
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
      let cardHasVisible = false;
      card.querySelectorAll(".task-item").forEach((item) => {
        const textMatches = !searchTerm || item.dataset.text.includes(searchTerm);
        const visible = memberMatches && textMatches;
        item.classList.toggle("hidden", !visible);
        if (visible) cardHasVisible = true;
      });
      const show = memberMatches && cardHasVisible;
      card.style.display = show ? "" : "none";
      if (show) anyVisible = true;
    });
    els.empty.style.display = anyVisible ? "none" : "block";
    els.grid.style.display = anyVisible ? "grid" : "none";
  }

  els.search.addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
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
