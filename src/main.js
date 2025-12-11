import Phaser from 'phaser';

// --- CẤU HÌNH ---
const PLAYER_SIZE = 20;
const PLATFORM_W = 70;
const PLATFORM_H = 15;
const ENEMY_SIZE = 16; 

const LANE_LEFT = 90;
const LANE_RIGHT = 270;

const config = {
    type: Phaser.AUTO,
    width: 360,
    height: 640,
    parent: 'app',
    backgroundColor: '#87CEEB',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1200 },
            debug: false 
        }
    },
    scene: { preload, create, update }
};

// --- BIẾN TOÀN CỤC ---
let player;
let platforms;
let enemies;
let cursors;
let score = 0;
let scoreText;
let timeLeft = 200;
let timeText;
let isGameOver = false;
let timerEvent;
let minPlatformY;
let lastPlatformWasFake = false; 

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
    g.fillCircle(8, 8, 8);
    g.generateTexture('enemy', 16, 16);
}

function create() {
    isGameOver = false;
    score = 0;
    timeLeft = 200;
    lastPlatformWasFake = false;

    platforms = this.physics.add.group({ allowGravity: false, immovable: true });
    enemies = this.physics.add.group({ allowGravity: false, immovable: true });

    spawnInitialPlatforms();

    // Tạo Player
    player = this.physics.add.sprite(LANE_LEFT, 450, 'player');
    player.setBounce(0);
    player.body.checkCollision.up = false;
    player.body.checkCollision.left = false;
    player.body.checkCollision.right = false;

    // --- XỬ LÝ VA CHẠM ---

    // 1. Player vs Platform (Đã fix lỗi Auto Jump)
    this.physics.add.collider(player, platforms, (player, platform) => {
        if (player.body.touching.down) {
            if (platform.isFake) {
                platform.alpha = 0; 
                platform.body.checkCollision.none = true;
            } else {
                player.setVelocityY(-680); 
            }
        }
    });

    // 2. Player vs Enemy (Đạp đầu)
    this.physics.add.overlap(player, enemies, (player, enemy) => {
        if (player.body.velocity.y > 0 && player.y < enemy.y - 5) {
            enemy.destroy();
            player.setVelocityY(-1000); // Bonus Jump
            score += 20;
            scoreText.setText('Score: ' + score);
        } else {
            gameOver(this);
        }
    });

    this.cameras.main.startFollow(player, true, 0, 0.05);
    this.cameras.main.setDeadzone(0, 200);
    cursors = this.input.keyboard.createCursorKeys();

    scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '20px', fill: '#000', fontWeight: 'bold' }).setScrollFactor(0);
    timeText = this.add.text(240, 16, 'Time: 200', { fontSize: '20px', fill: '#000', fontWeight: 'bold' }).setScrollFactor(0);
    
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });
}

function update() {
    if (isGameOver) return;

    // Điều khiển
    if (cursors.left.isDown) player.setVelocityX(-300);
    else if (cursors.right.isDown) player.setVelocityX(300);
    else player.setVelocityX(0);

    // Xuyên tường
    if (player.x < 0) player.x = config.width;
    else if (player.x > config.width) player.x = 0;

    // Tính điểm
    let currentScore = Math.floor((450 - player.y) / 10);
    if (currentScore > score) {
        score = currentScore;
        scoreText.setText('Score: ' + score);
    }

    const destroyThreshold = this.cameras.main.scrollY + config.height;

    // --- LOGIC PLATFORM ---
    platforms.children.iterate(child => {
        if (child.isMoving) {
            const speed = child.moveSpeed || 100;
            if (score >= 200) {
                if (child.x <= 140) child.setVelocityX(speed);
                else if (child.x >= 220) child.setVelocityX(-speed);
            } else {
                if (child.x <= 50) child.setVelocityX(speed);
                else if (child.x >= 310) child.setVelocityX(-speed);
            }
        }

        if (child.y > destroyThreshold) {
            recyclePlatform(child);
        }
    });

    // --- LOGIC ENEMY (FIX LỖI: Di chuyển theo thang) ---
    enemies.children.iterate(child => {
        if (child) {
            // Xóa khi rớt
            if (child.y > destroyThreshold) child.destroy();
            
            // QUAN TRỌNG: Cập nhật vị trí theo thang mẹ
            if (child.platformParent && child.platformParent.active) {
                child.setVelocityX(child.platformParent.body.velocity.x);
            }
        }
    });

    if (player.y > destroyThreshold) gameOver(this);
}

