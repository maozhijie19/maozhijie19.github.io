// 游戏状态
let targetIdiom = '';
let currentRow = 0;
let currentTile = 0;
let gameOver = false;
let idiomList = [];
let guessedIdioms = [];
let keyboardState = {};
let keyboardChars = []; // 今日键盘的20个字
let todayDate = ''; // 今日日期
let idiomData = {}; // 成语数据 {word: {explanation, pinyin}}

// 设置
let settings = {
    validateIdiom: true,      // 是否验证成语
    keyboardHighlight: true   // 是否键盘高亮
};

// 统计数据
let stats = {
    totalGames: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: [0, 0, 0, 0, 0] // 1-5次猜对的次数
};

// 加载统计数据
function loadStats() {
    const saved = localStorage.getItem('idiomWordleStats');
    if (saved) {
        try {
            stats = JSON.parse(saved);
        } catch (e) {
            console.error('加载统计失败:', e);
        }
    }
}

// 保存统计数据
function saveStats() {
    localStorage.setItem('idiomWordleStats', JSON.stringify(stats));
}

// 更新统计数据
function updateStats(won, attempts) {
    stats.totalGames++;
    if (won) {
        stats.gamesWon++;
        stats.currentStreak++;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
        stats.guessDistribution[attempts - 1]++;
    } else {
        stats.currentStreak = 0;
    }
    saveStats();
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
    
    document.getElementById('statsModal').classList.add('show');
}

// 隐藏统计弹窗
function hideStats() {
    document.getElementById('statsModal').classList.remove('show');
}

// 加载设置
function loadSettings() {
    const saved = localStorage.getItem('idiomWordleSettings');
    if (saved) {
        try {
            settings = JSON.parse(saved);
        } catch (e) {
            console.error('加载设置失败:', e);
        }
    }
    // 更新 UI
    document.getElementById('settingValidateIdiom').checked = settings.validateIdiom;
    document.getElementById('settingKeyboardHighlight').checked = settings.keyboardHighlight;
}

// 保存设置
function saveSettings() {
    settings.validateIdiom = document.getElementById('settingValidateIdiom').checked;
    settings.keyboardHighlight = document.getElementById('settingKeyboardHighlight').checked;
    localStorage.setItem('idiomWordleSettings', JSON.stringify(settings));
    
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
    saveSettings();
    document.getElementById('settingsModal').classList.remove('show');
}

// 保存游戏状态
function saveGameState() {
    const state = {
        date: todayDate,
        guessedIdioms: guessedIdioms,
        currentRow: currentRow,
        gameOver: gameOver,
        keyboardState: keyboardState
    };
    localStorage.setItem('idiomWordleState', JSON.stringify(state));
}

// 加载游戏状态
function loadGameState() {
    const saved = localStorage.getItem('idiomWordleState');
    if (!saved) return null;
    
    try {
        const state = JSON.parse(saved);
        // 检查是否是今天的状态
        if (state.date === todayDate) {
            return state;
        }
    } catch (e) {
        console.error('加载游戏状态失败:', e);
    }
    return null;
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
    await loadIdioms();
    loadSettings();
    loadStats();
    createGameBoard();
    createKeyboard();
    attachEventListeners();
    startNewGame();
}

// 获取今日日期字符串（YYYY-MM-DD）
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 基于日期的伪随机数生成器（保证同一天同一结果）
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// 将日期字符串转换为种子数字
function dateToSeed(dateStr) {
    const parts = dateStr.split('-');
    return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
}

// 解析 CSV 行
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// 加载成语列表
async function loadIdioms() {
    try {
        const response = await fetch('idiom.csv');
        const text = await response.text();
        const lines = text.split('\n');
        
        // 跳过表头
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const fields = parseCSVLine(line);
            // CSV 列: derivation, example, explanation, pinyin, word, abbreviation, pinyin_r, first, last
            const explanation = fields[2] || '';
            const pinyin = fields[3] || '';
            const word = fields[4] || '';
            
            if (word.length === 4) {
                idiomList.push(word);
                const derivation = fields[0] || '';
                idiomData[word] = { explanation, pinyin, derivation };
            }
        }
        
        console.log(`已加载 ${idiomList.length} 个成语`);
    } catch (error) {
        console.error('加载成语列表失败:', error);
        showMessage('加载成语列表失败，请刷新页面重试', 'error');
    }
}

