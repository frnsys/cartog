'use strict';

let RESOURCES_TEXT_SIZE = 16;
let RESOURCES_POSITION = [10, 10];
let MESSAGES_TEXT_SIZE = 16;
let METERS_TEXT_SIZE = 12;
let METERS_BAR_HEIGHT = 16;
let METERS_BAR_WIDTH = 120;
let GRID_ZOOM_SCALE = 1/20;
let GRID_ZOOM_SCALE_MIN = 0.5;
let GRID_ZOOM_SCALE_MAX = 2;
const GAME = {
  meters: [],
  messages: [],
  harvesters: [],
  images: {},
  alphaImageCache: {},
  bonuses: [],
  timers: [],
  tooltip: null,
  hoveredCell: null,
  grid: null,
  paused: false,
  backgroundColor: [54, 193, 79],
  scale: 1
};

// setup UI elements
const overlayEl = document.createElement('div');
document.body.appendChild(overlayEl);
overlayEl.id = 'overlay';

const menusEl = document.createElement('div');
document.body.appendChild(menusEl);
menusEl.id = 'menus';

// --- UTIL

// schedule a function to be run every ms millseconds
function every(fn, ms) {
  return new Timer(fn, ms, true);
}

// schedule a function to run in ms milliseconds
function schedule(fn, ms) {
  return new Timer(fn, ms);
}

