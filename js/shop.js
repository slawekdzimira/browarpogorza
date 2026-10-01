// Browar Pogórza ordering: the offer (zamow.html), the basket bar, the buy box on Polish beer
// pages and the order form with its contract (zamowienie.html). Prices, availability and every
// rule come from the shop Worker (data-endpoint); the server validates and prices again, so
// nothing here is trusted. Two kinds of order:
//   - beers up to 0.5% ABV: an ordinary sale, shipped by courier;
//   - anything with alcohol: delivery to a closed event under the catering permit, concluded
//     as a contract the customer reads and accepts.
(() => {
    'use strict';

    const script = document.currentScript || document.querySelector('script[src*="/js/shop.js"]');
    const ENDPOINT = ((script && script.dataset.endpoint) || '').trim().replace(/\/+$/, '');
    if (!ENDPOINT || window.__bpShop) return;
    window.__bpShop = true;

    const CART_KEY = 'bp_cart_v1';
    const FORM_KEY = 'bp_checkout_v1';
    const CALC_KEY = 'bp_calc_v1';
    const CHECKOUT_URL = '/zamowienie.html';
    const CONTACT = 'slawek@browarpogorza.pl, tel. +48 734 180 172';
    // Event hours as a 24-hour list: a native time input shows AM/PM in an English browser.
    const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
    const HOUR_OPTIONS = `<option value="">wybierz</option>${HALF_HOURS.map(h => `<option value="${h}">${h}</option>`).join('')}`;

    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const zl = gr => `${(gr / 100).toFixed(2).replace('.', ',')} zł`;
    const litres = ml => String(ml / 1000).replace('.', ',');
    const webp = src => src.replace(/\.(png|jpe?g)$/i, '.webp');
    const track = (name, params) => { try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) { /* analytics is optional */ } };

    const storage = {
        get(key, fallback, session) {
            try { const raw = (session ? sessionStorage : localStorage).getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
        },
        set(key, value, session) {
            try { (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
        },
        remove(key, session) { try { (session ? sessionStorage : localStorage).removeItem(key); } catch (e) { /* ignore */ } },
    };

    let catalog = null;
    const byId = id => catalog && catalog.products.find(p => p.id === id);
    const offered = p => p && (p.alcoholic ? catalog.settings.events.available : catalog.settings.na.available);

    /* ------------------------------------------------------------- cart */

    const cart = {
        items() {
            const raw = storage.get(CART_KEY, []);
            return Array.isArray(raw) ? raw.filter(i => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0) : [];
        },
        // Only what can still be ordered; anything hidden or switched off since drops out.
        valid() { return catalog ? this.items().filter(i => offered(byId(i.id))) : []; },
        qty(id) { const hit = this.items().find(i => i.id === id); return hit ? hit.qty : 0; },
        set(id, qty) {
            const max = (byId(id) && byId(id).stock !== null && byId(id).stock !== undefined) ? byId(id).stock : 999;
            const n = Math.max(0, Math.min(max, Math.floor(qty) || 0));
            const items = this.items().filter(i => i.id !== id);
            if (n > 0) items.push({ id, qty: n });
            storage.set(CART_KEY, items);
            render.all();
        },
        add(id, qty) { this.set(id, this.qty(id) + qty); },
        clear() { storage.remove(CART_KEY); },
        kind(items) { return items.some(i => byId(i.id) && byId(i.id).alcoholic) ? 'event' : 'na'; },
        totals(items) {
            const kind = this.kind(items);
            const s = catalog.settings;
            let itemsGr = 0; let depositGr = 0; let units = 0; let ml = 0;
            items.forEach(i => { const p = byId(i.id); itemsGr += p.priceGr * i.qty; depositGr += p.depositGr * i.qty; units += i.qty; ml += p.volumeMl * i.qty; });
            let deliveryGr = 0;
            if (kind === 'na') deliveryGr = (s.na.freeFromGr !== null && itemsGr >= s.na.freeFromGr) ? 0 : (s.na.shippingGr || 0);
            else deliveryGr = s.events.deliveryGr || 0;
            return { kind, units, litres: ml / 1000, itemsGr, depositGr, deliveryGr, totalGr: itemsGr + depositGr + deliveryGr };
        },
    };

    const qtyControl = (id, value, label) => `<div class="shop-qty"><button type="button" data-step="-1" aria-label="Mniej: ${esc(label)}">-</button>`
        + `<input type="number" inputmode="numeric" min="1" max="999" value="${value}" aria-label="Liczba sztuk: ${esc(label)}" data-qty="${esc(id)}">`
        + `<button type="button" data-step="1" aria-label="Więcej: ${esc(label)}">+</button></div>`;

    const stepQty = (event) => {
        const btn = event.target.closest('[data-step]');
        if (!btn) return false;
        const input = btn.parentElement.querySelector('input');
        input.value = Math.max(1, Math.min(999, (parseInt(input.value, 10) || 1) + Number(btn.dataset.step)));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    };

    /* ----------------------------------------------------------- render */

    const unitPrice = p => `${(p.priceGr / (p.volumeMl / 1000) / 100).toFixed(2).replace('.', ',')} zł/l`;
    const packLine = p => `${esc(p.packagingLabel)} ${litres(p.volumeMl)} l · ${unitPrice(p)}${p.depositGr ? ` · kaucja ${zl(p.depositGr)}` : ''}`;

    const card = (p) => {
        const inCart = cart.qty(p.id);
        return `<article class="shop-card${inCart ? ' is-in-cart' : ''}" data-id="${esc(p.id)}">`
            + `<span class="shop-card__tag ${p.alcoholic ? 'shop-card__tag--event">Na imprezę zamkniętą' : 'shop-card__tag--na">Wysyłka kurierem'}</span>`
            + `<a class="shop-card__media" href="${esc(p.url)}" tabindex="-1" aria-hidden="true"><picture><source type="image/webp" srcset="${esc(webp(p.image))}">`
            + `<img src="${esc(p.image)}" alt="" loading="lazy" width="300" height="340"></picture></a>`
            + '<div class="shop-card__body">'
            + `<h3 class="shop-card__name"><a href="${esc(p.url)}">${esc(p.name)}</a></h3>`
            + `<p class="shop-card__style">${esc(p.style)} · ${esc(p.abvLabel)} alk.</p>`
            + (p.tagline ? `<p class="shop-card__tagline">${esc(p.tagline)}.</p>` : '')
            + `<p class="shop-card__pack">${packLine(p)}</p>`
            + `<div class="shop-card__price"><strong>${zl(p.priceGr)}</strong><span>za sztukę, z VAT${inCart ? ` · w zamówieniu: ${inCart} szt.` : ''}</span></div>`
            + `<div class="shop-card__buy">${qtyControl(p.id, 1, p.name)}<button type="button" class="btn btn--sun" data-add="${esc(p.id)}" aria-label="Dodaj do zamówienia: ${esc(p.name)}">Dodaj</button></div>`
            + '</div></article>';
    };

    const note = html => `<div class="shop-note" style="grid-column:1/-1">${html}</div>`;

    const render = {
        filter: 'all',
        catalogPage() {
            const grid = document.getElementById('shop-catalog');
            if (!grid) return;
            const s = catalog.settings;
            if (!s.shopOpen) { grid.innerHTML = note(`<strong>Przyjmowanie zamówień jest chwilowo wstrzymane.</strong> Napisz do nas: ${esc(CONTACT)}.`); return; }
            const list = catalog.products.filter(offered).filter(p => this.filter === 'all' || (this.filter === 'event' ? p.alcoholic : !p.alcoholic));
            const notes = [];
            if (!s.events.available && this.filter !== 'na') notes.push(`<strong>Piwo z alkoholem na imprezy zamknięte</strong> zamówisz tu wkrótce. Do tego czasu przygotujemy ofertę mailowo: ${esc(CONTACT)}.`);
            if (!s.na.available && this.filter !== 'event') notes.push(`<strong>Wysyłka piw bezalkoholowych</strong> ruszy wkrótce. Napisz, jeśli chcesz zamówić już teraz: ${esc(CONTACT)}.`);
            const calc = storage.get(CALC_KEY, null, true);
            const fromCalc = calc && calc.bottles ? `<div class="shop-note shop-note--calc">Z kalkulatora: <strong>${calc.bottles} butelek 0,5 l</strong> piwa na ${calc.guests} gości`
                + `${calc.naBottles ? ` i ${calc.naBottles} butelek piwa bezalkoholowego` : ''}. <a href="/ile-piwa-na-wesele.html">Przelicz jeszcze raz</a></div>` : '';
            grid.innerHTML = fromCalc + (list.map(card).join('') + notes.map(note).join('')
                || note(`Nic tu jeszcze nie ma. Napisz do nas: ${esc(CONTACT)}.`));
            // GA4 shop funnel (visitors who consented): the offer seen once per page view.
            if (list.length && !this.listTracked) {
                this.listTracked = true;
                track('view_item_list', { item_list_name: 'oferta', items: list.map(p => ({ item_id: p.id, item_name: p.name, price: p.priceGr / 100 })) });
            }
        },
        buyBoxes() {
            document.querySelectorAll('[data-shop-product]').forEach((box) => {
                const p = byId(box.dataset.shopProduct);
                // The page's own "Zamów / Zapytaj" button leads to the contact form; next to a
                // working buy box it only confuses, so it steps aside while the box is shown.
                const enquiry = box.parentElement && box.parentElement.querySelector('[data-beer-cta]');
                if (!p || !offered(p) || !catalog.settings.shopOpen) {
                    box.hidden = true;
                    if (enquiry) enquiry.hidden = false;
                    return;
                }
                if (enquiry) enquiry.hidden = true;
                if (!box.dataset.tracked) {
                    box.dataset.tracked = '1';
                    track('view_item', { currency: 'PLN', value: p.priceGr / 100, items: [{ item_id: p.id, item_name: p.name, price: p.priceGr / 100 }] });
                }
                const inCart = cart.qty(p.id);
                const s = catalog.settings;
                const lead = p.alcoholic
                    ? 'Na imprezę zamkniętą: wesele, urodziny, imprezę firmową. Dostarczamy na miejsce imprezy na podstawie umowy, którą zawierasz przy zamówieniu.'
                    : `Wysyłka kurierem. Najmniejsze zamówienie: ${s.na.minItems} szt. (możesz łączyć różne piwa bezalkoholowe).`;
                box.innerHTML = `<h2>${p.alcoholic ? 'Zamów na imprezę' : 'Zamów z wysyłką'}</h2><p>${esc(lead)}</p>`
                    + `<div class="shop-buy__price">${zl(p.priceGr)}<small>${packLine(p)}</small></div>`
                    + `<div class="shop-buy__row">${qtyControl(p.id, 1, p.name)}<button type="button" class="btn btn--sun" data-add="${esc(p.id)}">Dodaj do zamówienia</button></div>`
                    + (inCart ? `<p class="shop-buy__in">W zamówieniu: ${inCart} szt. <a href="${CHECKOUT_URL}">Przejdź do zamówienia</a></p>` : '')
                    + '<p class="shop-buy__ask">Masz pytanie o to piwo? <a href="/#kontakt">Napisz do nas</a>.</p>';
                box.hidden = false;
            });
        },
        bar() {
            if (document.getElementById('shop-checkout')) return;
            let bar = document.querySelector('.shop-bar');
            const items = cart.valid();
            if (!items.length) { if (bar) bar.classList.remove('is-visible'); document.body.classList.remove('has-shop-bar'); return; }
            if (!bar) {
                bar = document.createElement('div');
                bar.className = 'shop-bar';
                bar.setAttribute('role', 'region');
                bar.setAttribute('aria-label', 'Twoje zamówienie');
                bar.innerHTML = '<div class="shop-bar__in"><div class="shop-bar__text" aria-live="polite"></div><a class="btn btn--sun" href="' + CHECKOUT_URL + '">Przejdź do zamówienia</a></div>';
                document.body.appendChild(bar);
            }
            const t = cart.totals(items);
            bar.querySelector('.shop-bar__text').innerHTML = `<strong>${t.units} szt.</strong> · ${zl(t.itemsGr + t.depositGr)}`
                + `<br><span style="opacity:.8">${t.kind === 'event' ? 'zamówienie na imprezę zamkniętą' : 'piwa bezalkoholowe z wysyłką'}</span>`;
            requestAnimationFrame(() => { bar.classList.add('is-visible'); document.body.classList.add('has-shop-bar'); });
        },
        // Prompts on other pages appear only when that kind of order is switched on.
        ctas() {
            const s = catalog.settings;
            const on = { na: s.na.available, event: s.events.available, any: s.na.available || s.events.available };
            document.querySelectorAll('[data-shop-cta]').forEach((el) => { el.hidden = !(s.shopOpen && on[el.dataset.shopCta]); });
        },
        all() {
            if (!catalog) return;
            this.catalogPage();
            this.buyBoxes();
            this.ctas();
            this.bar();
        },
    };

    // One delegated handler for every "add" button and quantity stepper on the page.
    document.addEventListener('click', (event) => {
        if (event.target.closest('#shop-checkout')) return;
        if (stepQty(event)) return;
        const add = event.target.closest('[data-add]');
        if (!add || !catalog) return;
        const p = byId(add.dataset.add);
        const input = add.parentElement.querySelector('input[data-qty]');
        const qty = Math.max(1, parseInt(input && input.value, 10) || 1);
        const kindNow = cart.kind(cart.valid());
        if (cart.valid().length && p.alcoholic && kindNow === 'na') {
            // Mixing turns the whole basket into an event order; say so once.
            if (!window.confirm('Piwo z alkoholem zamawiasz na imprezę zamkniętą. Całe zamówienie, razem z piwami bezalkoholowymi, dostarczymy na miejsce imprezy. Kontynuować?')) return;
        }
        cart.add(p.id, qty);
        track('add_to_cart', { currency: 'PLN', value: p.priceGr * qty / 100, items: [{ item_id: p.id, item_name: p.name, quantity: qty }] });
    });

    document.addEventListener('click', (event) => {
        const b = event.target.closest('[data-shop-filter]');
        if (!b) return;
        render.filter = b.dataset.shopFilter;
        document.querySelectorAll('[data-shop-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        render.catalogPage();
    });

    /* --------------------------------------------------------- checkout */

    const checkout = {
        root: null,
        preview: null,
        sending: false,

        field(name, label, opts = {}) {
            const id = opts.id || `co-${name.replace(/\./g, '-')}`;
            const type = opts.type || 'text';
            const attrs = `id="${id}" name="${name}" data-field="${opts.errorKey || name}"${opts.autocomplete ? ` autocomplete="${opts.autocomplete}"` : ''}${opts.attrs ? ` ${opts.attrs}` : ''}`;
            const control = type === 'textarea' ? `<textarea ${attrs} rows="3"></textarea>`
                : type === 'select' ? `<select ${attrs}>${opts.options}</select>`
                    : `<input type="${type}" ${attrs}>`;
            return `<div class="co-field${opts.wide ? ' co-field--wide' : ''}"><label for="${id}">${esc(label)}${opts.optional ? ' <small>(opcjonalnie)</small>' : ''}</label>`
                + `${control}<span class="co-error" data-error-for="${opts.errorKey || name}" id="${id}-err"></span></div>`;
        },

        address(prefix, auto) {
            return `<div class="co-grid co-grid--3">${this.field(`${prefix}.street`, 'Ulica i numer', { autocomplete: auto && `${auto} street-address` })}`
                + `${this.field(`${prefix}.postal`, 'Kod pocztowy', { autocomplete: auto && `${auto} postal-code`, attrs: 'inputmode="numeric" placeholder="00-000" maxlength="6"' })}`
                + `${this.field(`${prefix}.city`, 'Miejscowość', { autocomplete: auto && `${auto} address-level2` })}</div>`;
        },

        render() {
            const items = cart.valid();
            const s = catalog.settings;
            if (!s.shopOpen) { this.root.innerHTML = `<div class="shop-note"><strong>Przyjmowanie zamówień jest chwilowo wstrzymane.</strong> Napisz do nas: ${esc(CONTACT)}.</div>`; return; }
            if (!items.length) {
                this.root.innerHTML = '<div class="co-step co-empty"><p>Twoje zamówienie jest puste.</p><p><a class="btn btn--sun" href="/zamow.html">Wybierz piwa</a></p></div>';
                return;
            }
            const t = cart.totals(items);
            const event = t.kind === 'event';
            const ev = s.events;
            const minDate = new Date(Date.now() + (ev.leadHours + 24) * 3600_000).toISOString().slice(0, 10);
            const maxDate = new Date(Date.now() + ev.horizonDays * 86400_000).toISOString().slice(0, 10);
            const types = Object.entries(s.eventTypes).map(([k, v]) => `<label><input type="radio" name="event.type" value="${k}" data-field="event.type">${esc(v.charAt(0).toUpperCase() + v.slice(1))}</label>`).join('');
            const declarations = Object.entries(s.declarations).map(([k, v]) => `<label class="co-check"><input type="checkbox" name="declarations.${k}" data-field="declarations.${k}"><span>${esc(v)}</span></label><span class="co-error" data-error-for="declarations.${k}"></span>`).join('');
            let step = 0;
            const head = (title, hint) => `<h2><span>${++step}</span>${esc(title)}</h2>${hint ? `<p class="co-hint">${hint}</p>` : ''}`;

            this.root.innerHTML = `<form class="checkout" id="co-form" novalidate><div>`
                + `<div class="co-form-error" id="co-form-error" role="alert" hidden></div>`
                + `<section class="co-step">${head('Wybrane piwa')}`
                + `<div class="co-kind co-kind--${t.kind}">${event
                    ? `<strong>Zamówienie na imprezę zamkniętą.</strong> Piwo z alkoholem dostarczamy własnym transportem na miejsce Twojej imprezy (${esc(ev.areaLabel)}), na podstawie umowy, którą zawierasz w ostatnim kroku. Najmniej ${ev.minItems} szt., zamówienie najpóźniej ${ev.leadHours} godzin przed imprezą.`
                    : `<strong>Piwa bezalkoholowe z wysyłką kurierem.</strong> Najmniej ${s.na.minItems} szt.; nadajemy w ciągu ${s.na.dispatchDays} dni roboczych od zaksięgowania wpłaty.`}</div>`
                + `<table class="co-lines"><tbody>${items.map((i) => { const p = byId(i.id); return `<tr data-id="${esc(p.id)}"><td><strong>${esc(p.name)}</strong><br><small>${esc(p.abvLabel)} · ${packLine(p)}</small></td>`
                    + `<td>${qtyControl(p.id, i.qty, p.name)}</td><td class="num">${zl(p.priceGr * i.qty)}<br><button type="button" class="co-remove" data-remove="${esc(p.id)}">Usuń</button></td></tr>`; }).join('')}</tbody></table>`
                + `<span class="co-error" data-error-for="items"></span>`
                + `<p style="margin:12px 0 0"><a href="/zamow.html">Dodaj inne piwa</a></p></section>`
                + (event ? `<section class="co-step">${head('Twoja impreza', 'Dane imprezy trafiają do umowy: piwo dostarczamy tylko na imprezę zamkniętą, w miejscu i czasie, które wskażesz. Przywozimy je w dniu imprezy, przed jej rozpoczęciem; godzinę dostawy uzgodnimy telefonicznie z osobą odbierającą.')}`
                    + `<div class="co-field co-field--wide"><span class="lbl" style="font-size:.82rem;font-weight:600">Rodzaj imprezy</span><div class="co-types">${types}</div><span class="co-error" data-error-for="event.type"></span></div>`
                    + `<div class="co-grid" style="margin-top:12px">${this.field('event.typeOther', 'Jaka to impreza?', { wide: true, attrs: 'placeholder="np. jubileusz, komunia, spotkanie klubowe"' })}`
                    + `${this.field('event.date', 'Data imprezy', { type: 'date', attrs: `min="${minDate}" max="${maxDate}"` })}`
                    + `${this.field('event.guests', 'Liczba zaproszonych dorosłych gości', { type: 'number', attrs: 'min="1" inputmode="numeric"' })}`
                    + `${this.field('event.timeFrom', 'Początek imprezy (godzina)', { type: 'select', options: HOUR_OPTIONS })}${this.field('event.timeTo', 'Koniec imprezy (godzina, może być po północy)', { type: 'select', options: HOUR_OPTIONS })}`
                    + `${this.field('event.venue', 'Miejsce (nazwa obiektu, np. sala, dom, ogród)', { wide: true })}</div>`
                    + `<div style="margin-top:12px">${this.address('event.address')}</div>`
                    + `<div class="co-grid" style="margin-top:12px">${this.field('event.receiverName', 'Kto odbierze dostawę (pełnoletni, z dowodem)', { autocomplete: 'off' })}${this.field('event.receiverPhone', 'Telefon osoby odbierającej', { type: 'tel', autocomplete: 'off' })}</div></section>`
                    : `<section class="co-step">${head('Dostawa', 'Wysyłka kurierem na adres w Polsce.')}`
                    + `<label class="co-check"><input type="checkbox" name="shipping.same" checked><span>Wyślij na mój adres z danych zamawiającego</span></label>`
                    + `<div id="co-ship-other" hidden>${this.address('shipping', 'shipping')}</div></section>`)
                + `<section class="co-step">${head('Twoje dane')}<div id="co-account-slot"></div><div class="co-grid">`
                + `${this.field('customer.name', 'Imię i nazwisko', { autocomplete: 'name' })}${this.field('customer.email', 'E-mail', { type: 'email', autocomplete: 'email' })}`
                + `${this.field('customer.phone', 'Telefon', { type: 'tel', autocomplete: 'tel' })}`
                + (event ? this.field('customer.birthDate', 'Data urodzenia', { type: 'date', autocomplete: 'bday' }) : '<div></div>')
                + `</div><div style="margin-top:12px">${this.address('customer.address', 'billing')}</div>`
                + `<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--green-leaf);font-weight:600">Zamawiam na firmę</summary><div class="co-grid" style="margin-top:10px">`
                + `${this.field('customer.company', 'Nazwa firmy', { optional: true, autocomplete: 'organization' })}${this.field('customer.nip', 'NIP', { optional: true, attrs: 'inputmode="numeric"' })}</div></details>`
                + `<div style="margin-top:12px">${this.field('notes', 'Uwagi do zamówienia', { type: 'textarea', optional: true, wide: true })}</div>`
                + `<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0"></section>`
                + `<section class="co-step">${head(event ? 'Oświadczenia' : 'Zgody', event ? 'Te oświadczenia są częścią umowy. Bez nich nie możemy dostarczyć piwa z alkoholem.' : '')}`
                + (event ? declarations : '')
                + `<label class="co-check"><input type="checkbox" name="declarations.terms" data-field="declarations.terms"><span>Akceptuję <a href="/regulamin-zamowien.html" target="_blank" rel="noopener">regulamin zamówień</a>. Dane przetwarzamy, aby zawrzeć i wykonać umowę, zgodnie z <a href="/polityka-prywatnosci.html#zamowienia" target="_blank" rel="noopener">polityką prywatności</a>.</span></label><span class="co-error" data-error-for="declarations.terms"></span>`
                + `<div class="co-actions" style="margin-top:12px"><button type="submit" class="btn btn--primary" id="co-check">${event ? 'Sprawdź dane i pokaż umowę' : 'Sprawdź zamówienie'}</button></div></section>`
                + `<section class="co-step" id="co-final" hidden>${head(event ? 'Umowa' : 'Podsumowanie', event ? 'Przeczytaj umowę. Zostanie zawarta, gdy wpiszesz imię i nazwisko i klikniesz przycisk poniżej.' : 'Sprawdź zamówienie. Po kliknięciu przycisku wyślemy potwierdzenie na Twój e-mail.')}`
                + `<div class="co-doc" id="co-doc" tabindex="0" aria-label="${event ? 'Treść umowy' : 'Podsumowanie zamówienia'}"></div>`
                + `<div class="co-accept">${event ? this.field('acceptName', 'Wpisz imię i nazwisko, aby zawrzeć umowę', { autocomplete: 'off' }) : ''}`
                + `<div class="co-actions"><button type="button" class="btn btn--sun" id="co-place">${event ? 'Zawieram umowę z obowiązkiem zapłaty' : 'Zamawiam z obowiązkiem zapłaty'}</button></div>`
                + `<p class="co-hint" style="margin:0;font-size:.84rem;color:var(--text-muted)">Płatność przelewem w ciągu ${s.paymentHours} godzin; dane do przelewu pokażemy po złożeniu zamówienia i wyślemy e-mailem.</p></div></section>`
                + `</div><aside class="co-summary" aria-label="Podsumowanie kwot">${this.summary(t)}</aside></form>`;

            this.restore();
            this.preview = null;
            account.fillCheckout();
        },

        summary(t) {
            const s = catalog.settings;
            const free = t.kind === 'na' && s.na.freeFromGr !== null && t.itemsGr < s.na.freeFromGr
                ? `<p>Do darmowej wysyłki brakuje ${zl(s.na.freeFromGr - t.itemsGr)}.</p>` : '';
            return `<h2>Podsumowanie</h2><dl><dt>Piwa (${t.units} szt., ${String(t.litres).replace('.', ',')} l)</dt><dd>${zl(t.itemsGr)}</dd>`
                + (t.depositGr ? `<dt>Kaucja za opakowania</dt><dd>${zl(t.depositGr)}</dd>` : '')
                + `<dt>${t.kind === 'event' ? 'Dostawa na imprezę' : 'Wysyłka'}</dt><dd>${zl(t.deliveryGr)}</dd>`
                + `<dt class="co-total">Razem</dt><dd class="co-total">${zl(t.totalGr)}</dd></dl>${free}`
                + `<p>Ceny zawierają VAT. Sprzedawca: ${esc(s.seller.name)}, ${esc(s.seller.address)}, NIP ${esc(s.seller.nip)}.</p>`
                + `<p><a href="/regulamin-zamowien.html" target="_blank" rel="noopener">Regulamin zamówień</a>${t.kind === 'na' ? ' · <a href="/formularz-odstapienia.html" target="_blank" rel="noopener">Formularz odstąpienia</a>' : ''}</p>`;
        },

        values() {
            const form = document.getElementById('co-form');
            const val = name => { const el = form.elements[name]; if (!el) return ''; if (el instanceof RadioNodeList) return el.value; return el.type === 'checkbox' ? el.checked : el.value; };
            const addr = p => ({ street: val(`${p}.street`), postal: val(`${p}.postal`), city: val(`${p}.city`) });
            const items = cart.valid();
            const kind = cart.kind(items);
            const body = {
                items,
                customer: { name: val('customer.name'), email: val('customer.email'), phone: val('customer.phone'), company: val('customer.company'), nip: val('customer.nip'), birthDate: val('customer.birthDate'), address: addr('customer.address') },
                declarations: { terms: val('declarations.terms') === true },
                notes: val('notes'),
                honey: val('website'),
            };
            if (kind === 'event') {
                Object.keys(catalog.settings.declarations).forEach((k) => { body.declarations[k] = val(`declarations.${k}`) === true; });
                body.event = {
                    type: val('event.type'), typeOther: val('event.typeOther'), date: val('event.date'), timeFrom: val('event.timeFrom'), timeTo: val('event.timeTo'),
                    venue: val('event.venue'), guests: Number(val('event.guests')), address: addr('event.address'),
                    receiverName: val('event.receiverName'), receiverPhone: val('event.receiverPhone'),
                };
            } else {
                body.shipping = val('shipping.same') ? { same: true } : { same: false, ...addr('shipping') };
            }
            return body;
        },

        // Typed data survives a refresh in this tab (sessionStorage), never across devices.
        remember() {
            const form = document.getElementById('co-form');
            if (!form) return;
            const data = {};
            [...form.elements].forEach((el) => {
                if (!el.name || el.name === 'website' || el.name === 'acceptName') return;
                if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; } else data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
            });
            storage.set(FORM_KEY, data, true);
        },
        restore() {
            const data = storage.get(FORM_KEY, {}, true);
            const form = document.getElementById('co-form');
            Object.entries(data).forEach(([name, value]) => {
                const el = form.elements[name];
                if (!el) return;
                if (el instanceof RadioNodeList) [...el].forEach((r) => { r.checked = r.value === value; });
                else if (el.type === 'checkbox') el.checked = Boolean(value);
                else el.value = value;
            });
            this.syncShipping();
        },
        syncShipping() {
            const same = document.querySelector('[name="shipping.same"]');
            const other = document.getElementById('co-ship-other');
            if (same && other) other.hidden = same.checked;
        },

        clearErrors() {
            this.root.querySelectorAll('[data-error-for]').forEach((el) => { el.textContent = ''; });
            this.root.querySelectorAll('[aria-invalid]').forEach((el) => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
            const box = document.getElementById('co-form-error');
            if (box) box.hidden = true;
        },
        showErrors(errors) {
            this.clearErrors();
            let first = null;
            Object.entries(errors).forEach(([key, message]) => {
                if (key === 'form') return;
                const slot = this.root.querySelector(`[data-error-for="${CSS.escape(key)}"]`);
                if (slot) slot.textContent = message;
                this.root.querySelectorAll(`[data-field="${CSS.escape(key)}"]`).forEach((el) => {
                    el.setAttribute('aria-invalid', 'true');
                    if (slot && slot.id) el.setAttribute('aria-describedby', slot.id);
                    if (!first) first = el;
                });
                if (!first && slot) first = slot;
            });
            const box = document.getElementById('co-form-error');
            box.textContent = errors.form || 'Popraw zaznaczone pola.';
            box.hidden = false;
            (first || box).scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (first && first.focus) first.focus({ preventScroll: true });
        },

        async post(path, body) {
            const res = await fetch(ENDPOINT + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, status: res.status, data };
        },

        async check() {
            const btn = document.getElementById('co-check');
            btn.disabled = true;
            const label = btn.textContent;
            btn.textContent = 'Sprawdzam...';
            try {
                const { ok, status, data } = await this.post('/shop/preview', this.values());
                if (status === 429) { this.showErrors({ form: 'Za dużo prób w krótkim czasie. Spróbuj za kilka minut.' }); return; }
                if (!ok) { this.showErrors(data.errors || { form: `Nie udało się sprawdzić zamówienia. Napisz do nas: ${CONTACT}.` }); return; }
                this.clearErrors();
                this.preview = data;
                document.getElementById('co-doc').innerHTML = data.documentHtml;
                const final = document.getElementById('co-final');
                final.hidden = false;
                final.scrollIntoView({ behavior: 'smooth', block: 'start' });
                track('begin_checkout', { currency: 'PLN', value: data.totals.totalGr / 100, order_kind: data.kind });
            } catch (e) {
                this.showErrors({ form: `Brak połączenia z serwerem zamówień. Spróbuj ponownie albo napisz: ${CONTACT}.` });
            } finally {
                btn.disabled = false;
                btn.textContent = label;
            }
        },

        async place() {
            if (this.sending) return;
            this.sending = true;
            const btn = document.getElementById('co-place');
            const label = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Wysyłam...';
            const body = this.values();
            const accept = document.querySelector('[name="acceptName"]');
            if (accept) body.acceptName = accept.value;
            try {
                const { ok, status, data } = await this.post('/shop/order', body);
                if (status === 429) { this.showErrors({ form: 'Za dużo prób w krótkim czasie. Spróbuj za kilka minut.' }); return; }
                if (!ok) { this.showErrors(data.errors || { form: `Nie udało się złożyć zamówienia. Napisz do nas: ${CONTACT}.` }); return; }
                track('purchase', { transaction_id: data.number, currency: 'PLN', value: data.totals.totalGr / 100, order_kind: data.kind });
                cart.clear();
                storage.remove(FORM_KEY, true);
                this.done(data, body.customer.email, body.customer);
            } catch (e) {
                this.showErrors({ form: `Brak połączenia z serwerem zamówień. Spróbuj ponownie albo napisz: ${CONTACT}.` });
            } finally {
                this.sending = false;
                if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
            }
        },

        // The transfer details are the payment for now; when an online operator is connected
        // (payment.onlineUrl), it leads and the transfer details open from their own button.
        done(data, email, customer) {
            const p = data.payment;
            const event = data.kind === 'event';
            const copy = (value, what) => `<button type="button" class="co-copy" data-copy="${esc(value)}" aria-label="Kopiuj ${what}">kopiuj</button>`;
            const online = p.onlineUrl ? `<a class="btn btn--sun" href="${esc(p.onlineUrl)}">Zapłać online</a>` : '';
            this.root.innerHTML = `<div class="co-done" role="status"><h2 style="font-family:var(--font-display);font-weight:500;font-size:2rem;color:var(--green-forest);margin:0 0 8px">Dziękujemy. ${event ? `Umowa ${esc(data.number)} zawarta` : `Zamówienie ${esc(data.number)} przyjęte`}.</h2>`
                + `<p>${data.mailed ? `Potwierdzenie zamówienia${event ? ' razem z umową' : ''} wysłaliśmy na adres ${esc(email)}.` : `Zapisaliśmy zamówienie. Jeśli e-mail nie dotrze w ciągu kilku minut, napisz do nas: ${esc(CONTACT)}.`} Realizację zaczniemy po zaksięgowaniu wpłaty.</p>`
                + `<h3 class="co-pay__title">Zapłać ${esc(p.amount)} do ${esc(p.deadline)}</h3>`
                + (online ? `<div class="co-pay__methods">${online}<button type="button" class="btn btn--ghost-dark" data-pay-transfer aria-expanded="false" aria-controls="co-transfer">Zapłać zwykłym przelewem</button></div>` : '')
                + `<div class="co-pay" id="co-transfer"${online ? ' hidden' : ''}><p class="co-pay__lead">Zwykły przelew</p><dl>`
                + `<dt>Odbiorca</dt><dd>${esc(p.recipient)}<br><span class="co-pay__addr">${esc(p.recipientAddress)}</span>${copy(p.recipient, 'nazwę odbiorcy')}</dd>`
                + `<dt>Numer rachunku</dt><dd>${esc(p.bankAccount)}${copy(p.bankAccount.replace(/\s/g, ''), 'numer rachunku')}</dd>`
                + (p.bankName ? `<dt>Bank</dt><dd>${esc(p.bankName)}</dd>` : '')
                + `<dt>Tytuł przelewu</dt><dd>${esc(p.title)}${copy(p.title, 'tytuł przelewu')}</dd>`
                + `<dt>Kwota</dt><dd>${esc(p.amount)}${copy(p.amount.replace(/\s*zł$/, ''), 'kwotę')}</dd>`
                + `<dt>Termin</dt><dd>do ${esc(p.deadline)} (${p.deadlineHours} godzin)</dd></dl></div>`
                + `<p class="co-done__actions"><a class="btn btn--primary" href="${esc(data.documentUrl)}" target="_blank" rel="noopener">${event ? 'Otwórz umowę' : 'Otwórz potwierdzenie'}</a> <a class="btn btn--ghost-dark" href="/zamow.html">Wróć do oferty</a></p></div>`;
            this.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
            account.afterOrder(email, customer);
        },

        bind() {
            this.root.addEventListener('click', (event) => {
                if (stepQty(event)) return;
                const rm = event.target.closest('[data-remove]');
                if (rm) { cart.set(rm.dataset.remove, 0); this.refresh(); return; }
                if (event.target.id === 'co-place') { this.place(); return; }
                const offer = event.target.closest('[data-acct-offer]');
                if (offer) { account.offerSignUp(offer); return; }
                const transfer = event.target.closest('[data-pay-transfer]');
                if (transfer) {
                    const box = document.getElementById('co-transfer');
                    box.hidden = !box.hidden;
                    transfer.setAttribute('aria-expanded', String(!box.hidden));
                    return;
                }
                const cp = event.target.closest('[data-copy]');
                if (cp && navigator.clipboard) navigator.clipboard.writeText(cp.dataset.copy).then(() => { cp.textContent = 'skopiowano'; }).catch(() => {});
            });
            this.root.addEventListener('change', (event) => {
                const q = event.target.closest('input[data-qty]');
                if (q) { cart.set(q.dataset.qty, parseInt(q.value, 10) || 1); this.refresh(); return; }
                if (event.target.name === 'shipping.same') this.syncShipping();
                // The acceptance name is typed after the preview and is part of accepting it, not a
                // change to the order (its change event fires on the very click that accepts).
                if (event.target.name !== 'acceptName') this.invalidate();
            });
            this.root.addEventListener('input', (event) => { if (event.target.name !== 'acceptName') { this.remember(); this.invalidate(); } });
            this.root.addEventListener('submit', (event) => { event.preventDefault(); this.check(); });
        },
        // Any change after the preview means the contract on screen is no longer the one that
        // would be concluded, so the final step hides until it is checked again.
        invalidate() {
            if (!this.preview) return;
            this.preview = null;
            const final = document.getElementById('co-final');
            if (final) final.hidden = true;
        },
        refresh() {
            this.remember();
            this.render();
        },
        init(root) {
            this.root = root;
            this.render();
            this.bind();
        },
    };

    /* ------------------------------------------------------- calculator */

    // ile-piwa-na-wesele.html: the generator's numbers (data-calc) recomputed as the visitor
    // types; the result waits in this tab's storage for the offer page. An estimate only.
    const crateWord = n => (n === 1 ? 'skrzynka' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'skrzynki' : 'skrzynek'));
    const calculator = {
        init(form) {
            const cfg = JSON.parse(form.dataset.calc);
            const field = id => form.querySelector(`#${id}`);
            const int = (id, max) => Math.max(0, Math.min(max, parseInt(field(id).value, 10) || 0));
            let used = false;
            const run = (event) => {
                const guests = int('calc-guests', 2000);
                const nonDrinkers = Math.min(guests, int('calc-nondrinkers', 2000));
                const hours = Number(field('calc-hours').value);
                const litres = (guests - nonDrinkers) * hours * cfg.rates[field('calc-rate').value] * (field('calc-other').checked ? cfg.otherAlcohol : 1);
                const bottles = Math.ceil(litres / cfg.bottleL);
                const crates = Math.ceil(bottles / cfg.crate);
                const naBottles = Math.ceil((nonDrinkers * hours * cfg.naRate) / cfg.bottleL);
                field('calc-result').innerHTML = `<p class="calc-result__main"><strong>${bottles} butelek 0,5 l</strong> piwa (${Math.round(litres)} l, ${crates} ${crateWord(crates)})</p>`
                    + (naBottles ? `<p>i <strong>${naBottles} butelek</strong> piwa bezalkoholowego dla kierowców</p>` : '');
                storage.set(CALC_KEY, { guests, bottles, naBottles }, true);
                if (event && !used) { used = true; track('calculator_use', { guests }); }
            };
            form.addEventListener('input', run);
            form.addEventListener('change', run);
            form.addEventListener('submit', (event) => { event.preventDefault(); run(event); });
            run();
        },
    };

    /* ---------------------------------------------------------- account */

    // The customer account (konto.html) and what the checkout borrows from it. Signing up
    // only mails a link; the password is set from that link (#aktywuj=, #nowe-haslo=). The
    // session is a signed token from the Worker, kept in this browser until signing out.
    const SESSION_KEY = 'bp_session_v1';
    const plDay = iso => { try { return new Date(iso).toLocaleDateString('pl-PL'); } catch (e) { return ''; } };
    const isoDay = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('.') : '');

    const account = {
        root: null,
        cached: null,
        token: null,

        session() { const s = storage.get(SESSION_KEY, null); return s && s.token ? s : null; },
        signIn(data) { storage.set(SESSION_KEY, { token: data.session, email: data.user.email }); this.cached = null; this.syncHeader(); },
        signOut() { storage.remove(SESSION_KEY); this.cached = null; this.syncHeader(); },
        // The header link (js/script.js) follows the session.
        syncHeader() { if (typeof window.bpSyncAccountLink === 'function') window.bpSyncAccountLink(); },

        async call(path, { method = 'GET', body } = {}) {
            const s = this.session();
            const res = await fetch(`${ENDPOINT}/shop/account/${path}`, {
                method,
                credentials: 'omit',
                headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401 && s && path !== 'login') this.signOut();
            return { ok: res.ok, status: res.status, data };
        },

        // The signed-in customer with their orders, or null; asked once per page.
        me() {
            if (!this.session()) return Promise.resolve(null);
            if (!this.cached) this.cached = this.call('me').then(r => (r.ok ? r.data : null)).catch(() => null);
            return this.cached;
        },

        /* ---- checkout */

        async fillCheckout() {
            const slot = document.getElementById('co-account-slot');
            const me = await this.me();
            const form = document.getElementById('co-form');
            if (!slot || !form) return;
            if (!me) {
                slot.innerHTML = '<p class="co-hint">Masz konto? <a href="/konto.html?wroc=zamowienie">Zaloguj się</a>, a dane uzupełnią się same.</p>';
                return;
            }
            const p = me.user.profile || {};
            const a = p.address || {};
            const known = {
                'customer.name': p.name, 'customer.phone': p.phone, 'customer.company': p.company, 'customer.nip': p.nip,
                'customer.address.street': a.street, 'customer.address.postal': a.postal, 'customer.address.city': a.city,
            };
            Object.entries(known).forEach(([name, value]) => { const el = form.elements[name]; if (el && !el.value && value) el.value = value; });
            const email = form.elements['customer.email'];
            email.value = me.user.email;
            email.readOnly = true;
            slot.innerHTML = `<p class="co-hint">Zamawiasz jako <strong>${esc(me.user.email)}</strong>; zamówienie pojawi się w Twoim <a href="/konto.html">koncie</a>.</p>`;
            checkout.remember();
        },

        async afterOrder(email, customer) {
            const box = document.querySelector('.co-done');
            const me = await this.me();
            if (!box) return;
            if (me) {
                if (!me.user.profile || !me.user.profile.name) {
                    this.call('profile', { method: 'POST', body: { profile: { name: customer.name, phone: customer.phone, company: customer.company, nip: customer.nip, address: customer.address } } }).catch(() => {});
                }
                this.cached = null;
                box.insertAdjacentHTML('beforeend', '<p class="co-account">Zamówienie jest już w Twoim <a href="/konto.html">koncie klienta</a>, razem z dokumentami.</p>');
                return;
            }
            box.insertAdjacentHTML('beforeend', `<div class="co-account"><strong>Chcesz mieć zamówienia i umowy w jednym miejscu?</strong>`
                + `<p>Załóż konto dla adresu ${esc(email)}: wyślemy link do ustawienia hasła, a to zamówienie od razu będzie w koncie.</p>`
                + `<button type="button" class="btn btn--ghost-dark" data-acct-offer="${esc(email)}">Załóż konto</button></div>`);
        },

        async offerSignUp(button) {
            button.disabled = true;
            const { ok } = await this.call('register', { method: 'POST', body: { email: button.dataset.acctOffer } }).catch(() => ({ ok: false }));
            button.insertAdjacentHTML('afterend', ok
                ? `<p role="status">Wysłaliśmy link na ${esc(button.dataset.acctOffer)}. Otwórz go, aby ustawić hasło.</p>`
                : `<p role="alert">Nie udało się wysłać e-maila. Spróbuj później albo napisz: ${esc(CONTACT)}.</p>`);
            button.remove();
        },

        /* ---- konto.html */

        form(name, inner, submit, { tone = 'primary' } = {}) {
            return `<form data-acct="${name}" novalidate><div class="co-form-error" role="alert" hidden></div>${inner}`
                + `<div><button type="submit" class="btn btn--${tone}">${submit}</button></div></form>`;
        },
        // Two forms on one view (sign in, sign up) each have an e-mail field: same name, own id.
        email(form) { return checkout.field('acct.email', 'E-mail', { id: `acct-${form}-email`, type: 'email', autocomplete: 'email', errorKey: 'email' }); },
        password(name, label, auto) { return checkout.field(`acct.${name}`, label, { type: 'password', autocomplete: auto, errorKey: name }); },

        views: {
            signin() {
                // The Google button appears once the catalogue has given the client ID (mountGoogle).
                return '<div class="acct-google" id="acct-google" hidden><div class="acct-google__btn" id="acct-google-btn"></div>'
                    + '<p class="acct-google__note">Szybciej: kontem Google zalogujesz się albo założysz konto jednym kliknięciem. Google przekaże nam tylko adres e-mail i imię.</p>'
                    + '<p class="co-form-error" id="acct-google-error" role="alert" hidden></p></div>'
                    + `<div class="acct"><section class="acct-card"><h2>Zaloguj się</h2>`
                    + account.form('login', account.email('login') + account.password('password', 'Hasło', 'current-password'), 'Zaloguj się')
                    + `<p class="acct-more"><button type="button" class="acct-link" data-acct-view="forgot">Nie pamiętasz hasła?</button></p></section>`
                    + `<section class="acct-card acct-card--sun"><h2>Załóż konto</h2><ul class="acct-benefits">`
                    + '<li>Wszystkie zamówienia, umowy i potwierdzenia w jednym miejscu.</li><li>Dane do przelewu przy zamówieniach, które czekają na wpłatę.</li><li>Zapisane dane: kolejne zamówienie wypełnia się samo.</li></ul>'
                    + account.form('register', account.email('register') + '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="acct-trap">'
                        + '<p class="co-hint">Wyślemy link do ustawienia hasła. Zamówienia złożone wcześniej tym adresem też pojawią się w koncie.</p>', 'Wyślij link', { tone: 'sun' })
                    + '</section></div>';
            },
            forgot() {
                return `<div class="acct acct--narrow"><section class="acct-card"><h2>Nowe hasło</h2><p>Podaj adres e-mail konta, a wyślemy link do ustawienia nowego hasła.</p>`
                    + account.form('forgot', account.email('forgot'), 'Wyślij link')
                    + '<p class="acct-more"><button type="button" class="acct-link" data-acct-view="signin">Wróć do logowania</button></p></section></div>';
            },
            sent({ email }) {
                return `<div class="acct acct--narrow"><section class="acct-card" role="status"><h2>Sprawdź skrzynkę</h2>`
                    + `<p>Jeśli adres <strong>${esc(email)}</strong> jest poprawny, za chwilę dostaniesz od nas wiadomość z linkiem. Link działa raz.</p>`
                    + '<p class="co-hint">Nie widzisz jej po kilku minutach? Zajrzyj do folderu Spam lub Oferty.</p>'
                    + '<p class="acct-more"><button type="button" class="acct-link" data-acct-view="signin">Wróć do logowania</button></p></section></div>';
            },
            set({ activation }) {
                return `<div class="acct acct--narrow"><section class="acct-card"><h2>${activation ? 'Ustaw hasło do konta' : 'Ustaw nowe hasło'}</h2>`
                    + account.form('set', account.password('password', 'Hasło (co najmniej 8 znaków)', 'new-password') + account.password('repeat', 'Powtórz hasło', 'new-password')
                        + (activation ? '<label class="co-check"><input type="checkbox" name="acct.terms" data-field="terms"><span>Akceptuję <a href="/regulamin-zamowien.html" target="_blank" rel="noopener">regulamin</a> (punkt 11: konto klienta) i <a href="/polityka-prywatnosci.html#zamowienia" target="_blank" rel="noopener">politykę prywatności</a>.</span></label><span class="co-error" data-error-for="terms"></span>' : ''),
                    activation ? 'Załóż konto' : 'Zapisz hasło')
                    + '</section></div>';
            },
            googleTerms({ email }) {
                return `<div class="acct acct--narrow"><section class="acct-card"><h2>Załóż konto przez Google</h2>`
                    + `<p>Nie masz jeszcze konta dla adresu <strong>${esc(email)}</strong>. Zaakceptuj regulamin, a założymy je od razu, bez hasła.</p>`
                    + account.form('googleTerms', '<label class="co-check"><input type="checkbox" name="acct.terms" data-field="terms"><span>Akceptuję <a href="/regulamin-zamowien.html" target="_blank" rel="noopener">regulamin</a> (punkt 11: konto klienta) i <a href="/polityka-prywatnosci.html#zamowienia" target="_blank" rel="noopener">politykę prywatności</a>.</span></label><span class="co-error" data-error-for="terms"></span>', 'Załóż konto')
                    + '<p class="acct-more"><button type="button" class="acct-link" data-acct-view="signin">Wróć do logowania</button></p></section></div>';
            },
            gone({ message }) {
                return `<div class="acct acct--narrow"><section class="acct-card" role="alert"><h2>Link nie działa</h2><p>${esc(message)}</p>`
                    + '<p class="acct-more"><button type="button" class="acct-link" data-acct-view="forgot">Wyślij nowy link</button> · <button type="button" class="acct-link" data-acct-view="signin">Zaloguj się</button></p></section></div>';
            },
            panel({ me, note }) {
                const p = me.user.profile || {};
                const a = p.address || {};
                const orders = me.orders.length
                    ? me.orders.map(o => account.orderRow(o)).join('')
                    : '<p>Nie masz jeszcze zamówień. <a href="/zamow.html">Zobacz ofertę</a>.</p>';
                const field = (name, label, value, opts = {}) => checkout.field(`acct.profile.${name}`, label, { ...opts, errorKey: `profile.${name}` }).replace('<input ', `<input value="${esc(value || '')}" `);
                return `<div class="acct-panel">${note ? `<p class="acct-note" role="status">${esc(note)}</p>` : ''}`
                    + `<div class="acct-head"><div><span class="kicker">Zalogowano</span><strong>${esc(me.user.email)}</strong>${me.user.google ? '<small class="acct-head__via">konto połączone z Google</small>' : ''}</div><button type="button" class="btn btn--ghost-dark" data-acct-logout>Wyloguj</button></div>`
                    + `<section class="acct-card"><h2>Twoje zamówienia</h2>${orders}<p class="co-hint">Nowe zamówienie pojawia się tu w ciągu minuty od złożenia.</p></section>`
                    + `<section class="acct-card"><h2>Dane do zamówień</h2><p class="co-hint">Uzupełnią formularz przy kolejnym zamówieniu.</p>`
                    + account.form('profile', `<div class="co-grid">${field('name', 'Imię i nazwisko', p.name, { autocomplete: 'name' })}${field('phone', 'Telefon', p.phone, { type: 'tel', autocomplete: 'tel' })}</div>`
                        + `<div class="co-grid co-grid--3">${field('address.street', 'Ulica i numer', a.street, { autocomplete: 'street-address' })}${field('address.postal', 'Kod pocztowy', a.postal, { attrs: 'inputmode="numeric" placeholder="00-000" maxlength="6"' })}${field('address.city', 'Miejscowość', a.city)}</div>`
                        + `<div class="co-grid">${field('company', 'Firma', p.company, { optional: true, autocomplete: 'organization' })}${field('nip', 'NIP', p.nip, { optional: true, attrs: 'inputmode="numeric"' })}</div>`, 'Zapisz dane')
                    + '</section>'
                    // An account opened with Google has no password until one is set through the link.
                    + (me.user.hasPassword
                        ? `<section class="acct-card"><h2>Hasło</h2>${account.form('password', `<div class="co-grid">${account.password('current', 'Obecne hasło', 'current-password')}${account.password('next', 'Nowe hasło (co najmniej 8 znaków)', 'new-password')}</div>`, 'Zmień hasło', { tone: 'ghost-dark' })}</section>`
                        : `<section class="acct-card"><h2>Hasło</h2><p>Logujesz się kontem Google. Jeśli chcesz logować się też hasłem, wyślemy link do jego ustawienia na ${esc(me.user.email)}.</p>${account.form('addPassword', '', 'Wyślij link', { tone: 'ghost-dark' })}</section>`)
                    + `<details class="acct-card acct-danger"><summary>Usuń konto</summary><p>Usuniemy konto i zapisane dane. Zamówienia i ich dokumenty zostają u nas tak długo, jak wymagają tego przepisy.</p>`
                    + `${account.form('delete', me.user.hasPassword ? account.password('confirm', 'Hasło, aby potwierdzić', 'current-password')
                        : checkout.field('acct.confirmWord', 'Wpisz USUŃ, aby potwierdzić', { errorKey: 'confirmWord', autocomplete: 'off' }), 'Usuń konto', { tone: 'ghost-dark' })}</details></div>`;
            },
        },

        orderRow(o) {
            const kind = o.kind === 'event' ? `Impreza ${isoDay(o.eventDate)}` : 'Wysyłka';
            const pay = o.payment;
            return `<article class="acct-order"><div><strong>${esc(o.number)}</strong> <span class="acct-badge acct-badge--${esc(o.status)}">${esc(o.statusLabel)}</span>`
                + `<br><small>${esc(plDay(o.createdAt))} · ${esc(kind)}</small></div><div class="acct-order__total">${esc(o.total)}</div>`
                + `<div class="acct-order__actions"><a href="${esc(o.documentUrl)}" target="_blank" rel="noopener">${o.kind === 'event' ? 'Umowa' : 'Potwierdzenie'}</a>`
                + `<a href="${esc(o.documentUrl)}&amp;pdf=1" target="_blank" rel="noopener">PDF</a>`
                + (pay ? `<button type="button" class="acct-link" data-acct-pay="${esc(o.number)}" aria-expanded="false">Dane do przelewu</button>` : '') + '</div>'
                + (pay ? `<dl class="co-pay acct-pay" id="pay-${esc(o.number)}" hidden><dt>Odbiorca</dt><dd>${esc(pay.recipient)}, ${esc(pay.recipientAddress)}</dd>`
                    + `<dt>Numer rachunku</dt><dd>${esc(pay.bankAccount)}</dd><dt>Tytuł</dt><dd>${esc(pay.title)}</dd><dt>Kwota</dt><dd>${esc(pay.amount)}</dd><dt>Termin</dt><dd>do ${esc(pay.deadline)}</dd></dl>` : '')
                + '</article>';
        },

        show(view, args = {}) {
            this.root.innerHTML = this.views[view](args);
            const first = this.root.querySelector('input:not([type="hidden"]):not(.acct-trap)');
            if (first && view !== 'panel') first.focus({ preventScroll: true });
            if (view === 'signin') this.mountGoogle();
        },

        /* ---- Zaloguj przez Google (Google Identity Services, only on the account page) */

        googleClientId: null,
        googleScript: null,
        googleReady: false,
        pendingCredential: '',

        googleSetup(clientId) {
            this.googleClientId = clientId || null;
            this.mountGoogle();
        },
        loadGoogle() {
            if (!this.googleScript) {
                this.googleScript = new Promise((resolve, reject) => {
                    if (window.google && window.google.accounts && window.google.accounts.id) { resolve(); return; }
                    const script = document.createElement('script');
                    script.src = 'https://accounts.google.com/gsi/client';
                    script.async = true;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }
            return this.googleScript;
        },
        async mountGoogle() {
            if (!this.googleClientId || !document.getElementById('acct-google')) return;
            try { await this.loadGoogle(); } catch (e) { return; }
            const target = document.getElementById('acct-google-btn');
            if (!target || !window.google || !window.google.accounts) return;
            if (!this.googleReady) {
                window.google.accounts.id.initialize({
                    client_id: this.googleClientId,
                    callback: response => this.googleCredential(response.credential),
                    ux_mode: 'popup',
                    auto_select: false,
                    context: 'signin',
                });
                this.googleReady = true;
            }
            window.google.accounts.id.renderButton(target, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', locale: 'pl', width: 320 });
            document.getElementById('acct-google').hidden = false;
        },
        async googleCredential(credential, terms = false) {
            this.pendingCredential = credential;
            const { ok, status, data } = await this.call('google', { method: 'POST', body: { credential, terms } }).catch(() => ({ ok: false, status: 0, data: {} }));
            if (status === 409 && data.needsTerms) { this.show('googleTerms', { email: data.email }); return; }
            if (!ok) {
                const message = (data.errors && data.errors.form) || `Logowanie przez Google się nie udało. Spróbuj ponownie albo napisz: ${CONTACT}.`;
                const box = document.getElementById('acct-google-error');
                if (box) { box.textContent = message; box.hidden = false; } else { this.show('signin'); }
                return;
            }
            this.pendingCredential = '';
            this.signIn(data);
            track(terms ? 'sign_up' : 'login', { method: 'google' });
            if (new URLSearchParams(location.search).get('wroc') === 'zamowienie') { location.href = CHECKOUT_URL; return; }
            await this.showPanel(terms ? 'Konto założone przez Google. Witamy w Browarze Pogórza.' : '');
        },

        async showPanel(note) {
            this.cached = null;
            const me = await this.me();
            if (!me) { this.show('signin'); return; }
            this.show('panel', { me, note });
        },

        errors(form, errors) {
            form.querySelectorAll('[data-error-for]').forEach((el) => { el.textContent = ''; });
            form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
            const box = form.querySelector('.co-form-error');
            box.hidden = true;
            Object.entries(errors || {}).forEach(([key, message]) => {
                const slot = form.querySelector(`[data-error-for="${key}"]`);
                if (!slot) { box.textContent = message; box.hidden = false; return; }
                slot.textContent = message;
                const input = form.querySelector(`[data-field="${key}"]`);
                if (input) input.setAttribute('aria-invalid', 'true');
            });
        },

        async submit(form) {
            const v = name => (form.elements[`acct.${name}`] || {}).value || '';
            const button = form.querySelector('button[type="submit"]');
            const fail = (status, data) => this.errors(form, data.errors || { form: status === 429 ? 'Za dużo prób w krótkim czasie. Spróbuj za kilka minut.' : status === 502 ? `Nie udało się wysłać e-maila. Spróbuj później albo napisz: ${CONTACT}.` : `Coś poszło nie tak. Spróbuj ponownie albo napisz: ${CONTACT}.` });
            button.disabled = true;
            try {
                const kind = form.dataset.acct;
                if (kind === 'login') {
                    const { ok, status, data } = await this.call('login', { method: 'POST', body: { email: v('email'), password: v('password') } });
                    if (!ok) { fail(status, data); return; }
                    this.signIn(data);
                    track('login', { method: 'email' });
                    if (new URLSearchParams(location.search).get('wroc') === 'zamowienie') { location.href = CHECKOUT_URL; return; }
                    await this.showPanel();
                } else if (kind === 'register' || kind === 'forgot') {
                    const { ok, status, data } = await this.call(kind === 'register' ? 'register' : 'reset-request', { method: 'POST', body: { email: v('email'), website: (form.elements.website || {}).value || '' } });
                    if (!ok) { fail(status, data); return; }
                    this.show('sent', { email: v('email') });
                } else if (kind === 'set') {
                    if (v('password') !== v('repeat')) { this.errors(form, { repeat: 'Hasła się różnią.' }); return; }
                    const terms = form.elements['acct.terms'];
                    const { ok, status, data } = await this.call('set-password', { method: 'POST', body: { token: this.token, password: v('password'), terms: Boolean(terms && terms.checked) } });
                    if (status === 410) { this.show('gone', { message: data.message || 'Ten link wygasł albo został już użyty.' }); return; }
                    if (!ok) { fail(status, data); return; }
                    this.signIn(data);
                    if (terms) track('sign_up', { method: 'email' });
                    await this.showPanel(terms ? 'Konto założone. Witamy w Browarze Pogórza.' : 'Hasło zmienione.');
                } else if (kind === 'profile') {
                    const profile = { name: v('profile.name'), phone: v('profile.phone'), company: v('profile.company'), nip: v('profile.nip'), address: { street: v('profile.address.street'), postal: v('profile.address.postal'), city: v('profile.address.city') } };
                    const { ok, status, data } = await this.call('profile', { method: 'POST', body: { profile } });
                    if (status === 401) { this.show('signin'); return; }
                    if (!ok) { fail(status, data); return; }
                    await this.showPanel('Dane zapisane.');
                } else if (kind === 'password') {
                    const { ok, status, data } = await this.call('password', { method: 'POST', body: { current: v('current'), password: v('next') } });
                    if (status === 401) { this.show('signin'); return; }
                    if (!ok) { fail(status, { errors: data.errors && { current: data.errors.current, next: data.errors.password } }); return; }
                    this.signIn(data);
                    await this.showPanel('Hasło zmienione. Na innych urządzeniach trzeba zalogować się ponownie.');
                } else if (kind === 'googleTerms') {
                    if (!(form.elements['acct.terms'] || {}).checked) { this.errors(form, { terms: 'Zaakceptuj regulamin, aby założyć konto.' }); return; }
                    await this.googleCredential(this.pendingCredential, true);
                } else if (kind === 'addPassword') {
                    const me = await this.me();
                    const { ok, status, data } = await this.call('reset-request', { method: 'POST', body: { email: me ? me.user.email : '' } });
                    if (!ok) { fail(status, data); return; }
                    form.innerHTML = '<p class="acct-note" role="status">Wysłaliśmy link. Otwórz go, aby ustawić hasło.</p>';
                } else if (kind === 'delete') {
                    const word = form.elements['acct.confirmWord'];
                    const { ok, status, data } = await this.call('delete', { method: 'POST', body: word ? { confirm: word.value } : { password: v('confirm') } });
                    if (!ok) { fail(status, { errors: data.errors && (word ? { confirmWord: data.errors.confirm } : { confirm: data.errors.password }) }); return; }
                    this.signOut();
                    this.show('signin');
                    this.root.insertAdjacentHTML('afterbegin', '<p class="acct-note" role="status">Konto usunięte.</p>');
                }
            } catch (e) {
                this.errors(form, { form: `Brak połączenia z serwerem. Spróbuj ponownie albo napisz: ${CONTACT}.` });
            } finally {
                if (button.isConnected) button.disabled = false;
            }
        },

        async init(root) {
            this.root = root;
            root.addEventListener('submit', (event) => { event.preventDefault(); this.submit(event.target); });
            root.addEventListener('click', async (event) => {
                const view = event.target.closest('[data-acct-view]');
                if (view) { this.show(view.dataset.acctView); return; }
                const pay = event.target.closest('[data-acct-pay]');
                if (pay) {
                    const box = document.getElementById(`pay-${pay.dataset.acctPay}`);
                    box.hidden = !box.hidden;
                    pay.setAttribute('aria-expanded', String(!box.hidden));
                    return;
                }
                if (event.target.closest('[data-acct-logout]')) {
                    await this.call('logout', { method: 'POST' }).catch(() => {});
                    this.signOut();
                    this.show('signin');
                }
            });
            // A link from the e-mail: keep its token in memory and take it out of the address bar.
            const link = location.hash.match(/^#(aktywuj|nowe-haslo)=([\w.-]+)$/);
            if (link) {
                this.token = link[2];
                history.replaceState(null, '', location.pathname + location.search);
                this.show('set', { activation: link[1] === 'aktywuj' });
                return;
            }
            if (this.session()) await this.showPanel();
            else this.show('signin');
        },
    };

    /* ------------------------------------------------------------- boot */

    const boot = async () => {
        const grid = document.getElementById('shop-catalog');
        const checkoutRoot = document.getElementById('shop-checkout');
        const accountRoot = document.getElementById('shop-account');
        if (accountRoot) account.init(accountRoot);
        const calcForm = document.getElementById('beer-calc');
        if (calcForm) calculator.init(calcForm);
        const hash = location.hash.replace('#', '');
        if (hash === 'bezalkoholowe' || hash === 'impreza') {
            render.filter = hash === 'impreza' ? 'event' : 'na';
            document.querySelectorAll('[data-shop-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.shopFilter === render.filter)));
        }
        try {
            catalog = await (await fetch(`${ENDPOINT}/shop/catalog`, { credentials: 'omit' })).json();
            if (!catalog || !Array.isArray(catalog.products)) throw new Error('catalog');
        } catch (e) {
            const msg = `<div class="shop-note"><strong>Nie udało się wczytać oferty.</strong> Odśwież stronę albo napisz do nas: ${esc(CONTACT)}.</div>`;
            if (grid) grid.innerHTML = msg;
            if (checkoutRoot) checkoutRoot.innerHTML = msg;
            return;
        }
        if (checkoutRoot) checkout.init(checkoutRoot);
        if (accountRoot) account.googleSetup(catalog.settings.googleClientId);
        render.all();
        document.addEventListener('change', (event) => {
            const q = event.target.closest('input[data-qty]');
            if (!q || event.target.closest('#shop-checkout')) return;
            q.value = Math.max(1, Math.min(999, parseInt(q.value, 10) || 1));
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
