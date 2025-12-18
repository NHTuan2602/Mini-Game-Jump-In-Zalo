import Phaser from 'phaser';

// --- CẤU HÌNH ---
const PLAYER_SIZE = 20;
const PLATFORM_W = 70;
const PLATFORM_H = 15;
const ENEMY_SIZE = 12; 
const SPRING_SIZE = 15; 

const SCREEN_W = window.innerWidth;
const SCREEN_H = window.innerHeight;

const SAFE_MARGIN = PLATFORM_W / 2 + 10; 

const CENTER_X = SCREEN_W / 2;
const LANE_OFFSET = 90; 
const LANE_LEFT = CENTER_X - LANE_OFFSET;
const LANE_RIGHT = CENTER_X + LANE_OFFSET;

// --- GÓC NHÌN XA (ZOOM 0.5) ---
const GAME_ZOOM = 0.6; 

// Kích thước thực tế của thế giới trong game sau khi Zoom
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

// Biến điều khiển
let isMovingLeft = false;
let isMovingRight = false;
let btnLeftVisual;
let btnRightVisual;
let uiGroup; // Nhóm chứa các đối tượng UI

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

    // Spring
    g.fillStyle(0xFF00FF, 1);
    g.fillRect(0, 0, SPRING_SIZE, SPRING_SIZE/2); 
    g.generateTexture('spring', SPRING_SIZE, SPRING_SIZE/2);
    g.clear();

    // Touch Button (Hình tròn mờ)
    g.fillStyle(0xFFFFFF, 0.4);
    g.fillCircle(50, 50, 50); 
    g.generateTexture('touchBtn', 100, 100);
}

function create() {
    isGameOver = false;
    score = 0;
    timeLeft = 200;
    enemySafeCount = 0;
    isMovingLeft = false;
    isMovingRight = false;

    // --- CÀI ĐẶT CAMERA ZOOM ---
    this.cameras.main.setZoom(GAME_ZOOM);
    this.cameras.main.centerOn(SCREEN_W / 2, SCREEN_H / 2);

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

    // Camera follow
    this.cameras.main.startFollow(player, true, 0, 0.05);
    this.cameras.main.setDeadzone(VIEW_W, 200); 
    
    cursors = this.input.keyboard.createCursorKeys();

    // --- CÀI ĐẶT UI CAMERA ---
    // Tạo một nhóm chứa UI để quản lý hiển thị riêng biệt
    uiGroup = this.add.group();
    
    // Tạo Camera riêng cho UI (Zoom 1x, không di chuyển, đè lên trên Main Camera)
    const uiCamera = this.cameras.add(0, 0, SCREEN_W, SCREEN_H);
    uiCamera.ignore([player, platforms, enemies, springs]); // UI Camera KHÔNG hiển thị đối tượng game

    createInterface(this);
    createTouchControls(this);
    this.cameras.main.ignore(uiGroup); // Main Camera KHÔNG hiển thị UI (tránh bị mờ do zoom)
    
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });
}

