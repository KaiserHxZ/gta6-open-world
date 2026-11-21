// Solmar Bay — the city itself: a sun-soaked grid town with a beach and ocean,
// built once from a seed. It also owns collision (building boxes) and the road
// network the traffic, pedestrians and police drive and walk on.

class CityWorld {
  constructor(scene, seed) {
    this.scene = scene;
    this.rand = mulberry32(seed);
    this.buildings = []; // {minX, maxX, minZ, maxZ} collision boxes
    this.roadLines = [-161, -115, -69, -23, 23, 69, 115, 161];
    this.bounds = 185;
    this._clouds = [];
    this._beacon = null;
    this._beaconDiamond = null;
    this._buildSky();
    this._buildGround();
    this._buildBlocks();
    this._buildBeach();
    this._buildBeacon();
  }

  // A facade texture drawn on a canvas: warm wall with a grid of windows,
  // some lit. One texture per colour keeps the city varied and cheap.
  _facadeTexture(baseColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 128, 256);
    const cols = 4;
    const rows = 9;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = this.rand() < 0.35;
        ctx.fillStyle = lit ? '#ffe9a8' : '#274b5f';
        ctx.fillRect(12 + c * 28, 14 + r * 26, 18, 16);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildSky() {
    // A vertical sunset gradient painted on a canvas, used as the backdrop.
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d');
    const grad = skyCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#2f6fb4');
    grad.addColorStop(0.45, '#7fb0d8');
    grad.addColorStop(0.72, '#ffc98a');
    grad.addColorStop(1, '#ff9e66');
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 4, 512);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog(0xf7b98a, 140, 460);
    const sunLight = new THREE.DirectionalLight(PALETTE.sun, 1.6);
    sunLight.position.set(-120, 140, -80);
    this.scene.add(sunLight);
    this.scene.add(new THREE.HemisphereLight(0x9fc8e8, 0x8a6f52, 0.9));
    // Low sun disc in the west.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(18, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
    );
    sun.position.set(-320, 70, -180);
    sun.lookAt(0, 40, 0);
    this.scene.add(sun);
    // A few drifting clouds.
    for (let i = 0; i < 9; i += 1) {
      const cloud = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0xfff6ea, transparent: true, opacity: 0.92 });
      for (let j = 0; j < 3; j += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(randomRange(this.rand, 6, 12), 8, 6), mat);
        puff.scale.y = 0.45;
        puff.position.set(j * 9 - 9, randomRange(this.rand, -1, 1), randomRange(this.rand, -3, 3));
        cloud.add(puff);
      }
      cloud.position.set(randomRange(this.rand, -260, 260), randomRange(this.rand, 70, 110), randomRange(this.rand, -260, 100));
      this.scene.add(cloud);
      this._clouds.push(cloud);
    }
  }

  _buildGround() {
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 800),
      new THREE.MeshLambertMaterial({ color: 0x8f8a7c }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(60, -0.05, 0);
    this.scene.add(base);

    const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
    const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.asphaltLine });
    const span = CITY.half * 2 + CITY.roadWidth * 2;
    for (const line of this.roadLines) {
      const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, span), roadMat);
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(line, 0, 0);
      this.scene.add(vRoad);
      const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.roadWidth), roadMat);
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0, line);
      this.scene.add(hRoad);
      // Dashed centre lines.
      for (let d = -span / 2 + 6; d < span / 2 - 6; d += 12) {
        const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 4), lineMat);
        dashV.rotation.x = -Math.PI / 2;
        dashV.position.set(line, 0.02, d);
        this.scene.add(dashV);
        const dashH = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.4), lineMat);
        dashH.rotation.x = -Math.PI / 2;
        dashH.position.set(d, 0.02, line);
        this.scene.add(dashH);
      }
    }

    // Sidewalk slabs inside every block.
    const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    for (let bx = 0; bx < CITY.blocks; bx += 1) {
      for (let bz = 0; bz < CITY.blocks; bz += 1) {
        const cx = -CITY.half + CITY.blockSize / 2 + bx * CITY.pitch;
        const cz = -CITY.half + CITY.blockSize / 2 + bz * CITY.pitch;
        const slab = new THREE.Mesh(new THREE.PlaneGeometry(CITY.blockSize + 3, CITY.blockSize + 3), walkMat);
        slab.rotation.x = -Math.PI / 2;
        slab.position.set(cx, 0.01, cz);
        this.scene.add(slab);
      }
    }
  }

  _buildBlocks() {
    const palmTrunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
    const palmLeafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf, side: THREE.DoubleSide });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });

    for (let bx = 0; bx < CITY.blocks; bx += 1) {
      for (let bz = 0; bz < CITY.blocks; bz += 1) {
        const cx = -CITY.half + CITY.blockSize / 2 + bx * CITY.pitch;
        const cz = -CITY.half + CITY.blockSize / 2 + bz * CITY.pitch;
        const isPlaza = (bx === 3 && bz === 3) || (bx === 0 && bz === 6);
        if (isPlaza) {
          this._buildPlaza(cx, cz, palmTrunkMat, palmLeafMat);
          continue;
        }
        const count = this.rand() < 0.45 ? 2 : 1;
        for (let b = 0; b < count; b += 1) {
          const w = randomRange(this.rand, 13, 20);
          const d = randomRange(this.rand, 13, 20);
          const h = randomRange(this.rand, 8, 34) * (this.rand() < 0.2 ? 1.5 : 1);
          const ox = count === 1 ? 0 : (b === 0 ? -6 : 6);
          const oz = count === 1 ? 0 : (b === 0 ? 5 : -5);
          const color = randomPick(this.rand, PALETTE.building);
          const css = '#' + color.toString(16).padStart(6, '0');
          const tex = this._facadeTexture(css);
          const side = new THREE.MeshLambertMaterial({ map: tex });
          const roof = new THREE.MeshLambertMaterial({ color });
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            [side, side, roof, roof, side, side],
          );
          mesh.position.set(cx + ox, h / 2, cz + oz);
          this.scene.add(mesh);
          this.buildings.push({
            minX: cx + ox - w / 2, maxX: cx + ox + w / 2,
            minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2,
          });
          // Rooftop water tank on tall buildings.
          if (h > 20) {
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 10), new THREE.MeshLambertMaterial({ color: 0x8a8f98 }));
            tank.position.set(cx + ox + w / 4, h + 1.1, cz + oz);
            this.scene.add(tank);
          }
        }
        // Palms and lamps around the block's sidewalk.
        for (let p = 0; p < 3; p += 1) {
          const px = cx + randomRange(this.rand, -16, 16);
          const pz = cz + (this.rand() < 0.5 ? -17 : 17);
          if (this._insideBuilding(px, pz, 1)) continue;
          this._buildPalm(px, pz, palmTrunkMat, palmLeafMat);
        }
        if ((bx + bz) % 2 === 0) {
          const lamp = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), lampMat);
          pole.position.y = 2.6;
          lamp.add(pole);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampGlowMat);
          bulb.position.y = 5.3;
          lamp.add(bulb);
          lamp.position.set(cx + 16, 0, cz + 16);
          this.scene.add(lamp);
        }
      }
    }
  }

  // A plaza block: open pavement with palms and a fountain instead of buildings.
  _buildPlaza(cx, cz, trunkMat, leafMat) {
    const fountain = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 1, 20), new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
    basin.position.y = 0.5;
    fountain.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.4, 20), new THREE.MeshLambertMaterial({ color: 0x3f9ec4 }));
    water.position.y = 1.05;
    fountain.add(water);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.4, 10), new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
    spout.position.y = 2;
    fountain.add(spout);
    fountain.position.set(cx, 0, cz);
    this.scene.add(fountain);
    // The basin is solid: nobody walks through the fountain.
    this.buildings.push({ minX: cx - 5.5, maxX: cx + 5.5, minZ: cz - 5.5, maxZ: cz + 5.5 });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      this._buildPalm(cx + Math.cos(a) * 13, cz + Math.sin(a) * 13, trunkMat, leafMat);
    }
  }

  _buildPalm(x, z, trunkMat, leafMat) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 5, 7), trunkMat);
    trunk.position.y = 2.5;
    trunk.rotation.z = randomRange(this.rand, -0.08, 0.08);
    palm.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.9), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 5.1, Math.sin(a) * 1.1);
      leaf.rotation.set(0.5, -a, 0);
      leaf.rotation.y = -a + Math.PI / 2;
      leaf.rotation.x = 0.6;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    this.scene.add(palm);
  }

  // Sand strip and ocean on the east side, with beach umbrellas.
  _buildBeach() {
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 420),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(205, -0.02, 0);
    this.scene.add(sand);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 700),
      new THREE.MeshLambertMaterial({ color: PALETTE.ocean, transparent: true, opacity: 0.94 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(370, 0.05, 0);
    this.scene.add(ocean);
    for (let i = 0; i < 7; i += 1) {
      const x = randomRange(this.rand, 185, 225);
      const z = randomRange(this.rand, -160, 160);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a7a5f }));
      pole.position.set(x, 1.1, z);
      this.scene.add(pole);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(2, 0.9, 10),
        new THREE.MeshLambertMaterial({ color: randomPick(this.rand, [0xe2725b, 0xf2c14e, 0x4e9bb5, 0xbc6c9c]) }),
      );
      top.position.set(x, 2.5, z);
      this.scene.add(top);
    }
  }

  _buildBeacon() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 34, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 17;
    group.add(beam);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.5),
      new THREE.MeshBasicMaterial({ color: 0xffc53d }),
    );
    diamond.position.y = 6;
    group.add(diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    group.visible = false;
    this.scene.add(group);
    this._beacon = group;
    this._beaconDiamond = diamond;
  }

  showBeacon(x, z) {
    this._beacon.position.set(x, 0, z);
    this._beacon.visible = true;
  }

  hideBeacon() {
    this._beacon.visible = false;
  }

  update(dt, time) {
    if (this._beacon.visible) {
      this._beaconDiamond.rotation.y += dt * 2;
      this._beaconDiamond.position.y = 6 + Math.sin(time * 2.4) * 0.7;
    }
    for (const cloud of this._clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 300) cloud.position.x = -300;
    }
  }

  _insideBuilding(x, z, pad) {
    for (const b of this.buildings) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  }

  // Push a circle (x, z, radius) out of every building it overlaps, then clamp
  // it inside the world. Returns the corrected position.
  resolveCollision(x, z, radius) {
    for (const b of this.buildings) {
      const minX = b.minX - radius;
      const maxX = b.maxX + radius;
      const minZ = b.minZ - radius;
      const maxZ = b.maxZ + radius;
      if (x > minX && x < maxX && z > minZ && z < maxZ) {
        const pushLeft = x - minX;
        const pushRight = maxX - x;
        const pushUp = z - minZ;
        const pushDown = maxZ - z;
        const smallest = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (smallest === pushLeft) x = minX;
        else if (smallest === pushRight) x = maxX;
        else if (smallest === pushUp) z = minZ;
        else z = maxZ;
      }
    }
    x = clamp(x, -this.bounds, this.bounds);
    z = clamp(z, -this.bounds, this.bounds);
    return { x, z };
  }

  isOnRoad(x, z) {
    for (const line of this.roadLines) {
      if (Math.abs(x - line) < CITY.roadWidth / 2) return true;
      if (Math.abs(z - line) < CITY.roadWidth / 2) return true;
    }
    return false;
  }

  // A random point on a road, with a lane offset, for spawning traffic.
  randomRoadPoint() {
    const vertical = this.rand() < 0.5;
    const line = randomPick(this.rand, this.roadLines);
    const along = randomRange(this.rand, -CITY.half - 6, CITY.half + 6);
    const lane = (this.rand() < 0.5 ? -1 : 1) * 3;
    // Vertical roads run along Z (heading ±90°); horizontal roads along X (0°/180°).
    return vertical ? { x: line + lane, z: along, heading: this.rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2 } : { x: along, z: line + lane, heading: this.rand() < 0.5 ? 0 : Math.PI };
  }

  // A random point on a sidewalk (inside a block, off the road) for pedestrians.
  randomSidewalkPoint() {
    for (let tries = 0; tries < 20; tries += 1) {
      const x = randomRange(this.rand, -CITY.half, CITY.half);
      const z = randomRange(this.rand, -CITY.half, CITY.half);
      if (!this.isOnRoad(x, z) && !this._insideBuilding(x, z, 1.5)) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  // A random street corner, good for parking a car where the player can find it.
  randomParkingSpot() {
    const lineA = randomPick(this.rand, this.roadLines);
    const lineB = randomPick(this.rand, this.roadLines);
    return { x: lineA + 4.5, z: lineB + randomRange(this.rand, -40, 40) };
  }
}
