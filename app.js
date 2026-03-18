// ===== STATE =====
const S = {
  token: localStorage.getItem('lg_token'),
  user: JSON.parse(localStorage.getItem('lg_user') || 'null'),
  partner: null,
  roomCode: '',
  scores: {},
  activeTab: 'games',
  chatUnread: 0,
  currentGame: null,
  uno: { pendingWild: null },
  draw: { isDrawer: false, drawing: false, color: '#000', size: 5, lastX: 0, lastY: 0 },
};

// ===== SOCKET =====
const socket = io({ auth: { token: S.token } });

// ===== UTILS =====
const $  = id => document.getElementById(id);
const sh = id => $('s-auth s-lobby s-wait s-profile s-game'.split(' ').forEach(s => $(s).classList.remove('active')), $(id).classList.add('active'));
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
function showArea(id) {
  document.querySelectorAll('.game-area,.game-menu').forEach(e => e.classList.add('hidden'));
  $(id).classList.remove('hidden');
}
function showSub(areaId, subId) {
  const subs = ['lobby','play','end','waiting'].map(s => ({
    quiz: ['quiz-lobby','quiz-play','quiz-end'],
    million: ['million-lobby','million-play','million-end'],
    uno: ['uno-lobby','uno-play','uno-end'],
    drawing: ['drawing-lobby','drawing-play','drawing-end'],
    'truth_dare': ['td-lobby','td-play'],
  }[areaId] || []));
  ['quiz-lobby','quiz-play','quiz-end','million-lobby','million-play','million-end',
   'uno-lobby','uno-play','uno-end','drawing-lobby','drawing-play','drawing-end','td-lobby','td-play']
    .forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
  const el = $(subId); if (el) el.classList.remove('hidden');
}
function getTime() {
  const d = new Date();
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}
function showBadge(badge) {
  const t = $('badge-toast');
  t.textContent = badge.icon + ' شارة جديدة: ' + badge.name;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

// ===== AUTH =====
let selectedAvatar = '💜';
document.querySelectorAll('.av-opt').forEach(el => {
  el.onclick = () => {
    document.querySelectorAll('.av-opt').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    selectedAvatar = el.dataset.av;
  };
});

function toggleAuthForm(form) {
  $('form-login').classList.toggle('hidden', form !== 'login');
  $('form-register').classList.toggle('hidden', form !== 'register');
}

async function doLogin() {
  const username = $('login-user').value.trim();
  const password = $('login-pass').value;
  if (!username || !password) return;
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { $('login-err').textContent = data.error; $('login-err').classList.remove('hidden'); return; }
    saveAuth(data);
    socket.auth = { token: data.token };
    socket.disconnect().connect();
    renderLobby();
    showScreen('s-lobby');
  } catch { $('login-err').textContent = 'خطأ في الاتصال'; $('login-err').classList.remove('hidden'); }
}

async function doRegister() {
  const displayName = $('reg-display').value.trim();
  const username = $('reg-user').value.trim();
  const password = $('reg-pass').value;
  if (!displayName || !username || !password) return;
  try {
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, displayName, avatar: selectedAvatar }) });
    const data = await res.json();
    if (!res.ok) { $('reg-err').textContent = data.error; $('reg-err').classList.remove('hidden'); return; }
    saveAuth(data);
    socket.auth = { token: data.token };
    socket.disconnect().connect();
    renderLobby();
    showScreen('s-lobby');
  } catch { $('reg-err').textContent = 'خطأ في الاتصال'; $('reg-err').classList.remove('hidden'); }
}

function saveAuth(data) {
  S.token = data.token;
  S.user = data.user;
  localStorage.setItem('lg_token', data.token);
  localStorage.setItem('lg_user', JSON.stringify(data.user));
}

function logout() {
  localStorage.removeItem('lg_token');
  localStorage.removeItem('lg_user');
  location.reload();
}

// ===== LOBBY =====
function renderLobby() {
  if (!S.user) return;
  const xpForLevel = 500;
  const xpInLevel = S.user.xp % xpForLevel;
  const xpPct = Math.round((xpInLevel / xpForLevel) * 100);
  $('user-info-bar').innerHTML = `
    <div class="uib-avatar">${S.user.avatar}</div>
    <div class="uib-info">
      <div class="uib-name">${S.user.displayName}</div>
      <div class="uib-level">المستوى ${S.user.level}</div>
      <div class="uib-xp-bar"><div class="uib-xp-fill" style="width:${xpPct}%"></div></div>
    </div>
    <div style="font-size:13px;color:var(--text2)">${S.user.totalScore} نقطة</div>
  `;
}

