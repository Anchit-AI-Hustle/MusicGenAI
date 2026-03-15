import { NextResponse } from 'next/server';
import Replicate from "replicate";
import { checkJobStatus } from "@/lib/modelRouter";
import { put } from "@vercel/blob";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    // If it's a mocked elevenlabs ID, shouldn't really hit here due to synchronous return,
    // but just in case:
    if (jobId.startsWith("elevenlabs-")) {
        return NextResponse.json({ status: "succeeded" }); // Audio would have already been sent
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_KEY,
    });

    const result = await checkJobStatus(jobId, replicate);

    // If succeeded and we have audio url from Replicate, upload it to Vercel Blob
    // so it doesn't expire after 24 hrs like Replicate URLs do.
    if (result.status === "succeeded" && result.output && process.env.BLOB_READ_WRITE_TOKEN) {
         try {
             // Fetch from replicate
             const audioReq = await fetch(result.output);
             if (audioReq.ok) {
                 const ab = await audioReq.arrayBuffer();
                 // Upload to blob
                 const filename = `musevibe-${jobId}-${Date.now()}.mp3`;
                 const blob = await put(filename, ab, { 
                     access: 'public',
                     contentType: 'audio/mpeg'
                 });
                 // Replace Replicate URL with permanent Blob URL
                 result.output = blob.url;
             }
         } catch(e) {
             console.error("[Generation Status API] Failed to mirror to Vercel Blob, using ephemeral URL", e);
             // Proceed with the ephemeral URL if Blob upload fails
         }
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error checking status:', error);
    return NextResponse.json({ error: error.message || 'Status check failed' }, { status: 500 });
  }
}
