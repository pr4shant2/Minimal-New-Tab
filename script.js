/**
 * ============================================================================
 * MINIMAL NEW TAB - MAIN APPLICATION LOGIC
 * ============================================================================
 * Bulletproof, Zero-Leak, GPU-Accelerated Extension.
 * Optimized for personal use: clean, fast, zero bloat.
 */

// ============================================================================
// 1. GLOBAL DOM CACHE
// ============================================================================
const DOM = {
    weather: document.getElementById('weather'),
    themeToggleBtn: document.getElementById('theme-toggle'),
    moonIcon: document.getElementById('moon-icon'),
    sunIcon: document.getElementById('sun-icon')
};

// ============================================================================
// 2. CLOCK & DATE MODULE
// ============================================================================
const ClockModule = (function() {
    let lastDateDay = -1;
    let timeHm, timeAmpm;
    let isRunning = false;
    let syncTimeoutId = null;

    // Pre-allocated array of string numbers 00-59 to prevent GC allocations
    const DIGITS = [];
    for (let i = 0; i < 60; i++) {
        DIGITS.push(i < 10 ? '0' + i : '' + i);
    }

    function initDOM() {
        timeHm = document.getElementById('time-hm');
        timeAmpm = document.getElementById('time-ampm');
    }

    function update() {
        const now = new Date();

        let h = now.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;

        const hours = DIGITS[h];
        const minutes = DIGITS[now.getMinutes()];

        // Zero-reflow textContent updates
        const newHm = hours + ':' + minutes;
        if (timeHm.textContent !== newHm) {
            timeHm.textContent = newHm;
        }
        if (timeAmpm.textContent !== ampm) {
            timeAmpm.textContent = ampm;
        }

        const currentDay = now.getDate();
        if (lastDateDay !== currentDay) {
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(currentDay).padStart(2, '0');
            const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
            
            const newDateStr = dayName + ' | ' + dd + '-' + mm + '-' + yyyy;
            const stripDate = document.getElementById('strip-date');
            if (stripDate && stripDate.textContent !== newDateStr) {
                stripDate.textContent = newDateStr;
            }
            lastDateDay = currentDay;
            
            // Trigger daily UI updates
            if (typeof updateGreeting !== 'undefined') updateGreeting();
        }
    }

    // Ultimate Drift-Free Clock Loop
    function scheduleNext() {
        if (!isRunning) return;
        update();
        
        // Also keep progress bar strictly real-time on the minute mark
        if (typeof YearProgressModule !== 'undefined' && YearProgressModule.update) {
            YearProgressModule.update();
        }

        const delay = 60000 - (Date.now() % 60000);
        syncTimeoutId = setTimeout(scheduleNext, delay);
    }

    function start() {
        if (isRunning) return;
        isRunning = true;
        scheduleNext();
    }

    function stop() {
        isRunning = false;
        if (syncTimeoutId !== null) {
            clearTimeout(syncTimeoutId);
            syncTimeoutId = null;
        }
    }

    return {
        init: function() {
            initDOM();
            start();
        },
        pause: stop,
        resume: start
    };
})();

