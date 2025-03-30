import * as C from './constants';
import { Player } from './player';
import { createEntity } from './factory';
import { Entity as BaseEntity, LaserBeam, LaserState } from './entities'; // Keep for specific types if needed
import { checkCollision, randomInt, shuffleArray } from './utils';
import { Theme, EntityType, BonusOption } from './constants';
import { Entity, Obstacle, PlayerHitbox, BonusChoiceArea } from './interfaces'; // Import interfaces

// Enum for Letter Pause State
enum LetterPauseState {
    NONE,
    SHOWING_ICON,
    SHOWING_CHOICES,
    SHOWING_LETTER,
    COUNTDOWN,
}

export class Game {
  private canvas: HTMLCanvasElement; private ctx: CanvasRenderingContext2D; private player: Player;
  private entities: Entity[] = [];
  private gameSpeed: number; private score: number; private frameCount: number; private entitySpawnTimer: number;
  private currentSpawnRate: number;
  private isGameOver: boolean; private animationFrameId: number | null = null;
  private scoreElement: HTMLElement; private messageElement: HTMLElement; private gameOverElement: HTMLElement; private instructionsElement: HTMLElement; private gameContainerElement: HTMLElement;
  private currentMessage: string | null = null; private messageTimer: number = 0; private lastMessageScore: number = 0;

  // --- Letter & Bonus State ---
  private letterPauseState: LetterPauseState = LetterPauseState.NONE;
  private currentLetter: { sender: string, text: string } | null = null;
  private lastLetterScoreThreshold: number = 0;
  private letterIconX: number; private letterIconY: number;
  private letterBoxX: number = 0; private letterBoxY: number = 0; private letterBoxWidth: number = 0; private letterBoxHeight: number = 0;
  private closeButtonX: number = 0; private closeButtonY: number = 0;
  private resumeCountdown: number = C.LETTER_RESUME_COUNTDOWN_SECONDS; private countdownIntervalId: number | null = null;
  private currentBonusOptions: BonusOption[] = [];
  private bonusChoiceAreas: BonusChoiceArea[] = []; // To detect clicks/taps
  private activeBonus: BonusOption | null = null;
  private bonusTimer: number = 0;
  private originalGameSpeed: number = C.INITIAL_GAME_SPEED; // To restore after speed bonus
  private originalSpawnRate: number = C.INITIAL_SPAWN_RATE; // To restore after obstacle bonus

  // --- Difficulty State ---
  private difficultyLevel: number = 0;
  private lastDifficultyIncreaseScore: number = 0;

  // --- Theme & Environment State ---
  private currentThemeIndex: number = 0; private lastThemeSwitchScore: number = 0; private currentTheme: Theme = C.THEMES[0];
  private gridOffsetX: number = 0; private gridOffsetY: number = 0; private readonly GRID_SIZE = 50;
  private fireParticles: { x: number, y: number, size: number, life: number }[] = [];
  private waterfallParticles: { x: number, y: number, vy: number, life: number }[] = [];
  private rainParticles: { x: number, y: number, vy: number, life: number }[] = [];
  private backgroundWaveOffset: number = 0;
  private lastGroundEntityEndX: number = -Infinity;

  // --- Scaling Properties ---
  private scaleX: number = 1;
  private scaleY: number = 1;
  private currentCanvasWidth: number = C.GAME_WIDTH;
  private currentCanvasHeight: number = C.GAME_HEIGHT;

