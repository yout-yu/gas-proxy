const GAS_URL = process.env.GAS_URL;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!GAS_URL) return res.status(500).json({ error: "GAS_URL not set" });

  try {
    const gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      redirect: "follow",
    });
    const text = await gasRes.text();
    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(502).json({ error: "GAS returned non-JSON", raw: text.slice(0, 500) });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
