import Phaser from 'phaser';

// --- CẤU HÌNH ---
const PLAYER_SIZE = 20;
const PLATFORM_W = 70;
const PLATFORM_H = 15;
const ENEMY_SIZE = 12; 
const SPRING_SIZE = 15; 

const SCREEN_W = window.innerWidth;
const SCREEN_H = window.innerHeight;

const SAFE_MARGIN = PLATFORM_W / 2; 

const CENTER_X = SCREEN_W / 2;
const LANE_OFFSET = 90; 
const LANE_LEFT = CENTER_X - LANE_OFFSET;
const LANE_RIGHT = CENTER_X + LANE_OFFSET;

const config = {
    type: Phaser.AUTO,
    width: SCREEN_W,
    height: SCREEN_H,
    parent: 'app',
    backgroundColor: '#87CEEB',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1200 },
            debug: false 
        }
    },
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: { preload, create, update }
};

// --- BIẾN TOÀN CỤC ---
let player;
let platforms;
let enemies;
let springs;
let cursors;
let score = 0;
let scoreText;
let timeLeft = 200;
let timeText;
let isGameOver = false;
let timerEvent;
let minPlatformY;
let pendingDualData = null; 

let enemySafeCount = 0; 

let isMovingLeft = false;
let isMovingRight = false;

function preload() {
    const g = this.make.graphics();
    
    // Player
    g.fillStyle(0x00ff00, 1);
    g.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE);
    g.generateTexture('player', PLAYER_SIZE, PLAYER_SIZE);
    g.clear();

    // Platform
    g.fillStyle(0x8B4513, 1);
    g.fillRect(0, 0, PLATFORM_W, PLATFORM_H);
    g.generateTexture('platform', PLATFORM_W, PLATFORM_H);
    g.clear();

    // Enemy
    g.fillStyle(0xFF0000, 1);
    g.fillCircle(ENEMY_SIZE/2, ENEMY_SIZE/2, ENEMY_SIZE/2);
    g.generateTexture('enemy', ENEMY_SIZE, ENEMY_SIZE);
    g.clear();

    // Spring (MÀU MỚI: TÍM HỒNG - DỄ NHÌN)
    g.fillStyle(0xFF00FF, 1); // Màu Tím Hồng (Magenta)
    g.fillRect(0, 0, SPRING_SIZE, SPRING_SIZE/2); 
    g.generateTexture('spring', SPRING_SIZE, SPRING_SIZE/2);
    g.clear();

    // Touch Button
    g.fillStyle(0xFFFFFF, 0.3);
    g.fillCircle(30, 30, 30);
    g.generateTexture('touchBtn', 60, 60);
}

function create() {
    isGameOver = false;
    score = 0;
    timeLeft = 200;
    pendingDualData = null;
    enemySafeCount = 0;
    isMovingLeft = false;
    isMovingRight = false;

    platforms = this.physics.add.group({ allowGravity: false, immovable: true });
    enemies = this.physics.add.group({ allowGravity: false, immovable: true });
    springs = this.physics.add.group({ allowGravity: false, immovable: true });

    createStartSafeZone();
    spawnInitialPlatforms();

    // Tạo Player
    player = this.physics.add.sprite(LANE_LEFT, 450, 'player');
    player.setBounce(0);
    player.body.checkCollision.up = false;
    player.body.checkCollision.left = false;
    player.body.checkCollision.right = false;

    // --- XỬ LÝ VA CHẠM ---

    // 1. NHẢY THƯỜNG (-700)
    this.physics.add.collider(player, platforms, (player, platform) => {
        if (player.body.touching.down) {
            if (platform.isFake) {
                platform.alpha = 0; 
                platform.body.checkCollision.none = true;
            } else {
                player.setVelocityY(-700); 
                player.y -= 4; 
            }
        }
    });

    // 2. ĐẠP KẺ THÙ (-800)
    this.physics.add.overlap(player, enemies, (player, enemy) => {
        const playerBottom = player.body.y + player.body.height;
        const enemyTop = enemy.body.y;

        if (player.body.velocity.y > 0 && playerBottom < enemyTop + 15) {
            enemy.destroy();
            player.setVelocityY(-800); 
            score += 20;
            scoreText.setText('Score: ' + score);
            this.cameras.main.shake(100, 0.01);
        } else {
            gameOver(this);
        }
    });

    // 3. NHẢY LÒ XO (-1200)
    this.physics.add.overlap(player, springs, (player, spring) => {
        if (player.body.velocity.y > 0) {
            player.setVelocityY(-1200); 
            this.cameras.main.shake(100, 0.02);
        }
    });

    // Camera
    this.cameras.main.startFollow(player, true, 0, 0.05);
    this.cameras.main.setDeadzone(0, 200);
    cursors = this.input.keyboard.createCursorKeys();

    createInterface(this);
    createTouchControls(this);
    
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });
}

