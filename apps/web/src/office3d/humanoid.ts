import * as THREE from 'three';
import type { AnimationState } from './types';

export class HumanoidCharacter {
  public readonly root: THREE.Group;

  // Joint pivot groups
  private pelvisPivot: THREE.Group;
  private torsoPivot: THREE.Group;
  private neckPivot: THREE.Group;
  private headPivot: THREE.Group;

  private leftShoulder: THREE.Group;
  private leftElbow: THREE.Group;
  private rightShoulder: THREE.Group;
  private rightElbow: THREE.Group;

  private leftHip: THREE.Group;
  private leftKnee: THREE.Group;
  private rightHip: THREE.Group;
  private rightKnee: THREE.Group;

  // Materials
  private skinMaterial: THREE.MeshStandardMaterial;
  private shirtMaterial: THREE.MeshStandardMaterial;
  private pantsMaterial: THREE.MeshStandardMaterial;
  private shoeMaterial: THREE.MeshStandardMaterial;
  private hairMaterial: THREE.MeshStandardMaterial;

  // Animation cycle & blending state
  private walkTime = 0;
  private idleTime = 0;
  private currentState: AnimationState = 'idle';

  // Target positions for walking path
  private walkDirection = 1;
  private currentPos = new THREE.Vector3(0, 0, 0);
  private standPos = new THREE.Vector3(-0.8, 0, 0.5);
  private sitChairPos = new THREE.Vector3(0.7, 0, -0.4);

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Humanoid_Character';

