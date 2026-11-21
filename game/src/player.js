// Solmar Bay — the player: Rex Marlowe, a getaway driver. On foot he runs,
// jumps and shoots; in a car he drives it. The camera follows him everywhere.

function rayHitsSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

function buildPlayerMesh() {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: PALETTE.playerShirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: PALETTE.playerPants });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xd23b3b });
  const legGeo = new THREE.BoxGeometry(0.2, 0.85, 0.22);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.13, 0.42, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.13, 0.42, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.32), shirtMat);
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
  head.position.y = 1.74;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.38), capMat);
  cap.position.y = 1.94;
  const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.15);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.38, 1.2, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.38, 1.2, 0);
  // The pistol in his right hand.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.38, 0.92, 0.18);
  group.add(legL, legR, torso, head, cap, armL, armR, gun);
  return { group, legL, legR, armL, armR, gun };
}

class Player {
  constructor(scene) {
    const built = buildPlayerMesh();
    this.mesh = built.group;
    this.legL = built.legL;
    this.legR = built.legR;
    this.armL = built.armL;
    this.armR = built.armR;
    this.gun = built.gun;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.vx = 0;
    this.vz = 0;
    this.health = PLAYER.maxHealth;
    this.cash = 0;
    this.inCar = null;
    this.ammo = COMBAT.magazine;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.lastDamageAt = -99;
    this.walkPhase = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDistance = 7;
    this._lastDragAt = -99;
    this._shake = 0;
    scene.add(this.mesh);
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.heading = heading;
    this.camYaw = heading;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading + Math.PI / 2;
  }

  addShake(amount) {
    this._shake = Math.min(0.6, this._shake + amount);
  }

