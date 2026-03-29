const API = '/api';
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');
const name = localStorage.getItem('name');
let trendChart, gradeChart, radarChart;
let currentQuiz = null;
let currentQuestionIndex = 0;
let answers = {};
let timerInterval = null;
let timeLeft = 0;
let myResults = [];
let isQuizActive = false;
let violationCount = 0;

if (!token || role !== 'student') window.location.href = 'index.html';
document.getElementById('sidebar-name').textContent = name || 'Student';

const HEADERS = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

function showSection(section) {
    if (isQuizActive) {
        showToast('Finish the quiz before switching tabs!', 'error');
        return;
    }
    ['quizzes', 'results', 'analysis', 'profile'].forEach(s => {
        const el = document.getElementById(`section-${s}`);
        const nav = document.getElementById(`nav-${s}`);
        if(el) el.style.display = s === section ? 'block' : 'none';
        if(nav) nav.classList.toggle('active', s === section);
    });
    if (section === 'quizzes')  loadQuizzes();
    if (section === 'results')  loadResults();
    if (section === 'analysis') loadAnalysis();
    if (section === 'profile') {
        loadProfile();
        const qcEl = document.getElementById('profile-quiz-count');
        if (qcEl) qcEl.textContent = myResults.length || localStorage.getItem('quizCount') || '—';
    }
}

function logout() { localStorage.clear(); window.location.href = 'index.html'; }

