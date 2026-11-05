import * as THREE from 'three';
import { HumanoidCharacter } from './humanoid';
import { OfficeRoom } from './room';
import type { AnimationState, PerformanceMetrics } from './types';

export class OfficeSceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private humanoid: HumanoidCharacter;
  private room: OfficeRoom;

  private isRunning = false;
  private animFrameId: number | null = null;
  private lastTime = 0;
  private startTime = 0;
  private frameCount = 0;
  private fpsAccumulator = 0;
  private currentFps = 60;
  private loadTimeMs = 0;

  private frustumSize = 4.8;
  private onMetrics?: (metrics: PerformanceMetrics) => void;
  private gpuRendererName = 'Detecting GPU...';

  constructor(container: HTMLElement, onMetrics?: (metrics: PerformanceMetrics) => void) {
    this.container = container;
    this.onMetrics = onMetrics;
    this.startTime = performance.now();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f19); // Midnight navy

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // Detect GPU
    this.detectGPU();

    // Camera: True Isometric Orthographic
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumSize * aspect) / 2,
      (this.frustumSize * aspect) / 2,
      this.frustumSize / 2,
      -this.frustumSize / 2,
      0.1,
      100
    );
    this.setCameraPreset('iso');

    // Lights
    this.setupLights();

    // Room & Humanoid
    this.room = new OfficeRoom();
    this.scene.add(this.room.group);

    this.humanoid = new HumanoidCharacter();
    this.scene.add(this.humanoid.root);

    // Initial load benchmark
    this.loadTimeMs = Math.round(performance.now() - this.startTime);

    // Listeners
    window.addEventListener('resize', this.onResize);

    // Start loop
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animate();
  }

  private detectGPU() {
    try {
      const gl = this.renderer.getContext();
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        this.gpuRendererName = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'WebGL Default';
      } else {
        this.gpuRendererName = 'WebGL Standard';
      }
    } catch {
      this.gpuRendererName = 'Hardware WebGL';
    }
  }

  private setupLights() {
    // 1. Warm key light casting shadows (sunlight at 45°)
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    keyLight.position.set(6, 9, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // 2. Ambient fill light
    const ambientLight = new THREE.AmbientLight(0x334155, 0.85);
    this.scene.add(ambientLight);

    // 3. Desk pendant point light (warm localized glow)
    const deskPendantLight = new THREE.PointLight(0xfbbf24, 2.2, 4.5);
    deskPendantLight.position.set(0.7, 2.25, -0.8);
    deskPendantLight.castShadow = true;
    deskPendantLight.shadow.bias = -0.001;
    this.scene.add(deskPendantLight);

    // 4. Cool rim light from back-left
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.45);
    rimLight.position.set(-6, 5, -6);
    this.scene.add(rimLight);
  }

  public setAnimationState(state: AnimationState) {
    this.humanoid.setState(state);
  }

  public getAnimationState(): AnimationState {
    return this.humanoid.getState();
  }

  public setCameraPreset(preset: 'iso' | 'front' | 'top') {
    if (preset === 'iso') {
      this.camera.position.set(6.8, 6.2, 6.8);
      this.camera.lookAt(0, 0.65, 0);
    } else if (preset === 'front') {
      this.camera.position.set(0, 2.2, 8.5);
      this.camera.lookAt(0, 0.7, 0);
    } else if (preset === 'top') {
      this.camera.position.set(0, 9.5, 0.001);
      this.camera.lookAt(0, 0, 0);
    }
  }

  private onResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;
    this.camera.left = (-this.frustumSize * aspect) / 2;
    this.camera.right = (this.frustumSize * aspect) / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  };

  private animate = () => {
    if (!this.isRunning) return;

    this.animFrameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Update humanoid kinematics
    this.humanoid.update(delta);

    // Render frame
    this.renderer.render(this.scene, this.camera);

    // Telemetry calculations
    this.frameCount++;
    this.fpsAccumulator += delta;

    if (this.fpsAccumulator >= 0.5) {
      this.currentFps = Math.round((this.frameCount / this.fpsAccumulator));
      this.frameCount = 0;
      this.fpsAccumulator = 0;

      if (this.onMetrics) {
        const info = this.renderer.info;
        this.onMetrics({
          fps: this.currentFps,
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          resolution: `${this.container.clientWidth}x${this.container.clientHeight}`,
          dpr: Number(this.renderer.getPixelRatio().toFixed(2)),
          gpuRenderer: this.gpuRendererName,
          loadTimeMs: this.loadTimeMs
        });
      }
    }
  };

  public dispose() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    window.removeEventListener('resize', this.onResize);

    this.humanoid.dispose();
    this.room.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
