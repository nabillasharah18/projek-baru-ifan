const crypto = require("crypto");

const PASSWORD = process.env.DASHBOARD_PASSWORD;
const SECRET = "dashboard-session-salt-2026";

function makeToken(password) {
  return crypto.createHmac("sha256", SECRET).update(password).digest("hex");
}

function parseCookies(header) {
  const cookies = {};
  (header || "").split(";").forEach((c) => {
    const [name, ...rest] = c.trim().split("=");
    if (name) cookies[name.trim()] = rest.join("=").trim();
  });
  return cookies;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (!PASSWORD) {
    return res.status(200).json({ authenticated: true });
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["dashboard_session"];
  const expectedToken = makeToken(PASSWORD);

  if (req.method === "GET") {
    return res.status(200).json({ authenticated: token === expectedToken });
  }

  if (req.method === "POST") {
    const { action, password } = req.body || {};

    if (action === "logout") {
      res.setHeader(
        "Set-Cookie",
        "dashboard_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
      );
      return res.status(200).json({ ok: true });
    }

    if (!password) {
      return res.status(400).json({ error: "Password wajib diisi" });
    }

    if (password === PASSWORD) {
      const t = makeToken(PASSWORD);
      const secure =
        req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `dashboard_session=${t}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${30 * 24 * 60 * 60}`
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(401).json({ error: "Password salah" });
  }

  return res.status(405).json({ error: "Method not allowed" });
};

module.exports.parseCookies = parseCookies;
module.exports.makeToken = makeToken;
module.exports.SECRET = SECRET;