function numberWithCommas(x) {
  return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function isConstructor(obj) {
  return !!obj.prototype && !!obj.prototype.constructor.name;
}

function stringifyCost(cost, delimiter) {
  delimiter = delimiter || ', ';
  let costs = [];
  Object.keys(cost).forEach((k) => {
    let name = RESOURCES[k] || k;
    let body = `${name} ${numberWithCommas(cost[k])}`;
    costs.push(body);
  });
  return costs.join(delimiter);
}

function randomChoice(arr) {
  let idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

// --- TIME

class Timer {
  // timer that can be paused/resumed.
  // set repeat=true to use as an interval timer.
  constructor(fn, ms, repeat) {
    this.fn = fn;
    this.ms = ms;
    this.remaining = ms;
    this.repeat = repeat || false;
    GAME.timers.push(this);

    if (!GAME.paused) {
      this.resume();
    }
  }

  pause() {
    clearTimeout(this.id);
    this.remaining -= new Date() - this.start;
  }

  resume() {
    this.start = new Date();
    clearTimeout(this.id);
    this.id = setTimeout(() => {
      this.fn();

      if (this.repeat) {
        this.remaining = this.ms;
        this.resume();
      } else {
        this.delete();
      }
    }, this.remaining);
  }

  delete() {
    // remove from timers
    let idx = GAME.timers.indexOf(this);
    GAME.timers.splice(idx, 1);
  }
}


function pause() {
  GAME.paused = true;
  GAME.timers.forEach((t) => t.pause());
}

function resume() {
  GAME.paused = false;
  GAME.timers.forEach((t) => t.resume());
}


// --- RESOURCES

// a harvester is a function that
// returns a change in resource value
function defineHarvester(name, fn, time) {
  if (!(name in GAME.harvesters)) {
   GAME.harvesters[name] = [];
  }
  let interval = every(() => {
    STATE.resources[name] += fn();
  }, time);
  GAME.harvesters[name].push(interval);
}

// --- BUYING

function canAfford(item) {
  if (item.cost) {
    return Object.keys(item.cost).every((k) => {
      return STATE.resources[k] >= item.cost[k];
    });
  }
  return true;
}

function buy(item) {
  if (!canAfford(item)) {
    return false;
  }
  if (item.cost) {
    Object.keys(item.cost).forEach((k) => {
      STATE.resources[k] -= item.cost[k];
    });
  }
  return true;
}

// handy func to pass to buttons
// that just involve buying things
function tryBuy(cls, cb) {
  let fn = () => {
    let o = isConstructor(cls) ? new cls() : cls;
    let bought = false;

    // Items are bought on placement
    if (o instanceof Item) {
      GAME.selected = o;
      GAME.selectedCls = cls;
      bought = true;

    // everything else (Actions & Bonuses)
    // are bought on click
    } else if (buy(o)) {
      if (o instanceof Bonus) {
        GAME.bonuses.push(o.name);
        saveBonus(o);
      }
      if (o.effect) {
        o.effect();
      }
      bought = true;
    }
    if (bought && cb) {
      cb();
    }
    return bought;
  };

  fn.item = isConstructor(cls) ? new cls() : cls;
  return fn;
}

// --- THINGS & BONUSES

class Bonus {
  constructor(name, description, cost, effect) {
    this.name = name;
    this.description = description;
    this.effect = effect;
    this.cost = cost;
  }
}

function hasBonus(name) {
  return GAME.bonuses.includes(name);
}

class Item {
  constructor() {
    this.level = 0;
    this.init();
  }

  init() {}
  update(neighbors) {}

  render(g, x, y, w, h) {
    let name = this.image;
    let im = GAME.images[name];
    g.image(im, x, y, w, h);
  }

  destroy() {
    this.grid.remove(this.x, this.y);
    this.onDestroy();
  }

  onClick() {
    throw Error('Not implemented');
  }

  onPlace() {}
  onDestroy() {}

  get info() {
    throw Error('Not implemented');
  }

  get cost() {
    throw Error('Not implemented');
  }

  get image() {
    throw Error('Not implemented');
  }
}

// --- GRID

class Grid {
  constructor(rows, cols, cellSize, defaultCell) {
    defaultCell = defaultCell || Cell;
    this.needsUpdate = true;
    this.offset = {x: 0, y: 0};
    this.nCols = cols;
    this.nRows = rows;
    this.setCellSize(cellSize);

    // initialize null grid of
    // dimensions width x height
    this.grid = [];
    for (let i=0; i<this.nCols; i++) {
      this.grid[i] = [];
      for (let j=0; j<this.nRows; j++) {
        let cell = new defaultCell();
        cell.x = i;
        cell.y = j;
        this.grid[i].push(cell);
      }
    }

    this.g = createGraphics(window.innerWidth, window.innerHeight);
  }

  setCellSize(cellSize) {
    this.cellSize = cellSize;
    this.cellWidth = cellSize;
    this.cellHeight = cellSize;
    this.width = this.nCols * this.cellWidth;
    this.height = this.nRows * this.cellHeight;
    this.needsUpdate = true;
  }

  // place an item at x, y
  // will overwrite previous item
  place(item, x, y) {
    // TODO should this check cell.canPlace?
    // or assume if you're using this, override?
    let cell = this.cellAt(x, y);
    cell.item = item;
    item.x = x;
    item.y = y;
    item.grid = this;
    cell.needsUpdate = true;
  }

  cellAt(x, y) {
    return this.grid[x][y];
  }

  setCellAt(cell, x, y) {
    cell.x = x;
    cell.y = y;
    this.grid[x][y] = cell;
    cell.needsUpdate = true;
  }

  get cells() {
    return this.grid.reduce((acc, val) => acc.concat(val), []);
  }

  get emptyCells() {
    return this.grid.reduce((acc, val) => acc.concat(val), []).filter((c) => !c.item);
  }

  neighborPositionsAt(x, y) {
    let positions = [];
    if (x > 0) {
      positions.push([x-1, y]);
      if (y > 0) positions.push([x-1, y-1]);
      if (y<this.nRows-1) positions.push([x-1, y+1]);
    }
    if (x<this.nCols-1) {
      positions.push([x+1, y]);
      if (y>0) positions.push([x+1, y-1]);
      if (y<this.nRows-1) positions.push([x+1, y+1]);
    }
    if (y>0) positions.push([x, y-1]);
    if (y<this.nRows-1) positions.push([x, y+1]);
    return positions;
  }

  neighborsAt(x, y) {
    return this.neighborPositionsAt(x, y).map((pos) => {
      let cell = this.cellAt(pos[0], pos[1]);
      return {
        x: pos[0],
        y: pos[1],
        cell: cell,
        item: cell.item,
      };
    });
  }

  update() {
    this.grid.forEach((row, x) => {
      row.forEach((cell, y) => {
        let item = cell.item;
        let neighbors = this.neighborsAt(x, y);
        if (item) {
          item.update(neighbors);
        }
        cell.update(neighbors);
      });
    });
  }

  renderCell(cell, x, y) {
    let x_ = (x*this.cellWidth) + this.x;
    let y_ = (y*this.cellHeight) + this.y;
    this.g.fill(...cell.color);
    if (cell.image) {
      cell.render(this.g, x_, y_, this.cellWidth, this.cellHeight);
    } else {
      this.g.rect(x_, y_, this.cellWidth, this.cellHeight);
    }
    if (cell.item) {
      cell.item.render(this.g, x_, y_, this.cellWidth, this.cellHeight);
    }
  }

  render() {
    this.x = window.innerWidth/2 - this.width/2 + this.offset.x;
    this.y = window.innerHeight/2 - this.height/2 + this.offset.y;

    if (this.needsUpdate) {
      if (GAME.backgroundImage) {
        this.g.background(GAME.backgroundImage);
      } else {
        this.g.background(...GAME.backgroundColor);
      }
    }
    this.g.strokeWeight(0.2);
    this.grid.forEach((row, x) => {
      row.forEach((cell, y) => {
        if (cell.needsUpdate || this.needsUpdate) {
          this.renderCell(cell, x, y);
          cell.needsUpdate = false;
        }
      });
    });
    this.needsUpdate = false;

    renderGraphic(this.g, 0, 0);
  }

  inside(x, y) {
    return x >= 0 && x < this.nCols && y >= 0 && y < this.nRows;
  }

  convertCoord(x, y) {
    // translate to internal coordinates
    let x_ = x - this.x;
    let y_ = y - this.y;
    x_ = floor(x_/this.cellWidth);
    y_ = floor(y_/this.cellHeight);
    return [x_, y_];
  }

  cellAtPx(x, y) {
    let coord = this.convertCoord(x, y);
    let x_ = coord[0];
    let y_ = coord[1];
    if (this.inside(x_, y_)) {
      return this.grid[x_][y_];
    }
    return undefined;
  }

  enterCell(x, y) {
    let cell = this.cellAtPx(x, y);
    if (cell) {
      if (cell != GAME.hoveredCell) {
        GAME.hoveredCell = cell;
        if (cell.item && cell.item.info) {
          GAME.tooltip = renderTooltip(cell.item.info);
          return true;
        } else if (!cell.item && cell.info) {
          GAME.tooltip = renderTooltip(cell.info);
          return true;
        }
      }
      return true;
    }
    return false;
  }

  clickCell(x, y) {
    let cell = this.cellAtPx(x, y);
    if (!cell) return false;
    if (cell.item) {
      cell.item.onClick();
    } else if (GAME.selected) {
      if (!cell.canPlace(GAME.selected)) {
        showMessage('This can\'t be placed here');
        return;
      } else if (buy(GAME.selected)) {
        let item = new GAME.selectedCls();
        let coord = this.convertCoord(x, y);
        let x_ = coord[0];
        let y_ = coord[1];
        this.place(item, x_, y_);
        if (item.onPlace) item.onPlace();
      } else {
        showMessage(`You can't afford this (${stringifyCost(GAME.selected.cost)})`);
      }
    } else {
      cell.onClick();
    }

    // assume that if a cell is clicked,
    // it needs to be re-rendered
    cell.needsUpdate = true;
    return true;
  }

  remove(x, y) {
    let cell = this.cellAt(x, y);
    cell.item = null;
    cell.needsUpdate = true;
  }
}


function makeHexagon(g, x, y, size) {
  g.beginShape();
  for (var i=0; i<6; i++) {
    let angle_deg = 60 * i + 30;
    let angle_rad = PI / 180 * angle_deg;
    let vx = x + size * Math.cos(angle_rad);
    let vy = y + size * Math.sin(angle_rad);
    g.vertex(vx, vy);
  }
  g.endShape(CLOSE);
  return g;
}

class HexGrid extends Grid {
  setCellSize(cellSize) {
    this.cellSize = cellSize;
    this.size = this.cellSize/2;
    this.cellHeight = this.size * 2;
    this.cellWidth = Math.sqrt(3)/2 * this.cellHeight;
    this.mask = createGraphics(this.cellWidth, this.cellHeight);
    this.mask = makeHexagon(this.mask, this.cellWidth/2, this.cellHeight/2, this.size);
    this.width = this.nCols * this.cellWidth + this.cellWidth/2;
    this.height = this.nRows * (this.cellHeight * 3/4) + (this.cellHeight * 1/4);
    this.needsUpdate = true;
  }

  renderCell(cell, x, y) {
    let x_ = x*this.cellWidth + this.cellWidth/2 + this.x;
    let y_ = y*(this.cellHeight*3/4) + this.cellHeight/2 + this.y;
    if (y % 2 == 1) {
      x_ += this.cellWidth/2;
    }
    this.g.fill(...cell.color);
    if (cell.image) {
      cell.render(this.g, x_-this.cellWidth/2, y_-this.cellHeight/2, this.cellWidth, this.cellHeight);
    } else {
      makeHexagon(this.g, x_, y_, this.size);
    }
    if (cell.item) {
      cell.item.render(this.g, x_-this.cellWidth/2, y_-this.cellHeight/2, this.cellWidth, this.cellHeight);
    }
  }

  neighborPositionsAt(x, y) {
    let positions = [];
    if (y % 2 == 0) {
      if (x > 0) {
        positions.push([x-1, y]);
        if (y > 0) positions.push([x-1,y-1]);
        if (y < this.nRows-1) positions.push([x-1,y+1]);
      }
      if (x < this.nCols-1) positions.push([x+1, y]);
      if (y > 0) positions.push([x,y-1]);
      if (y < this.nRows-1) positions.push([x,y+1]);
    } else {
      if (x > 0) positions.push([x-1, y]);
      if (x < this.nCols-1) {
        positions.push([x+1, y]);
        if (y > 0) positions.push([x+1,y-1]);
        if (y < this.nRows-1) positions.push([x+1,y+1]);
      }
      if (y > 0) positions.push([x,y-1]);
      if (y < this.nRows-1) positions.push([x,y+1]);
    }
    return positions;
  }

  convertCoord(x, y) {
    // translate to internal coordinates
    x = x - this.x - this.cellWidth/2;
    y = y - this.y - this.cellHeight/2;

    // ty <https://www.redblobgames.com/grids/hexagons/>
    // to axial
    let q = (x * Math.sqrt(3)/3 - y / 3) / this.size;
    let r = y * 2/3 /this.size;

    // to cube
    let z = r;
    x = q;
    y = -x-z;
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    let x_diff = Math.abs(rx - x);
    let y_diff = Math.abs(ry - y);
    let z_diff = Math.abs(rz - z);
    if (x_diff > y_diff && x_diff > z_diff) {
      rx = -ry-rz;
    } else if (y_diff > z_diff) {
      ry = -rx-rz;
    } else {
      rz = -rx-ry;
    }

    // to offset
    let col = rx + (rz - (rz&1)) / 2
    let row = rz
    return [col, row];
  }
}

class Cell {
  constructor() {
    this.item = null;
    this.needsUpdate = true;
    this.init();
  }

  init() {}

  get info() {}
  update(neighbors) {}

  get color() {
    return GRID_EMPTY;
  }

  get image() {}

  render(g, x, y, w, h) {
    let name = this.image;
    let im = GAME.images[name];
    g.image(im, x, y, w, h);
  }

  canPlace(item) {
    return true;
  }

  onClick() {}
}

// convenience method for placing
// on the game grid
function place(item, x, y) {
  GAME.grid.place(item, x, y);
}

function setCellAt(cell, x, y) {
  GAME.grid.setCellAt(cell, x, y);
}

// --- UI

const messagePadding = 6;

function showMessage(text, color, timeout, size) {
  // no support for text wrapping
  color = color || (typeof TEXT_DEFAULT_COLOR === 'undefined' ? [0,0,0] : TEXT_DEFAULT_COLOR);
  timeout = timeout || 5000;
  size = size || MESSAGES_TEXT_SIZE;

  // may be a better way,
  // but get the proper width for the text
  let dummyG = createGraphics(0, 0);
  dummyG.textSize(size);
  let width = dummyG.textWidth(text);

  let g = createGraphics(width*2, size*2);
  g.fill(...color);
  // g.background(0,255,0); // DEBUG
  g.textSize(size);
  g.textAlign(LEFT, CENTER);
  g.text(text, 0, size/2);

  GAME.messages.push(g);
  schedule(() => {
    let idx = GAME.messages.indexOf(g);
    let msg = GAME.messages.splice(idx, 1)[0];
    msg.remove();
  }, timeout);
}

function showModal(title, text, buttons) {
  let modal = new Modal(title, text, buttons);
}

function renderMessages(x, y) {
  GAME.messages.forEach((g, i) => {
    let y_ = y + ((messagePadding + g.height/2) * i);
    renderGraphic(g, x, y_);
  });
}

function renderResources(top, right, size) {
  size = size || RESOURCES_TEXT_SIZE;
  let height = size;
  let padding = 5;
  let color = typeof TEXT_DEFAULT_COLOR === 'undefined' ? [0,0,0] : TEXT_DEFAULT_COLOR;
  Object.keys(STATE.resources).forEach((k, i) => {
    let name = RESOURCES[k] || k;
    let body = `${name} ${numberWithCommas(STATE.resources[k])}`;
    let width = textWidth(body);
    fill(...color);
    textSize(size);
    text(body, window.innerWidth - width - right, top + height/2 + ((height + padding) * i));
  });
}

function renderTooltip(text, size, padding) {
  size = size || 16;
  padding = padding || 10;
  let width = textWidth(text);
  let g = createGraphics(width + padding*2, size + padding*2 - size/2);
  g.fill(255,255,255);
  g.background(30,30,30);
  g.text(text, padding, padding + size/2);
  return g;
}

class Menu {
  constructor(title, buttons) {
    this.title = title;
    this.buttons = buttons;

    let menuButton = document.createElement('div');
    menuButton.classList.add('button');
    menuButton.innerHTML = this.title;
    menuButton.addEventListener('click', () => this.render());
    menusEl.appendChild(menuButton);
  }

  addButton(button) {
    this.buttons.push(button);
  }

  render() {
    pause();
    let el = document.createElement('div');

    let title = document.createElement('h1');
    title.innerHTML = this.title;
    el.appendChild(title);

    let buttons = this.buttons.slice();
    buttons.push(new Button('Close', () => {}));

    buttons.forEach((b) => {
      if (b.show()) {
        let bEl = b.render();
        el.appendChild(bEl);
      }
    });

    renderModal(el);
  }
}

class Button {
  constructor(text, onClick, showPredicate) {
    this.text = text;
    this.onClick = onClick;
    this.item = this.onClick.item;
    this.show = showPredicate || (() => true);
  }

  render() {
    let bEl = document.createElement('div');
    let enabled = true;
    bEl.classList.add('button');
    bEl.innerHTML = this.text;
    if (this.item) {
      let cost = stringifyCost(this.item.cost);
      if (!this.item.description) {
        useTooltip(bEl, `Costs: ${cost}`);
      } else {
        useTooltip(bEl, `${this.item.description} (${cost})`);
      }
      enabled = canAfford(this.item);
    }

    if (enabled) {
      bEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        overlayEl.style.display = 'none';
        tooltip.style.display = 'none';
        this.onClick();
        resume();
      });
    } else {
      bEl.style.opacity = 0.2;
    }
    return bEl;
  }
}

