(() => {
    'use strict';

    const nav = document.getElementById('nav');
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');

    const isProductPage = document.body.classList.contains('product-page');
    const onScroll = () => {
        nav.classList.toggle('is-scrolled', isProductPage || window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('is-open');
        navMenu.classList.toggle('is-open');
    });

    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('is-open');
            navMenu.classList.remove('is-open');
        });
    });

    // <details> has no native outside-click dismiss, so the language menu needs one.
    const closeLangMenus = () => {
        document.querySelectorAll('details.langswitch[open]').forEach(menu => menu.removeAttribute('open'));
    };
    document.addEventListener('click', e => {
        if (e.target.closest('details.langswitch')) return;
        closeLangMenus();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeLangMenus();
    });

    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');

    const openLightbox = src => {
        lightboxImg.src = src;
        lightbox.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    };
    const closeLightbox = () => {
        lightbox.classList.remove('is-open');
        lightboxImg.src = '';
        document.body.style.overflow = '';
    };

    document.querySelectorAll('.lightbox-trigger').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            openLightbox(a.getAttribute('href'));
        });
    });
    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

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

    const backToTop = document.getElementById('back-to-top');
    if (backToTop) {
        const toggleBackToTop = () => backToTop.classList.toggle('is-visible', window.scrollY > 600);
        window.addEventListener('scroll', toggleBackToTop, { passive: true });
        backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        toggleBackToTop();
    }

    const urlParams = new URLSearchParams(location.search);
    const beerParam = urlParams.get('beer');
    if (beerParam) {
        const msgField = document.getElementById('f-msg');
        if (msgField && !msgField.value) {
            const beerName = urlParams.get('name') || beerParam.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            msgField.value = `Dzień dobry,\n\nJestem zainteresowany piwem ${beerName}. Proszę o ofertę.\n\nPozdrawiam`;
            const kontakt = document.getElementById('kontakt');
            if (kontakt) {
                setTimeout(() => {
                    kontakt.scrollIntoView({ behavior: 'smooth' });
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