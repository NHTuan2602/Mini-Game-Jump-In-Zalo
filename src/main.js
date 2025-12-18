import Phaser from 'phaser';

// --- CẤU HÌNH ---
const PLAYER_SIZE = 25;
const PLATFORM_W = 100;
const PLATFORM_H = 15;
const ENEMY_SIZE = 17; 
const SPRING_SIZE = 23; 

const SCREEN_W = window.innerWidth;
const SCREEN_H = window.innerHeight;

const SAFE_MARGIN = PLATFORM_W / 2 + 10; 

// --- CẤU HÌNH 3 LÀN ĐƯỜNG ---
const CENTER_X = SCREEN_W / 2;
const LANE_LEFT = SCREEN_W * 0.2;   
const LANE_CENTER = SCREEN_W * 0.5; 
const LANE_RIGHT = SCREEN_W * 0.8;  

const LANES = [LANE_LEFT, LANE_CENTER, LANE_RIGHT];

// --- GÓC NHÌN XA (ZOOM 0.7) ---
const GAME_ZOOM = 0.7; 

const VIEW_W = SCREEN_W / GAME_ZOOM;
const VIEW_H = SCREEN_H / GAME_ZOOM;

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
    input: {
        activePointers: 3, 
    },
    scene: { preload, create, update }
};

// --- BIẾN TOÀN CỤC ---
let player;
let platforms;      
let fakePlatforms;  
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

let enemySafeCount = 0; 
let consecutiveFakes = 0; 

// Biến điều khiển
let isMovingLeft = false;
let isMovingRight = false;
let btnLeftVisual;
let btnRightVisual;
let uiGroup;

function preload() {
    const g = this.make.graphics();
    
    // Player
    g.fillStyle(0x00ff00, 1);
    g.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE);
    g.generateTexture('player', PLAYER_SIZE, PLAYER_SIZE);
    g.clear();

    // Platform (Thật - Trắng Xanh)
    g.fillStyle(0xE0FFFF, 1); 
    g.fillRect(0, 0, PLATFORM_W, PLATFORM_H);
    g.generateTexture('platform', PLATFORM_W, PLATFORM_H);
    g.clear();

    // Fake Platform (Giả - Xám Đậm)
    g.fillStyle(0x696969, 1); 
    g.fillRect(0, 0, PLATFORM_W, PLATFORM_H);
    g.generateTexture('fakePlatform', PLATFORM_W, PLATFORM_H);
    g.clear();

    // Enemy
    g.fillStyle(0xFF0000, 1);
    g.fillCircle(ENEMY_SIZE/2, ENEMY_SIZE/2, ENEMY_SIZE/2);
    g.generateTexture('enemy', ENEMY_SIZE, ENEMY_SIZE);
    g.clear();

    // Spring
    g.fillStyle(0xFF00FF, 1);
    g.fillRect(0, 0, SPRING_SIZE, SPRING_SIZE/2); 
    g.generateTexture('spring', SPRING_SIZE, SPRING_SIZE/2);
    g.clear();

    // Touch Button
    g.fillStyle(0xFFFFFF, 0.4);
    g.fillCircle(50, 50, 50); 
    g.generateTexture('touchBtn', 100, 100);
}

