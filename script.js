// PocketBase 配置：填写你的实例地址，留空则不同步云端
const PB_URL = 'https://db.tr1ck.cn/';

// 游戏状态
let targetIdiom = '';
let currentRow = 0;
let currentTile = 0;
let gameOver = false;
let idiomList = [];
let guessedIdioms = [];
let keyboardState = {};
let keyboardChars = []; // 今日键盘字符（24 个：7+7+5+5，每行左侧多一列）
let todayDate = ''; // 今日日期
let idiomData = {}; // 成语数据 {word: {pinyin, derivation, common}}

// 设置
let settings = {
    validateIdiom: false,     // 是否验证成语（默认关闭）
    keyboardHighlight: true,  // 是否键盘高亮
    commonIdiomOnly: true     // 固定为简单模式（仅从常用成语中选词），开关已禁用
};

// 统计数据
let stats = {
    totalGames: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: [0, 0, 0, 0, 0], // 1-5次猜对的次数
    achievements: [] // 已解锁成就 id 列表
};

// 成就定义（检测在 updateStats 之后调用，此时 stats 已更新）
const ACHIEVEMENTS = [
    { id: 'firstTry', name: '一击即中', desc: '第一次就猜对' },
    { id: 'fifthTry', name: '险中求胜', desc: '第5次才猜对' },
    { id: 'streak3', name: '连对3天', desc: '连续猜对3天' },
    { id: 'streak7', name: '连对7天', desc: '连续猜对7天' },
    { id: 'streak30', name: '连对30天', desc: '连续猜对30天' }
];

// ---------- 云端同步（PocketBase wordle_data 表：id, setting, stats, state, updated，无 auth）----------
// 密钥 = 记录 id，创建记录后由服务端返回
const PB_WORDLE_COLLECTION = 'wordle_data';
const LOCAL_DATA_KEY = 'idiomWordleData';

function getLocalData() {
    const raw = localStorage.getItem(LOCAL_DATA_KEY);
    if (!raw) return { setting: null, stats: null, state: null, updated: 0 };
    try {
        return JSON.parse(raw);
    } catch (e) {
        localStorage.removeItem(LOCAL_DATA_KEY);
        return { setting: null, stats: null, state: null, updated: 0 };
    }
}

function setLocalData(data) {
    data.updated = typeof data.updated === 'number' ? data.updated : Date.now();
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
}

function getAuth() {
    const saved = localStorage.getItem('idiomWordleAuth');
    if (!saved) return null;
    try {
        const o = JSON.parse(saved);
        if (o && typeof o.key === 'string' && o.key.trim()) return { key: o.key.trim() };
    } catch (e) { /* 非法 JSON */ }
    localStorage.removeItem('idiomWordleAuth');
    return null;
}

function saveAuth(key) {
    const k = (key || '').trim();
    if (!k) {
        localStorage.removeItem('idiomWordleAuth');
        return;
    }
    localStorage.setItem('idiomWordleAuth', JSON.stringify({ key: k }));
}

function getAuthString() {
    const a = getAuth();
    return a ? a.key : '';
}

// 先查远程；数据为空或远程 updated 早于本地则用本地覆盖远程，否则远程覆盖本地。用记录 id 作为密钥，无 auth 字段。
async function syncWithPB() {
    if (!PB_URL || typeof PocketBase === 'undefined') return;
    const recordId = getAuthString();
    if (!recordId) return;
    const local = getLocalData();
    const localUpdated = typeof local.updated === 'number' ? local.updated : 0;
    const stateFull = normalizeState(local.state);
    stateFull[getStateBranchKey()] = {
        date: todayDate,
        guessedIdioms: guessedIdioms.slice(),
        currentRow: currentRow,
        gameOver: gameOver,
        keyboardState: Object.assign({}, keyboardState)
    };
    const body = { id: recordId, setting: settings, stats: stats, state: stateFull, updated: Date.now() };
    try {
        const pb = new PocketBase(PB_URL);
        const record = await pb.collection(PB_WORDLE_COLLECTION).getOne(recordId);
        const remoteUpdated = record && record.updated ? new Date(record.updated).getTime() : 0;
        const useLocal = !remoteUpdated || localUpdated > remoteUpdated;

        if (useLocal) {
            await pb.collection(PB_WORDLE_COLLECTION).update(recordId, body);
            setLocalData({ setting: settings, stats: stats, state: stateFull, updated: body.updated });
        } else {
            const r = record;
            const data = {
                setting: r.setting != null ? r.setting : local.setting,
                stats: r.stats != null ? r.stats : local.stats,
                state: r.state != null ? normalizeState(r.state) : local.state,
                updated: remoteUpdated
            };
            setLocalData(data);
            loadStats();
            loadSettings();
            const branch = data.state && data.state[getStateBranchKey()];
            if (branch && branch.date === todayDate) restoreGameState(branch);
        }
    } catch (e) {
        console.warn('云端同步失败:', e);
        throw e;
    }
}

// 创建一条记录并返回（用于「生成密钥」）。body 无 auth，返回的 record.id 即密钥。
async function createRecordOnPB() {
    if (!PB_URL || typeof PocketBase === 'undefined') throw new Error('未配置 PB_URL');
    const local = getLocalData();
    const stateFull = normalizeState(local.state);
    stateFull[getStateBranchKey()] = {
        date: todayDate,
        guessedIdioms: guessedIdioms.slice(),
        currentRow: currentRow,
        gameOver: gameOver,
        keyboardState: Object.assign({}, keyboardState)
    };
    const body = { setting: settings, stats: stats, state: stateFull };
    const pb = new PocketBase(PB_URL);
    return await pb.collection(PB_WORDLE_COLLECTION).create(body);
}

