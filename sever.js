const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let bullets = [];
let zombies = [];
let nextZombieId = 1;

// Vòng lặp cập nhật Zombie trên Server
setInterval(() => {
  const playerIds = Object.keys(players);
  if (playerIds.length === 0) return;

  // Sinh zombie nếu ít hơn 12 con
  if (zombies.length < 12 && Math.random() < 0.08) {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0) { x = Math.random() * 1200; y = -40; }
    else if (edge === 1) { x = 1240; y = Math.random() * 800; }
    else if (edge === 2) { x = Math.random() * 1200; y = 840; }
    else { x = -40; y = Math.random() * 800; }

    zombies.push({
      id: nextZombieId++,
      x, y,
      hp: 100,
      maxHp: 100,
      speed: 1.8 + Math.random() * 1.2
    });
  }

  // Zombie tìm người chơi gần nhất để đuổi theo
  for (let z of zombies) {
    let nearest = null;
    let minDist = Infinity;
    for (let id in players) {
      let p = players[id];
      let dist = Math.hypot(p.x - z.x, p.y - z.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = p;
      }
    }

    if (nearest) {
      let angle = Math.atan2(nearest.y - z.y, nearest.x - z.x);
      z.x += Math.cos(angle) * z.speed;
      z.y += Math.sin(angle) * z.speed;
    }
  }

  // Cập nhật đạn và va chạm với zombie
  for (let bIndex = bullets.length - 1; bIndex >= 0; bIndex--) {
    let b = bullets[bIndex];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    let hit = false;
    for (let z of zombies) {
      if (Math.hypot(b.x - z.x, b.y - z.y) < 22) {
        z.hp -= b.dmg || 35;
        hit = true;
        break;
      }
    }

    if (hit || b.life <= 0) {
      bullets.splice(bIndex, 1);
    }
  }

  // Lọc zombie đã chết
  zombies = zombies.filter(z => z.hp > 0);

  // Gửi trạng thái chung tới tất cả người chơi (30 lần/giây)
  io.emit('stateUpdate', {
    players,
    zombies,
    bullets
  });
}, 1000 / 30);

// Xử lý kết nối socket
io.on('connection', (socket) => {
  console.log('Người chơi kết nối:', socket.id);
  
  players[socket.id] = {
    x: 400 + Math.random() * 200,
    y: 300 + Math.random() * 200,
    angle: 0,
    hp: 100,
    name: `Player_${socket.id.slice(0, 4)}`
  };

  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].angle = data.angle;
    }
  });

  socket.on('shoot', (data) => {
    bullets.push({
      x: data.x,
      y: data.y,
      vx: Math.cos(data.angle) * 12,
      vy: Math.sin(data.angle) * 12,
      dmg: data.dmg || 40,
      life: 50
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server chạy tại: http://localhost:${PORT}`);
});