class BuyButton extends Button {
  constructor(text, cls, cb, showPredicate) {
    // bonuses can only be purchased once,
    // if the bonus is already owned,
    // don't show the buttons for it
    cb = cb || (() => {});
    showPredicate = showPredicate || (() => {
      if (cls instanceof Bonus && hasBonus(cls.name)) {
        return false;
      }
      return true;
    })
    super(text, tryBuy(cls, cb), showPredicate);
  }
}

class Meter {
  constructor(name, init, fillColor, bgColor) {
    this.name = name;
    this.textSize = METERS_TEXT_SIZE;
    this.spacing = 2;
    this.barHeight = METERS_BAR_HEIGHT;
    this.barWidth = METERS_BAR_WIDTH;
    this.width = Math.max(this.barWidth, textWidth(name));
    this.height = this.barHeight + this.textSize + this.spacing;
    this.g = createGraphics(this.width, this.height);
    this.fillColor = fillColor || [255,0,0];
    this.bgColor = bgColor || [50,50,50];
    this.update(init);

    // draw the text once
    this.g.textSize(this.textSize);
    this.g.textAlign(LEFT, TOP);
    this.g.fill(...this.bgColor);
    this.g.text(this.name, 0, this.barHeight + this.spacing);

    GAME.meters.push(this);
  }