// ============================================================================
// 3. WEATHER SYSTEM MODULE
// ============================================================================
const WeatherModule = (function() {
    let LAT = localStorage.getItem('userLat');
    let LON = localStorage.getItem('userLon');
    let LOC_NAME = localStorage.getItem('userCity');
    const CACHE_DURATION = 600000; // 10 minutes
    let weatherIntervalId = null;
    let isFetching = false;

    function renderUI(data) {
        if (!data || !data.current) return;

        const current = data.current;
        const code = current.weather_code;

        let icon = '🌤️';
        let weatherClass = 'sunny';
        if (code === 0) { icon = '☀️'; weatherClass = 'sunny'; }
        else if (code >= 1 && code <= 3) { icon = '⛅'; weatherClass = 'cloudy'; }
        else if (code === 45 || code === 48) { icon = '🌫️'; weatherClass = 'foggy'; }
        else if (code >= 51 && code <= 67) { icon = '🌧️'; weatherClass = 'rainy'; }
        else if (code >= 71 && code <= 77) { icon = '❄️'; weatherClass = 'snowy'; }
        else if (code >= 80 && code <= 82) { icon = '🌦️'; weatherClass = 'rainy'; }
        else if (code >= 95 && code <= 99) { icon = '⛈️'; weatherClass = 'stormy'; }

        DOM.weather.className = 'weather-widget weather-' + weatherClass;

        DOM.weather.innerHTML =
            '<div class="weather-container" title="' + LOC_NAME + '">' +
                '<span class="weather-icon">' + icon + '</span>' +
                '<span class="weather-temp">' + Math.round(current.temperature_2m) + '°</span>' +
                '<span class="weather-sep">•</span>' +
                '<span class="weather-feels">Feels ' + Math.round(current.apparent_temperature) + '°</span>' +
                '<span class="weather-sep">•</span>' +
                '<span class="weather-loc">' + (LOC_NAME ? LOC_NAME.split(',')[0] : 'Unknown') + '</span>' +
                '<span class="weather-sep">•</span>' +
                '<span class="weather-humidity">💧 ' + Math.round(current.relative_humidity_2m) + '%</span>' +
            '</div>';
    }

    async function fetchWeather() {
        // Refresh local variables in case they changed in options
        LAT = localStorage.getItem('userLat');
        LON = localStorage.getItem('userLon');
        LOC_NAME = localStorage.getItem('userCity');

        if (!LAT || !LON) {
            DOM.weather.innerHTML = '<div id="setup-loc-btn" class="weather-container" style="color:var(--text-sec);font-size:0.95rem;cursor:pointer" title="Open Settings">⚙️ Setup Location</div>';
            document.getElementById('setup-loc-btn').addEventListener('click', SettingsModule.open);
            return;
        }

        if (isFetching) return;
        isFetching = true;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(function() { controller.abort(); }, 5000);

            const res = await fetch(
                'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code',
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error('Network error');
            const data = await res.json();

            if (data && data.current) {
                localStorage.setItem('weatherData', JSON.stringify(data));
                localStorage.setItem('weatherTimestamp', '' + Date.now());
                renderUI(data);
            }
        } catch (err) {
            if (err.name !== 'AbortError' && !localStorage.getItem('weatherData')) {
                DOM.weather.innerHTML = '<div class="weather-main" title="Error Loading">⚠️ Weather N/A</div><div class="weather-sub">Check settings & network</div>';
            }
        } finally {
            isFetching = false;
        }
    }

    function start() {
        if (weatherIntervalId !== null) return;
        const cachedTime = localStorage.getItem('weatherTimestamp');
        const cachedData = localStorage.getItem('weatherData');
        if (!cachedTime || !cachedData || (Date.now() - parseInt(cachedTime, 10)) > CACHE_DURATION) {
            fetchWeather();
        }
        weatherIntervalId = setInterval(fetchWeather, CACHE_DURATION);
    }

    function stop() {
        if (weatherIntervalId !== null) {
            clearInterval(weatherIntervalId);
            weatherIntervalId = null;
        }
    }

    return {
        init: function() {
            const cachedData = localStorage.getItem('weatherData');
            if (cachedData) {
                try { renderUI(JSON.parse(cachedData)); } catch(e) { }
            } else {
                DOM.weather.innerHTML = '<div class="weather-main" style="color:#5f6368;font-size:1.2rem">⏳ Loading weather...</div>';
            }
            start();
        },
        pause: stop,
        resume: start
    };
})();

