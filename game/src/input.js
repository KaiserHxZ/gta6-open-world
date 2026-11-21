// Solmar Bay — keyboard and mouse state, read by the player and the camera.
// Keys are tracked by their physical code so layouts do not matter.

const Input = {
  keys: {},
  mouseDown: false,
  mouseX: 0,
  mouseY: 0,
  dragDX: 0,
  dragDY: 0,
  dragging: false,
  _lastX: 0,
  _lastY: 0,
  // One-shot presses, queued by the event handlers so a quick press is never
  // lost between two frames (slow displays can otherwise miss it entirely).
  pressed: {},
  clicked: false,
  // Set to {axes:{x,y}, keys:{CODE:true}} to drive the game from a script
  // (the screenshot scenes); null means live keyboard and mouse.
  scripted: null,

  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys[e.code] = true;
      if (!e.repeat) this.pressed[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouseDown = false;
      this.dragging = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.clicked = true;
      this.dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.dragging) {
        this.dragDX += e.clientX - this._lastX;
        this.dragDY += e.clientY - this._lastY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // True while the key is held down.
  down(code) {
    if (this.scripted) return !!this.scripted.keys[code];
    return !!this.keys[code];
  },

  // True once for a key pressed since the last call (never counted twice).
  takePressed(code) {
    if (this.scripted) return !!this.scripted.keys[code];
    if (this.pressed[code]) {
      this.pressed[code] = false;
      return true;
    }
    return false;
  },

  // True once for a mouse click since the last call.
  takeClicked() {
    if (this.scripted) return false;
    if (this.clicked) {
      this.clicked = false;
      return true;
    }
    return false;
  },

  // Consume the accumulated mouse drag since the last frame (pixels).
  takeDrag() {
    if (this.scripted) return { dx: 0, dy: 0 };
    const dx = this.dragDX;
    const dy = this.dragDY;
    this.dragDX = 0;
    this.dragDY = 0;
    return { dx, dy };
  },

  // WASD / arrows as a -1..1 pair, already normalised.
  moveAxes() {
    if (this.scripted) return this.scripted.axes;
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  },
};
