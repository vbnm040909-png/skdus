// 댕냥구조대 - Node.js Express 웹서버
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const app     = express();
const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.PUBLIC_DATA_API_KEY || '';

// 시도 코드 (공공데이터 API의 upr_cd 파라미터)
const REGION_CODE = {
  '서울': '6110000', '부산': '6260000', '대구': '6270000', '인천': '6280000',
  '광주': '6290000', '대전': '6300000', '울산': '6310000', '세종': '5690000',
  '경기': '6410000', '강원': '6420000', '충북': '6430000', '충남': '6440000',
  '전북': '6450000', '전남': '6460000', '경북': '6470000', '경남': '6480000',
  '제주': '6500000'
};

// 응답 캐시 (10분)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// 특이사항(specialMark) 텍스트에서 성격/특성 추출
function deriveTraits(item, ageYears) {
  const traits = [];
  const mark = (item.specialMark || '').toLowerCase();

  if (/온순|차분|조용|얌전/.test(mark)) traits.push('quiet');
  if (/사람.{0,3}좋|친화|애교|순함|순한/.test(mark)) traits.push('friendly');
  if (/아이|어린이|애기.{0,3}좋/.test(mark)) traits.push('kidsafe');
  if (/다른.{0,3}동물|친구|사회성/.test(mark)) traits.push('petfriendly');
  if (/털.{0,3}적|단모|털빠짐.{0,3}없/.test(mark)) traits.push('lowshed');
  if (/훈련|배변|기본.{0,3}교육/.test(mark)) traits.push('trained');
  if (/건강|양호/.test(mark)) traits.push('healthy');
  if (ageYears >= 8 || /노령|시니어|고령/.test(mark)) traits.push('senior');
  if (/장애|치료.{0,3}필요|특별.{0,3}케어|한쪽/.test(mark)) traits.push('special');

  return traits;
}

function deriveSize(weight) {
  const w = parseFloat(weight) || 0;
  if (w === 0) return 'small';
  if (w <= 10) return 'small';
  if (w <= 25) return 'medium';
  return 'large';
}

function deriveSpecies(kindCd) {
  if (!kindCd) return 'dog';
  if (kindCd.includes('고양이') || kindCd.includes('[묘')) return 'cat';
  return 'dog';
}

function deriveActivity(ageYears, species) {
  if (species === 'cat') return 'low';
  if (ageYears <= 2) return 'high';
  if (ageYears >= 8) return 'low';
  return 'medium';
}

function transform(items) {
  const currentYear = new Date().getFullYear();

  return items.map((item, idx) => {
    const sex = item.sexCd === 'M' ? '수컷' : item.sexCd === 'F' ? '암컷' : '미상';
    const birthYear = parseInt(String(item.age || '').match(/\d{4}/)?.[0]) || currentYear;
    const ageYears = Math.max(0, currentYear - birthYear);
    const weight = parseFloat(String(item.weight || '0').replace(/[^\d.]/g, '')) || 0;
    const species = deriveSpecies(item.kindCd);
    const region = (item.orgNm || '').replace(/(특별시|광역시|특별자치도|도|시|군|구)/g, '').split(' ')[0] || '';

    return {
      id: item.desertionNo || `tmp-${idx}`,
      name: `보호번호 ${(item.desertionNo || '').slice(-4) || idx}`,
      species: species,
      breed: (item.kindCd || '').replace(/^\[.*?\]\s*/, '') || '믹스',
      age: ageYears,
      gender: sex,
      size: deriveSize(weight),
      weight: weight,
      region: region,
      shelter: item.careNm || '동물보호센터',
      shelterAddr: item.careAddr || '',
      shelterTel: item.careTel || '',
      img: item.popfile || item.filename || '',
      traits: deriveTraits(item, ageYears),
      activity: deriveActivity(ageYears, species),
      shedding: 'medium',
      desc: item.specialMark || '특이사항 없음',
      processState: item.processState || '',
      noticeNo: item.noticeNo || ''
    };
  });
}

// ── 데이터 저장소 (data/ 폴더) ─────────────────────────────────────────────
const DATA_DIR    = path.join(__dirname, 'data');
const USERS_F     = path.join(DATA_DIR, 'users.json');
const FAVS_F      = path.join(DATA_DIR, 'favorites.json');
const EMOTIONS_F  = path.join(DATA_DIR, 'emotions.json');
if (!fs.existsSync(DATA_DIR))    fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_F))     fs.writeFileSync(USERS_F,    '[]');
if (!fs.existsSync(FAVS_F))      fs.writeFileSync(FAVS_F,     '{}');
if (!fs.existsSync(EMOTIONS_F))  fs.writeFileSync(EMOTIONS_F, '{}');

