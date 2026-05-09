import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export const AnimatedBackground = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-[#05050A]">
      {/* Dynamic ambient orb following cursor — viewport-relative so it
          scales down on phones instead of overflowing past the screen.
          min(60vw, 60vh, 600px) keeps it round and bounded. */}
      <motion.div
        className="absolute rounded-full blur-[80px] sm:blur-[120px] opacity-20 pointer-events-none"
        animate={{
          x: mousePos.x - 150,
          y: mousePos.y - 150,
        }}
        transition={{ type: "spring", stiffness: 50, damping: 20, mass: 0.5 }}
        style={{
          width: 'min(60vw, 60vh, 600px)',
          height: 'min(60vw, 60vh, 600px)',
          background: "radial-gradient(circle, rgba(0,255,136,0.8) 0%, rgba(0,204,255,0.4) 50%, transparent 80%)",
        }}
      />

      {/* Static purple orb — bounded to viewport so phones don't render
          a 900px element that paints offscreen anyway. */}
      <div
        className="absolute top-[-20%] left-[-10%] rounded-full blur-[100px] sm:blur-[150px] opacity-20 bg-purple-600 pointer-events-none mix-blend-screen"
        style={{ width: 'min(80vw, 800px)', height: 'min(80vw, 800px)' }}
      />

      {/* Static blue orb */}
      <div
        className="absolute bottom-[-20%] right-[-10%] rounded-full blur-[100px] sm:blur-[150px] opacity-10 bg-blue-600 pointer-events-none mix-blend-screen"
        style={{ width: 'min(85vw, 900px)', height: 'min(85vw, 900px)' }}
      />
      
      {/* Noise overlay for premium texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>
    </div>
  );
};
