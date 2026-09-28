// --- Global Variables ---
let globalData = [];
let artistStats = {};
let trackStats = {};
let artistDates = {};
let artistsChartInstance = null;

// --- DOM Elements ---
const tabAnalyzeBtn = document.getElementById('tab-analyze-btn');
const tabLbBtn = document.getElementById('tab-lb-btn');
const viewAnalyze = document.getElementById('view-analyze');
const viewLb = document.getElementById('view-lb');
const uploadSection = document.getElementById('upload-section');
const fileInput = document.getElementById('file-upload');
const songsLimitSelect = document.getElementById('songs-limit-select');

// --- Event Listeners: Tabs ---
tabAnalyzeBtn.addEventListener('click', () => {
    tabAnalyzeBtn.className = "flex items-center justify-center gap-2 px-8 py-3 bg-m3-primaryContainer text-m3-primary font-medium rounded-full sm:rounded-r-none sm:rounded-l-full shadow-md transition-colors focus:outline-none";
    tabLbBtn.className = "flex items-center justify-center gap-2 px-8 py-3 bg-m3-surfaceContainer text-m3-onSurfaceVariant font-medium rounded-full sm:rounded-l-none sm:rounded-r-full hover:bg-m3-surface transition-colors focus:outline-none";
    viewAnalyze.classList.remove('hidden');
    viewLb.classList.add('hidden');
});

tabLbBtn.addEventListener('click', () => {
    tabLbBtn.className = "flex items-center justify-center gap-2 px-8 py-3 bg-m3-primaryContainer text-m3-primary font-medium rounded-full sm:rounded-l-none sm:rounded-r-full shadow-md transition-colors focus:outline-none";
    tabAnalyzeBtn.className = "flex items-center justify-center gap-2 px-8 py-3 bg-m3-surfaceContainer text-m3-onSurfaceVariant font-medium rounded-full sm:rounded-r-none sm:rounded-l-full hover:bg-m3-surface transition-colors focus:outline-none";
    viewLb.classList.remove('hidden');
    viewAnalyze.classList.add('hidden');
    // Hide dashboard if visible to keep UI clean
    if (!document.getElementById('dashboard').classList.contains('hidden')) {
        document.getElementById('dashboard').classList.add('hidden');
        uploadSection.classList.remove('hidden');
    }
});

// --- Event Listeners: Drag & Drop & Upload ---
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('drag-over');
});

uploadSection.addEventListener('dragleave', () => {
    uploadSection.classList.remove('drag-over');
});

uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});

document.getElementById('artist-search-btn').addEventListener('click', searchArtist);
document.getElementById('artist-search-input').addEventListener('keypress', e => { if (e.key === 'Enter') searchArtist(); });
document.getElementById('lb-integrate-btn').addEventListener('click', () => fetchListenBrainz(true));
document.getElementById('lb-download-btn').addEventListener('click', () => fetchListenBrainz(false));

songsLimitSelect.addEventListener('change', () => {
    renderTopSongs();
});

// --- File Handling Logic ---
async function handleFiles(files) {
    if (files.length === 0) return;
    
    document.getElementById('tabs-nav').classList.add('hidden');
    viewAnalyze.classList.add('hidden');
    document.getElementById('loading-section').classList.remove('hidden');
    
    let allEntries = [];
    let processedFilesCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (file.name.endsWith('.zip')) {
            // Unzip logic
            const zip = new JSZip();
            try {
                const contents = await zip.loadAsync(file);
                const jsonFiles = Object.keys(contents.files).filter(name => name.endsWith('.json') && !name.includes('__MACOSX'));
                for (const filename of jsonFiles) {
                    const fileData = await contents.files[filename].async("string");
                    try {
                        const parsed = JSON.parse(fileData);
                        if (Array.isArray(parsed)) allEntries = allEntries.concat(parsed);
                    } catch (e) { console.error(`Error parsing ${filename}`, e); }
                    processedFilesCount++;
                    document.getElementById('loading-text').innerText = `Analyzing file ${processedFilesCount}...`;
                }
            } catch (err) {
                console.error("ZIP Error:", err);
                alert(`Cannot read zip file: ${file.name}`);
            }
        } else if (file.name.endsWith('.json')) {
            // Raw JSON logic (e.g. dropped ListenBrainz file)
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) allEntries = allEntries.concat(parsed);
                processedFilesCount++;
                document.getElementById('loading-text').innerText = `Analyzing file ${processedFilesCount}...`;
            } catch (err) {
                console.error("JSON Error:", err);
                alert(`Cannot read json file: ${file.name}`);
            }
        }
    }

    if (allEntries.length === 0) {
        alert("No valid data found in the uploaded files.");
        location.reload(); // Quick reset
        return;
    }
    
    globalData = allEntries;
    processData(allEntries);
}

