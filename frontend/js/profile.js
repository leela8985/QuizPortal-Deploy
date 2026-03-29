// ─────────────────────────────────────────────
// SHARED PROFILE FUNCTIONS
// Used by both faculty.js and student.js
// ─────────────────────────────────────────────

const PROFILE_API = '/api/auth';

async function loadProfile() {
    const token = localStorage.getItem('token');
    try {
        const res  = await fetch(`${PROFILE_API}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) return;

        // Fill form fields
        document.getElementById('profile-name').value  = data.name  || '';
        document.getElementById('profile-email').value = data.email || '';
        document.getElementById('profile-bio').value   = data.bio   || '';
        document.getElementById('profile-display-name').textContent = data.name || '—';

        // Member since / quiz count (student)
        const joinedEl = document.getElementById('profile-joined');
        if (joinedEl && data.joined) {
            joinedEl.textContent = new Date(data.joined).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
        } else if (joinedEl) {
            joinedEl.textContent = 'N/A';
        }

        // Set avatar image if available
        if (data.avatar) {
            setAvatarImg(data.avatar);
        }

        // Also update sidebar name
        const sidebarName = document.getElementById('sidebar-name');
        if (sidebarName) sidebarName.textContent = data.name;

    } catch (e) {
        console.error('Could not load profile:', e);
    }
}

function setAvatarImg(url) {
    const avatarEl = document.getElementById('profile-avatar-display');
    if (!avatarEl || !url) return;
    // Don't append cache-buster to data URIs (Base64)
    const src = url.startsWith('data:') ? url : `${url}?t=${Date.now()}`;
    avatarEl.innerHTML = `<img src="${src}" alt="Profile photo" onerror="this.parentElement.innerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\' width=\\'52\\' height=\\'52\\' style=\\'opacity:0.4\\'><path d=\\'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2\\'/><circle cx=\\'12\\' cy=\\'7\\' r=\\'4\\'/></svg>'">`;
}

async function saveProfile() {
    const token = localStorage.getItem('token');
    const name  = document.getElementById('profile-name').value.trim();
    const bio   = document.getElementById('profile-bio').value.trim();
    const alertEl = document.getElementById('profile-alert');

    if (!name) {
        showProfileAlert('Name cannot be empty', 'error');
        return;
    }

    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="btn-loader" style="width:16px;height:16px;border-width:2px;margin:0;"></div> Saving...`;

    try {
        const res  = await fetch(`${PROFILE_API}/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, bio })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');

        // Update display
        document.getElementById('profile-display-name').textContent = data.name;
        localStorage.setItem('name', data.name);
        const sidebarName = document.getElementById('sidebar-name');
        if (sidebarName) sidebarName.textContent = data.name;

        showProfileAlert('Profile updated successfully!', 'success');
        if (typeof showToast === 'function') showToast('Profile saved ✓', 'success');

    } catch (err) {
        showProfileAlert(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg> Save Changes`;
    }
}

async function uploadAvatar(input) {
    const file = input.files[0];
    if (!file) return;

    const token     = localStorage.getItem('token');
    const statusEl  = document.getElementById('avatar-upload-status');
    const maxSizeMB = 5;

    if (file.size > maxSizeMB * 1024 * 1024) {
        statusEl.textContent = `Image too large (max ${maxSizeMB}MB)`;
        statusEl.style.color = 'var(--danger)';
        return;
    }

    statusEl.innerHTML = `<span style="color:var(--text-muted);">Uploading...</span>`;

    const formData = new FormData();
    formData.append('image', file);

    try {
        const res  = await fetch(`${PROFILE_API}/profile/image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        setAvatarImg(data.avatar);
        statusEl.innerHTML = `<span style="color:var(--success);">✓ Photo updated!</span>`;
        if (typeof showToast === 'function') showToast('Profile photo updated ✓', 'success');
        setTimeout(() => { statusEl.innerHTML = ''; }, 3000);

    } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
    }

    // Reset input so same file can be re-uploaded
    input.value = '';
}

function showProfileAlert(msg, type = 'error') {
    const el = document.getElementById('profile-alert');
    if (!el) return;
    el.textContent = msg;
    el.className   = `alert-box ${type}`;
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}
