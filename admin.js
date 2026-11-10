(() => {
    const $ = id => document.getElementById(id);
    const apiBase = `${window.SUPABASE_URL}/functions/v1/voice-notes`;
    let token = sessionStorage.getItem('kiddospals_admin_session');

    function setStatus(id, message, type = '') {
        const element = $(id);
        element.textContent = message;
        element.className = `admin-status ${type}`.trim();
    }

    function showNotes(isAdmin) {
        $('adminLoginPanel').classList.toggle('hidden', isAdmin);
        $('adminNotesPanel').classList.toggle('hidden', !isAdmin);
    }

    async function callApi(path, options = {}) {
        const headers = new Headers(options.headers || {});
        headers.set('apikey', window.SUPABASE_PUBLISHABLE_KEY);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(`${apiBase}/${path}`, { ...options, headers });
    }

    async function loadNotes() {
        setStatus('adminNotesStatus', 'Memuat rekaman…');
        $('adminNotesList').replaceChildren();
        try {
            const response = await callApi('admin-notes');
            const result = await response.json().catch(() => ({}));
            if (response.status === 401) {
                token = null;
                sessionStorage.removeItem('kiddospals_admin_session');
                showNotes(false);
                setStatus('adminLoginStatus', 'Sesi admin berakhir. Silakan masuk lagi.', 'error');
                return;
            }
            if (!response.ok) throw new Error(result.error || 'Gagal memuat rekaman.');
            const notes = result.notes || [];
            $('notesCount').textContent = `${notes.length} rekaman`;
            if (!notes.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-notes';
                empty.textContent = 'Belum ada Voice Note.';
                $('adminNotesList').append(empty);
            }
            for (const note of notes) {
                const card = document.createElement('article');
                card.className = 'admin-note-card';
                const top = document.createElement('div');
                top.className = 'admin-note-top';
                const identity = document.createElement('div');
                const name = document.createElement('h3');
                name.textContent = note.child_id && (!note.child_name || note.child_name === 'Anak')
                    ? `Akun lama · ${note.child_id.slice(0, 8)}`
                    : (note.child_name || 'Anak');
                const meta = document.createElement('p');
                meta.className = 'admin-note-meta';
                const created = new Date(note.created_at).toLocaleString('id-ID');
                meta.textContent = `${created} · ${note.duration_seconds} detik`;
                identity.append(name, meta);
                const actions = document.createElement('div');
                actions.className = 'admin-note-actions';
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'delete-note-button';
                deleteButton.textContent = 'Hapus';
                deleteButton.setAttribute('aria-label', `Hapus rekaman ${name.textContent}`);
                deleteButton.addEventListener('click', () => deleteNote(note, card, deleteButton));
                actions.append(deleteButton);
                top.append(identity, actions);
                card.append(top);
                if (note.audioUrl) {
                    const audio = document.createElement('audio');
                    audio.controls = true;
                    audio.preload = 'none';
                    audio.src = note.audioUrl;
                    card.append(audio);
                } else {
                    const unavailable = document.createElement('p');
                    unavailable.className = 'admin-note-meta';
                    unavailable.textContent = 'Audio tidak dapat dimuat. Tekan Muat ulang untuk mencoba lagi.';
                    card.append(unavailable);
                }
                $('adminNotesList').append(card);
            }
            setStatus('adminNotesStatus', '');
        } catch (error) {
            setStatus('adminNotesStatus', error.message, 'error');
        }
    }

    async function deleteNote(note, card, button) {
        const childName = note.child_name || 'Anak';
        if (!window.confirm(`Hapus rekaman Voice Note dari ${childName}? File audio dan datanya akan dihapus.`)) return;
        button.disabled = true;
        setStatus('adminNotesStatus', `Menghapus rekaman ${childName}…`);
        try {
            const response = await callApi('admin-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: note.id }),
            });
            const result = await response.json().catch(() => ({}));
            if (response.status === 401) {
                token = null;
                sessionStorage.removeItem('kiddospals_admin_session');
                showNotes(false);
                setStatus('adminLoginStatus', 'Sesi admin berakhir. Silakan masuk lagi.', 'error');
                return;
            }
            if (!response.ok) throw new Error(result.error || 'Gagal menghapus rekaman.');
            card.remove();
            const remaining = $('adminNotesList').querySelectorAll('.admin-note-card').length;
            $('notesCount').textContent = `${remaining} rekaman`;
            if (!remaining) {
                const empty = document.createElement('div');
                empty.className = 'empty-notes';
                empty.textContent = 'Belum ada Voice Note.';
                $('adminNotesList').append(empty);
            }
            setStatus('adminNotesStatus', 'Rekaman berhasil dihapus.', 'success');
        } catch (error) {
            button.disabled = false;
            setStatus('adminNotesStatus', error.message, 'error');
        }
    }

    $('adminLoginForm').addEventListener('submit', async event => {
        event.preventDefault();
        $('adminLoginButton').disabled = true;
        setStatus('adminLoginStatus', 'Memeriksa akun…');
        try {
            const response = await callApi('admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: $('adminEmail').value.trim(),
                    password: $('adminPassword').value,
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Login gagal.');
            token = result.token;
            sessionStorage.setItem('kiddospals_admin_session', token);
            $('adminPassword').value = '';
            showNotes(true);
            await loadNotes();
        } catch (error) {
            setStatus('adminLoginStatus', error.message, 'error');
        } finally {
            $('adminLoginButton').disabled = false;
        }
    });

    $('refreshNotes').addEventListener('click', loadNotes);
    $('adminLogout').addEventListener('click', () => {
        token = null;
        sessionStorage.removeItem('kiddospals_admin_session');
        showNotes(false);
        $('adminLoginForm').reset();
        setStatus('adminLoginStatus', 'Kamu sudah keluar.', 'success');
    });

    if (token) {
        showNotes(true);
        loadNotes();
    } else {
        showNotes(false);
    }
})();
