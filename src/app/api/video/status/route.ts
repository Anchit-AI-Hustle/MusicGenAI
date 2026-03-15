import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) return Response.json({ error: "jobId required" }, { status: 400 });

  try {
    const prediction = await replicate.predictions.get(jobId);
    let videoUrl: string | null = null;

    if (prediction.status === "succeeded" && prediction.output) {
      const output = prediction.output;
      if (typeof output === "string") videoUrl = output;
      else if (Array.isArray(output)) videoUrl = output[0] ?? null;
    }

    return Response.json({
      status: prediction.status,
      videoUrl,
      error: prediction.error ?? null,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