  // val should be in [0, 100];
  update(val) {
    val = Math.max(Math.min(val, 100), 0);
    if (val !== this.val) {
      this.val = val;
      this.g.noStroke();
      this.g.fill(...this.bgColor);
      this.g.rect(0, 0, this.barWidth, this.barHeight);
      this.g.fill(...this.fillColor);
      this.g.rect(0, 0, this.barWidth*(this.val/100), this.barHeight);
    }
  }
}

function renderMeters() {
  let spacing = 10;
  let totalSpacing = spacing * (GAME.meters.length - 1);
  let width = totalSpacing + GAME.meters.reduce((acc, val) => {
    return acc + val.width;
  }, 0);
  let left = window.innerWidth/2 - width/2;
  let offset = 0;
  GAME.meters.forEach((m, i) => {
    renderGraphic(m.g, left + offset, 10);
    offset += m.width + spacing;
  });
}

class Modal {
  constructor(title, text, buttons) {
    this.title = title;
    this.text = text;
    this.buttons = buttons || [new Button('OK', () => {})];

    // assume you want to show it as soon as it's created
    this.render();
  }

  render() {
    pause();
    let el = document.createElement('div');

    let title = document.createElement('h1');
    title.innerHTML = this.title;
    el.appendChild(title);

    let body = document.createElement('p');
    body.innerHTML = this.text;
    el.appendChild(body);

    this.buttons.forEach((b) => {
      let bEl = b.render();
      el.appendChild(bEl);
    });

    renderModal(el);
  }
}