// ============================================================================
// 4. THEME MODULE
// ============================================================================
const ThemeModule = (function() {
    function toggleTheme() {
        let currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        let newTheme = currentTheme === 'light' ? 'dark' : 'light';
        if (newTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('theme', newTheme);
    }

    return {
        init: function() {
            if (DOM.themeToggleBtn) {
                DOM.themeToggleBtn.addEventListener('click', toggleTheme);
            }
        }
    };
})();

// ============================================================================
// 4b. YEAR PROGRESS MODULE (Super efficient, respects Visibility API)
// ============================================================================
const YearProgressModule = (function() {
    let progressIntervalId = null;
    let fillEl = null;
    let textEl = null;
    let labelEl = null;
    let monthSpans = [];

    // Cache variables to prevent Date creation and DOM recalculation overhead
    let cachedYear = -1;
    let yearStartMs = 0;
    let yearEndMs = 0;
    let lastActiveMonth = -1;

    function initDOM() {
        fillEl = document.getElementById('year-progress-fill');
        textEl = document.getElementById('year-progress-text');
        labelEl = document.getElementById('year-progress-label');
        const monthsContainer = document.getElementById('strip-months-row');
        if (monthsContainer) {
            monthSpans = monthsContainer.getElementsByTagName('span');
        }
    }

    function update() {
        if (!fillEl || !textEl) return;

        const now = new Date();
        const currentMs = now.getTime();
        const currentYear = now.getFullYear();

        // Calculate boundaries only when the year transitions (once a year)
        if (currentYear !== cachedYear) {
            cachedYear = currentYear;
            yearStartMs = new Date(currentYear, 0, 1).getTime();
            yearEndMs = new Date(currentYear + 1, 0, 1).getTime();
            
            const labelText = currentYear + ' Progress';
            if (labelEl && labelEl.textContent !== labelText) {
                labelEl.textContent = labelText;
            }
        }

        const progress = (currentMs - yearStartMs) / (yearEndMs - yearStartMs);
        const percentage = Math.max(0, Math.min(100, progress * 100));

        // High precision for static width, integer for text
        const widthStr = percentage.toFixed(4) + '%';
        const textStr = Math.floor(percentage) + '%';

        // Update elements only on change (zero-reflow checks)
        if (fillEl.style.width !== widthStr) {
            fillEl.style.width = widthStr;
        }

        if (textEl.textContent !== textStr) {
            textEl.textContent = textStr;
        }

        // Highlight active month dynamically (runs once a month!)
        const currentMonth = now.getMonth();
        if (currentMonth !== lastActiveMonth) {
            for (let i = 0; i < monthSpans.length; i++) {
                if (i === currentMonth) {
                    if (!monthSpans[i].classList.contains('active')) {
                        monthSpans[i].classList.add('active');
                    }
                } else {
                    if (monthSpans[i].classList.contains('active')) {
                        monthSpans[i].classList.remove('active');
                    }
                }
            }
            lastActiveMonth = currentMonth;
        }
    }

    return {
        init: function() {
            initDOM();
            update();
        },
        update: update,
        pause: function() {},
        resume: update
    };
})();

// ============================================================================
// 4c. 100+ SAVAGE QUOTE MODULE (Updates Daily + On Click)
// ============================================================================
const QuoteModule = (function() {
    // FAMOUS_QUOTES loaded globally from quotes.js

    let cachedVal = -1;
    let textEl = null;
    let authorEl = null;
    let quoteWidget = null;
    
    // Store click offset in localStorage to persist across reloads
    let clickOffset = parseInt(localStorage.getItem('quoteClickOffset') || '0', 10);

    function update() {
        if (!textEl) return;
        const now = new Date();
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        
        // Combine the daily value and the click counts
        const combinedVal = dayOfYear + clickOffset;
        
        if (cachedVal !== combinedVal) {
            cachedVal = combinedVal;
            const quoteObj = FAMOUS_QUOTES[combinedVal % FAMOUS_QUOTES.length];
            textEl.textContent = quoteObj.text;
            if(authorEl) authorEl.textContent = "- " + quoteObj.author;
        }
    }

    function changeQuote() {
        if (!textEl) return;
        quoteWidget.style.opacity = '0'; // Fade out entire widget
        setTimeout(() => {
            clickOffset++;
            localStorage.setItem('quoteClickOffset', clickOffset);
            update();
            quoteWidget.style.opacity = '1'; // Fade in
        }, 200);
    }

    return {
        init: function() {
            textEl = document.getElementById('quote-text');
            authorEl = document.getElementById('quote-author');
            quoteWidget = document.getElementById('quote-widget');
            
            if (quoteWidget) {
                function triggerQuoteChange() {
                    // Small visual feedback
                    quoteWidget.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        quoteWidget.style.transform = '';
                    }, 150);
                    changeQuote();
                }

                document.addEventListener('keydown', function(e) {
                    if (e.repeat) return; // Ignore continuous key press

                    if (e.code === 'Space' || e.key === ' ') {
                        // Only prevent default if we're not inside an input (just in case)
                        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                            e.preventDefault();
                            triggerQuoteChange();
                        }
                    }
                });
            }
            
            update();
        },
        resume: update
    };
})();

// ============================================================================
// 5. VISIBILITY MANAGER — Pause/Resume on tab hide/show
// ============================================================================
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        ClockModule.pause();
        WeatherModule.pause();
        YearProgressModule.pause();
    } else {
        ClockModule.resume();
        WeatherModule.resume();
        YearProgressModule.resume();
        QuoteModule.resume();
    }
});

