// Solmar Bay — pedestrians: box-built townsfolk who stroll the sidewalks,
// scatter when a crime happens nearby, and go down when hit.

const SKIN_TONES = [0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0];
const SHIRT_COLORS = [0xe2725b, 0x7fb069, 0x4e9bb5, 0xf2c14e, 0xbc6c9c, 0xe8e6df, 0x5b8e7d];

function buildPedestrianMesh(rand) {
  const group = new THREE.Group();
  const shirt = randomPick(rand, SHIRT_COLORS);
  const pants = randomPick(rand, [0x2b2f36, 0x3a4a6b, 0x6b4a3a, 0x4a4a4a]);
  const skin = randomPick(rand, SKIN_TONES);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const torsoMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const legGeo = new THREE.BoxGeometry(0.18, 0.8, 0.2);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.12, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.12, 0.4, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), torsoMat);
  torso.position.y = 1.14;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.66;
  const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.14);
  const armL = new THREE.Mesh(armGeo, torsoMat);
  armL.position.set(-0.36, 1.15, 0);
  const armR = new THREE.Mesh(armGeo, torsoMat);
  armR.position.set(0.36, 1.15, 0);
  group.add(legL, legR, torso, head, armL, armR);
  return { group, legL, legR, armL, armR };
}

class Pedestrian {
  constructor(scene, world, rand) {
    this.world = world;
    this.rand = rand;
    const built = buildPedestrianMesh(rand);
    this.mesh = built.group;
    this.legL = built.legL;
    this.legR = built.legR;
    this.armL = built.armL;
    this.armR = built.armR;
    const spot = world.randomSidewalkPoint();
    this.x = spot.x;
    this.z = spot.z;
    this.heading = rand() * Math.PI * 2;
    this.speed = PEDS.walkSpeed * randomRange(rand, 0.8, 1.3);
    this.health = 100;
    this.down = false;
    this.downTimer = 0;
    this.fleeing = false;
    this.walkPhase = rand() * 6;
    this._pickTarget();
    scene.add(this.mesh);
  }

  _pickTarget() {
    const spot = this.world.randomSidewalkPoint();
    this.targetX = spot.x;
    this.targetZ = spot.z;
  }

  // A crime at (x, z) makes this pedestrian run away from it.
  scare(x, z, radius) {
    if (this.down) return;
    if (distance2D(this.x, this.z, x, z) < radius) this.fleeing = true;
  }

  damage(amount) {
    if (this.down) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.down = true;
      this.downTimer = 8;
      this.mesh.rotation.z = Math.PI / 2;
      this.mesh.position.y = 0.3;
      return true;
    }
    this.fleeing = true;
    return false;
  }

  update(dt, threatX, threatZ, threatRadius) {
    if (this.down) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.down = false;
        this.health = 100;
        this.mesh.rotation.z = 0;
        this.mesh.position.y = 0;
        this.fleeing = true;
      }
      return;
    }
    if (threatX !== null && distance2D(this.x, this.z, threatX, threatZ) < threatRadius) this.fleeing = true;
    let speed = this.speed;
    let tx = this.targetX;
    let tz = this.targetZ;
    if (this.fleeing) {
      speed = PEDS.fleeSpeed;
      const away = Math.atan2(this.z - threatZ, this.x - threatX);
      tx = this.x + Math.cos(away) * 20;
      tz = this.z + Math.sin(away) * 20;
      if (threatX === null || distance2D(this.x, this.z, threatX, threatZ) > 30) this.fleeing = false;
    }
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1.5 && !this.fleeing) {
      this._pickTarget();
      return;
    }
    const wantHeading = Math.atan2(-dz, dx);
    this.heading = angleLerp(this.heading, wantHeading, Math.min(1, dt * 6));
    this.x += Math.cos(this.heading) * speed * dt;
    this.z -= Math.sin(this.heading) * speed * dt;
    const fixed = this.world.resolveCollision(this.x, this.z, 0.5);
    this.x = fixed.x;
    this.z = fixed.z;
    this.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(this.walkPhase) * 0.55;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading + Math.PI / 2;
  }
}

class PedestrianManager {
  constructor(scene, world, seed) {
    this.world = world;
    this.peds = [];
    for (let i = 0; i < PEDS.count; i += 1) {
      this.peds.push(new Pedestrian(scene, world, mulberry32(seed + i * 7919)));
    }
  }

  update(dt, threatX, threatZ, threatRadius) {
    for (const ped of this.peds) ped.update(dt, threatX, threatZ, threatRadius);
  }

  scareAll(x, z, radius) {
    for (const ped of this.peds) ped.scare(x, z, radius);
  }

  // The nearest standing pedestrian to a point, for shooting and bumping.
  nearestTo(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const ped of this.peds) {
      if (ped.down) continue;
      const d = distance2D(x, z, ped.x, ped.z);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }
}