// --- ListenBrainz Logic ---
async function fetchListenBrainz(integrate) {
    const username = document.getElementById('lb-username').value.trim();
    const dateStr = document.getElementById('lb-date').value;
    
    if (!username || !dateStr) {
        alert("Please enter both username and start date.");
        return;
    }

    const targetTs = Math.floor(new Date(dateStr).getTime() / 1000);
    const lbLoading = document.getElementById('lb-loading');
    const statusText = document.getElementById('lb-status');
    const integrateBtn = document.getElementById('lb-integrate-btn');
    const downloadBtn = document.getElementById('lb-download-btn');
    
    lbLoading.classList.remove('hidden');
    integrateBtn.disabled = true;
    downloadBtn.disabled = true;
    
    let allListens = [];
    let maxTs = null;
    let reachedDate = false;
    
    try {
        while (!reachedDate) {
            let url = `https://api.listenbrainz.org/1/user/${username}/listens?count=100`;
            if (maxTs) url += `&max_ts=${maxTs}`;
            
            const response = await fetch(url, { headers: { "Accept": "application/json" } });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            
            const data = await response.json();
            const listens = data.payload?.listens || [];
            
            if (listens.length === 0) break;
            
            for (const item of listens) {
                if (item.listened_at < targetTs) {
                    reachedDate = true;
                    break;
                }
                
                const metadata = item.track_metadata || {};
                if (metadata.artist_name && metadata.track_name) {
                    // Convert to Spotify format
                    const d = new Date(item.listened_at * 1000);
                    const tsStr = d.toISOString().replace(/\.\d{3}Z$/, 'Z');
                    
                    allListens.push({
                        ts: tsStr,
                        master_metadata_album_artist_name: metadata.artist_name,
                        master_metadata_track_name: metadata.track_name,
                        ms_played: 180000 // Fake 3 mins to make them count
                    });
                }
            }
            
            maxTs = listens[listens.length - 1].listened_at;
            statusText.innerText = `Downloaded ${allListens.length} listens...`;
            
            // API rate limit pause
            await new Promise(r => setTimeout(r, 1000));
        }
        
        if (allListens.length === 0) {
            alert("No listens found after this date.");
        } else {
            if (integrate) {
                globalData = globalData.concat(allListens);
                alert(`🎉 ${allListens.length} listens successfully integrated!`);
                // Switch back to Analyze View
                tabAnalyzeBtn.click();
                processData(globalData);
            } else {
                // Download JSON file
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allListens, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `Streaming_History_ListenBrainz_${username}_${dateStr}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                alert("JSON file generated and downloaded!");
            }
        }
    } catch (err) {
        alert("Error during ListenBrainz download: " + err.message);
    } finally {
        lbLoading.classList.add('hidden');
        integrateBtn.disabled = false;
        downloadBtn.disabled = false;
        statusText.innerText = "Contacting API...";
    }
}

// --- Data Processing Logic (Spotify & ListenBrainz) ---
function getArtistTrackAndDate(entry) {
    let artist = entry.master_metadata_album_artist_name || entry.artistName;
    let track = entry.master_metadata_track_name || entry.trackName;
    let ms_played = entry.ms_played || entry.msPlayed || 0;
    let timestamp = entry.ts || entry.endTime;

    let date_str = null;
    if (timestamp && typeof timestamp === 'string' && timestamp.length >= 10) {
        date_str = timestamp.substring(0, 10);
    }
    return { artist, track, ms_played, date_str };
}

function formatTime(ms) {
    const total_minutes = ms / (1000 * 60);
    const hours = Math.floor(total_minutes / 60);
    const minutes = Math.floor(total_minutes % 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function getAllStreaks(listening_dates_set) {
    const dates = Array.from(listening_dates_set).sort();
    let streaks = [];
    if (dates.length === 0) return streaks;

    let currentStart = new Date(dates[0]);
    let currentLen = 1;
    let lastDate = currentStart;

    for (let i = 1; i < dates.length; i++) {
        let d = new Date(dates[i]);
        let diffTime = Math.abs(d - lastDate);
        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays === 1) {
            currentLen++;
            lastDate = d;
        } else if (diffDays > 1) {
            streaks.push({ start: currentStart, end: lastDate, length: currentLen });
            currentStart = d;
            lastDate = d;
            currentLen = 1;
        }
    }
    streaks.push({ start: currentStart, end: lastDate, length: currentLen });
    return streaks;
}

function processData(entries) {
    artistStats = {};
    trackStats = {};
    artistDates = {};
    let totalMs = 0;
    let validPlays = 0;

    entries.forEach(entry => {
        const { artist, track, ms_played, date_str } = getArtistTrackAndDate(entry);
        
        if (artist && track && ms_played >= 30000) {
            validPlays++;
            totalMs += ms_played;

            if (!artistStats[artist]) {
                artistStats[artist] = { count: 0, ms_played: 0 };
                artistDates[artist] = new Set();
            }
            artistStats[artist].count++;
            artistStats[artist].ms_played += ms_played;
            if (date_str) artistDates[artist].add(date_str);

            const trackKey = `${track}:::${artist}`;
            if (!trackStats[trackKey]) trackStats[trackKey] = { track, artist, count: 0, ms_played: 0 };
            
            trackStats[trackKey].count++;
            trackStats[trackKey].ms_played += ms_played;
        }
    });

    renderDashboard(validPlays, totalMs);
}

function renderDashboard(validPlays, totalMs) {
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    document.getElementById('total-tracks-stat').innerText = validPlays.toLocaleString();
    document.getElementById('total-artists-stat').innerText = Object.keys(artistStats).length.toLocaleString();
    document.getElementById('total-time-stat').innerText = formatTime(totalMs);

    const topArtists = Object.entries(artistStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);
    
    renderArtistsChart(topArtists);

    let allGlobalStreaks = [];
    for (const [artist, datesSet] of Object.entries(artistDates)) {
        const streaks = getAllStreaks(datesSet);
        streaks.forEach(s => { if (s.length > 1) allGlobalStreaks.push({ artist, ...s }); });
    }
    allGlobalStreaks.sort((a, b) => b.length - a.length);
    const top5Streaks = allGlobalStreaks.slice(0, 5);
    
    const streaksListEl = document.getElementById('global-streaks-list');
    streaksListEl.innerHTML = '';
    top5Streaks.forEach((s, idx) => {
        streaksListEl.innerHTML += `
            <li class="flex items-center justify-between bg-m3-surfaceContainer p-4 rounded-[20px] transition-colors">
                <div class="flex items-center min-w-0">
                    <div class="w-10 h-10 shrink-0 rounded-full bg-m3-error/20 text-m3-error flex items-center justify-center font-bold mr-4">${idx+1}</div>
                    <div class="min-w-0">
                        <div class="font-medium text-m3-onSurface truncate">${s.artist}</div>
                        <div class="text-xs text-m3-onSurfaceVariant">From ${s.start.toLocaleDateString()} to ${s.end.toLocaleDateString()}</div>
                    </div>
                </div>
                <div class="text-xl font-bold text-m3-error ml-4 shrink-0">${s.length} <span class="text-sm font-normal">days</span></div>
            </li>
        `;
    });

    renderTopSongs();
}

function renderTopSongs() {
    const limit = parseInt(songsLimitSelect.value, 10);
    const topSongs = Object.values(trackStats).sort((a, b) => b.count - a.count).slice(0, limit);
    const tbody = document.getElementById('top-songs-table');
    tbody.innerHTML = '';
    topSongs.forEach((song, idx) => {
        tbody.innerHTML += `
            <tr class="hover:bg-m3-surfaceContainer/50 transition-colors">
                <td class="py-4 px-5 text-m3-onSurfaceVariant">${idx+1}</td>
                <td class="py-4 px-5 font-medium text-m3-onSurface truncate max-w-[200px]" title="${song.track}">${song.track}</td>
                <td class="py-4 px-5 text-m3-onSurfaceVariant truncate max-w-[150px]">${song.artist}</td>
                <td class="py-4 px-5 text-m3-primary font-medium">${song.count.toLocaleString()}</td>
                <td class="py-4 px-5 text-m3-onSurfaceVariant">${formatTime(song.ms_played)}</td>
            </tr>
        `;
    });
}

function renderArtistsChart(topArtists) {
    const ctx = document.getElementById('artistsChart').getContext('2d');
    if (artistsChartInstance) artistsChartInstance.destroy();

    artistsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topArtists.map(a => a[0]),
            datasets: [{
                label: 'Plays',
                data: topArtists.map(a => a[1].count),
                backgroundColor: 'rgba(168, 85, 247, 0.6)',
                borderColor: 'rgba(168, 85, 247, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#9ca3af' } },
                x: { grid: { display: false }, ticks: { color: '#e5e7eb', font: { weight: 'bold' } } }
            }
        }
    });
}

function searchArtist() {
    const query = document.getElementById('artist-search-input').value.toLowerCase().trim();
    if (!query) return;

    let actualArtist = Object.keys(artistStats).find(a => a.toLowerCase() === query) 
                    || Object.keys(artistStats).find(a => a.toLowerCase().includes(query));

    const resultsDiv = document.getElementById('artist-results');
    if (!actualArtist) {
        alert("Artist not found in your listening history!");
        resultsDiv.classList.add('hidden');
        return;
    }

    document.getElementById('res-artist-name').innerText = actualArtist;
    
    const datesSet = artistDates[actualArtist];
    const streaks = getAllStreaks(datesSet);
    let recordText = "No streaks (single day listens)";
    if (streaks.length > 0) {
        const topStreak = streaks.reduce((max, s) => s.length > max.length ? s : max, streaks[0]);
        if (topStreak.length > 1) {
            recordText = `${topStreak.length} consecutive days (from ${topStreak.start.toLocaleDateString()} to ${topStreak.end.toLocaleDateString()})`;
        }
    }
    document.getElementById('res-artist-streak').innerText = recordText;

    const artistSongs = Object.values(trackStats)
        .filter(t => t.artist === actualArtist)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const songsUl = document.getElementById('res-artist-songs');
    songsUl.innerHTML = '';
    artistSongs.forEach((song, idx) => {
        songsUl.innerHTML += `
            <li class="flex justify-between items-center bg-m3-surface p-4 rounded-2xl transition-colors hover:bg-m3-surfaceContainer">
                <span class="font-medium text-m3-onSurface truncate pr-4" title="${song.track}"><span class="text-m3-onSurfaceVariant mr-3 w-4 inline-block">${idx+1}.</span>${song.track}</span>
                <span class="text-m3-primary font-medium shrink-0">${song.count} plays</span>
            </li>
        `;
    });

    resultsDiv.classList.remove('hidden');
    resultsDiv.classList.remove('animate-fade-in');
    void resultsDiv.offsetWidth; 
    resultsDiv.classList.add('animate-fade-in');
}