function showToast(msg, type = 'success') {
    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = icons[type] + msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ========== QUIZ LIST ==========
async function loadQuizzes() {
    const grid = document.getElementById('quizzes-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="page-loader"><div class="loader-ring"></div></div>';
    try {
        const res = await fetch(`${API}/student/quizzes`, { headers: HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (!data.length) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 14l9-5-9-5-9 5 9 5z"/></svg>
                <h3>No quizzes available</h3>
                <p>Check back later — your faculty hasn't uploaded any quizzes yet</p>
            </div>`;
            return;
        }

        grid.innerHTML = data.map(q => {
            const attempted = q.already_attempted;
            return `<div class="quiz-card ${attempted ? 'attempted' : ''}" id="quiz-card-${q._id}">
                <div class="quiz-card-badge">
                    <span class="badge badge-primary">${q.subject}</span>
                    ${attempted ? '<span class="badge badge-success">✓ Completed</span>' : '<span class="badge badge-secondary">New</span>'}
                </div>
                <div class="quiz-card-title">${q.title}</div>
                <div class="quiz-card-subject">Uploaded by Faculty</div>
                <div class="quiz-card-meta">
                    <div class="quiz-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg>
                        ${q.total_questions} Questions
                    </div>
                    <div class="quiz-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${q.time_limit} min
                    </div>
                </div>
                ${attempted
                    ? `<button class="btn btn-outline quiz-card-btn" onclick="viewQuizResult('${q._id}')">View My Result</button>`
                    : `<button class="btn btn-primary quiz-card-btn" onclick="startQuiz('${q._id}')">Start Quiz →</button>`
                }
            </div>`;
        }).join('');
    } catch (err) {
        showToast(err.message, 'error');
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Error loading quizzes</h3></div>';
    }
}

async function viewQuizResult(quizId) {
    const modal = document.getElementById('quiz-modal');
    document.getElementById('quiz-overlay').classList.add('active');
    modal.innerHTML = `<div class="page-loader" style="min-height:300px;"><div class="loader-ring"></div></div>`;

    try {
        const res = await fetch(`${API}/student/results/${quizId}`, { headers: HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showResultModal(data);
    } catch (err) {
        showToast(err.message, 'error');
        closeQuizModal();
    }
}

// ========== AI PROCTORING INTEGRATION ==========

let proctorInitialized = false;

async function initProctoring() {
    if (proctorInitialized) return;
    const ok = await Proctor.init();
    if (ok) proctorInitialized = true;
}

initProctoring();

async function startQuiz(quizId) {
    if (!proctorInitialized) {
        showToast("Proctoring system is initializing. Please wait...", "info");
        await initProctoring();
    }

    try {
        const meRes = await fetch(`${API}/auth/me`, { headers: HEADERS });
        const meData = await meRes.json();
        if (!meData.avatar) {
            showToast("A profile photo is required for the proctored exam. Please upload one in 'My Profile'.", "error");
            showSection('profile');
            return;
        }

        const quizRes = await fetch(`${API}/student/quizzes/${quizId}/start`, { headers: HEADERS });
        const quizData = await quizRes.json();
        if (!quizRes.ok) throw new Error(quizData.error);

        const modal = document.getElementById('quiz-modal');
        document.getElementById('quiz-overlay').classList.add('active');
        
        modal.innerHTML = `
            <div class="proctor-screen">
                <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Identity Verification</h2>
                <p style="color: var(--text-muted); margin-bottom: 20px;">Please look into the camera to verify your identity before starting.</p>
                <div class="webcam-container">
                    <video id="proctor-video" autoplay muted playsinline></video>
                    <div class="webcam-overlay"></div>
                </div>
                <div class="proctor-status" id="proctor-verify-status">Starting camera...</div>
                <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
                    <button class="btn btn-outline" onclick="closeQuizModal()">Cancel</button>
                    <button class="btn btn-primary" id="btn-verify-face" disabled onclick="verifyAndStart('${quizId}')">
                        Verify Identity
                    </button>
                </div>
            </div>
        `;

        const camStarted = await Proctor.startWebcam('proctor-video');
        if (!camStarted) {
            showToast("Could not access webcam. Please check permissions.", "error");
            closeQuizModal();
            return;
        }

        document.getElementById('proctor-verify-status').textContent = "Camera ready. Position yourself in the center.";
        document.getElementById('btn-verify-face').disabled = false;
        
        currentQuiz = quizData; 
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function verifyAndStart(quizId) {
    const statusEl = document.getElementById('proctor-verify-status');
    const btn = document.getElementById('btn-verify-face');
    
    statusEl.innerHTML = `<span class="loader-ring" style="width:16px; height:16px; display:inline-block; border-width:2px; vertical-align:middle;"></span> Analyzing face...`;
    btn.disabled = true;

    const meRes = await fetch(`${API}/auth/me`, { headers: HEADERS });
    const meData = await meRes.json();
    const avatarUrl = meData.avatar;

    const result = await Proctor.verifyIdentity('proctor-video', avatarUrl);
    
    if (result.success) {
        statusEl.textContent = "Identity verified! Starting quiz...";
        statusEl.style.color = "var(--success)";
        
        setTimeout(() => {
            Proctor.stopWebcam();
            timeLeft = currentQuiz.time_limit * 60;
            currentQuestionIndex = 0;
            answers = {};
            isQuizActive = true;
            violationCount = 0;
            openQuizModal();
            
            document.getElementById('proctor-mini-feed').classList.add('active');
            Proctor.startWebcam('mini-proctor-video').then(() => {
                Proctor.startMonitoring('mini-proctor-video', (msg, isTerminal) => {
                    handleProctorViolation(msg, isTerminal);
                });
            });
        }, 1000);
    } else {
        statusEl.textContent = result.message;
        statusEl.style.color = "var(--danger)";
        btn.disabled = false;
        btn.textContent = "Retry Verification";
        
        if (result.message.includes("authorized")) {
            setTimeout(() => {
                alert("Unauthorized user. Access denied.");
                closeQuizModal();
            }, 2000);
        }
    }
}

function openQuizModal() {
    const overlay = document.getElementById('quiz-overlay');
    overlay.classList.add('active');
    document.querySelector('.sidebar').classList.add('sidebar-locked');
    renderQuestion();
    startTimer();
    enterFullscreen();
}

function closeQuizModal() {
    clearInterval(timerInterval);
    document.getElementById('quiz-overlay').classList.remove('active');
    document.querySelector('.sidebar').classList.remove('sidebar-locked');
    currentQuiz = null;
    isQuizActive = false;
    violationCount = 0;
    Proctor.stopMonitoring();
    document.getElementById('proctor-mini-feed').classList.remove('active');
    hideProctorWarning();
    exitFullscreen();
}

function enterFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
}

function exitFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) { clearInterval(timerInterval); submitQuiz(true); }
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const secs = (timeLeft % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('quiz-timer');
    if (timerEl) { timerEl.textContent = `${mins}:${secs}`; }
}

function renderQuestion() {
    const q = currentQuiz.questions[currentQuestionIndex];
    const total = currentQuiz.total_questions;
    const progress = Math.round(((currentQuestionIndex + 1) / total) * 100);
    const answeredCount = Object.keys(answers).length;

    const modal = document.getElementById('quiz-modal');
    modal.innerHTML = `
    <div class="quiz-header">
        <div>
            <h3 style="font-size:18px; font-weight:800; color:var(--text);">${currentQuiz.title}</h3>
            <p style="font-size:13px; color:var(--text-muted);">${currentQuiz.subject}</p>
        </div>
        <div class="quiz-timer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span id="quiz-timer"></span>
        </div>
    </div>

    <div class="quiz-progress">
        <div class="progress-label">Question ${currentQuestionIndex + 1} of ${total} &nbsp;·&nbsp; ${answeredCount} answered</div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${progress}%"></div></div>
    </div>

    <div class="question-block">
        <div class="question-number">Question ${currentQuestionIndex + 1}</div>
        <div class="question-text">${q.question}</div>
        <div class="option-list">
            ${Object.entries(q.options).map(([letter, text]) => `
            <div class="option-item ${answers[String(q.id)] === letter ? 'selected' : ''}"
                 onclick="selectOption(${q.id}, '${letter}')">
                <div class="option-letter">${letter}</div>
                <div class="option-text">${text}</div>
            </div>`).join('')}
        </div>
    </div>

    <div class="quiz-nav">
        <button class="btn btn-outline" onclick="prevQuestion()" ${currentQuestionIndex === 0 ? 'disabled' : ''}>← Previous</button>
        <div class="question-dots">
            ${currentQuiz.questions.map((_, i) => `
            <div class="q-dot ${answers[String(currentQuiz.questions[i].id)] ? 'answered' : ''} ${i === currentQuestionIndex ? 'current' : ''}"
                 onclick="goToQuestion(${i})">${i + 1}</div>`).join('')}
        </div>
        ${currentQuestionIndex < total - 1
            ? `<button class="btn btn-primary" onclick="nextQuestion()">Next →</button>`
            : `<button class="btn btn-success" onclick="submitQuiz(false)">Submit Quiz ✓</button>`
        }
    </div>`;
    updateTimerDisplay();
}

function selectOption(qId, letter) { answers[String(qId)] = letter; renderQuestion(); }
function nextQuestion() { if (currentQuestionIndex < currentQuiz.total_questions - 1) { currentQuestionIndex++; renderQuestion(); } }
function prevQuestion() { if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(); } }
function goToQuestion(i) { currentQuestionIndex = i; renderQuestion(); }

async function submitQuiz(auto = false) {
    if (!currentQuiz) return;
    const unanswered = currentQuiz.total_questions - Object.keys(answers).length;
    if (!auto && unanswered > 0) {
        if (!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    }
    clearInterval(timerInterval);
    isQuizActive = false;

    const modal = document.getElementById('quiz-modal');
    modal.innerHTML = `<div class="page-loader" style="min-height:300px;"><div class="loader-ring"></div></div>`;

    try {
        const res = await fetch(`${API}/student/quizzes/${currentQuiz.quiz_id}/submit`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ answers })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showResultModal(data);
    } catch (err) {
        showToast(err.message, 'error');
        closeQuizModal();
    }
}

function showResultModal(result) {
    const pct = result.percentage;
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (pct / 100) * circumference;
    const color = pct >= 70 ? '#32D74B' : pct >= 50 ? '#FFD60A' : '#FF453A';
    
    const modal = document.getElementById('quiz-modal');
    modal.innerHTML = `
    <div class="result-header">
        <div class="result-score-ring">
            <svg class="ring-svg" viewBox="0 0 120 120">
                <circle class="ring-bg" cx="60" cy="60" r="54"/>
                <circle class="ring-fill" cx="60" cy="60" r="54" stroke="${color}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="score-center">
                <div class="score-pct">${pct}%</div>
                <div class="score-grade" style="color:${color}">${result.grade}</div>
            </div>
        </div>
        <h2 style="font-size:22px; font-weight:800; color:var(--text);">${pct >= 50 ? '🎉 Quiz Completed!' : '📚 Keep Practicing!'}</h2>
        <p style="color:var(--text-muted); font-size:14px;">You scored ${result.score} out of ${result.total}</p>
    </div>
    <div style="display:flex; gap:10px; margin-bottom:20px;">
        <button class="btn btn-outline" onclick="toggleAnswerReview()" style="flex:1; justify-content:center;" id="review-btn">📋 Review Answers</button>
        <button class="btn btn-primary" onclick="closeQuizModal(); showSection('results');" style="flex:1; justify-content:center;">Close Modal</button>
    </div>
    <div id="answer-review" style="display:none; text-align: left; max-height: 400px; overflow-y: auto; padding-right: 10px;">
        ${(result.result_details || []).map((det, idx) => `
            <div class="review-item" style="margin-bottom: 20px; padding: 15px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.03);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="font-weight: 700; color: var(--text-muted);">Question ${idx + 1}</span>
                    <span class="badge ${det.is_correct ? 'badge-success' : 'badge-danger'}">${det.is_correct ? 'Correct' : 'Incorrect'}</span>
                </div>
                <p style="margin-bottom: 12px; font-weight: 500;">${det.question}</p>
                <div style="display: grid; gap: 8px;">
                    ${Object.entries(det.options).map(([letter, text]) => {
                        let style = "";
                        let icon = "";
                        if (letter === det.correct_answer) {
                            style = "border-color: #32D74B; background: rgba(50,215,75,0.1); color: #32D74B;";
                            icon = "✓";
                        } else if (letter === det.selected && !det.is_correct) {
                            style = "border-color: #FF453A; background: rgba(255,69,58,0.1); color: #FF453A;";
                            icon = "✗";
                        }
                        return `
                            <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px; ${style}">
                                <span style="font-weight: 700; width: 20px;">${letter}</span>
                                <span style="flex: 1;">${text}</span>
                                <span style="font-weight: 800;">${icon}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${det.explanation ? `<p style="margin-top: 10px; font-size: 13px; color: var(--text-muted); font-style: italic;"><strong>Explanation:</strong> ${det.explanation}</p>` : ''}
            </div>
        `).join('')}
    </div>`;
}

function toggleAnswerReview() {
    const review = document.getElementById('answer-review');
    const btn = document.getElementById('review-btn');
    const showing = review.style.display !== 'none';
    review.style.display = showing ? 'none' : 'block';
    btn.textContent = showing ? '📋 Review Answers' : '🔼 Hide Review';
}

async function loadResults() {
    const wrap = document.getElementById('results-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="page-loader"><div class="loader-ring"></div></div>';
    try {
        const res = await fetch(`${API}/student/results`, { headers: HEADERS });
        myResults = await res.json();
        if (!res.ok) throw new Error(myResults.error);

        const total = myResults.length;
        document.getElementById('stat-total').textContent = total;
        
        // Calculate average and best score
        if (total > 0) {
            const avg = Math.round(myResults.reduce((s, r) => s + r.percentage, 0) / total);
            const best = Math.max(...myResults.map(r => r.percentage));
            
            document.getElementById('stat-avg').textContent = `${avg}%`;
            document.getElementById('stat-best').textContent = `${best}%`;
        } else {
            document.getElementById('stat-avg').textContent = '—%';
            document.getElementById('stat-best').textContent = '—%';
        }

        if (total === 0) {
            wrap.innerHTML = `<div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <h3>No results yet</h3>
                <p>Take your first quiz to see your performance results here!</p>
            </div>`;
            return;
        }

        wrap.innerHTML = `<table>
            <thead><tr><th>#</th><th>Quiz Title</th><th>Score</th><th>Percentage</th><th>Grade</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
            ${myResults.map((r, i) => {
                const badgeClass = r.percentage >= 70 ? 'badge-success' : r.percentage >= 50 ? 'badge-warning' : 'badge-danger';
                return `<tr>
                    <td style="color:var(--text-muted)">${i + 1}</td>
                    <td style="font-weight:600">${r.quiz_title}</td>
                    <td>${r.score} / ${r.total}</td>
                    <td><span class="badge ${badgeClass}">${r.percentage}%</span></td>
                    <td><span class="badge ${badgeClass}">${r.grade}</span></td>
                    <td style="color:var(--text-muted); font-size:13.0px;">${r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}</td>
                    <td><button class="btn btn-outline" style="padding: 4px 12px; font-size: 12px;" onclick="viewQuizResult('${r.quiz_id}')">Details</button></td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
    } catch (err) { 
        showToast(err.message, 'error'); 
        wrap.innerHTML = '<div class="empty-state"><h3>Failed to load results</h3></div>';
    }
}

async function loadAnalysis() {
    if (!myResults.length) {
        try {
            const res = await fetch(`${API}/student/results`, { headers: HEADERS });
            myResults = await res.json();
            if (!res.ok) throw new Error(myResults.error);
        } catch (err) {
            console.error('Analysis load error:', err);
            return;
        }
    }
    
    if (!myResults.length) return;

    const labels = myResults.map(r => r.quiz_title.length > 15 ? r.quiz_title.substring(0, 15) + '…' : r.quiz_title);
    const scores = myResults.map(r => r.percentage);

    // 1. Trend chart (Scores over time)
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trend-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Score (%)', data: scores,
                borderColor: '#6C63FF', backgroundColor: 'rgba(108,99,255,0.1)',
                tension: 0.4, fill: true, pointBackgroundColor: '#6C63FF', pointRadius: 6, pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8888aa' } } },
            scales: {
                x: { ticks: { color: '#8888aa', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#8888aa' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 }
            }
        }
    });

    // 2. Grade distribution
    const gradeCounts = { 'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C': 0, 'F': 0 };
    myResults.forEach(r => { if (gradeCounts[r.grade] !== undefined) gradeCounts[r.grade]++; });
    const gradeColors = { 'A+': '#32D74B', 'A': '#4ECDC4', 'B+': '#6C63FF', 'B': '#8B83FF', 'C': '#FFD60A', 'F': '#FF453A' };

    if (gradeChart) gradeChart.destroy();
    gradeChart = new Chart(document.getElementById('grade-chart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(gradeCounts).filter(g => gradeCounts[g] > 0),
            datasets: [{
                data: Object.entries(gradeCounts).filter(([,v]) => v > 0).map(([,v]) => v),
                backgroundColor: Object.entries(gradeCounts).filter(([,v]) => v > 0).map(([g]) => gradeColors[g]),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { position: 'bottom', labels: { color: '#8888aa', padding: 14, font: { size: 12 } } } }
        }
    });

    // 3. Per-quiz bar comparison
    if (radarChart) radarChart.destroy();
    radarChart = new Chart(document.getElementById('radar-chart').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Result (%)',
                data: scores,
                backgroundColor: scores.map(s => s >= 70 ? 'rgba(50,215,75,0.7)' : s >= 50 ? 'rgba(255,214,10,0.7)' : 'rgba(255,69,58,0.7)'),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8888aa' } } },
            scales: {
                x: { ticks: { color: '#8888aa', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#8888aa' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 }
            }
        }
    });
}

async function logViolationToBackend(type, severity) {
    if (!currentQuiz) return;
    try {
        await fetch(`${API}/student/log-violation`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
                quiz_id: currentQuiz.quiz_id,
                type: type,
                severity: severity
            })
        });
    } catch(e) { console.error("Logging error:", e); }
}

function handleProctorViolation(msg, isTerminal) {
    if (!isQuizActive) return;
    
    // Log to backend
    logViolationToBackend(msg, isTerminal ? 'critical' : 'warning');

    if (isTerminal) {
        showProctorWarning(msg, "Critical Violation — Exam Terminated");
        setTimeout(() => {
            hideProctorWarning();
            submitQuiz(true);
        }, 3000);
        return;
    }
    violationCount++;
    showProctorWarning(msg, `Violation ${violationCount}/3`);
    if (violationCount >= 3) {
        setTimeout(() => {
            hideProctorWarning();
            submitQuiz(true);
        }, 3000);
    }
}

function showProctorWarning(msg, title = "Violation Detected") {
    const overlay = document.getElementById('proctor-warning-overlay');
    document.getElementById('proctor-warning-title').textContent = title;
    document.getElementById('proctor-warning-msg').textContent = msg;
    overlay.classList.add('active');
}

function hideProctorWarning() {
    document.getElementById('proctor-warning-overlay').classList.remove('active');
}

function handleViolation(msg) {
    handleProctorViolation(msg, false);
}

// SECURITY EVENT LISTENERS
document.addEventListener('contextmenu', e => {
    if (isQuizActive) { e.preventDefault(); showToast("Right-click is disabled!", "error"); }
});

document.addEventListener('copy', e => {
    if (isQuizActive) { e.preventDefault(); handleViolation("Copying is not allowed!"); }
});

document.addEventListener('paste', e => {
    if (isQuizActive) { e.preventDefault(); handleViolation("Pasting is not allowed!"); }
});

document.addEventListener('fullscreenchange', () => {
    if (isQuizActive && !document.fullscreenElement) {
        handleViolation("Exiting full-screen is not allowed!");
    }
});

document.addEventListener("visibilitychange", () => {
    if (isQuizActive && document.hidden) handleViolation("Tab switching is not allowed!");
});

window.addEventListener("blur", () => {
    if (isQuizActive) handleViolation("You left the exam screen!");
});

loadQuizzes();