// 保证 stats 结构完整（云端或缓存可能缺字段）；stats 必须是对象
function normalizeStats() {
    if (!stats || typeof stats !== 'object') {
        stats = {
            totalGames: 0,
            gamesWon: 0,
            currentStreak: 0,
            maxStreak: 0,
            guessDistribution: [0, 0, 0, 0, 0],
            achievements: []
        };
        return;
    }
    if (!Array.isArray(stats.guessDistribution) || stats.guessDistribution.length !== 5) {
        stats.guessDistribution = [0, 0, 0, 0, 0];
    }
    if (!Array.isArray(stats.achievements)) stats.achievements = [];
    if (typeof stats.totalGames !== 'number') stats.totalGames = 0;
    if (typeof stats.gamesWon !== 'number') stats.gamesWon = 0;
    if (typeof stats.currentStreak !== 'number') stats.currentStreak = 0;
    if (typeof stats.maxStreak !== 'number') stats.maxStreak = 0;
}

// 加载统计数据（从 idiomWordleData.stats）
function loadStats() {
    const data = getLocalData();
    if (data.stats != null && typeof data.stats === 'object' && !Array.isArray(data.stats)) {
        stats = data.stats;
    }
    normalizeStats();
}

// 保存统计数据（写入 idiomWordleData，与远程字段名一致）
function saveStats() {
    const data = getLocalData();
    data.setting = data.setting || settings;
    data.stats = stats;
    data.state = normalizeState(data.state);
    data.state[getStateBranchKey()] = { date: todayDate, guessedIdioms: guessedIdioms.slice(), currentRow, gameOver, keyboardState: Object.assign({}, keyboardState) };
    data.updated = Date.now();
    setLocalData(data);
    if (getAuth() && PB_URL) syncWithPB();
}

// 更新统计数据
function updateStats(won, attempts) {
    normalizeStats();
    stats.totalGames++;
    if (won) {
        stats.gamesWon++;
        stats.currentStreak++;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
        if (attempts >= 1 && attempts <= 5) stats.guessDistribution[attempts - 1]++;
    } else {
        stats.currentStreak = 0;
    }
    saveStats();
    checkAchievements(won, attempts);
}

// 本局新解锁的成就名称（用于结果弹窗提示）
let lastUnlockedAchievementNames = [];

// 检测并解锁成就
function checkAchievements(won, attempts) {
    lastUnlockedAchievementNames = [];
    if (!stats.achievements) stats.achievements = [];
    const unlocked = new Set(stats.achievements);
    const nameById = { firstTry: '一击即中', fifthTry: '险中求胜', streak3: '连对3天', streak7: '连对7天', streak30: '连对30天' };

    if (won && attempts === 1 && !unlocked.has('firstTry')) {
        stats.achievements.push('firstTry');
        unlocked.add('firstTry');
        lastUnlockedAchievementNames.push(nameById.firstTry);
    }
    if (won && attempts === 5 && !unlocked.has('fifthTry')) {
        stats.achievements.push('fifthTry');
        unlocked.add('fifthTry');
        lastUnlockedAchievementNames.push(nameById.fifthTry);
    }
    if (stats.currentStreak >= 3 && !unlocked.has('streak3')) {
        stats.achievements.push('streak3');
        unlocked.add('streak3');
        lastUnlockedAchievementNames.push(nameById.streak3);
    }
    if (stats.currentStreak >= 7 && !unlocked.has('streak7')) {
        stats.achievements.push('streak7');
        unlocked.add('streak7');
        lastUnlockedAchievementNames.push(nameById.streak7);
    }
    if (stats.currentStreak >= 30 && !unlocked.has('streak30')) {
        stats.achievements.push('streak30');
        unlocked.add('streak30');
        lastUnlockedAchievementNames.push(nameById.streak30);
    }
    if (lastUnlockedAchievementNames.length) saveStats();
}

// 显示统计弹窗
function showStats() {
    // 更新数据
    document.getElementById('totalGames').textContent = stats.totalGames;
    const winRate = stats.totalGames > 0 
        ? Math.round((stats.gamesWon / stats.totalGames) * 100) 
        : 0;
    document.getElementById('winRate').textContent = `${winRate}%`;
    document.getElementById('currentStreak').textContent = stats.currentStreak;
    document.getElementById('maxStreak').textContent = stats.maxStreak;
    
    // 生成分布图
    const maxCount = Math.max(...stats.guessDistribution, 1);
    const container = document.getElementById('distributionBars');
    container.innerHTML = '';
    
    for (let i = 0; i < 5; i++) {
        const count = stats.guessDistribution[i];
        const percentage = (count / maxCount) * 100;
        const isCurrent = gameOver && guessedIdioms.length === i + 1 && guessedIdioms[guessedIdioms.length - 1] === targetIdiom;
        
        const barDiv = document.createElement('div');
        barDiv.className = 'distribution-bar';
        barDiv.innerHTML = `
            <div class="bar-label">${i + 1}</div>
            <div class="bar-container">
                <div class="bar-fill ${isCurrent ? 'current' : ''}" style="width: ${Math.max(percentage, 7)}%">
                    <span class="bar-count">${count}</span>
                </div>
            </div>
        `;
        container.appendChild(barDiv);
    }
    
    // 成就墙
    const wall = document.getElementById('achievementWall');
    if (wall) {
        const unlockedSet = new Set(stats.achievements || []);
        wall.innerHTML = '';
        ACHIEVEMENTS.forEach(a => {
            const isUnlocked = unlockedSet.has(a.id);
            const item = document.createElement('div');
            item.className = 'achievement-item' + (isUnlocked ? ' unlocked' : ' locked');
            item.title = a.desc;
            item.innerHTML = `
                <span class="achievement-icon">${isUnlocked ? '✓' : '○'}</span>
                <span class="achievement-name">${a.name}</span>
            `;
            wall.appendChild(item);
        });
    }
    
    document.getElementById('statsModal').classList.add('show');
}

// 隐藏统计弹窗
function hideStats() {
    document.getElementById('statsModal').classList.remove('show');
}

// 显示帮助弹窗
function showHelp() {
    document.getElementById('helpModal').classList.add('show');
}

// 隐藏帮助弹窗
function hideHelp() {
    document.getElementById('helpModal').classList.remove('show');
}

