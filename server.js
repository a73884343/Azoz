const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const DB = require('./src/database');
const GD = require('./src/gameData');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'lovegame_secret_2024';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ======== AUTH ROUTES ========
app.post('/api/register', async (req, res) => {
  const { username, password, displayName, avatar } = req.body;
  if (!username || !password || !displayName)
    return res.status(400).json({ error: 'بيانات ناقصة' });
  if (username.length < 3)
    return res.status(400).json({ error: 'اسم المستخدم قصير' });
  if (password.length < 6)
    return res.status(400).json({ error: 'كلمة المرور قصيرة (6 أحرف على الأقل)' });
  const existing = DB.getUserByUsername(username);
  if (existing) return res.status(400).json({ error: 'اسم المستخدم مأخوذ' });
  const hashed = await bcrypt.hash(password, 10);
  const result = DB.createUser(username, hashed, displayName, avatar || '💜');
  const user = DB.getUserById(result.lastInsertRowid);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = DB.getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'اسم مستخدم أو كلمة مرور خاطئة' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'اسم مستخدم أو كلمة مرور خاطئة' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  const user = DB.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'مستخدم غير موجود' });
  const badges = DB.getUserBadges(user.id);
  res.json({ user: safeUser(user), badges });
});

function safeUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar, level: u.level, xp: u.xp, totalScore: u.total_score, wins: u.wins, gamesPlayed: u.games_played };
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'غير مصرح' });
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'جلسة منتهية' }); }
}

// ======== ROOMS ========
const rooms = {};

