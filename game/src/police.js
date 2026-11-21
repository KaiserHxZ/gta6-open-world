// Solmar Bay — the wanted system and the police who answer it: foot cops who
// chase and bust the player, and police cars that ram his car.

class WantedSystem {
  constructor() {
    this.stars = 0;
    this.lastCrimeAt = -999;
    this._decayTimer = 0;
  }

  addCrime(level, time) {
    this.stars = Math.min(WANTED.maxStars, this.stars + level);
    this.lastCrimeAt = time;
    this._decayTimer = 0;
  }

  clear() {
    this.stars = 0;
    this._decayTimer = 0;
  }

  // Stars cool off when the player stays clean and out of sight of the police.
  update(dt, time, nearestPoliceDist) {
    if (this.stars === 0) return;
    if (time - this.lastCrimeAt < WANTED.decayDelay) return;
    if (nearestPoliceDist !== null && nearestPoliceDist < 50) return;
    this._decayTimer += dt;
    if (this._decayTimer >= WANTED.decayInterval) {
      this._decayTimer = 0;
      this.stars -= 1;
    }
  }
}

function buildCopMesh() {
  const group = new THREE.Group();
  const uniformMat = new THREE.MeshLambertMaterial({ color: 0x1e3a5f });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x14263e });
  const legGeo = new THREE.BoxGeometry(0.18, 0.8, 0.2);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.12, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.12, 0.4, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), uniformMat);
  torso.position.y = 1.14;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
  badge.position.set(-0.16, 1.3, 0.16);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.66;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), capMat);
  cap.position.y = 1.86;
  const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.14);
  const armL = new THREE.Mesh(armGeo, uniformMat);
  armL.position.set(-0.36, 1.15, 0);
  const armR = new THREE.Mesh(armGeo, uniformMat);
  armR.position.set(0.36, 1.15, 0);
  group.add(legL, legR, torso, badge, head, cap, armL, armR);
  return { group, legL, legR, armL, armR };
}

class FootCop {
  constructor(scene, x, z, rand) {
    const built = buildCopMesh();
    this.mesh = built.group;
    this.legL = built.legL;
    this.legR = built.legR;
    this.armL = built.armL;
    this.armR = built.armR;
    this.x = x;
    this.z = z;
    this.heading = rand() * Math.PI * 2;
    this.health = 100;
    this.down = false;
    this.downTimer = 0;
    this.bustTimer = 0;
    this.shootTimer = randomRange(rand, 0.3, 1);
    this.walkPhase = 0;
    scene.add(this.mesh);
    this.mesh.position.set(x, 0, z);
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
    return false;
  }

  remove(scene) {
    scene.remove(this.mesh);
  }
}