function createStartSafeZone() {
    const startX = Phaser.Math.Clamp(LANE_LEFT, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
    const startPlatform = platforms.create(startX, 500, 'platform');
    resetPlatformProperties(startPlatform, startX, 500, 'start');
    minPlatformY = 500;
}

function spawnInitialPlatforms() {
    // 100 bậc để đủ lấp màn hình rộng
    for (let i = 1; i <= 100; i++) {
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
    // --- UI GỌN GÀNG (KHÔNG DÙNG NỀN ĐEN) ---
    const fontStyle = { 
        fontSize: '32px', // Kích thước chuẩn, không cần scale to nữa
        fontFamily: 'Arial', 
        fontWeight: 'bold',
        stroke: '#000000', // Viền đen
        strokeThickness: 4 // Độ dày viền vừa phải
    };

    // Điểm số (Góc trên Trái)
    // Dùng tọa độ màn hình thật (SCREEN_W/H) vì UI Camera không bị zoom
    scoreText = scene.add.text(20, 20, 'Score: 0', { 
        ...fontStyle, fill: '#FFD700' 
    }).setScrollFactor(0);
    uiGroup.add(scoreText); // Thêm vào nhóm UI

    // Thời gian (Góc trên Phải)
    timeText = scene.add.text(SCREEN_W - 20, 20, 'Time: 200', { 
        ...fontStyle, fill: '#FFFFFF' 
    }).setScrollFactor(0).setOrigin(1, 0);
    uiGroup.add(timeText);
}

function createTouchControls(scene) {
    // --- VỊ TRÍ NÚT BẤM (HẠ THẤP XUỐNG) ---
    // Đặt nút cách đáy màn hình 100px
    const btnY = SCREEN_H - 100; 
    
    const marginX = 100; 
    const btnLeftX = marginX;
    const btnRightX = SCREEN_W - marginX;

    // Nút Trái
    btnLeftVisual = scene.add.image(btnLeftX, btnY, 'touchBtn')
        .setScrollFactor(0)
        .setAlpha(0.5);
    uiGroup.add(btnLeftVisual);

    const txtLeft = scene.add.text(btnLeftX, btnY, '◄', { fontSize: '60px', fill: '#FFF', stroke: '#000', strokeThickness: 4 }) 
        .setOrigin(0.5)
        .setScrollFactor(0);
    uiGroup.add(txtLeft);
    
    // Nút Phải
    btnRightVisual = scene.add.image(btnRightX, btnY, 'touchBtn')
        .setScrollFactor(0)
        .setAlpha(0.5);
    uiGroup.add(btnRightVisual);

    const txtRight = scene.add.text(btnRightX, btnY, '►', { fontSize: '60px', fill: '#FFF', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5)
        .setScrollFactor(0);
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
            // Logic chia đôi màn hình vật lý
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

    // Threshold hủy thang
    const destroyThreshold = this.cameras.main.scrollY + VIEW_H;

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
        
        if (child.y > destroyThreshold) {
            recyclePlatform(child);
        }
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
    if (!platform || !platform.body) return;

    const attachedEnemies = enemies.getChildren().filter(e => e.platformParent === platform);
    attachedEnemies.forEach(e => e.destroy());
    const attachedSprings = springs.getChildren().filter(s => s.platformParent === platform);
    attachedSprings.forEach(s => s.destroy());

    minPlatformY -= Phaser.Math.Between(85, 105);
    
    let isLeft = Phaser.Math.Between(0, 1) === 0;
    let range = Math.min(40 + (score * 0.5), 150); 
    let offsetX = Phaser.Math.Between(-range, range);
    let newX = isLeft ? (LANE_LEFT + offsetX) : (LANE_RIGHT + offsetX);
    newX = Phaser.Math.Clamp(newX, SAFE_MARGIN, SCREEN_W - SAFE_MARGIN);
    
    platform.x = newX;
    platform.y = minPlatformY;

    let trapChance = 10;
    if (score > 50) trapChance = 20;
    if (score > 150) trapChance = 30;

    if (Phaser.Math.Between(1, 100) <= trapChance) {
        resetPlatformProperties(platform, newX, minPlatformY, 'fake');
    } else {
        resetPlatformProperties(platform, newX, minPlatformY, 'random');
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
    p.isFake = false;
    p.isMoving = false;
    p.moveSpeed = 0;

    if (enemySafeCount > 0) enemySafeCount--;

    if (type === 'start') return;

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
    
    // Nền đen mờ toàn màn hình
    // Vẽ trực tiếp lên UI Camera (tọa độ 0,0 là góc trên trái màn hình)
    const bg = scene.add.rectangle(
        SCREEN_W/2, SCREEN_H/2, SCREEN_W, SCREEN_H, 0x000000, 0.8
    );
    uiGroup.add(bg);
    
    const txt1 = scene.add.text(SCREEN_W/2, SCREEN_H/2 - 50, 'GAME OVER', 
        { fontSize: '60px', fill: '#ff0000', fontWeight: 'bold', fontFamily: 'Arial' })
        .setOrigin(0.5);
    uiGroup.add(txt1);
    
    const txt2 = scene.add.text(SCREEN_W/2, SCREEN_H/2 + 30, 'Score: ' + score, 
        { fontSize: '40px', fill: '#FFD700', fontFamily: 'Arial' })
        .setOrigin(0.5);
    uiGroup.add(txt2);

    const txt3 = scene.add.text(SCREEN_W/2, SCREEN_H/2 + 100, 'Chạm để chơi lại', 
        { fontSize: '30px', fill: '#ffffff', fontFamily: 'Arial' })
        .setOrigin(0.5);
    uiGroup.add(txt3);

    scene.input.once('pointerdown', () => {
        scene.scene.restart();
    });
}

const game = new Phaser.Game(config);