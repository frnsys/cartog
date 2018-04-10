'use strict';

const GAME = {
  messages: [],
  harvesters: [],
  images: {},
  bonuses: [],
  tooltip: null,
  grid: null
};

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
  tooltip.style.top = `${ev.pageY + 5}px`;
});
document.body.appendChild(tooltip);

// --- UTIL

// schedule a function to be run every ms millseconds
function every(ms, fn) {
  return setInterval(fn, ms);
}

// schedule a function to run in ms milliseconds
function schedule(ms, fn) {
  return setTimeout(fn, ms);
}

function numberWithCommas(x) {
  return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function isConstructor(obj) {
  return !!obj.prototype && !!obj.prototype.constructor.name;
}

function renderCost(cost) {
  let costs = [];
  Object.keys(cost).forEach((k) => {
    let name = RESOURCES[k] || k;
    let body = `${name} ${numberWithCommas(cost[k])}`;
    costs.push(body);
  });
  return costs.join(', ');
}

// --- RESOURCES

// a harvester is a function that
// returns a change in resource value
function defineHarvester(name, fn, time) {
  if (!(name in GAME.harvesters)) {
   GAME.harvesters[name] = [];
  }
  let interval = setInterval(() => {
    STATE.resources[name] += fn();
  }, time);
  GAME.harvesters[name].push(interval);
}

// --- BUYING

function canAfford(obj) {
  if (obj.cost) {
    return Object.keys(obj.cost).every((k) => {
      return STATE.resources[k] >= obj.cost[k];
    });
  }
  return true;
}

function buy(obj) {
  if (!canAfford(obj)) {
    return false;
  }
  if (obj.cost) {
    Object.keys(obj.cost).forEach((k) => {
      STATE.resources[k] -= obj.cost[k];
    });
  }
  return true;
}

// handy func to pass to buttons
// that just involve buying things
function tryBuy(cls, onSuccess) {
  let fn = () => {
    let o = isConstructor(cls) ? new cls() : cls;
    if (buy(o)) {
      if (o instanceof Item) {
        GAME.selected = o;
      } else if (o instanceof Bonus) {
        if (o.effect) o.effect();
        GAME.bonuses.push(o.name);
      }
      if (onSuccess) onSuccess(o);
    } else {
      let cost = renderCost(o.cost);
      let modal = new Modal('You can\'t afford this', `This costs ${cost}`);
    }
  };

  fn.obj = isConstructor(cls) ? new cls() : cls;
  return fn;
}

// --- THINGS & BONUSES

class Bonus {
  constructor(name, cost, effect) {
    this.name = name;
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
  }

  onClick() {
    throw Error('Not implemented');
  }

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
  constructor(width, height, cellSize) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.nCols = width/cellSize;
    this.nRows = height/cellSize;

    // initialize null grid of
    // dimensions width x height
    this.grid = [];
    for (let i=0; i<this.nCols; i++) {
      this.grid[i] = [];
      for (let j=0; j<this.nRows; j++) {
        this.grid[i].push(null);
      }
    }

    this.g = createGraphics(this.width, this.height);
  }

  // place an object at x, y
  // will overwrite previous object
  place(obj, x, y) {
    this.grid[x][y] = obj;
    obj.x = x;
    obj.y = y;
    obj.grid = this;
  }

  update() {
    this.grid.forEach((row, x) => {
      row.forEach((obj, y) => {
        if (obj) {
          let neighbors = [];
          if (x>0) {
            neighbors.push({
              x: x-1,
              y: y,
              item: this.grid[x-1][y]
            });
            if (y>0) {
              neighbors.push({
                x: x-1,
                y: y-1,
                item: this.grid[x-1][y-1]
              });
            }
            if (y<this.nRows-1) {
              neighbors.push({
                x: x-1,
                y: y+1,
                item: this.grid[x-1][y+1]
              });
            }
          }
          if (x<this.nCols-1) {
            neighbors.push({
              x: x+1,
              y: y,
              item: this.grid[x+1][y]
            });
            if (y>0) {
              neighbors.push({
                x: x+1,
                y: y-1,
                item: this.grid[x+1][y-1]
              });
            }
            if (y<this.nRows-1) {
              neighbors.push({
                x: x+1,
                y: y+1,
                item: this.grid[x+1][y+1]
              });
            }
          }
          if (y>0) {
            neighbors.push({
              x: x,
              y: y-1,
              item: this.grid[x][y-1]
            });
          }
          if (y<this.nRows-1) {
            neighbors.push({
              x: x,
              y: y+1,
              item: this.grid[x][y+1]
            });
          }
          // obj.update(neighbors.filter(x => x));
          // include all neighbors
          obj.update(neighbors);
        }
      });
    });
  }

  render() {
    this.g.background(0,0,0);
    this.g.fill(...GRID_EMPTY);
    this.g.strokeWeight(0.2);
    this.grid.forEach((row, x) => {
      row.forEach((obj, y) => {
        let x_ = x*this.cellSize;
        let y_ = y*this.cellSize;
        if (obj) {
          obj.render(this.g, x_, y_, this.cellSize, this.cellSize);
        } else {
          this.g.rect(x_, y_, x_+this.cellSize, y_+this.cellSize);
        }
      });
    });

    this.x = window.innerWidth/2 - this.width/2;
    this.y = window.innerHeight/2 - this.height/2;
    renderGraphic(this.g, this.x, this.y);
  }

  inside(x, y) {
    // check if the given (x,y) position
    // is inside the rectangle.
    // assumes no rotation!
    let in_x = x > this.x && x < this.x + this.width;
    let in_y = y > this.y && y < this.y + this.height;
    return in_x && in_y;
  }

  convertCoord(x, y) {
    // translate to internal coordinates
    let x_ = x - this.x;
    let y_ = y - this.y;
    x_ = floor(x_/this.cellSize);
    y_ = floor(y_/this.cellSize);
    return [x_, y_];
  }

  cellAt(x, y) {
    let coord = this.convertCoord(x, y);
    let x_ = coord[0];
    let y_ = coord[1];
    return this.grid[x_][y_];
  }

  enterCell(x, y) {
    let obj = this.cellAt(x, y);
    if (obj && obj.info) {
      GAME.tooltip = obj.info;
    } else {
      GAME.tooltip = null;
    }
  }

  clickCell(x, y) {
    let obj = this.cellAt(x, y);
    if (obj) {
      obj.onClick();
    } else if (GAME.selected) {
      let coord = this.convertCoord(x, y);
      let x_ = coord[0];
      let y_ = coord[1];
      this.place(GAME.selected, x_, y_);
      GAME.selected = null;
    }
  }

  remove(x, y) {
    this.grid[x][y] = null;
  }
}

