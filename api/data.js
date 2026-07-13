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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed: ${res.status} — ${err}`);
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
      const { action, ...params } = req.body;
      const { data, sha } = await readData();

      if (action === "add_task") {
        const task = {
          id: generateId(),
          member_name: params.member_name,
          body: params.body,
          done: false,
          created_at: new Date().toISOString(),
        };
        data.tasks.push(task);
        await writeData(data, sha, `[dashboard] Tambah tugas: ${params.member_name}`);
        return res.status(200).json({ ok: true, task });
      }

      if (action === "toggle_task") {
        const task = data.tasks.find((t) => t.id === params.id);
        if (!task) return res.status(404).json({ error: "Task tidak ditemukan" });
        task.done = params.done;
        await writeData(data, sha, `[dashboard] ${params.done ? "Selesai" : "Batal selesai"}: ${task.body.slice(0, 50)}`);
        return res.status(200).json({ ok: true });
      }

      if (action === "delete_task") {
        const idx = data.tasks.findIndex((t) => t.id === params.id);
        if (idx === -1) return res.status(404).json({ error: "Task tidak ditemukan" });
        const removed = data.tasks.splice(idx, 1)[0];
        data.comments = data.comments.filter((c) => c.task_id !== params.id);
        await writeData(data, sha, `[dashboard] Hapus tugas: ${removed.body.slice(0, 50)}`);
        return res.status(200).json({ ok: true });
      }

      if (action === "add_comment") {
        const comment = {
          id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          task_id: params.task_id,
          author_name: params.author_name,
          body: params.body,
          created_at: new Date().toISOString(),
        };
        data.comments.push(comment);
        const task = data.tasks.find((t) => t.id === params.task_id);
        await writeData(data, sha, `[dashboard] Komentar oleh ${params.author_name} di: ${task ? task.body.slice(0, 40) : params.task_id}`);
        return res.status(200).json({ ok: true, comment });
      }

      return res.status(400).json({ error: "Action tidak dikenal: " + action });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
