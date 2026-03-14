import React, { useRef, useEffect } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { audioEngine } from '@/lib/audio-engine';

interface AudioVisualizerProps {
  className?: string;
  barCount?: number;
  mode?: 'bars' | 'wave';
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ className = '', barCount = 48, mode = 'bars' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const { isPlaying } = usePlayer();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      let dataArray = new Uint8Array(256); // Matches fftSize/2
      const hasData = audioEngine.getByteFrequencyData(dataArray);

      if (!hasData) {
        // Fake visualization when analyser unavailable
        dataArray = new Uint8Array(barCount);
        if (isPlaying) {
          const t = Date.now() / 1000;
          for (let i = 0; i < barCount; i++) {
            dataArray[i] = Math.floor(80 + 100 * Math.sin(t * 2 + i * 0.3) * Math.sin(t * 0.7 + i * 0.15));
          }
        }
      }

      const primary = getComputedStyle(canvas).getPropertyValue('--primary').trim() || '185 75% 55%';

      if (mode === 'bars') {
        const barW = width / barCount;
        const gap = 2;
        for (let i = 0; i < barCount; i++) {
          const val = dataArray[Math.floor(i * (dataArray.length / barCount))] / 255;
          const barH = val * height * 0.9;
          const x = i * barW;
          const y = height - barH;
          const alpha = 0.4 + val * 0.6;
          ctx.fillStyle = `hsla(${primary} / ${alpha})`;
          ctx.beginPath();
          ctx.roundRect(x + gap / 2, y, barW - gap, barH, 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.strokeStyle = `hsla(${primary} / 0.8)`;
        ctx.lineWidth = 2;
        const sliceW = width / dataArray.length;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 255;
          const y = height / 2 + (v - 0.5) * height * 0.8;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceW, y);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, barCount, mode]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={120}
      className={`w-full h-full ${className}`}
    />
  );
};
