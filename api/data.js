const REPO = process.env.GITHUB_REPO || "nabillasharah18/projek-baru-ifan";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "data/education-team.json";
const BRANCH = process.env.GITHUB_BRANCH || "main";

async function ghFetch(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res;
}

async function readData() {
  const res = await ghFetch(`/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`);
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const file = await res.json();
  const content = Buffer.from(file.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: file.sha };
}

async function writeData(data, sha, message) {
  const encoded = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const res = await ghFetch(`/repos/${REPO}/contents/${FILE_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: encoded,
      sha,
      branch: BRANCH,
    }),
  });
  if (res.status === 409) {
    throw new Error("CONFLICT");
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed: ${res.status} — ${err}`);
  }
}

async function readModifyWrite(modifyFn, commitMessage, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, sha } = await readData();
    const result = modifyFn(data);
    try {
      await writeData(data, sha, commitMessage);
      return { data, result };
    } catch (err) {
      if (err.message === "CONFLICT" && attempt < maxRetries - 1) continue;
      throw err;
    }
  }
}

function generateId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (!TOKEN) {
    return res.status(500).json({ error: "GITHUB_TOKEN belum diset di environment Vercel." });
  }

  try {
    if (req.method === "GET") {
      const { data } = await readData();
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const { action, ...params } = req.body || {};

      if (!action) {
        return res.status(400).json({ error: "Missing action field in request body" });
      }

      if (action === "add_task") {
        if (!params.member_name || !params.body) {
          return res.status(400).json({ error: "member_name dan body wajib diisi" });
        }
        let task;
        await readModifyWrite((data) => {
          task = {
            id: generateId(),
            member_name: params.member_name,
            body: params.body,
            done: false,
            created_at: new Date().toISOString(),
          };
          data.tasks.push(task);
        }, `[dashboard] Tambah tugas: ${params.member_name}`);
        return res.status(200).json({ ok: true, task });
      }

      if (action === "toggle_task") {
        await readModifyWrite((data) => {
          const task = data.tasks.find((t) => t.id === params.id);
          if (!task) throw new Error("Task tidak ditemukan");
          task.done = params.done;
        }, `[dashboard] ${params.done ? "Selesai" : "Batal selesai"}`);
        return res.status(200).json({ ok: true });
      }

      if (action === "delete_task") {
        await readModifyWrite((data) => {
          const idx = data.tasks.findIndex((t) => t.id === params.id);
          if (idx === -1) throw new Error("Task tidak ditemukan");
          data.tasks.splice(idx, 1);
          data.comments = data.comments.filter((c) => c.task_id !== params.id);
        }, `[dashboard] Hapus tugas`);
        return res.status(200).json({ ok: true });
      }

      if (action === "add_comment") {
        let comment;
        await readModifyWrite((data) => {
          comment = {
            id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
          const comment = data.comments.find((c) => c.id === params.id);
          if (!comment) throw new Error("Komentar tidak ditemukan");
          if (!comment.original_body) {
            comment.original_body = comment.body;
          }
          comment.body = params.body;
          comment.edited_at = new Date().toISOString();
        }, `[dashboard] Edit komentar`);
        return res.status(200).json({ ok: true });
      }

      if (action === "delete_comment") {
        await readModifyWrite((data) => {
          const idx = data.comments.findIndex((c) => c.id === params.id);
          if (idx === -1) throw new Error("Komentar tidak ditemukan");
          data.comments.splice(idx, 1);
        }, `[dashboard] Hapus komentar`);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Action tidak dikenal: " + action });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
