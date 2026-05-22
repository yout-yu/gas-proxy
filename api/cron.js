/**
 * GET /api/cron
 * Vercel Cron（毎分実行）: Edge Config の pending_job を読んでGASに転送
 */

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN;
const TEAM_ID        = process.env.TEAM_ID;
const GAS_URL        = process.env.GAS_URL;

export default async function handler(req, res) {
  // Cron認証（Vercelが自動付与するヘッダー）
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    // CRON_SECRETが未設定の場合はスキップ（開発用）
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    // Edge Config から pending_job を取得
    const readRes = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/item/pending_job?teamId=${TEAM_ID}`,
      { headers: { "Authorization": `Bearer ${VERCEL_TOKEN}` } }
    );

    if (!readRes.ok) {
      return res.status(200).json({ message: "No job found" });
    }

    const item = await readRes.json();
    const job = item.value ?? item;

    if (!job || job.status !== "pending") {
      return res.status(200).json({ message: "No pending job" });
    }

    console.log(`Processing job: ${job.jobId}`);

    // GASに転送
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

    // 結果をEdge Configに書き戻す（done）
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
            value:     {
              ...job,
              status:      "done",
              result:      gasResult,
              processedAt: new Date().toISOString(),
            },
          }],
        }),
      }
    );

    console.log(`Job ${job.jobId} done:`, JSON.stringify(gasResult));
    return res.status(200).json({ success: true, jobId: job.jobId, gasResult });

  } catch (err) {
    console.error("Cron error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
