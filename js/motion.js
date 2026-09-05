// The motion layer: inertia scrolling, layered parallax, staggered word reveals
// and a header that tightens as the page moves. Runs after script.js on every
// page and only decorates - nothing here is needed to read or use the site.
//
// Every effect is a transform or opacity driven from one scroll loop, so it
// costs no layout. Reduced motion turns the whole file into a no-op; the CSS
// killswitch already covers the transitions this file's classes would trigger.
(() => {
    'use strict';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // --- inertia scroll. Lenis takes the wheel; touch stays native.
    let lenis = null;
    if (finePointer && typeof window.Lenis === 'function') {
        lenis = new window.Lenis({
            duration: 1.2,
            easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            syncTouch: false,
            anchors: { offset: -parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0 },
        });
        const raf = time => { lenis.raf(time); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
    }

    // --- word reveals. Headings are split into words; the words rise, unskew
    // and fade in one after another when the heading's reveal fires (script.js
    // toggles .is-visible on .reveal targets). The hero and product headings
    // are not reveal targets, so they get their .is-visible on load.
    const WORD_TARGETS = '.hero__title, .hero__tagline, .h2, .product__name, .banner__title, .thanks__title, .legal h1';
    const splitWords = (el) => {
        if (el.dataset.split) return;
        let index = 0;
        const walk = (node) => {
            [...node.childNodes].forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.tagName !== 'BR') walk(child);
                    return;
                }
                if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
                const frag = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach(token => {
                    if (!token) return;
                    if (/^\s+$/.test(token)) { frag.appendChild(document.createTextNode(token)); return; }
                    const w = document.createElement('span');
                    w.className = 'w';
                    w.style.setProperty('--i', index++);
                    w.textContent = token;
                    frag.appendChild(w);
                });
                node.replaceChild(frag, child);
            });
        };
        walk(el);
        el.dataset.split = String(index);
    };
    document.querySelectorAll(WORD_TARGETS).forEach(splitWords);

    // Stagger siblings that reveal together: cards in a row, facts, gallery tiles.
    document.querySelectorAll('.beer-grid, .facts, .gallery, .chapters, .partners, .check-list').forEach(group => {
        [...group.children].forEach((child, i) => child.style.setProperty('--i', i % 4));
    });

    const onLoad = () => {
        document.querySelectorAll('.hero__title, .hero__tagline, .hero__lead, .hero__mark, .hero__actions, .product__name, .product__style, .product__tagline, .product__desc, .product__stats, .product__cta, .product__photo, .thanks__title, .legal h1')
            .forEach((el, i) => {
                el.classList.add('intro');
                el.style.setProperty('--intro', i);
                // Reading a computed value forces the hidden state to be resolved
                // before the visible one lands, so the transition has a start point
                // even when both changes fall inside one frame.
                void getComputedStyle(el).opacity;
                requestAnimationFrame(() => el.classList.add('is-visible'));
            });
    };
    if (document.readyState === 'complete') onLoad(); else window.addEventListener('load', onLoad, { once: true });

    // --- parallax and hero drift, one pass per frame from the scroll position.
    // Speed is a plain multiplier of the element's distance from the viewport
    // centre, the way Brew District 24 does it: positive drifts with the scroll,
    // negative against it, and everything lines up again as it passes the middle.
    // The offset is written to --py and applied by the .px rule in CSS, so it
    // composes with the reveal and hover transforms instead of overwriting them.
    const layers = [];
    const addLayer = (el, speed) => { el.classList.add('px'); layers.push({ el, speed, current: 0 }); };
    const addLayers = (selector, speed) => document.querySelectorAll(selector).forEach(el => addLayer(el, speed));
    addLayers('.hero__mark', 0.10);
    addLayers('.hero__title', 0.16);
    addLayers('.hero__tagline', 0.22);
    addLayers('.hero__lead', 0.28);
    addLayers('.hero__actions', 0.34);
    addLayers('.split__visual--photo', -0.06);
    addLayers('.picker-cta__icon', -0.08);
    addLayers('.kicker', 0.05);
    addLayers('.product__photo img', -0.05);
    // Alternate the cards so a row does not move as one slab.
    document.querySelectorAll('.beer-card').forEach((card, i) => addLayer(card, [0.05, -0.03, 0.02, -0.05][i % 4]));

    const hero = document.querySelector('.hero');
    const heroBg = document.querySelector('.hero__bg');
    const heroContent = document.querySelector('.hero__content');
    const nav = document.getElementById('nav');

    let viewportH = window.innerHeight;
    window.addEventListener('resize', () => { viewportH = window.innerHeight; }, { passive: true });

    const render = () => {
        const y = window.scrollY;
        const centre = y + viewportH / 2;
        for (const layer of layers) {
            const box = layer.el.getBoundingClientRect();
            // Skip what is far off screen; the transform would not be seen anyway.
            if (box.bottom < -viewportH || box.top > viewportH * 2) continue;
            const elCentre = y + box.top + box.height / 2 - layer.current;
            const offset = (elCentre - centre) * layer.speed;
            layer.current = offset;
            layer.el.style.setProperty('--py', offset.toFixed(1) + 'px');
        }
        if (hero && heroBg && heroContent) {
            const p = Math.min(1, Math.max(0, y / (hero.offsetHeight || 1)));
            heroBg.style.transform = `translate3d(0, ${(p * 90).toFixed(1)}px, 0) scale(${(1 + p * 0.06).toFixed(3)})`;
            heroContent.style.opacity = String(Math.max(0, 1 - p * 1.4).toFixed(3));
        }
        if (nav) nav.classList.toggle('is-compact', y > 120);
    };

    // Lenis emits per frame while it moves; without it the native scroll event does.
    if (lenis) lenis.on('scroll', render);
    else window.addEventListener('scroll', render, { passive: true });
    render();
})();
