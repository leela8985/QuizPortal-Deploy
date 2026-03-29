const API = '/api';
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');
const name = localStorage.getItem('name');
let analyticsData = null;
let allStudentRows = [];
let barChart, doughnutChart, analyticsBar, analyticsDoughnut, analyticsLine;

// Auth guard
if (!token || role !== 'faculty') {
    window.location.href = 'index.html';
}
document.getElementById('sidebar-name').textContent = name || 'Faculty';

const API_HEADERS = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

function showSection(section) {
    ['overview', 'upload', 'quizzes', 'analytics', 'profile'].forEach(s => {
        document.getElementById(`section-${s}`).style.display = s === section ? 'block' : 'none';
        document.getElementById(`nav-${s}`).classList.toggle('active', s === section);
    });
    if (section === 'overview') loadOverview();
    if (section === 'quizzes')  loadQuizzes();
    if (section === 'analytics') loadAnalytics();
    if (section === 'profile')  loadProfile();
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// ============ TOAST ============
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = icons[type] + msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ============ OVERVIEW ============
async function loadOverview() {
    try {
        const res = await fetch(`${API}/faculty/analytics`, { headers: API_HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        document.getElementById('stat-quizzes').textContent = data.total_quizzes;
        document.getElementById('stat-students').textContent = data.total_students;
        document.getElementById('stat-attempts').textContent = data.total_attempts;

        drawOverviewCharts(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function drawOverviewCharts(data) {
    const labels = data.quiz_stats.map(q => q.quiz_title.length > 18 ? q.quiz_title.substring(0, 18) + '…' : q.quiz_title);
    const avgs = data.quiz_stats.map(q => q.avg_score);

    const chartDefaults = {
        plugins: { legend: { labels: { color: '#8888aa', font: { family: 'Inter', size: 12 } } } },
        scales: {}
    };

    const barCtx = document.getElementById('overview-bar-chart').getContext('2d');
    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Avg Score (%)',
                data: avgs,
                backgroundColor: labels.map((_, i) => `hsla(${240 + i * 30}, 80%, 65%, 0.7)`),
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#8888aa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#8888aa' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 }
            }
        }
    });

    const totalPassed = data.quiz_stats.reduce((s, q) => s + Math.round(q.attempts * q.pass_rate / 100), 0);
    const totalFailed = data.total_attempts - totalPassed;

    const dCtx = document.getElementById('overview-doughnut-chart').getContext('2d');
    if (doughnutChart) doughnutChart.destroy();
    doughnutChart = new Chart(dCtx, {
        type: 'doughnut',
        data: {
            labels: ['Passed (≥50%)', 'Failed (<50%)'],
            datasets: [{ data: [totalPassed, totalFailed || 0], backgroundColor: ['#32D74B','#FF453A'], borderWidth: 0 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#8888aa', padding: 16 } } },
            cutout: '65%'
        }
    });
}

// ============ UPLOAD QUIZ ============
function fileSelected(input) {
    const file = input.files[0];
    if (file) {
        document.getElementById('file-name-text').textContent = file.name;
        const display = document.getElementById('file-name-display');
        display.style.display = 'flex';
    }
}

// Drag & Drop
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('csv-file').files = dt.files;
        fileSelected(document.getElementById('csv-file'));
    } else {
        showToast('Please drop a CSV file', 'error');
    }
});

async function uploadQuiz(e) {
    e.preventDefault();
    const fileInput = document.getElementById('csv-file');
    if (!fileInput.files[0]) { showToast('Please select a CSV file', 'error'); return; }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('title', document.getElementById('quiz-title').value);
    formData.append('subject', document.getElementById('quiz-subject').value || 'General');
    formData.append('time_limit', document.getElementById('quiz-time').value);

    const btn = document.getElementById('upload-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="btn-loader" style="width:18px;height:18px;border-color:rgba(255,255,255,0.3);border-top-color:white;"></div> Uploading...`;

    try {
        const res = await fetch(`${API}/faculty/upload-quiz`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast(`Quiz uploaded! ${data.total_questions} questions added.`);
        document.getElementById('upload-form').reset();
        document.getElementById('file-name-display').style.display = 'none';
        setTimeout(() => showSection('quizzes'), 1200);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Quiz`;
    }
}

// ============ MY QUIZZES ============
async function loadQuizzes() {
    const wrap = document.getElementById('quizzes-table-wrap');
    wrap.innerHTML = '<div class="page-loader"><div class="loader-ring"></div></div>';
    try {
        const res = await fetch(`${API}/faculty/quizzes`, { headers: API_HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (!data.length) {
            wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg><h3>No quizzes yet</h3><p>Upload your first quiz to get started</p></div>`;
            return;
        }

        wrap.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Quiz Title</th>
                    <th>Subject</th>
                    <th>Questions</th>
                    <th>Time Limit</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${data.map((q, i) => `
                <tr>
                    <td style="color:var(--text-muted)">${i + 1}</td>
                    <td><span style="font-weight:600">${q.title}</span></td>
                    <td><span class="badge badge-primary">${q.subject}</span></td>
                    <td>${q.total_questions} Qs</td>
                    <td>${q.time_limit} min</td>
                    <td style="color:var(--text-muted); font-size:13px;">${q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="deleteQuiz('${q._id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            Delete
                        </button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>`;
    } catch (err) {
        showToast(err.message, 'error');
        wrap.innerHTML = '<div class="empty-state"><h3>Failed to load quizzes</h3></div>';
    }
}

async function deleteQuiz(id) {
    if (!confirm('Delete this quiz? Students will no longer be able to take it.')) return;
    try {
        const res = await fetch(`${API}/faculty/quizzes/${id}`, { method: 'DELETE', headers: API_HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Quiz deleted');
        loadQuizzes();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ============ ANALYTICS ============
async function loadAnalytics() {
    try {
        const res = await fetch(`${API}/faculty/analytics`, { headers: API_HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        analyticsData = data;
        drawAnalyticsCharts(data);
        renderStudentTable(data.students);
        buildAllStudentRows(data.students);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function drawAnalyticsCharts(data) {
    const labels = data.quiz_stats.map(q => q.quiz_title.length > 20 ? q.quiz_title.substring(0, 20) + '…' : q.quiz_title);
    const avgs = data.quiz_stats.map(q => q.avg_score);
    const attempts = data.quiz_stats.map(q => q.attempts);
    const passRates = data.quiz_stats.map(q => q.pass_rate);

    const scaleOpts = {
        x: { ticks: { color: '#8888aa', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#8888aa' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 }
    };

    if (analyticsBar) analyticsBar.destroy();
    analyticsBar = new Chart(document.getElementById('analytics-bar-chart').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Avg Score (%)', data: avgs,
                backgroundColor: 'rgba(108,99,255,0.7)',
                borderColor: '#6C63FF', borderWidth: 1, borderRadius: 6
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8888aa' } } }, scales: scaleOpts }
    });

    if (analyticsDoughnut) analyticsDoughnut.destroy();
    analyticsDoughnut = new Chart(document.getElementById('analytics-doughnut-chart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: attempts, backgroundColor: labels.map((_, i) => `hsla(${200 + i * 40}, 70%, 60%, 0.8)`), borderWidth: 0 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '60%',
            plugins: { legend: { position: 'bottom', labels: { color: '#8888aa', font: { size: 11 }, padding: 10 } } }
        }
    });

    if (analyticsLine) analyticsLine.destroy();
    analyticsLine = new Chart(document.getElementById('analytics-line-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Pass Rate (%)', data: passRates,
                borderColor: '#4ECDC4', backgroundColor: 'rgba(78,205,196,0.1)',
                tension: 0.4, fill: true, pointBackgroundColor: '#4ECDC4', pointRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8888aa' } } },
            scales: { ...scaleOpts }
        }
    });
}

function buildAllStudentRows(students) {
    allStudentRows = [];
    students.forEach(s => {
        s.attempts.forEach(a => {
            allStudentRows.push({
                name: s.student_name, quiz: a.quiz_title,
                score: a.score, total: a.total, pct: a.percentage,
                date: a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'
            });
        });
    });
}

function renderStudentTable(students) {
    const wrap = document.getElementById('students-table-wrap');
    const rows = [];
    students.forEach(s => {
        s.attempts.forEach(a => {
            const pct = a.percentage;
            const badgeClass = pct >= 70 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger';
            rows.push(`<tr>
                <td><span style="font-weight:600">${s.student_name}</span></td>
                <td>${a.quiz_title}</td>
                <td>${a.score} / ${a.total}</td>
                <td><span class="badge ${badgeClass}">${pct}%</span></td>
                <td>${getGrade(pct)}</td>
                <td style="color:var(--text-muted); font-size:13px;">${a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}</td>
            </tr>`);
        });
    });

    if (!rows.length) {
        wrap.innerHTML = `<div class="empty-state"><h3>No attempts yet</h3><p>Student results will appear here once quizzes are attempted</p></div>`;
        return;
    }

    wrap.innerHTML = `<table id="students-table">
        <thead><tr>
            <th>Student</th><th>Quiz</th><th>Score</th><th>Percentage</th><th>Grade</th><th>Date</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
    </table>`;
}

function filterStudentTable() {
    const q = document.getElementById('student-search').value.toLowerCase();
    const filtered = allStudentRows.filter(r =>
        r.name.toLowerCase().includes(q) || r.quiz.toLowerCase().includes(q)
    );
    const badgeClass = pct => pct >= 70 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger';
    const rows = filtered.map(r => `<tr>
        <td><span style="font-weight:600">${r.name}</span></td>
        <td>${r.quiz}</td>
        <td>${r.score} / ${r.total}</td>
        <td><span class="badge ${badgeClass(r.pct)}">${r.pct}%</span></td>
        <td>${getGrade(r.pct)}</td>
        <td style="color:var(--text-muted); font-size:13px;">${r.date}</td>
    </tr>`).join('');

    document.querySelector('#students-table tbody').innerHTML = rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No matches found</td></tr>';
}

function getGrade(pct) {
    if (pct >= 90) return '<span class="badge badge-success">A+</span>';
    if (pct >= 80) return '<span class="badge badge-success">A</span>';
    if (pct >= 70) return '<span class="badge badge-secondary">B+</span>';
    if (pct >= 60) return '<span class="badge badge-primary">B</span>';
    if (pct >= 50) return '<span class="badge badge-warning">C</span>';
    return '<span class="badge badge-danger">F</span>';
}

// Load overview on start
loadOverview();
