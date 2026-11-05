export type AnimationState = 'idle' | 'walk' | 'sit';

export interface PerformanceMetrics {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  resolution: string;
  dpr: number;
  gpuRenderer: string;
  loadTimeMs: number;
}

export interface CameraPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}
