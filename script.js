// 游戏状态
let targetIdiom = '';
let currentRow = 0;
let currentTile = 0;
let gameOver = false;
let idiomList = [];
let guessedIdioms = [];
let keyboardState = {};
let keyboardChars = []; // 今日键盘的22个字
let todayDate = ''; // 今日日期

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
    
    // 如果游戏已结束，显示消息
    if (gameOver) {
        const won = guessedIdioms[guessedIdioms.length - 1] === targetIdiom;
        if (won) {
            showMessage('恭喜你猜对了！🎉', 'success');
        } else {
            showMessage(`游戏结束！答案是：${targetIdiom}`, 'error');
        }
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

// 加载成语列表
async function loadIdioms() {
    try {
        const response = await fetch('idiom_4chars.txt');
        const text = await response.text();
        idiomList = text.split('\n').filter(idiom => idiom.trim().length === 4);
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
    
    // 添加相关成语的字，直到接近23个
    for (const idiom of shuffledRelated) {
        if (chars.size >= 19) break; // 留4个位置给无关成语
        idiom.split('').forEach(char => chars.add(char));
        usedIdioms.add(idiom);
    }
    
    // 3. 如果还不够23个，添加无关成语的字
    if (chars.size < 23) {
        const unrelatedIdioms = idiomList.filter(idiom => !usedIdioms.has(idiom));
        const shuffledUnrelated = shuffleArray(unrelatedIdioms, seed + 2);
        
        for (const idiom of shuffledUnrelated) {
            if (chars.size >= 23) break;
            idiom.split('').forEach(char => chars.add(char));
        }
    }
    
    // 转换为数组并限制为23个（9+7+7）
    const charsArray = Array.from(chars).slice(0, 23);
    
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
    
    for (let i = 0; i < 6; i++) {
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
    
    // 第一行：9个字
    const row1 = document.createElement('div');
    row1.classList.add('keyboard-row');
    for (let i = 0; i < 9 && i < keyboardChars.length; i++) {
        const keyButton = createKeyButton(keyboardChars[i]);
        row1.appendChild(keyButton);
    }
    keyboard.appendChild(row1);
    
    // 第二行：7个字 + 删除按钮
    const row2 = document.createElement('div');
    row2.classList.add('keyboard-row');
    for (let i = 9; i < 16 && i < keyboardChars.length; i++) {
        const keyButton = createKeyButton(keyboardChars[i]);
        row2.appendChild(keyButton);
    }
    const deleteBtn = createActionButton('删除', 'delete');
    row2.appendChild(deleteBtn);
    keyboard.appendChild(row2);
    
    // 第三行：7个字 + 提交按钮
    const row3 = document.createElement('div');
    row3.classList.add('keyboard-row');
    for (let i = 16; i < 23 && i < keyboardChars.length; i++) {
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
    
    // 应用已有的键盘状态
    if (keyboardState[char]) {
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
    
    // 检查是否是有效成语
    if (!idiomList.includes(guess)) {
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
        setTimeout(() => {
            saveGameState();
            showMessage('恭喜你猜对了！🎉', 'success');
        }, animationDelay);
    } else if (currentRow === 5) {
        gameOver = true;
        setTimeout(() => {
            saveGameState();
            showMessage(`游戏结束！答案是：${targetIdiom}`, 'error');
        }, animationDelay);
    } else {
        currentRow++;
        currentTile = 0;
        setTimeout(() => {
            saveGameState();
        }, animationDelay);
    }
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
