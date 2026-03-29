const API = '/api';
let currentRole = 'student';
let currentTab = 'login';
let fpEmail = '';        // email used in forgot-password flow
let otpTimerInterval = null;
let googleClientId = ''; // loaded from backend config

// ─────────────────────────────────────────────
// BOOT: fetch config from backend, then init
// ─────────────────────────────────────────────
async function initApp() {
    // Redirect if already logged in
    const _token = localStorage.getItem('token');
    const _role  = localStorage.getItem('role');
    if (_token && _role) {
        window.location.href = _role === 'faculty' ? 'faculty.html' : 'student.html';
    }
}
initApp();

// ─────────────────────────────────────────────
// SAFE JSON PARSER (handles HTML error pages)
// ─────────────────────────────────────────────
async function safeJson(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        // Server returned HTML (e.g. 404/500 page) — surface a clean error
        console.error('Non-JSON response:', text.substring(0, 200));
        throw new Error(`Server error (${res.status}). Check Flask console for details.`);
    }
}

function switchRole(role) {
    currentRole = role;
    document.getElementById('btn-student').classList.toggle('active', role === 'student');
    document.getElementById('btn-faculty').classList.toggle('active', role === 'faculty');
    hideAlert('alert-box');
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('login-form').style.display   = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
    hideAlert('alert-box');
}

// ─────────────────────────────────────────────
// PANEL NAVIGATION (main ↔ forgot)
// ─────────────────────────────────────────────
function showMainPanel() {
    document.getElementById('main-panel').style.display   = 'block';
    document.getElementById('forgot-panel').style.display = 'none';
    clearOtpTimer();
}

function showForgotPanel() {
    document.getElementById('main-panel').style.display   = 'none';
    document.getElementById('forgot-panel').style.display = 'block';
    showForgotStep(1);
}

function showForgotStep(step) {
    [1, 2, 3].forEach(s =>
        document.getElementById(`forgot-step-${s}`).style.display = s === step ? 'block' : 'none'
    );
}

// ─────────────────────────────────────────────
// ALERT HELPERS
// ─────────────────────────────────────────────
function showAlert(id, msg, type = 'error') {
    const box = document.getElementById(id);
    const icon = type === 'error'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>`;
    box.innerHTML = icon + msg;
    box.className = `alert-box ${type}`;
    box.style.display = 'flex';
}

function hideAlert(id) {
    const box = document.getElementById(id);
    if (box) box.style.display = 'none';
}

// ─────────────────────────────────────────────
// TOGGLE PASSWORD VISIBILITY
// ─────────────────────────────────────────────
function togglePassword(id, btn) {
    const inp = document.getElementById(id);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.innerHTML = inp.type === 'password'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

function setLoading(btnId, loading) {
    const btn    = document.getElementById(btnId);
    if (!btn) return;
    const text   = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    btn.disabled = loading;
    if (text)   text.style.display   = loading ? 'none' : 'block';
    if (loader) loader.style.display = loading ? 'block' : 'none';
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    hideAlert('alert-box');
    const email    = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    setLoading('login-btn', true);
    try {
        const res  = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role: currentRole })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || 'Login failed');
        storeAndRedirect(data);
    } catch (err) {
        showAlert('alert-box', err.message);
    } finally {
        setLoading('login-btn', false);
    }
}

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────
async function handleRegister(e) {
    e.preventDefault();
    hideAlert('alert-box');
    const name     = document.getElementById('reg-name').value;
    const email    = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if (password.length < 6) { showAlert('alert-box', 'Password must be at least 6 characters'); return; }

    setLoading('reg-btn', true);
    try {
        const res  = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role: currentRole })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        showAlert('alert-box', `Welcome, ${data.name}! Redirecting...`, 'success');
        setTimeout(() => storeAndRedirect(data), 1200);
    } catch (err) {
        showAlert('alert-box', err.message);
    } finally {
        setLoading('reg-btn', false);
    }
}


// ─────────────────────────────────────────────
// FORGOT PASSWORD — Step 1: Send OTP
// ─────────────────────────────────────────────
async function sendOTP() {
    hideAlert('fp-alert-1');
    fpEmail = document.getElementById('fp-email').value.trim().toLowerCase();
    if (!fpEmail) { showAlert('fp-alert-1', 'Please enter your email address'); return; }

    setLoading('fp-send-btn', true);
    try {
        const res  = await fetch(`${API}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fpEmail, role: currentRole })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

        document.getElementById('otp-sent-msg').textContent =
            `A 6-digit OTP has been sent to ${fpEmail}`;
        showForgotStep(2);
        clearOtpBoxes();
        startOtpTimer(120); // 2 minutes
        document.getElementById('otp-0').focus();
    } catch (err) {
        showAlert('fp-alert-1', err.message);
    } finally {
        setLoading('fp-send-btn', false);
    }
}