// --- UI

const messagePadding = 6;

function showMessage(text, color, timeout, size) {
  // no support for text wrapping
  color = color || [0,0,0];
  timeout = timeout || 5000;
  size = size || 16;
  let width = textWidth(text);
  let g = createGraphics(width*2, size*2);
  g.fill(...color);
  // g.background(0,255,0); // DEBUG
  g.textSize(size);
  g.textAlign(LEFT, CENTER);
  g.text(text, 0, size/2);

  GAME.messages.push(g);
  setTimeout(() => {
    let idx = GAME.messages.indexOf(g);
    GAME.messages.splice(idx, 1);
  }, timeout);
}

function renderMessages(x, y) {
  GAME.messages.forEach((g, i) => {
    let y_ = y + ((messagePadding + g.height/2) * i);
    renderGraphic(g, x, y_);
  });
}

function renderResources(top, right, size) {
  size = size || 16;
  let height = size;
  Object.keys(STATE.resources).forEach((k, i) => {
    let name = RESOURCES[k] || k;
    let body = `${name} ${numberWithCommas(STATE.resources[k])}`;
    let width = textWidth(body);
    textSize(size);
    text(body, window.innerWidth - width - right, top + height/2 + (height * i));
  });
}

function renderTooltip(size, padding) {
  padding = padding || 10;
  if (!GAME.tooltip) {
    return;
  }
  let width = textWidth(GAME.tooltip);
  let g = createGraphics(width + padding*2, size + padding*2 - size/2);
  g.fill(255,255,255);
  g.background(30,30,30);
  g.text(GAME.tooltip, padding, padding + size/2);
  renderGraphic(g, mouseX, mouseY);
}