// 加载设置（从 idiomWordleData.setting）
function loadSettings() {
    const data = getLocalData();
    if (data.setting != null) {
        if (typeof data.setting.validateIdiom === 'boolean') settings.validateIdiom = data.setting.validateIdiom;
        if (typeof data.setting.keyboardHighlight === 'boolean') settings.keyboardHighlight = data.setting.keyboardHighlight;
    }
    settings.commonIdiomOnly = true; // 固定简单模式，不再读取存储
    const elV = document.getElementById('settingValidateIdiom');
    const elK = document.getElementById('settingKeyboardHighlight');
    const elC = document.getElementById('settingCommonIdiomOnly');
    if (elV) elV.checked = settings.validateIdiom;
    if (elK) elK.checked = settings.keyboardHighlight;
    if (elC) { elC.checked = true; elC.disabled = true; }
}

// 保存设置（写入 idiomWordleData.setting）
function saveSettings() {
    settings.validateIdiom = document.getElementById('settingValidateIdiom').checked;
    settings.keyboardHighlight = document.getElementById('settingKeyboardHighlight').checked;
    settings.commonIdiomOnly = true; // 固定简单模式，开关已禁用
    const data = getLocalData();
    data.setting = data.setting || {};
    data.setting.validateIdiom = settings.validateIdiom;
    data.setting.keyboardHighlight = settings.keyboardHighlight;
    data.setting.commonIdiomOnly = true;
    data.stats = data.stats || stats;
    data.state = normalizeState(data.state);
    data.updated = Date.now();
    setLocalData(data);
    if (getAuth() && PB_URL) syncWithPB();

    // 如果关闭键盘高亮，清除当前高亮
    if (!settings.keyboardHighlight) {
        document.querySelectorAll('.key').forEach(key => {
            key.classList.remove('correct', 'present', 'absent');
        });
    } else {
        // 重新应用键盘状态
        createKeyboard();
    }
}

// 根据密钥输入框是否为空更新按钮文案
function updateKeyButtonText() {
    const input = document.getElementById('settingAuthKey');
    const btn = document.getElementById('settingKeyBtn');
    if (!btn) return;
    btn.textContent = input && input.value.trim() ? '同步数据' : '生成密钥';
}

// 显示设置弹窗
function showSettings() {
    const auth = getAuth();
    document.getElementById('settingAuthKey').value = auth ? auth.key : '';
    updateKeyButtonText();
    document.getElementById('settingsModal').classList.add('show');
}

// 隐藏设置弹窗（不触发保存或同步）
function hideSettings() {
    document.getElementById('settingsModal').classList.remove('show');
}

// 保存游戏状态（写入 idiomWordleData.state 的当前分支，保留另一分支）
function saveGameState() {
    const branch = {
        date: todayDate,
        guessedIdioms: guessedIdioms.slice(),
        currentRow: currentRow,
        gameOver: gameOver,
        keyboardState: Object.assign({}, keyboardState)
    };
    const data = getLocalData();
    data.setting = data.setting || settings;
    data.stats = data.stats || stats;
    data.state = normalizeState(data.state);
    data.state[getStateBranchKey()] = branch;
    data.updated = Date.now();
    setLocalData(data);
    if (getAuth() && PB_URL) syncWithPB();
}

// 将 state 规范为双分支：{ common: branch|null, all: branch|null }
function normalizeState(state) {
    if (!state || typeof state !== 'object') return { common: null, all: null };
    return { common: state.common || null, all: state.all || null };
}

function getStateBranchKey() {
    return settings.commonIdiomOnly ? 'common' : 'all';
}

// 加载游戏状态（从 idiomWordleData.state，按当前「常用成语」开关取对应分支）
function loadGameState() {
    const data = getLocalData();
    const state = normalizeState(data.state);
    const branch = state[getStateBranchKey()];
    if (!branch || branch.date !== todayDate) return null;
    return branch;
}

// 恢复游戏状态
function restoreGameState(state) {
    guessedIdioms = state.guessedIdioms;
    currentRow = state.currentRow;
    gameOver = state.gameOver;
    keyboardState = state.keyboardState;
    
    // 恢复格子显示
    for (let row = 0; row < guessedIdioms.length; row++) {
        const guess = guessedIdioms[row];
        const guessChars = guess.split('');
        const targetChars = targetIdiom.split('');
        const charStatus = getCharStatus(guessChars, targetChars);
        
        for (let col = 0; col < 4; col++) {
            const tile = document.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
            tile.textContent = guessChars[col];
            tile.classList.add('filled', charStatus[col]);
        }
    }
    
    // 恢复键盘状态
    createKeyboard();
    
    // 如果游戏已结束，显示结果弹窗
    if (gameOver) {
        const won = guessedIdioms[guessedIdioms.length - 1] === targetIdiom;
        showResult(won);
    }
}

// 获取字符状态（抽取为独立函数）
function getCharStatus(guessChars, targetChars) {
    const charStatus = new Array(4).fill('absent');
    const targetUsed = new Array(4).fill(false);
    
    // 第一遍：标记完全正确的字符
    for (let i = 0; i < 4; i++) {
        if (guessChars[i] === targetChars[i]) {
            charStatus[i] = 'correct';
            targetUsed[i] = true;
        }
    }
    
    // 第二遍：标记位置错误但存在的字符
    for (let i = 0; i < 4; i++) {
        if (charStatus[i] === 'correct') continue;
        
        for (let j = 0; j < 4; j++) {
            if (!targetUsed[j] && guessChars[i] === targetChars[j]) {
                charStatus[i] = 'present';
                targetUsed[j] = true;
                break;
            }
        }
    }
    
    return charStatus;
}

// 初始化游戏
async function init() {
    // 先显示日期，避免副标题区域闪烁旧文案
    const subtitleEl = document.getElementById('subtitle');
    if (subtitleEl) subtitleEl.textContent = getDateDisplayString(getTodayDateString());
    await loadIdioms();

    // 用固定种子打乱成语列表（保证所有人打乱结果一致）
    const fixedSeed = 20260101; // 固定种子
    shuffledIdiomList = shuffleArray(idiomList, fixedSeed);
    const commonList = idiomList.filter(w => idiomData[w] && idiomData[w].simple === true);
    shuffledCommonList = shuffleArray(commonList, fixedSeed);

    loadSettings();
    loadStats();
    if (getAuth() && PB_URL) {
        try {
            await syncWithPB();
        } catch (e) {
            console.warn('云端同步失败:', e);
        }
    }
    loadStats();
    loadSettings();
    createGameBoard();
    createKeyboard();
    attachEventListeners();
    startNewGame();
}

