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
      {/* Dynamic ambient orb following cursor */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 pointer-events-none"
        animate={{
          x: mousePos.x - 300,
          y: mousePos.y - 300,
        }}
        transition={{ type: "spring", stiffness: 50, damping: 20, mass: 0.5 }}
        style={{
          background: "radial-gradient(circle, rgba(0,255,136,0.8) 0%, rgba(0,204,255,0.4) 50%, transparent 80%)",
        }}
      />
      
      {/* Static purple orb */}
      <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full blur-[150px] opacity-20 bg-purple-600 pointer-events-none mix-blend-screen" />
      
      {/* Static blue orb */}
      <div className="absolute bottom-[-20%] right-[-10%] w-[900px] h-[900px] rounded-full blur-[150px] opacity-10 bg-blue-600 pointer-events-none mix-blend-screen" />
      
      {/* Noise overlay for premium texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>
    </div>
  );
};
