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
let idiomData = {}; // 成语数据 {word: {pinyin, derivation, explanation, ...}}

// 设置
let settings = {
    validateIdiom: true,      // 是否验证成语（默认开启，提示非成语）
    keyboardHighlight: true    // 是否键盘高亮
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
    { id: 'closeCall', name: '功亏一篑', desc: '第五次猜测出现 3 个绿格' }
];

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

// 保证 stats 结构完整（本地缓存可能缺字段）；stats 必须是对象
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
    data.state = { date: todayDate, guessedIdioms: guessedIdioms.slice(), currentRow, gameOver, keyboardState: Object.assign({}, keyboardState) };
    data.updated = Date.now();
    setLocalData(data);
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
    const nameById = { firstTry: '一击即中', fifthTry: '险中求胜', closeCall: '功亏一篑' };

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
    // 功亏一篑：第五次猜测出现 3 个绿格但未猜中（差一点就对了）
    if (!unlocked.has('closeCall') && !won && guessedIdioms.length === 5 && targetIdiom) {
        const lastGuess = guessedIdioms[4];
        const status = getCharStatus(lastGuess.split(''), targetIdiom.split(''));
        if (status.filter(s => s === 'correct').length >= 3) {
            stats.achievements.push('closeCall');
            unlocked.add('closeCall');
            lastUnlockedAchievementNames.push(nameById.closeCall);
        }
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
    const elV = document.getElementById('settingValidateIdiom');
    const elK = document.getElementById('settingKeyboardHighlight');
    if (elV) elV.checked = settings.validateIdiom;
    if (elK) elK.checked = settings.keyboardHighlight;
}

// 保存设置（写入 idiomWordleData.setting）
function saveSettings() {
    settings.validateIdiom = document.getElementById('settingValidateIdiom').checked;
    settings.keyboardHighlight = document.getElementById('settingKeyboardHighlight').checked;
    const data = getLocalData();
    data.setting = data.setting || {};
    data.setting.validateIdiom = settings.validateIdiom;
    data.setting.keyboardHighlight = settings.keyboardHighlight;
    data.stats = data.stats || stats;
    data.state = data.state || null;
    data.updated = Date.now();
    setLocalData(data);

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

// 显示设置弹窗
function showSettings() {
    document.getElementById('settingsModal').classList.add('show');
}

// 隐藏设置弹窗
function hideSettings() {
    document.getElementById('settingsModal').classList.remove('show');
}

// 保存游戏状态（写入 idiomWordleData.state）
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
    data.state = branch;
    data.updated = Date.now();
    setLocalData(data);
}

