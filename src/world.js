import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createGroundTexture, createLabelTexture, createToonGradientMap } from './gridTexture.js';
import { content } from './content.js';
import { EngineAudio } from './audio.js';

const GROUND_SIZE = 140;

const KIOSKS = [
  { key: 'about', label: 'About', position: [-18, 0, -14], accent: '#7bf0d2' },
  { key: 'projects', label: 'Projects', position: [20, 0, -8], accent: '#ffb86b' },
  { key: 'contact', label: 'Contact', position: [0, 0, 24], accent: '#ff8bd0' },
];

const INTERACT_RADIUS = 6;

export class World {
  constructor(canvas, { onPrompt, onInteract } = {}) {
    this.canvas = canvas;
    this.onPrompt = onPrompt ?? (() => {});
    this.onInteract = onInteract ?? (() => {});

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.keys = new Set();
    this.activeKiosk = null;
    this.visitedKiosks = new Set();
    this.audio = new EngineAudio();

    this._initThree();
    this._initPhysics();
    this._buildGround();
    this._buildCar();
    this._buildKiosks();
    this._buildScenery();
    this._bindInput();

    // Called from the "Click to start" handler, so this is within a user
    // gesture's call stack and the AudioContext is allowed to start running.
    this.audio.unlock();

    window.addEventListener('resize', () => this.resize());

    if (import.meta.env.DEV) window.__world = this;
  }