// 获取今日日期字符串（YYYY-MM-DD，用于内部逻辑）
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 将 YYYY-MM-DD 转为展示用「xx年x月x日」
function getDateDisplayString(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${y}年${m}月${d}日`;
}

// 基于日期的伪随机数生成器（保证同一天同一结果）
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// 将日期转换为天数（从某个起始日期算起）
function dateToDays(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    // 从 2026-01-01 开始计算天数
    const startDate = new Date(2026, 0, 1);
    const diffTime = date - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// 成语数据缓存版本（CSV 更新时改为 2、3… 以失效旧缓存）
const IDIOM_CACHE_VERSION = 4;
const IDIOM_DB_NAME = 'idiomWordleDB';
const IDIOM_STORE_NAME = 'cache';
const IDIOM_CACHE_KEY = 'idiomData';

function openIdiomDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDIOM_DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(IDIOM_STORE_NAME, { keyPath: 'key' });
        };
    });
}

function getIdiomCache() {
    return openIdiomDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDIOM_STORE_NAME, 'readonly');
            const req = tx.objectStore(IDIOM_STORE_NAME).get(IDIOM_CACHE_KEY);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    });
}

function setIdiomCache(payload) {
    return openIdiomDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDIOM_STORE_NAME, 'readwrite');
            const req = tx.objectStore(IDIOM_STORE_NAME).put({
                key: IDIOM_CACHE_KEY,
                version: IDIOM_CACHE_VERSION,
                idiomList: payload.idiomList,
                idiomData: payload.idiomData
            });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });
}

// 流式解析 CSV，避免一次性把整文件读入内存
async function parseIdiomCSVStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const list = [];
    const data = {};
    let isHeader = true;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (isHeader) {
                isHeader = false;
                continue;
            }
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(',');
            if (parts.length < 3) continue;
            const word = parts[0] || '';
            if (word.length !== 4) continue;
            const pinyin = parts[1] || '';
            const derivation = parts[2] || '';
            const mark = (parts.length >= 4 && (parts[3] || '').trim()) || '0';
            list.push(word);
            data[word] = { pinyin, derivation, common: mark === '1' || mark === '2', simple: mark === '2' };
        }
    }
    if (buffer.trim()) {
        const parts = buffer.trim().split(',');
            if (parts.length >= 3) {
                const word = (parts[0] || '').trim();
                if (word.length === 4) {
                    const mark = (parts.length >= 4 && (parts[3] || '').trim()) || '0';
                    list.push(word);
                    data[word] = {
                        pinyin: parts[1] || '',
                        derivation: parts[2] || '',
                        common: mark === '1' || mark === '2',
                        simple: mark === '2'
                    };
                }
            }
    }
    return { idiomList: list, idiomData: data };
}

// 加载成语列表（优先读缓存，未命中再拉 CSV 并流式解析）
async function loadIdioms() {
    try {
        let cached = null;
        try {
            cached = await getIdiomCache();
        } catch (_) { /* 无 IndexedDB 或读取失败则走网络 */ }

        if (cached && cached.version === IDIOM_CACHE_VERSION && cached.idiomList && cached.idiomData) {
            idiomList.length = 0;
            idiomList.push(...cached.idiomList);
            Object.assign(idiomData, cached.idiomData);
            return;
        }

        const response = await fetch('idiom.csv');
        if (!response.ok) throw new Error(response.statusText);
        const { idiomList: list, idiomData: data } = await parseIdiomCSVStream(response);
        idiomList.length = 0;
        idiomList.push(...list);
        for (const k of Object.keys(idiomData)) delete idiomData[k];
        Object.assign(idiomData, data);

        try {
            await setIdiomCache({ idiomList: list, idiomData: data });
        } catch (_) { /* 缓存写入失败不影响使用 */ }
    } catch (error) {
        console.error('加载成语列表失败:', error);
        showMessage('加载成语列表失败，请刷新页面重试', 'error');
    }
}

// 生成今日键盘字符（智能算法）
function generateTodayKeyboard(seed) {
    const chars = new Set();
    const usedIdioms = new Set();
    
    // 1. 添加目标成语的字
    targetIdiom.split('').forEach(char => chars.add(char));
    usedIdioms.add(targetIdiom);
    
    // 辅助函数：计算两个成语的相同字数
    function countSameChars(idiom1, idiom2) {
        const chars1 = new Set(idiom1.split(''));
        const chars2 = idiom2.split('');
        return chars2.filter(c => chars1.has(c)).length;
    }
    
    // 2-5. 按相同字数分类成语
    const idiomsByMatch = {
        three: [],  // 3字相同
        two: [],    // 2字相同
        one: [],    // 1字相同
        zero: []    // 全不相同
    };
    
    const pool = currentPool.length > 0 ? currentPool : shuffledIdiomList;
    for (const idiom of pool) {
        if (usedIdioms.has(idiom)) continue;

        const sameCount = countSameChars(targetIdiom, idiom);
        if (sameCount === 3) {
            idiomsByMatch.three.push(idiom);
        } else if (sameCount === 2) {
            idiomsByMatch.two.push(idiom);
        } else if (sameCount === 1) {
            idiomsByMatch.one.push(idiom);
        } else {
            idiomsByMatch.zero.push(idiom);
        }
    }
    
    // 按优先级添加成语的字
    const priorities = [
        { list: idiomsByMatch.three, maxIdioms: 2 },       // 最多2个3字相同的
        { list: idiomsByMatch.two, maxIdioms: 3 },         // 最多3个2字相同的
        { list: idiomsByMatch.one, maxIdioms: 4 },         // 最多4个1字相同的
        { list: idiomsByMatch.zero, maxIdioms: Infinity }  // 无相同的不限制
    ];
    
    for (const { list, maxIdioms } of priorities) {
        if (chars.size >= 24) break;
        
        // 打乱该优先级的成语
        const shuffled = shuffleArray(list, seed);
        
        let addedCount = 0;
        for (const idiom of shuffled) {
            if (chars.size >= 24) break;
            if (addedCount >= maxIdioms) break;
            
            const oldSize = chars.size;
            idiom.split('').forEach(char => chars.add(char));
            
            if (chars.size > oldSize) {
                usedIdioms.add(idiom);
                addedCount++;
            }
        }
    }
    
    // 转换为数组并限制为24个（7+7+5+5，每行左侧一列）
    const charsArray = Array.from(chars).slice(0, 24);
    
    // 使用伪随机打乱顺序（但保证同一天顺序一致）
    keyboardChars = shuffleArray(charsArray, seed + 999);
}

// 基于种子的数组打乱算法（Fisher-Yates）
function shuffleArray(array, seed) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(seed + i) * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 打乱后的成语列表（全局缓存）
let shuffledIdiomList = [];
// 打乱后的常用成语列表（常用=1）；选题与键盘池按设置二选一
let shuffledCommonList = [];
// 当前用于选题和键盘提示的池（= shuffledIdiomList 或 shuffledCommonList）
let currentPool = [];

// 创建游戏板
function createGameBoard() {
    const gameBoard = document.getElementById('gameBoard');
    gameBoard.innerHTML = '';
    
    for (let i = 0; i < 5; i++) {
        const row = document.createElement('div');
        row.classList.add('row');
        row.dataset.row = i;
        
        for (let j = 0; j < 4; j++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            tile.dataset.row = i;
            tile.dataset.col = j;
            row.appendChild(tile);
        }
        
        gameBoard.appendChild(row);
    }
}

// 创建键盘（基于今日字符：共 24 字 7+7+5+5，每行左侧多一列）
function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';
    
    // 第一行：7个字（左侧一列）
    const row1 = document.createElement('div');
    row1.classList.add('keyboard-row');
    for (let i = 0; i < 7 && i < keyboardChars.length; i++) {
        row1.appendChild(createKeyButton(keyboardChars[i]));
    }
    keyboard.appendChild(row1);
    
    // 第二行：7个字
    const row2 = document.createElement('div');
    row2.classList.add('keyboard-row');
    for (let i = 7; i < 14 && i < keyboardChars.length; i++) {
        row2.appendChild(createKeyButton(keyboardChars[i]));
    }
    keyboard.appendChild(row2);
    
    // 第三行：5个字 + 删除（右边）
    const row3 = document.createElement('div');
    row3.classList.add('keyboard-row', 'keyboard-row-last');
    const charGroup3 = document.createElement('div');
    charGroup3.classList.add('keyboard-char-group');
    for (let i = 14; i < 19 && i < keyboardChars.length; i++) {
        charGroup3.appendChild(createKeyButton(keyboardChars[i]));
    }
    row3.appendChild(charGroup3);
    row3.appendChild(createActionButton('删除', 'delete'));
    keyboard.appendChild(row3);
    
    // 第四行：5个字 + 提交
    const row4 = document.createElement('div');
    row4.classList.add('keyboard-row', 'keyboard-row-last');
    const charGroup4 = document.createElement('div');
    charGroup4.classList.add('keyboard-char-group');
    for (let i = 19; i < 24 && i < keyboardChars.length; i++) {
        charGroup4.appendChild(createKeyButton(keyboardChars[i]));
    }
    row4.appendChild(charGroup4);
    row4.appendChild(createActionButton('提交', 'submit'));
    keyboard.appendChild(row4);
}

// 创建单个按键
function createKeyButton(char) {
    const keyButton = document.createElement('button');
    keyButton.classList.add('key');
    keyButton.textContent = char;
    keyButton.dataset.key = char;
    
    // 应用已有的键盘状态（如果设置开启了高亮）
    if (settings.keyboardHighlight && keyboardState[char]) {
        keyButton.classList.add(keyboardState[char]);
    }
    
    keyButton.addEventListener('click', () => handleKeyPress(char));
    return keyButton;
}

// 创建操作按钮（删除/提交）
function createActionButton(text, type) {
    const button = document.createElement('button');
    button.classList.add('key', 'action-key');
    if (type === 'delete') {
        button.classList.add('delete');
    }
    button.textContent = text;
    button.dataset.key = text;
    button.addEventListener('click', () => handleKeyPress(text));
    return button;
}

// 绑定事件监听器
function attachEventListeners() {
    // 键盘事件（弹窗打开或焦点在输入框时不响应，避免设置里按回车触发「提交」）
    document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        const modalOpen = document.querySelector('.modal-overlay.show');
        if (inInput || modalOpen) return;
        if (gameOver) return;

        if (e.key === 'Backspace' || e.key === 'Delete') {
            handleKeyPress('删除');
        } else if (e.key === 'Enter') {
            handleKeyPress('提交');
        }
    });
    
    // 关闭弹窗按钮
    document.getElementById('modalClose').addEventListener('click', hideResult);
    
    // 分享按钮
    document.getElementById('shareBtn').addEventListener('click', shareResult);
    
    // 点击遮罩关闭弹窗
    document.getElementById('resultModal').addEventListener('click', (e) => {
        if (e.target.id === 'resultModal') {
            hideResult();
        }
    });
    
    // 设置按钮
    document.getElementById('hintBtn').addEventListener('click', showHint);
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    document.getElementById('settingsClose').addEventListener('click', hideSettings);
    document.getElementById('settingValidateIdiom').addEventListener('change', saveSettings);
    document.getElementById('settingKeyboardHighlight').addEventListener('change', saveSettings);
    document.getElementById('settingCommonIdiomOnly').addEventListener('change', saveSettings);
    document.getElementById('settingAuthKey').addEventListener('input', updateKeyButtonText);
    document.getElementById('settingKeyBtn').addEventListener('click', async () => {
        const inputEl = document.getElementById('settingAuthKey');
        const key = inputEl.value.trim();
        if (!key) {
            const oldKey = getAuthString();
            if (!PB_URL) {
                showMessage('请配置 PB_URL 后使用生成密钥', 'error');
                return;
            }
            try {
                const record = await createRecordOnPB();
                saveAuth(record.id);
                inputEl.value = record.id;
                updateKeyButtonText();
                const remoteUpdated = record.updated ? new Date(record.updated).getTime() : Date.now();
                setLocalData({
                    setting: record.setting != null ? record.setting : settings,
                    stats: record.stats != null ? record.stats : stats,
                    state: record.state != null ? record.state : null,
                    updated: remoteUpdated
                });
                loadStats();
                loadSettings();
                startNewGame();
                showMessage('已生成密钥，已自动同步', '');
            } catch (e) {
                inputEl.value = oldKey || '';
                updateKeyButtonText();
                loadStats();
                loadSettings();
                startNewGame();
                const status = e?.status ?? e?.response?.status;
                if (status === 429) showMessage('今日注册已达上限', 'error');
                else showMessage('同步失败', 'error');
            }
        } else {
            if (PB_URL) {
                try {
                    const pb = new PocketBase(PB_URL);
                    await pb.collection(PB_WORDLE_COLLECTION).getOne(key);
                    saveAuth(key);
                    await syncWithPB();
                    loadStats();
                    loadSettings();
                    startNewGame();
                    showMessage('已同步云端', '');
                } catch (e) {
                    loadStats();
                    loadSettings();
                    startNewGame();
                    if (e?.status === 404 || e?.response?.status === 404) {
                        showMessage('记录不存在，请生成密钥', 'error');
                    } else {
                        const status = e?.status ?? e?.response?.status;
                        if (status !== 429) showMessage('同步失败', 'error');
                    }
                }
            } else {
                saveAuth(key);
                showMessage('已保存到本地（未配置 PB_URL 不同步云端）', '');
            }
        }
    });
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') {
            hideSettings();
        }
    });
    
    // 统计按钮
    document.getElementById('statsBtn').addEventListener('click', showStats);
    document.getElementById('statsClose').addEventListener('click', hideStats);
    document.getElementById('statsModal').addEventListener('click', (e) => {
        if (e.target.id === 'statsModal') {
            hideStats();
        }
    });
    // 帮助按钮
    document.getElementById('helpBtn').addEventListener('click', showHelp);
    document.getElementById('helpClose').addEventListener('click', hideHelp);
    document.getElementById('helpModal').addEventListener('click', (e) => {
        if (e.target.id === 'helpModal') {
            hideHelp();
        }
    });
}

// 开始新游戏
function startNewGame() {
    if (idiomList.length === 0) {
        showMessage('成语列表未加载，请稍候...', 'error');
        return;
    }
    
    // 获取今日日期
    todayDate = getTodayDateString();
    
    // 基于日期选择今日成语（所有人同一天看到的答案相同）
    const days = dateToDays(todayDate);
    const pool = settings.commonIdiomOnly && shuffledCommonList.length > 0 ? shuffledCommonList : shuffledIdiomList;
    currentPool = pool;
    const index = days % pool.length;
    targetIdiom = pool[index];
    
    // 更新副标题显示今日日期（xx年x月x日）
    document.getElementById('subtitle').textContent = getDateDisplayString(todayDate);
    // 简单模式时显示「简单」标签
    const modeTag = document.getElementById('modeTag');
    if (modeTag) modeTag.classList.toggle('show', settings.commonIdiomOnly);
    
    // 生成今日键盘
    generateTodayKeyboard(dateToDays(todayDate));
    
    // 初始化状态
    currentRow = 0;
    currentTile = 0;
    gameOver = false;
    guessedIdioms = [];
    keyboardState = {};
    
    createGameBoard();
    createKeyboard();
    hideMessage();
    hideResult();
    
    // 尝试加载今日已保存的状态
    const savedState = loadGameState();
    if (savedState) {
        restoreGameState(savedState);
    }
}

// 处理按键
function handleKeyPress(key) {
    if (gameOver) return;
    
    if (key === '删除') {
        deleteLetter();
    } else if (key === '提交') {
        submitGuess();
    } else {
        addLetter(key);
    }
}

// 添加字符
function addLetter(letter) {
    if (currentTile < 4) {
        const tile = document.querySelector(`.tile[data-row="${currentRow}"][data-col="${currentTile}"]`);
        tile.textContent = letter;
        tile.classList.add('filled', 'pop');
        setTimeout(() => tile.classList.remove('pop'), 100);
        currentTile++;
    }
}

// 删除字符
function deleteLetter() {
    if (currentTile > 0) {
        currentTile--;
        const tile = document.querySelector(`.tile[data-row="${currentRow}"][data-col="${currentTile}"]`);
        tile.textContent = '';
        tile.classList.remove('filled');
    }
}

// 提交猜测
function submitGuess() {
    if (currentTile !== 4) {
        showMessage('请输入四个字', 'error');
        return;
    }
    
    // 获取当前猜测
    const guess = getCurrentGuess();
    
    // 检查是否只使用了键盘上的字
    const guessChars = guess.split('');
    const invalidChar = guessChars.find(char => !keyboardChars.includes(char));
    if (invalidChar) {
        showMessage('只能使用键盘上的字', 'error');
        shakeRow(currentRow);
        return;
    }
    
    // 检查是否是有效成语（根据设置）
    if (settings.validateIdiom && !idiomList.includes(guess)) {
        showMessage('不是有效的成语', 'error');
        shakeRow(currentRow);
        return;
    }
    
    // 检查是否已猜过
    if (guessedIdioms.includes(guess)) {
        showMessage('已经猜过这个成语了', 'error');
        return;
    }
    
    guessedIdioms.push(guess);
    
    // 检查答案并更新显示
    checkGuess(guess);
    
    // 检查游戏状态（等待动画完成后保存）
    const animationDelay = 4 * 200 + 300; // 等待所有格子翻转完成
    
    if (guess === targetIdiom) {
        gameOver = true;
        updateStats(true, guessedIdioms.length);
        setTimeout(() => {
            saveGameState();
            showResult(true);
        }, animationDelay);
    } else if (currentRow === 4) {
        gameOver = true;
        updateStats(false, 0);
        setTimeout(() => {
            saveGameState();
            showResult(false);
        }, animationDelay);
    } else {
        currentRow++;
        currentTile = 0;
        setTimeout(() => {
            saveGameState();
        }, animationDelay);
    }
}

// 自动换行绘制文字，返回最终 Y 坐标
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = text.split('');
    let line = '';
    let currentY = y;
    let lineCount = 0;
    
    for (let i = 0; i < chars.length; i++) {
        const testLine = line + chars[i];
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && line.length > 0) {
            ctx.fillText(line, x, currentY);
            line = chars[i];
            currentY += lineHeight;
            lineCount++;
        } else {
            line = testLine;
        }
    }
    if (line) {
        ctx.fillText(line, x, currentY);
        lineCount++;
    }
    
    return currentY + lineHeight;
}

// 生成分享图片
function generateShareImage() {
    const won = guessedIdioms[guessedIdioms.length - 1] === targetIdiom;
    const data = idiomData[targetIdiom] || {};
    const hasDerivation = data.derivation && data.derivation !== '无' && data.derivation.trim() !== '';
    
    // 高分辨率倍数
    const scale = 3;
    
    // Canvas 设置（逻辑尺寸）
    const tileSize = 60;
    const gap = 8;
    const padding = 24;
    const cols = 4;
    const rows = guessedIdioms.length;
    
    const contentWidth = cols * tileSize + (cols - 1) * gap;
    const width = padding * 2 + contentWidth;
    const tagH = 24;
    const tagGap = 12;
    const headerHeight = 22 + 32 + tagH + tagGap + (settings.commonIdiomOnly ? tagH + tagGap : 0) + 18;
    
    // 先创建临时 canvas 测量实际文字高度
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const lineHeight = 20;
    let explanationHeight = 0;
    let derivationHeight = 0;
    
    // 不再显示解释
    explanationHeight = 0;
    
    if (hasDerivation) {
        tempCtx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        const derivText = data.derivation;
        const lines = Math.ceil(tempCtx.measureText(derivText).width / contentWidth);
        derivationHeight = 12 + lines * lineHeight + 8;
    }
    
    const answerHeight = 100;
    const tilesHeight = rows * tileSize + (rows - 1) * gap;
    const height = padding + headerHeight + tilesHeight + 20 + answerHeight + explanationHeight + derivationHeight + padding;
    
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    
    // 缩放上下文
    ctx.scale(scale, scale);
    
    // 背景色
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const bgPrimary = isDark ? '#0f172a' : '#f8fafc';
    const bgSecondary = isDark ? '#1e293b' : '#ffffff';
    const textPrimary = isDark ? '#f1f5f9' : '#1e293b';
    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    
    ctx.fillStyle = bgPrimary;
    ctx.fillRect(0, 0, width, height);
    
    const tagPad = 14;
    let headerY = padding + 22;
    
    // 标题
    ctx.fillStyle = textPrimary;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('猜三划四', width / 2, headerY);
    headerY += 32;
    
    // 日期 tag（与页面一致：圆角矩形 + 边框 + 浅底）
    const dateStr = getDateDisplayString(todayDate);
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    const dateTagW = ctx.measureText(dateStr).width + tagPad * 2;
    const dateTagX = (width - dateTagW) / 2;
    ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.15)';
    ctx.strokeStyle = textSecondary;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(dateTagX, headerY, dateTagW, tagH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = textSecondary;
    ctx.fillText(dateStr, width / 2, headerY + tagH / 2);
    headerY += tagH + tagGap;
    
    // 简单模式时绘制「简单」tag
    if (settings.commonIdiomOnly) {
        const tagText = '简单';
        const simpleTagW = ctx.measureText(tagText).width + tagPad * 2;
        const simpleTagX = (width - simpleTagW) / 2;
        ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
        ctx.strokeStyle = '#eab308';
        ctx.beginPath();
        ctx.roundRect(simpleTagX, headerY, simpleTagW, tagH, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#eab308';
        ctx.fillText(tagText, width / 2, headerY + tagH / 2);
        headerY += tagH + tagGap;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    
    // 颜色定义
    const colors = {
        correct: '#22c55e',
        present: '#eab308',
        absent: isDark ? '#475569' : '#94a3b8'
    };
    
    // 绘制方块
    const tilesStartY = padding + headerHeight;
    for (let row = 0; row < rows; row++) {
        const guess = guessedIdioms[row];
        const guessChars = guess.split('');
        const targetChars = targetIdiom.split('');
        const charStatus = getCharStatus(guessChars, targetChars);
        
        for (let col = 0; col < 4; col++) {
            const x = padding + col * (tileSize + gap);
            const y = tilesStartY + row * (tileSize + gap);
            
            // 方块背景
            ctx.fillStyle = colors[charStatus[col]];
            ctx.beginPath();
            ctx.roundRect(x, y, tileSize, tileSize, 8);
            ctx.fill();
            
            // 文字
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(guessChars[col], x + tileSize / 2, y + tileSize / 2);
        }
    }
    
    // 答案区域
    let currentY = tilesStartY + tilesHeight + 20;
    
    // 结果标题（恭喜/遗憾）
    ctx.fillStyle = won ? '#22c55e' : '#ef4444';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(won ? '恭喜你猜对了！' : '很遗憾，没猜出来', width / 2, currentY);
    currentY += 28;
    
    // 成语（普通文字颜色）
    ctx.fillStyle = textPrimary;
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(targetIdiom, width / 2, currentY);
    currentY += 38;
    
    // 拼音
    if (data.pinyin) {
        ctx.fillStyle = textSecondary;
        ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(data.pinyin, width / 2, currentY);
        currentY += 28;
    }
    
    // 来源文字
    if (hasDerivation) {
        currentY += 16;
        
        ctx.fillStyle = textSecondary;
        ctx.font = '12px Georgia, "Songti SC", "SimSun", serif';
        ctx.textAlign = 'left';
        const lineHeight = 20;
        currentY = wrapText(ctx, data.derivation, padding, currentY, contentWidth, lineHeight);
    }
    
    return canvas;
}

// 分享/导出图片
async function shareResult() {
    const canvas = generateShareImage();
    
    // 转换为 Blob
    canvas.toBlob(async (blob) => {
        const file = new File([blob], `猜三划四_${todayDate}.png`, { type: 'image/png' });
        
        // 尝试使用 Web Share API（移动端）
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: '猜三划四'
                });
                return;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    showMessage('分享失败', 'error');
                }
            }
        }
        
        // 降级到下载图片
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `猜三划四_${todayDate}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showMessage('图片已保存！', 'success');
    }, 'image/png');
}