const loadEmotions = () => JSON.parse(fs.readFileSync(EMOTIONS_F, 'utf8'));
const saveEmotions = d  => fs.writeFileSync(EMOTIONS_F, JSON.stringify(d, null, 2));

const JWT_SECRET  = process.env.JWT_SECRET || 'dangnyang-rescue-secret';
const loadUsers   = () => JSON.parse(fs.readFileSync(USERS_F,  'utf8'));
const saveUsers   = d  => fs.writeFileSync(USERS_F,  JSON.stringify(d, null, 2));
const loadFavs    = () => JSON.parse(fs.readFileSync(FAVS_F,   'utf8'));
const saveFavs    = d  => fs.writeFileSync(FAVS_F,   JSON.stringify(d, null, 2));

const guard = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'UNAUTHORIZED' }); }
};

// 정적 파일 서빙 (HTML, CSS, JS, 이미지)
app.use(express.static(__dirname));
app.use(express.json());

// 헬스 체크 / API 키 상태
app.get('/api/status', (req, res) => {
  res.json({
    apiKey: !!API_KEY,
    cacheSize: cache.size,
    server: '댕냥구조대 v1.0'
  });
});

// 유기동물 조회 API 프록시
app.get('/api/pets', async (req, res) => {
  const region = req.query.region || '';
  const species = req.query.species || '';
  const cacheKey = `${region}|${species}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json({ source: 'cache', count: cached.data.length, items: cached.data });
  }

  if (!API_KEY) {
    return res.status(503).json({
      error: 'API_KEY_NOT_SET',
      message: 'PUBLIC_DATA_API_KEY 환경변수를 설정하세요. 공공데이터포털에서 발급받을 수 있습니다.',
      url: 'https://www.data.go.kr/data/15098931/openapi.do'
    });
  }

  try {
    const today = new Date();
    const threeMonthsAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');

    const params = new URLSearchParams({
      serviceKey: API_KEY,
      bgnde: fmt(threeMonthsAgo),
      endde: fmt(today),
      pageNo: '1',
      numOfRows: '200',
      _type: 'json',
      state: 'protect'
    });
    if (region && REGION_CODE[region]) params.append('upr_cd', REGION_CODE[region]);
    if (species === 'dog') params.append('kind', '417000');
    if (species === 'cat') params.append('kind', '422400');

    const url = `http://apis.data.go.kr/1543061/abandonmentPublicSrvc/abandonmentPublic?${params}`;
    const response = await fetch(url);
    const text = await response.text();

    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      console.error('API 응답 파싱 실패:', text.slice(0, 500));
      return res.status(502).json({ error: 'INVALID_API_RESPONSE', preview: text.slice(0, 300) });
    }

    const header = data?.response?.header;
    if (header && header.resultCode !== '00') {
      return res.status(502).json({ error: header.resultMsg || 'API_ERROR', code: header.resultCode });
    }

    const items = data?.response?.body?.items?.item || [];
    const itemArr = Array.isArray(items) ? items : [items];
    const transformed = transform(itemArr).filter(p => p.id);

    cache.set(cacheKey, { time: Date.now(), data: transformed });
    res.json({ source: 'api', count: transformed.length, items: transformed });
  } catch (err) {
    console.error('API 호출 실패:', err);
    res.status(500).json({ error: 'FETCH_FAILED', message: err.message });
  }
});

// ── 회원가입 ─────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 6)
    return res.status(400).json({ error: '이메일과 비밀번호(6자 이상)를 입력하세요.' });
  const users = loadUsers();
  if (users.find(u => u.email === email))
    return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: `u${Date.now()}`, email, password: hash, createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email } });
});

// ── 로그인 ───────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const users = loadUsers();
  const user  = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email } });
});

// ── 찜 목록 조회 ─────────────────────────────────────────────────────────────
app.get('/api/favorites', guard, (req, res) => {
  const favs = loadFavs();
  res.json(favs[req.user.id] || []);
});

