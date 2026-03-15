import { NextResponse } from 'next/server';
import { generateElevenLabsTTS } from '@/lib/elevenlabsMusic';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        if (!process.env.ELEVENLABS_API_KEY) {
             return NextResponse.json({ error: "Vocal API not configured" }, { status: 503 });
        }

        const audioBase64 = await generateElevenLabsTTS(body);
        
        return NextResponse.json({ audio: audioBase64 });
    } catch (e: any) {
        console.error("Vocal Generation Error:", e);
        return NextResponse.json({ error: e.message || "Failed to generate vocals" }, { status: 500 });
    }
}