  constructor(canvasId: string) {
    console.log(`Game constructor called with canvasId: ${canvasId}`);
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas element with id "${canvasId}" not found.`);
    this.canvas = canvas;
    console.log("Canvas element obtained in constructor.");

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error("Failed to get 2D rendering context from canvas.");
    this.ctx = context;
    console.log("2D context obtained.");

    // Get UI Elements (ensure they exist)
    const scoreEl = document.getElementById('score');
    const messageEl = document.getElementById('message');
    const gameOverEl = document.getElementById('game-over');
    const instructionsEl = document.getElementById('instructions');
    const gameContainerEl = document.getElementById('game-container');
    if (!scoreEl || !messageEl || !gameOverEl || !instructionsEl || !gameContainerEl) {
        throw new Error("One or more required UI elements (score, message, game-over, instructions, game-container) not found.");
    }
    this.scoreElement = scoreEl;
    this.messageElement = messageEl;
    this.gameOverElement = gameOverEl;
    this.instructionsElement = instructionsEl;
    this.gameContainerElement = gameContainerEl;
    console.log("UI elements obtained.");

    // Initialize State
    this.letterIconX = (C.GAME_WIDTH - C.LETTER_ICON_SIZE) / 2; // Use logic width
    this.letterIconY = (C.GAME_HEIGHT - C.LETTER_ICON_SIZE) / 2 - 50; // Use logic height
    this.player = new Player();
    this.gameSpeed = C.INITIAL_GAME_SPEED;
    this.originalGameSpeed = this.gameSpeed;
    this.score = 0; this.frameCount = 0;
    this.currentSpawnRate = C.INITIAL_SPAWN_RATE;
    this.originalSpawnRate = this.currentSpawnRate;
    this.entitySpawnTimer = this.currentSpawnRate;
    this.isGameOver = false;
    this.currentTheme = C.THEMES[this.currentThemeIndex];

    // Initial Resize & Setup
    try {
        this.handleResize(); // Perform initial resize to set canvas size and scale
        console.log("Initial resize complete.");
        this.setupInput();
        console.log("Input setup complete.");
        this.applyTheme();
        console.log("Initial theme applied.");
    } catch (error) {
        console.error("Error during constructor setup:", error);
        throw error;
    }
    console.log("Game constructor finished.");
  }

  // --- Resize Handling ---
  private handleResize = () => {
      // Get container size
      const containerWidth = this.gameContainerElement.clientWidth;
      const containerHeight = this.gameContainerElement.clientHeight;

      // Set canvas drawing buffer size
      this.canvas.width = containerWidth;
      this.canvas.height = containerHeight;
      this.currentCanvasWidth = containerWidth;
      this.currentCanvasHeight = containerHeight;

      // Calculate scale factors based on logic size vs actual size
      this.scaleX = this.canvas.width / C.GAME_WIDTH;
      this.scaleY = this.canvas.height / C.GAME_HEIGHT;

      // Optional: Maintain aspect ratio (letterbox/pillarbox) - using scaleY for both
      // const scale = Math.min(this.scaleX, this.scaleY);
      // this.scaleX = scale;
      // this.scaleY = scale;
      // If maintaining aspect ratio, you might want to center the scaled drawing:
      // const offsetX = (this.canvas.width - C.GAME_WIDTH * scale) / 2;
      // const offsetY = (this.canvas.height - C.GAME_HEIGHT * scale) / 2;
      // this.ctx.translate(offsetX, offsetY); // Apply this before scaling in draw()

      console.log(`Resized: Canvas=${this.canvas.width}x${this.canvas.height}, ScaleX=${this.scaleX.toFixed(2)}, ScaleY=${this.scaleY.toFixed(2)}`);

      // Redraw immediately after resize if game is running or paused
      if (!this.isGameOver || this.letterPauseState !== LetterPauseState.NONE) {
          this.draw();
      }
  }

  // --- Input Handling ---
  private setupInput() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('click', this.handleClick);
    // <<< Add resize listener >>>
    window.removeEventListener('resize', this.handleResize);

    window.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('click', this.handleClick);
    // <<< Add resize listener >>>
    window.addEventListener('resize', this.handleResize);
  }

  private handleKeyDown = (e: KeyboardEvent) => { /* Unchanged */ if (e.code === 'Space') { e.preventDefault(); if (this.letterPauseState !== LetterPauseState.NONE) { this.handleInteraction(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2); } else { this.handleInteraction(0, 0); } } };

  private handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          // <<< Unscale touch coordinates >>>
          const touchX = (touch.clientX - rect.left) / this.scaleX;
          const touchY = (touch.clientY - rect.top) / this.scaleY;
          this.handleInteraction(touchX, touchY);
      }
  };

  private handleClick = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      // <<< Unscale click coordinates >>>
      const clickX = (e.clientX - rect.left) / this.scaleX;
      const clickY = (e.clientY - rect.top) / this.scaleY;
      this.handleInteraction(clickX, clickY);
  };

  // Interaction logic uses unscaled (logic) coordinates
  private handleInteraction(logicX: number, logicY: number) {
      // console.log(`Interaction Logic Coords: (${logicX.toFixed(0)}, ${logicY.toFixed(0)}), State: ${LetterPauseState[this.letterPauseState]}`);
      switch (this.letterPauseState) {
          case LetterPauseState.SHOWING_ICON:
              this.letterPauseState = LetterPauseState.SHOWING_CHOICES;
              this.draw();
              break;
          case LetterPauseState.SHOWING_CHOICES:
              // Check against unscaled bonusChoiceAreas
              const chosenArea = this.bonusChoiceAreas.find(area =>
                  logicX >= area.x && logicX <= area.x + area.width &&
                  logicY >= area.y && logicY <= area.y + area.height
              );
              if (chosenArea) {
                  console.log("Bonus chosen:", chosenArea.bonus.name);
                  this.applyBonusEffect(chosenArea.bonus);
                  this.letterPauseState = LetterPauseState.SHOWING_LETTER;
                  this.bonusChoiceAreas = [];
                  this.draw();
                  setTimeout(() => {
                      if (this.letterPauseState === LetterPauseState.SHOWING_LETTER) {
                          this.startResumeCountdown();
                      }
                  }, 1500);
              } else {
                  // console.log("Click/Tap missed bonus choices.");
              }
              break;
          case LetterPauseState.SHOWING_LETTER:
              this.startResumeCountdown();
              break;
          case LetterPauseState.NONE:
          default:
              if (this.isGameOver) {
                  console.log("Restarting game via interaction.");
                  this.restart();
              } else {
                  this.player.jump();
                  if (this.instructionsElement && !this.instructionsElement.classList.contains('hidden')) {
                      this.instructionsElement.classList.add('hidden');
                  }
              }
              break;
      }
  }

  // --- Spawning (Logic unchanged, uses C.GAME_WIDTH) ---
  private spawnEntity() { /* Unchanged */ const newEntity = createEntity(this.entities, this.lastGroundEntityEndX, this.currentTheme, this.difficultyLevel); if (newEntity) { this.entities.push(newEntity); const groundTypes = [EntityType.SPIKE, EntityType.BLOCK, EntityType.GEAR, EntityType.SHOOTER, EntityType.COW, EntityType.LAVA_PIT, EntityType.TRIPLE_SPIKE, EntityType.BLOCK_STACK, EntityType.SAW_BLADE, EntityType.CRUSHER]; if (groundTypes.includes(newEntity.type)) { this.lastGroundEntityEndX = newEntity.x + newEntity.width; } if (newEntity.type === EntityType.LAVA_PIT) { this.lastGroundEntityEndX = newEntity.x + newEntity.width; } } else { this.entitySpawnTimer = Math.max(5, this.entitySpawnTimer * 0.7); if (this.currentTheme.name !== "Fiery Red") { this.lastGroundEntityEndX = C.GAME_WIDTH; } } }

  // --- Letter Pause & Bonus Logic (Logic unchanged, uses C.GAME constants) ---
  private pauseForLetter() { /* Unchanged */ this.letterPauseState = LetterPauseState.SHOWING_ICON; this.clearCountdownInterval(); this.currentBonusOptions = shuffleArray([...C.BONUS_OPTIONS]).slice(0, 3); this.bonusChoiceAreas = []; const randomIndex = randomInt(0, C.LETTER_MESSAGES.length - 1); this.currentLetter = C.LETTER_MESSAGES[randomIndex]; if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; } this.draw(); console.log("Game paused for letter/bonus choice."); }
  private applyBonusEffect(bonus: BonusOption) { /* Unchanged */ console.log("Applying bonus:", bonus.name); this.removeBonusEffect(); this.activeBonus = bonus; this.bonusTimer = bonus.duration; switch (bonus.id) { case 'speed_decrease': this.originalGameSpeed = this.gameSpeed; this.gameSpeed *= 0.80; break; case 'tiny_player': this.player.setTiny(true); break; case 'fewer_obstacles': this.originalSpawnRate = this.currentSpawnRate; this.currentSpawnRate *= 1.5; this.entitySpawnTimer = Math.max(this.entitySpawnTimer, this.currentSpawnRate * 0.5); break; case 'invincibility': this.player.setInvincible(true); break; case 'extra_jump': this.player.setMaxJumps(this.player.originalMaxJumps + 1); break; } }
  private removeBonusEffect() { /* Unchanged */ if (!this.activeBonus) return; console.log("Removing bonus:", this.activeBonus.name); switch (this.activeBonus.id) { case 'speed_decrease': const expectedBaseSpeed = C.INITIAL_GAME_SPEED * Math.pow(C.MILESTONE_SPEED_MULTIPLIER, this.difficultyLevel); this.gameSpeed = Math.min(this.originalGameSpeed, expectedBaseSpeed, C.MAX_GAME_SPEED); this.originalGameSpeed = this.gameSpeed; break; case 'tiny_player': this.player.setTiny(false); break; case 'fewer_obstacles': const expectedBaseSpawnRate = C.INITIAL_SPAWN_RATE * Math.pow(C.MILESTONE_SPAWN_RATE_MULTIPLIER, this.difficultyLevel); this.currentSpawnRate = Math.max(this.originalSpawnRate, expectedBaseSpawnRate, C.MIN_SPAWN_RATE); this.originalSpawnRate = this.currentSpawnRate; break; case 'invincibility': this.player.setInvincible(false); break; case 'extra_jump': this.player.resetMaxJumps(); break; } this.activeBonus = null; this.bonusTimer = 0; }
  private startResumeCountdown() { /* Unchanged */ console.log("Starting resume countdown."); this.letterPauseState = LetterPauseState.COUNTDOWN; this.resumeCountdown = C.LETTER_RESUME_COUNTDOWN_SECONDS; this.clearCountdownInterval(); this.draw(); this.countdownIntervalId = window.setInterval(() => { this.resumeCountdown--; this.draw(); if (this.resumeCountdown <= 0) { this.resumeFromLetter(); } }, 1000); }
  private clearCountdownInterval() { /* Unchanged */ if (this.countdownIntervalId !== null) { clearInterval(this.countdownIntervalId); this.countdownIntervalId = null; } }
  private resumeFromLetter() { /* Unchanged */ this.clearCountdownInterval(); this.letterPauseState = LetterPauseState.NONE; this.currentLetter = null; this.currentBonusOptions = []; this.bonusChoiceAreas = []; this.lastLetterScoreThreshold = this.score; console.log("Resuming game from letter pause."); if (!this.animationFrameId) { this.gameLoop(); } }

  // --- Theme Logic ---
  private applyTheme() { /* Unchanged */ if (this.currentThemeIndex < 0 || this.currentThemeIndex >= C.THEMES.length) { this.currentThemeIndex = 0; } this.currentTheme = C.THEMES[this.currentThemeIndex]; if (!this.currentTheme) { this.currentTheme = C.THEMES[0]; } this.scoreElement.style.color = this.currentTheme.COLOR_UI_SCORE_TEXT; this.scoreElement.style.textShadow = `1px 1px 3px ${this.currentTheme.COLOR_UI_SCORE_SHADOW}`; this.messageElement.style.color = this.currentTheme.COLOR_UI_MESSAGE_TEXT; this.messageElement.style.textShadow = `1px 1px 3px #000000`; this.gameOverElement.style.color = this.currentTheme.COLOR_UI_GAMEOVER_TEXT; this.gameOverElement.style.borderColor = this.currentTheme.COLOR_UI_GAMEOVER_BORDER; this.gameOverElement.style.textShadow = `0 0 10px ${this.currentTheme.COLOR_UI_GAMEOVER_SHADOW}`; this.gameContainerElement.style.backgroundColor = this.currentTheme.COLOR_BACKGROUND; this.gameContainerElement.style.boxShadow = `0 0 25px ${this.currentTheme.COLOR_GROUND_TOP}50`; }
  // --- Environment Update (Logic unchanged) ---
  private updateEnvironment() { /* Unchanged */ if (Math.random() < 0.3) { this.fireParticles.push({ x: randomInt(0, C.GAME_WIDTH), y: C.GROUND_Y - randomInt(0, 15), size: randomInt(3, 8), life: randomInt(20, 50) }); } this.fireParticles = this.fireParticles.filter(p => { p.life--; p.y -= 0.5 + Math.random() * 0.5; p.x += (Math.random() - 0.5) * 0.5; p.size *= 0.98; return p.life > 0 && p.size > 0.5; }); if (this.currentTheme.name === "Blue/Orange") { if (Math.random() < 0.8) { this.waterfallParticles.push({ x: randomInt(C.GAME_WIDTH / 2 - 50, C.GAME_WIDTH / 2 + 50), y: -10, vy: randomInt(4, 8), life: 100 }); } } else { if (this.waterfallParticles.length > 0 && Math.random() < 0.1) { this.waterfallParticles.shift(); } } this.waterfallParticles = this.waterfallParticles.filter(p => { p.life--; p.y += p.vy; p.vy += 0.1; return p.life > 0 && p.y < C.GROUND_Y; }); if (this.currentTheme.name === "Blue/Orange") { this.entities.forEach(entity => { if (entity.type === EntityType.RAIN_CLOUD) { if (Math.random() < C.RAIN_RATE) { this.rainParticles.push({ x: entity.x + randomInt(5, entity.width - 5), y: entity.y + entity.height - 5, vy: C.RAIN_SPEED + randomInt(-2, 2), life: 60 }); } } }); } else { if (this.rainParticles.length > 0 && Math.random() < 0.1) { this.rainParticles.shift(); } } this.rainParticles = this.rainParticles.filter(r => { r.life--; r.y += r.vy; return r.life > 0 && r.y < C.GROUND_Y; }); }
  // --- Message Update (Logic unchanged) ---
  private updateMessages() { /* Unchanged */ if (this.letterPauseState === LetterPauseState.NONE) { if (Math.floor(this.score / C.MESSAGE_INTERVAL) > Math.floor(this.lastMessageScore / C.MESSAGE_INTERVAL)) { const messageIndex = Math.floor(this.score / C.MESSAGE_INTERVAL) -1; if (messageIndex < C.REWARD_MESSAGES.length) { this.currentMessage = C.REWARD_MESSAGES[messageIndex % C.REWARD_MESSAGES.length]; this.messageTimer = C.MESSAGE_DURATION; this.lastMessageScore = this.score; } } if (this.messageTimer > 0) this.messageTimer--; else this.currentMessage = null; } else { this.currentMessage = null; } }

  // --- Text Wrapping (Logic unchanged) ---
  private wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, ctx: CanvasRenderingContext2D) => { /* Unchanged */ const words = text.split(' '); let line = ''; const originalAlign = ctx.textAlign; const originalBaseline = ctx.textBaseline; ctx.textBaseline = 'top'; let currentY = y; for (let n = 0; n < words.length; n++) { const testLine = line + words[n] + ' '; const metrics = ctx.measureText(testLine); const testWidth = metrics.width; if (testWidth > maxWidth && n > 0) { ctx.fillText(line.trim(), x, currentY); line = words[n] + ' '; currentY += lineHeight; } else { line = testLine; } } ctx.fillText(line.trim(), x, currentY); ctx.textAlign = originalAlign; ctx.textBaseline = originalBaseline; };