function createStartSafeZone() {
    const startX = Phaser.Math.Clamp(LANE_LEFT, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
    const startPlatform = platforms.create(startX, 500, 'platform');
    resetPlatformProperties(startPlatform, startX, 500, 'start');
    minPlatformY = 500;
}

function spawnInitialPlatforms() {
    for (let i = 1; i <= 120; i++) {
        let isLeft = Phaser.Math.Between(0, 1) === 0;
        let offsetX = Phaser.Math.Between(-40, 40);
        let rawX = isLeft ? (LANE_LEFT + offsetX) : (LANE_RIGHT + offsetX);
        let x = Phaser.Math.Clamp(rawX, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
        let y = 500 - i * 85; 
        
        let p = platforms.create(x, y, 'platform');
        let type = (i < 5) ? 'start' : 'random'; 
        resetPlatformProperties(p, x, y, type); 
        
        if (y < minPlatformY) minPlatformY = y;
    }
}

function createInterface(scene) {
    const headerBg = scene.add.rectangle(0, 0, SCREEN_W, 50, 0x000000, 0.5);
    headerBg.setOrigin(0, 0);
    headerBg.setScrollFactor(0);

    scoreText = scene.add.text(16, 12, 'Score: 0', { 
        fontSize: '24px', fill: '#FFD700', fontFamily: 'Arial', fontWeight: 'bold'
    }).setScrollFactor(0);

    timeText = scene.add.text(SCREEN_W - 16, 12, 'Time: 200', { 
        fontSize: '24px', fill: '#FFFFFF', fontFamily: 'Arial', fontWeight: 'bold'
    }).setScrollFactor(0).setOrigin(1, 0);
}

function createTouchControls(scene) {
    const btnY = SCREEN_H - 80;
    const btnLeftX = 60;
    const btnRightX = SCREEN_W - 60;

    const btnLeft = scene.add.image(btnLeftX, btnY, 'touchBtn').setScrollFactor(0).setInteractive();
    const arrowLeft = scene.add.text(btnLeftX, btnY, '◄', { fontSize: '30px', fill: '#FFF' }).setOrigin(0.5).setScrollFactor(0);
    
    btnLeft.on('pointerdown', () => { isMovingLeft = true; btnLeft.setAlpha(0.8); });
    btnLeft.on('pointerup', () => { isMovingLeft = false; btnLeft.setAlpha(1); });
    btnLeft.on('pointerout', () => { isMovingLeft = false; btnLeft.setAlpha(1); });

    const btnRight = scene.add.image(btnRightX, btnY, 'touchBtn').setScrollFactor(0).setInteractive();
    const arrowRight = scene.add.text(btnRightX, btnY, '►', { fontSize: '30px', fill: '#FFF' }).setOrigin(0.5).setScrollFactor(0);

    btnRight.on('pointerdown', () => { isMovingRight = true; btnRight.setAlpha(0.8); });
    btnRight.on('pointerup', () => { isMovingRight = false; btnRight.setAlpha(1); });
    btnRight.on('pointerout', () => { isMovingRight = false; btnRight.setAlpha(1); });
}

function update() {
    if (isGameOver) return;

    if (cursors.left.isDown || isMovingLeft) {
        player.setVelocityX(-300);
        player.setFlipX(true);
    } else if (cursors.right.isDown || isMovingRight) {
        player.setVelocityX(300);
        player.setFlipX(false);
    } else {
        player.setVelocityX(0);
    }

    if (player.x < 0) player.x = SCREEN_W;
    else if (player.x > SCREEN_W) player.x = 0;

    let currentScore = Math.floor((450 - player.y) / 10);
    if (currentScore > score) {
        score = currentScore;
        scoreText.setText('Score: ' + score);
    }

    const destroyThreshold = this.cameras.main.scrollY + SCREEN_H;

    platforms.children.iterate(child => {
        if (child.isMoving) {
            const speed = child.moveSpeed || 100;
            const boundLeft = SAFE_MARGIN; 
            const boundRight = SCREEN_W - SAFE_MARGIN;

            if (child.x <= boundLeft) {
                child.x = boundLeft + 2; 
                child.setVelocityX(speed); 
            } 
            else if (child.x >= boundRight) {
                child.x = boundRight - 2; 
                child.setVelocityX(-speed); 
            }
        }
        if (child.y > destroyThreshold) recyclePlatform(child);
    });

    const updateChild = (child) => {
        if (child) {
            if (child.y > destroyThreshold) {
                child.destroy();
                return;
            }
            if (child.platformParent && child.platformParent.active && child.body) {
                child.setVelocityX(child.platformParent.body.velocity.x);
            }
        }
    };
    enemies.children.iterate(updateChild);
    springs.children.iterate(updateChild);

    if (player.y > destroyThreshold) gameOver(this);
}

function recyclePlatform(platform) {
    if (pendingDualData) {
        platform.y = pendingDualData.y;
        let safeX;
        if (score >= 200) {
            if (pendingDualData.x < CENTER_X) safeX = CENTER_X + Phaser.Math.Between(50, 70);
            else safeX = CENTER_X - Phaser.Math.Between(50, 70);
        } else {
            if (pendingDualData.x < CENTER_X) safeX = LANE_RIGHT + Phaser.Math.Between(-30, 30);
            else safeX = LANE_LEFT + Phaser.Math.Between(-30, 30);
        }
        platform.x = Phaser.Math.Clamp(safeX, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
        resetPlatformProperties(platform, platform.x, pendingDualData.y, 'real');
        pendingDualData = null; 
    } else {
        minPlatformY -= Phaser.Math.Between(75, 95);
        
        let newX;
        if (score >= 200) {
            newX = Phaser.Math.Between(CENTER_X - 30, CENTER_X + 30);
        } else {
            let isLeft = Phaser.Math.Between(0, 1) === 0;
            let offsetX = Phaser.Math.Between(-40, 40);
            newX = isLeft ? (LANE_LEFT + offsetX) : (LANE_RIGHT + offsetX);
        }

        newX = Phaser.Math.Clamp(newX, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
        
        let trapChance = 10;
        if (score > 50) trapChance = 25;
        if (score > 150) trapChance = 40; 

        if (Phaser.Math.Between(1, 100) <= trapChance) {
            platform.x = newX;
            platform.y = minPlatformY;
            resetPlatformProperties(platform, newX, minPlatformY, 'fake');
            pendingDualData = { x: newX, y: minPlatformY };
        } else {
            platform.x = newX;
            platform.y = minPlatformY;
            resetPlatformProperties(platform, newX, minPlatformY, 'random');
        }
    }
}

function resetPlatformProperties(p, x, y, type) {
    p.setVelocityX(0);
    p.refreshBody();
    p.clearTint();
    p.alpha = 1;
    p.body.checkCollision.none = false;
    p.isFake = false;
    p.isMoving = false;
    p.moveSpeed = 0;

    if (enemySafeCount > 0) enemySafeCount--;

    if (type === 'start') return;

    // TĂNG TỈ LỆ LÒ XO LÊN 20% (Để dễ test)
    let hasSpring = false;
    if (Phaser.Math.Between(1, 100) <= 20) {
        spawnSpring(p);
        enemySafeCount = 5; 
        hasSpring = true;
    }

    if (type === 'fake') {
        p.setTint(0x999999);
        p.isFake = true;
        if (!hasSpring && enemySafeCount <= 0) trySpawnEnemy(p, true);
        return;
    }

    let movingChance = 10;
    if (score > 50) movingChance = 20;
    if (score > 150) movingChance = 30;

    if (type !== 'real' && Phaser.Math.Between(1, 100) <= movingChance) {
        p.setTint(0x0000FF);
        p.isMoving = true;
        let speedBonus = Math.min(score, 100);
        p.moveSpeed = Phaser.Math.Between(50, 150 + speedBonus);
        let direction = Phaser.Math.RND.pick([-1, 1]);
        p.setVelocityX(p.moveSpeed * direction);
        
        if (!hasSpring && enemySafeCount <= 0) trySpawnEnemy(p, false);
    } else {
        if (!hasSpring && enemySafeCount <= 0) trySpawnEnemy(p, false);
    }
}

function spawnSpring(platform) {
    const springY = platform.y - (PLATFORM_H / 2) - (SPRING_SIZE / 4) - 2; 
    const spring = springs.create(platform.x, springY, 'spring');
    spring.platformParent = platform;
    if (platform.isMoving) {
        spring.setVelocityX(platform.body.velocity.x);
    }
}

function trySpawnEnemy(platform, isFake) {
    let spawnRate = 20; 
    if (score > 50) spawnRate = 40;
    if (score > 150) spawnRate = 60;
    if (isFake) spawnRate = 80; 

    if (Phaser.Math.Between(1, 100) <= spawnRate) {
        let offsetX = 0;
        if (isFake) {
            const positions = [-20, 0, 20];
            offsetX = positions[Phaser.Math.Between(0, 2)];
        }

        const enemyY = platform.y - (PLATFORM_H / 2) - (ENEMY_SIZE / 2) - 2; 
        const enemy = enemies.create(platform.x + offsetX, enemyY, 'enemy');
        enemy.setTint(0xFF0000);
        enemy.platformParent = platform;
        if (platform.isMoving) {
            enemy.setVelocityX(platform.body.velocity.x);
        }
    }
}

function onTimerTick() {
    if (isGameOver) return;
    timeLeft--;
    timeText.setText('Time: ' + timeLeft);
    if (timeLeft <= 0) gameOver(this);
}

function gameOver(scene) {
    if (isGameOver) return;
    isGameOver = true;
    scene.physics.pause();
    scene.time.removeEvent(timerEvent);
    
    const cam = scene.cameras.main;
    const bg = scene.add.rectangle(
        cam.scrollX + SCREEN_W/2, cam.scrollY + SCREEN_H/2, SCREEN_W, SCREEN_H, 0x000000, 0.8
    );
    
    scene.add.text(cam.scrollX + SCREEN_W/2, cam.scrollY + SCREEN_H/2 - 50, 'GAME OVER', 
        { fontSize: '50px', fill: '#ff0000', fontWeight: 'bold', fontFamily: 'Arial' }).setOrigin(0.5);
    
    scene.add.text(cam.scrollX + SCREEN_W/2, cam.scrollY + SCREEN_H/2 + 20, 'Score: ' + score, 
        { fontSize: '30px', fill: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5);

    scene.add.text(cam.scrollX + SCREEN_W/2, cam.scrollY + SCREEN_H/2 + 70, 'Chạm để chơi lại', 
        { fontSize: '20px', fill: '#ffffff', fontFamily: 'Arial' }).setOrigin(0.5);

    scene.input.once('pointerdown', () => {
        scene.scene.restart();
    });
}

const game = new Phaser.Game(config);