function renderModal(child) {
  while (overlayEl.firstChild) {
    overlayEl.removeChild(overlayEl.firstChild);
  }
  let el = document.createElement('div');
  el.classList.add('modal');
  el.appendChild(child);

  overlayEl.appendChild(el);
  overlayEl.style.display = 'block';
}

function renderGraphic(g, x, y) {
  // work around for
  // https://github.com/processing/p5.js/issues/2077
  copy(g, 0, 0, g.width, g.height, x, y, g.width, g.height);
}

// more semantic
class Event extends Modal {};
class Action extends BuyButton {
  constructor(text, cost, effect) {
    let action = {cost: cost, effect: effect};
    super(text, action);
  }
};

function imageWithAlpha(src, alpha) {
  let buf = createImage(src.width, src.height);
  let img = createImage(src.width, src.height);

  buf.loadPixels();
  for(var x = 0; x < buf.width; x++) {
    for(var y = 0; y < buf.height; y++) {
      buf.set(x, y, [0, 0, 0, alpha]);
    }
  }
  buf.updatePixels();

  img.copy(src, 0, 0, src.width, src.height, 0, 0, img.width, img.height);
  img.mask(buf);
  return img;
}

// setup tooltip for buttons
const tooltip = document.createElement('div');
tooltip.classList.add('tooltip');
tooltip.style.position = 'absolute';
tooltip.style.padding = '0.3em 0.6em';
tooltip.style.background = '#333';
tooltip.style.color = '#fff';
tooltip.style.display = 'none';
tooltip.style.zIndex = '10';
this.addEventListener('mousemove', (ev) => {
  tooltip.style.left = `${ev.pageX + 5}px`;

  let top = ev.pageY + 5;
  if (tooltip.clientHeight + top > window.innerHeight) {
    top -= tooltip.clientHeight;
  }
  tooltip.style.top = `${top}px`;
});
document.body.appendChild(tooltip);

