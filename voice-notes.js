(() => {
    const $ = (id) => document.getElementById(id);
    const endpoint = `${window.SUPABASE_URL}/functions/v1/voice-notes`;
    let recorder = null;
    let stream = null;
    let chunks = [];
    let recording = null;
    let startedAt = 0;
    let recordedMs = 0;
    let timerId = null;
    const maxDurationMs = 60_000;

    function showTime(ms) {
        const seconds = Math.floor(ms / 1000);
        $('vnTimer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} / 01:00`;
    }

    function setStatus(message) {
        $('vnStatus').textContent = message;
    }

    $('vnRecord').addEventListener('click', async () => {
        try {
            if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
                throw new Error('Browser ini belum mendukung rekaman suara.');
            }
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
            const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
            recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            chunks = [];
            recording = null;
            recordedMs = 0;
            $('vnSend').classList.add('hidden');
            $('vnSend').disabled = true;
            $('vnRecord').disabled = true;
            $('vnStop').disabled = false;
            recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            recorder.onstop = () => {
                recording = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                recordedMs = Math.min(Date.now() - startedAt, maxDurationMs);
                $('vnSend').classList.remove('hidden');
                $('vnSend').disabled = false;
                $('vnRecord').disabled = false;
                $('vnStop').disabled = true;
                clearInterval(timerId);
                showTime(recordedMs);
                stream?.getTracks().forEach(track => track.stop());
                stream = null;
                recorder = null;
                setStatus('Rekaman siap. Tekan Kirim Voice Note untuk mengirim ke Ibu Guru.');
            };
            startedAt = Date.now();
            showTime(0);
            recorder.start();
            timerId = setInterval(() => {
                const elapsed = Math.min(Date.now() - startedAt, maxDurationMs);
                showTime(elapsed);
                if (elapsed >= maxDurationMs && recorder?.state === 'recording') recorder.stop();
            }, 250);
            setStatus('Sedang merekam…');
        } catch (error) {
            stream?.getTracks().forEach(track => track.stop());
            stream = null;
            recorder = null;
            $('vnRecord').disabled = false;
            $('vnStop').disabled = true;
            setStatus(error.name === 'NotAllowedError'
                ? 'Izin mikrofon ditolak. Minta bantuan Ibu Guru untuk mengaktifkannya.'
                : `Tidak bisa mulai merekam: ${error.message}`);
        }
    });

    $('vnStop').addEventListener('click', () => {
        if (recorder?.state === 'recording') recorder.stop();
    });

    $('vnSend').addEventListener('click', async () => {
        if (!recording) return;
        const childName = $('namaAnak').value.trim().replace(/\s+/gu, ' ').slice(0, 80);
        if (!childName) {
            setStatus('Nama anak belum diisi. Kembali ke halaman awal dulu ya.');
            return;
        }
        $('vnSend').disabled = true;
        $('vnRecord').disabled = true;
        setStatus('Mengirim Voice Note…');
        const form = new FormData();
        form.append('childName', childName);
        form.append('durationSeconds', String(Math.max(1, Math.min(60, Math.round(recordedMs / 1000)))));
        form.append('audio', recording, 'voice-note');
        try {
            const response = await fetch(`${endpoint}/upload`, {
                method: 'POST',
                headers: { apikey: window.SUPABASE_PUBLISHABLE_KEY },
                body: form,
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Upload gagal.');
            setStatus('Voice Note berhasil dikirim ke Ibu Guru. Terima kasih!');
            recording = null;
            $('vnSend').classList.add('hidden');
            showTime(0);
        } catch (error) {
            setStatus(`Gagal mengirim Voice Note: ${error.message}`);
        } finally {
            $('vnSend').disabled = !recording;
            $('vnRecord').disabled = false;
        }
    });
})();
