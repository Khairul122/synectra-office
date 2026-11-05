import * as THREE from 'three';

export class OfficeRoom {
  public readonly group: THREE.Group;
  private disposables: { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Office_Room_Scene';
    this.buildRoom();
  }

  private track<T extends THREE.Mesh | THREE.LineSegments>(mesh: T): T {
    if (mesh.geometry) {
      this.disposables.push({ geometry: mesh.geometry, material: mesh.material });
    }
    return mesh;
  }

  private buildRoom() {
    // 1. Walnut Wood Floor (5m x 4.5m)
    const floorGeom = new THREE.BoxGeometry(5.0, 0.15, 4.5);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x543825, // Rich walnut wood
      roughness: 0.45,
      metalness: 0.05
    });
    const floor = this.track(new THREE.Mesh(floorGeom, floorMat));
    floor.position.set(0, -0.075, 0);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Floor edge trim / base slab
    const floorBaseGeom = new THREE.BoxGeometry(5.1, 0.1, 4.6);
    const floorBaseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const floorBase = this.track(new THREE.Mesh(floorBaseGeom, floorBaseMat));
    floorBase.position.set(0, -0.15, 0);
    this.group.add(floorBase);

    // 2. Back Wall (Z = -2.25)
    const backWallGeom = new THREE.BoxGeometry(5.0, 2.6, 0.15);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e2638, // Modern deep slate blue-grey
      roughness: 0.85
    });
    const backWall = this.track(new THREE.Mesh(backWallGeom, wallMat));
    backWall.position.set(0, 1.3, -2.25);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // Back wall acoustic slats / accent panel
    const accentPanelGeom = new THREE.BoxGeometry(2.4, 2.0, 0.04);
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x2b384e,
      roughness: 0.6
    });
    const accentPanel = this.track(new THREE.Mesh(accentPanelGeom, accentMat));
    accentPanel.position.set(0.5, 1.4, -2.16);
    accentPanel.receiveShadow = true;
    this.group.add(accentPanel);

    // 3. Left Wall (X = -2.5) with Glass Partition
    const leftSolidWallGeom = new THREE.BoxGeometry(0.15, 2.6, 1.5);
    const leftSolidWall = this.track(new THREE.Mesh(leftSolidWallGeom, wallMat));
    leftSolidWall.position.set(-2.5, 1.3, -1.5);
    leftSolidWall.receiveShadow = true;
    this.group.add(leftSolidWall);

    // Glass partition frame
    const glassFrameGeom = new THREE.BoxGeometry(0.12, 2.4, 2.6);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
    const glassFrame = this.track(new THREE.Mesh(glassFrameGeom, frameMat));
    glassFrame.position.set(-2.5, 1.2, 0.7);
    this.group.add(glassFrame);

    // Translucent glass pane
    const glassGeom = new THREE.BoxGeometry(0.04, 2.3, 2.5);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.8,
      ior: 1.5
    });
    const glassPane = this.track(new THREE.Mesh(glassGeom, glassMat));
    glassPane.position.set(-2.5, 1.2, 0.7);
    this.group.add(glassPane);

    // 4. Modern Workstation Desk
    // Desk top (X=0.7, Y=0.74, Z=-0.8)
    const deskTopGeom = new THREE.BoxGeometry(1.6, 0.06, 0.8);
    const deskTopMat = new THREE.MeshStandardMaterial({
      color: 0x2a1d17, // Dark walnut veneer
      roughness: 0.4
    });
    const deskTop = this.track(new THREE.Mesh(deskTopGeom, deskTopMat));
    deskTop.position.set(0.7, 0.74, -0.8);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    this.group.add(deskTop);

    // Desk steel frame & legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3, metalness: 0.85 });
    const legGeom = new THREE.BoxGeometry(0.06, 0.74, 0.74);

    const leftLeg = this.track(new THREE.Mesh(legGeom, legMat));
    leftLeg.position.set(0.0, 0.37, -0.8);
    leftLeg.castShadow = true;
    this.group.add(leftLeg);

    const rightLeg = this.track(new THREE.Mesh(legGeom, legMat));
    rightLeg.position.set(1.4, 0.37, -0.8);
    rightLeg.castShadow = true;
    this.group.add(rightLeg);

    // 5. Ergonomic Office Desk Chair (at X=0.7, Z=-0.38)
    const chairGroup = new THREE.Group();
    chairGroup.position.set(0.7, 0, -0.38);

    const chairMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.9 });

    // Seat cushion
    const seatGeom = new THREE.BoxGeometry(0.48, 0.08, 0.46);
    const seat = this.track(new THREE.Mesh(seatGeom, chairMat));
    seat.position.set(0, 0.48, 0);
    seat.castShadow = true;
    chairGroup.add(seat);

    // Backrest
    const backrestGeom = new THREE.BoxGeometry(0.44, 0.52, 0.06);
    const backrest = this.track(new THREE.Mesh(backrestGeom, chairMat));
    backrest.position.set(0, 0.76, 0.22);
    backrest.castShadow = true;
    chairGroup.add(backrest);

    // Armrests
    const armGeom = new THREE.BoxGeometry(0.05, 0.22, 0.26);
    const leftArm = this.track(new THREE.Mesh(armGeom, chairMat));
    leftArm.position.set(0.24, 0.60, 0.04);
    chairGroup.add(leftArm);

    const rightArm = this.track(new THREE.Mesh(armGeom, chairMat));
    rightArm.position.set(-0.24, 0.60, 0.04);
    chairGroup.add(rightArm);

    // Center post & 5-star base
    const postGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.42, 12);
    const post = this.track(new THREE.Mesh(postGeom, chromeMat));
    post.position.set(0, 0.24, 0);
    chairGroup.add(post);

    const baseGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 5);
    const base = this.track(new THREE.Mesh(baseGeom, chromeMat));
    base.position.set(0, 0.04, 0);
    base.castShadow = true;
    chairGroup.add(base);

    this.group.add(chairGroup);

    // 6. Computer & Monitor setup
    // Ultrawide screen (X=0.7, Y=1.05, Z=-0.95)
    const monitorFrameGeom = new THREE.BoxGeometry(0.85, 0.38, 0.03);
    const monitorFrame = this.track(new THREE.Mesh(monitorFrameGeom, legMat));
    monitorFrame.position.set(0.7, 1.05, -0.95);
    monitorFrame.castShadow = true;
    this.group.add(monitorFrame);

    // Glowing display screen showing code / invoice preview
    const screenGeom = new THREE.PlaneGeometry(0.81, 0.34);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9 // Soft cyan-blue workstation glow
    });
    const screen = this.track(new THREE.Mesh(screenGeom, screenMat));
    screen.position.set(0.7, 1.05, -0.93);
    this.group.add(screen);

    // Monitor stand
    const standGeom = new THREE.BoxGeometry(0.08, 0.26, 0.08);
    const stand = this.track(new THREE.Mesh(standGeom, legMat));
    stand.position.set(0.7, 0.88, -0.95);
    this.group.add(stand);

    // Keyboard & Mouse pad
    const kbGeom = new THREE.BoxGeometry(0.40, 0.015, 0.14);
    const kb = this.track(new THREE.Mesh(kbGeom, legMat));
    kb.position.set(0.7, 0.78, -0.68);
    this.group.add(kb);

    // 7. Potted Indoor Plant (Ficus / Monstera)
    const plantGroup = new THREE.Group();
    plantGroup.position.set(-1.8, 0, -1.5);

    const potGeom = new THREE.CylinderGeometry(0.22, 0.16, 0.42, 16);
    const potMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 }); // White matte ceramic
    const pot = this.track(new THREE.Mesh(potGeom, potMat));
    pot.position.set(0, 0.21, 0);
    pot.castShadow = true;
    plantGroup.add(pot);

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x166534, // Natural deep leaf green
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    const leafGeom = new THREE.SphereGeometry(0.26, 8, 8);
    leafGeom.scale(1.2, 0.35, 1.4);

    for (let i = 0; i < 4; i++) {
      const leaf = this.track(new THREE.Mesh(leafGeom, leafMat));
      const angle = (i * Math.PI) / 2;
      leaf.position.set(Math.cos(angle) * 0.18, 0.48 + i * 0.12, Math.sin(angle) * 0.18);
      leaf.rotation.set(0.35 * Math.sin(angle), angle, 0.35 * Math.cos(angle));
      leaf.castShadow = true;
      plantGroup.add(leaf);
    }
    this.group.add(plantGroup);

    // 8. Overhead Pendant Light Fixture
    const pendantGroup = new THREE.Group();
    pendantGroup.position.set(0.7, 2.35, -0.8);

    const shadeGeom = new THREE.ConeGeometry(0.18, 0.15, 16, 1, true);
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
    const shade = this.track(new THREE.Mesh(shadeGeom, shadeMat));
    shade.position.set(0, -0.05, 0);
    pendantGroup.add(shade);

    const bulbGeom = new THREE.SphereGeometry(0.05, 12, 12);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffedd5 });
    const bulb = this.track(new THREE.Mesh(bulbGeom, bulbMat));
    bulb.position.set(0, -0.09, 0);
    pendantGroup.add(bulb);

    this.group.add(pendantGroup);

    // 9. Document Paper Stack (Nota Synectra mockup)
    const paperGeom = new THREE.BoxGeometry(0.21, 0.02, 0.30);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
    const paper = this.track(new THREE.Mesh(paperGeom, paperMat));
    paper.position.set(1.2, 0.78, -0.7);
    paper.rotation.y = 0.15;
    paper.castShadow = true;
    this.group.add(paper);
  }

  public dispose() {
    for (const item of this.disposables) {
      if (item.geometry) item.geometry.dispose();
      if (item.material) {
        if (Array.isArray(item.material)) {
          item.material.forEach((m) => m.dispose());
        } else {
          item.material.dispose();
        }
      }
    }
  }
}