// 生成今日键盘字符（智能算法）
function generateTodayKeyboard() {
    const seed = dateToSeed(todayDate);
    const chars = new Set();
    const usedIdioms = new Set();
    
    // 1. 添加目标成语的字
    targetIdiom.split('').forEach(char => chars.add(char));
    usedIdioms.add(targetIdiom);
    
    // 2. 找有相同字的成语（优先级高）
    const relatedIdioms = idiomList.filter(idiom => {
        if (usedIdioms.has(idiom)) return false;
        // 检查是否有共同字
        const idiomChars = idiom.split('');
        return idiomChars.some(char => chars.has(char));
    });
    
    // 使用伪随机打乱相关成语
    const shuffledRelated = shuffleArray(relatedIdioms, seed + 1);
    
    // 添加相关成语的字，直到接近20个
    for (const idiom of shuffledRelated) {
        if (chars.size >= 16) break; // 留4个位置给无关成语
        idiom.split('').forEach(char => chars.add(char));
        usedIdioms.add(idiom);
    }
    
    // 3. 如果还不够20个，添加无关成语的字
    if (chars.size < 20) {
        const unrelatedIdioms = idiomList.filter(idiom => !usedIdioms.has(idiom));
        const shuffledUnrelated = shuffleArray(unrelatedIdioms, seed + 2);
        
        for (const idiom of shuffledUnrelated) {
            if (chars.size >= 20) break;
            idiom.split('').forEach(char => chars.add(char));
        }
    }
    
    // 转换为数组并限制为20个（8+6+6）
    const charsArray = Array.from(chars).slice(0, 20);
    
    // 使用伪随机打乱顺序（但保证同一天顺序一致）
    keyboardChars = shuffleArray(charsArray, seed + 3);
    
    console.log('今日键盘字符:', keyboardChars.join(''));
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

// 创建键盘（基于今日字符）
function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';
    
    // 第一行：8个字
    const row1 = document.createElement('div');
    row1.classList.add('keyboard-row');
    for (let i = 0; i < 8 && i < keyboardChars.length; i++) {
        const keyButton = createKeyButton(keyboardChars[i]);
        row1.appendChild(keyButton);
    }
    keyboard.appendChild(row1);
    
    // 第二行：6个字 + 删除按钮
    const row2 = document.createElement('div');
    row2.classList.add('keyboard-row');
    for (let i = 8; i < 14 && i < keyboardChars.length; i++) {
        const keyButton = createKeyButton(keyboardChars[i]);
        row2.appendChild(keyButton);
    }
    const deleteBtn = createActionButton('删除', 'delete');
    row2.appendChild(deleteBtn);
    keyboard.appendChild(row2);
    
    // 第三行：6个字 + 提交按钮
    const row3 = document.createElement('div');
    row3.classList.add('keyboard-row');
    for (let i = 14; i < 20 && i < keyboardChars.length; i++) {
        const keyButton = createKeyButton(keyboardChars[i]);
        row3.appendChild(keyButton);
    }
    const submitBtn = createActionButton('提交', 'submit');
    row3.appendChild(submitBtn);
    keyboard.appendChild(row3);
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
    // 键盘事件
    document.addEventListener('keydown', (e) => {
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
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    document.getElementById('settingsClose').addEventListener('click', hideSettings);
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
    const seed = dateToSeed(todayDate);
    const index = Math.floor(seededRandom(seed) * idiomList.length);
    targetIdiom = idiomList[index];
    
    console.log('今日日期:', todayDate);
    console.log('今日成语:', targetIdiom); // 调试用，正式版可删除
    
    // 更新副标题显示今日日期
    document.getElementById('subtitle').textContent = `今日成语 ${todayDate}`;
    
    // 生成今日键盘
    generateTodayKeyboard();
    
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
    const headerHeight = 70;
    const cols = 4;
    const rows = guessedIdioms.length;
    
    const contentWidth = cols * tileSize + (cols - 1) * gap;
    const width = padding * 2 + contentWidth;
    
    // 先创建临时 canvas 测量实际文字高度
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const lineHeight = 20;
    let explanationHeight = 0;
    let derivationHeight = 0;
    
    if (data.explanation) {
        tempCtx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
        const lines = Math.ceil(tempCtx.measureText(data.explanation).width / contentWidth);
        explanationHeight = 12 + lines * lineHeight + 8;
    }
    
    if (hasDerivation) {
        tempCtx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        const derivText = '出处：' + data.derivation;
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
    
    // 标题
    ctx.fillStyle = textPrimary;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('成语Wordle', width / 2, padding + 24);
    
    // 副标题
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = textSecondary;
    ctx.fillText(`今日成语 ${todayDate}`, width / 2, padding + 46);
    
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
    
    // 解释文字
    if (data.explanation) {
        currentY += 12;
        
        ctx.fillStyle = textPrimary;
        ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        const lineHeight = 20;
        currentY = wrapText(ctx, data.explanation, padding, currentY, contentWidth, lineHeight);
    }
    
    // 来源文字
    if (hasDerivation) {
        currentY += 4;
        
        ctx.fillStyle = textSecondary;
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        const lineHeight = 20;
        currentY = wrapText(ctx, '出处：' + data.derivation, padding, currentY, contentWidth, lineHeight);
    }
    
    return canvas;
}

// 分享/导出图片
async function shareResult() {
    const canvas = generateShareImage();
    
    // 转换为 Blob
    canvas.toBlob(async (blob) => {
        const file = new File([blob], `成语Wordle_${todayDate}.png`, { type: 'image/png' });
        
        // 尝试使用 Web Share API（移动端）
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: '成语Wordle'
                });
                return;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.log('分享失败:', err);
                }
            }
        }
        
        // 降级到下载图片
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `成语Wordle_${todayDate}.png`;
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
    document.getElementById('resultExplanation').textContent = data.explanation;
    
    // 显示来源（如果不是"无"）
    const derivationEl = document.getElementById('resultDerivation');
    if (data.derivation && data.derivation !== '无' && data.derivation.trim() !== '') {
        derivationEl.textContent = '出处：' + data.derivation;
        derivationEl.style.display = 'block';
    } else {
        derivationEl.style.display = 'none';
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

// 显示消息
function showMessage(text, type = '') {
    const message = document.getElementById('message');
    message.textContent = text;
    message.className = 'message show';
    if (type) {
        message.classList.add(type);
    }
    
    setTimeout(() => {
        hideMessage();
    }, 3000);
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
