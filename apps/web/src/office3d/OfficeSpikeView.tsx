import { useEffect, useRef, useState } from 'react';
import { OfficeSceneManager } from './scene-manager';
import type { AnimationState, PerformanceMetrics } from './types';

export function OfficeSpikeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<OfficeSceneManager | null>(null);

  const [animState, setAnimState] = useState<AnimationState>('idle');
  const [cameraPreset, setCameraPreset] = useState<'iso' | 'front' | 'top'>('iso');
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = new OfficeSceneManager(containerRef.current, (newMetrics) => {
      setMetrics(newMetrics);
    });
    managerRef.current = manager;

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, []);

  const handleStateChange = (state: AnimationState) => {
    setAnimState(state);
    managerRef.current?.setAnimationState(state);
  };

  const handleCameraChange = (preset: 'iso' | 'front' | 'top') => {
    setCameraPreset(preset);
    managerRef.current?.setCameraPreset(preset);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 3D Viewport container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '540px',
          backgroundColor: '#0b0f19',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #1e293b',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* Viewport Top Bar (Overlay) */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            right: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              padding: '6px 14px',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #334155',
              backdropFilter: 'blur(6px)'
            }}
          >
            Spike 3D: Satu Ruangan & Humanoid Artikulasi (T04)
          </div>

          {/* Quick HUD badge */}
          {metrics && (
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                padding: '6px 12px',
                borderRadius: '8px',
                color: metrics.fps >= 50 ? '#4ade80' : metrics.fps >= 30 ? '#facc15' : '#f87171',
                fontSize: '13px',
                fontWeight: 700,
                border: '1px solid #334155',
                backdropFilter: 'blur(6px)',
                fontFamily: 'monospace'
              }}
            >
              {metrics.fps} FPS · {metrics.triangles.toLocaleString()} tris · {metrics.drawCalls} DC
            </div>
          )}
        </div>

        {/* Viewport Bottom Controls (Overlay) */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            right: '12px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {/* Animation State Controls */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              padding: '6px',
              borderRadius: '8px',
              border: '1px solid #334155',
              backdropFilter: 'blur(8px)'
            }}
          >
            <span style={{ fontSize: '12px', color: '#94a3b8', alignSelf: 'center', padding: '0 4px' }}>
              Animasi:
            </span>
            <button
              type="button"
              onClick={() => handleStateChange('walk')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: animState === 'walk' ? '#0284c7' : '#1e293b',
                color: animState === 'walk' ? '#ffffff' : '#cbd5e1'
              }}
            >
              🚶 Berjalan (Walk)
            </button>
            <button
              type="button"
              onClick={() => handleStateChange('sit')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: animState === 'sit' ? '#0284c7' : '#1e293b',
                color: animState === 'sit' ? '#ffffff' : '#cbd5e1'
              }}
            >
              🪑 Duduk di Meja (Sit)
            </button>
            <button
              type="button"
              onClick={() => handleStateChange('idle')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: animState === 'idle' ? '#0284c7' : '#1e293b',
                color: animState === 'idle' ? '#ffffff' : '#cbd5e1'
              }}
            >
              🧍 Berdiri Santai (Idle)
            </button>
          </div>

          {/* Camera Preset Controls */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              padding: '6px',
              borderRadius: '8px',
              border: '1px solid #334155',
              backdropFilter: 'blur(8px)'
            }}
          >
            <span style={{ fontSize: '12px', color: '#94a3b8', alignSelf: 'center', padding: '0 4px' }}>Kamera:</span>
            <button
              type="button"
              onClick={() => handleCameraChange('iso')}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: cameraPreset === 'iso' ? '#334155' : 'transparent',
                color: cameraPreset === 'iso' ? '#38bdf8' : '#94a3b8'
              }}
            >
              Isometrik 45°
            </button>
            <button
              type="button"
              onClick={() => handleCameraChange('front')}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: cameraPreset === 'front' ? '#334155' : 'transparent',
                color: cameraPreset === 'front' ? '#38bdf8' : '#94a3b8'
              }}
            >
              Depan
            </button>
            <button
              type="button"
              onClick={() => handleCameraChange('top')}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: cameraPreset === 'top' ? '#334155' : 'transparent',
                color: cameraPreset === 'top' ? '#38bdf8' : '#94a3b8'
              }}
            >
              Atas
            </button>
          </div>
        </div>
      </div>

      {/* Benchmark & Telemetry Details Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          padding: '16px',
          backgroundColor: '#0f172a',
          borderRadius: '10px',
          border: '1px solid #1e293b',
          color: '#e2e8f0',
          fontSize: '13px'
        }}
      >
        <div>
          <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
            GPU Hardware
          </div>
          <div style={{ fontWeight: 600, color: '#38bdf8' }}>{metrics?.gpuRenderer || 'Memeriksa...'}</div>
        </div>

        <div>
          <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
            FPS & Waktu Muat
          </div>
          <div style={{ fontWeight: 600 }}>
            <span style={{ color: (metrics?.fps ?? 0) >= 50 ? '#4ade80' : '#facc15' }}>{metrics?.fps ?? 0} FPS</span> ·{' '}
            {metrics?.loadTimeMs ?? 0} ms load
          </div>
        </div>

        <div>
          <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Draw Calls & Geometri
          </div>
          <div style={{ fontWeight: 600 }}>
            {metrics?.drawCalls ?? 0} DC · {metrics?.triangles.toLocaleString() ?? 0} triangles
          </div>
        </div>

        <div>
          <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Resolusi & DPR
          </div>
          <div style={{ fontWeight: 600 }}>
            {metrics?.resolution ?? '-'} (DPR: {metrics?.dpr ?? 1})
          </div>
        </div>

        <div>
          <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Sumber Lisensi Aset
          </div>
          <div style={{ fontWeight: 500, color: '#a7f3d0' }}>
            First-party Three.js Standard Primitives (MIT/CC0, 0 KB Network Payload)
          </div>
        </div>

        <div>
          <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Kriteria Selesai T04
          </div>
          <div style={{ fontWeight: 500, color: '#fef08a' }}>
            Proporsi dewasa, walk/sit/idle, baseline performa & visual bounds tercatat
          </div>
        </div>
      </div>
    </div>
  );
}