class PoliceManager {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.rand = mulberry32(seed);
    this.footCops = [];
    this.cars = [];
    this._spawnTimer = 0;
  }

  nearestDistanceTo(x, z) {
    let best = null;
    for (const cop of this.footCops) {
      const d = distance2D(x, z, cop.x, cop.z);
      if (best === null || d < best) best = d;
    }
    for (const car of this.cars) {
      const d = distance2D(x, z, car.x, car.z);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  _spawnFootCopNear(player) {
    const a = this.rand() * Math.PI * 2;
    const dist = randomRange(this.rand, 18, 30);
    const spot = this.world.resolveCollision(player.x + Math.cos(a) * dist, player.z + Math.sin(a) * dist, 0.5);
    this.footCops.push(new FootCop(this.scene, spot.x, spot.z, this.rand));
  }

  _spawnPoliceCarNear(player) {
    const spot = this.world.randomRoadPoint();
    // Pull the spawn toward the player so the chase starts close.
    const car = new DriveCar(this.scene, 0, 'police');
    const dx = player.x - spot.x;
    const dz = player.z - spot.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const pull = Math.min(50, d * 0.5);
    car.place(spot.x + (dx / d) * pull, spot.z + (dz / d) * pull, spot.heading);
    car.speed = 10;
    this.cars.push(car);
  }

  _removeUnit(list, index) {
    const unit = list[index];
    if (unit.remove) unit.remove(this.scene);
    else this.scene.remove(unit.mesh);
    list.splice(index, 1);
  }

  update(dt, ctx, time) {
    const player = ctx.player;
    const wanted = ctx.wanted;
    const [wantFoot, wantCars] = WANTED.deployment[wanted.stars];
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = 1.2;
      if (this.footCops.length < wantFoot && !player.inCar) this._spawnFootCopNear(player);
      else if (this.cars.length < wantCars) this._spawnPoliceCarNear(player);
      // Trim units above the wanted level, furthest first.
      while (this.footCops.length > wantFoot) {
        let far = 0;
        let farD = -1;
        this.footCops.forEach((c, i) => {
          const d = distance2D(player.x, player.z, c.x, c.z);
          if (d > farD) { farD = d; far = i; }
        });
        this._removeUnit(this.footCops, far);
      }
      while (this.cars.length > wantCars) {
        let far = 0;
        let farD = -1;
        this.cars.forEach((c, i) => {
          const d = distance2D(player.x, player.z, c.x, c.z);
          if (d > farD) { farD = d; far = i; }
        });
        this._removeUnit(this.cars, far);
      }
    }

    // Foot cops: chase the player on foot, bust him up close, shoot from afar.
    for (let i = this.footCops.length - 1; i >= 0; i -= 1) {
      const cop = this.footCops[i];
      if (cop.down) {
        cop.downTimer -= dt;
        if (cop.downTimer <= 0) this._removeUnit(this.footCops, i);
        continue;
      }
      if (player.inCar) {
        // On foot no more: the cop stands down and fades from the hunt.
        cop.bustTimer = 0;
      }
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(-dz, dx);
      cop.heading = angleLerp(cop.heading, wantHeading, Math.min(1, dt * 5));
      if (!player.inCar && dist > 1.6) {
        cop.x += Math.cos(cop.heading) * POLICE.footSpeed * dt;
        cop.z -= Math.sin(cop.heading) * POLICE.footSpeed * dt;
        const fixed = this.world.resolveCollision(cop.x, cop.z, 0.5);
        cop.x = fixed.x;
        cop.z = fixed.z;
        cop.walkPhase += dt * 10;
        const swing = Math.sin(cop.walkPhase) * 0.6;
        cop.legL.rotation.x = swing;
        cop.legR.rotation.x = -swing;
        cop.armL.rotation.x = -swing * 0.8;
        cop.armR.rotation.x = swing * 0.8;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading + Math.PI / 2;
      if (!player.inCar && dist < 2.2) {
        cop.bustTimer += dt;
        if (cop.bustTimer >= POLICE.bustTime) {
          ctx.onBusted();
          cop.bustTimer = 0;
        }
      } else {
        cop.bustTimer = Math.max(0, cop.bustTimer - dt);
      }
      // Cops open fire at two stars and up.
      if (!player.inCar && wanted.stars >= 2 && dist < POLICE.shootRange && dist > 4) {
        cop.shootTimer -= dt;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = POLICE.shootInterval * randomRange(this.rand, 0.8, 1.4);
          ctx.effects.tracer(new THREE.Vector3(cop.x, 1.4, cop.z), new THREE.Vector3(player.x, 1.3, player.z));
          ctx.audio.gunshot();
          if (this.rand() < 0.55) {
            player.damage(POLICE.shootDamage, time);
            ctx.hud.flashDamage();
          }
        }
      }
    }

    // Police cars: chase and ram the player's car; knock the player down on foot.
    for (const car of this.cars) {
      car.flashLights(time);
      const tx = player.inCar ? player.inCar.x : player.x;
      const tz = player.inCar ? player.inCar.z : player.z;
      const dx = tx - car.x;
      const dz = tz - car.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(-dz, dx);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 1.8, -1, 1);
      car.drive(dt, 1, steer, this.world);
      if (car.speed < POLICE.carSpeed * 0.5) car.speed = Math.min(car.speed + 10 * dt, POLICE.carSpeed);
      if (player.inCar && dist < 4.2) {
        // Ram: shove the player's car and hurt it.
        player.inCar.health -= POLICE.ramDamage * dt * 2;
        player.inCar.speed *= 1 - Math.min(1, dt * 1.5);
        if (this.rand() < dt * 2) {
          ctx.audio.crash();
          player.addShake(0.3);
        }
        if (player.inCar.health <= 0) player.inCar.dead = true;
      } else if (!player.inCar && dist < 1.8) {
        player.damage(15, time);
        ctx.hud.flashDamage();
        player.x += (dx / (dist || 1)) * -2;
        player.z += (dz / (dist || 1)) * -2;
      }
    }

    ctx.audio.setSiren(this.footCops.length > 0 || this.cars.length > 0);
  }
}
