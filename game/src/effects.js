// Solmar Bay — cheap visual effects: gun tracers, muzzle flashes, impact
// bursts and damage smoke. Everything is pooled; nothing allocates per frame.

class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.flashes = [];
    this.particles = [];
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    for (let i = 0; i < 48; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, gravity: 0, grow: false });
    }
    // A soft round sprite for muzzle flashes, drawn once on a canvas.
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,180,1)');
    grad.addColorStop(0.4, 'rgba(255,160,40,0.85)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this._flashTexture = new THREE.CanvasTexture(canvas);
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  muzzleFlash(pos) {
    const mat = new THREE.SpriteMaterial({ map: this._flashTexture, transparent: true, opacity: 1, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(1.4, 1.4, 1);
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: 0.06 });
  }

  burst(pos, color, count, speed) {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.life > 0) continue;
      spawned += 1;
      p.life = 0.5;
      p.maxLife = 0.5;
      p.gravity = 9;
      p.grow = false;
      p.mesh.visible = true;
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      p.mesh.scale.set(1, 1, 1);
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
    }
  }

  smoke(pos) {
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.life = 1.1;
      p.maxLife = 1.1;
      p.gravity = -1.5;
      p.grow = true;
      p.mesh.visible = true;
      p.mesh.material.color.setHex(0x555555);
      p.mesh.material.opacity = 0.55;
      p.mesh.scale.set(1.5, 1.5, 1.5);
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * 0.6, 1.2, (Math.random() - 0.5) * 0.6);
      return;
    }
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        p.mesh.material.opacity = 0;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      p.mesh.material.opacity = p.grow ? 0.55 * k : k;
      if (p.grow) {
        const s = 1.5 + (1 - k) * 2;
        p.mesh.scale.set(s, s, s);
      }
    }
  }
}