function createRoom(code) {
  rooms[code] = { code, players: [], chat: [], game: null, scores: {}, gameType: null };
  return rooms[code];
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function flatQuestions(level) {
  const q = GD.quizQuestions;
  return shuffle([...q.easy, ...q.medium, ...q.hard]).slice(0, 10);
}

// ======== SOCKET ========
io.on('connection', (socket) => {

  // Verify JWT on connect
  const token = socket.handshake.auth?.token;
  let socketUser = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socketUser = DB.getUserById(decoded.id);
    } catch {}
  }

  // ---- ROOM ----
  socket.on('create_room', () => {
    if (!socketUser) { socket.emit('error', { msg: 'سجل دخول أولاً' }); return; }
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const room = createRoom(code);
    const p = { id: socket.id, userId: socketUser.id, name: socketUser.display_name, avatar: socketUser.avatar, level: socketUser.level };
    room.players.push(p);
    room.scores[socket.id] = 0;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.userId = socketUser.id;
    socket.data.name = socketUser.display_name;
    socket.emit('room_created', { code, player: p });
  });

  socket.on('join_room', ({ code }) => {
    if (!socketUser) { socket.emit('error', { msg: 'سجل دخول أولاً' }); return; }
    const room = rooms[code?.toUpperCase()];
    if (!room) { socket.emit('error', { msg: 'الغرفة غير موجودة' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { msg: 'الغرفة ممتلئة' }); return; }
    const p = { id: socket.id, userId: socketUser.id, name: socketUser.display_name, avatar: socketUser.avatar, level: socketUser.level };
    room.players.push(p);
    room.scores[socket.id] = 0;
    socket.join(code.toUpperCase());
    socket.data.roomCode = code.toUpperCase();
    socket.data.userId = socketUser.id;
    socket.data.name = socketUser.display_name;
    socket.emit('room_joined', { room, player: p });
    io.to(code.toUpperCase()).emit('partner_joined', { player: p, players: room.players });
  });

  // ---- CHAT ----
  socket.on('send_message', ({ msg }) => {
    const code = socket.data.roomCode;
    if (!code || !msg?.trim()) return;
    const message = { id: uuidv4(), from: socket.data.name, text: msg.trim(), time: Date.now() };
    rooms[code]?.chat.push(message);
    io.to(code).emit('new_message', message);
  });

  // ---- QUIZ ----
  socket.on('start_quiz', ({ difficulty }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.players.length < 2) { socket.emit('error', { msg: 'انتظر حبيبتك!' }); return; }
    const questions = flatQuestions(difficulty || 'mixed');
    room.game = { type: 'quiz', questions, current: 0, answers: {}, active: true };
    room.scores = {};
    room.players.forEach(p => { room.scores[p.id] = 0; });
    io.to(code).emit('quiz_started', { question: questions[0], index: 0, total: questions.length });
  });

  socket.on('quiz_answer', ({ answerIndex }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'quiz' || !room.game.active) return;
    const { questions, current, answers } = room.game;
    if (answers[socket.id] !== undefined) return;
    answers[socket.id] = answerIndex;
    const q = questions[current];
    const correct = answerIndex === q.ans;
    if (correct) room.scores[socket.id] = (room.scores[socket.id] || 0) + 10;
    socket.emit('quiz_answer_result', { correct, correctAnswer: q.ans, score: room.scores[socket.id] });
    io.to(code).emit('quiz_opponent_answered', { by: socket.data.name });
    if (Object.keys(answers).length >= room.players.length) {
      setTimeout(() => {
        room.game.current++;
        room.game.answers = {};
        if (room.game.current >= questions.length) {
          room.game.active = false;
          finishGame(code, 'quiz');
          io.to(code).emit('quiz_ended', { scores: room.scores, players: room.players });
        } else {
          io.to(code).emit('quiz_next', { question: questions[room.game.current], index: room.game.current, total: questions.length, scores: room.scores });
        }
      }, 1500);
    }
  });

  // ---- MILLION ----
  socket.on('start_million', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.players.length < 2) { socket.emit('error', { msg: 'انتظر حبيبتك!' }); return; }
    const questions = GD.millionQuestions;
    const contestant = room.players[Math.floor(Math.random() * room.players.length)];
    room.game = { type: 'million', questions, current: 0, active: true, contestant: contestant.id, lifelines: { fifty: true, audience: true, call: true } };
    io.to(code).emit('million_started', { question: questions[0], index: 0, total: questions.length, contestant: contestant, lifelines: room.game.lifelines });
  });

  socket.on('million_answer', ({ answerIndex }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'million' || !room.game.active) return;
    if (socket.id !== room.game.contestant) return;
    const { questions, current } = room.game;
    const q = questions[current];
    const correct = answerIndex === q.ans;
    if (!correct) {
      room.game.active = false;
      io.to(code).emit('million_wrong', { correctAnswer: q.ans, prize: current > 0 ? questions[current - 1].prize : '0 ريال' });
      return;
    }
    if (current + 1 >= questions.length) {
      room.game.active = false;
      io.to(code).emit('million_win', { prize: q.prize });
      if (room.game.contestant) {
        const player = room.players.find(p => p.id === room.game.contestant);
        if (player) DB.awardBadge(player.userId, 'millionaire');
      }
      return;
    }
    room.game.current++;
    io.to(code).emit('million_correct', { correctAnswer: q.ans, prize: q.prize, nextQuestion: questions[room.game.current], index: room.game.current });
  });

  socket.on('million_lifeline', ({ type }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'million') return;
    if (!room.game.lifelines[type]) return;
    room.game.lifelines[type] = false;
    const q = room.game.questions[room.game.current];
    let result = {};
    if (type === 'fifty') {
      const wrongIdxs = [0, 1, 2, 3].filter(i => i !== q.ans);
      const toRemove = shuffle(wrongIdxs).slice(0, 2);
      result = { remove: toRemove };
    } else if (type === 'audience') {
      const votes = [0, 0, 0, 0].map((_, i) => i === q.ans ? Math.floor(Math.random() * 30 + 50) : Math.floor(Math.random() * 20));
      result = { votes };
    } else if (type === 'call') {
      result = { hint: `أعتقد الإجابة هي: ${q.opts[q.ans]} (بنسبة 80%)` };
    }
    io.to(code).emit('million_lifeline_result', { type, result, lifelines: room.game.lifelines });
  });

  // ---- TRUTH OR DARE ----
  socket.on('start_truth_dare', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.players.length < 2) { socket.emit('error', { msg: 'انتظر حبيبتك!' }); return; }
    room.game = { type: 'truth_dare', active: true, turn: room.players[0].id };
    io.to(code).emit('truth_dare_started', { currentTurn: room.players[0] });
  });

  socket.on('pick_truth_dare', ({ choice }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'truth_dare') return;
    if (socket.id !== room.game.turn) return;
    let content;
    if (choice === 'truth') {
      content = shuffle(GD.truthQuestions)[0];
    } else {
      content = shuffle(GD.dareActions)[0];
      DB.awardBadge(socket.data.userId, 'truth_darer');
    }
    io.to(code).emit('truth_dare_card', { choice, content, player: socket.data.name });
  });

  socket.on('next_turn_td', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'truth_dare') return;
    const other = room.players.find(p => p.id !== room.game.turn);
    if (other) {
      room.game.turn = other.id;
      io.to(code).emit('truth_dare_next', { currentTurn: other });
    }
  });

  // ---- DRAWING ----
  socket.on('start_drawing', ({ difficulty }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.players.length < 2) { socket.emit('error', { msg: 'انتظر حبيبتك!' }); return; }
    const words = GD.drawingWords[difficulty || 'medium'];
    const word = shuffle(words)[0];
    const drawerIdx = Math.floor(Math.random() * room.players.length);
    const drawer = room.players[drawerIdx];
    room.game = { type: 'drawing', word, drawer: drawer.id, active: true, guessed: false };
    room.players.forEach(p => {
      if (p.id === drawer.id) {
        io.to(p.id).emit('drawing_started', { role: 'drawer', word });
      } else {
        io.to(p.id).emit('drawing_started', { role: 'guesser', drawer: drawer.name });
      }
    });
  });

  socket.on('draw_stroke', (strokeData) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'drawing') return;
    socket.to(code).emit('draw_stroke', strokeData);
  });

  socket.on('draw_clear', () => {
    const code = socket.data.roomCode;
    socket.to(code).emit('draw_clear');
  });

  socket.on('drawing_guess', ({ guess }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'drawing' || room.game.guessed) return;
    if (guess.trim().toLowerCase() === room.game.word.toLowerCase()) {
      room.game.guessed = true;
      const guesser = room.players.find(p => p.id === socket.id);
      const drawer = room.players.find(p => p.id === room.game.drawer);
      if (guesser) { room.scores[socket.id] = (room.scores[socket.id] || 0) + 15; DB.addXP(guesser.userId, 15); }
      if (drawer) { room.scores[drawer.id] = (room.scores[drawer.id] || 0) + 10; DB.addXP(drawer.userId, 10); }
      io.to(code).emit('drawing_correct', { guesser: socket.data.name, word: room.game.word, scores: room.scores });
      DB.awardBadge(socket.data.userId, 'artist');
    } else {
      socket.emit('drawing_wrong', { guess });
    }
  });

  // ---- UNO ----
  socket.on('start_uno', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.players.length < 2) { socket.emit('error', { msg: 'انتظر حبيبتك!' }); return; }
    const deck = GD.createUnoDeck();
    const hand0 = deck.splice(0, 7);
    const hand1 = deck.splice(0, 7);
    let topCard = deck.pop();
    while (topCard.color === 'wild') { deck.unshift(topCard); topCard = deck.pop(); }
    room.game = {
      type: 'uno', deck, topCard, currentColor: topCard.color,
      hands: { [room.players[0].id]: hand0, [room.players[1].id]: hand1 },
      turn: room.players[0].id, active: true, direction: 1,
    };
    room.players.forEach((p, i) => {
      io.to(p.id).emit('uno_started', {
        hand: i === 0 ? hand0 : hand1,
        topCard, currentColor: topCard.color,
        myTurn: i === 0,
        opponentCardCount: 7,
      });
    });
  });

  socket.on('uno_play', ({ cardId, chosenColor }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'uno' || !room.game.active) return;
    if (socket.id !== room.game.turn) { socket.emit('uno_error', { msg: 'ليس دورك' }); return; }
    const hand = room.game.hands[socket.id];
    const cardIdx = hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) { socket.emit('uno_error', { msg: 'البطاقة غير موجودة' }); return; }
    const card = hand[cardIdx];
    if (!GD.canPlay(card, room.game.topCard, room.game.currentColor)) {
      socket.emit('uno_error', { msg: 'لا يمكن لعب هذه البطاقة' }); return;
    }
    hand.splice(cardIdx, 1);
    room.game.topCard = card;
    room.game.currentColor = card.color === 'wild' ? (chosenColor || 'red') : card.color;
    const other = room.players.find(p => p.id !== socket.id);
    // Apply card effects
    if (card.value === '+2') {
      const drawn = room.game.deck.splice(0, 2);
      room.game.hands[other.id].push(...drawn);
      io.to(other.id).emit('uno_draw_penalty', { cards: drawn, count: 2 });
    } else if (card.value === '+4') {
      const drawn = room.game.deck.splice(0, 4);
      room.game.hands[other.id].push(...drawn);
      io.to(other.id).emit('uno_draw_penalty', { cards: drawn, count: 4 });
    }
    // Check win
    if (hand.length === 0) {
      room.game.active = false;
      room.scores[socket.id] = (room.scores[socket.id] || 0) + 30;
      finishGame(code, 'uno');
      io.to(code).emit('uno_win', { winner: socket.data.name, scores: room.scores });
      DB.awardBadge(socket.data.userId, 'uno_champ');
      return;
    }
    // Next turn (skip reverses turn in 2p)
    const skipTurn = card.value === 'skip' || card.value === 'reverse' || card.value === '+2' || card.value === '+4';
    room.game.turn = skipTurn ? socket.id : other.id;
    // Broadcast state
    room.players.forEach(p => {
      io.to(p.id).emit('uno_state', {
        topCard: room.game.topCard,
        currentColor: room.game.currentColor,
        myTurn: room.game.turn === p.id,
        myHand: room.game.hands[p.id],
        opponentCardCount: room.game.hands[p.id === socket.id ? other.id : socket.id].length,
        playedCard: card,
        playedBy: socket.data.name,
      });
    });
  });

  socket.on('uno_draw', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room?.game || room.game.type !== 'uno' || !room.game.active) return;
    if (socket.id !== room.game.turn) return;
    if (room.game.deck.length === 0) return;
    const card = room.game.deck.pop();
    room.game.hands[socket.id].push(card);
    const other = room.players.find(p => p.id !== socket.id);
    socket.emit('uno_drew', { card, hand: room.game.hands[socket.id] });
    io.to(other.id).emit('uno_opponent_drew', { opponentCardCount: room.game.hands[socket.id].length });
    room.game.turn = other.id;
    room.players.forEach(p => {
      io.to(p.id).emit('uno_turn_change', { myTurn: room.game.turn === p.id });
    });
  });

  // ---- FINISH GAME ----
  function finishGame(code, gameType) {
    const room = rooms[code];
    if (!room) return;
    let winnerId = null;
    let maxScore = -1;
    room.players.forEach(p => {
      const s = room.scores[p.id] || 0;
      if (s > maxScore) { maxScore = s; winnerId = p.id; }
    });
    const winner = room.players.find(p => p.id === winnerId);
    const loser = room.players.find(p => p.id !== winnerId);
    if (winner) { DB.addWin(winner.userId); DB.addXP(winner.userId, 50); }
    if (loser) { DB.addGamePlayed(loser.userId); DB.addXP(loser.userId, 20); }
    room.players.forEach(p => {
      const newBadges = DB.checkAndAwardBadges(p.userId);
      if (newBadges.length > 0) io.to(p.id).emit('badges_earned', { badges: newBadges });
    });
  }

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
    io.to(code).emit('partner_left', { name: socket.data.name });
    if (rooms[code].players.length === 0) delete rooms[code];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 LoveGame running on port ${PORT}`));
