(() => {
    'use strict';

    const nav = document.getElementById('nav');
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');

    // Pages that open on a light background need the solid header from the start -
    // the transparent state paints cream links on a cream page.
    const isProductPage = document.body.classList.contains('product-page')
        || document.body.classList.contains('legal-page');
    const onScroll = () => {
        nav.classList.toggle('is-scrolled', isProductPage || window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const setMenu = (open) => {
        navToggle.classList.toggle('is-open', open);
        navMenu.classList.toggle('is-open', open);
        navToggle.setAttribute('aria-expanded', String(open));
    };

    navToggle.addEventListener('click', () => setMenu(!navMenu.classList.contains('is-open')));

    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => setMenu(false));
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !navMenu.classList.contains('is-open')) return;
        setMenu(false);
        navToggle.focus();
    });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');

    setupLightbox();
    setupBackgroundVideo();
    setupVideoFacades();

    // YouTube costs roughly a megabyte of third-party JavaScript, so nothing is
    // requested until the section is on screen - and never on a phone, a slow
    // connection, or when the visitor asked for less motion. The still photo
    // underneath is the poster, so the section looks finished either way.
    function setupBackgroundVideo() {
        const holder = document.querySelector('[data-yt-bg]');
        if (!holder || !('IntersectionObserver' in window)) return;

        if (reducedMotion.matches) return;
        if (window.matchMedia('(max-width: 900px)').matches) return;
        if (window.matchMedia('(hover: none)').matches) return;
        const connection = navigator.connection || {};
        if (connection.saveData) return;
        if (/^([23]g|slow-2g)$/.test(connection.effectiveType || '')) return;

        const id = holder.getAttribute('data-yt-bg');
        let frame = null;

        // Muted, looped, no chrome: it is decoration, not a player. nocookie host
        // keeps YouTube from writing tracking cookies for people who never watch.
        const load = () => {
            frame = document.createElement('iframe');
            frame.title = 'Browar Pogórza';
            frame.tabIndex = -1;
            frame.setAttribute('aria-hidden', 'true');
            frame.setAttribute('allow', 'autoplay; encrypted-media');
            frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            // start=12 skips the channel intro so the first thing on screen is footage.
            frame.src = 'https://www.youtube-nocookie.com/embed/' + id
                + '?autoplay=1&mute=1&loop=1&playlist=' + id + '&start=12'
                + '&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&enablejsapi=1';
            frame.addEventListener('load', () => {
                holder.classList.add('is-playing');
                // Moving footage is brighter and busier than the still poster, so the
                // section asks for a heavier scrim while it plays.
                const section = holder.closest('.banner');
                if (section) section.classList.add('has-video');
            });
            holder.appendChild(frame);
        };

        // Playing off-screen burns CPU and battery for nothing.
        const command = (func) => {
            if (!frame || !frame.contentWindow) return;
            frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
        };

        // The photo gets its five seconds first: the player is only requested if the
        // visitor is still looking at this section after the dwell, so scrolling past
        // costs nothing and the still image is what a passer-by sees.
        const DWELL_MS = 5000;
        let dwellTimer = null;

        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (frame) {
                        command('playVideo');
                    } else if (!dwellTimer) {
                        dwellTimer = window.setTimeout(() => {
                            dwellTimer = null;
                            if (!frame) load();
                        }, DWELL_MS);
                    }
                } else {
                    if (dwellTimer) {
                        window.clearTimeout(dwellTimer);
                        dwellTimer = null;
                    }
                    if (frame) command('pauseVideo');
                }
            });
        }, { threshold: 0.35 });
        io.observe(holder);
    }

    // Review cards stay a poster plus a real YouTube link until clicked; the embed
    // is built on the click, so the page carries no third-party weight by default.
    function setupVideoFacades() {
        document.querySelectorAll('[data-yt-facade]').forEach(facade => {
            facade.addEventListener('click', event => {
                const id = facade.getAttribute('data-yt-facade');
                const start = facade.getAttribute('data-yt-start');
                const media = facade.querySelector('.video-facade__media');
                if (!id || !media) return;                 // fall through to the href
                event.preventDefault();

                const frame = document.createElement('iframe');
                frame.title = facade.getAttribute('data-yt-title') || 'YouTube';
                frame.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture');
                frame.setAttribute('allowfullscreen', '');
                frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                frame.src = 'https://www.youtube-nocookie.com/embed/' + id
                    + '?autoplay=1&rel=0&modestbranding=1&playsinline=1'
                    + (start ? '&start=' + start : '');
                media.innerHTML = '';
                media.appendChild(frame);
                facade.classList.add('is-playing');
                facade.removeAttribute('target');
                track('video_play', { video_id: id, source: facade.getAttribute('data-yt-source') || 'facade' });
            });
        });
    }

    // Only the gallery pages carry the overlay markup; without this guard the
    // rest of the script (reveal, back-to-top, analytics) never runs elsewhere.
    function setupLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');
    if (!lightbox || !lightboxImg || !lightboxClose) return;
    const lightboxPrev = document.getElementById('lightbox-prev');
    const lightboxNext = document.getElementById('lightbox-next');
    const lightboxCounter = document.getElementById('lightbox-counter');

    // The whole gallery is one browsable set: arrows, keyboard and swipe move
    // through it without closing and reopening the overlay.
    const triggers = Array.from(document.querySelectorAll('.lightbox-trigger'));
    const slides = triggers.map(a => ({
        src: a.getAttribute('href'),
        alt: (a.querySelector('img') || {}).alt || '',
    }));
    const multiple = slides.length > 1;
    let current = 0;

    const showSlide = index => {
        current = (index + slides.length) % slides.length;
        const slide = slides[current];
        lightboxImg.src = slide.src;
        lightboxImg.alt = slide.alt;
        if (lightboxCounter) lightboxCounter.textContent = multiple ? `${current + 1} / ${slides.length}` : '';
    };

    // Everything except the overlay is made inert while it is open, so Tab
    // cannot walk into the page behind it, and focus returns to the thumbnail.
    const backdrop = () => Array.from(document.body.children).filter(node => node !== lightbox);
    let returnFocusTo = null;

    const openLightbox = index => {
        returnFocusTo = triggers[index] || null;
        showSlide(index);
        lightbox.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        backdrop().forEach(node => { node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true'); });
        (multiple ? lightboxNext : lightboxClose).focus();
    };
    const closeLightbox = () => {
        lightbox.classList.remove('is-open');
        lightboxImg.src = '';
        document.body.style.overflow = '';
        backdrop().forEach(node => { node.removeAttribute('inert'); node.removeAttribute('aria-hidden'); });
        if (returnFocusTo) returnFocusTo.focus();
        returnFocusTo = null;
    };
    const isOpen = () => lightbox.classList.contains('is-open');

    triggers.forEach((a, index) => {
        a.addEventListener('click', e => {
            e.preventDefault();
            openLightbox(index);
        });
    });

    [lightboxPrev, lightboxNext].forEach((btn, i) => {
        if (!btn) return;
        btn.hidden = !multiple;
        btn.addEventListener('click', e => {
            e.stopPropagation();
            showSlide(current + (i === 0 ? -1 : 1));
        });
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', e => {
        if (!isOpen()) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft' && multiple) showSlide(current - 1);
        else if (e.key === 'ArrowRight' && multiple) showSlide(current + 1);
        else if (e.key === 'Tab') {
            // Inert handles the page behind; this keeps the cycle inside the dialog.
            const stops = [lightboxClose, multiple ? lightboxPrev : null, multiple ? lightboxNext : null].filter(Boolean);
            const index = stops.indexOf(document.activeElement);
            e.preventDefault();
            stops[(index + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
        }
    });

    // Horizontal swipe on touch devices; a mostly vertical drag is ignored.
    let touchStartX = null;
    let touchStartY = null;
    lightbox.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    lightbox.addEventListener('touchend', e => {
        if (touchStartX === null || !multiple) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) showSlide(current + (dx < 0 ? 1 : -1));
        touchStartX = null;
        touchStartY = null;
    }, { passive: true });
    }

    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const revealTargets = document.querySelectorAll(
        '.h2, .lead, .facts__item, .chapter, .beer-card, .gallery__item, .partner, .puszka-frame, .contact__form, .map-wrap, .split__visual--photo, .check-list, .emph, .banner__title, .banner__lead'
    );
    revealTargets.forEach(el => el.classList.add('reveal'));

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -80px 0px' });
        revealTargets.forEach(el => io.observe(el));
    } else {
        revealTargets.forEach(el => el.classList.add('is-visible'));
    }

    const track = (name, params = {}) => {
        if (typeof window.gtag === 'function') window.gtag('event', name, params);
    };

    const scrollMarks = [25, 50, 75, 90];
    const reached = new Set();
    window.addEventListener('scroll', () => {
        const h = document.documentElement;
        const pct = Math.round(((window.scrollY + window.innerHeight) / h.scrollHeight) * 100);
        scrollMarks.forEach(m => {
            if (pct >= m && !reached.has(m)) {
                reached.add(m);
                track('scroll', { percent_scrolled: m });
            }
        });
    }, { passive: true });

    document.addEventListener('click', e => {
        const a = e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.startsWith('tel:')) {
            track('phone_click', { phone: href.replace('tel:', '') });
        } else if (href.startsWith('mailto:')) {
            track('email_click', { email: href.replace('mailto:', '') });
        } else if (/^https?:\/\//i.test(href) && !href.includes(location.hostname)) {
            track('outbound_click', { link_url: href, link_domain: new URL(href).hostname });
        }
    });

    const form = document.querySelector('.contact__form');
    if (form) form.addEventListener('submit', () => track('form_start', { form_name: 'kontakt' }));

    // Native validation bubbles are invisible to screen readers and vanish on blur;
    // the same failure is mirrored into a live region next to the submit button.
    const VALIDATION_MESSAGES = {
        pl: 'Uzupełnij zaznaczone pola, aby wysłać formularz.',
        en: 'Please complete the highlighted fields before sending.',
        uk: 'Заповніть виділені поля, щоб надіслати форму.',
        es: 'Completa los campos marcados antes de enviar.',
        de: 'Bitte füllen Sie die markierten Felder aus.',
    };
    const pageLang = (document.documentElement.lang || 'pl').slice(0, 2).toLowerCase();
    document.querySelectorAll('form').forEach(f => {
        const status = f.querySelector('[data-form-status]');
        if (!status) return;
        const fields = [...f.querySelectorAll('input[required], textarea[required]')];
        f.addEventListener('submit', e => {
            const invalid = fields.filter(field => !field.checkValidity());
            fields.forEach(field => field.removeAttribute('aria-invalid'));
            if (!invalid.length) {
                status.textContent = '';
                return;
            }
            e.preventDefault();
            invalid.forEach(field => field.setAttribute('aria-invalid', 'true'));
            status.textContent = VALIDATION_MESSAGES[pageLang] || VALIDATION_MESSAGES.pl;
            invalid[0].focus();
        });
        f.addEventListener('input', e => {
            if (status.textContent) status.textContent = '';
            if (e.target.checkValidity && e.target.checkValidity()) e.target.removeAttribute('aria-invalid');
        });
    });

    const backToTop = document.getElementById('back-to-top');
    if (backToTop) {
        const toggleBackToTop = () => backToTop.classList.toggle('is-visible', window.scrollY > 600);
        window.addEventListener('scroll', toggleBackToTop, { passive: true });
        backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
        toggleBackToTop();
    }

    const urlParams = new URLSearchParams(location.search);
    const beerParam = urlParams.get('beer');
    if (beerParam) {
        const msgField = document.getElementById('f-msg');
        if (msgField && !msgField.value) {
            const beerName = urlParams.get('name') || beerParam.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            // The enquiry template is injected at runtime, so the i18n build never
            // sees it - it has to carry its own translations.
            const templates = {
                pl: name => `Dzień dobry,\n\nJestem zainteresowany piwem ${name}. Proszę o ofertę.\n\nPozdrawiam`,
                en: name => `Hello,\n\nI am interested in your ${name} beer. Could you send me an offer?\n\nBest regards`,
                uk: name => `Доброго дня,\n\nМене цікавить пиво ${name}. Надішліть, будь ласка, пропозицію.\n\nЗ повагою`,
                es: name => `Hola,\n\nEstoy interesado en la cerveza ${name}. ¿Podrían enviarme una oferta?\n\nUn saludo`,
                de: name => `Guten Tag,\n\nich interessiere mich für das Bier ${name}. Bitte senden Sie mir ein Angebot.\n\nMit freundlichen Grüßen`,
            };
            const lang = (document.documentElement.lang || 'pl').slice(0, 2).toLowerCase();
            msgField.value = (templates[lang] || templates.pl)(beerName);
            const kontakt = document.getElementById('kontakt');
            if (kontakt) {
                setTimeout(() => {
                    kontakt.scrollIntoView({ behavior: scrollBehavior() });
                    msgField.focus();
                    msgField.setSelectionRange(msgField.value.length, msgField.value.length);
                }, 300);
            }
        }
    }

    const beerCards = document.querySelectorAll('.beer-card[data-beer-slug]');
    if (beerCards.length) {
        beerCards.forEach((card, idx) => {
            const link = card.querySelector('a');
            if (!link) return;
            link.addEventListener('click', () => {
                track('select_item', {
                    item_list_name: 'beer_grid',
                    items: [{
                        item_id: card.dataset.beerSlug,
                        item_name: card.dataset.beerName,
                        item_category: card.dataset.beerStyle,
                        item_variant: card.dataset.beerAbv + ' ABV',
                        item_brand: 'Browar Pogórza',
                        index: idx + 1
                    }]
                });
            });
        });

        const grid = document.querySelector('.beer-grid');
        if (grid && 'IntersectionObserver' in window) {
            let fired = false;
            const io2 = new IntersectionObserver(entries => {
                if (fired || !entries[0].isIntersecting) return;
                fired = true;
                const items = Array.from(beerCards).map((card, i) => ({
                    item_id: card.dataset.beerSlug,
                    item_name: card.dataset.beerName,
                    item_category: card.dataset.beerStyle,
                    item_variant: card.dataset.beerAbv + ' ABV',
                    item_brand: 'Browar Pogórza',
                    index: i + 1
                }));
                track('view_item_list', { item_list_name: 'beer_grid', items });
                io2.disconnect();
            }, { threshold: 0.25 });
            io2.observe(grid);
        }
    }
})();