    // Materials with professional smart-casual palette
    this.skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd49b72, // Warm Indonesian skin tone
      roughness: 0.65,
      metalness: 0.05
    });

    this.shirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, // Smart casual light-blue oxford shirt
      roughness: 0.7,
      metalness: 0.1
    });

    this.pantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Slate charcoal trousers
      roughness: 0.8,
      metalness: 0.1
    });

    this.shoeMaterial = new THREE.MeshStandardMaterial({
      color: 0x271c19, // Dark leather shoes
      roughness: 0.5,
      metalness: 0.2
    });

    this.hairMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1615, // Dark brown / black hair
      roughness: 0.85,
      metalness: 0.05
    });

    // Build hierarchical skeleton rig
    // Root sits on floor y=0. Pelvis at ~y=0.90m.
    this.pelvisPivot = new THREE.Group();
    this.pelvisPivot.position.set(0, 0.90, 0);
    this.root.add(this.pelvisPivot);

    // Pelvis mesh
    const pelvisGeom = new THREE.BoxGeometry(0.30, 0.16, 0.20);
    const pelvisMesh = new THREE.Mesh(pelvisGeom, this.pantsMaterial);
    pelvisMesh.castShadow = true;
    pelvisMesh.receiveShadow = true;
    this.pelvisPivot.add(pelvisMesh);

    // Torso / Spine
    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.set(0, 0.08, 0);
    this.pelvisPivot.add(this.torsoPivot);

    const torsoGeom = new THREE.BoxGeometry(0.36, 0.42, 0.22);
    const torsoMesh = new THREE.Mesh(torsoGeom, this.shirtMaterial);
    torsoMesh.position.set(0, 0.21, 0);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    this.torsoPivot.add(torsoMesh);

    // Neck & Head
    this.neckPivot = new THREE.Group();
    this.neckPivot.position.set(0, 0.42, 0);
    this.torsoPivot.add(this.neckPivot);

    const neckGeom = new THREE.CylinderGeometry(0.06, 0.07, 0.08, 12);
    const neckMesh = new THREE.Mesh(neckGeom, this.skinMaterial);
    neckMesh.position.set(0, 0.04, 0);
    neckMesh.castShadow = true;
    this.neckPivot.add(neckMesh);

    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.08, 0);
    this.neckPivot.add(this.headPivot);

    const headGeom = new THREE.BoxGeometry(0.20, 0.24, 0.20);
    const headMesh = new THREE.Mesh(headGeom, this.skinMaterial);
    headMesh.position.set(0, 0.12, 0);
    headMesh.castShadow = true;
    this.headPivot.add(headMesh);

    // Hair
    const hairGeom = new THREE.BoxGeometry(0.22, 0.10, 0.22);
    const hairMesh = new THREE.Mesh(hairGeom, this.hairMaterial);
    hairMesh.position.set(0, 0.20, -0.01);
    hairMesh.castShadow = true;
    this.headPivot.add(hairMesh);

    // Left Arm (Shoulder -> Elbow -> Hand)
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(0.22, 0.38, 0);
    this.torsoPivot.add(this.leftShoulder);

    const upperArmGeom = new THREE.BoxGeometry(0.10, 0.26, 0.10);
    const leftUpperArmMesh = new THREE.Mesh(upperArmGeom, this.shirtMaterial);
    leftUpperArmMesh.position.set(0, -0.13, 0);
    leftUpperArmMesh.castShadow = true;
    this.leftShoulder.add(leftUpperArmMesh);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.set(0, -0.26, 0);
    this.leftShoulder.add(this.leftElbow);

    const forearmGeom = new THREE.BoxGeometry(0.08, 0.24, 0.08);
    const leftForearmMesh = new THREE.Mesh(forearmGeom, this.skinMaterial);
    leftForearmMesh.position.set(0, -0.12, 0);
    leftForearmMesh.castShadow = true;
    this.leftElbow.add(leftForearmMesh);

    const handGeom = new THREE.BoxGeometry(0.07, 0.10, 0.06);
    const leftHandMesh = new THREE.Mesh(handGeom, this.skinMaterial);
    leftHandMesh.position.set(0, -0.27, 0);
    leftHandMesh.castShadow = true;
    this.leftElbow.add(leftHandMesh);

    // Right Arm (Shoulder -> Elbow -> Hand)
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(-0.22, 0.38, 0);
    this.torsoPivot.add(this.rightShoulder);

    const rightUpperArmMesh = new THREE.Mesh(upperArmGeom, this.shirtMaterial);
    rightUpperArmMesh.position.set(0, -0.13, 0);
    rightUpperArmMesh.castShadow = true;
    this.rightShoulder.add(rightUpperArmMesh);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.set(0, -0.26, 0);
    this.rightShoulder.add(this.rightElbow);

    const rightForearmMesh = new THREE.Mesh(forearmGeom, this.skinMaterial);
    rightForearmMesh.position.set(0, -0.12, 0);
    rightForearmMesh.castShadow = true;
    this.rightElbow.add(rightForearmMesh);

    const rightHandMesh = new THREE.Mesh(handGeom, this.skinMaterial);
    rightHandMesh.position.set(0, -0.27, 0);
    rightHandMesh.castShadow = true;
    this.rightElbow.add(rightHandMesh);

    // Left Leg (Hip -> Knee -> Foot)
    this.leftHip = new THREE.Group();
    this.leftHip.position.set(0.10, -0.08, 0);
    this.pelvisPivot.add(this.leftHip);

    const thighGeom = new THREE.BoxGeometry(0.12, 0.40, 0.13);
    const leftThighMesh = new THREE.Mesh(thighGeom, this.pantsMaterial);
    leftThighMesh.position.set(0, -0.20, 0);
    leftThighMesh.castShadow = true;
    leftThighMesh.receiveShadow = true;
    this.leftHip.add(leftThighMesh);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.set(0, -0.40, 0);
    this.leftHip.add(this.leftKnee);

    const shinGeom = new THREE.BoxGeometry(0.10, 0.38, 0.11);
    const leftShinMesh = new THREE.Mesh(shinGeom, this.pantsMaterial);
    leftShinMesh.position.set(0, -0.19, 0);
    leftShinMesh.castShadow = true;
    leftShinMesh.receiveShadow = true;
    this.leftKnee.add(leftShinMesh);

    const footGeom = new THREE.BoxGeometry(0.10, 0.08, 0.20);
    const leftFootMesh = new THREE.Mesh(footGeom, this.shoeMaterial);
    leftFootMesh.position.set(0, -0.38, 0.05);
    leftFootMesh.castShadow = true;
    leftFootMesh.receiveShadow = true;
    this.leftKnee.add(leftFootMesh);

    // Right Leg (Hip -> Knee -> Foot)
    this.rightHip = new THREE.Group();
    this.rightHip.position.set(-0.10, -0.08, 0);
    this.pelvisPivot.add(this.rightHip);

    const rightThighMesh = new THREE.Mesh(thighGeom, this.pantsMaterial);
    rightThighMesh.position.set(0, -0.20, 0);
    rightThighMesh.castShadow = true;
    rightThighMesh.receiveShadow = true;
    this.rightHip.add(rightThighMesh);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.set(0, -0.40, 0);
    this.rightHip.add(this.rightKnee);

    const rightShinMesh = new THREE.Mesh(shinGeom, this.pantsMaterial);
    rightShinMesh.position.set(0, -0.19, 0);
    rightShinMesh.castShadow = true;
    rightShinMesh.receiveShadow = true;
    this.rightKnee.add(rightShinMesh);

    const rightFootMesh = new THREE.Mesh(footGeom, this.shoeMaterial);
    rightFootMesh.position.set(0, -0.38, 0.05);
    rightFootMesh.castShadow = true;
    rightFootMesh.receiveShadow = true;
    this.rightKnee.add(rightFootMesh);

    // Initial position
    this.currentPos.copy(this.standPos);
    this.root.position.copy(this.currentPos);
  }

  public setState(state: AnimationState) {
    this.currentState = state;
  }

  public getState(): AnimationState {
    return this.currentState;
  }

  public update(delta: number) {
    const dt = Math.min(delta, 0.1);
    const lerpFactor = 1 - Math.exp(-8 * dt);

    if (this.currentState === 'walk') {
      this.walkTime += dt * 6.5; // Natural stride cadence

      // Walk cycle calculations
      const legStride = Math.sin(this.walkTime);
      const counterLegStride = -legStride;

      // Leg swings
      const targetLeftHipX = legStride * 0.55;
      const targetRightHipX = counterLegStride * 0.55;

      // Knees bend during backswing
      const targetLeftKneeX = legStride < 0 ? Math.abs(legStride) * 0.8 : 0.05;
      const targetRightKneeX = counterLegStride < 0 ? Math.abs(counterLegStride) * 0.8 : 0.05;

      // Opposite arm swings
      const targetLeftArmX = -legStride * 0.45;
      const targetRightArmX = legStride * 0.45;

      // Slight natural elbow flexion
      const targetLeftElbowX = 0.25 + Math.max(0, -legStride * 0.3);
      const targetRightElbowX = 0.25 + Math.max(0, legStride * 0.3);

      // Pelvis vertical bounce and subtle yaw
      const targetPelvisY = 0.90 + Math.abs(Math.sin(this.walkTime * 2)) * 0.035;
      const targetPelvisZRot = Math.sin(this.walkTime) * 0.04;
      const targetTorsoYRot = -Math.sin(this.walkTime) * 0.08;

      // Move along patrol path
      const speed = 1.2 * dt;
      this.currentPos.x += this.walkDirection * speed;
      if (this.currentPos.x > 0.4) {
        this.walkDirection = -1;
      } else if (this.currentPos.x < -1.4) {
        this.walkDirection = 1;
      }

      // Smooth body rotation towards walk direction
      const targetFacing = this.walkDirection > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, targetFacing, lerpFactor);

      // Apply lerped rotations
      this.leftHip.rotation.x = THREE.MathUtils.lerp(this.leftHip.rotation.x, targetLeftHipX, lerpFactor);
      this.rightHip.rotation.x = THREE.MathUtils.lerp(this.rightHip.rotation.x, targetRightHipX, lerpFactor);
      this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, targetLeftKneeX, lerpFactor);
      this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, targetRightKneeX, lerpFactor);

      this.leftShoulder.rotation.x = THREE.MathUtils.lerp(this.leftShoulder.rotation.x, targetLeftArmX, lerpFactor);
      this.rightShoulder.rotation.x = THREE.MathUtils.lerp(this.rightShoulder.rotation.x, targetRightArmX, lerpFactor);
      this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, targetLeftElbowX, lerpFactor);
      this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, targetRightElbowX, lerpFactor);

      this.pelvisPivot.position.y = THREE.MathUtils.lerp(this.pelvisPivot.position.y, targetPelvisY, lerpFactor);
      this.pelvisPivot.rotation.z = THREE.MathUtils.lerp(this.pelvisPivot.rotation.z, targetPelvisZRot, lerpFactor);
      this.torsoPivot.rotation.y = THREE.MathUtils.lerp(this.torsoPivot.rotation.y, targetTorsoYRot, lerpFactor);

      this.root.position.copy(this.currentPos);
    } else if (this.currentState === 'sit') {
      this.idleTime += dt;

      // Character sits at desk chair
      const targetPos = this.sitChairPos;
      this.currentPos.lerp(targetPos, lerpFactor);
      this.root.position.copy(this.currentPos);

      // Facing desk (towards -Z / desk direction)
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, Math.PI, lerpFactor);

      // Lower pelvis to seat height ~0.55m
      const targetPelvisY = 0.58;
      this.pelvisPivot.position.y = THREE.MathUtils.lerp(this.pelvisPivot.position.y, targetPelvisY, lerpFactor);
      this.pelvisPivot.rotation.set(0, 0, 0);

      // Thighs rotated 90 deg forward (-PI/2)
      this.leftHip.rotation.x = THREE.MathUtils.lerp(this.leftHip.rotation.x, -Math.PI / 2 + 0.05, lerpFactor);
      this.rightHip.rotation.x = THREE.MathUtils.lerp(this.rightHip.rotation.x, -Math.PI / 2 + 0.05, lerpFactor);

      // Shins bent 90 deg downward (+PI/2)
      this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, Math.PI / 2, lerpFactor);
      this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, Math.PI / 2, lerpFactor);

      // Arms resting on desk / keyboard position
      this.leftShoulder.rotation.x = THREE.MathUtils.lerp(this.leftShoulder.rotation.x, -0.65, lerpFactor);
      this.rightShoulder.rotation.x = THREE.MathUtils.lerp(this.rightShoulder.rotation.x, -0.65, lerpFactor);
      this.leftShoulder.rotation.z = THREE.MathUtils.lerp(this.leftShoulder.rotation.z, 0.20, lerpFactor);
      this.rightShoulder.rotation.z = THREE.MathUtils.lerp(this.rightShoulder.rotation.z, -0.20, lerpFactor);

      this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, 0.85, lerpFactor);
      this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, 0.85, lerpFactor);

      // Subtle breathing on torso while seated
      const breath = Math.sin(this.idleTime * 2.0) * 0.015;
      this.torsoPivot.rotation.x = THREE.MathUtils.lerp(this.torsoPivot.rotation.x, breath, lerpFactor);
      this.torsoPivot.rotation.y = THREE.MathUtils.lerp(this.torsoPivot.rotation.y, 0, lerpFactor);
    } else {
      // Idle state
      this.idleTime += dt;

      // Stand position
      this.currentPos.lerp(this.standPos, lerpFactor);
      this.root.position.copy(this.currentPos);

      // Face isometric camera slightly
      const targetFacing = Math.PI * 0.25;
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, targetFacing, lerpFactor);

      // Reset standing pelvis height
      this.pelvisPivot.position.y = THREE.MathUtils.lerp(this.pelvisPivot.position.y, 0.90, lerpFactor);
      this.pelvisPivot.rotation.set(0, 0, 0);

      // Straight legs with slight natural stand stance
      this.leftHip.rotation.set(0, 0, 0);
      this.rightHip.rotation.set(0, 0, 0);
      this.leftKnee.rotation.set(0, 0, 0);
      this.rightKnee.rotation.set(0, 0, 0);

      // Arms at sides with gentle breathing swing
      const breath = Math.sin(this.idleTime * 2.2);
      this.leftShoulder.rotation.x = THREE.MathUtils.lerp(this.leftShoulder.rotation.x, 0.08 + breath * 0.02, lerpFactor);
      this.rightShoulder.rotation.x = THREE.MathUtils.lerp(this.rightShoulder.rotation.x, 0.08 + breath * 0.02, lerpFactor);
      this.leftShoulder.rotation.z = THREE.MathUtils.lerp(this.leftShoulder.rotation.z, 0.06, lerpFactor);
      this.rightShoulder.rotation.z = THREE.MathUtils.lerp(this.rightShoulder.rotation.z, -0.06, lerpFactor);

      this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, 0.12, lerpFactor);
      this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, 0.12, lerpFactor);

      this.torsoPivot.rotation.x = THREE.MathUtils.lerp(this.torsoPivot.rotation.x, breath * 0.02, lerpFactor);
      this.torsoPivot.rotation.y = THREE.MathUtils.lerp(this.torsoPivot.rotation.y, 0, lerpFactor);
    }
  }

  public dispose() {
    this.skinMaterial.dispose();
    this.shirtMaterial.dispose();
    this.pantsMaterial.dispose();
    this.shoeMaterial.dispose();
    this.hairMaterial.dispose();
  }
}
