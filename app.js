// app.js - Core application logic and interactive games for Longteng general review

let appData = null;
let currentBook = null;
let currentLesson = null;
let currentType = 'vocabulary'; // 'vocabulary' | 'grammar'
let selectedGameMode = 'auto'; // 'auto' | 'spelling' | 'rapid' | 'unscramble' | 'boss'
let activeGameMode = 'spelling'; // the actual active mode in the PK arena

// Class timer states
let classTimerInterval = null;
let secondsRemaining = 50 * 60; // 50 minutes

// Instruction slider states
let slideData = [];
let currentSlideIndex = 0;

// PK Game state
let gameState = {
    playerHP: 100,
    enemyHP: 100,
    playerScore: 0,
    enemyScore: 0,
    combo: 0,
    maxCombo: 0,
    questionsAttempted: 0,
    questionsCorrect: 0,
    gameInterval: null,
    aiTimer: null,
    currentQuestion: null,
    activeKeys: []
};

// Web Audio API context for sound effects
let audioCtx = null;

// Initializer
window.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
});

// Load the compiled data
async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('Failed to load data.json');
        appData = await response.json();
        console.log('Data loaded successfully:', appData);
        initializeBookSelector();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('無法載入課程資料 data.json，請確保該檔案與 index.html 位於相同目錄！');
    }
}

// Set up UI events
function setupEventListeners() {
    // Book selection click
    document.querySelectorAll('.book-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.book-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const bookId = parseInt(card.dataset.book);
            currentBook = bookId;
            showLessonPanel(bookId);
        });
    });

    // Class type buttons (Vocabulary vs Grammar)
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
        });
    });

    // Start class button
    document.getElementById('start-class-btn').addEventListener('click', startClassroomMode);

    // Back to portal button
    document.getElementById('back-to-portal').addEventListener('click', exitClassroomMode);

    // Projection mode toggle
    document.getElementById('toggle-projection').addEventListener('click', () => {
        document.body.classList.toggle('projection-mode');
        const isProjection = document.body.classList.contains('projection-mode');
        const btn = document.getElementById('toggle-projection');
        if (isProjection) {
            btn.innerHTML = `<i class="fa-solid fa-compress"></i> 標準模式`;
        } else {
            btn.innerHTML = `<i class="fa-solid fa-expand"></i> 投影模式`;
        }
    });

    // Timeline tab segment clicks
    document.querySelectorAll('.timeline-segment').forEach(seg => {
        seg.addEventListener('click', () => {
            const session = seg.dataset.session;
            switchSessionPanel(session);
        });
    });

    // Slide navigation
    document.getElementById('prev-slide').addEventListener('click', () => navigateSlide(-1));
    document.getElementById('next-slide').addEventListener('click', () => navigateSlide(1));

    // Modal action buttons
    document.getElementById('modal-retry-btn').addEventListener('click', () => {
        document.getElementById('game-over-modal').classList.remove('active');
        initPKGame();
    });
    document.getElementById('modal-exit-btn').addEventListener('click', () => {
        document.getElementById('game-over-modal').classList.remove('active');
        exitClassroomMode();
    });

    // Global keydown listener for Spelling Arena keyboard input
    window.addEventListener('keydown', (e) => {
        if (activeGameMode !== 'spelling') return;
        if (document.getElementById('game-over-modal').classList.contains('active')) return;
        
        const key = e.key;
        
        // Handle Backspace
        if (key === 'Backspace') {
            e.preventDefault();
            const backBtn = document.querySelector('.key-btn.backspace');
            if (backBtn) backBtn.click();
            return;
        }
        
        // Handle letters a-z / A-Z
        if (/^[a-zA-Z]$/.test(key)) {
            const lowerKey = key.toLowerCase();
            const keyBtns = document.querySelectorAll('.key-btn');
            let matchedBtn = null;
            for (let btn of keyBtns) {
                if (btn.innerText.toLowerCase() === lowerKey && !btn.classList.contains('backspace')) {
                    matchedBtn = btn;
                    break;
                }
            }
            if (matchedBtn) {
                matchedBtn.click();
            }
        }
    });
}

// Sound effects synthesizer
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    try {
        initAudio();
        if (!audioCtx) return;
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        const now = audioCtx.currentTime;
        
        if (type === 'correct') {
            // Ascending quick notification sound
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'wrong') {
            // Low buzz/descending sound
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.25);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'hit') {
            // Explosion sound effect
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'victory') {
            // Major chord arpeggio
            const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
            freqs.forEach((f, idx) => {
                const subOsc = audioCtx.createOscillator();
                const subGain = audioCtx.createGain();
                subOsc.connect(subGain);
                subGain.connect(audioCtx.destination);
                subOsc.type = 'triangle';
                subOsc.frequency.setValueAtTime(f, now + idx * 0.1);
                subGain.gain.setValueAtTime(0.08, now + idx * 0.1);
                subGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.4);
                subOsc.start(now + idx * 0.1);
                subOsc.stop(now + idx * 0.1 + 0.55);
            });
        }
    } catch (e) {
        console.warn('Audio synthesis failed:', e);
    }
}

// TTS Text-To-Speech reader
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop any ongoing speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        
        // Try to select an English voice if available
        const voices = window.speechSynthesis.getVoices();
        const enVoice = voices.find(voice => voice.lang.startsWith('en'));
        if (enVoice) utterance.voice = enVoice;
        
        window.speechSynthesis.speak(utterance);
    } else {
        alert('抱歉，您的瀏覽器不支援語音朗讀功能！');
    }
}

// Populate the book portal
function initializeBookSelector() {
    // Set default selected book
    document.querySelector('.book-card[data-book="1"]').click();
}