// setup bonuses list
const bonuses = document.createElement('div');
bonuses.classList.add('bonuses');
bonuses.style.position = 'absolute';
bonuses.style.padding = '0.3em 0.6em';
bonuses.style.bottom = '0'
bonuses.style.left = '0'
document.body.appendChild(bonuses);

function saveBonus(bonus) {
  let bEl = document.createElement('div');
  bEl.innerText = bonus.name;
  useTooltip(bEl, bonus.description);
  bonuses.appendChild(bEl);
}

function useTooltip(el, text) {
  el.addEventListener('mouseenter', (ev) => {
    tooltip.style.display = 'block';
    tooltip.innerText = text;
  });
  el.addEventListener('mouseleave', (ev) => {
    tooltip.style.display = 'none';
  });
}

// --- P5JS

function setup() {
  createCanvas(window.innerWidth, window.innerHeight);
  let defaultCell = typeof GRID_DEFAULT_CELL === 'undefined' ? Cell : GRID_DEFAULT_CELL;
  if (typeof GRID_TYPE !== 'undefined' && GRID_TYPE === 'hex') {
    GAME.grid = new HexGrid(GRID_ROWS, GRID_COLS, GRID_CELL_SIZE, defaultCell);

    // pre-mask images as needed
    // so they aren't re-masked every frame
    // (much better performance)
    Object.keys(GAME.images).forEach((k) => {
      let img = GAME.images[k];
      // mask to hex shape
      img.mask(GAME.grid.mask);
    });
  } else {
    GAME.grid = new Grid(GRID_ROWS, GRID_COLS, GRID_CELL_SIZE, defaultCell);
  }

  // pre-compute images with alpha
  Object.keys(GAME.images).forEach((k) => {
    let img = GAME.images[k];
    // resize to size needed, for performance reasons
    img.resize(GAME.grid.cellWidth, GAME.grid.cellHeight);
    GAME.alphaImageCache[k] = imageWithAlpha(img, 100);
  });

  init();
}