// ─────────────────────────────────────────────
// OTP BOX HELPERS
// ─────────────────────────────────────────────
function otpInput(el, index) {
    el.value = el.value.replace(/[^0-9]/g, '');
    el.classList.toggle('filled', el.value !== '');
    if (el.value && index < 5) {
        document.getElementById(`otp-${index + 1}`).focus();
    }
}

function otpKeydown(e, index) {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
        const prev = document.getElementById(`otp-${index - 1}`);
        prev.value = '';
        prev.classList.remove('filled');
        prev.focus();
    }
}

function clearOtpBoxes() {
    for (let i = 0; i < 6; i++) {
        const box = document.getElementById(`otp-${i}`);
        box.value = '';
        box.classList.remove('filled');
    }
}

function getOtpValue() {
    return Array.from({length: 6}, (_, i) => document.getElementById(`otp-${i}`).value).join('');
}

// ─────────────────────────────────────────────
// OTP COUNTDOWN TIMER
// ─────────────────────────────────────────────
function startOtpTimer(seconds) {
    clearOtpTimer();
    let remaining = seconds;
    const timerText  = document.getElementById('otp-timer-text');
    const countdown  = document.getElementById('otp-countdown');
    const resendBtn  = document.getElementById('resend-btn');

    timerText.style.display  = 'inline';
    countdown.style.display  = 'inline';
    resendBtn.style.display  = 'none';

    function tick() {
        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        countdown.textContent = `${m}:${s}`;
        if (remaining <= 0) {
            clearOtpTimer();
            timerText.style.display = 'none';
            countdown.style.display = 'none';
            resendBtn.style.display = 'inline';
        }
        remaining--;
    }
    tick();
    otpTimerInterval = setInterval(tick, 1000);
}

function clearOtpTimer() {
    if (otpTimerInterval) { clearInterval(otpTimerInterval); otpTimerInterval = null; }
}

async function resendOTP() {
    hideAlert('fp-alert-2');
    try {
        const res  = await fetch(`${API}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fpEmail, role: currentRole })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error);
        clearOtpBoxes();
        startOtpTimer(120);
        document.getElementById('otp-0').focus();
        showAlert('fp-alert-2', 'A new OTP has been sent to your email.', 'success');
    } catch (err) {
        showAlert('fp-alert-2', err.message);
    }
}

// ─────────────────────────────────────────────
// FORGOT PASSWORD — Step 2: Verify OTP
// ─────────────────────────────────────────────
async function verifyOTP() {
    hideAlert('fp-alert-2');
    const otp = getOtpValue();
    if (otp.length < 6) { showAlert('fp-alert-2', 'Please enter all 6 digits of the OTP'); return; }

    setLoading('fp-verify-btn', true);
    try {
        const res  = await fetch(`${API}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fpEmail, otp })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || 'OTP verification failed');

        clearOtpTimer();
        showForgotStep(3);
    } catch (err) {
        showAlert('fp-alert-2', err.message);
        // Shake OTP boxes on error
        const inputsEl = document.getElementById('otp-inputs');
        inputsEl.style.animation = 'none';
        setTimeout(() => { inputsEl.style.animation = 'shake 0.4s ease'; }, 10);
    } finally {
        setLoading('fp-verify-btn', false);
    }
}

// ─────────────────────────────────────────────
// FORGOT PASSWORD — Step 3: Reset Password
// ─────────────────────────────────────────────
async function resetPassword() {
    hideAlert('fp-alert-3');
    const newPass     = document.getElementById('fp-new-pass').value;
    const confirmPass = document.getElementById('fp-confirm-pass').value;

    if (newPass.length < 6)       { showAlert('fp-alert-3', 'Password must be at least 6 characters'); return; }
    if (newPass !== confirmPass)   { showAlert('fp-alert-3', 'Passwords do not match'); return; }

    setLoading('fp-reset-btn', true);
    try {
        const res  = await fetch(`${API}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fpEmail, new_password: newPass })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || 'Password reset failed');

        showAlert('fp-alert-3', '✓ Password reset successfully! Redirecting to login...', 'success');
        setTimeout(() => {
            showMainPanel();
            switchTab('login');
        }, 2000);
    } catch (err) {
        showAlert('fp-alert-3', err.message);
    } finally {
        setLoading('fp-reset-btn', false);
    }
}

// ─────────────────────────────────────────────
// HELPER: Store token and redirect
// ─────────────────────────────────────────────
function storeAndRedirect(data) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('role',  data.role);
    localStorage.setItem('name',  data.name);
    window.location.href = data.role === 'faculty' ? 'faculty.html' : 'student.html';
}