// ============================================================================
// 6. SETTINGS MODULE (Modal & Geocoding)
// ============================================================================
const SettingsModule = (function() {
    let modal, openBtn, closeBtn, saveBtn, nameInput, cityInput, geoStatus, saveMsg;

    function initDOM() {
        modal = document.getElementById('settings-modal');
        openBtn = document.getElementById('settings-open-btn');
        closeBtn = document.getElementById('settings-close-btn');
        saveBtn = document.getElementById('saveBtn');
        nameInput = document.getElementById('userName');
        cityInput = document.getElementById('userCity');
        geoStatus = document.getElementById('geo-status');
        saveMsg = document.getElementById('save-msg');
    }

    function open() {
        if (!modal) return;
        nameInput.value = localStorage.getItem('userName') || '';
        cityInput.value = localStorage.getItem('userCity') || '';
        geoStatus.textContent = '';
        saveMsg.textContent = '';
        modal.classList.remove('hidden');
    }

    function close() {
        if (!modal) return;
        modal.classList.add('hidden');
    }

    async function save() {
        saveBtn.disabled = true;
        saveMsg.textContent = '';
        geoStatus.textContent = '';
        
        const nameVal = nameInput.value.trim();
        const cityVal = cityInput.value.trim();

        if (nameVal) {
            localStorage.setItem('userName', nameVal);
        } else {
            localStorage.removeItem('userName');
        }
        
        // Immediate update for greeting
        if (typeof updateGreeting !== 'undefined') updateGreeting();

        if (!cityVal) {
            localStorage.removeItem('userCity');
            localStorage.removeItem('userLat');
            localStorage.removeItem('userLon');
            localStorage.removeItem('weatherData');
            localStorage.removeItem('weatherTimestamp');
            showSuccess();
            // Force weather update
            WeatherModule.init();
            return;
        }

        // If city changed, fetch new coordinates
        if (cityVal !== localStorage.getItem('userCity')) {
            geoStatus.textContent = 'Searching location...';
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityVal)}&count=1&language=en&format=json`);
                const data = await res.json();
                
                if (data.results && data.results.length > 0) {
                    const loc = data.results[0];
                    localStorage.setItem('userCity', loc.name + (loc.admin1 ? ', ' + loc.admin1 : ''));
                    localStorage.setItem('userLat', loc.latitude);
                    localStorage.setItem('userLon', loc.longitude);
                    localStorage.removeItem('weatherData');
                    localStorage.removeItem('weatherTimestamp');
                    
                    cityInput.value = localStorage.getItem('userCity');
                    geoStatus.textContent = 'Location found: ' + loc.country;
                    showSuccess();
                    
                    // Force weather update
                    WeatherModule.init();
                } else {
                    geoStatus.textContent = '❌ Location not found. Try another city.';
                    saveBtn.disabled = false;
                }
            } catch (err) {
                geoStatus.textContent = '❌ Error connecting to geocoding API.';
                saveBtn.disabled = false;
            }
        } else {
            showSuccess();
        }
    }

    function showSuccess() {
        saveMsg.textContent = '✅ Settings Saved!';
        saveBtn.disabled = false;
        setTimeout(() => { 
            saveMsg.textContent = ''; 
            close(); 
        }, 1500);
    }

    return {
        init: function() {
            initDOM();
            if (openBtn) openBtn.addEventListener('click', open);
            if (closeBtn) closeBtn.addEventListener('click', close);
            if (saveBtn) saveBtn.addEventListener('click', save);
            
            // Close on outside click
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) close();
                });
            }
        },
        open: open
    };
})();

// ============================================================================
// 7. INITIALIZATION
// ============================================================================
function updateGreeting() {
    const now = new Date();
    const hrs = now.getHours();
    let greet = 'Good morning';

    if (hrs >= 5 && hrs < 12) greet = 'Good morning';
    else if (hrs >= 12 && hrs < 17) greet = 'Good afternoon';
    else if (hrs >= 17 && hrs < 22) greet = 'Good evening';
    else greet = 'Good night';

    let userName = localStorage.getItem('userName');
    if (!userName) userName = 'Friend';

    const greetingEl = document.getElementById('greeting-text');
    if (greetingEl) {
        const newGreet = greet + ', ' + userName;
        if (greetingEl.textContent !== newGreet) {
            greetingEl.textContent = newGreet;
        }
    }
}

// Initialize critical modules immediately for 0ms TTI
ThemeModule.init();
ClockModule.init();
updateGreeting();
YearProgressModule.init();
QuoteModule.init();
SettingsModule.init();

// Defer non-critical network and rendering modules to idle time
if ('requestIdleCallback' in window) {
    requestIdleCallback(function() {
        WeatherModule.init();
    });
} else {
    setTimeout(function() {
        WeatherModule.init();
    }, 1);
}