function create() {
    isGameOver = false;
    score = 0;
    timeLeft = 200;
    enemySafeCount = 0;
    consecutiveFakes = 0; 
    isMovingLeft = false;
    isMovingRight = false;

    // Camera Zoom
    this.cameras.main.setZoom(GAME_ZOOM);
    this.cameras.main.centerOn(SCREEN_W / 2, SCREEN_H / 2);

    platforms = this.physics.add.group({ allowGravity: false, immovable: true });
    fakePlatforms = this.physics.add.group({ allowGravity: false, immovable: true }); 
    enemies = this.physics.add.group({ allowGravity: false, immovable: true });
    springs = this.physics.add.group({ allowGravity: false, immovable: true });

    createStartSafeZone();
    spawnInitialPlatforms();

    // Tạo Player
    player = this.physics.add.sprite(LANE_CENTER, 450, 'player');
    player.setBounce(0);
    player.body.checkCollision.up = false;
    player.body.checkCollision.left = false;
    player.body.checkCollision.right = false;

    // --- XỬ LÝ VA CHẠM ---

    // 1. Thang THẬT
    this.physics.add.collider(player, platforms, (player, platform) => {
        if (player.body.touching.down) {
            player.setVelocityY(-700); 
            player.y -= 4; 
        }
    });

    // 2. Thang GIẢ
    this.physics.add.overlap(player, fakePlatforms, (player, platform) => {
        // Chỉ kích hoạt khi nhân vật rơi từ trên xuống chạm vào thang
        if (player.body.velocity.y > 0 && player.y < platform.y) {
            // FIX: Tìm và xóa Enemy/Spring đang đứng trên thang fake này
            
            // Xóa Enemy
            const attachedEnemies = enemies.getChildren().filter(e => e.platformParent === platform);
            attachedEnemies.forEach(e => e.destroy());

            // Xóa Spring
            const attachedSprings = springs.getChildren().filter(s => s.platformParent === platform);
            attachedSprings.forEach(s => s.destroy());

            // Xóa chính cái thang
            platform.destroy(); 
        }
    });

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

    this.physics.add.overlap(player, springs, (player, spring) => {
        if (player.body.velocity.y > 0) {
            player.setVelocityY(-1200); 
            this.cameras.main.shake(100, 0.02);
        }
    });

    this.cameras.main.startFollow(player, true, 0, 0.05);
    this.cameras.main.setDeadzone(VIEW_W, 200); 
    
    cursors = this.input.keyboard.createCursorKeys();

    // UI Setup
    uiGroup = this.add.group();
    const uiCamera = this.cameras.add(0, 0, SCREEN_W, SCREEN_H);
    uiCamera.ignore([player, platforms, fakePlatforms, enemies, springs]); 

    createInterface(this);
    createTouchControls(this);
    this.cameras.main.ignore(uiGroup); 
    
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });
}

function createStartSafeZone() {
    const startX = LANE_CENTER;
    const startPlatform = platforms.create(startX, 500, 'platform');
    resetPlatformProperties(startPlatform, startX, 500, 'start');
    minPlatformY = 500;
}

