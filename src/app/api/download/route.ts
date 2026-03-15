export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

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
    "api.elevenlabs.io"
  ];

  let urlHost: string;
  try {
    urlHost = new URL(url).hostname;
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  const isAllowed = allowedDomains.some(domain => urlHost.endsWith(domain));
  if (!isAllowed) {
    return new Response("Domain not allowed for download proxy", { status: 403 });
  }

  try {
    const audioResponse = await fetch(url);
    if (!audioResponse.ok) {
      return new Response("Failed to fetch audio", { status: 502 });
    }

    const buffer = await audioResponse.arrayBuffer();
    const contentType = audioResponse.headers.get("content-type") ?? "audio/mpeg";
    const ext = contentType.includes("wav") ? "wav" : "mp3";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="musevibe-song.${ext}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[download proxy] Error:", err);
    return new Response("Download proxy error", { status: 500 });
  }
}
