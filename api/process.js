/**
 * POST /api/process
 * Edge Config からジョブを読み取り → GAS に転送 → 結果をEdge Configに書き戻す
 */

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN;
const TEAM_ID        = process.env.TEAM_ID;
const GAS_URL        = process.env.GAS_URL;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!EDGE_CONFIG_ID || !VERCEL_TOKEN || !GAS_URL) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  try {
    // Edge Config から pending_job を読み込む
    const readRes = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/item/pending_job?teamId=${TEAM_ID}`,
      { headers: { "Authorization": `Bearer ${VERCEL_TOKEN}` } }
    );

    if (!readRes.ok) {
      return res.status(404).json({ error: "No pending job found" });
    }

    const job = await readRes.json();

    if (!job || job.status !== "pending") {
      return res.status(200).json({ message: "No pending job to process" });
    }

    // GAS に転送
    const gasRes = await fetch(GAS_URL, {
      method:   "POST",
      headers:  { "Content-Type": "application/json" },
      body:     JSON.stringify(job),
      redirect: "follow",
    });

    const text = await gasRes.text();
    let gasResult;
    try {
      gasResult = JSON.parse(text);
    } catch {
      gasResult = { raw: text.slice(0, 500) };
    }

    // 結果をEdge Configに書き戻す
    await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items?teamId=${TEAM_ID}`,
      {
        method:  "PATCH",
        headers: {
          "Authorization": `Bearer ${VERCEL_TOKEN}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          items: [{
            operation: "upsert",
            key:       "pending_job",
            value:     { ...job, status: "done", result: gasResult, processedAt: new Date().toISOString() },
          }],
        }),
      }
    );

    return res.status(200).json({ success: true, jobId: job.jobId, gasResult });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
