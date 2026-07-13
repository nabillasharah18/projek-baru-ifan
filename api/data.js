const REPO = process.env.GITHUB_REPO || "nabillasharah18/projek-baru-ifan";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "data/education-team.json";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const SHEET_ID = "16SgZLi0HnXVV0dZRbmhJgaWb7COJGv8u5QsRPPc5wqE";

const ACCENT_MAP = {
  Sharah: "rose",
  Raras: "peach",
  Elyska: "yellow",
  Syika: "mint",
  Wulan: "blue",
  Tasya: "lavender",
  Dewi: "coral",
};
const ACCENT_CYCLE = ["rose", "peach", "yellow", "mint", "blue", "lavender", "coral"];

function stableId(memberName, taskBody) {
  const str = memberName + ":" + taskBody;
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
  }
  return "s" + h.toString(36);
}

function parseCSVRows(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
      } else if (ch === "\r") {
        // skip carriage return
      } else {
        cell += ch;
      }
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function fetchSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Gagal membaca spreadsheet: ${res.status}`);
  const text = await res.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(
      'Spreadsheet belum di-share. Buka spreadsheet → Share → "Anyone with the link" → Viewer.'
    );
  }
  const rows = parseCSVRows(text);

  const members = [];
  const tasks = [];
  let colorIdx = 0;
  let currentMember = null;

  function cleanText(s) {
    return s.replace(/[⁠​‌‍﻿]/g, "").replace(/^[•\-\*·]\s*/, "").trim();
  }

  for (let i = 1; i < rows.length; i++) {
    const rawName = (rows[i][0] || "").trim();
    const rawBody = (rows[i][1] || "").trim();
    const rawProgress = (rows[i][2] || "").trim();

    if (rawName) {
      const accent =
        ACCENT_MAP[rawName] || ACCENT_CYCLE[colorIdx++ % ACCENT_CYCLE.length];
      currentMember = { name: rawName, accent };
      members.push(currentMember);
    }

    if (!currentMember || !rawBody) continue;

    const stripped = rawBody.replace(/[⁠​‌‍﻿]/g, "");
    const lines = stripped.split("\n").map((l) => l.replace(/^[•\-\*·]\s*/, "").trim()).filter((l) => l.length > 0);

    lines.forEach((body) => {
      tasks.push({
        id: stableId(currentMember.name, body),
        member_name: currentMember.name,
        body,
        done: false,
        created_at: new Date("2026-06-30T08:00:00Z").toISOString(),
        from_sheet: true,
        progress: rawProgress || null,
      });
    });
  }
  return { members, tasks };
}

async function ghFetch(path, options = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return r;
}

async function readData() {
  const res = await ghFetch(
    `/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`
  );
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const file = await res.json();
  const content = Buffer.from(file.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: file.sha };
}

async function writeData(data, sha, message) {
  const encoded = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const res = await ghFetch(`/repos/${REPO}/contents/${FILE_PATH}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: encoded, sha, branch: BRANCH }),
  });
  if (res.status === 409) throw new Error("CONFLICT");
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed: ${res.status} — ${err}`);
  }
}

async function readModifyWrite(modifyFn, commitMessage, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, sha } = await readData();
    modifyFn(data);
    try {
      await writeData(data, sha, commitMessage);
      return { data };
    } catch (err) {
      if (err.message === "CONFLICT" && attempt < maxRetries - 1) continue;
      throw err;
    }
  }
}

function generateId() {
  return (
    "t" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

function mergeData(sheet, state) {
  const doneTasks = new Set(state.done_tasks || []);
  const hiddenTasks = new Set(state.hidden_tasks || []);
  const localTasks = state.local_tasks || [];
  const comments = state.comments || [];

  const tasks = sheet.tasks
    .filter((t) => !hiddenTasks.has(t.id))
    .map((t) => ({ ...t, done: doneTasks.has(t.id) }));

  tasks.push(...localTasks);

  return { members: sheet.members, tasks, comments };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (!TOKEN) {
    return res
      .status(500)
      .json({ error: "GITHUB_TOKEN belum diset di environment Vercel." });
  }

  try {
    if (req.method === "GET") {
      const [sheet, { data: state }] = await Promise.all([
        fetchSheet(),
        readData(),
      ]);
      return res.status(200).json(mergeData(sheet, state));
    }

    if (req.method === "POST") {
      const { action, ...params } = req.body || {};
      if (!action)
        return res.status(400).json({ error: "Missing action" });

      if (action === "add_task") {
        if (!params.member_name || !params.body) {
          return res
            .status(400)
            .json({ error: "member_name dan body wajib diisi" });
        }
        let task;
        await readModifyWrite((data) => {
          if (!data.local_tasks) data.local_tasks = [];
          task = {
            id: generateId(),
            member_name: params.member_name,
            body: params.body,
            done: false,
            created_at: new Date().toISOString(),
          };
          data.local_tasks.push(task);
        }, `[dashboard] Tambah tugas: ${params.member_name}`);
        return res.status(200).json({ ok: true, task });
      }

      if (action === "toggle_task") {
        await readModifyWrite((data) => {
          if (!data.done_tasks) data.done_tasks = [];
          if (!data.local_tasks) data.local_tasks = [];

          const localTask = data.local_tasks.find(
            (t) => t.id === params.id
          );
          if (localTask) {
            localTask.done = params.done;
            return;
          }

          const idx = data.done_tasks.indexOf(params.id);
          if (params.done && idx === -1) {
            data.done_tasks.push(params.id);
          } else if (!params.done && idx !== -1) {
            data.done_tasks.splice(idx, 1);
          }
        }, `[dashboard] ${params.done ? "Selesai" : "Batal selesai"}`);
        return res.status(200).json({ ok: true });
      }

      if (action === "delete_task") {
        await readModifyWrite((data) => {
          if (!data.local_tasks) data.local_tasks = [];
          if (!data.hidden_tasks) data.hidden_tasks = [];

          const localIdx = data.local_tasks.findIndex(
            (t) => t.id === params.id
          );
          if (localIdx !== -1) {
            data.local_tasks.splice(localIdx, 1);
          } else {
            if (!data.hidden_tasks.includes(params.id)) {
              data.hidden_tasks.push(params.id);
            }
          }
          data.comments = (data.comments || []).filter(
            (c) => c.task_id !== params.id
          );
        }, `[dashboard] Hapus tugas`);
        return res.status(200).json({ ok: true });
      }

      if (action === "add_comment") {
        let comment;
        await readModifyWrite((data) => {
          if (!data.comments) data.comments = [];
          comment = {
            id:
              "c" +
              Date.now().toString(36) +
              Math.random().toString(36).slice(2, 6),
            task_id: params.task_id,
            author_name: params.author_name,
            body: params.body,
            created_at: new Date().toISOString(),
          };
          data.comments.push(comment);
        }, `[dashboard] Komentar oleh ${params.author_name}`);
        return res.status(200).json({ ok: true, comment });
      }

      if (action === "edit_comment") {
        await readModifyWrite((data) => {
          const comment = (data.comments || []).find(
            (c) => c.id === params.id
          );
          if (!comment) throw new Error("Komentar tidak ditemukan");
          if (!comment.original_body) comment.original_body = comment.body;
          comment.body = params.body;
          comment.edited_at = new Date().toISOString();
        }, `[dashboard] Edit komentar`);
        return res.status(200).json({ ok: true });
      }

      if (action === "delete_comment") {
        await readModifyWrite((data) => {
          const idx = (data.comments || []).findIndex(
            (c) => c.id === params.id
          );
          if (idx === -1) throw new Error("Komentar tidak ditemukan");
          data.comments.splice(idx, 1);
        }, `[dashboard] Hapus komentar`);
        return res.status(200).json({ ok: true });
      }

      return res
        .status(400)
        .json({ error: "Action tidak dikenal: " + action });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