// Show lessons for selected book
function showLessonPanel(bookId) {
    const lessonPanel = document.getElementById('lesson-panel');
    const lessonGrid = document.getElementById('lesson-grid');
    lessonGrid.innerHTML = '';
    
    lessonPanel.classList.remove('hidden');
    
    const bookData = appData.books[bookId];
    document.getElementById('selected-title').innerText = `${bookData.title} - 課別列表`;
    
    // Create lesson items (1 to 9)
    for (let lNum = 1; lNum <= 9; lNum++) {
        const lesson = bookData.lessons[lNum];
        const titleText = lesson ? lesson.title : `Lesson ${lNum}`;
        const vocabCount = lesson ? lesson.vocabulary.length : 0;
        
        const card = document.createElement('div');
        card.className = 'lesson-item-card';
        card.dataset.lesson = lNum;
        
        card.innerHTML = `
            <span class="lesson-idx">LESSON 0${lNum}</span>
            <span class="lesson-title">${titleText}</span>
            <span class="sidebar-pos">${vocabCount}個單字</span>
        `;
        
        card.addEventListener('click', () => {
            document.querySelectorAll('.lesson-item-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentLesson = lNum;
            document.getElementById('start-class-btn').disabled = false;
        });
        
        lessonGrid.appendChild(card);
    }
}

// Start classroom mode
function startClassroomMode() {
    if (!currentBook || !currentLesson) return;
    
    // Init Audio Context (user interaction allows audio context to start)
    initAudio();
    
    const portal = document.getElementById('portal-screen');
    const classroom = document.getElementById('classroom-screen');
    
    portal.classList.remove('active');
    classroom.classList.add('active');
    
    // Set class detail headers
    const bookTitle = appData.books[currentBook].title;
    const lessonData = appData.books[currentBook].lessons[currentLesson];
    document.getElementById('class-title').innerText = `${bookTitle} • ${lessonData.title}`;
    document.getElementById('class-subtitle').innerText = currentType === 'vocabulary' ? '📖 單字精準加強課' : '🛠️ 精選句型文法課';
    
    // Set active game mode based on user select
    const selectedMode = document.getElementById('game-mode-select').value;
    selectedGameMode = selectedMode;
    if (selectedMode === 'auto') {
        // Randomly assign a game mode based on lesson number
        const modes = ['spelling', 'rapid', 'unscramble', 'boss'];
        activeGameMode = modes[(currentLesson + currentBook) % modes.length];
    } else {
        activeGameMode = selectedMode;
    }
    
    // Start countdown timer
    startClassTimer();
    
    // Initialize sessions
    initOverviewSession();
    initInstructionSession();
    
    // Go to first session: Overview
    switchSessionPanel('overview');
}

// Start Class Timer (50:00)
function startClassTimer() {
    clearInterval(classTimerInterval);
    secondsRemaining = 50 * 60; // 50 mins
    updateTimerDisplay();
    
    classTimerInterval = setInterval(() => {
        secondsRemaining--;
        updateTimerDisplay();
        
        // Auto period switching notifications
        if (secondsRemaining === 40 * 60) {
            alert('【提醒】第一階段「總覽複習」結束！現在進入第二階段「老師教學時間」(25分鐘)。');
            switchSessionPanel('instruction');
        } else if (secondsRemaining === 15 * 60) {
            alert('【提醒】第二階段「老師教學」結束！即刻進入第三階段「驗收 PK 遊戲」(15分鐘)！');
            switchSessionPanel('pk');
        }
        
        if (secondsRemaining <= 0) {
            clearInterval(classTimerInterval);
            alert('本堂英文總複習課程時間已完成，辛苦了！');
        }
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    document.getElementById('time-display').innerText = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Exit classroom mode
function exitClassroomMode() {
    clearInterval(classTimerInterval);
    clearInterval(gameState.gameInterval);
    clearTimeout(gameState.aiTimer);
    
    // Reset projection mode
    document.body.classList.remove('projection-mode');
    document.getElementById('toggle-projection').innerHTML = '<i class="fa-solid fa-expand"></i> 投影模式';
    
    const portal = document.getElementById('portal-screen');
    const classroom = document.getElementById('classroom-screen');
    
    classroom.classList.remove('active');
    portal.classList.add('active');
}

// Switching panel contents
function switchSessionPanel(sessionName) {
    // Set tabs active
    document.querySelectorAll('.timeline-segment').forEach(seg => {
        if (seg.dataset.session === sessionName) {
            seg.classList.add('active');
        } else {
            seg.classList.remove('active');
        }
    });
    
    // Hide/show panels
    document.querySelectorAll('.session-panel-content').forEach(panel => {
        panel.classList.remove('active');
    });
    
    const targetPanel = document.getElementById(`session-${sessionName}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }
    
    // If opening PK game panel, init the game
    if (sessionName === 'pk') {
        initPKGame();
    } else {
        // Clear active PK timers when moving away
        clearInterval(gameState.gameInterval);
        clearTimeout(gameState.aiTimer);
    }
}

// ==========================================
// SESSION 1: OVERVIEW COMPONENT
// ==========================================
function initOverviewSession() {
    const deck = document.getElementById('flashcard-deck');
    deck.innerHTML = '';
    
    const lessonData = appData.books[currentBook].lessons[currentLesson];
    
    if (currentType === 'vocabulary') {
        const words = lessonData.vocabulary;
        if (!words || words.length === 0) {
            deck.innerHTML = '<p class="slide-placeholder">本課暫無單字資料</p>';
            return;
        }
        
        words.forEach(w => {
            const cardContainer = document.createElement('div');
            cardContainer.className = 'flashcard-container';
            
            cardContainer.innerHTML = `
                <div class="flashcard">
                    <!-- Front -->
                    <div class="card-face front">
                        <div class="card-word">${w.word}</div>
                        <div class="card-pron">${w.pron ? w.pron : ''}</div>
                        <div class="card-flip-prompt">點擊卡片以翻轉</div>
                    </div>
                    <!-- Back -->
                    <div class="card-face back">
                        <div class="card-pos-chinese">
                            <span class="card-pos">${w.pos}</span>
                            <span class="card-chinese">${w.chinese}</span>
                        </div>
                        <p class="card-example">${w.example_en ? w.example_en : '暫無例句。'}</p>
                        <button class="audio-trigger-btn" title="英文語音發音"><i class="fa-solid fa-volume-high"></i></button>
                    </div>
                </div>
            `;
            
            const card = cardContainer.querySelector('.flashcard');
            const audioBtn = cardContainer.querySelector('.audio-trigger-btn');
            
            // Flip card on click
            cardContainer.addEventListener('click', (e) => {
                if (e.target.closest('.audio-trigger-btn')) return; // Avoid double trigger on audio button
                card.classList.toggle('flipped');
            });
            
            // TTS audio play trigger
            audioBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                speak(w.word);
            });
            
            deck.appendChild(cardContainer);
        });
    } else {
        // Grammar mode
        const grammars = lessonData.grammar;
        if (!grammars || grammars.length === 0) {
            deck.innerHTML = '<p class="slide-placeholder">本課暫無精選句型文法資料</p>';
            return;
        }
        
        grammars.forEach((g, index) => {
            const cardContainer = document.createElement('div');
            cardContainer.className = 'flashcard-container';
            
            cardContainer.innerHTML = `
                <div class="flashcard">
                    <!-- Front -->
                    <div class="card-face front">
                        <span class="badge" style="margin-bottom:10px;">Pattern 0${index + 1}</span>
                        <div class="card-word" style="font-size:1.1rem; word-break:break-word;">${g.formula}</div>
                        <div class="card-flip-prompt">點擊看文法解釋</div>
                    </div>
                    <!-- Back -->
                    <div class="card-face back" style="justify-content:flex-start; padding-top:15px;">
                        <span class="card-pos" style="font-size:0.9rem; margin-bottom:5px;">句型說明</span>
                        <p class="card-example" style="display:block; -webkit-line-clamp:unset; border:none; padding-top:0; font-size:0.8rem; overflow-y:auto;">
                            ${g.explanation}
                        </p>
                    </div>
                </div>
            `;
            
            cardContainer.addEventListener('click', () => {
                cardContainer.querySelector('.flashcard').classList.toggle('flipped');
            });
            
            deck.appendChild(cardContainer);
        });
    }
}

// ==========================================
// SESSION 2: TEACHING INSTRUCTION COMPONENT
// ==========================================
function initInstructionSession() {
    const listSidebar = document.getElementById('instruction-list');
    listSidebar.innerHTML = '';
    
    const lessonData = appData.books[currentBook].lessons[currentLesson];
    slideData = [];
    currentSlideIndex = 0;
    
    if (currentType === 'vocabulary') {
        slideData = lessonData.vocabulary;
        
        if (!slideData || slideData.length === 0) {
            listSidebar.innerHTML = '<p>暫無內容</p>';
            return;
        }
        
        slideData.forEach((w, idx) => {
            const item = document.createElement('div');
            item.className = `sidebar-item ${idx === 0 ? 'active' : ''}`;
            item.innerHTML = `
                <div class="sidebar-word">${w.word}</div>
                <div class="sidebar-pos">${w.pos}</div>
            `;
            item.addEventListener('click', () => {
                selectSlide(idx);
            });
            listSidebar.appendChild(item);
        });
    } else {
        slideData = lessonData.grammar;
        
        if (!slideData || slideData.length === 0) {
            listSidebar.innerHTML = '<p>暫無內容</p>';
            return;
        }
        
        slideData.forEach((g, idx) => {
            const item = document.createElement('div');
            item.className = `sidebar-item ${idx === 0 ? 'active' : ''}`;
            item.innerHTML = `
                <div class="sidebar-word" style="font-size:0.85rem; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:220px;">
                    ${g.formula}
                </div>
            `;
            item.addEventListener('click', () => {
                selectSlide(idx);
            });
            listSidebar.appendChild(item);
        });
    }
    
    updateSlideControls();
    renderSlideContent();
}

function selectSlide(idx) {
    currentSlideIndex = idx;
    
    // Update active sidebar item
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach((item, i) => {
        if (i === idx) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
    
    updateSlideControls();
    renderSlideContent();
}

function navigateSlide(dir) {
    const nextIdx = currentSlideIndex + dir;
    if (nextIdx >= 0 && nextIdx < slideData.length) {
        selectSlide(nextIdx);
    }
}

function updateSlideControls() {
    document.getElementById('prev-slide').disabled = currentSlideIndex === 0;
    document.getElementById('next-slide').disabled = currentSlideIndex === slideData.length - 1;
    
    document.getElementById('slide-progress-indicator').innerText = 
        slideData.length > 0 ? `${currentSlideIndex + 1} / ${slideData.length}` : '0 / 0';
}

function renderSlideContent() {
    const card = document.getElementById('slide-card');
    card.innerHTML = '';
    
    if (slideData.length === 0) {
        card.innerHTML = `
            <div class="slide-placeholder">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>本課程無教材內容。</p>
            </div>
        `;
        return;
    }
    
    const slide = slideData[currentSlideIndex];
    
    if (currentType === 'vocabulary') {
        // Highlight the vocabulary word in the example sentence
        let enExampleHtml = slide.example_en || '暫無英文例句。';
        if (slide.example_en) {
            const escWord = slide.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            // Try to match base word or inflected forms (-ed, -s, -ing, etc.)
            const matchRegex = new RegExp(`\\b(${escWord}[a-z]*)\\b`, 'gi');
            enExampleHtml = slide.example_en.replace(matchRegex, '<span class="highlight">$1</span>');
        }
        
        card.innerHTML = `
            <div class="slide-word-container">
                <div class="slide-word-header">
                    <span class="slide-word">${slide.word}</span>
                    <div class="slide-pron-row">
                        <span class="slide-pron">${slide.pron ? slide.pron : ''}</span>
                        <button class="audio-trigger-btn" id="slide-audio-play" style="position:static; display:inline-flex;" title="發音"><i class="fa-solid fa-volume-high"></i></button>
                    </div>
                    <span class="slide-pos-pill">${slide.pos}</span>
                </div>
                
                <div class="slide-def-box">
                    <div class="slide-label">中文釋義</div>
                    <div class="slide-chinese-def">${slide.chinese}</div>
                </div>
                
                <div class="slide-example-box">
                    <div class="slide-label">精選例句</div>
                    <p class="slide-example-en">${enExampleHtml}</p>
                    <button class="back-btn" id="slide-read-example" style="font-size:0.75rem; padding:6px 12px;"><i class="fa-solid fa-comment-dots"></i> 朗讀例句</button>
                </div>
            </div>
        `;
        
        // Listeners for slide buttons
        document.getElementById('slide-audio-play').addEventListener('click', () => speak(slide.word));
        document.getElementById('slide-read-example').addEventListener('click', () => {
            if (slide.example_en) speak(slide.example_en);
        });
    } else {
        // Grammar mode
        const examplesHtml = slide.examples.length > 0 
            ? slide.examples.map(ex => {
                let highlightedEx = ex.en;
                const highlightWords = ['that', 'which', 'who', 'whose', 'whom', 'where', 'when', 'why', 'how', 'because', 'so', 'if', 'surprised', 'worried', 'sure'];
                highlightWords.forEach(w => {
                    const r = new RegExp(`\\b(${w})\\b`, 'gi');
                    highlightedEx = highlightedEx.replace(r, '<span class="grammar-highlight">$1</span>');
                });
                return `
                    <div class="slide-example-item" style="margin-bottom: 12px;">
                        <div style="font-weight: 500;">${highlightedEx}</div>
                        <div style="font-size: 0.9rem; color: var(--color-text-muted); margin-top: 6px;">（${ex.ch}）</div>
                    </div>
                `;
            }).join('')
            : '<p>暫無句型例句。</p>';
            
        card.innerHTML = `
            <div class="slide-word-container" style="overflow-y: auto; max-height: 480px; padding-right:10px;">
                <div class="slide-formula">${slide.formula}</div>
                
                <div class="slide-def-box" style="margin-bottom:24px;">
                    <div class="slide-label">文法句型解析</div>
                    <p class="slide-explanation" style="line-height:1.7;">${slide.explanation || '在此複習中，老師重點講授上述文法結構之組合方式與句型意義。'}</p>
                </div>
                
                <div class="slide-def-box">
                    <div class="slide-label">經典對照例句</div>
                    <div class="slide-examples-list">${examplesHtml}</div>
                </div>
            </div>
        `;
    }
}

// ==========================================
// SESSION 3: ONLINE PK ARENA GAME SYSTEM
// ==========================================
function initPKGame() {
    clearInterval(gameState.gameInterval);
    clearTimeout(gameState.aiTimer);
    
    // Set dynamic game title/description
    const titles = {
        spelling: '✏️ Spelling Arena - 拼字對決',
        rapid: '⚡ Rapid-Fire Quiz - 快問快答',
        unscramble: '🧩 Sentence Unscramble - 卡牌重組',
        boss: '😈 Grammar Boss Fight - 語法大魔王'
    };
    
    const descs = {
        spelling: '看中文提示並播放發音，點擊虛擬鍵盤或按鍵盤拼出英文單字。打敗對手吧！',
        rapid: '時間有限！快速選擇最符合中文提示或語法結構的正確答案，連擊將獲得高傷害！',
        unscramble: '將下方散落的英文單字卡牌，點擊或拖放拼成與中文提示一致的正確句子！',
        boss: '魔王血量雄厚！快速回答單字或文法填空，並在時間條結束前輸入正確答案擊打魔王！'
    };
    
    document.getElementById('game-title').innerText = titles[activeGameMode];
    document.getElementById('game-desc').innerText = descs[activeGameMode];
    
    // Reset fighter bars
    gameState.playerHP = 100;
    gameState.enemyHP = 100;
    gameState.playerScore = 0;
    gameState.enemyScore = 0;
    gameState.combo = 0;
    gameState.maxCombo = 0;
    gameState.questionsAttempted = 0;
    gameState.questionsCorrect = 0;
    
    updateFighterUI();
    
    // Run the corresponding game module
    const viewport = document.getElementById('game-viewport');
    viewport.innerHTML = '';
    
    loadNextQuestion();
    
    // Start AI Opponent simulation timer
    // AI makes a move every 7-10 seconds
    simAIAction();
}

function updateFighterUI() {
    document.getElementById('player-hp').style.width = `${gameState.playerHP}%`;
    document.getElementById('player-hp-text').innerText = `${gameState.playerHP} / 100`;
    document.getElementById('player-score').innerText = gameState.playerScore;
    
    document.getElementById('enemy-hp').style.width = `${gameState.enemyHP}%`;
    document.getElementById('enemy-hp-text').innerText = `${gameState.enemyHP} / 100`;
    document.getElementById('enemy-score').innerText = gameState.enemyScore;
    
    const comboDisplay = document.getElementById('combo-display');
    if (gameState.combo > 0) {
        comboDisplay.innerText = `Combo ${gameState.combo}`;
        comboDisplay.classList.add('show');
    } else {
        comboDisplay.classList.remove('show');
    }
}

// AI action simulation logic
function simAIAction() {
    clearTimeout(gameState.aiTimer);
    if (gameState.playerHP <= 0 || gameState.enemyHP <= 0) return;
    
    // AI moves in 6-9 seconds
    const interval = 6000 + Math.random() * 3000;
    
    gameState.aiTimer = setTimeout(() => {
        if (gameState.playerHP <= 0 || gameState.enemyHP <= 0) return;
        
        // AI has 60% chance to answer correctly and attack
        const isCorrect = Math.random() < 0.65;
        
        if (isCorrect) {
            // AI hits player
            const damage = 5 + Math.floor(Math.random() * 6); // 5-10 damage
            gameState.playerHP = Math.max(0, gameState.playerHP - damage);
            gameState.enemyScore += 150;
            
            // UI Hit effects on Player side
            triggerHitEffect('player');
            playSound('hit');
            
            // Message log
            document.getElementById('game-desc').innerText = `【警告】AI 對手答對問題，對你造成 ${damage} 點傷害！`;
            updateFighterUI();
            
            checkGameStatus();
        } else {
            document.getElementById('game-desc').innerText = `【回報】AI 對手答錯了，你躲過了一次攻擊！`;
        }
        
        // Loop AI action
        simAIAction();
    }, interval);
}

// trigger visual shake and red blink on hit
function triggerHitEffect(target) {
    const card = document.querySelector(`.fighter.${target}`);
    card.classList.add('hit');
    setTimeout(() => card.classList.remove('hit'), 400);
}

// Load next interactive problem
function loadNextQuestion() {
    if (gameState.playerHP <= 0 || gameState.enemyHP <= 0) return;
    
    const lessonData = appData.books[currentBook].lessons[currentLesson];
    const viewport = document.getElementById('game-viewport');
    viewport.innerHTML = '';
    
    if (activeGameMode === 'spelling') {
        const words = lessonData.vocabulary;
        if (!words || words.length === 0) {
            viewport.innerHTML = '<p class="slide-placeholder">本課無單字可進行拼字 PK</p>';
            return;
        }
        
        const qWordObj = words[Math.floor(Math.random() * words.length)];
        gameState.currentQuestion = {
            answer: qWordObj.word.toLowerCase().replace(/[^a-z]/g, ''), // clean spelling string
            displayAnswer: qWordObj.word,
            hint: qWordObj.chinese,
            obj: qWordObj
        };
        
        renderSpellingArena();
        speak(qWordObj.word); // auto play pronunciation
    } else if (activeGameMode === 'rapid') {
        // Load multiple choice question
        const words = lessonData.vocabulary;
        const qWordObj = words[Math.floor(Math.random() * words.length)];
        
        // Generate options (1 correct, 3 distractor)
        const options = [qWordObj.chinese];
        while (options.length < 4 && words.length >= 4) {
            const randomChinese = words[Math.floor(Math.random() * words.length)].chinese;
            if (!options.includes(randomChinese)) {
                options.push(randomChinese);
            }
        }
        // Shuffle options
        options.sort(() => Math.random() - 0.5);
        
        gameState.currentQuestion = {
            questionText: `哪一個是單字 "${qWordObj.word}" 的正確中文意思？`,
            options: options,
            correctIndex: options.indexOf(qWordObj.chinese),
            wordObj: qWordObj
        };
        
        renderRapidFireQuiz();
    } else if (activeGameMode === 'unscramble') {
        // Sentence unscramble
        const items = currentType === 'vocabulary' 
            ? lessonData.vocabulary.filter(w => w.example_en && w.example_en.length > 20)
            : lessonData.grammar.flatMap(g => g.examples.map(ex => ({ example_en: ex.en, chinese: ex.ch })));
            
        if (items.length === 0) {
            viewport.innerHTML = '<p class="slide-placeholder">暫無例句進行重組挑戰，請先閱讀課程例句</p>';
            return;
        }
        
                const qItem = items[Math.floor(Math.random() * items.length)];
        
        // Helper to split a sentence into chunks of words (2-3 words per card)
        const splitIntoChunks = (sentence) => {
            const cleanSentence = sentence.replace(/[\.\,\?\!\;\:\-\—]/g, '').trim();
            const wordsList = cleanSentence.split(/\s+/);
            const N = wordsList.length;
            
            let numChunks = 3;
            if (N <= 5) {
                numChunks = 2;
            } else if (N <= 8) {
                numChunks = 3;
            } else if (N <= 12) {
                numChunks = 4;
            } else if (N <= 16) {
                numChunks = 5;
            } else {
                numChunks = 6;
            }
            
            const chunks = [];
            const wordsPerChunk = Math.floor(N / numChunks);
            let extraWords = N % numChunks;
            
            let currentIndex = 0;
            for (let i = 0; i < numChunks; i++) {
                let chunkSize = wordsPerChunk + (extraWords > 0 ? 1 : 0);
                extraWords--;
                
                const chunkWords = wordsList.slice(currentIndex, currentIndex + chunkSize);
                if (chunkWords.length > 0) {
                    chunks.push(chunkWords.join(' '));
                }
                currentIndex += chunkSize;
            }
            return chunks;
        };

        const words = splitIntoChunks(qItem.example_en);
        
        gameState.currentQuestion = {
            chineseHint: qItem.chinese || '請依照語法重組句子：',
            sentence: qItem.example_en,
            words: words,
            originalWords: [...words]
        };
        
        renderUnscrambleGame();
    } else if (activeGameMode === 'boss') {
        // Boss fight grammar multiple-choice quiz
        const lessonData = appData.books[currentBook].lessons[currentLesson];
        
        // 1. Prefer real exam questions parsed from the quiz documents
        if (lessonData.quiz && lessonData.quiz.length > 0) {
            const qItem = lessonData.quiz[Math.floor(Math.random() * lessonData.quiz.length)];
            
            gameState.currentQuestion = {
                questionText: `【隨堂複習考選擇題】\n\n"${qItem.question}"`,
                options: qItem.options,
                correctIndex: qItem.correctIndex,
                explanation: qItem.explanation
            };
            
            renderBossFight();
        } else {
            // 2. Fallback to dynamic grammar question generation from lesson examples
            const grammars = lessonData.grammar;
            if (!grammars || grammars.length === 0) {
                viewport.innerHTML = '<p class="slide-placeholder">本課無文法句型資料，魔王感到無趣並離去！</p>';
                return;
            }
            
            let qGrammar = null;
            let qData = null;
            const shuffledGrammars = [...grammars].sort(() => Math.random() - 0.5);
            for (let g of shuffledGrammars) {
                qData = generateGrammarQuestion(g);
                if (qData) {
                    qGrammar = g;
                    break;
                }
            }
            
            if (!qData) {
                viewport.innerHTML = '<p class="slide-placeholder">暫無適合的例句進行魔王戰，請確認文法資料</p>';
                return;
            }
            
            gameState.currentQuestion = {
                questionText: `【課文句型：${qGrammar.formula}】\n\n中文意旨：${qData.chinese}\n\n"${qData.questionText}"`,
                options: qData.options,
                correctIndex: qData.options.indexOf(qData.target),
                explanation: qGrammar.explanation
            };
            
            renderBossFight();
        }
    }
}

// Helper to dynamically generate rich grammar multiple-choice questions from data
function generateGrammarQuestion(qGrammar) {
    const examples = qGrammar.examples;
    if (!examples || examples.length === 0) return null;
    
    // Pick a random example
    const exObj = examples[Math.floor(Math.random() * examples.length)];
    const sentence = exObj.en;
    const chinese = exObj.ch;
    const formula = qGrammar.formula.toLowerCase().trim();
    
    let target = '';
    let options = [];
    let questionText = '';
    
    // Helper to clean punctuation
    const cleanWord = (w) => w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"“‘]/g, "").trim();

    // 1. Try to find the exact formula words in the sentence (case-insensitive)
    if (!formula.includes('+') && !formula.includes('/') && formula.length > 3) {
        const idx = sentence.toLowerCase().indexOf(formula);
        if (idx !== -1) {
            target = sentence.substring(idx, idx + formula.length);
            questionText = sentence.substring(0, idx) + '_______' + sentence.substring(idx + formula.length);
            
            // Generate options based on common phrase fillers
            options = [target];
            const fillers = ['again and again', 'over and over', 'for the last time', 'for the first time', 'once in a while', 'so far', 'up to now', 'by the way', 'as a result'];
            fillers.forEach(f => {
                if (options.length < 4 && f.toLowerCase() !== target.toLowerCase()) {
                    options.push(f);
                }
            });
            // Shuffle
            options.sort(() => Math.random() - 0.5);
            return { questionText, options, target, chinese };
        }
    }
    
    // 2. Try to find a V-ing word in the sentence if the formula mentions "V-ing"
    if (formula.includes('v-ing') || formula.includes('ing')) {
        const words = sentence.split(/\s+/);
        for (let w of words) {
            const cleaned = cleanWord(w);
            if (cleaned.toLowerCase().endsWith('ing') && cleaned.length > 4 && !['thing', 'during', 'morning', 'evening', 'nothing', 'something', 'spring', 'king', 'sing', 'ring'].includes(cleaned.toLowerCase())) {
                target = cleaned;
                let base = target.substring(0, target.length - 3);
                if (target.toLowerCase() === 'planning') base = 'plan';
                else if (target.toLowerCase() === 'getting') base = 'get';
                else if (target.toLowerCase() === 'making') base = 'make';
                else if (target.toLowerCase() === 'taking') base = 'take';
                else if (target.toLowerCase() === 'having') base = 'have';
                else if (target.toLowerCase() === 'leaving') base = 'leave';
                
                questionText = sentence.replace(new RegExp(`\\b${target}\\b`), '_______');
                options = [
                    target,
                    'to ' + base,
                    base,
                    base.endsWith('e') ? base.slice(0, -1) + 'ed' : base + 'ed'
                ];
                options.sort(() => Math.random() - 0.5);
                return { questionText, options, target, chinese };
            }
        }
    }
    
    // 3. Try to find prepositions matching preposition formulas
    const preps = ['of', 'on', 'with', 'at', 'for', 'to', 'in', 'about', 'by', 'from'];
    for (let prep of preps) {
        if (formula.includes(prep)) {
            const idx = sentence.toLowerCase().indexOf(' ' + prep + ' ');
            if (idx !== -1) {
                target = prep;
                questionText = sentence.replace(new RegExp(`\\b${prep}\\b`, 'i'), '_______');
                options = [prep];
                preps.forEach(p => {
                    if (options.length < 4 && p !== prep) {
                        options.push(p);
                    }
                });
                options.sort(() => Math.random() - 0.5);
                return { questionText, options, target, chinese };
            }
        }
    }
    
    // 4. Try to find relative pronouns/conjunctions
    const connectors = ['that', 'which', 'who', 'whose', 'whom', 'where', 'when', 'why', 'how', 'because', 'although', 'if', 'since', 'so'];
    for (let conn of connectors) {
        const idx = sentence.toLowerCase().indexOf(' ' + conn + ' ');
        if (idx !== -1) {
            target = conn;
            questionText = sentence.replace(new RegExp(`\\b${conn}\\b`, 'i'), '_______');
            options = [conn];
            connectors.forEach(c => {
                if (options.length < 4 && c !== conn) {
                    options.push(c);
                }
            });
            options.sort(() => Math.random() - 0.5);
            return { questionText, options, target, chinese };
        }
    }
    
    // 5. Fallback: Blank out the first word in the sentence that is a preposition or connector
    const fallbackWords = [...connectors, ...preps];
    for (let w of fallbackWords) {
        const r = new RegExp(`\\b${w}\\b`, 'i');
        if (r.test(sentence)) {
            target = sentence.match(r)[0];
            questionText = sentence.replace(r, '_______');
            const lowerTarget = target.toLowerCase();
            options = [lowerTarget];
            const pool = preps.includes(lowerTarget) ? preps : connectors;
            pool.forEach(p => {
                if (options.length < 4 && p !== lowerTarget) {
                    options.push(p);
                }
            });
            options.sort(() => Math.random() - 0.5);
            return { questionText, options, target, chinese };
        }
    }
    
    // 6. Absolute fallback: Blank out the first word longer than 4 characters
    const words = sentence.split(/\s+/);
    for (let w of words) {
        const cleaned = cleanWord(w);
        if (cleaned.length > 4) {
            target = cleaned;
            questionText = sentence.replace(new RegExp(`\\b${target}\\b`), '_______');
            options = [
                target,
                target + 's',
                'to ' + target,
                target.endsWith('e') ? target.slice(0, -1) + 'ed' : target + 'ed'
            ];
            options.sort(() => Math.random() - 0.5);
            return { questionText, options, target, chinese };
        }
    }
    
    return null;
}

// ----------------------------------------
// Game Renderer 1: Spelling Arena
// ----------------------------------------
function renderSpellingArena() {
    const viewport = document.getElementById('game-viewport');
    
    const layout = document.createElement('div');
    layout.className = 'spelling-layout';
    
    const q = gameState.currentQuestion;
    
    layout.innerHTML = `
        <div class="spell-hint-row">
            <span class="spell-hint-chinese">${q.hint}</span>
            <button class="back-btn" id="play-sound-btn" style="padding: 6px 12px;"><i class="fa-solid fa-volume-high"></i></button>
        </div>
        
        <div class="spell-input-boxes" id="spell-boxes">
            <!-- Boxes populated below -->
        </div>
        
        <div class="spell-keyboard" id="spell-keyboard">
            <!-- Keys populated below -->
        </div>
    `;
    
    viewport.appendChild(layout);
    
    document.getElementById('play-sound-btn').addEventListener('click', () => speak(q.obj.word));
    
    const boxesContainer = document.getElementById('spell-boxes');
    const lettersInput = [];
    
    // Create spell boxes (blanks)
    for (let i = 0; i < q.answer.length; i++) {
        const box = document.createElement('div');
        box.className = 'spell-box';
        boxesContainer.appendChild(box);
        lettersInput.push('');
    }
    
    const keyboardContainer = document.getElementById('spell-keyboard');
    // Generate letter choices including correct letters + some random letters
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const keys = new Set(q.answer.split(''));
    while (keys.size < 12) {
        keys.add(alphabet[Math.floor(Math.random() * alphabet.length)]);
    }
    
    const keysArray = Array.from(keys).sort();
    
    keysArray.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'key-btn';
        btn.innerText = k;
        
        btn.addEventListener('click', () => {
            // Find first empty spell box
            const emptyIdx = lettersInput.indexOf('');
            if (emptyIdx !== -1) {
                lettersInput[emptyIdx] = k;
                
                const boxes = document.querySelectorAll('.spell-box');
                boxes[emptyIdx].innerText = k;
                boxes[emptyIdx].classList.add('filled');
                
                // If spelling is complete, check answer
                if (lettersInput.indexOf('') === -1) {
                    checkSpellingAnswer(lettersInput.join(''));
                }
            }
        });
        
        keyboardContainer.appendChild(btn);
    });
    
    // Add Backspace key
    const backBtn = document.createElement('button');
    backBtn.className = 'key-btn backspace';
    backBtn.innerHTML = '<i class="fa-solid fa-delete-left"></i>';
    backBtn.addEventListener('click', () => {
        // Find last filled box
        let lastFilledIdx = -1;
        for (let i = lettersInput.length - 1; i >= 0; i--) {
            if (lettersInput[i] !== '') {
                lastFilledIdx = i;
                break;
            }
        }
        
        if (lastFilledIdx !== -1) {
            lettersInput[lastFilledIdx] = '';
            
            const boxes = document.querySelectorAll('.spell-box');
            boxes[lastFilledIdx].innerText = '';
            boxes[lastFilledIdx].classList.remove('filled');
        }
    });
    keyboardContainer.appendChild(backBtn);
}

function checkSpellingAnswer(guess) {
    gameState.questionsAttempted++;
    const q = gameState.currentQuestion;
    const isCorrect = guess === q.answer;
    
    const boxes = document.querySelectorAll('.spell-box');
    
    if (isCorrect) {
        gameState.questionsCorrect++;
        gameState.combo++;
        gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
        
        // Attack Enemy
        const baseDmg = 12;
        const comboBonus = Math.floor(gameState.combo / 3) * 3;
        const damage = baseDmg + comboBonus;
        gameState.enemyHP = Math.max(0, gameState.enemyHP - damage);
        gameState.playerScore += 100 * gameState.combo;
        
        // Visual Correct feedbacks
        boxes.forEach(b => b.classList.add('correct'));
        triggerHitEffect('opponent');
        playSound('correct');
        playSound('hit');
        
        document.getElementById('game-desc').innerText = `【太強了】拼字正確！對 AI 造成 ${damage} 點傷害！`;
    } else {
        gameState.combo = 0;
        
        // AI Counter attacks
        const damage = 8;
        gameState.playerHP = Math.max(0, gameState.playerHP - damage);
        
        // Visual Wrong feedbacks
        boxes.forEach(b => b.classList.add('wrong'));
        triggerHitEffect('player');
        playSound('wrong');
        
        document.getElementById('game-desc').innerText = `【可惜】拼錯了！正確拼寫是 "${q.displayAnswer}"。AI 對手反擊造成 ${damage} 點傷害！`;
    }
    
    updateFighterUI();
    
    // Wait 2 seconds and load next
    setTimeout(() => {
        checkGameStatus();
        loadNextQuestion();
    }, 2000);
}

// ----------------------------------------
// Game Renderer 2: Rapid Fire Quiz
// ----------------------------------------
function renderRapidFireQuiz() {
    const viewport = document.getElementById('game-viewport');
    const q = gameState.currentQuestion;
    
    const layout = document.createElement('div');
    layout.className = 'quiz-layout';
    
    layout.innerHTML = `
        <div class="quiz-question-box">${q.questionText}</div>
        <div class="quiz-options-grid" id="quiz-options">
            <!-- Options populated below -->
        </div>
    `;
    
    viewport.appendChild(layout);
    
    const optionsContainer = document.getElementById('quiz-options');
    const labels = ['A', 'B', 'C', 'D'];
    
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `
            <span class="option-marker">${labels[idx]}</span>
            <span>${opt}</span>
        `;
        
        btn.addEventListener('click', () => {
            // Disable all option buttons
            document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
            checkQuizAnswer(idx, btn);
        });
        
        optionsContainer.appendChild(btn);
    });
}

function checkQuizAnswer(selectedIdx, btnElement) {
    gameState.questionsAttempted++;
    const q = gameState.currentQuestion;
    const isCorrect = selectedIdx === q.correctIndex;
    
    if (isCorrect) {
        gameState.questionsCorrect++;
        gameState.combo++;
        gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
        
        // Attack
        const damage = 10 + gameState.combo * 2;
        gameState.enemyHP = Math.max(0, gameState.enemyHP - damage);
        gameState.playerScore += 100 * gameState.combo;
        
        btnElement.classList.add('correct');
        triggerHitEffect('opponent');
        playSound('correct');
        playSound('hit');
        
        document.getElementById('game-desc').innerText = `【答對】太棒了！造成 ${damage} 點連擊傷害！`;
    } else {
        gameState.combo = 0;
        
        // AI Attacks
        const damage = 10;
        gameState.playerHP = Math.max(0, gameState.playerHP - damage);
        
        btnElement.classList.add('wrong');
        // Show correct button
        const btns = document.querySelectorAll('.option-btn');
        btns[q.correctIndex].classList.add('correct');
        
        triggerHitEffect('player');
        playSound('wrong');
        
        document.getElementById('game-desc').innerText = `【答錯】回答有誤！AI 對手施法對你造成 ${damage} 點傷害！`;
    }
    
    updateFighterUI();
    
    setTimeout(() => {
        checkGameStatus();
        loadNextQuestion();
    }, 1800);
}

// ----------------------------------------
// Game Renderer 3: Sentence Unscramble
// ----------------------------------------
function renderUnscrambleGame() {
    const viewport = document.getElementById('game-viewport');
    const q = gameState.currentQuestion;
    
    const layout = document.createElement('div');
    layout.className = 'unscramble-layout';
    
    layout.innerHTML = `
        <div class="unscramble-chinese">${q.chineseHint}</div>
        <div class="unscramble-workspace" id="unscramble-workspace"></div>
        <div class="unscramble-source" id="unscramble-source"></div>
        <div class="unscramble-actions">
            <button class="unscramble-btn" id="unscramble-clear-btn"><i class="fa-solid fa-arrow-rotate-left"></i> 清空</button>
            <button class="unscramble-btn submit-btn" id="unscramble-submit-btn">送出答案 <i class="fa-solid fa-paper-plane"></i></button>
        </div>
    `;
    
    viewport.appendChild(layout);
    
    const workspace = document.getElementById('unscramble-workspace');
    const sourceContainer = document.getElementById('unscramble-source');
    
    let constructedWords = [];
    
    // Render source cards in randomized order
    const shuffledWords = [...q.words].sort(() => Math.random() - 0.5);
    
    shuffledWords.forEach((word, idx) => {
        const card = document.createElement('div');
        card.className = 'word-card-block';
        card.innerText = word;
        card.dataset.index = idx;
        
        card.addEventListener('click', () => {
            if (card.classList.contains('source-selected')) return;
            
            // Add to workspace
            constructedWords.push(word);
            card.classList.add('source-selected');
            
            // Render on workspace
            const workspaceCard = document.createElement('div');
            workspaceCard.className = 'word-card-block';
            workspaceCard.innerText = word;
            
            // Click workspace card to remove it
            workspaceCard.addEventListener('click', () => {
                // Remove word
                const wordIdx = constructedWords.indexOf(word);
                if (wordIdx !== -1) {
                    constructedWords.splice(wordIdx, 1);
                }
                workspaceCard.remove();
                card.classList.remove('source-selected');
            });
            
            workspace.appendChild(workspaceCard);
        });
        
        sourceContainer.appendChild(card);
    });
    
    // Clear btn
    document.getElementById('unscramble-clear-btn').addEventListener('click', () => {
        workspace.innerHTML = '';
        constructedWords = [];
        document.querySelectorAll('.word-card-block').forEach(c => c.classList.remove('source-selected'));
    });
    
    // Submit btn
    document.getElementById('unscramble-submit-btn').addEventListener('click', () => {
        checkUnscrambleAnswer(constructedWords);
    });
}

function checkUnscrambleAnswer(constructedArray) {
    gameState.questionsAttempted++;
    const q = gameState.currentQuestion;
    
    // Compare string array
    const guessString = constructedArray.join(' ').toLowerCase();
    const correctString = q.words.join(' ').toLowerCase();
    
    const isCorrect = guessString === correctString;
    
    if (isCorrect) {
        gameState.questionsCorrect++;
        gameState.combo++;
        gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
        
        const damage = 15 + gameState.combo * 3; // high damage for sentence restructuring
        gameState.enemyHP = Math.max(0, gameState.enemyHP - damage);
        gameState.playerScore += 150 * gameState.combo;
        
        triggerHitEffect('opponent');
        playSound('correct');
        playSound('hit');
        
        document.getElementById('game-desc').innerText = `【重組正確】完美重組！造成大絕招 ${damage} 點傷害！`;
    } else {
        gameState.combo = 0;
        
        const damage = 12;
        gameState.playerHP = Math.max(0, gameState.playerHP - damage);
        
        triggerHitEffect('player');
        playSound('wrong');
        
        document.getElementById('game-desc').innerText = `【重組錯誤】順序有誤！正確為: "${q.sentence}"。AI 回擊造成 ${damage} 點傷害！`;
    }
    
    updateFighterUI();
    
    setTimeout(() => {
        checkGameStatus();
        loadNextQuestion();
    }, 2500);
}

// ----------------------------------------
// Game Renderer 4: Grammar Boss Fight
// ----------------------------------------
function renderBossFight() {
    const viewport = document.getElementById('game-viewport');
    const q = gameState.currentQuestion;
    
    const layout = document.createElement('div');
    layout.className = 'boss-layout';
    
    layout.innerHTML = `
        <div class="boss-character">
            <div class="boss-art">😈</div>
            <div class="boss-hp-bar">
                <div class="boss-hp-fill" id="boss-visual-hp" style="width: 100%;"></div>
            </div>
            <span class="badge" style="background:var(--danger)">魔王 BOSS</span>
        </div>
        
        <div class="quiz-question-box" style="white-space: pre-line;">${q.questionText}</div>
        <div class="quiz-options-grid" id="boss-options" style="width:100%;">
            <!-- Options populated below -->
        </div>
    `;
    
    viewport.appendChild(layout);
    
    // Synced Boss HP bar to AI HP
    document.getElementById('boss-visual-hp').style.width = `${gameState.enemyHP}%`;
    
    const optionsContainer = document.getElementById('boss-options');
    const labels = ['A', 'B', 'C', 'D'];
    
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `
            <span class="option-marker">${labels[idx]}</span>
            <span>${opt}</span>
        `;
        
        btn.addEventListener('click', () => {
            document.querySelectorAll('#boss-options .option-btn').forEach(b => b.disabled = true);
            checkBossAnswer(idx, btn);
        });
        
        optionsContainer.appendChild(btn);
    });
}

function checkBossAnswer(selectedIdx, btnElement) {
    gameState.questionsAttempted++;
    const q = gameState.currentQuestion;
    const isCorrect = selectedIdx === q.correctIndex;
    
    if (isCorrect) {
        gameState.questionsCorrect++;
        gameState.combo++;
        gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
        
        // Attack Boss
        const damage = 20 + gameState.combo * 4;
        gameState.enemyHP = Math.max(0, gameState.enemyHP - damage);
        gameState.playerScore += 200 * gameState.combo;
        
        btnElement.classList.add('correct');
        // Visual effect on Boss character
        document.querySelector('.boss-art').style.animation = 'shakeFighter 0.3s ease';
        setTimeout(() => document.querySelector('.boss-art').style.animation = 'floatBoss 3s infinite alternate ease-in-out', 400);
        
        triggerHitEffect('opponent');
        playSound('correct');
        playSound('hit');
        
        document.getElementById('game-desc').innerText = `【直擊魔王】回答正確！暴擊魔王 ${damage} 點血量！`;
    } else {
        gameState.combo = 0;
        
        // Boss counter attack
        const damage = 15;
        gameState.playerHP = Math.max(0, gameState.playerHP - damage);
        
        btnElement.classList.add('wrong');
        const btns = document.querySelectorAll('#boss-options .option-btn');
        btns[q.correctIndex].classList.add('correct');
        
        triggerHitEffect('player');
        playSound('wrong');
        
        document.getElementById('game-desc').innerText = `【魔王反撲】答錯了！魔王噴射火焰造成 ${damage} 點致命傷害！ (公式提示: ${q.explanation})`;
    }
    
    updateFighterUI();
    
    // Sync Boss visual HP fill
    const bossHpFill = document.getElementById('boss-visual-hp');
    if (bossHpFill) {
        bossHpFill.style.width = `${gameState.enemyHP}%`;
    }
    
    setTimeout(() => {
        checkGameStatus();
        loadNextQuestion();
    }, 2200);
}

// ----------------------------------------
// Game Over Check
// ----------------------------------------
function checkGameStatus() {
    if (gameState.playerHP <= 0 || gameState.enemyHP <= 0) {
        clearInterval(gameState.gameInterval);
        clearTimeout(gameState.aiTimer);
        
        const isWin = gameState.enemyHP <= 0;
        
        const modal = document.getElementById('game-over-modal');
        const animContainer = document.getElementById('result-animation');
        const title = document.getElementById('result-title');
        const desc = document.getElementById('result-desc');
        
        if (isWin) {
            animContainer.innerHTML = '<i class="fa-solid fa-trophy winner-icon" style="color:var(--warning)"></i>';
            title.innerText = '挑戰成功！';
            title.style.color = 'var(--primary)';
            desc.innerText = '恭喜！你成功在 PK 競技場中擊敗了 AI 對手，完成了今天的英文總複習關卡！';
            playSound('victory');
        } else {
            animContainer.innerHTML = '<i class="fa-solid fa-circle-xmark loser-icon" style="color:var(--danger)"></i>';
            title.innerText = '挑戰失敗...';
            title.style.color = 'var(--danger)';
            desc.innerText = '可惜！你的血量被扣減至 0，被 AI 對手擊敗了。多加複習前面的單字與句型，再嘗試挑戰一次吧！';
            playSound('wrong');
        }
        
        // Calculate statistics
        const accuracy = gameState.questionsAttempted > 0 
            ? Math.round((gameState.questionsCorrect / gameState.questionsAttempted) * 100)
            : 0;
            
        document.getElementById('stat-score').innerText = gameState.playerScore;
        document.getElementById('stat-combo').innerText = gameState.maxCombo;
        document.getElementById('stat-accuracy').innerText = `${accuracy}%`;
        
        // Save progress to LocalStorage
        saveProgress(isWin);
        
        modal.classList.add('active');
    }
}

// Save student progress to LocalStorage
function saveProgress(isWin) {
    try {
        const key = `longteng_review_progress`;
        let progress = JSON.parse(localStorage.getItem(key)) || {};
        
        if (!progress[currentBook]) {
            progress[currentBook] = {};
        }
        if (!progress[currentBook][currentLesson]) {
            progress[currentBook][currentLesson] = {};
        }
        
        // Mark topic completed
        progress[currentBook][currentLesson][currentType] = {
            completed: true,
            score: Math.max(progress[currentBook][currentLesson][currentType]?.score || 0, gameState.playerScore),
            win: isWin || progress[currentBook][currentLesson][currentType]?.win || false
        };
        
        localStorage.setItem(key, JSON.stringify(progress));
    } catch (e) {
        console.warn('Failed to save progress to LocalStorage:', e);
    }
}
