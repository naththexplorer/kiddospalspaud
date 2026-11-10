let nama = "";
let moodSebelum = "";
let masalahSebelum = "";
let moodSesudah = "";
let masalahSesudah = "";

const URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycby5SxqrD-xVV7QBTGprl03gA4-bVP_GKuMNhb08xrFk2cEKWoCEOojC7ycRt7G0RDzu/exec";

// =========================
// 1. MEMULAI PILIHAN (PAGI / SIANG)
// =========================
function mulaiSebelum() {
    nama = document.getElementById('namaAnak').value.trim();
    if (nama == "") {
        alert("Tulis namamu dulu ya");
        return;
    }
    document.getElementById("halamanAwal").classList.add("hidden");
    document.getElementById("checkIn").classList.remove("hidden");
}

function mulaiSesudah() {
    nama = document.getElementById('namaAnak').value.trim();
    if (nama === "") {
        alert("Tulis namamu dulu ya");
        return;
    }
    document.getElementById("halamanAwal").classList.add("hidden");
    document.getElementById("checkOut").classList.remove("hidden");
}

// ===========================
// 2. LOGIKA SEBELUM BELAJAR (PAGI)
// ===========================
function pilihMoodSebelum(mood, el) {
    moodSebelum = mood;
    document.querySelectorAll("#checkIn .mood-grid button").forEach(b => b.classList.remove("selected"));
    if (el) el.classList.add("selected");
    document.getElementById("alasanSebelum").classList.remove("hidden");
}

function simpanSebelum() {
    masalahSebelum = document.getElementById("masalahSebelum").value.trim();

    if (moodSebelum == "") {
        alert("Pilih gambar emosimu dulu ya!");
        return;
    }
    if (masalahSebelum === "") {
        alert("Pilih jawabannya dulu ya!");
        return;
    }

    const dataAnak= {
        waktu: new Date().toLocaleString("id-ID"),
        nama: nama,
        tipe: "SEBELUM BELAJAR",
        mood: moodSebelum,
        masalah: masalahSebelum
    };

    kirimData(dataAnak);

    document.getElementById("checkIn").classList.add("hidden");
    document.getElementById("selesai").classList.remove("hidden");
}

// =============================
// 3. LOGIKA SETELAH BELAJAR (SIANG)
// =============================
function pilihMoodSesudah(mood, el) {
    moodSesudah = mood;
    document.querySelectorAll("#checkOut .mood-grid button").forEach(b => b.classList.remove("selected"));
    if (el) el.classList.add("selected");
    document.getElementById("alasanSesudah").classList.remove("hidden");
}

function simpanSesudah() {
    masalahSesudah = document.getElementById("masalahSesudah").value.trim();

    if (moodSesudah === "") {
        alert("Pilih gambar emosimu dulu ya!");
        return;
    }
    if (masalahSesudah === "") {
        alert("Pilih jawabannya dulu ya!");
        return;
    }

    const dataAnak = {
        waktu: new Date().toLocaleString("id-ID"),
        nama: nama,
        tipe: "SETELAH BELAJAR",
        mood: moodSesudah,
        masalah: masalahSesudah
    };

    kirimData(dataAnak);

    document.getElementById("checkOut").classList.add("hidden");
    document.getElementById("selesai").classList.remove("hidden");
}

// ==========================
// 4. KIRIM KE LOCAL STORAGE & GOOGLE SHEETS
// ==========================
function kirimData(data) {
    // LocalStorage
    let semuaData = JSON.parse(localStorage.getItem("dataAnak")) || [];
    semuaData.push(data);
    localStorage.setItem("dataAnak", JSON.stringify(semuaData));

    // Google Apps Script
    fetch(URL_APPS_SCRIPT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString()
    })
    .then(() => console.log("Data berhasil terkirim"))
    .catch(err => console.error("Gagal kirim data", err));
}