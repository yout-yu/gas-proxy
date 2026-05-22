/**
 * GET /api/result?jobId=<jobId>
 * Claude が処理結果をポーリングする
 */

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN;
const TEAM_ID        = process.env.TEAM_ID;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const readRes = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/item/pending_job?teamId=${TEAM_ID}`,
      { headers: { "Authorization": `Bearer ${VERCEL_TOKEN}` } }
    );

    if (!readRes.ok) return res.status(404).json({ error: "No job found" });

    const job = await readRes.json();
    return res.status(200).json(job);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