  _initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x150a1c, 0.016);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      300,
    );
    this.camera.position.set(0, 6, 10);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const hemi = new THREE.HemisphereLight(0xcbb9ff, 0x1b0e24, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1dc, 1.4);
    sun.position.set(30, 40, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);

    const fill = new THREE.PointLight(0x7bf0d2, 0.6, 40);
    fill.position.set(-10, 8, -10);
    this.scene.add(fill);

    this.toonGradientMap = createToonGradientMap();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.4, // strength
      0.4, // radius
      0.8, // threshold — only bright/emissive surfaces bloom
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  _initPhysics() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.3;

    this.groundMaterial = new CANNON.Material('ground');
    this.wheelMaterial = new CANNON.Material('wheel');

    const wheelGroundContact = new CANNON.ContactMaterial(this.groundMaterial, this.wheelMaterial, {
      friction: 0.4,
      restitution: 0,
      contactEquationStiffness: 1000,
    });
    this.world.addContactMaterial(wheelGroundContact);

    const groundBody = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
  }

  _buildGround() {
    const texture = createGroundTexture();
    const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildCar() {
    // --- physics chassis ---
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.4, 2));
    const chassisBody = new CANNON.Body({ mass: 150 });
    chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.3, 0));
    chassisBody.position.set(0, 1.2, 6);

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const wheelOptions = {
      radius: 0.4,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 45,
      suspensionRestLength: 0.4,
      frictionSlip: 2.2,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 100000,
      rollInfluence: 0.01,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 1),
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    const positions = [
      [-0.85, 0, 1.3],
      [0.85, 0, 1.3],
      [-0.85, 0, -1.3],
      [0.85, 0, -1.3],
    ];
    positions.forEach(([x, y, z]) => {
      wheelOptions.chassisConnectionPointLocal.set(x, y, z);
      this.vehicle.addWheel({ ...wheelOptions });
    });
    this.vehicle.addToWorld(this.world);

    // --- visual chassis ---
    // Built from primitives, but layered (tapered hood, angled windshield,
    // lights, mirrors, rims) rather than a couple of flat boxes, to read as
    // an actual toy-car silhouette instead of a placeholder block.
    const carGroup = new THREE.Group();
    const bodyMat = new THREE.MeshToonMaterial({ color: 0x24d3b2, gradientMap: this.toonGradientMap });
    const cabinMat = new THREE.MeshToonMaterial({ color: 0x1b0e24, gradientMap: this.toonGradientMap });
    const trimMat = new THREE.MeshToonMaterial({ color: 0xffb86b, gradientMap: this.toonGradientMap });
    const glassMat = new THREE.MeshToonMaterial({ color: 0x9fd8ff, gradientMap: this.toonGradientMap, transparent: true, opacity: 0.75 });
    const headlightMat = new THREE.MeshToonMaterial({ color: 0xfff6c2, emissive: 0xfff6c2, emissiveIntensity: 0.6, gradientMap: this.toonGradientMap });
    const taillightMat = new THREE.MeshToonMaterial({ color: 0xff5566, emissive: 0xff5566, emissiveIntensity: 0.6, gradientMap: this.toonGradientMap });

    const addPart = (geometry, material, x, y, z, { rx = 0 } = {}) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      mesh.castShadow = true;
      carGroup.add(mesh);
      return mesh;
    };

    // Lower body: slightly tapered toward the front for a hood-like profile.
    const lowerGeo = new THREE.BoxGeometry(2, 0.55, 4);
    const lowerPos = lowerGeo.attributes.position;
    for (let i = 0; i < lowerPos.count; i += 1) {
      const z = lowerPos.getZ(i);
      const y = lowerPos.getY(i);
      if (y > 0 && z > 0.5) lowerPos.setY(i, y - 0.12); // front top edge dips down
    }
    lowerGeo.computeVertexNormals();
    addPart(lowerGeo, bodyMat, 0, 0.32, 0);

    // Cabin, set back from the hood, with a sloped windshield in front of it.
    addPart(new THREE.BoxGeometry(1.5, 0.55, 1.6), cabinMat, 0, 0.85, -0.4);
    addPart(new THREE.BoxGeometry(1.44, 0.6, 0.08), glassMat, 0, 0.85, 0.42, { rx: -0.35 });

    // Side mirrors.
    addPart(new THREE.BoxGeometry(0.1, 0.12, 0.2), bodyMat, 1.02, 0.78, 0.25);
    addPart(new THREE.BoxGeometry(0.1, 0.12, 0.2), bodyMat, -1.02, 0.78, 0.25);

    // Bumpers — capsules read as far less "dummy" than plain boxes.
    addPart(new THREE.CapsuleGeometry(0.16, 1.7, 4, 10), trimMat, 0, 0.2, 2, { rx: Math.PI / 2 });
    addPart(new THREE.CapsuleGeometry(0.16, 1.7, 4, 10), trimMat, 0, 0.2, -2, { rx: Math.PI / 2 });

    // Headlights / taillights.
    [-0.75, 0.75].forEach((x) => {
      addPart(new THREE.BoxGeometry(0.28, 0.16, 0.08), headlightMat, x, 0.35, 2.02);
      addPart(new THREE.BoxGeometry(0.28, 0.16, 0.08), taillightMat, x, 0.35, -2.02);
    });

    // Small roof spoiler for personality.
    addPart(new THREE.BoxGeometry(1.2, 0.08, 0.3), trimMat, 0, 1.18, -1.1);

    this.scene.add(carGroup);
    this.carGroup = carGroup;

    const wheelMat = new THREE.MeshToonMaterial({ color: 0x120a16, gradientMap: this.toonGradientMap });
    const rimMat = new THREE.MeshToonMaterial({ color: 0xd8d2e0, gradientMap: this.toonGradientMap });
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 16);
    wheelGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.34, 8);
    rimGeometry.rotateZ(Math.PI / 2);

    this.wheelMeshes = positions.map(() => {
      const wheelGroup = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeometry, wheelMat);
      tire.castShadow = true;
      wheelGroup.add(tire);
      const rim = new THREE.Mesh(rimGeometry, rimMat);
      wheelGroup.add(rim);
      this.scene.add(wheelGroup);
      return wheelGroup;
    });
  }

  _buildKiosks() {
    this.kioskGroups = KIOSKS.map((kiosk) => {
      const group = new THREE.Group();
      group.position.set(...kiosk.position);

      const padMat = new THREE.MeshToonMaterial({
        color: new THREE.Color(kiosk.accent),
        emissive: new THREE.Color(kiosk.accent),
        emissiveIntensity: 0.8,
        gradientMap: this.toonGradientMap,
      });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.2, 24), padMat);
      pad.position.y = 0.1;
      pad.receiveShadow = true;
      group.add(pad);

      const postMat = new THREE.MeshToonMaterial({ color: 0x3a2a48, gradientMap: this.toonGradientMap });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10), postMat);
      post.position.y = 1.4;
      post.castShadow = true;
      group.add(post);

      const labelTexture = createLabelTexture(kiosk.label, { accent: kiosk.accent });
      const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
      const label = new THREE.Sprite(labelMat);
      label.scale.set(4, 2, 1);
      label.position.y = 3.3;
      group.add(label);

      const beamMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(kiosk.accent),
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.6, 8, 16, 1, true), beamMat);
      beam.position.y = 4;
      group.add(beam);

      this.scene.add(group);
      return { ...kiosk, group };
    });
  }

  _buildScenery() {
    const trunkMat = new THREE.MeshToonMaterial({ color: 0x4a3350, gradientMap: this.toonGradientMap });
    const rockMat = new THREE.MeshToonMaterial({ color: 0x5c5468, flatShading: true, gradientMap: this.toonGradientMap });
    const leafPalette = [0xff9ecb, 0xffb86b, 0x7bf0d2];

    const randomSpot = () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 14 + Math.random() * 48;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    };

    const buildRoundTree = (leafMat) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.6, 6), trunkMat);
      trunk.position.y = 0.8;
      trunk.castShadow = true;
      tree.add(trunk);

      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + Math.random() * 0.6, 0), leafMat);
      leaves.position.y = 2.1;
      leaves.castShadow = true;
      tree.add(leaves);
      return tree;
    };

    // Pine variant: three stacked, shrinking cones for silhouette variety.
    const buildPineTree = (leafMat) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), trunkMat);
      trunk.position.y = 0.6;
      trunk.castShadow = true;
      tree.add(trunk);

      [0, 1, 2].forEach((tier) => {
        const radius = 1.15 - tier * 0.3;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.1, 7), leafMat);
        cone.position.y = 1.5 + tier * 0.75;
        cone.castShadow = true;
        tree.add(cone);
      });
      return tree;
    };

    for (let i = 0; i < 30; i += 1) {
      const [x, z] = randomSpot();
      const leafColor = leafPalette[Math.floor(Math.random() * leafPalette.length)];
      const leafMat = new THREE.MeshToonMaterial({ color: leafColor, flatShading: true, gradientMap: this.toonGradientMap });
      const tree = Math.random() < 0.55 ? buildRoundTree(leafMat) : buildPineTree(leafMat);
      tree.position.set(x, 0, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      tree.scale.setScalar(0.8 + Math.random() * 0.6);
      this.scene.add(tree);
    }

    // Low rock clusters scattered around for ground-level variety.
    for (let i = 0; i < 18; i += 1) {
      const [x, z] = randomSpot();
      const cluster = new THREE.Group();
      const rockCount = 1 + Math.floor(Math.random() * 3);
      for (let r = 0; r < rockCount; r += 1) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.3, 0), rockMat);
        rock.position.set((Math.random() - 0.5) * 0.6, 0.15, (Math.random() - 0.5) * 0.6);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        rock.receiveShadow = true;
        cluster.add(rock);
      }
      cluster.position.set(x, 0, z);
      this.scene.add(cluster);
    }
  }

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyE' && this.activeKiosk) this._openKiosk(this.activeKiosk);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  setTouchKey(code, pressed) {
    if (pressed) this.keys.add(code);
    else this.keys.delete(code);
  }

  triggerInteract() {
    if (this.activeKiosk) this._openKiosk(this.activeKiosk);
  }

  _openKiosk(kiosk) {
    if (!this.visitedKiosks.has(kiosk.key)) {
      this.visitedKiosks.add(kiosk.key);
      this.audio.playChime();
    }
    this.onInteract(kiosk.key, content[kiosk.key]);
  }

  _applyControls(delta) {
    // Engine force softly tapers off above topSpeed instead of being a hard
    // cap, and braking distinguishes "coasting" (light idle drag) from
    // "actively reversing direction" (a firm brake until the car has nearly
    // stopped, then reverse) — rather than one flat brake value for everything.
    const maxForce = 900;
    const maxSteer = 0.5;
    const topSpeedKmh = 55;
    const idleBrake = 3;
    const activeBrake = 22;

    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const backward = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');

    const throttle = (forward ? 1 : 0) - (backward ? 1 : 0);
    const speedKmh = this.vehicle.currentVehicleSpeedKmHour ?? 0;
    const movingForward = speedKmh > 0.5;
    const movingBackward = speedKmh < -0.5;
    const reversingDirection = (throttle > 0 && movingBackward) || (throttle < 0 && movingForward);

    const overspeed = Math.max(0, Math.abs(speedKmh) - topSpeedKmh);
    const taperedForce = (maxForce / (1 + overspeed * 0.15)) * throttle;

    let force = 0;
    let brake = idleBrake;
    if (reversingDirection) {
      brake = activeBrake;
    } else if (throttle !== 0) {
      force = -taperedForce; // chassis forward is local +z; invert for intuitive W=forward
      brake = 0;
    }

    let steer = 0;
    if (left) steer = maxSteer;
    if (right) steer = -maxSteer;

    this.vehicle.applyEngineForce(force, 2);
    this.vehicle.applyEngineForce(force, 3);
    this.vehicle.setSteeringValue(steer, 0);
    this.vehicle.setSteeringValue(steer, 1);
    for (let i = 0; i < 4; i += 1) this.vehicle.setBrake(brake, i);

    const lateralSlip = Math.min(Math.abs(steer) * (Math.abs(speedKmh) / 25), 1);
    this.audio.update({ speedKmh, throttle, slip: Math.max(lateralSlip, brake === activeBrake ? 0.6 : 0) });
  }

  _updateCarMeshes() {
    const chassis = this.vehicle.chassisBody;
    this.carGroup.position.copy(chassis.position);
    this.carGroup.quaternion.copy(chassis.quaternion);

    for (let i = 0; i < this.vehicle.wheelInfos.length; i += 1) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      this.wheelMeshes[i].position.copy(t.position);
      this.wheelMeshes[i].quaternion.copy(t.quaternion);
    }
  }

  _updateCamera(delta) {
    const chassis = this.vehicle.chassisBody;
    const carPos = new THREE.Vector3(chassis.position.x, chassis.position.y, chassis.position.z);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.carGroup.quaternion);

    const desired = carPos.clone().sub(forward.clone().multiplyScalar(7)).add(new THREE.Vector3(0, 3.5, 0));
    const lookTarget = carPos.clone().add(new THREE.Vector3(0, 1, 0));

    const lerpFactor = 1 - Math.pow(0.001, delta);
    this.camera.position.lerp(desired, lerpFactor);
    this._lookTarget = this._lookTarget ?? lookTarget.clone();
    this._lookTarget.lerp(lookTarget, lerpFactor);
    this.camera.lookAt(this._lookTarget);
  }

  _updateKioskProximity() {
    const carPos = this.vehicle.chassisBody.position;
    let nearest = null;
    let nearestDist = Infinity;

    for (const kiosk of this.kioskGroups) {
      const dx = carPos.x - kiosk.position[0];
      const dz = carPos.z - kiosk.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = kiosk;
      }
    }

    const inRange = nearest && nearestDist < INTERACT_RADIUS;
    this.activeKiosk = inRange ? nearest : null;
    this.onPrompt(inRange ? nearest.label : null);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    this._raf = requestAnimationFrame(() => this._tick());
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _tick() {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    this._applyControls(delta);
    this.world.step(1 / 60, delta, 5);
    this._updateCarMeshes();
    this._updateCamera(delta);
    this._updateKioskProximity();
    this.composer.render();
    this._raf = requestAnimationFrame(() => this._tick());
  }
}
