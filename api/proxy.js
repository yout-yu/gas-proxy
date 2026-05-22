/**
 * POST /api/proxy
 * Claude → Edge Config にジョブを書き込む
 * 
 * Edge Configへの書き込みはVercel REST API経由
 * GASへの実際の転送は /api/process が担当
 */

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN;
const TEAM_ID        = process.env.TEAM_ID;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  if (!EDGE_CONFIG_ID || !VERCEL_TOKEN) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  try {
    const job = {
      ...req.body,
      jobId:     `job_${Date.now()}`,
      createdAt: new Date().toISOString(),
      status:    "pending",
      result:    null,
    };

    // Edge Config に pending ジョブを書き込む
    const writeRes = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items?teamId=${TEAM_ID}`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${VERCEL_TOKEN}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          items: [{ operation: "upsert", key: "pending_job", value: job }],
        }),
      }
    );

    if (!writeRes.ok) {
      const err = await writeRes.text();
      return res.status(502).json({ error: "Edge Config write failed", detail: err });
    }

    // /api/process を非同期でトリガー（waitなし）
    const host = req.headers.host;
    fetch(`https://${host}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.jobId }),
    }).catch(() => {}); // fire-and-forget

    return res.status(200).json({
      success: true,
      jobId:   job.jobId,
      message: "Job queued. Call GET /api/result?jobId=<jobId> to check status.",
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