function showJoin() {
  const f = $('join-form');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) $('join-code').focus();
}

// ===== ROOM =====
function createRoom() { socket.emit('create_room'); }
function joinRoom() {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) return;
  socket.emit('join_room', { code });
}

function copyCode() {
  navigator.clipboard.writeText(S.roomCode);
  const btn = document.querySelector('.btn-copy');
  btn.textContent = '✓ تم النسخ!';
  setTimeout(() => btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> نسخ الكود`, 2000);
}

function goLobby() { showScreen('s-lobby'); }
function goProfile() { loadProfile(); showScreen('s-profile'); }

async function loadProfile() {
  try {
    const res = await fetch('/api/profile', { headers: { Authorization: 'Bearer ' + S.token } });
    const data = await res.json();
    const u = data.user;
    const xpPct = Math.round(((u.xp % 500) / 500) * 100);
    $('profile-body').innerHTML = `
      <div class="prof-card">
        <div class="prof-av">${u.avatar}</div>
        <div class="prof-name">${u.displayName}</div>
        <div class="prof-level">المستوى ${u.level}</div>
        <div class="prof-stats">
          <div class="stat-box"><div class="stat-val">${u.wins}</div><div class="stat-lbl">انتصارات</div></div>
          <div class="stat-box"><div class="stat-val">${u.gamesPlayed}</div><div class="stat-lbl">جولات</div></div>
          <div class="stat-box"><div class="stat-val">${u.totalScore}</div><div class="stat-lbl">نقاط</div></div>
        </div>
        <div class="xp-section">
          <div class="xp-label"><span>الخبرة</span><span>${u.xp % 500} / 500</span></div>
          <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
        </div>
      </div>
      <div class="badges-section">
        <div class="badges-title">🏅 شاراتي</div>
        <div class="badges-grid" id="badges-grid">
          ${data.badges.length ? data.badges.map(b => `<div class="badge-chip"><span class="bi">${b.icon}</span><span>${b.name}</span></div>`).join('') : '<p class="no-badges">العب أكثر لتكسب شارات! 🎮</p>'}
        </div>
      </div>
    `;
  } catch {}
}

// ===== GAME NAV =====
function switchTab(tab) {
  $('tab-games').classList.toggle('active', tab === 'games');
  $('tab-chat').classList.toggle('active', tab === 'chat');
  $('pane-games').classList.toggle('active', tab === 'games');
  $('pane-chat').classList.toggle('active', tab === 'chat');
  S.activeTab = tab;
  if (tab === 'chat') { S.chatUnread = 0; $('chat-dot').classList.add('hidden'); }
}

function openGame(g) {
  S.currentGame = g;
  showArea('area-' + g);
  showSub(g, g + '-lobby');
  if (g === 'uno') $('uno-opp-count').textContent = 'بطاقات الخصم: 7';
}

function backMenu() {
  S.currentGame = null;
  showArea('game-menu');
}

function startQuiz(diff) {
  socket.emit('start_quiz', { difficulty: diff });
}

// ===== TOPBAR =====
function renderTopbar() {
  const myScore = S.scores[socket.id] || 0;
  const partnerScore = S.partner ? (S.scores[S.partner.id] || 0) : 0;
  $('game-topbar').innerHTML = `
    <div class="player-pill">
      <span class="pp-av">${S.user?.avatar || '💜'}</span>
      <span class="pp-name">${S.user?.displayName || 'أنا'}</span>
      <span class="pp-score">${myScore}</span>
    </div>
    <span class="vs-text">VS</span>
    <div class="player-pill">
      <span class="pp-av">${S.partner?.avatar || '🌸'}</span>
      <span class="pp-name">${S.partner?.name || '...'}</span>
      <span class="pp-score">${partnerScore}</span>
    </div>
  `;
}

// ===== CHAT =====
function sendChat() {
  const inp = $('chat-inp');
  const msg = inp.value.trim();
  if (!msg) return;
  socket.emit('send_message', { msg });
  inp.value = '';
}

function addChatMsg(message, isMe) {
  const wrap = document.createElement('div');
  wrap.className = 'cmsg ' + (isMe ? 'me' : 'them');
  const t = new Date(message.time);
  wrap.innerHTML = `<div class="cbubble">${message.text}</div><div class="cmeta">${isMe ? '' : message.from + ' · '}${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}</div>`;
  $('chat-msgs').appendChild(wrap);
  $('chat-msgs').scrollTop = $('chat-msgs').scrollHeight;
  if (!isMe && S.activeTab !== 'chat') {
    S.chatUnread++;
    $('chat-dot').classList.remove('hidden');
  }
}

function addSysMsg(text) {
  const d = document.createElement('div');
  d.className = 'csys';
  d.textContent = text;
  $('chat-msgs').appendChild(d);
  $('chat-msgs').scrollTop = $('chat-msgs').scrollHeight;
}

// ===== DRAWING CANVAS =====
let ctx, canvasRect;
function initCanvas() {
  const canvas = $('draw-canvas');
  ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', drawing);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); drawing(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchend', endDraw);
}

function getPos(e) {
  const rect = $('draw-canvas').getBoundingClientRect();
  const scaleX = $('draw-canvas').width / rect.width;
  const scaleY = $('draw-canvas').height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function startDraw(e) {
  if (!S.draw.isDrawer) return;
  S.draw.drawing = true;
  const pos = getPos(e);
  S.draw.lastX = pos.x;
  S.draw.lastY = pos.y;
}

function drawing(e) {
  if (!S.draw.drawing || !S.draw.isDrawer) return;
  const pos = getPos(e);
  drawStroke(S.draw.lastX, S.draw.lastY, pos.x, pos.y, S.draw.color, S.draw.size);
  socket.emit('draw_stroke', { x1: S.draw.lastX, y1: S.draw.lastY, x2: pos.x, y2: pos.y, color: S.draw.color, size: S.draw.size });
  S.draw.lastX = pos.x;
  S.draw.lastY = pos.y;
}

function endDraw() { S.draw.drawing = false; }

function drawStroke(x1, y1, x2, y2, color, size) {
  if (!ctx) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function clearCanvas() {
  if (!ctx) return;
  ctx.clearRect(0, 0, $('draw-canvas').width, $('draw-canvas').height);
}

function setColor(c) { S.draw.color = c; document.querySelectorAll('.tc').forEach(el => el.classList.toggle('active', el.style.background === c || el.style.backgroundColor === c)); }
function setSize(s) { S.draw.size = s; }
function sendDrawGuess() {
  const inp = $('draw-guess-inp');
  const guess = inp.value.trim();
  if (!guess) return;
  socket.emit('drawing_guess', { guess });
  inp.value = '';
}

// ===== UNO =====
let pendingWildCard = null;
function renderUnoCard(card, playable) {
  const el = document.createElement('div');
  el.className = `uno-card ${card.color} ${playable ? 'playable' : 'not-playable'}`;
  el.dataset.id = card.id;
  const labels = { skip: '🚫', reverse: '🔄', '+2': '+2', '+4': '+4', wild: '🎨' };
  el.textContent = labels[card.value] || card.value;
  if (playable) el.onclick = () => {
    if (card.color === 'wild') {
      pendingWildCard = card;
      $('uno-wild-pick').classList.remove('hidden');
    } else {
      socket.emit('uno_play', { cardId: card.id });
    }
  };
  return el;
}

function playWild(color) {
  if (!pendingWildCard) return;
  socket.emit('uno_play', { cardId: pendingWildCard.id, chosenColor: color });
  pendingWildCard = null;
  $('uno-wild-pick').classList.add('hidden');
}

function renderUnoHand(hand, myTurn, topCard, currentColor) {
  const container = $('uno-hand');
  container.innerHTML = '';
  hand.forEach(card => {
    const canPlay = myTurn && (card.color === 'wild' || card.color === currentColor || card.value === topCard.value);
    container.appendChild(renderUnoCard(card, canPlay));
  });
}

function renderTopCard(card) {
  const el = $('uno-top');
  el.className = `uno-card top-card ${card.color}`;
  const labels = { skip: '🚫', reverse: '🔄', '+2': '+2', '+4': '+4', wild: '🎨' };
  el.textContent = labels[card.value] || card.value;
}

const colorMap = { red: '#e74c3c', blue: '#3498db', green: '#27ae60', yellow: '#f1c40f', wild: 'linear-gradient(135deg,#e74c3c,#3498db)' };
function updateColorIndicator(color) {
  const ind = $('uno-color-ind');
  ind.style.background = colorMap[color] || '#888';
}

// ===== MILLION =====
function renderMillionQuestion(q, index, isContestant) {
  $('m-prog').textContent = `${index + 1}/11`;
  $('m-prize').textContent = q.prize;
  $('million-q').textContent = q.q;
  const opts = $('million-opts');
  opts.innerHTML = '';
  const labels = ['أ','ب','ج','د'];
  q.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'mopt';
    btn.textContent = `${labels[i]}: ${opt}`;
    btn.dataset.idx = i;
    if (isContestant) btn.onclick = () => socket.emit('million_answer', { answerIndex: i });
    else btn.classList.add('disabled');
    opts.appendChild(btn);
  });
}

function useLifeline(type) {
  socket.emit('million_lifeline', { type });
}

// ===== SOCKET EVENTS =====
socket.on('room_created', ({ code }) => {
  S.roomCode = code;
  $('code-box').textContent = code;
  showScreen('s-wait');
});

socket.on('room_joined', ({ room, player }) => {
  S.roomCode = room.code;
  S.partner = room.players.find(p => p.id !== socket.id);
  S.scores = {};
  renderTopbar();
  addSysMsg('انضممت للغرفة مع ' + (S.partner?.name || '') + ' 💜');
  showScreen('s-game');
  showArea('game-menu');
});

socket.on('partner_joined', ({ player, players }) => {
  S.partner = player;
  S.scores = {};
  renderTopbar();
  addSysMsg(player.name + ' انضم/انضمت! 🎉');
  showScreen('s-game');
  showArea('game-menu');
});

socket.on('partner_left', ({ name }) => addSysMsg(name + ' غادر/غادرت 💔'));
socket.on('error', ({ msg }) => alert(msg));

socket.on('new_message', msg => addChatMsg(msg, msg.from === S.user?.displayName));

socket.on('badges_earned', ({ badges }) => badges.forEach(b => showBadge(b)));

// QUIZ
socket.on('quiz_started', ({ question, index, total }) => {
  showSub('quiz', 'quiz-play');
  renderQuizQ({ question, index, total });
});

function renderQuizQ({ question, index, total }) {
  $('q-prog').textContent = `${index + 1}/${total}`;
  $('quiz-q-text').textContent = question.q;
  $('quiz-fb').classList.add('hidden');
  $('opp-status').textContent = '';
  const opts = $('quiz-opts');
  opts.innerHTML = '';
  question.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'qopt';
    btn.textContent = opt;
    btn.onclick = () => {
      socket.emit('quiz_answer', { answerIndex: i });
      document.querySelectorAll('.qopt').forEach(b => b.classList.add('disabled'));
    };
    opts.appendChild(btn);
  });
}

socket.on('quiz_answer_result', ({ correct, correctAnswer, score }) => {
  S.scores[socket.id] = score;
  renderTopbar();
  const fb = $('quiz-fb');
  fb.textContent = correct ? '✅ إجابة صحيحة! +10' : '❌ إجابة خاطئة';
  fb.style.color = correct ? '#6ee7b7' : '#fca5a5';
  fb.classList.remove('hidden');
  document.querySelectorAll('.qopt').forEach((btn, i) => {
    if (i === correctAnswer) btn.classList.add('ok');
  });
  $('qsb-me').textContent = `أنا: ${score}`;
});

socket.on('quiz_opponent_answered', ({ by }) => {
  $('opp-status').textContent = by + ' أجاب/أجابت ⚡';
});

socket.on('quiz_next', ({ question, index, total, scores }) => {
  S.scores = scores;
  renderTopbar();
  const p = S.partner ? (scores[S.partner.id] || 0) : 0;
  $('qsb-me').textContent = `أنا: ${scores[socket.id] || 0}`;
  $('qsb-them').textContent = `هو/هي: ${p}`;
  renderQuizQ({ question, index, total });
});

socket.on('quiz_ended', ({ scores, players }) => {
  S.scores = scores;
  renderTopbar();
  showSub('quiz', 'quiz-end');
  const my = scores[socket.id] || 0;
  let them = 0, theirName = S.partner?.name || '؟';
  Object.keys(scores).forEach(id => { if (id !== socket.id) them = scores[id]; });
  const won = my > them, tie = my === them;
  $('quiz-end-top').innerHTML = `
    <div>${won ? '🏆' : tie ? '🤝' : '💜'}</div>
    <div class="end-winner-badge">${won ? 'أنت الفائز!' : tie ? 'تعادل!' : theirName + ' فاز!'}</div>
    <div class="end-row"><span>💜 أنا</span><span class="end-pts">${my}</span></div>
    <div class="end-row"><span>🩷 ${theirName}</span><span class="end-pts">${them}</span></div>
  `;
});

// MILLION
socket.on('million_started', ({ question, index, contestant, lifelines }) => {
  showSub('million', 'million-play');
  const isC = contestant.id === socket.id;
  $('million-ll').classList.toggle('hidden', !isC);
  $('million-spec').classList.toggle('hidden', isC);
  if (isC) {
    $('ll-fifty').disabled = false;
    $('ll-audience').disabled = false;
    $('ll-call').disabled = false;
  }
  renderMillionQuestion(question, index, isC);
});

socket.on('million_correct', ({ correctAnswer, prize, nextQuestion, index }) => {
  document.querySelectorAll('.mopt').forEach((btn, i) => { if (i === correctAnswer) btn.classList.add('ok'); btn.classList.add('disabled'); });
  setTimeout(() => {
    const isC = document.querySelector('.million-lifelines') && !$('million-ll').classList.contains('hidden');
    renderMillionQuestion(nextQuestion, index, isC);
  }, 1200);
});

socket.on('million_wrong', ({ correctAnswer, prize }) => {
  document.querySelectorAll('.mopt').forEach((btn, i) => { btn.classList.add(i === correctAnswer ? 'ok' : 'no'); btn.classList.add('disabled'); });
  setTimeout(() => {
    showSub('million', 'million-end');
    $('million-end-content').innerHTML = `<div style="font-size:56px">😢</div><h2>خسرت!</h2><p style="color:var(--text2)">كنت على وشك الفوز بـ ${prize}</p>`;
  }, 1500);
});

socket.on('million_win', ({ prize }) => {
  showSub('million', 'million-end');
  $('million-end-content').innerHTML = `<div style="font-size:56px">🎉</div><h2 style="color:var(--amber)">فزت بـ ${prize}!</h2>`;
});

socket.on('million_lifeline_result', ({ type, result, lifelines }) => {
  $('ll-fifty').disabled = !lifelines.fifty;
  $('ll-audience').disabled = !lifelines.audience;
  $('ll-call').disabled = !lifelines.call;
  if (type === 'fifty') {
    result.remove.forEach(i => { const btn = document.querySelectorAll('.mopt')[i]; if (btn) btn.classList.add('removed'); });
  } else if (type === 'audience') {
    const opts = document.querySelectorAll('.mopt');
    result.votes.forEach((v, i) => { if (opts[i] && !opts[i].classList.contains('removed')) opts[i].textContent += ` (${v}%)`; });
  } else if (type === 'call') {
    alert(result.hint);
  }
});

// TRUTH OR DARE
socket.on('truth_dare_started', ({ currentTurn }) => {
  showSub('truth_dare', 'td-play');
  const myTurn = currentTurn.id === socket.id;
  $('td-turn').textContent = myTurn ? '🎲 دورك! اختر:' : `⏳ دور ${currentTurn.name}`;
  $('td-choice').classList.toggle('hidden', !myTurn);
  $('td-card').classList.add('hidden');
});

socket.on('truth_dare_next', ({ currentTurn }) => {
  const myTurn = currentTurn.id === socket.id;
  $('td-turn').textContent = myTurn ? '🎲 دورك! اختر:' : `⏳ دور ${currentTurn.name}`;
  $('td-choice').classList.toggle('hidden', !myTurn);
  $('td-card').classList.add('hidden');
});

socket.on('truth_dare_card', ({ choice, content, player }) => {
  $('td-choice').classList.add('hidden');
  $('td-card').classList.remove('hidden');
  $('td-card-inner').textContent = content;
  $('td-card').style.borderColor = choice === 'truth' ? 'rgba(59,130,246,0.4)' : 'rgba(239,68,68,0.4)';
});

// DRAWING
socket.on('drawing_started', ({ role, word, drawer }) => {
  showSub('drawing', 'drawing-play');
  initCanvas();
  clearCanvas();
  S.draw.isDrawer = role === 'drawer';
  $('draw-tools').classList.toggle('hidden', !S.draw.isDrawer);
  $('draw-word-banner').classList.toggle('hidden', !S.draw.isDrawer);
  $('draw-guess-area').classList.toggle('hidden', S.draw.isDrawer);
  $('draw-role-badge').textContent = S.draw.isDrawer ? '🎨 أنت ترسم' : '🤔 خمّن';
  if (S.draw.isDrawer) $('draw-word-banner').textContent = word;
  else { $('draw-guess-inp').value = ''; $('draw-guess-fb').textContent = ''; }
});

socket.on('draw_stroke', ({ x1, y1, x2, y2, color, size }) => drawStroke(x1, y1, x2, y2, color, size));
socket.on('draw_clear', () => clearCanvas());

socket.on('drawing_correct', ({ guesser, word }) => {
  showSub('drawing', 'drawing-end');
  $('drawing-end-content').innerHTML = `<div style="font-size:56px">🎉</div><h2>${guesser} خمّن!</h2><p style="color:var(--text2)">الكلمة كانت: <b>${word}</b></p>`;
});

socket.on('drawing_wrong', ({ guess }) => {
  $('draw-guess-fb').textContent = '❌ "' + guess + '" خطأ، حاول مرة ثانية!';
  $('draw-guess-fb').style.color = '#fca5a5';
});

// UNO
socket.on('uno_started', ({ hand, topCard, currentColor, myTurn, opponentCardCount }) => {
  showSub('uno', 'uno-play');
  $('uno-opp-count').textContent = `بطاقات الخصم: ${opponentCardCount}`;
  $('uno-turn-label').textContent = myTurn ? '🎯 دورك!' : '⏳ دور الخصم';
  $('draw-btn').disabled = !myTurn;
  renderTopCard(topCard);
  updateColorIndicator(currentColor);
  renderUnoHand(hand, myTurn, topCard, currentColor);
});

socket.on('uno_state', ({ topCard, currentColor, myTurn, myHand, opponentCardCount, playedCard, playedBy }) => {
  $('uno-opp-count').textContent = `بطاقات الخصم: ${opponentCardCount}`;
  $('uno-turn-label').textContent = myTurn ? '🎯 دورك!' : '⏳ دور الخصم';
  $('draw-btn').disabled = !myTurn;
  renderTopCard(topCard);
  updateColorIndicator(currentColor);
  renderUnoHand(myHand, myTurn, topCard, currentColor);
});

socket.on('uno_drew', ({ card, hand }) => {
  const top = $('uno-top');
  const color = top.className.match(/red|blue|green|yellow|wild/)?.[0] || 'wild';
  renderUnoHand(hand, false, { value: top.textContent, color }, color);
});

socket.on('uno_draw_penalty', ({ cards, count }) => {
  addSysMsg(`سحبت ${count} بطاقات إضافية! 😅`);
});

socket.on('uno_opponent_drew', ({ opponentCardCount }) => {
  $('uno-opp-count').textContent = `بطاقات الخصم: ${opponentCardCount}`;
});

socket.on('uno_turn_change', ({ myTurn }) => {
  $('uno-turn-label').textContent = myTurn ? '🎯 دورك!' : '⏳ دور الخصم';
  $('draw-btn').disabled = !myTurn;
});

socket.on('uno_error', ({ msg }) => addSysMsg('⚠️ ' + msg));

socket.on('uno_win', ({ winner, scores }) => {
  S.scores = scores;
  renderTopbar();
  showSub('uno', 'uno-end');
  const won = winner === S.user?.displayName;
  $('uno-end-content').innerHTML = `<div style="font-size:56px">${won ? '🏆' : '💜'}</div><h2>${won ? 'أنت الفائز!' : winner + ' فاز!'}</h2>`;
});

// ===== INIT =====
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if ($('login-user') === document.activeElement || $('login-pass') === document.activeElement) doLogin();
    if ($('reg-display') === document.activeElement || $('reg-user') === document.activeElement || $('reg-pass') === document.activeElement) doRegister();
    if ($('join-code') === document.activeElement) joinRoom();
    if ($('chat-inp') === document.activeElement) sendChat();
    if ($('draw-guess-inp') === document.activeElement) sendDrawGuess();
  }
});

if (S.token && S.user) {
  renderLobby();
  showScreen('s-lobby');
}