function spawnInitialPlatforms() {
    // Sinh 100 bậc đầu tiên
    for (let i = 1; i <= 100; i++) {
        let baseX = Phaser.Math.RND.pick(LANES);
        let offsetX = Phaser.Math.Between(-30, 30);
        let rawX = baseX + offsetX;
        let x = Phaser.Math.Clamp(rawX, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
        let y = 500 - i * 85; 
        
        // 5 bậc đầu luôn là thật
        if (i <= 5) {
            let p = platforms.create(x, y, 'platform');
            resetPlatformProperties(p, x, y, 'start');
        } else {
            // Logic random có kiểm soát
            let isFake = false;
            // Nếu đã 2 lần fake liên tiếp -> Bắt buộc thật
            if (consecutiveFakes >= 2) {
                isFake = false;
                consecutiveFakes = 0;
            } else {
                // Tỉ lệ fake 15%
                if (Phaser.Math.Between(1, 100) <= 15) {
                    isFake = true;
                    consecutiveFakes++;
                } else {
                    isFake = false;
                    consecutiveFakes = 0;
                }
            }

            if (isFake) {
                let p = fakePlatforms.create(x, y, 'fakePlatform');
                resetPlatformProperties(p, x, y, 'fake');
            } else {
                let p = platforms.create(x, y, 'platform');
                resetPlatformProperties(p, x, y, 'random');
            }
        }
        
        if (y < minPlatformY) minPlatformY = y;
    }
}

function createInterface(scene) {
    const fontStyle = { 
        fontSize: '32px', 
        fontFamily: 'Arial', 
        fontWeight: 'bold',
        stroke: '#000000', 
        strokeThickness: 4 
    };

    scoreText = scene.add.text(20, 20, 'Score: 0', { 
        ...fontStyle, fill: '#FFD700' 
    }).setScrollFactor(0);
    uiGroup.add(scoreText); 

    timeText = scene.add.text(SCREEN_W - 20, 20, 'Time: 200', { 
        ...fontStyle, fill: '#FFFFFF' 
    }).setScrollFactor(0).setOrigin(1, 0);
    uiGroup.add(timeText);
}

function createTouchControls(scene) {
    const btnY = SCREEN_H - 100; 
    const marginX = 100; 
    const btnLeftX = marginX;
    const btnRightX = SCREEN_W - marginX;

    btnLeftVisual = scene.add.image(btnLeftX, btnY, 'touchBtn').setScrollFactor(0).setAlpha(0.5);
    uiGroup.add(btnLeftVisual);
    const txtLeft = scene.add.text(btnLeftX, btnY, '◄', { fontSize: '60px', fill: '#FFF', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0);
    uiGroup.add(txtLeft);
    
    btnRightVisual = scene.add.image(btnRightX, btnY, 'touchBtn').setScrollFactor(0).setAlpha(0.5);
    uiGroup.add(btnRightVisual);
    const txtRight = scene.add.text(btnRightX, btnY, '►', { fontSize: '60px', fill: '#FFF', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0);
    uiGroup.add(txtRight);
}

function update() {
    if (isGameOver) return;

    // Input Polling
    isMovingLeft = false;
    isMovingRight = false;
    btnLeftVisual.setAlpha(0.5);
    btnRightVisual.setAlpha(0.5);

    const pointers = [this.input.pointer1, this.input.pointer2];
    pointers.forEach(pointer => {
        if (pointer.isDown) {
            if (pointer.x < SCREEN_W / 2) {
                isMovingLeft = true;
                btnLeftVisual.setAlpha(1);
            }
            else {
                isMovingRight = true;
                btnRightVisual.setAlpha(1);
            }
        }
    });

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

    const cam = this.cameras.main;
    const destroyThreshold = (cam.worldView.bottom || (cam.scrollY + cam.displayHeight)) - 200;

    // --- RECYCLE ---
    const platformsToRecycle = [];
    
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
        if (child.y > destroyThreshold) platformsToRecycle.push(child);
    });

    fakePlatforms.children.iterate(child => {
        if (child.y > destroyThreshold) platformsToRecycle.push(child);
    });

    platformsToRecycle.forEach(child => recyclePlatform(child));

    const updateChild = (child) => {
        if (child) {
            if (child.y > destroyThreshold) {
                child.destroy();
                return;
            }
            if (child.platformParent && child.platformParent.active && child.body) {
                if (!child.isPatrolling) {
                    child.setVelocityX(child.platformParent.body.velocity.x);
                }
                if (child.isPatrolling) {
                    const p = child.platformParent;
                    const limit = (p.displayWidth / 2) - (child.width / 2);
                    if (child.x > p.x + limit) child.setVelocityX(-Math.abs(child.body.velocity.x));
                    else if (child.x < p.x - limit) child.setVelocityX(Math.abs(child.body.velocity.x));
                }
            }
        }
    };
    enemies.children.iterate(updateChild);
    springs.children.iterate(updateChild);

    if (player.y > destroyThreshold) gameOver(this);
}

function recyclePlatform(platform) {
    if (!platform) return;

    const attachedEnemies = enemies.getChildren().filter(e => e.platformParent === platform);
    attachedEnemies.forEach(e => e.destroy());
    const attachedSprings = springs.getChildren().filter(s => s.platformParent === platform);
    attachedSprings.forEach(s => s.destroy());

    platform.destroy(); 

    minPlatformY -= Phaser.Math.Between(85, 105);
    
    let baseX = Phaser.Math.RND.pick(LANES);
    let range = Math.min(40 + (score * 0.5), 80); 
    let offsetX = Phaser.Math.Between(-range, range);
    let newX = baseX + offsetX;
    newX = Phaser.Math.Clamp(newX, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
    
    // --- LOGIC SINH THANG CÓ KIỂM SOÁT ---
    let isFake = false;
    
    // Nếu đã 3 thang fake liên tiếp -> Bắt buộc thang thật
    if (consecutiveFakes >= 3) {
        isFake = false;
        consecutiveFakes = 0;
    } else {
        // Tỉ lệ fake 15%
        if (Phaser.Math.Between(1, 100) <= 15) {
            isFake = true;
            consecutiveFakes++;
        } else {
            isFake = false;
            consecutiveFakes = 0;
        }
    }

    let newPlatform;
    if (isFake) {
        newPlatform = fakePlatforms.create(newX, minPlatformY, 'fakePlatform');
        resetPlatformProperties(newPlatform, newX, minPlatformY, 'fake');
    } else {
        newPlatform = platforms.create(newX, minPlatformY, 'platform');
        resetPlatformProperties(newPlatform, newX, minPlatformY, 'random');
    }
}

function resetPlatformProperties(p, x, y, type) {
    p.body.enable = true; 
    p.setVelocityX(0);
    p.refreshBody();
    p.clearTint();
    p.alpha = 1;
    p.setVisible(true); 
    p.active = true;
    p.body.checkCollision.none = false;
    p.isMoving = false;
    p.moveSpeed = 0;

    let scaleFactor = 1;
    if (score > 1000) scaleFactor = 0.4; 
    else if (score > 50) scaleFactor = Math.max(0.7, 1 - ((score - 50) * 0.001));
    p.setScale(scaleFactor, 1);
    p.refreshBody(); 

    if (enemySafeCount > 0) enemySafeCount--;

    if (type === 'start') return;

    // --- CHO PHÉP SINH ĐỒ TRÊN THANG FAKE ---
    if (type === 'fake') {
        p.isFake = true; 
        // Code chạy tiếp để sinh Lò xo/Enemy
    }

    // Tỉ lệ Lò Xo 20% 
    let hasSpring = false;
    if (Phaser.Math.Between(1, 100) <= 20) {
        spawnSpring(p);
        enemySafeCount = 5; 
        hasSpring = true;
    }

    // Logic di chuyển (Chỉ thang thật mới di chuyển)
    if (!p.isFake) { 
        let movingChance = 10;
        if (score > 50) movingChance = 20;
        if (score > 150) movingChance = 30;

        if (type !== 'real' && Phaser.Math.Between(1, 100) <= movingChance) {
            p.setTint(0x00FFFF); 
            p.isMoving = true;
            let speedBonus = Math.min(score, 100);
            p.moveSpeed = Phaser.Math.Between(50, 150 + speedBonus);
            let direction = Phaser.Math.RND.pick([-1, 1]);
            p.setVelocityX(p.moveSpeed * direction);
        }
    }

    // Sinh Enemy 
    if (!hasSpring && enemySafeCount <= 0) {
        trySpawnEnemy(p);
    }
}

function spawnSpring(platform) {
    const springY = platform.y - (platform.displayHeight / 2) - (SPRING_SIZE / 2); 
    const spring = springs.create(platform.x, springY, 'spring');
    spring.platformParent = platform;
    if (platform.isMoving) {
        spring.setVelocityX(platform.body.velocity.x);
    }
}

function trySpawnEnemy(platform) {
    let spawnRate = 20; 
    if (score > 50) spawnRate = 40;
    if (score > 150) spawnRate = 60;
    if (score > 1000) spawnRate = 80; 

    if (Phaser.Math.Between(1, 100) <= spawnRate) {
        const enemyY = platform.y - (platform.displayHeight / 2) - (ENEMY_SIZE / 2) - 2; 
        const enemy = enemies.create(platform.x, enemyY, 'enemy');
        enemy.setTint(0xFF0000);
        enemy.platformParent = platform;
        enemy.isPatrolling = false;

        if (platform.isMoving) {
            enemy.setVelocityX(platform.body.velocity.x);
        } else {
            if (score > 100) { 
                enemy.isPatrolling = true;
                let maxSpeed = (score > 1000) ? 200 : 100; 
                let patrolSpeed = Math.min(40 + (score * 0.1), maxSpeed);
                enemy.setVelocityX(Phaser.Math.RND.pick([-1, 1]) * patrolSpeed);
            }
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
        SCREEN_W/2, SCREEN_H/2, SCREEN_W, SCREEN_H, 0x000000, 0.8
    );
    uiGroup.add(bg);
    
    const txt1 = scene.add.text(SCREEN_W/2, SCREEN_H/2 - 50, 'GAME OVER', 
        { fontSize: '60px', fill: '#ff0000', fontWeight: 'bold', fontFamily: 'Arial' }).setOrigin(0.5);
    uiGroup.add(txt1);
    
    const txt2 = scene.add.text(SCREEN_W/2, SCREEN_H/2 + 30, 'Score: ' + score, 
        { fontSize: '40px', fill: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5);
    uiGroup.add(txt2);

    const txt3 = scene.add.text(SCREEN_W/2, SCREEN_H/2 + 100, 'Chạm để chơi lại', 
        { fontSize: '30px', fill: '#ffffff', fontFamily: 'Arial' }).setOrigin(0.5);
    uiGroup.add(txt3);

    scene.input.once('pointerdown', () => {
        scene.scene.restart();
    });
}

const game = new Phaser.Game(config);