// 显示结果弹窗
function showResult(won = true) {
    const data = idiomData[targetIdiom];
    if (!data) return;
    
    const header = document.getElementById('modalHeader');
    header.textContent = won ? '恭喜你猜对了！' : '很遗憾，没猜出来';
    header.classList.toggle('fail', !won);
    
    document.getElementById('resultWord').textContent = targetIdiom;
    document.getElementById('resultPinyin').textContent = data.pinyin;
    document.getElementById('resultExplanation').style.display = 'none';
    
    // 显示来源（如果不是"无"）
    const derivationEl = document.getElementById('resultDerivation');
    if (data.derivation && data.derivation !== '无' && data.derivation.trim() !== '') {
        derivationEl.textContent = data.derivation;
        derivationEl.style.display = 'block';
    } else {
        derivationEl.style.display = 'none';
    }
    
    // 本局新解锁成就提示
    const unlockEl = document.getElementById('resultAchievementUnlock');
    if (lastUnlockedAchievementNames.length > 0) {
        unlockEl.textContent = '成就解锁：' + lastUnlockedAchievementNames.join('、');
        unlockEl.style.display = 'block';
    } else {
        unlockEl.style.display = 'none';
    }
    
    document.getElementById('resultModal').classList.add('show');
}

// 隐藏结果弹窗
function hideResult() {
    document.getElementById('resultModal').classList.remove('show');
}

