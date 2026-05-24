export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const filename = searchParams.get("filename");

  if (!url) {
    return new Response("url parameter required", { status: 400 });
  }

  // Only allow downloading from known safe domains
  const allowedDomains = [
    "replicate.delivery",
    "pbxt.replicate.delivery",
    "storage.googleapis.com",
    "blob.vercel-storage.com",
    "elevenlabs.io",
    "api.elevenlabs.io",
    "supabase.co",
    "supabase.in",
  ];

  let urlHost: string;
  try {
    urlHost = new URL(url).hostname;
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  const isAllowed = allowedDomains.some(domain => urlHost.endsWith(domain));
  if (!isAllowed) {
    return new Response(`Domain not allowed for download proxy: ${urlHost}`, { status: 403 });
  }

  try {
    const audioResponse = await fetch(url);
    if (!audioResponse.ok) {
      return new Response(`Failed to fetch resource: ${audioResponse.status} ${audioResponse.statusText}`, { status: 502 });
    }

    const buffer = await audioResponse.arrayBuffer();
    const contentType = audioResponse.headers.get("content-type") ?? "audio/mpeg";

    // Determine extension from content type
    let ext = "mp3";
    if (contentType.includes("wav")) ext = "wav";
    else if (contentType.includes("mp4")) ext = "mp4";
    else if (contentType.includes("webm")) ext = "webm";
    else if (contentType.includes("ogg")) ext = "ogg";

    const downloadFilename = filename || `musevibe-song.${ext}`;

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${downloadFilename}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[download proxy] Error:", err);
    return new Response("Download proxy error", { status: 500 });
  }
}
