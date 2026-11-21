// Solmar Bay — the story: five jobs from fixer Lena Voss. Each mission is a
// small state machine with a beacon, an objective line and a cash reward.

class MissionManager {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.rand = mulberry32(seed);
    this.missionIndex = 0;
    this.active = false;
    this.phase = 0;
    this.guards = [];
    this.holdProgress = 0;
    this._nextTimer = 0;
    this._guardFireTimer = 0;
    this._finishedAll = false;
  }

  current() {
    return MISSIONS[this.missionIndex] || null;
  }

  get finishedAll() {
    return this._finishedAll;
  }

  startMission(index, ctx) {
    this.missionIndex = index;
    this.phase = 0;
    this.holdProgress = 0;
    this.active = true;
    const mission = this.current();
    if (!mission) {
      this.active = false;
      return;
    }
    if (mission.wantedAtStart) ctx.wanted.addCrime(mission.wantedAtStart, ctx.time);
    if (mission.kind === 'shootout') this._spawnGuards(mission);
    ctx.hud.showMissionBrief(mission);
    ctx.audio.pickup();
    this._updateBeacon(ctx);
  }

  _spawnGuards(mission) {
    this._clearGuards();
    for (let i = 0; i < (mission.guards || 0); i += 1) {
      const guard = new Pedestrian(this.scene, this.world, mulberry32(9000 + i * 131));
      const a = (i / (mission.guards || 1)) * Math.PI * 2;
      guard.x = mission.target.x + Math.cos(a) * 8;
      guard.z = mission.target.z + Math.sin(a) * 8;
      guard.targetX = guard.x;
      guard.targetZ = guard.z;
      guard.speed = 0;
      guard.mesh.position.set(guard.x, 0, guard.z);
      this.guards.push(guard);
    }
  }

  _clearGuards() {
    for (const guard of this.guards) this.scene.remove(guard.mesh);
    this.guards = [];
  }

  _updateBeacon(ctx) {
    const mission = this.current();
    if (!mission || !this.active) {
      this.world.hideBeacon();
      return;
    }
    if (mission.kind === 'fetch' && this.phase === 0) {
      this.world.showBeacon(mission.pickup.x, mission.pickup.z);
      return;
    }
    if ((mission.kind === 'robbery' || mission.kind === 'shootout') && this.phase === 1 && mission.escape) {
      this.world.showBeacon(mission.escape.x, mission.escape.z);
      return;
    }
    if (mission.target) this.world.showBeacon(mission.target.x, mission.target.z);
    else this.world.hideBeacon();
  }

  _objectiveTarget() {
    const mission = this.current();
    if (!mission) return null;
    if (mission.kind === 'fetch' && this.phase === 0) return mission.pickup;
    if ((mission.kind === 'robbery' || mission.kind === 'shootout') && this.phase === 1 && mission.escape) return mission.escape;
    return mission.target || null;
  }

  _complete(ctx) {
    const mission = this.current();
    this.active = false;
    this.world.hideBeacon();
    this._clearGuards();
    ctx.player.cash += mission.reward;
    ctx.audio.missionComplete();
    ctx.hud.toast(`Job done: ${mission.title} — +$${mission.reward}`);
    this.missionIndex += 1;
    saveGame({
      cash: ctx.player.cash,
      missionIndex: this.missionIndex,
      playerX: ctx.player.x,
      playerZ: ctx.player.z,
      health: ctx.player.health,
    });
    if (this.missionIndex >= MISSIONS.length) {
      this._finishedAll = true;
      ctx.hud.showStoryComplete();
      return;
    }
    this._nextTimer = 3;
  }

  // A bust or a wipe restarts the current job from its beginning.
  restartCurrent(ctx) {
    this.phase = 0;
    this.holdProgress = 0;
    this._clearGuards();
    const mission = this.current();
    if (mission && mission.kind === 'shootout') this._spawnGuards(mission);
    this.active = true;
    this._updateBeacon(ctx);
    ctx.hud.toast(`Job restarted: ${mission ? mission.title : ''}`);
  }

  update(dt, ctx) {
    if (this._nextTimer > 0) {
      this._nextTimer -= dt;
      ctx.hud.setObjective('Job done! Lena is lining up the next one…');
      if (this._nextTimer <= 0) this.startMission(this.missionIndex, ctx);
      return;
    }
    const mission = this.current();
    if (!mission || !this.active) return;
    const player = ctx.player;

    // Guards shoot at the player while the shootout runs.
    if (mission.kind === 'shootout' && this.phase === 0) {
      this._guardFireTimer -= dt;
      let allDown = true;
      for (const guard of this.guards) {
        if (guard.down) continue;
        allDown = false;
        const d = distance2D(player.x, player.z, guard.x, guard.z);
        if (d < 35 && !player.inCar) {
          guard.heading = Math.atan2(-(player.z - guard.z), player.x - guard.x);
          guard.mesh.rotation.y = guard.heading + Math.PI / 2;
          if (this._guardFireTimer <= 0) {
            this._guardFireTimer = 1.3;
            ctx.effects.tracer(new THREE.Vector3(guard.x, 1.4, guard.z), new THREE.Vector3(player.x, 1.3, player.z));
            ctx.audio.gunshot();
            if (this.rand() < 0.45) {
              player.damage(5, ctx.time);
              ctx.hud.flashDamage();
            }
          }
        }
      }
      if (allDown && this.guards.length > 0) {
        this.phase = 1;
        ctx.hud.toast('Yard clear. Grab the loot and run.');
        ctx.audio.pickup();
        this._updateBeacon(ctx);
      }
    }

    // Robbery: hold E at the vault to crack it open.
    if (mission.kind === 'robbery' && this.phase === 0) {
      const d = distance2D(player.x, player.z, mission.target.x, mission.target.z);
      if (!player.inCar && d < 6 && Input.down('KeyE')) {
        this.holdProgress += dt / 3;
        if (this.holdProgress >= 1) {
          this.phase = 1;
          this.holdProgress = 0;
          ctx.wanted.addCrime(3, ctx.time);
          ctx.hud.toast('Cash grabbed! Lose the heat and reach the safehouse.');
          ctx.audio.pickup();
          this._updateBeacon(ctx);
        }
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt / 2);
      }
    }

    // Fetch: pick the package up on foot.
    if (mission.kind === 'fetch' && this.phase === 0) {
      const d = distance2D(player.x, player.z, mission.pickup.x, mission.pickup.z);
      if (!player.inCar && d < 4) {
        this.phase = 1;
        ctx.hud.toast('Package secured. Deliver it to Lena’s garage.');
        ctx.audio.pickup();
        this._updateBeacon(ctx);
      }
    }

    // Arrival checks.
    const target = this._objectiveTarget();
    if (target) {
      const d = distance2D(player.x, player.z, target.x, target.z);
      const arriveDist = player.inCar ? 12 : 6;
      if (mission.kind === 'steal-and-drive') {
        if (player.inCar && d < arriveDist) this._complete(ctx);
      } else if (mission.kind === 'fetch' && this.phase === 1) {
        if (d < arriveDist) this._complete(ctx);
      } else if ((mission.kind === 'robbery' || mission.kind === 'shootout') && this.phase === 1) {
        if (d < arriveDist) this._complete(ctx);
      }
    }

    // Lose-heat: done when the stars are gone.
    if (mission.kind === 'lose-heat' && ctx.wanted.stars === 0) {
      this._complete(ctx);
    }

    // Keep the HUD's objective line fresh.
    if (target) {
      const d = Math.round(distance2D(player.x, player.z, target.x, target.z));
      let line = `${mission.title}: ${target.label} — ${d}m`;
      if (mission.kind === 'robbery' && this.phase === 0) line += this.holdProgress > 0 ? ` — cracking… ${Math.round(this.holdProgress * 100)}%` : ' — hold E at the vault';
      if (mission.kind === 'fetch' && this.phase === 0) line += ' — on foot';
      ctx.hud.setObjective(line);
    } else if (mission.kind === 'lose-heat') {
      ctx.hud.setObjective(`${mission.title}: lose the heat — ${ctx.wanted.stars}★ left`);
    }
  }
}
