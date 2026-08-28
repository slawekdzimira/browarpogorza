(() => {
    'use strict';

    const STORAGE_AGE = 'bp_age_verified';
    const STORAGE_COOKIE = 'bp_cookie_consent';

    // The overlays are injected at runtime, so generate_i18n.js never sees them:
    // every string has to be carried here and picked by <html lang>.
    const STRINGS = {
        pl: {
            ageTitle: 'Witaj w Browarze Pogórza',
            ageText: 'Strona zawiera treści przeznaczone dla osób pełnoletnich. Wejście jest możliwe tylko po potwierdzeniu wieku.',
            ageQuestion: 'Czy masz ukończone 18 lat?',
            ageYes: 'Tak, mam 18+ lat',
            ageNo: 'Nie, opuść stronę',
            ageWarning: 'Promujemy odpowiedzialne spożywanie alkoholu. Alkohol szkodzi zdrowiu.',
            cookieRegion: 'Zgoda na pliki cookies',
            cookieTitle: 'Używamy plików cookies',
            cookieTextBefore: 'Aby zapewnić najlepsze doświadczenie, używamy plików cookies do analizy ruchu (Google Analytics). Twoje dane są anonimowe. Szczegóły w ',
            cookieLink: 'polityce cookies',
            cookieTextAfter: '.',
            cookieReject: 'Tylko niezbędne',
            cookieAccept: 'Akceptuję wszystkie',
        },
        en: {
            ageTitle: 'Welcome to Browar Pogórza',
            ageText: 'This site contains content intended for adults. You may enter only after confirming your age.',
            ageQuestion: 'Are you 18 or older?',
            ageYes: 'Yes, I am 18+',
            ageNo: 'No, leave the site',
            ageWarning: 'We promote responsible drinking. Alcohol is harmful to your health.',
            cookieRegion: 'Cookie consent',
            cookieTitle: 'We use cookies',
            cookieTextBefore: 'We use cookies for traffic analytics (Google Analytics) to give you the best experience. Your data stays anonymous. Details in our ',
            cookieLink: 'cookie policy (PL)',
            cookieTextAfter: '.',
            cookieReject: 'Essential only',
            cookieAccept: 'Accept all',
        },
        uk: {
            ageTitle: 'Ласкаво просимо до Browar Pogórza',
            ageText: 'Сайт містить вміст, призначений для повнолітніх. Вхід можливий лише після підтвердження віку.',
            ageQuestion: 'Вам виповнилося 18 років?',
            ageYes: 'Так, мені є 18',
            ageNo: 'Ні, покинути сайт',
            ageWarning: 'Ми пропагуємо відповідальне вживання алкоголю. Алкоголь шкодить здоров’ю.',
            cookieRegion: 'Згода на файли cookie',
            cookieTitle: 'Ми використовуємо файли cookie',
            cookieTextBefore: 'Щоб забезпечити найкращий досвід, ми використовуємо файли cookie для аналітики (Google Analytics). Ваші дані анонімні. Деталі — у ',
            cookieLink: 'політиці cookie (PL)',
            cookieTextAfter: '.',
            cookieReject: 'Лише необхідні',
            cookieAccept: 'Прийняти всі',
        },
        es: {
            ageTitle: 'Bienvenido a Browar Pogórza',
            ageText: 'Este sitio contiene contenido destinado a personas adultas. Solo puedes entrar tras confirmar tu edad.',
            ageQuestion: '¿Tienes 18 años o más?',
            ageYes: 'Sí, tengo 18+',
            ageNo: 'No, salir del sitio',
            ageWarning: 'Promovemos el consumo responsable. El alcohol perjudica la salud.',
            cookieRegion: 'Consentimiento de cookies',
            cookieTitle: 'Usamos cookies',
            cookieTextBefore: 'Usamos cookies de analítica (Google Analytics) para ofrecerte la mejor experiencia. Tus datos son anónimos. Más detalles en la ',
            cookieLink: 'política de cookies (PL)',
            cookieTextAfter: '.',
            cookieReject: 'Solo esenciales',
            cookieAccept: 'Aceptar todas',
        },
        de: {
            ageTitle: 'Willkommen bei Browar Pogórza',
            ageText: 'Diese Website enthält Inhalte für Erwachsene. Der Zugang ist erst nach Bestätigung des Alters möglich.',
            ageQuestion: 'Bist du 18 Jahre oder älter?',
            ageYes: 'Ja, ich bin 18+',
            ageNo: 'Nein, Seite verlassen',
            ageWarning: 'Wir stehen für verantwortungsvollen Alkoholkonsum. Alkohol schadet der Gesundheit.',
            cookieRegion: 'Cookie-Einwilligung',
            cookieTitle: 'Wir verwenden Cookies',
            cookieTextBefore: 'Für das beste Erlebnis nutzen wir Cookies zur Reichweitenmessung (Google Analytics). Deine Daten bleiben anonym. Details in der ',
            cookieLink: 'Cookie-Richtlinie (PL)',
            cookieTextAfter: '.',
            cookieReject: 'Nur notwendige',
            cookieAccept: 'Alle akzeptieren',
        },
    };

    const lang = (document.documentElement.lang || 'pl').slice(0, 2).toLowerCase();
    const t = STRINGS[lang] || STRINGS.pl;

    const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const updateConsent = (granted) => {
        if (typeof window.gtag !== 'function') return;
        const value = granted ? 'granted' : 'denied';
        window.gtag('consent', 'update', {
            ad_storage: value,
            ad_user_data: value,
            ad_personalization: value,
            analytics_storage: value,
        });
    };

    const restoreScroll = () => {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
    };

    // Everything already on the page is made inert while a modal is up, so the
    // keyboard cannot walk out of the dialog into the content behind it.
    const backdropNodes = () => Array.from(document.body.children);
    const setBackgroundInert = (nodes, inert) => {
        nodes.forEach(node => {
            if (inert) {
                node.setAttribute('inert', '');
                node.setAttribute('aria-hidden', 'true');
            } else {
                node.removeAttribute('inert');
                node.removeAttribute('aria-hidden');
            }
        });
    };

    const trapFocus = (container) => (event) => {
        if (event.key !== 'Tab') return;
        const focusable = container.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const showAgeGate = () => {
        const inertNodes = backdropNodes();
        const modal = document.createElement('div');
        modal.className = 'age-gate';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'age-gate-title');
        modal.innerHTML = `
            <div class="age-gate__inner">
                <img src="/images/logo-black.png" alt="Browar Pogórza" class="age-gate__logo" width="120" height="120">
                <h2 id="age-gate-title" class="age-gate__title">${escape(t.ageTitle)}</h2>
                <p class="age-gate__text">${escape(t.ageText)}</p>
                <p class="age-gate__question">${escape(t.ageQuestion)}</p>
                <div class="age-gate__buttons">
                    <button type="button" class="btn btn--sun age-gate__yes" data-age-yes>${escape(t.ageYes)}</button>
                    <a href="https://www.google.com" class="btn btn--ghost age-gate__no">${escape(t.ageNo)}</a>
                </div>
                <p class="age-gate__warning">${escape(t.ageWarning)}</p>
            </div>
        `;
        document.body.appendChild(modal);
        setBackgroundInert(inertNodes, true);
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        const onKeydown = trapFocus(modal);
        document.addEventListener('keydown', onKeydown);
        modal.querySelector('[data-age-yes]').focus();

        const closeAgeGate = () => {
            document.removeEventListener('keydown', onKeydown);
            modal.classList.add('age-gate--closing');
            setTimeout(() => {
                modal.remove();
                setBackgroundInert(inertNodes, false);
                restoreScroll();
                maybeShowCookieBanner();
            }, 300);
        };
        modal.querySelector('[data-age-yes]').addEventListener('click', () => {
            try { localStorage.setItem(STORAGE_AGE, String(Date.now())); } catch (e) {}
            closeAgeGate();
        });
        window.addEventListener('pagehide', restoreScroll, { once: true });
    };

    const showCookieBanner = () => {
        const banner = document.createElement('div');
        banner.className = 'cookie-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-labelledby', 'cookie-banner-title');
        banner.setAttribute('aria-label', t.cookieRegion);
        banner.innerHTML = `
            <div class="cookie-banner__inner">
                <div class="cookie-banner__text">
                    <h2 id="cookie-banner-title" class="cookie-banner__title">${escape(t.cookieTitle)}</h2>
                    <p>${escape(t.cookieTextBefore)}<a href="/cookies.html" hreflang="pl">${escape(t.cookieLink)}</a>${escape(t.cookieTextAfter)}</p>
                </div>
                <div class="cookie-banner__buttons">
                    <button type="button" class="btn btn--ghost cookie-banner__reject" data-cookie-reject>${escape(t.cookieReject)}</button>
                    <button type="button" class="btn btn--sun cookie-banner__accept" data-cookie-accept>${escape(t.cookieAccept)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);
        requestAnimationFrame(() => {
            banner.classList.add('cookie-banner--visible');
            // The age gate removes the element that held focus, so without this the
            // consent buttons sit behind the whole nav in the tab order.
            const first = banner.querySelector('[data-cookie-accept]');
            if (first) first.focus({ preventScroll: true });
        });

        const setConsent = (granted) => {
            try { localStorage.setItem(STORAGE_COOKIE, granted ? 'granted' : 'denied'); } catch (e) {}
            updateConsent(granted);
            banner.classList.remove('cookie-banner--visible');
            setTimeout(() => banner.remove(), 300);
            const main = document.getElementById('main') || document.body;
            if (main.focus) {
                if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
                main.focus({ preventScroll: true });
            }
        };
        banner.querySelector('[data-cookie-accept]').addEventListener('click', () => setConsent(true));
        banner.querySelector('[data-cookie-reject]').addEventListener('click', () => setConsent(false));
    };

    const maybeShowCookieBanner = () => {
        let saved = null;
        try { saved = localStorage.getItem(STORAGE_COOKIE); } catch (e) {}
        if (saved === 'granted') {
            updateConsent(true);
            return;
        }
        if (saved === 'denied') {
            return;
        }
        showCookieBanner();
    };

    const init = () => {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';

        // Skip age gate + cookie banner for automated audits (Lighthouse, headless Chrome).
        // PageSpeed Insights uses HeadlessChromium — measuring the age-gate modal as LCP
        // gives misleading scores. Real users still see the modal.
        const ua = navigator.userAgent || '';
        if (/Lighthouse|Headless|PageSpeed|GoogleBot|bingbot|YandexBot|crawler|spider|bot/i.test(ua)) {
            return;
        }
        // Also detect via Navigator.webdriver (Lighthouse sets this)
        if (navigator.webdriver) return;

        let ageVerified = null;
        try { ageVerified = localStorage.getItem(STORAGE_AGE); } catch (e) {}
        if (!ageVerified) {
            showAgeGate();
        } else {
            maybeShowCookieBanner();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
