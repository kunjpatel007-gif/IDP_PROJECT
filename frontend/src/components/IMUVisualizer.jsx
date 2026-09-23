import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { fmt } from '@/lib/format';

/**
 * IMUVisualizer — a CSS 3D cube that physically rotates to match
 * the live accelerometer readings from the M5StickC Plus 2.
 *
 * accelX/Y/Z are in g-force (±1g = flat, tilted 90°).
 * We clamp to ±1g and map to ±45° rotation for a readable range.
 */

const FACE_STYLE = 'absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-widest uppercase select-none backdrop-blur-sm';

function AxisBar({ label, value, color }) {
  const pct = Math.round(Math.max(-100, Math.min(100, value * 100)));
  const barWidth = Math.abs(pct);
  const isPos = pct >= 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-4 font-mono text-[10px] text-on-surface-subtle shrink-0">{label}</span>
      <div className="relative flex h-[14px] flex-1 items-center bg-surface-subtle border border-border-subtle overflow-hidden">
        {/* Zero tick */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-border-muted z-10" />
        {/* Bar */}
        <motion.div
          className="absolute top-0 h-full"
          style={{ backgroundColor: color, opacity: 0.75 }}
          animate={{
            left: isPos ? '50%' : `${50 - barWidth / 2}%`,
            width: `${barWidth / 2}%`,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
      <span
        className="w-14 text-right font-mono text-[10px] shrink-0"
        style={{ color }}
      >
        {value >= 0 ? '+' : ''}{value.toFixed(3)} g
      </span>
    </div>
  );
}

export default function IMUVisualizer({ accelX = 0, accelY = 0, accelZ = 1, battery_pct, battery_v, rssi, seq }) {
  // Calculate proper Euler angles from the gravity vector (in degrees)
  // This allows full 360-degree rotation matching the physical device
  const pitch = Math.atan2(-accelY, Math.sqrt(accelX * accelX + accelZ * accelZ)) * (180 / Math.PI);
  const roll = Math.atan2(accelX, accelZ) * (180 / Math.PI);

  const batColor = battery_pct > 60 ? '#4ade80' : battery_pct > 25 ? '#d97736' : '#ef4444';

  return (
    <div className="flex flex-col gap-4">
      {/* 3D Cube */}
      <div className="flex items-center justify-center py-2">
        <div style={{ perspective: '280px', perspectiveOrigin: '50% 50%' }}>
          <motion.div
            style={{
              width: 80,
              height: 80,
              position: 'relative',
              transformStyle: 'preserve-3d',
            }}
            animate={{
              rotateX: pitch,
              rotateY: roll,
              rotateZ: 0,
            }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          >
            {/* Front — orange (device screen side) */}
            <div className={FACE_STYLE} style={{ transform: 'translateZ(40px)', backgroundColor: 'rgba(217,119,54,0.25)', borderWidth: 1, borderColor: 'rgba(217,119,54,0.5)' }}>
              <span style={{ color: '#d97736' }}>M5</span>
            </div>
            {/* Back */}
            <div className={FACE_STYLE} style={{ transform: 'translateZ(-40px) rotateY(180deg)', backgroundColor: 'rgba(217,119,54,0.10)', borderWidth: 1, borderColor: 'rgba(217,119,54,0.25)' }}>
              <span style={{ color: 'rgba(217,119,54,0.5)' }}>USB</span>
            </div>
            {/* Left — blue (X axis) */}
            <div className={FACE_STYLE} style={{ transform: 'translateX(-40px) rotateY(-90deg)', backgroundColor: 'rgba(96,165,250,0.18)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.4)' }}>
              <span style={{ color: 'rgba(96,165,250,0.6)' }}>−X</span>
            </div>
            {/* Right — blue (X axis) */}
            <div className={FACE_STYLE} style={{ transform: 'translateX(40px) rotateY(90deg)', backgroundColor: 'rgba(96,165,250,0.18)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.4)' }}>
              <span style={{ color: 'rgba(96,165,250,0.6)' }}>+X</span>
            </div>
            {/* Top — green (Z axis) */}
            <div className={FACE_STYLE} style={{ transform: 'translateY(-40px) rotateX(90deg)', backgroundColor: 'rgba(74,222,128,0.18)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)' }}>
              <span style={{ color: 'rgba(74,222,128,0.7)' }}>+Z</span>
            </div>
            {/* Bottom — green (Z axis) */}
            <div className={FACE_STYLE} style={{ transform: 'translateY(40px) rotateX(-90deg)', backgroundColor: 'rgba(74,222,128,0.10)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)' }}>
              <span style={{ color: 'rgba(74,222,128,0.5)' }}>−Z</span>
            </div>
          </motion.div>
        </div>

        {/* Side stats */}
        <div className="ml-5 flex flex-col gap-2 font-mono text-[11px]">
          {/* Battery */}
          <div className="flex items-center gap-2">
            <span className="text-on-surface-subtle">BAT</span>
            <div className="relative flex h-[12px] w-[44px] items-center border border-border-muted bg-surface-subtle overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${battery_pct ?? 0}%`, backgroundColor: batColor }}
              />
            </div>
            <span style={{ color: batColor }}>{battery_pct ?? '--'}%</span>
          </div>
          {/* Battery voltage */}
          {battery_v != null && (
            <div className="text-on-surface-subtle">
              <span className="mr-1">V</span>
              <span className="text-on-surface">{battery_v.toFixed(2)}v</span>
            </div>
          )}
          {/* RSSI */}
          {rssi != null && (
            <div className="text-on-surface-subtle">
              <span className="mr-1">RF</span>
              <span className={rssi > -70 ? 'text-accent-green' : rssi > -85 ? 'text-[#d97736]' : 'text-accent-red'}>
                {rssi} dBm
              </span>
            </div>
          )}
          {/* Packet count */}
          {seq != null && (
            <div className="text-on-surface-subtle">
              <span className="mr-1">PKT</span>
              <span className="text-on-surface">{seq}</span>
            </div>
          )}
        </div>
      </div>

      {/* Axis bars */}
      <div className="flex flex-col gap-1.5 rounded border border-border-subtle bg-surface-subtle p-3">
        <span className="mb-1 font-mono text-[9px] uppercase tracking-[0.08em] text-on-surface-subtle">Accelerometer</span>
        <AxisBar label="X" value={accelX} color="#d97736" />
        <AxisBar label="Y" value={accelY} color="#60a5fa" />
        <AxisBar label="Z" value={accelZ} color="#4ade80" />
      </div>
    </div>
  );
}