// 获取当前猜测
function getCurrentGuess() {
    let guess = '';
    for (let i = 0; i < 4; i++) {
        const tile = document.querySelector(`.tile[data-row="${currentRow}"][data-col="${i}"]`);
        guess += tile.textContent;
    }
    return guess;
}

// 检查猜测
function checkGuess(guess) {
    const targetChars = targetIdiom.split('');
    const guessChars = guess.split('');
    const charStatus = getCharStatus(guessChars, targetChars);
    
    // 更新瓦片显示（带翻转动画）
    for (let i = 0; i < 4; i++) {
        const tile = document.querySelector(`.tile[data-row="${currentRow}"][data-col="${i}"]`);
        setTimeout(() => {
            tile.classList.add('flip');
            setTimeout(() => {
                tile.classList.add(charStatus[i]);
            }, 250);
        }, i * 200);
        
        // 更新键盘状态
        setTimeout(() => {
            updateKeyboardState(guessChars[i], charStatus[i]);
        }, i * 200 + 250);
    }
}

// 更新键盘状态
function updateKeyboardState(char, status) {
    const currentStatus = keyboardState[char];
    
    // 优先级：correct > present > absent
    if (currentStatus === 'correct') return;
    if (currentStatus === 'present' && status === 'absent') return;
    
    keyboardState[char] = status;
    
    // 如果设置关闭了键盘高亮，不更新显示
    if (!settings.keyboardHighlight) return;
    
    // 更新键盘按钮
    const keyButton = document.querySelector(`.key[data-key="${char}"]`);
    if (keyButton) {
        keyButton.classList.remove('correct', 'present', 'absent');
        keyButton.classList.add(status);
    }
}