// 加载游戏状态（从 idiomWordleData.state）；兼容旧版双分支格式
function loadGameState() {
    const data = getLocalData();
    const s = data.state;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const branch = s.date === todayDate ? s : (s.common && s.common.date === todayDate ? s.common : (s.all && s.all.date === todayDate ? s.all : null));
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

// 加载成语数据（JSON 独立维护，便于编辑与扩展）
async function loadIdiomData() {
    const res = await fetch('idiom.json');
    if (!res.ok) throw new Error('成语数据加载失败');
    const data = await res.json();
    idiomList.length = 0;
    idiomList.push(...Object.keys(data));
    for (const k of Object.keys(idiomData)) delete idiomData[k];
    Object.assign(idiomData, data);
}

// 初始化游戏
async function init() {
    const subtitleEl = document.getElementById('subtitle');
    if (subtitleEl) subtitleEl.textContent = '加载中…';

    // 先画出空格子，避免加载期间出现空白区域
    createGameBoard();

    try {
        await loadIdiomData();
    } catch (e) {
        if (subtitleEl) subtitleEl.textContent = '数据加载失败，请刷新';
        showMessage('成语数据加载失败，请检查网络后刷新页面', 'error', 8000);
        return;
    }

    if (subtitleEl) subtitleEl.textContent = getDateDisplayString(getTodayDateString());

    // 用固定种子打乱成语列表（保证所有人打乱结果一致）
    const fixedSeed = 20260101;
    shuffledIdiomList = shuffleArray(idiomList, fixedSeed);

    loadSettings();
    loadStats();
    // 预加载键盘：先选定今日成语并生成今日键盘字符，再创建键盘，避免首次显示空白
    todayDate = getTodayDateString();
    const index = dateToDays(todayDate) % shuffledIdiomList.length;
    targetIdiom = shuffledIdiomList[index];
    generateTodayKeyboard(dateToDays(todayDate));
    createKeyboard();
    attachEventListeners();
    startNewGame();

    startCountdownTimer();
}

const UTC_PLUS_8_MS = 8 * 60 * 60 * 1000;

// 返回当前 UTC+8 的“今日”日期对象 { year, month, date }（month 0-based，与 Date 一致）
function getUtc8Today() {
    const utc8 = new Date(Date.now() + UTC_PLUS_8_MS);
    return {
        year: utc8.getUTCFullYear(),
        month: utc8.getUTCMonth(),
        date: utc8.getUTCDate()
    };
}

// 下一个 UTC+8 0:00 的时间戳（毫秒）
function getNextUtc8MidnightMs() {
    const { year, month, date } = getUtc8Today();
    return Date.UTC(year, month, date + 1, 0, 0, 0, 0) - UTC_PLUS_8_MS;
}

// 获取今日日期字符串（YYYY-MM-DD），按 UTC+8
function getTodayDateString() {
    const { year, month, date } = getUtc8Today();
    const m = String(month + 1).padStart(2, '0');
    const d = String(date).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

// 将 YYYY-MM-DD 转为展示用「xx年x月x日」
function getDateDisplayString(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${y}年${m}月${d}日`;
}

// 今日倒计时（UTC+8 次日 0:00 剩余），返回 { h, m, s } 或 null（已过 0 点）
function getCountdownToNextUtc8Midnight() {
    const nextMs = getNextUtc8MidnightMs();
    const left = nextMs - Date.now();
    if (left <= 0) return null;
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);
    return { h, m, s };
}

let countdownTimerId = null;
function startCountdownTimer() {
    const el = document.getElementById('countdown');
    if (!el) return;
    function tick() {
        const cd = getCountdownToNextUtc8Midnight();
        if (cd === null) {
            if (countdownTimerId) {
                clearInterval(countdownTimerId);
                countdownTimerId = null;
            }
            location.reload();
            return;
        }
        const h = String(cd.h).padStart(2, '0');
        const m = String(cd.m).padStart(2, '0');
        const s = String(cd.s).padStart(2, '0');
        el.textContent = `${h}:${m}:${s}`;
    }
    if (countdownTimerId) clearInterval(countdownTimerId);
    tick();
    countdownTimerId = setInterval(tick, 1000);
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
    
    for (const idiom of shuffledIdiomList) {
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
        idiomsByMatch.three,  // 3字相同
        idiomsByMatch.two,    // 2字相同
        idiomsByMatch.one,    // 1字相同
        idiomsByMatch.zero    // 全不相同
    ];
    
    for (const list of priorities) {
        if (chars.size >= 24) break;
        
        // 打乱该优先级的成语
        const shuffled = shuffleArray(list, seed);
        
        for (const idiom of shuffled) {
            if (chars.size >= 24) break;
            idiom.split('').forEach(char => chars.add(char));
        }
    }
    
    // 转换为数组并限制为24个（8+8+8 布局）
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

// 创建键盘（前三行每行 8 字，第四行仅删除+提交）
function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';
    
    // 第一行：8个字
    const row1 = document.createElement('div');
    row1.classList.add('keyboard-row');
    for (let i = 0; i < 8 && i < keyboardChars.length; i++) {
        row1.appendChild(createKeyButton(keyboardChars[i]));
    }
    keyboard.appendChild(row1);
    
    // 第二行：7个字
    const row2 = document.createElement('div');
    row2.classList.add('keyboard-row');
    for (let i = 8; i < 16 && i < keyboardChars.length; i++) {
        row2.appendChild(createKeyButton(keyboardChars[i]));
    }
    keyboard.appendChild(row2);
    
    // 第三行：8个字
    const row3 = document.createElement('div');
    row3.classList.add('keyboard-row');
    for (let i = 16; i < 24 && i < keyboardChars.length; i++) {
        row3.appendChild(createKeyButton(keyboardChars[i]));
    }
    keyboard.appendChild(row3);
    
    // 第四行：仅删除 + 提交
    const row4 = document.createElement('div');
    row4.classList.add('keyboard-row', 'keyboard-row-actions');
    row4.appendChild(createActionButton('删除', 'delete'));
    row4.appendChild(createActionButton('提交', 'submit'));
    keyboard.appendChild(row4);
}

// 按下效果：任一下键时先清除所有键的 .pressed，再给当前键加短暂 .pressed 并用定时器移除；点击后 blur 避免焦点残留
const PRESS_EFFECT_MS = 150;
function clearAllKeyPressed() {
    document.querySelectorAll('#keyboard .key').forEach(k => k.classList.remove('pressed'));
}
function bindKeyPressEffect(button) {
    let pressTimer = null;
    const removePressed = () => {
        button.classList.remove('pressed');
        if (pressTimer != null) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };
    button.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        clearAllKeyPressed();
        if (pressTimer) clearTimeout(pressTimer);
        button.classList.add('pressed');
        pressTimer = setTimeout(removePressed, PRESS_EFFECT_MS);
    });
    button.addEventListener('pointerup', removePressed);
    button.addEventListener('pointerleave', removePressed);
    button.addEventListener('pointercancel', removePressed);
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
    
    bindKeyPressEffect(keyButton);
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
    bindKeyPressEffect(button);
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
    const index = days % shuffledIdiomList.length;
    targetIdiom = shuffledIdiomList[index];
    
    // 更新副标题显示今日日期（xx年x月x日）
    document.getElementById('subtitle').textContent = getDateDisplayString(todayDate);
    
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
    // 让当前焦点离开按键，避免移动端焦点粘在按钮上导致“一直按下”的视觉效果
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('key')) {
        active.blur();
    }
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
    const hasExplanation = data.explanation && data.explanation.trim() !== '';
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
    const headerHeight = 18 + 24 + 16 + 10; // 标题 + 日期行 + 间距
    
    // 先创建临时 canvas 测量实际文字高度
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const lineHeight = 20;
    let explanationHeight = 0;
    let derivationHeight = 0;
    
    // 计算解释高度
    if (hasExplanation) {
        tempCtx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        const explLines = Math.ceil(tempCtx.measureText(data.explanation).width / contentWidth);
        explanationHeight = explLines * lineHeight + 8;
    }
    
    // 计算出处高度
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
    
    let headerY = padding + 18;
    
    // 标题
    ctx.fillStyle = textPrimary;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('四字成语', width / 2, headerY);
    headerY += 24;
    
    // 日期（纯文本）
    const dateStr = getDateDisplayString(todayDate);
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = textSecondary;
    ctx.fillText(dateStr, width / 2, headerY);
    headerY += 16;
    
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
        currentY += 24;
    }
    
    // 解释
    if (hasExplanation) {
        currentY += 8;
        ctx.fillStyle = textPrimary;
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        currentY = wrapText(ctx, data.explanation, padding, currentY, contentWidth, lineHeight);
        ctx.textAlign = 'center';
    }
    
    // 出处
    if (hasDerivation) {
        currentY += 8;
        ctx.fillStyle = textSecondary;
        ctx.font = '12px Georgia, "Songti SC", "SimSun", serif';
        ctx.textAlign = 'left';
        currentY = wrapText(ctx, '出处：' + data.derivation, padding, currentY, contentWidth, lineHeight);
    }
    
    return canvas;
}

// 分享/导出图片
async function shareResult() {
    const canvas = generateShareImage();
    
    // 转换为 Blob
    canvas.toBlob(async (blob) => {
        const file = new File([blob], `四字成语_${todayDate}.png`, { type: 'image/png' });
        
        // 尝试使用 Web Share API（移动端）
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: '四字成语'
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
        a.download = `四字成语_${todayDate}.png`;
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
    
    // 显示解释
    const explanationEl = document.getElementById('resultExplanation');
    if (data.explanation && data.explanation.trim() !== '') {
        explanationEl.textContent = data.explanation;
        explanationEl.style.display = 'block';
    } else {
        explanationEl.style.display = 'none';
    }
    
    // 显示出处（如果不是"无"）
    const derivationEl = document.getElementById('resultDerivation');
    if (data.derivation && data.derivation !== '无' && data.derivation.trim() !== '') {
        derivationEl.textContent = '出处：' + data.derivation;
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