function spawnInitialPlatforms() {
    minPlatformY = 600;
    for (let i = 0; i < 20; i++) {
        let x = (Phaser.Math.Between(0, 1) === 0) ? Phaser.Math.Between(50, 130) : Phaser.Math.Between(230, 310);
        let y = 600 - i * 85;
        let p = platforms.create(x, y, 'platform');
        
        let isSafe = i < 5;
        resetPlatformProperties(p, x, y, isSafe); 
        
        if (y < minPlatformY) minPlatformY = y;
    }
}

function recyclePlatform(platform) {
    minPlatformY -= Phaser.Math.Between(75, 95);
    
    let newX;
    if (score >= 200) newX = Phaser.Math.Between(150, 210);
    else newX = (Phaser.Math.Between(0, 1) === 0) ? Phaser.Math.Between(50, 130) : Phaser.Math.Between(230, 310);
    
    platform.x = newX;
    platform.y = minPlatformY;
    
    resetPlatformProperties(platform, newX, minPlatformY, false);
}

function resetPlatformProperties(p, x, y, forceNormal) {
    p.setVelocityX(0);
    p.refreshBody();
    p.clearTint();
    p.alpha = 1;
    p.body.checkCollision.none = false;
    p.isFake = false;
    p.isMoving = false;
    p.moveSpeed = 0;

    if (forceNormal) return;

    if (lastPlatformWasFake) {
        lastPlatformWasFake = false;
        trySpawnEnemy(p); // FIX: Truyền p (platform) vào
        return; 
    }

    const rand = Phaser.Math.Between(1, 100);
    let fakeChance = 10;
    let movingChance = 10;

    if (score > 50) { fakeChance = 15; movingChance = 20; }
    if (score > 150) { fakeChance = 20; movingChance = 30; }

    if (rand <= fakeChance) {
        p.setTint(0x999999);
        p.isFake = true;
        lastPlatformWasFake = true; 
    } 
    else if (rand > fakeChance && rand <= (fakeChance + movingChance)) {
        p.setTint(0x0000FF);
        p.isMoving = true;
        lastPlatformWasFake = false;

        let speedBonus = Math.min(score, 100);
        p.moveSpeed = Phaser.Math.Between(50, 150 + speedBonus);

        let direction = Phaser.Math.RND.pick([-1, 1]);
        p.setVelocityX(p.moveSpeed * direction);
        
        // FIX: Thang di chuyển vẫn có thể sinh kẻ thù
        trySpawnEnemy(p);
    }
    else {
        lastPlatformWasFake = false;
        trySpawnEnemy(p);
    }
}

// FIX: Hàm này giờ nhận vào đối tượng platform (để link với nhau)
function trySpawnEnemy(platform) {
    let spawnRate = 20; 
    if (score > 50) spawnRate = 40;
    if (score > 150) spawnRate = 60;

    if (Phaser.Math.Between(1, 100) <= spawnRate) {
        const enemyY = platform.y - (PLATFORM_H / 2) - (ENEMY_SIZE / 2) - 2; 
        
        const enemy = enemies.create(platform.x, enemyY, 'enemy');
        enemy.setTint(0xFF0000);
        
        // QUAN TRỌNG: Gắn enemy vào platform mẹ
        enemy.platformParent = platform;
        
        // Nếu thang đang chạy thì chạy theo luôn
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
    scene.add.text(cam.scrollX + config.width/2, cam.scrollY + 300, 'GAME OVER', 
        { fontSize: '40px', fill: '#ff0000', fontWeight: 'bold' }).setOrigin(0.5);
    
    scene.add.text(cam.scrollX + config.width/2, cam.scrollY + 350, 'F5 to Restart', 
        { fontSize: '20px', fill: '#000' }).setOrigin(0.5);
}

const game = new Phaser.Game(config);