// resize canvas when the browser window resizes
function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);

  // p5js doesn't make it easy to resize a graphics,
  // easier to just recreate
  GAME.grid.g.remove();
  GAME.grid.g = createGraphics(window.innerWidth, window.innerHeight);
  GAME.grid.needsUpdate = true;
}

function preload() {
  Object.keys(IMAGES).forEach((k) => {
    let path = IMAGES[k];
    GAME.images[k] = loadImage(path);
  });
  if (typeof BACKGROUND_IMAGE !== 'undefined') {
    GAME.backgroundImage = loadImage(BACKGROUND_IMAGE);
  } else if (typeof BACKGROUND_COLOR !== 'undefined') {
    GAME.backgroundColor = BACKGROUND_COLOR;
  }
}

function draw() {
  textAlign(LEFT, TOP);
  main();

  if (!GAME.paused) {
    GAME.grid.update();
  }
  GAME.grid.render();
  renderMessages(10, 10);
  renderResources(RESOURCES_POSITION[0], RESOURCES_POSITION[1]);
  renderMeters();
  if (GAME.tooltip) {
    renderGraphic(GAME.tooltip, mouseX, mouseY);
  }

  // draw selected item
  if (GAME.selected) {
    let name = GAME.selected.image
    let img = GAME.images[name];
    if (!canAfford(GAME.selected)) {
      img = GAME.alphaImageCache[name];
    }
    image(img, mouseX, mouseY, GAME.grid.cellWidth, GAME.grid.cellHeight);
    text(stringifyCost(GAME.selected.cost, '\n'), mouseX, mouseY + GAME.grid.cellHeight + 6);
  }

  // DEBUGGING
  // var fps = frameRate();
  // fill(255);
  // stroke(0);
  // text('FPS: ' + fps.toFixed(2), 10, 10);
}


// --- INTERACTION

function mouseMoved() {
  if (GAME.grid) {
    if (!GAME.grid.enterCell(mouseX, mouseY)) {
      if (GAME.tooltip) {
        GAME.tooltip.remove();
      }
      GAME.tooltip = null;
      GAME.hoveredCell = null;
    }
  }
}

function mousePressed() {
  // for tracking dragging
  GAME.lastMouseX = mouseX;
  GAME.lastMouseY = mouseY;
}

function mouseClicked() {
  if (GAME.grid) {
    if (!GAME.grid.clickCell(mouseX, mouseY)) {
      GAME.selected = null;
    }
  }
}

function mouseDragged() {
  // make grid draggable
  let mouseXDiff = mouseX - GAME.lastMouseX;
  let mouseYDiff = mouseY - GAME.lastMouseY;
  GAME.lastMouseX = mouseX;
  GAME.lastMouseY = mouseY;

  if (GAME.grid && (typeof GRID_DRAG === 'undefined' || GRID_DRAG)) {
    GAME.grid.offset.x += mouseXDiff;
    GAME.grid.offset.y += mouseYDiff;
    GAME.grid.needsUpdate = true;
  }
}

function mouseWheel(event) {
  if (GAME.grid && (typeof GRID_DRAG === 'undefined' || GRID_ZOOM)) {
    GAME.scale -= event.delta * GRID_ZOOM_SCALE;
    GAME.scale = Math.max(GRID_ZOOM_SCALE_MIN, GAME.scale);
    GAME.scale = Math.min(GRID_ZOOM_SCALE_MAX, GAME.scale);
    GAME.grid.setCellSize(GRID_CELL_SIZE*GAME.scale);
  }
}