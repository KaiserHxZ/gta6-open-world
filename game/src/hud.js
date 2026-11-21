// Solmar Bay — the HUD: health, cash, wanted stars, the minimap, the mission
// line, and the start / pause / busted / wasted screens. All DOM, no canvas 3D.

class SolmarHud {
  constructor(audio) {
    this.audio = audio;
    this.el = (id) => document.getElementById(id);
    this.healthFill = this.el('health-fill');
    this.healthText = this.el('health-text');
    this.cashEl = this.el('cash');
    this.starsEl = this.el('stars');
    this.objectiveEl = this.el('objective');
    this.speedEl = this.el('speed');
    this.ammoEl = this.el('ammo');
    this.hintEl = this.el('hint');
    this.toastEl = this.el('toast');
    this.crosshair = this.el('crosshair');
    this.damageFlash = this.el('damage-flash');
    this.missionCard = this.el('mission-card');
    this.minimap = this.el('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this._toastTimer = null;
    this._briefTimer = null;
    this._starSpans = [];
    for (let i = 0; i < 5; i += 1) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.className = 'star';
      this.starsEl.appendChild(s);
      this._starSpans.push(s);
    }
  }

  setObjective(text) {
    this.objectiveEl.textContent = text;
  }

  toast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 3200);
  }

  showMissionBrief(mission) {
    this.el('mission-title').textContent = mission.title;
    this.el('mission-giver').textContent = `${mission.giver} — $${mission.reward}`;
    this.el('mission-brief').textContent = mission.brief;
    this.missionCard.classList.add('show');
    clearTimeout(this._briefTimer);
    this._briefTimer = setTimeout(() => this.missionCard.classList.remove('show'), 7000);
  }

  showStoryComplete() {
    this.el('end-title').textContent = 'SOLMAR BAY — COMPLETE';
    this.el('end-text').textContent = 'Every job done. Lena’s crew runs the Bay now — and Rex Marlowe is a legend on every street. Thanks for playing.';
    this.el('end-screen').classList.add('show');
  }

  showEnd(kind) {
    if (kind === 'busted') {
      this.el('end-title').textContent = 'BUSTED';
      this.el('end-text').textContent = 'The Solmar Bay PD caught up with you. $150 fine, and the job starts over.';
    } else {
      this.el('end-title').textContent = 'WASTED';
      this.el('end-text').textContent = 'Rex went down hard. The crew patched him up — the job starts over.';
    }
    this.el('end-screen').classList.add('show');
  }

  hideEnd() {
    this.el('end-screen').classList.remove('show');
  }

  showStart(hasSave) {
    this.el('start-screen').classList.add('show');
    this.el('btn-continue').style.display = hasSave ? '' : 'none';
  }

  hideStart() {
    this.el('start-screen').classList.remove('show');
  }

  showPause(show) {
    this.el('pause-screen').classList.toggle('show', show);
  }

  flashDamage() {
    this.damageFlash.classList.add('hit');
    setTimeout(() => this.damageFlash.classList.remove('hit'), 180);
  }

  update(ctx) {
    const player = ctx.player;
    const hp = Math.max(0, Math.round(player.health));
    this.healthFill.style.width = `${hp}%`;
    this.healthFill.style.background = hp > 50 ? '#58c96b' : hp > 25 ? '#ffc53d' : '#e5534b';
    this.healthText.textContent = `${hp}`;
    this.cashEl.textContent = `$${player.cash.toLocaleString('en-US')}`;
    this._starSpans.forEach((s, i) => s.classList.toggle('lit', i < ctx.wanted.stars));
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.inCar.speed) * 3.6);
      this.speedEl.textContent = `${kmh} km/h`;
      this.speedEl.style.display = '';
      const carHp = Math.max(0, Math.round(player.inCar.health));
      this.ammoEl.textContent = `CAR ${carHp}%`;
    } else {
      this.speedEl.style.display = 'none';
      this.ammoEl.textContent = player.reloading > 0 ? 'RELOADING…' : `AMMO ${player.ammo}/${COMBAT.magazine}`;
    }
    this.crosshair.style.display = player.inCar ? 'none' : '';
    // Context hint: steal a car, or get out of one.
    if (!player.inCar) {
      const car = player.nearbyCar(ctx.traffic, ctx.parkedCars, 4);
      this.hintEl.textContent = car ? 'E — Steal car' : '';
    } else {
      this.hintEl.textContent = 'E — Get out';
    }
    this._drawMinimap(ctx);
  }

  _drawMinimap(ctx) {
    const c = this.mapCtx;
    const S = this.minimap.width;
    const toMap = (v) => ((v + 200) / 400) * S;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#20262e';
    c.fillRect(0, 0, S, S);
    // Ocean strip on the east edge.
    c.fillStyle = '#1e7fa8';
    c.fillRect(toMap(175), 0, S - toMap(175), S);
    c.fillStyle = '#e8cf9e';
    c.fillRect(toMap(168), 0, toMap(178) - toMap(168), S);
    // Roads.
    c.strokeStyle = '#565d66';
    c.lineWidth = 5;
    for (const line of ctx.world.roadLines) {
      c.beginPath();
      c.moveTo(toMap(line), 0);
      c.lineTo(toMap(line), S);
      c.stroke();
      c.beginPath();
      c.moveTo(0, toMap(line));
      c.lineTo(S, toMap(line));
      c.stroke();
    }
    // Mission marker.
    const target = ctx.missions._objectiveTarget ? ctx.missions._objectiveTarget() : null;
    if (target && ctx.missions.active) {
      const px = toMap(target.x);
      const py = toMap(target.z);
      c.fillStyle = '#ffc53d';
      c.beginPath();
      c.moveTo(px, py - 7);
      c.lineTo(px + 6, py);
      c.lineTo(px, py + 7);
      c.lineTo(px - 6, py);
      c.closePath();
      c.fill();
    }
    // Traffic dots.
    c.fillStyle = '#cfd6dd';
    for (const t of ctx.traffic.cars) {
      c.fillRect(toMap(t.car.x) - 1.5, toMap(t.car.z) - 1.5, 3, 3);
    }
    // Police: flashing blue.
    c.fillStyle = '#5aa2ff';
    for (const car of ctx.police.cars) {
      c.beginPath();
      c.arc(toMap(car.x), toMap(car.z), 3.5, 0, Math.PI * 2);
      c.fill();
    }
    for (const cop of ctx.police.footCops) {
      c.beginPath();
      c.arc(toMap(cop.x), toMap(cop.z), 2.5, 0, Math.PI * 2);
      c.fill();
    }
    // Player arrow.
    const player = ctx.player;
    const px = toMap(player.inCar ? player.inCar.x : player.x);
    const py = toMap(player.inCar ? player.inCar.z : player.z);
    const heading = player.inCar ? player.inCar.heading : player.heading;
    c.save();
    c.translate(px, py);
    c.rotate(Math.PI / 2 - heading);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 5);
    c.lineTo(-5, 5);
    c.closePath();
    c.fill();
    c.restore();
  }
}