  damage(amount, time) {
    this.health -= amount;
    this.lastDamageAt = time;
    this.addShake(0.25);
    if (this.health <= 0) this.health = 0;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  enterCar(car, audio) {
    this.inCar = car;
    this.mesh.visible = false;
    if (audio) audio.carDoor();
  }

  exitCar(world, audio) {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    const side = Math.cos(car.heading + Math.PI / 2);
    const sideZ = -Math.sin(car.heading + Math.PI / 2);
    const spot = world.resolveCollision(car.x + side * 2.2, car.z + sideZ * 2.2, PLAYER.radius);
    this.place(spot.x, spot.z, car.heading);
    this.mesh.visible = true;
    if (audio) audio.carDoor();
  }

  // The nearest stealable car (traffic or parked) within reach.
  nearbyCar(traffic, parkedCars, maxDist) {
    let best = traffic ? traffic.nearestTo(this.x, this.z, maxDist) : null;
    let bestDist = best ? distance2D(this.x, this.z, best.x, best.z) : maxDist;
    for (const car of parkedCars || []) {
      if (car.dead) continue;
      const d = distance2D(this.x, this.z, car.x, car.z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  // Fire the pistol along the camera's aim. Returns what was hit, if anything.
  fire(ctx) {
    if (this.inCar || this.reloading > 0 || this.fireCooldown > 0 || this.ammo <= 0) return null;
    this.fireCooldown = COMBAT.fireInterval;
    this.ammo -= 1;
    if (this.ammo === 0) this.reloading = COMBAT.reloadSeconds;
    const camera = ctx.camera;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let bestT = COMBAT.pistolRange;
    let bestHit = null;
    const consider = (cx, cy, cz, r, kind, ref) => {
      const t = rayHitsSphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, cx, cy, cz, r);
      if (t > 0 && t < bestT) {
        bestT = t;
        bestHit = { kind, ref, x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
      }
    };
    for (const ped of ctx.peds.peds) {
      if (!ped.down) consider(ped.x, 1.2, ped.z, 0.9, 'ped', ped);
    }
    for (const cop of ctx.police.footCops) {
      if (!cop.down) consider(cop.x, 1.2, cop.z, 0.9, 'cop', cop);
    }
    for (const guard of ctx.missions.guards) {
      if (!guard.down) consider(guard.x, 1.2, guard.z, 0.9, 'guard', guard);
    }
    for (const car of ctx.allCars) {
      consider(car.x, 0.9, car.z, 2.4, 'car', car);
    }
    const muzzle = new THREE.Vector3(this.x, 1.4, this.z);
    const end = bestHit
      ? new THREE.Vector3(bestHit.x, bestHit.y, bestHit.z)
      : origin.clone().add(dir.clone().multiplyScalar(COMBAT.pistolRange));
    ctx.effects.tracer(muzzle, end);
    ctx.effects.muzzleFlash(muzzle);
    ctx.audio.gunshot();
    this.addShake(0.08);
    if (!bestHit) return { kind: 'miss' };
    if (bestHit.kind === 'ped') {
      const down = bestHit.ref.damage(COMBAT.pistolDamage);
      ctx.audio.hit();
      return { kind: 'ped', down, ref: bestHit.ref };
    }
    if (bestHit.kind === 'cop' || bestHit.kind === 'guard') {
      const down = bestHit.ref.damage(COMBAT.pistolDamage);
      ctx.audio.hit();
      return { kind: bestHit.kind, down, ref: bestHit.ref };
    }
    if (bestHit.kind === 'car') {
      bestHit.ref.health -= 10;
      if (bestHit.ref.health <= 0) bestHit.ref.dead = true;
      return { kind: 'car', ref: bestHit.ref };
    }
    return { kind: 'miss' };
  }

  step(dt, ctx, time) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = COMBAT.magazine;
    }
    // Slow health regen out of combat.
    if (time - this.lastDamageAt > 6 && this.health > 0) this.heal(4 * dt);
    const drag = Input.takeDrag();
    if (drag.dx !== 0 || drag.dy !== 0) {
      this.camYaw -= drag.dx * 0.005;
      this.camPitch = clamp(this.camPitch + drag.dy * 0.004, -0.15, 1.1);
      this._lastDragAt = time;
    }

    if (this.inCar) {
      const car = this.inCar;
      const axes = Input.moveAxes();
      const throttle = axes.y;
      const steer = -axes.x;
      const hitWall = car.drive(dt, throttle, steer, ctx.world);
      // The player's own position follows the car: missions, police and the
      // minimap all read it, so it must never go stale while driving.
      this.x = car.x;
      this.z = car.z;
      this.heading = car.heading;
      if (hitWall && Math.abs(car.speed) > 8) {
        ctx.audio.crash();
        this.addShake(0.2);
      }
      ctx.audio.setEngine(Math.abs(car.speed) / CAR.topSpeed, true);
      // Ease the camera behind the car when the player is not dragging.
      if (time - this._lastDragAt > 1.5 && Math.abs(car.speed) > 4) {
        this.camYaw = angleLerp(this.camYaw, car.heading, Math.min(1, dt * 1.6));
      }
      this.camDistance = lerp(this.camDistance, 9.5, Math.min(1, dt * 2));
      return;
    }

    ctx.audio.setEngine(0, false);
    const axes = Input.moveAxes();
    const running = Input.down('ShiftLeft') || Input.down('ShiftRight');
    const maxSpeed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Movement is relative to where the camera looks.
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    // Forward is (cos yaw, -sin yaw); right is (sin yaw, cos yaw).
    const wishX = axes.x * sin + axes.y * cos;
    const wishZ = axes.x * cos - axes.y * sin;
    const moving = axes.x !== 0 || axes.y !== 0;
    this.vx = lerp(this.vx, wishX * maxSpeed, Math.min(1, dt * 10));
    this.vz = lerp(this.vz, wishZ * maxSpeed, Math.min(1, dt * 10));
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const fixed = ctx.world.resolveCollision(nx, nz, PLAYER.radius);
    this.x = fixed.x;
    this.z = fixed.z;
    if (Input.down('Space') && this.y === 0) this.vy = PLAYER.jumpSpeed;
    this.vy -= PLAYER.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
    }
    if (moving) {
      this.heading = Math.atan2(-this.vz, this.vx);
      this.walkPhase += dt * Math.hypot(this.vx, this.vz) * 1.6;
    }
    const swing = Math.sin(this.walkPhase) * (moving ? 0.6 : 0);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading + Math.PI / 2;
    this.camDistance = lerp(this.camDistance, 7, Math.min(1, dt * 2));
  }

  // Position the camera behind the player (or the car) for this frame.
  updateCamera(camera, dt, time) {
    const target = this.inCar
      ? new THREE.Vector3(this.inCar.x, 1.6, this.inCar.z)
      : new THREE.Vector3(this.x, 1.7 + this.y, this.z);
    const dist = this.camDistance;
    const cx = target.x - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = target.z + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = target.y + Math.sin(this.camPitch) * dist + 0.6;
    camera.position.set(cx, Math.max(cy, 0.6), cz);
    camera.lookAt(target.x, target.y, target.z);
    if (this._shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this._shake;
      camera.position.y += (Math.random() - 0.5) * this._shake;
      this._shake = Math.max(0, this._shake - dt * 1.4);
    }
    camera.fov = this.inCar ? lerp(camera.fov, 62 + Math.abs(this.inCar.speed) * 0.45, Math.min(1, dt * 3)) : lerp(camera.fov, 60, Math.min(1, dt * 3));
    camera.updateProjectionMatrix();
  }
}