// ── 찜 추가 ──────────────────────────────────────────────────────────────────
app.put('/api/favorites', guard, (req, res) => {
  const pet = req.body;
  if (!pet?.id) return res.status(400).json({ error: 'pet.id required' });
  const favs = loadFavs();
  if (!favs[req.user.id]) favs[req.user.id] = [];
  if (!favs[req.user.id].find(f => f.id === pet.id)) {
    favs[req.user.id].push({
      ...pet,
      savedAt: new Date().toISOString(),
      savedProcessState: pet.processState || '',
      notified: false
    });
  }
  saveFavs(favs);
  res.json({ ok: true });
});

// ── 찜 삭제 ──────────────────────────────────────────────────────────────────
app.delete('/api/favorites/:petId', guard, (req, res) => {
  const favs = loadFavs();
  if (favs[req.user.id])
    favs[req.user.id] = favs[req.user.id].filter(f => f.id !== req.params.petId);
  saveFavs(favs);
  res.json({ ok: true });
});

// ── 찜 processState 업데이트 (알림용) ────────────────────────────────────────
app.patch('/api/favorites/:petId/state', guard, (req, res) => {
  const { processState } = req.body || {};
  const favs = loadFavs();
  const pet  = (favs[req.user.id] || []).find(f => f.id === req.params.petId);
  if (pet && processState && pet.processState !== processState) {
    pet.processState = processState;
    pet.notified = false;
    saveFavs(favs);
  }
  res.json({ ok: true });
});

// ── 알림 조회 (입양 완료된 찜) ───────────────────────────────────────────────
app.get('/api/notifications', guard, (req, res) => {
  const favs = loadFavs();
  const unread = (favs[req.user.id] || []).filter(f => {
    const st = (f.processState || '').trim();
    return (st === '종료' || st.includes('입양')) && !f.notified;
  });
  res.json(unread.map(f => ({ id: f.id, name: f.name, processState: f.processState, shelter: f.shelter })));
});

// ── 알림 읽음 처리 ────────────────────────────────────────────────────────────
app.post('/api/notifications/read', guard, (req, res) => {
  const { petIds } = req.body || {};
  const favs = loadFavs();
  if (favs[req.user.id] && Array.isArray(petIds)) {
    favs[req.user.id].forEach(f => { if (petIds.includes(f.id)) f.notified = true; });
    saveFavs(favs);
  }
  res.json({ ok: true });
});

// ── 감정 목록 조회 ───────────────────────────────────────────────────────────
app.get('/api/emotions', guard, (req, res) => {
  const emotions = loadEmotions();
  res.json(emotions[req.user.id] || []);
});

// ── 감정 추가 ────────────────────────────────────────────────────────────────
app.post('/api/emotions', guard, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim())
    return res.status(400).json({ error: '내용을 입력하세요.' });
  const emotions = loadEmotions();
  if (!emotions[req.user.id]) emotions[req.user.id] = [];
  emotions[req.user.id].unshift({
    id: `e${Date.now()}`,
    text: text.trim(),
    date: new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  });
  // 최대 60개 보관
  emotions[req.user.id] = emotions[req.user.id].slice(0, 60);
  saveEmotions(emotions);
  res.json({ ok: true });
});

// ── 감정 전체 삭제 ───────────────────────────────────────────────────────────
app.delete('/api/emotions', guard, (req, res) => {
  const emotions = loadEmotions();
  emotions[req.user.id] = [];
  saveEmotions(emotions);
  res.json({ ok: true });
});

// ── 감정 낱개 삭제 ───────────────────────────────────────────────────────────
app.delete('/api/emotions/:id', guard, (req, res) => {
  const emotions = loadEmotions();
  if (emotions[req.user.id])
    emotions[req.user.id] = emotions[req.user.id].filter(e => e.id !== req.params.id);
  saveEmotions(emotions);
  res.json({ ok: true });
});

// 루트 → pet_match.html 으로 리디렉트
app.get('/', (req, res) => {
  res.redirect('/pet_match.html');
});

app.listen(PORT, () => {
  console.log('====================================');
  console.log('  🐾 댕냥구조대 웹서비스 시작');
  console.log('====================================');
  console.log(`  📍 http://localhost:${PORT}`);
  console.log(`  📍 http://localhost:${PORT}/pet_match.html`);
  console.log('');
  console.log(API_KEY
    ? '  ✓ 공공데이터 API 키 설정됨 - 실제 데이터 사용'
    : '  ⚠ API 키 없음 - 샘플 데이터로 동작');
  console.log('    (실제 데이터: PUBLIC_DATA_API_KEY 환경변수 설정 필요)');
  console.log('====================================');
});
