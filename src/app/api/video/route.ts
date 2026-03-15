import Replicate from "replicate";
import { CreativeContext } from "@/types/creative-context";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY });

export async function POST(req: Request) {
  if (!process.env.REPLICATE_API_KEY) {
    return Response.json(
      { error: "REPLICATE_API_KEY not configured" },
      { status: 500 }
    );
  }

  const context: CreativeContext = await req.json();

  const videoPrompt = [
    context.videoStyle,
    context.mood && `${context.mood} atmosphere`,
    context.genre && `${context.genre} music video aesthetic`,
    context.songDescription,
    "cinematic, high quality, music video"
  ]
    .filter(Boolean)
    .join(", ");

  try {
    const prediction = await replicate.predictions.create({
      version: "9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351",
      input: {
        prompt: videoPrompt,
        num_frames: 50,
        num_inference_steps: 50,
        fps: 8,
      },
    });

    return Response.json({
      jobId: prediction.id,
      status: prediction.status,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
