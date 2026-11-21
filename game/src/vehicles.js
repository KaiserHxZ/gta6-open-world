// Solmar Bay — cars: a box-built car mesh, arcade driving physics for the
// player's car, and the traffic that cruises the road grid.

function buildCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyColor = kind === 'police' ? PALETTE.policeCar : color;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.length, 0.72, CAR.width), bodyMat);
  body.position.y = 0.62;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 1.75), glassMat);
  cabin.position.set(-0.25, 1.28, 0);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.7), bodyMat);
  roof.position.set(-0.25, 1.62, 0);
  group.add(roof);
  // Headlights and tail lights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const side of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.42), headMat);
    head.position.set(CAR.length / 2, 0.66, side);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.42), tailMat);
    tail.position.set(-CAR.length / 2, 0.66, side);
    group.add(tail);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelPositions = [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]];
  const wheels = [];
  for (const [wx, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  let lightBar = null;
  let lightRed = null;
  let lightBlue = null;
  if (kind === 'police') {
    lightBar = new THREE.Group();
    lightRed = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: PALETTE.policeLightRed }));
    lightRed.position.set(0, 0, 0.45);
    lightBlue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: PALETTE.policeLightBlue }));
    lightBlue.position.set(0, 0, -0.45);
    lightBar.add(lightRed);
    lightBar.add(lightBlue);
    lightBar.position.set(-0.25, 1.78, 0);
    group.add(lightBar);
    // White doors.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e6df });
    const doors = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.02), doorMat);
    doors.position.set(-0.2, 0.62, 0);
    group.add(doors);
  }
  group.traverse((obj) => { obj.castShadow = false; });
  return { group, wheels, lightBar, lightRed, lightBlue };
}

class DriveCar {
  constructor(scene, color, kind) {
    this.kind = kind || 'civilian';
    this.color = color;
    const built = buildCarMesh(color, this.kind);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightRed = built.lightRed;
    this.lightBlue = built.lightBlue;
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.health = CAR.maxHealth;
    this.dead = false;
    this._flashTime = 0;
    scene.add(this.mesh);
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this._syncMesh();
  }

  _syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Arcade step: throttle -1..1, steer -1..1. Returns true if it hit a wall.
  drive(dt, throttle, steer, world) {
    if (this.dead) return false;
    const forward = throttle > 0 ? 1 : throttle < 0 ? -1 : 0;
    if (throttle > 0) this.speed += CAR.accel * dt;
    else if (throttle < 0) this.speed -= (this.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    this.speed = clamp(this.speed, -CAR.reverseSpeed, CAR.topSpeed);
    const speedFactor = clamp(Math.abs(this.speed) / 12, 0, 1);
    this.heading += steer * CAR.steer * speedFactor * dt;
    const nx = this.x + Math.cos(this.heading) * this.speed * dt;
    const nz = this.z - Math.sin(this.heading) * this.speed * dt;
    const fixed = world.resolveCollision(nx, nz, CAR.length / 2);
    const hitWall = fixed.x !== nx || fixed.z !== nz;
    if (hitWall) {
      this.speed *= 0.4;
      if (Math.abs(this.speed) > 6) this.health -= 4;
    }
    this.x = fixed.x;
    this.z = fixed.z;
    this._syncMesh();
    for (const wheel of this.wheels) wheel.rotation.z -= this.speed * dt * 2;
    if (this.health <= 0) {
      this.dead = true;
      this.speed = 0;
    }
    return hitWall;
  }

  // Flash the police light bar, alternating red and blue.
  flashLights(time) {
    if (!this.lightRed) return;
    const on = Math.floor(time * 4) % 2 === 0;
    this.lightRed.material.color.setHex(on ? 0xff4444 : 0x550000);
    this.lightBlue.material.color.setHex(on ? 0x000055 : 0x4488ff);
  }
}

class TrafficManager {
  constructor(scene, world, seed) {
    this.world = world;
    this.rand = mulberry32(seed);
    this.cars = [];
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const spot = world.randomRoadPoint();
      const car = new DriveCar(scene, randomPick(this.rand, PALETTE.carColors), 'civilian');
      car.place(spot.x, spot.z, spot.heading);
      car.speed = TRAFFIC.speed + randomRange(this.rand, -TRAFFIC.speedJitter, TRAFFIC.speedJitter);
      this.cars.push({
        car,
        axis: Math.abs(Math.cos(spot.heading)) > 0.5 ? 'x' : 'z',
        line: Math.abs(Math.cos(spot.heading)) > 0.5 ? spot.z : spot.x,
        dir: spot.heading === 0 || spot.heading === -Math.PI / 2 ? 1 : -1,
        cruise: car.speed,
      });
    }
  }

  // True when another car is close ahead of `car` on its path.
  _carAhead(car, others) {
    const fx = Math.cos(car.heading);
    const fz = -Math.sin(car.heading);
    for (const other of others) {
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 9 && dist > 0.1 && (dx * fx + dz * fz) / dist > 0.7) return true;
    }
    return false;
  }

  update(dt, playerCar, policeCars) {
    const allCars = this.cars.map((t) => t.car).concat(policeCars || []);
    if (playerCar) allCars.push(playerCar);
    for (const t of this.cars) {
      const car = t.car;
      if (car.dead) continue;
      // At an intersection, sometimes turn onto the crossing road.
      const crossing = this.world.roadLines;
      const along = t.axis === 'x' ? car.x : car.z;
      for (const line of crossing) {
        if (Math.abs(along - line) < 1.2 && this.rand() < 0.012) {
          const newAxis = t.axis === 'x' ? 'z' : 'x';
          const newLine = line;
          const newDir = this.rand() < 0.5 ? 1 : -1;
          t.axis = newAxis;
          t.line = newLine;
          t.dir = newDir;
          car.heading = newAxis === 'x' ? (newDir > 0 ? 0 : Math.PI) : (newDir > 0 ? -Math.PI / 2 : Math.PI / 2);
          break;
        }
      }
      // Turn around at the city edge.
      const edge = CITY.half + CITY.roadWidth;
      if (along > edge || along < -edge) {
        t.dir *= -1;
        car.heading += Math.PI;
      }
      const wantSpeed = this._carAhead(car, allCars) ? 0 : t.cruise;
      car.speed = lerp(car.speed, wantSpeed, Math.min(1, dt * 2));
      car.x += Math.cos(car.heading) * car.speed * dt;
      car.z -= Math.sin(car.heading) * car.speed * dt;
      car._syncMesh();
    }
  }

  // The closest traffic car to a point, for the player to steal.
  nearestTo(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const t of this.cars) {
      if (t.car.dead) continue;
      const d = distance2D(x, z, t.car.x, t.car.z);
      if (d < bestDist) {
        bestDist = d;
        best = t.car;
      }
    }
    return best;
  }
}
