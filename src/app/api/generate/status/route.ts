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

    // Check for image input error - this model doesn't support image input
    const errorMessage = result.error?.toLowerCase() || "";
    if (result.status === "failed" && (errorMessage.includes("image") || errorMessage.includes("does not support image"))) {
      console.error("[Generate Status] Model error - image input not supported:", result.error);
      return Response.json({ 
        status: "failed", 
        output: null, 
        error: "This music model does not support image input. Please try a different prompt or model."
      });
    }

    return Response.json(result);

  } catch (error: any) {
    console.error('Error checking status:', error);
    
    // Check if the error is about image input
    const errorMsg = error.message?.toLowerCase() || "";
    if (errorMsg.includes("image")) {
      return Response.json({ 
        status: "failed", 
        output: null, 
        error: "This music model does not support image input. Please try a different prompt or model."
      }, { status: 500 });
    }
    
    return Response.json({ error: error.message || 'Status check failed' }, { status: 500 });
  }
}
