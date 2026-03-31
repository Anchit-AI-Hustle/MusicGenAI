import Replicate from "replicate";
import { checkJobStatus } from "@/lib/modelRouter";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return Response.json({ error: "Job ID required" }, { status: 400 });
    }

    // If it's a mocked elevenlabs ID, shouldn't really hit here due to synchronous return,
    // but just in case:
    if (jobId.startsWith("elevenlabs-")) {
        return Response.json({ status: "succeeded" }); // Audio would have already been sent
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_KEY,
    });

    const result = await checkJobStatus(jobId, replicate);

    return Response.json(result);

  } catch (error: any) {
    console.error('Error checking status:', error);
    return Response.json({ error: error.message || 'Status check failed' }, { status: 500 });
  }
}