// 抖动行
function shakeRow(row) {
    const rowElement = document.querySelector(`.row[data-row="${row}"]`);
    rowElement.classList.add('shake');
    setTimeout(() => {
        rowElement.classList.remove('shake');
    }, 400);
}

// 答案是否有重复字
function hasRepeatedChars(s) {
    const set = new Set(s.split(''));
    return set.size < s.length;
}

// 今日提示内容（仅由日期决定，同一天所有人一致，不随刷新/设备变化）
function getTodayHintText() {
    const dateStr = todayDate || getTodayDateString();
    const seed = dateToDays(dateStr);
    const hasRepeat = hasRepeatedChars(targetIdiom);

    const types = hasRepeat ? [1, 2, 3] : [1, 2]; // 1=揭示一字 2=不含某字 3=有重复字
    const choice = types[Math.floor(seededRandom(seed + 100) * types.length)];

    if (choice === 3) {
        return '答案中有重复字';
    }
    if (choice === 1) {
        const pos = 1 + Math.floor(seededRandom(seed + 101) * 4); // 1~4
        const char = targetIdiom[pos - 1];
        return '第 ' + pos + ' 个字是「' + char + '」';
    }
    const notInAnswer = keyboardChars.filter(c => !targetIdiom.includes(c));
    if (notInAnswer.length === 0) {
        const pos = 1 + Math.floor(seededRandom(seed + 101) * 4);
        const char = targetIdiom[pos - 1];
        return '第 ' + pos + ' 个字是「' + char + '」';
    }
    notInAnswer.sort(); // 保证同一天同顺序
    const idx = Math.floor(seededRandom(seed + 102) * notInAnswer.length);
    const z = notInAnswer[idx];
    return '答案中不含「' + z + '」';
}

function showHint() {
    if (!targetIdiom) {
        showMessage('成语未加载', 'error');
        return;
    }
    if (gameOver) {
        showMessage('本局已结束', 'error');
        return;
    }
    const text = getTodayHintText();
    showMessage(text, 'hint', 5000);
}

// 显示消息（duration 毫秒，可选）
function showMessage(text, type = '', duration = 3000) {
    const message = document.getElementById('message');
    message.textContent = text;
    message.className = 'message show';
    if (type) {
        message.classList.add(type);
    }
    clearTimeout(message._hideTimer);
    message._hideTimer = setTimeout(() => {
        hideMessage();
    }, duration);
}

// 隐藏消息
function hideMessage() {
    const message = document.getElementById('message');
    message.className = 'message';
}


// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