class Menu {
  constructor(title, buttons) {
    this.title = title;
    this.buttons = buttons;

    let menus = document.getElementById('menus');
    let menuButton = document.createElement('div');
    menuButton.classList.add('button');
    menuButton.innerHTML = this.title;
    menuButton.addEventListener('click', () => this.render());
    menus.appendChild(menuButton);
  }

  render() {
    let el = document.createElement('div');

    let title = document.createElement('h1');
    title.innerHTML = this.title;
    el.appendChild(title);

    let buttons = this.buttons.slice();
    buttons.push(new Button('Close', () => {}));

    buttons.forEach((b) => {
      let bEl = b.render();
      el.appendChild(bEl);
    });

    renderModal(el);
  }
}

class Button {
  constructor(text, onClick) {
    this.text = text;
    this.onClick = onClick;
    this.obj = this.onClick.obj;
  }

  render() {
    let bEl = document.createElement('div');
    bEl.classList.add('button');
    bEl.innerHTML = this.text;
    bEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      overlay.style.display = 'none';
      this.onClick();
      tooltip.style.display = 'none';
    });
    if (this.obj) {
      let cost = renderCost(this.obj.cost);
      bEl.addEventListener('mouseenter', (ev) => {
        tooltip.style.display = 'block';
        tooltip.innerText = `Costs: ${cost}`;
      });
      bEl.addEventListener('mouseleave', (ev) => {
        tooltip.style.display = 'none';
      });
    }
    return bEl;
  }
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
  let overlay = document.getElementById('overlay');
  while (overlay.firstChild) {
    overlay.removeChild(overlay.firstChild);
  }
  let el = document.createElement('div');
  el.classList.add('modal');
  el.appendChild(child);

  overlay.appendChild(el);
  overlay.style.display = 'block';
}

function renderGraphic(g, x, y) {
  // work around for
  // https://github.com/processing/p5.js/issues/2077
  copy(g, 0, 0, g.width, g.height, x, y, g.width, g.height);
}



// more semantic
class Event extends Modal {};
class Action extends Button {};

// --- P5JS

function setup() {
  createCanvas(window.innerWidth, window.innerHeight);
  GAME.grid = new Grid(GRID_HEIGHT, GRID_WIDTH, GRID_CELL_SIZE);
  init();
}

// resize canvas when the browser window resizes
function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
}

function preload() {
  IMAGES.forEach((path) => {
    let parts = path.split('/');
    let fname = parts[parts.length - 1];
    GAME.images[fname] = loadImage(path);
  });
}

function draw() {
  main();
  GAME.grid.update();
  GAME.grid.render();
  renderMessages(10, 10);
  renderResources(10, 10);
  renderTooltip(16);

  // draw selected item
  if (GAME.selected) {
    let fname = GAME.selected.image
    image(GAME.images[fname], mouseX, mouseY, GAME.grid.cellSize, GAME.grid.cellSize);
  }
}


// --- INTERACTION

function mouseMoved() {
  if (GAME.grid && GAME.grid.inside(mouseX, mouseY)) {
    GAME.grid.enterCell(mouseX, mouseY);
  } else {
    GAME.tooltip = null;
  }
}

function mouseClicked() {
  if (GAME.grid && GAME.grid.inside(mouseX, mouseY)) {
    GAME.grid.clickCell(mouseX, mouseY);
  }
}