(() => {
  // ===== 基础引用 =====
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const hudLeft = document.getElementById("hud-left");
  const hudRight = document.getElementById("hud-right");
  const hintBar = document.getElementById("hint-bar");
  const menuOverlay = document.getElementById("menu-overlay");
  const upgradeOverlay = document.getElementById("upgrade-overlay");
  const resultOverlay = document.getElementById("result-overlay");
  const metaGoldText = document.getElementById("meta-gold-text");
  const upgradeGoldText = document.getElementById("upgrade-gold-text");
  const upgradeList = document.getElementById("upgrade-list");
  const startBtn = document.getElementById("start-btn");
  const upgradeBtn = document.getElementById("upgrade-btn");
  const backMenuBtn = document.getElementById("back-menu-btn");
  const restartBtn = document.getElementById("restart-btn");
  const toMenuBtn = document.getElementById("to-menu-btn");
  const resultTitle = document.getElementById("result-title");
  const resultText = document.getElementById("result-text");
  const downloadBtn = document.getElementById("download-btn");
  const WORLD = { w: canvas.width, h: canvas.height, margin: 20 };
  // ===== 项目文件导出（浏览器下载） =====
  async function readTextFromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取失败: ${url}`);
    return await res.text();
  }
  async function getStyleContent() {
    const link = document.querySelector('link[rel="stylesheet"][href]');
    if (link) return await readTextFromUrl(link.getAttribute('href'));
    const styles = document.querySelectorAll("style");
    let css = "";
    styles.forEach((s) => { css += s.innerHTML + "\n"; });
    return css;
  }
  async function getScriptContent() {
    const script = Array.from(document.querySelectorAll("script[src]")).find((s) => (s.getAttribute("src") || "").includes("game.js"));
    if (script) return await readTextFromUrl(script.getAttribute("src"));
    const inline = document.querySelectorAll("script:not([src])");
    let js = "";
    inline.forEach((s) => { js += s.innerHTML + "\n"; });
    return js;
  }
  function buildExportedIndexHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>搜打撤 2D Prototype</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="game-shell">
    <canvas id="gameCanvas" width="960" height="540"></canvas>
    <div id="hud-left" class="hud-panel"></div>
    <div id="hud-right" class="hud-panel"></div>
    <div id="hint-bar"></div>
    <button id="download-btn" title="下载项目文件">Download to Desktop</button>
    <div id="menu-overlay" class="overlay">
      <div class="panel">
        <h1>搜打撤原型</h1>
        <p id="meta-gold-text">总资产：0 Gold</p>
        <div class="btn-row">
          <button id="start-btn">开始行动</button>
          <button id="upgrade-btn">升级</button>
        </div>
      </div>
    </div>
    <div id="upgrade-overlay" class="overlay hidden">
      <div class="panel">
        <h2>局外升级</h2>
        <p id="upgrade-gold-text">可用资产：0 Gold</p>
        <div id="upgrade-list"></div>
        <div class="btn-row">
          <button id="back-menu-btn">返回菜单</button>
        </div>
      </div>
    </div>
    <div id="result-overlay" class="overlay hidden">
      <div class="panel">
        <h2 id="result-title">结算</h2>
        <p id="result-text"></p>
        <div class="btn-row">
          <button id="restart-btn">再来一局</button>
          <button id="to-menu-btn">返回菜单</button>
        </div>
      </div>
    </div>
  </div>
  <script src="game.js"></script>
</body>
</html>
`;
  }
  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }
  async function exportGameFiles() {
    try {
      const [styleContent, scriptContent] = await Promise.all([getStyleContent(), getScriptContent()]);
      downloadFile("index.html", buildExportedIndexHtml());
      downloadFile("style.css", styleContent);
      downloadFile("game.js", scriptContent);
    } catch (err) {
      console.error(err);
      alert("导出失败，请在本地服务器环境下重试。");
    }
  }
  // 难度配置对象（用户可改）
  const DIFFICULTY = {
    enemySpeedMul: 1,
    enemyHpMul: 1,
    spawnInterval: 3.2,
    dropRate: 0.66,
  };
  const CONFIG = {
    player: {
      radius: 14,
      baseHp: 100,
      baseAmmo: 72,
      baseAmmoCap: 140,
      baseDamage: 24,
      baseMoveSpeed: 190,
      baseFireRate: 0.13,
      spreadDeg: 5,
      bulletSpeed: 520,
      hitInvincibleSec: 0.45,
    },
    enemy: {
      melee: { radius: 12, hp: 58, speed: 145, contactDamage: 15, color: "#ff6b57" },
      ranged: {
        radius: 12,
        hp: 46,
        speed: 110,
        preferDist: 190,
        fireRate: 1.1,
        bulletSpeed: 280,
        bulletDamage: 10,
        color: "#f48aff",
      },
    },
    bullet: { radius: 3, life: 1.5, playerColor: "#ffe18f", enemyColor: "#f48aff" },
    obstacle: { count: 14, minW: 60, maxW: 140, minH: 40, maxH: 100 },
    crate: { count: 9, size: 22, pickupDist: 30, healRange: [16, 28], ammoRange: [18, 30] },
    loot: {
      pickupDist: 30,
    },
    wave: { baseCount: 5, growth: 2, maxAlive: 14 },
    extraction: { radius: 42, holdSec: 3 },
  };
  const SAVE_KEY = "sodache_mvp_save_v2";
  const GameState = {
    MENU: "MENU",
    PLAYING: "PLAYING",
    EXTRACTING: "EXTRACTING",
    GAMEOVER: "GAMEOVER",
    UPGRADING: "UPGRADING",
  };
  const LOOT_RARITY = {
    COMMON: { key: "common", name: "Common", color: "#9aa0a6", value: 10 },
    RARE: { key: "rare", name: "Rare", color: "#4fc3f7", value: 25 },
    EPIC: { key: "epic", name: "Epic", color: "#ba68c8", value: 60 },
  };
  const INVENTORY_SIZE = 6;
  let totalGold = Number(localStorage.getItem("totalGold")) || 0;
  const UPGRADE_DEFS = {
    maxHp: { name: "最大生命", baseCost: 80, stepCost: 45, maxLevel: 5, desc: "+12 HP/级" },
    maxAmmo: { name: "弹药容量", baseCost: 70, stepCost: 40, maxLevel: 5, desc: "+14 上限/级" },
    damage: { name: "武器伤害", baseCost: 100, stepCost: 60, maxLevel: 5, desc: "+3 伤害/级" },
    fireRate: { name: "射速", baseCost: 110, stepCost: 70, maxLevel: 4, desc: "每级减少开火间隔" },
    moveSpeed: { name: "移速", baseCost: 90, stepCost: 55, maxLevel: 4, desc: "+12 速度/级" },
  };
  // ===== 工具 =====
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const normalize = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  function circleRectCollide(cx, cy, r, rect) {
    const nx = clamp(cx, rect.x, rect.x + rect.w);
    const ny = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }
  function moveWithCollision(entity, vx, vy, dt, obstacles) {
    entity.x += vx * dt;
    for (const o of obstacles) if (circleRectCollide(entity.x, entity.y, entity.r, o)) { entity.x -= vx * dt; break; }
    entity.y += vy * dt;
    for (const o of obstacles) if (circleRectCollide(entity.x, entity.y, entity.r, o)) { entity.y -= vy * dt; break; }
    entity.x = clamp(entity.x, entity.r + 2, WORLD.w - entity.r - 2);
    entity.y = clamp(entity.y, entity.r + 2, WORLD.h - entity.r - 2);
  }
  function segmentRectHit(x1, y1, x2, y2, rect) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
    }
    return false;
  }
  function getRandomLoot() {
    const roll = Math.random();
    if (roll < 0.6) return { ...LOOT_RARITY.COMMON };
    if (roll < 0.9) return { ...LOOT_RARITY.RARE };
    return { ...LOOT_RARITY.EPIC };
  }
  // ===== 存档（局外） =====
  function loadMeta() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) throw new Error("no save");
      const parsed = JSON.parse(raw);
      return {
        totalGold: parsed.totalGold || totalGold,
        upgrades: {
          maxHp: parsed.upgrades?.maxHp || 0,
          maxAmmo: parsed.upgrades?.maxAmmo || 0,
          damage: parsed.upgrades?.damage || 0,
          fireRate: parsed.upgrades?.fireRate || 0,
          moveSpeed: parsed.upgrades?.moveSpeed || 0,
        },
      };
    } catch {
      return { totalGold, upgrades: { maxHp: 0, maxAmmo: 0, damage: 0, fireRate: 0, moveSpeed: 0 } };
    }
  }
  function saveMeta(meta) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
    totalGold = meta.totalGold;
    localStorage.setItem("totalGold", String(totalGold));
  }
  function upgradeCost(key, level) {
    const d = UPGRADE_DEFS[key];
    return d.baseCost + d.stepCost * level;
  }
  function computePermanentStats(meta) {
    const up = meta.upgrades;
    return {
      maxHp: CONFIG.player.baseHp + up.maxHp * 12,
      ammoCap: CONFIG.player.baseAmmoCap + up.maxAmmo * 14,
      damage: CONFIG.player.baseDamage + up.damage * 3,
      fireRate: clamp(CONFIG.player.baseFireRate - up.fireRate * 0.01, 0.075, 0.2),
      moveSpeed: CONFIG.player.baseMoveSpeed + up.moveSpeed * 12,
      bagSlots: INVENTORY_SIZE,
    };
  }
  // ===== 实体 =====
  class Player {
    constructor(stats) {
      this.x = WORLD.w * 0.5;
      this.y = WORLD.h * 0.5;
      this.r = CONFIG.player.radius;
      this.maxHp = stats.maxHp;
      this.hp = stats.maxHp;
      this.maxAmmo = stats.ammoCap;
      this.ammo = clamp(CONFIG.player.baseAmmo, 0, this.maxAmmo);
      this.damage = stats.damage;
      this.moveSpeed = stats.moveSpeed;
      this.fireRate = stats.fireRate;
      this.fireCd = 0;
      this.invSec = 0;
      this.damageFlash = 0;
      this.kills = 0;
      // 局内资产与战利品，仅撤离成功才能带出
      this.runGold = 0;
      this.backpack = [];
      this.bagSlots = stats.bagSlots;
    }
    takeDamage(dmg, game) {
      if (this.invSec > 0 || (game.currentState !== GameState.PLAYING && game.currentState !== GameState.EXTRACTING)) return;
      this.hp -= dmg;
      this.invSec = CONFIG.player.hitInvincibleSec;
      this.damageFlash = 0.12;
      // 受击中断撤离读条
      game.extractionProgress = 0;
      game.extractionRiskTriggered = false;
      if (this.hp <= 0) {
        this.hp = 0;
        game.handleGameOver();
      }
    }
    update(dt) {
      if (this.fireCd > 0) this.fireCd -= dt;
      if (this.invSec > 0) this.invSec -= dt;
      if (this.damageFlash > 0) this.damageFlash -= dt;
    }
  }
  class Enemy {
    constructor(type, x, y, wave) {
      this.type = type;
      this.base = CONFIG.enemy[type];
      this.x = x;
      this.y = y;
      this.r = this.base.radius;
      this.hp = Math.round(this.base.hp * DIFFICULTY.enemyHpMul * (1 + 0.08 * (wave - 1)));
      this.fireCd = rand(0.3, 0.8);
      this.dead = false;
      this.maxHpAtSpawn = this.hp;
    }
    update(game, dt) {
      const p = game.player;
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / d, y: dy / d };
      if (this.type === "melee") {
        const sp = this.base.speed * DIFFICULTY.enemySpeedMul;
        moveWithCollision(this, dir.x * sp, dir.y * sp, dt, game.obstacles);
        if (d < this.r + p.r + 2) p.takeDamage(this.base.contactDamage, game);
      } else {
        const sp = this.base.speed * DIFFICULTY.enemySpeedMul;
        const pref = this.base.preferDist;
        let mvx = 0;
        let mvy = 0;
        if (d < pref - 25) {
          mvx = -dir.x * sp;
          mvy = -dir.y * sp;
        } else if (d > pref + 40) {
          mvx = dir.x * sp;
          mvy = dir.y * sp;
        } else {
          const perp = { x: -dir.y, y: dir.x };
          const side = Math.sin(performance.now() * 0.003 + this.x * 0.02) > 0 ? 1 : -1;
          mvx = perp.x * sp * 0.7 * side;
          mvy = perp.y * sp * 0.7 * side;
        }
        moveWithCollision(this, mvx, mvy, dt, game.obstacles);
        this.fireCd -= dt;
        if (this.fireCd <= 0 && d < 360) {
          this.fireCd = this.base.fireRate;
          game.spawnBullet(this.x, this.y, Math.atan2(dy, dx), false, this.base.bulletSpeed, this.base.bulletDamage);
        }
      }
    }
    takeDamage(dmg, game) {
      this.hp -= dmg;
      if (this.hp <= 0) {
        this.dead = true;
        game.player.kills += 1;
        // 敌人掉少量局内金币（仅撤离才带出）
        game.player.runGold += randInt(3, 8);
        // 敌人掉战利品
        if (Math.random() < DIFFICULTY.dropRate) {
          game.spawnLoot(this.x + rand(-8, 8), this.y + rand(-8, 8));
        }
      }
    }
  }
  class Bullet {
    constructor(x, y, a, fromPlayer, speed, damage) {
      this.x = x;
      this.y = y;
      this.px = x;
      this.py = y;
      this.vx = Math.cos(a) * speed;
      this.vy = Math.sin(a) * speed;
      this.r = CONFIG.bullet.radius;
      this.life = CONFIG.bullet.life;
      this.fromPlayer = fromPlayer;
      this.damage = damage;
      this.dead = false;
    }
    update(dt) {
      this.px = this.x;
      this.py = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0 || this.x < 0 || this.y < 0 || this.x > WORLD.w || this.y > WORLD.h) this.dead = true;
    }
  }
  class Obstacle { constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; } }
  class Crate { constructor(x, y, kind) { this.x = x; this.y = y; this.kind = kind; this.size = CONFIG.crate.size; this.picked = false; } }
  class Loot {
    constructor(x, y, rarity, value) {
      this.x = x;
      this.y = y;
      this.rarity = rarity;
      this.value = value;
      this.picked = false;
    }
  }
  class ExtractionZone { constructor(x, y) { this.x = x; this.y = y; this.r = CONFIG.extraction.radius; } }
  // ===== 游戏主控 =====
  class Game {
    constructor() {
      this.keys = new Set();
      this.mouse = { x: WORLD.w / 2, y: WORLD.h / 2, down: false };
      this.meta = loadMeta();
      totalGold = this.meta.totalGold;
      localStorage.setItem("totalGold", String(totalGold));
      this.permStats = computePermanentStats(this.meta);
      this.currentState = GameState.MENU;
      this.lastTime = 0;
      this.player = null;
      this.obstacles = [];
      this.crates = [];
      this.loots = [];
      this.enemies = [];
      this.bullets = [];
      this.extractZone = null;
      this.nearCrate = null;
      this.nearLoot = null;
      this.inventory = [];
      this.inventorySlots = [];
      this.runLootValue = 0;
      this.wave = 1;
      this.waveQuota = 0;
      this.waveSpawned = 0;
      this.spawnTimer = DIFFICULTY.spawnInterval;
      this.extractionProgress = 0;
      this.extractionRiskTriggered = false;
      this.registerInput();
      this.renderMenu();
    }
    registerInput() {
      window.addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        this.keys.add(k);
        if ((this.currentState === GameState.PLAYING || this.currentState === GameState.EXTRACTING) && k === "f") {
          if (this.nearLoot) this.tryPickLoot(this.nearLoot);
          else if (this.nearCrate) this.pickCrate(this.nearCrate);
        }
        // 快速丢弃：按 G 丢弃背包最后一个物品
        if ((this.currentState === GameState.PLAYING || this.currentState === GameState.EXTRACTING) && k === "g") {
          this.dropLastInventoryItem();
        }
        if (this.currentState === GameState.MENU && k === "enter") this.startGame();
        if (this.currentState === GameState.GAMEOVER && k === "r") this.startGame();
      });
      window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
      canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * WORLD.w;
        this.mouse.y = ((e.clientY - rect.top) / rect.height) * WORLD.h;
      });
      canvas.addEventListener("mousedown", (e) => { if (e.button === 0) this.mouse.down = true; });
      canvas.addEventListener("mouseup", (e) => { if (e.button === 0) this.mouse.down = false; });
      // 鼠标点背包格：丢弃对应格子物品
      canvas.addEventListener("click", (e) => {
        if (this.currentState !== GameState.PLAYING && this.currentState !== GameState.EXTRACTING) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * WORLD.w;
        const mouseY = ((e.clientY - rect.top) / rect.height) * WORLD.h;
        for (const slot of this.inventorySlots) {
          if (
            mouseX >= slot.x &&
            mouseX <= slot.x + slot.size &&
            mouseY >= slot.y &&
            mouseY <= slot.y + slot.size
          ) {
            this.dropInventoryItemAt(slot.index);
            break;
          }
        }
      });
      startBtn.addEventListener("click", () => this.startGame());
      upgradeBtn.addEventListener("click", () => this.openUpgrade());
      backMenuBtn.addEventListener("click", () => this.renderMenu());
      restartBtn.addEventListener("click", () => this.startGame());
      toMenuBtn.addEventListener("click", () => this.renderMenu());
    }
    /** Drop last item (fast, no UI clicks) */
    dropLastInventoryItem() {
      if (this.inventory.length === 0) return false;
      const removed = this.inventory.pop();
      this.runLootValue = Math.max(0, this.runLootValue - (removed?.value || 0));
      this.player.backpack = this.inventory;
      return true;
    }
    /** OPTIONAL: Drop specific slot index */
    dropInventoryItemAt(index) {
      if (index < 0 || index >= this.inventory.length) return false;
      const [removed] = this.inventory.splice(index, 1);
      this.runLootValue = Math.max(0, this.runLootValue - (removed?.value || 0));
      this.player.backpack = this.inventory;
      return true;
    }
    setState(newState) {
      this.currentState = newState;
    }
    // ===== 菜单与升级 =====
    renderMenu() {
      this.setState(GameState.MENU);
      menuOverlay.classList.remove("hidden");
      upgradeOverlay.classList.add("hidden");
      resultOverlay.classList.add("hidden");
      metaGoldText.textContent = `总资产：${totalGold} Gold`;
    }
    openUpgrade() {
      this.setState(GameState.UPGRADING);
      menuOverlay.classList.add("hidden");
      resultOverlay.classList.add("hidden");
      upgradeOverlay.classList.remove("hidden");
      this.renderUpgradeList();
    }
    renderUpgradeList() {
      upgradeGoldText.textContent = `可用资产：${totalGold} Gold`;
      upgradeList.innerHTML = "";
      Object.entries(UPGRADE_DEFS).forEach(([key, def]) => {
        const lv = this.meta.upgrades[key];
        const cost = upgradeCost(key, lv);
        const canBuy = lv < def.maxLevel && totalGold >= cost;
        const row = document.createElement("div");
        row.className = "upgrade-item";
        const left = document.createElement("div");
        left.innerHTML = `<strong>${def.name}</strong> Lv.${lv}/${def.maxLevel}<div class="upgrade-meta">${def.desc} | 费用：${lv >= def.maxLevel ? "MAX" : cost + " Gold"}</div>`;
        const btn = document.createElement("button");
        btn.textContent = lv >= def.maxLevel ? "已满级" : "升级";
        btn.disabled = !canBuy;
        btn.addEventListener("click", () => {
          if (!canBuy) return;
          totalGold -= cost;
          this.meta.totalGold = totalGold;
          this.meta.upgrades[key] += 1;
          saveMeta(this.meta);
          this.permStats = computePermanentStats(this.meta);
          this.renderUpgradeList();
          this.renderMenu();
          this.openUpgrade();
        });
        row.appendChild(left);
        row.appendChild(btn);
        upgradeList.appendChild(row);
      });
    }
    // ===== 局内逻辑 =====
    startGame() {
      this.setState(GameState.PLAYING);
      menuOverlay.classList.add("hidden");
      upgradeOverlay.classList.add("hidden");
      resultOverlay.classList.add("hidden");
      this.permStats = computePermanentStats(this.meta);
      this.player = new Player(this.permStats);
      this.obstacles = [];
      this.crates = [];
      this.loots = [];
      this.enemies = [];
      this.bullets = [];
      this.nearCrate = null;
      this.nearLoot = null;
      this.inventory = [];
      this.inventorySlots = [];
      this.runLootValue = 0;
      this.wave = 1;
      this.waveQuota = CONFIG.wave.baseCount;
      this.waveSpawned = 0;
      this.spawnTimer = DIFFICULTY.spawnInterval;
      this.extractionProgress = 0;
      this.extractionRiskTriggered = false;
      this.inventory = [];
      this.runLootValue = 0;
      this.generateMap();
    }
    finishExtraction() {
      const extractedValue = this.runLootValue;
      const combatValue = this.player.runGold;
      totalGold += extractedValue + combatValue;
      this.meta.totalGold = totalGold;
      saveMeta(this.meta);
      this.inventory = [];
      this.runLootValue = 0;
      this.player.backpack = [];
      resultOverlay.classList.add("hidden");
      menuOverlay.classList.add("hidden");
      upgradeOverlay.classList.remove("hidden");
      this.setState(GameState.UPGRADING);
      this.renderUpgradeList();
      resultTitle.textContent = "撤离成功";
      resultText.textContent = `带出金币：${extractedValue + combatValue}
(战斗金币 ${combatValue} + 战利品估值 ${extractedValue})
击杀：${this.player.kills}
波次：${this.wave}`;
    }
    handleGameOver() {
      this.inventory = [];
      this.runLootValue = 0;
      this.player.backpack = [];
      this.setState(GameState.GAMEOVER);
      resultOverlay.classList.remove("hidden");
      menuOverlay.classList.add("hidden");
      upgradeOverlay.classList.add("hidden");
      resultTitle.textContent = "行动失败";
      resultText.textContent = `你倒下了，本局未带出资产。
背包战利品已丢失。
击杀：${this.player.kills}
波次：${this.wave}`;
    }
    generateMap() {
      this.extractZone = new ExtractionZone(WORLD.w - 80, 80);
      const safePlayer = { x: WORLD.w * 0.5, y: WORLD.h * 0.5, r: 86 };
      const safeExtract = { x: this.extractZone.x, y: this.extractZone.y, r: 92 };
      let guard = 0;
      while (this.obstacles.length < CONFIG.obstacle.count && guard < 900) {
        guard++;
        const w = rand(CONFIG.obstacle.minW, CONFIG.obstacle.maxW);
        const h = rand(CONFIG.obstacle.minH, CONFIG.obstacle.maxH);
        const x = rand(WORLD.margin, WORLD.w - w - WORLD.margin);
        const y = rand(WORLD.margin, WORLD.h - h - WORLD.margin);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const isSafe = dist(cx, cy, safePlayer.x, safePlayer.y) > safePlayer.r && dist(cx, cy, safeExtract.x, safeExtract.y) > safeExtract.r;
        const overlap = this.obstacles.some((o) => !(x + w + 14 < o.x || x > o.x + o.w + 14 || y + h + 14 < o.y || y > o.y + o.h + 14));
        if (isSafe && !overlap) this.obstacles.push(new Obstacle(x, y, w, h));
      }
      for (let i = 0; i < CONFIG.crate.count; i++) this.spawnCrate(rand(40, WORLD.w - 40), rand(40, WORLD.h - 40));
    }
    spawnCrate(x, y) {
      const kind = Math.random() < 0.52 ? "ammo" : "heal";
      const c = new Crate(clamp(x, 20, WORLD.w - 20), clamp(y, 20, WORLD.h - 20), kind);
      this.crates.push(c);
    }
    spawnLoot(x, y) {
      const loot = getRandomLoot();
      this.loots.push(new Loot(clamp(x, 20, WORLD.w - 20), clamp(y, 20, WORLD.h - 20), loot.key, loot.value));
    }
    addToInventory(loot) {
      if (this.inventory.length >= INVENTORY_SIZE) return false;
      this.inventory.push({ rarity: loot.rarity, value: loot.value, color: loot.color });
      this.runLootValue += loot.value;
      return true;
    }
    tryPickLoot(loot) {
      if (loot.picked) return;
      if (!this.addToInventory(loot)) return;
      loot.picked = true;
      this.player.backpack = this.inventory;
    }
    pickCrate(c) {
      if (c.picked) return;
      c.picked = true;
      if (c.kind === "ammo") this.player.ammo = clamp(this.player.ammo + randInt(...CONFIG.crate.ammoRange), 0, this.player.maxAmmo);
      else this.player.hp = clamp(this.player.hp + randInt(...CONFIG.crate.healRange), 0, this.player.maxHp);
    }
    spawnEnemy() {
      const type = Math.random() < 0.58 ? "melee" : "ranged";
      let x = 0, y = 0;
      let ok = false;
      for (let i = 0; i < 200 && !ok; i++) {
        const edge = randInt(0, 3);
        if (edge === 0) { x = rand(0, WORLD.w); y = 0; }
        else if (edge === 1) { x = WORLD.w; y = rand(0, WORLD.h); }
        else if (edge === 2) { x = rand(0, WORLD.w); y = WORLD.h; }
        else { x = 0; y = rand(0, WORLD.h); }
        const far = dist(x, y, this.player.x, this.player.y) > 160;
        const blocked = this.obstacles.some((o) => circleRectCollide(x, y, CONFIG.enemy[type].radius + 3, o));
        ok = far && !blocked;
      }
      this.enemies.push(new Enemy(type, x, y, this.wave));
    }
    spawnExtractionRiskWave() {
      // 撤离读条时立即增加风险：立刻刷一波冲击敌人
      const burst = clamp(2 + Math.floor(this.wave / 2), 2, 6);
      for (let i = 0; i < burst; i++) this.spawnEnemy();
    }
    spawnBullet(x, y, angle, fromPlayer, speed, damage) {
      this.bullets.push(new Bullet(x, y, angle, fromPlayer, speed, damage));
    }
    updateWave(dt) {
      if (this.waveQuota <= 0 && this.enemies.length === 0) {
        this.wave += 1;
        this.waveQuota = CONFIG.wave.baseCount + (this.wave - 1) * CONFIG.wave.growth;
        this.waveSpawned = 0;
        this.spawnTimer = 1;
      }
      const canSpawn = this.enemies.length < CONFIG.wave.maxAlive && this.waveSpawned < this.waveQuota;
      if (!canSpawn) return;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = Math.max(0.7, DIFFICULTY.spawnInterval - this.wave * 0.08);
        this.spawnEnemy();
        this.waveSpawned += 1;
      }
    }
    updatePlayer(dt) {
      const p = this.player;
      const mx = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0);
      const my = (this.keys.has("s") ? 1 : 0) - (this.keys.has("w") ? 1 : 0);
      const dir = normalize(mx, my);
      moveWithCollision(p, dir.x * p.moveSpeed, dir.y * p.moveSpeed, dt, this.obstacles);
      if (this.mouse.down && p.fireCd <= 0 && p.ammo > 0) {
        const base = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
        const spread = (CONFIG.player.spreadDeg * Math.PI) / 180;
        this.spawnBullet(p.x, p.y, base + rand(-spread, spread), true, CONFIG.player.bulletSpeed, p.damage);
        p.ammo -= 1;
        p.fireCd = p.fireRate;
      }
      p.update(dt);
    }
    beginExtraction() {
      if (this.currentState === GameState.PLAYING) this.setState(GameState.EXTRACTING);
    }
    updateExtraction(dt) {
      this.updatePlayer(dt);
      this.updateWave(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updateInteractives();
      const p = this.player;
      const inZone = dist(p.x, p.y, this.extractZone.x, this.extractZone.y) <= this.extractZone.r - 6;
      const holdE = this.keys.has("e");
      if (inZone && holdE) {
        if (!this.extractionRiskTriggered && this.extractionProgress <= 0) {
          this.extractionRiskTriggered = true;
          this.spawnExtractionRiskWave();
        }
        this.extractionProgress += dt;
        if (this.extractionProgress >= CONFIG.extraction.holdSec) {
          this.extractionProgress = CONFIG.extraction.holdSec;
          this.finishExtraction();
        }
      } else {
        this.setState(GameState.PLAYING);
        if (!inZone) {
          this.extractionProgress = 0;
          this.extractionRiskTriggered = false;
        }
      }
    }
    updateBullets(dt) {
      for (const b of this.bullets) {
        b.update(dt);
        if (b.dead) continue;
        if (this.obstacles.some((o) => segmentRectHit(b.px, b.py, b.x, b.y, o))) { b.dead = true; continue; }
        if (b.fromPlayer) {
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
              e.takeDamage(b.damage, this);
              b.dead = true;
              break;
            }
          }
        } else {
          if (dist(b.x, b.y, this.player.x, this.player.y) < b.r + this.player.r) {
            this.player.takeDamage(b.damage, this);
            b.dead = true;
          }
        }
      }
      this.bullets = this.bullets.filter((b) => !b.dead);
    }
    updateEnemies(dt) {
      for (const e of this.enemies) if (!e.dead) e.update(this, dt);
      this.enemies = this.enemies.filter((e) => !e.dead);
    }
    updateInteractives() {
      this.crates = this.crates.filter((c) => !c.picked);
      this.loots = this.loots.filter((l) => !l.picked);
      this.nearCrate = null;
      this.nearLoot = null;
      this.inventory = [];
      this.runLootValue = 0;
      let bestC = Infinity, bestL = Infinity;
      for (const c of this.crates) {
        const d = dist(this.player.x, this.player.y, c.x, c.y);
        if (d < CONFIG.crate.pickupDist && d < bestC) { bestC = d; this.nearCrate = c; }
      }
      for (const l of this.loots) {
        const d = dist(this.player.x, this.player.y, l.x, l.y);
        if (d < CONFIG.loot.pickupDist && d < bestL) { bestL = d; this.nearLoot = l; }
      }
    }
    backpackText() {
      const p = this.player;
      const icons = Array.from({ length: INVENTORY_SIZE }, (_, i) => {
        const item = this.inventory[i];
        if (!item) return "□";
        if (item.rarity === "common") return "C";
        if (item.rarity === "rare") return "R";
        return "E";
      }).join(" ");
      return `背包 ${this.inventory.length}/${INVENTORY_SIZE}: ${icons}`;
    }
    backpackSlotsHtml() {
      const p = this.player;
      let html = "<div class='slot-row'>";
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        const item = this.inventory[i];
        const cls = item ? item.rarity : "";
        html += `<span class='slot ${cls}'></span>`;
      }
      html += "</div>";
      return html;
    }
    updateHUD() {
      const p = this.player;
      hudLeft.textContent = `HP: ${Math.round(p.hp)} / ${p.maxHp}\nAmmo: ${p.ammo} / ${p.maxAmmo}\n局内金币: ${p.runGold}\n战利品价值: ${this.runLootValue}\n总资产: ${totalGold}`;
      const pending = Math.max(0, this.waveQuota - this.waveSpawned);
      hudRight.innerHTML = `Wave: ${this.wave}<br>存活敌人: ${this.enemies.length}<br>待刷敌人: ${pending}<br>${this.backpackText()}${this.backpackSlotsHtml()}`;
      let hint = "WASD移动 | 鼠标瞄准 | 左键射击";
      if (this.nearCrate) hint = "按 F 拾取补给箱";
      if (this.nearLoot) {
        hint = this.inventory.length >= INVENTORY_SIZE
          ? "背包已满，无法拾取战利品"
          : `按 F 拾取战利品 (${this.nearLoot.rarity.toUpperCase()} / ${this.nearLoot.value}G)`;
      }
      const inZone = dist(this.player.x, this.player.y, this.extractZone.x, this.extractZone.y) <= this.extractZone.r - 6;
      if (inZone) {
        const pct = Math.floor((this.extractionProgress / CONFIG.extraction.holdSec) * 100);
        hint = `在撤离区按住 E (${pct}%)；读条会触发额外敌人，受击清零`;
      }
      hintBar.textContent = hint;
    }
    renderHUD() {
      this.updateHUD();
    }
    updateGame(dt) {
      if (this.currentState !== GameState.PLAYING) return;
      this.updatePlayer(dt);
      this.updateWave(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updateInteractives();
      const inZone = dist(this.player.x, this.player.y, this.extractZone.x, this.extractZone.y) <= this.extractZone.r - 6;
      if (inZone && this.keys.has("e")) this.beginExtraction();
      this.updateHUD();
    }
    renderGame() {
      this.render();
    }
    renderGameOver() {
      this.render();
    }
    renderUpgrade() {
      this.render();
    }
    // ===== 渲染 =====
    drawBackground() {
      ctx.fillStyle = "#1b2431";
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < WORLD.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); }
      for (let y = 0; y < WORLD.h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }
    }
    drawExtraction() {
      const z = this.extractZone;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(86,206,255,0.14)";
      ctx.fill();
      ctx.strokeStyle = "#56ceff";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (this.extractionProgress > 0) {
        const ratio = this.extractionProgress / CONFIG.extraction.holdSec;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r + 10, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
        ctx.strokeStyle = "#89f2ff";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }
    drawObstacles() {
      for (const o of this.obstacles) {
        ctx.fillStyle = "#3f4d60";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = "#90a0b8";
        ctx.strokeRect(o.x, o.y, o.w, o.h);
      }
    }
    drawCrates() {
      for (const c of this.crates) {
        const h = c.size / 2;
        ctx.fillStyle = c.kind === "ammo" ? "#70c4ff" : "#6ee08f";
        ctx.fillRect(c.x - h, c.y - h, c.size, c.size);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.strokeRect(c.x - h, c.y - h, c.size, c.size);
      }
    }
    drawLoots() {
      for (const l of this.loots) {
        const color = l.rarity === "common" ? LOOT_RARITY.COMMON.color : l.rarity === "rare" ? LOOT_RARITY.RARE.color : LOOT_RARITY.EPIC.color;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.stroke();
      }
    }
    renderInventory() {
      const startX = WORLD.w - 220;
      const startY = 80;
      const slotSize = 30;
      const slotGap = 5;
      this.inventorySlots = [];
      ctx.fillStyle = "white";
      ctx.font = "16px Arial";
      ctx.fillText("Inventory", startX, startY - 20);
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        const y = startY + i * (slotSize + slotGap);
        ctx.strokeStyle = "white";
        ctx.strokeRect(startX, y, slotSize, slotSize);
        this.inventorySlots.push({ x: startX, y, size: slotSize, index: i });
        if (this.inventory[i]) {
          const item = this.inventory[i];
          const c = item.color || (item.rarity === "common" ? LOOT_RARITY.COMMON.color : item.rarity === "rare" ? LOOT_RARITY.RARE.color : LOOT_RARITY.EPIC.color);
          ctx.fillStyle = c;
          ctx.fillRect(startX + 5, y + 5, slotSize - 10, slotSize - 10);
        }
      }
      ctx.fillText(`Run Value: ${this.runLootValue}`, startX, startY + INVENTORY_SIZE * (slotSize + slotGap) + 20);
      ctx.fillText("Press G / Click slot to drop item", startX, startY + INVENTORY_SIZE * (slotSize + slotGap) + 44);
    }
    drawBullets() {
      for (const b of this.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.fromPlayer ? CONFIG.bullet.playerColor : CONFIG.bullet.enemyColor;
        ctx.fill();
      }
    }
    drawEnemies() {
      for (const e of this.enemies) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = e.base.color;
        ctx.fill();
        const w = 28, h = 4;
        const ratio = clamp(e.hp / e.maxHpAtSpawn, 0, 1);
        ctx.fillStyle = "#2c343f";
        ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, h);
        ctx.fillStyle = "#78ff7d";
        ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * ratio, h);
      }
    }
    drawPlayer() {
      const p = this.player;
      const blink = p.invSec > 0 && Math.floor(p.invSec * 25) % 2 === 0;
      if (!blink) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.damageFlash > 0 ? "#ffbebe" : "#7de2ff";
        ctx.fill();
      }
      const a = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    render() {
      this.drawBackground();
      if (this.extractZone) this.drawExtraction();
      this.drawObstacles();
      this.drawCrates();
      this.drawLoots();
      if (this.currentState === GameState.PLAYING || this.currentState === GameState.EXTRACTING) this.renderInventory();
      this.drawBullets();
      this.drawEnemies();
      if (this.player) this.drawPlayer();
    }
    gameLoop = (ts) => {
      const dt = Math.min(0.033, (ts - this.lastTime) / 1000 || 0.016);
      this.lastTime = ts;
      switch (this.currentState) {
        case GameState.MENU:
          this.renderMenu();
          this.render();
          break;
        case GameState.PLAYING:
          this.updateGame(dt);
          this.renderGame();
          break;
        case GameState.EXTRACTING:
          this.updateExtraction(dt);
          this.updateHUD();
          this.renderGame();
          break;
        case GameState.GAMEOVER:
          this.renderGameOver();
          break;
        case GameState.UPGRADING:
          this.renderUpgrade();
          break;
        default:
          this.render();
      }
      requestAnimationFrame(this.gameLoop);
    };
  }
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      exportGameFiles();
    });
  }
  const game = new Game();
  requestAnimationFrame(game.gameLoop);
})();