  // --- Game Over (Logic unchanged) ---
  private gameOver() { /* Unchanged */ this.isGameOver = true; this.clearCountdownInterval(); this.removeBonusEffect(); if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; } this.gameOverElement.classList.remove('hidden'); this.instructionsElement.classList.add('hidden'); console.log(`Game Over! Final Score: ${Math.floor(this.score)}`); }

  // --- Main Update Logic (Logic unchanged, uses C.GAME constants) ---
  private update() { /* Unchanged */ if (this.isGameOver || this.letterPauseState !== LetterPauseState.NONE) return; this.frameCount++; this.score += C.SCORE_MULTIPLIER * this.gameSpeed; if (this.score >= this.lastDifficultyIncreaseScore + C.DIFFICULTY_MILESTONE) { this.difficultyLevel++; this.lastDifficultyIncreaseScore += C.DIFFICULTY_MILESTONE; const expectedBaseSpeed = C.INITIAL_GAME_SPEED * Math.pow(C.MILESTONE_SPEED_MULTIPLIER, this.difficultyLevel); this.gameSpeed = Math.min(C.MAX_GAME_SPEED, expectedBaseSpeed); this.originalGameSpeed = this.gameSpeed; const expectedBaseSpawnRate = C.INITIAL_SPAWN_RATE * Math.pow(C.MILESTONE_SPAWN_RATE_MULTIPLIER, this.difficultyLevel); this.currentSpawnRate = Math.max(C.MIN_SPAWN_RATE, expectedBaseSpawnRate); this.originalSpawnRate = this.currentSpawnRate; console.log(`Difficulty Increased! Level: ${this.difficultyLevel}, Speed: ${this.gameSpeed.toFixed(2)}, Spawn Rate: ${this.currentSpawnRate.toFixed(2)}`); if (this.activeBonus?.id === 'speed_decrease') { this.gameSpeed *= 0.80; } if (this.activeBonus?.id === 'fewer_obstacles') { this.currentSpawnRate *= 1.5; } } if (Math.floor(this.score / C.THEME_SWITCH_INTERVAL) > Math.floor(this.lastThemeSwitchScore / C.THEME_SWITCH_INTERVAL)) { this.currentThemeIndex = (this.currentThemeIndex + 1) % C.THEMES.length; this.lastThemeSwitchScore = this.score; this.applyTheme(); } if (Math.floor(this.score / C.LETTER_PAUSE_INTERVAL) > Math.floor(this.lastLetterScoreThreshold / C.LETTER_PAUSE_INTERVAL)) { this.pauseForLetter(); return; } if (this.activeBonus) { this.bonusTimer--; if (this.bonusTimer <= 0) { this.removeBonusEffect(); } } this.gridOffsetX = (this.gridOffsetX - this.gameSpeed * 0.1) % this.GRID_SIZE; this.backgroundWaveOffset = (this.backgroundWaveOffset + this.gameSpeed * 0.05) % (Math.PI * 2); const platformEntities = this.entities.filter(e => e.type === EntityType.PLATFORM || e.type === EntityType.MOVING_PLATFORM ) as Obstacle[]; this.player.update(platformEntities); this.entitySpawnTimer--; if (this.entitySpawnTimer <= 0) { this.spawnEntity(); this.entitySpawnTimer = Math.floor(this.currentSpawnRate); } this.entities.forEach(entity => entity.update(this.gameSpeed, this.frameCount, this.player, this.entities, this.difficultyLevel)); this.entities = this.entities.filter(entity => !entity.toBeRemoved); this.updateEnvironment(); if (!this.activeBonus || this.activeBonus.id !== 'speed_decrease') { if (this.originalGameSpeed < C.MAX_GAME_SPEED) { this.originalGameSpeed += C.GAME_SPEED_INCREASE; this.originalGameSpeed = Math.min(this.originalGameSpeed, C.MAX_GAME_SPEED); this.gameSpeed = this.originalGameSpeed; } } if (!this.activeBonus || this.activeBonus.id !== 'fewer_obstacles') { if (this.originalSpawnRate > C.MIN_SPAWN_RATE) { this.originalSpawnRate -= C.SPAWN_RATE_DECREASE / 60; this.originalSpawnRate = Math.max(this.originalSpawnRate, C.MIN_SPAWN_RATE); this.currentSpawnRate = this.originalSpawnRate; } } if (!this.player.isInvincible) { const playerHitbox = this.player.getHitbox(); for (const entity of this.entities) { if (entity.type === EntityType.RAIN_CLOUD) continue; if ((entity.type === EntityType.PLATFORM || entity.type === EntityType.MOVING_PLATFORM) && playerHitbox.y + playerHitbox.height <= entity.y + 5 && this.player.velocityY >= 0) { continue; } let collisionDetected = false; if (entity.type === EntityType.LASER_BEAM) { const laser = entity as LaserBeam; if (laser.state === LaserState.ACTIVE) { const laserY = entity.y; const laserHeight = entity.height; if (playerHitbox.x < entity.x + entity.width && playerHitbox.x + playerHitbox.width > entity.x && playerHitbox.y < laserY + laserHeight && playerHitbox.y + playerHitbox.height > laserY) { collisionDetected = true; } } } else { collisionDetected = checkCollision(playerHitbox, entity); } if (collisionDetected) { if (entity.type === EntityType.PLATFORM || entity.type === EntityType.MOVING_PLATFORM) { if (playerHitbox.y + playerHitbox.height > entity.y + 5) { this.gameOver(); return; } } else { this.gameOver(); return; } } } } this.updateMessages(); }

  // --- Drawing Functions ---
  private drawBackgroundAndGround(theme: Theme) { /* Unchanged */ if (!theme) return; if (theme.COLOR_BACKGROUND_GRAD_STOP) { const gradient = this.ctx.createLinearGradient(0, 0, 0, C.GAME_HEIGHT); gradient.addColorStop(0, theme.COLOR_BACKGROUND); gradient.addColorStop(1, theme.COLOR_BACKGROUND_GRAD_STOP); this.ctx.fillStyle = gradient; } else { this.ctx.fillStyle = theme.COLOR_BACKGROUND; } this.ctx.fillRect(0, 0, C.GAME_WIDTH, C.GAME_HEIGHT); this.ctx.strokeStyle = theme.COLOR_BACKGROUND_GRID; this.ctx.lineWidth = 1; for (let x = this.gridOffsetX; x < C.GAME_WIDTH; x += this.GRID_SIZE) { this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, C.GAME_HEIGHT); this.ctx.stroke(); } for (let y = this.gridOffsetY; y < C.GAME_HEIGHT; y += this.GRID_SIZE) { this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(C.GAME_WIDTH, y); this.ctx.stroke(); } const segmentWidth = 20; for (let x = 0; x < C.GAME_WIDTH + segmentWidth; x += segmentWidth) { this.ctx.fillStyle = theme.COLOR_GROUND_BOTTOM; this.ctx.fillRect(x, C.GROUND_Y, segmentWidth -1, C.GROUND_HEIGHT); this.ctx.fillStyle = theme.COLOR_GROUND_TOP; this.ctx.fillRect(x, C.GROUND_Y, segmentWidth -1, C.GROUND_LINE_THICKNESS); } this.ctx.fillStyle = theme.COLOR_GROUND_TOP; this.ctx.fillRect(0, C.GROUND_Y, C.GAME_WIDTH, C.GROUND_LINE_THICKNESS); if (theme.name === "Lush Green" && theme.COLOR_GROUND_GRASS) { this.ctx.fillStyle = theme.COLOR_GROUND_GRASS; for (let x = 0; x < C.GAME_WIDTH; x += 5) { const grassHeight = randomInt(3, 8); this.ctx.fillRect(x, C.GROUND_Y - grassHeight + C.GROUND_LINE_THICKNESS, 2, grassHeight); } } this.ctx.shadowColor = theme.COLOR_GROUND_TOP; this.ctx.shadowBlur = 10; this.ctx.fillRect(0, C.GROUND_Y, C.GAME_WIDTH, C.GROUND_LINE_THICKNESS); this.ctx.shadowColor = 'transparent'; this.ctx.shadowBlur = 0; }
  private drawEnvironment(theme: Theme) { /* Unchanged */ if (!theme) return; this.fireParticles.forEach(p => { const alpha = p.life / 50; const color = Math.random() > 0.5 ? theme.COLOR_ENV_FIRE1 : theme.COLOR_ENV_FIRE2; this.ctx.fillStyle = `${color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`; this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); this.ctx.fill(); }); if (this.currentTheme.name === "Blue/Orange") { this.waterfallParticles.forEach(p => { const color = Math.random() > 0.3 ? theme.COLOR_ENV_WATERFALL1 : theme.COLOR_ENV_WATERFALL2; this.ctx.fillStyle = color; this.ctx.fillRect(p.x - 1, p.y - 3, 2, 6); }); const waterfallX = C.GAME_WIDTH / 2 - 50; const waterfallWidth = 100; const gradient = this.ctx.createLinearGradient(waterfallX, 0, waterfallX + waterfallWidth, 0); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(0.2, `${theme.COLOR_ENV_WATERFALL1}40`); gradient.addColorStop(0.8, `${theme.COLOR_ENV_WATERFALL1}40`); gradient.addColorStop(1, 'rgba(0,0,0,0)'); this.ctx.fillStyle = gradient; this.ctx.fillRect(waterfallX, 0, waterfallWidth, C.GROUND_Y); } if (this.currentTheme.name === "Blue/Orange") { this.ctx.strokeStyle = theme.COLOR_ENV_RAIN; this.ctx.lineWidth = 1.5; this.rainParticles.forEach(r => { this.ctx.beginPath(); this.ctx.moveTo(r.x, r.y); this.ctx.lineTo(r.x, r.y + C.RAIN_LENGTH); this.ctx.stroke(); }); } }
  private drawGameElements(theme: Theme) { /* Unchanged */ if (!theme) return; this.player.draw(this.ctx, theme); this.entities.forEach(entity => entity.draw(this.ctx, this.frameCount, theme)); }
  // UI drawing is now handled by CSS + DOM updates
  private drawUI() { /* Unchanged */ this.scoreElement.textContent = `Score: ${Math.floor(this.score)}`; if (this.activeBonus) { const bonusTimeLeft = (this.bonusTimer / 60).toFixed(1); this.messageElement.textContent = `${this.activeBonus.name} (${bonusTimeLeft}s)`; this.messageElement.classList.remove('hidden'); } else if (this.currentMessage && this.messageTimer > 0) { this.messageElement.textContent = this.currentMessage; this.messageElement.classList.remove('hidden'); } else { this.messageElement.classList.add('hidden'); } }
  // Pause screen drawing still uses canvas, coordinates are logic-based
  private drawLetterPauseScreen(theme: Theme) { /* Unchanged */ if (!theme) return; this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; this.ctx.fillRect(0, 0, C.GAME_WIDTH, C.GAME_HEIGHT); const screenCenterX = C.GAME_WIDTH / 2; const screenCenterY = C.GAME_HEIGHT / 2; switch (this.letterPauseState) { case LetterPauseState.SHOWING_ICON: const iconX = this.letterIconX; const iconY = this.letterIconY; const iconSize = C.LETTER_ICON_SIZE; this.ctx.fillStyle = '#FFD700'; this.ctx.strokeStyle = '#B8860B'; this.ctx.lineWidth = 2; this.ctx.fillRect(iconX, iconY, iconSize, iconSize * 0.6); this.ctx.strokeRect(iconX, iconY, iconSize, iconSize * 0.6); this.ctx.beginPath(); this.ctx.moveTo(iconX, iconY); this.ctx.lineTo(iconX + iconSize / 2, iconY + iconSize * 0.4); this.ctx.lineTo(iconX + iconSize, iconY); this.ctx.closePath(); this.ctx.stroke(); this.ctx.beginPath(); this.ctx.moveTo(iconX, iconY + iconSize * 0.6); this.ctx.lineTo(iconX + iconSize / 2, iconY + iconSize * 0.2); this.ctx.lineTo(iconX + iconSize, iconY + iconSize * 0.6); this.ctx.stroke(); this.ctx.fillStyle = '#FFF'; this.ctx.font = 'bold 18px Arial'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.shadowColor = theme.COLOR_GROUND_BOTTOM; this.ctx.shadowBlur = 10; this.ctx.fillText("Brief erhalten!", screenCenterX, iconY + iconSize + 25); this.ctx.font = '16px Arial'; this.ctx.fillText("[Tippen zum Öffnen]", screenCenterX, iconY + iconSize + 50); this.ctx.shadowColor = 'transparent'; this.ctx.shadowBlur = 0; break; case LetterPauseState.SHOWING_CHOICES: if (!this.currentLetter) return; this.ctx.fillStyle = theme.COLOR_LETTER_SENDER; this.ctx.font = 'bold 24px Arial'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.fillText(`Post von: ${this.currentLetter.sender}`, screenCenterX, screenCenterY - C.BONUS_CHOICE_Y_OFFSET - 40); this.ctx.fillStyle = theme.COLOR_UI_BONUS_TEXT; this.ctx.font = '18px Arial'; this.ctx.fillText("Wähle einen Bonus!", screenCenterX, screenCenterY - C.BONUS_CHOICE_Y_OFFSET); const totalWidth = this.currentBonusOptions.length * C.BONUS_CHOICE_BOX_WIDTH + (this.currentBonusOptions.length - 1) * C.BONUS_CHOICE_PADDING; let startX = screenCenterX - totalWidth / 2; const choiceY = screenCenterY - C.BONUS_CHOICE_BOX_HEIGHT / 2 + 30; this.bonusChoiceAreas = []; this.currentBonusOptions.forEach((bonus, index) => { const boxX = startX + index * (C.BONUS_CHOICE_BOX_WIDTH + C.BONUS_CHOICE_PADDING); const boxY = choiceY; this.bonusChoiceAreas.push({ x: boxX, y: boxY, width: C.BONUS_CHOICE_BOX_WIDTH, height: C.BONUS_CHOICE_BOX_HEIGHT, bonus: bonus }); this.ctx.fillStyle = theme.COLOR_UI_BONUS_BG; this.ctx.strokeStyle = theme.COLOR_UI_BONUS_BORDER; this.ctx.lineWidth = 2; this.ctx.fillRect(boxX, boxY, C.BONUS_CHOICE_BOX_WIDTH, C.BONUS_CHOICE_BOX_HEIGHT); this.ctx.strokeRect(boxX, boxY, C.BONUS_CHOICE_BOX_WIDTH, C.BONUS_CHOICE_BOX_HEIGHT); this.ctx.fillStyle = theme.COLOR_UI_BONUS_NAME; this.ctx.font = 'bold 20px Arial'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.fillText(bonus.name, boxX + C.BONUS_CHOICE_BOX_WIDTH / 2, boxY + 25); this.ctx.fillStyle = theme.COLOR_UI_BONUS_DESC; this.ctx.font = '14px Arial'; this.wrapText(bonus.description, boxX + C.BONUS_CHOICE_BOX_WIDTH / 2, boxY + 50, C.BONUS_CHOICE_BOX_WIDTH - 30, 16, this.ctx); }); break; case LetterPauseState.SHOWING_LETTER: if (!this.currentLetter) return; this.letterBoxWidth = C.GAME_WIDTH * C.LETTER_BOX_WIDTH_RATIO; this.letterBoxHeight = C.GAME_HEIGHT * C.LETTER_BOX_HEIGHT_RATIO; this.letterBoxX = (C.GAME_WIDTH - this.letterBoxWidth) / 2; this.letterBoxY = (C.GAME_HEIGHT - this.letterBoxHeight) / 2; this.ctx.fillStyle = theme.COLOR_LETTER_BG; this.ctx.strokeStyle = theme.COLOR_LETTER_BORDER; this.ctx.lineWidth = 4; this.ctx.fillRect(this.letterBoxX, this.letterBoxY, this.letterBoxWidth, this.letterBoxHeight); this.ctx.strokeRect(this.letterBoxX, this.letterBoxY, this.letterBoxWidth, this.letterBoxHeight); this.ctx.fillStyle = theme.COLOR_LETTER_SENDER; this.ctx.font = 'bold 26px Arial'; this.ctx.textAlign = 'left'; this.ctx.textBaseline = 'top'; this.ctx.fillText(`Von: ${this.currentLetter.sender}`, this.letterBoxX + C.LETTER_BOX_PADDING, this.letterBoxY + C.LETTER_BOX_PADDING); this.ctx.font = '19px Arial'; this.ctx.fillStyle = theme.COLOR_LETTER_TEXT; const originalAlign = this.ctx.textAlign; this.ctx.textAlign = 'left'; this.wrapText(this.currentLetter.text, this.letterBoxX + C.LETTER_BOX_PADDING, this.letterBoxY + C.LETTER_BOX_PADDING + 45, this.letterBoxWidth - (C.LETTER_BOX_PADDING * 2), 24, this.ctx); this.ctx.textAlign = originalAlign; this.ctx.fillStyle = theme.COLOR_LETTER_X; this.ctx.font = 'italic 16px Arial'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'bottom'; this.ctx.fillText("[Weiter...]", screenCenterX, this.letterBoxY + this.letterBoxHeight - C.LETTER_BOX_PADDING + 10); break; case LetterPauseState.COUNTDOWN: this.ctx.fillStyle = '#FFFFFF'; this.ctx.font = 'bold 90px Arial'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.shadowColor = theme.COLOR_GROUND_TOP; this.ctx.shadowBlur = 20; this.ctx.fillText(`${this.resumeCountdown}`, screenCenterX, screenCenterY); this.ctx.shadowColor = 'transparent'; this.ctx.shadowBlur = 0; break; } }

  // --- Main Draw Call ---
  private draw() {
    const theme = this.currentTheme;
    if (!theme) { console.error("Theme is undefined in draw!"); this.currentThemeIndex = 0; this.applyTheme(); return; }

    // Clear the entire canvas (physical size)
    this.ctx.save(); // Save default state
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to clear properly
    this.ctx.clearRect(0, 0, this.currentCanvasWidth, this.currentCanvasHeight);
    this.ctx.restore(); // Restore previous transform state (usually identity)

    // Apply scaling for game world drawing
    this.ctx.save();
    this.ctx.scale(this.scaleX, this.scaleY);

    // Draw game elements using logic coordinates (C.GAME_WIDTH, C.GAME_HEIGHT)
    this.drawBackgroundAndGround(theme);
    this.drawEnvironment(theme);
    this.drawGameElements(theme);

    // Draw pause screen elements if needed (also uses logic coordinates)
    if (this.letterPauseState !== LetterPauseState.NONE) {
      this.drawLetterPauseScreen(theme);
    }

    // Restore context before drawing UI (which is DOM-based)
    this.ctx.restore();

    // Update DOM-based UI elements
    this.drawUI();
  }


  // --- Game Loop ---
  private gameLoop = () => { /* Unchanged */ try { if (this.letterPauseState === LetterPauseState.NONE) { this.update(); } this.draw(); if (!this.isGameOver && this.letterPauseState !== LetterPauseState.SHOWING_ICON && this.letterPauseState !== LetterPauseState.SHOWING_CHOICES && this.letterPauseState !== LetterPauseState.SHOWING_LETTER) { this.animationFrameId = requestAnimationFrame(this.gameLoop); } else if (!this.isGameOver && this.letterPauseState !== LetterPauseState.NONE) { if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; } this.draw(); } } catch (error) { console.error("Error during game loop:", error); this.gameOver(); this.ctx.fillStyle = 'red'; this.ctx.font = '16px Arial'; this.ctx.textAlign = 'center'; this.ctx.fillText(`RUNTIME ERROR: ${error instanceof Error ? error.message : String(error)}`, C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2 + 40); } };

  // --- Restart ---
  public restart() {
    console.log("Restarting game...");
    this.clearCountdownInterval();
    this.removeBonusEffect();
    this.currentThemeIndex = 0; this.lastThemeSwitchScore = 0; this.applyTheme();
    this.player = new Player();
    this.entities = []; this.fireParticles = []; this.waterfallParticles = []; this.rainParticles = [];
    this.lastGroundEntityEndX = -Infinity;
    this.gameSpeed = C.INITIAL_GAME_SPEED; this.originalGameSpeed = this.gameSpeed;
    this.score = 0; this.frameCount = 0;
    this.currentSpawnRate = C.INITIAL_SPAWN_RATE; this.originalSpawnRate = this.currentSpawnRate;
    this.entitySpawnTimer = this.currentSpawnRate;
    this.isGameOver = false;
    this.currentMessage = null; this.messageTimer = 0; this.lastMessageScore = 0;
    this.letterPauseState = LetterPauseState.NONE;
    this.currentLetter = null; this.currentBonusOptions = []; this.bonusChoiceAreas = [];
    this.lastLetterScoreThreshold = 0;
    this.activeBonus = null; this.bonusTimer = 0;
    this.difficultyLevel = 0; this.lastDifficultyIncreaseScore = 0;
    this.gameOverElement.classList.add('hidden');
    this.instructionsElement.classList.remove('hidden');
    this.setupInput(); // Re-attach listeners
    this.handleResize(); // Ensure canvas size and scale are correct on restart
    if (!this.animationFrameId) {
      this.start();
    }
  }

  // --- Start ---
  public start() { /* Unchanged */ if (this.animationFrameId) { console.warn("Game loop already running."); return; } console.log("Starting game loop..."); this.isGameOver = false; this.letterPauseState = LetterPauseState.NONE; this.clearCountdownInterval(); this.gameOverElement.classList.add('hidden'); this.handleResize(); console.log("Requesting first animation frame."); this.animationFrameId = requestAnimationFrame(this.gameLoop); }

  // --- Cleanup ---
  // Optional: Add a method to remove listeners when game is destroyed
  public destroy() {
      console.log("Destroying game instance, removing listeners.");
      if (this.animationFrameId) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
      }
      this.clearCountdownInterval();
      window.removeEventListener('keydown', this.handleKeyDown);
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('click', this.handleClick);
      window.removeEventListener('resize', this.handleResize);
  }
}
