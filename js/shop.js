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
    const CHECKOUT_URL = '/zamowienie.html';
    const CONTACT = 'slawek@browarpogorza.pl, tel. +48 734 180 172';

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
            grid.innerHTML = list.map(card).join('') + notes.map(note).join('')
                || note(`Nic tu jeszcze nie ma. Napisz do nas: ${esc(CONTACT)}.`);
        },
        buyBoxes() {
            document.querySelectorAll('[data-shop-product]').forEach((box) => {
                const p = byId(box.dataset.shopProduct);
                if (!p || !offered(p) || !catalog.settings.shopOpen) { box.hidden = true; return; }
                const inCart = cart.qty(p.id);
                const s = catalog.settings;
                const lead = p.alcoholic
                    ? 'Na imprezę zamkniętą: wesele, urodziny, imprezę firmową. Dostarczamy na miejsce imprezy na podstawie umowy, którą zawierasz przy zamówieniu.'
                    : `Wysyłka kurierem. Najmniejsze zamówienie: ${s.na.minItems} szt. (możesz łączyć różne piwa bezalkoholowe).`;
                box.innerHTML = `<h2>${p.alcoholic ? 'Zamów na imprezę' : 'Zamów z wysyłką'}</h2><p>${esc(lead)}</p>`
                    + `<div class="shop-buy__row"><div class="shop-buy__price">${zl(p.priceGr)}<small>${packLine(p)}</small></div>`
                    + `${qtyControl(p.id, 1, p.name)}<button type="button" class="btn btn--sun" data-add="${esc(p.id)}">Dodaj</button></div>`
                    + (inCart ? `<p style="margin:10px 0 0">W zamówieniu: ${inCart} szt. <a href="${CHECKOUT_URL}">Przejdź do zamówienia</a></p>` : '');
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
            const id = `co-${name.replace(/\./g, '-')}`;
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
                    ? `<strong>Zamówienie na imprezę zamkniętą.</strong> Piwo z alkoholem dostarczamy własnym transportem na miejsce Twojej imprezy (${esc(ev.areaLabel)}), na podstawie umowy, którą zawierasz w ostatnim kroku. Najmniej ${ev.minItems} szt., najwyżej ${String(ev.maxLitresPerGuest).replace('.', ',')} l piwa na gościa, zamówienie najpóźniej ${ev.leadHours} godzin przed imprezą.`
                    : `<strong>Piwa bezalkoholowe z wysyłką kurierem.</strong> Najmniej ${s.na.minItems} szt.; nadajemy w ciągu ${s.na.dispatchDays} dni roboczych od zaksięgowania wpłaty.`}</div>`
                + `<table class="co-lines"><tbody>${items.map((i) => { const p = byId(i.id); return `<tr data-id="${esc(p.id)}"><td><strong>${esc(p.name)}</strong><br><small>${esc(p.abvLabel)} · ${packLine(p)}</small></td>`
                    + `<td>${qtyControl(p.id, i.qty, p.name)}</td><td class="num">${zl(p.priceGr * i.qty)}<br><button type="button" class="co-remove" data-remove="${esc(p.id)}">Usuń</button></td></tr>`; }).join('')}</tbody></table>`
                + `<span class="co-error" data-error-for="items"></span>`
                + `<p style="margin:12px 0 0"><a href="/zamow.html">Dodaj inne piwa</a></p></section>`
                + (event ? `<section class="co-step">${head('Twoja impreza', 'Dane imprezy trafiają do umowy: piwo dostarczamy tylko na imprezę zamkniętą, w miejscu i czasie, które wskażesz.')}`
                    + `<div class="co-field co-field--wide"><span class="lbl" style="font-size:.82rem;font-weight:600">Rodzaj imprezy</span><div class="co-types">${types}</div><span class="co-error" data-error-for="event.type"></span></div>`
                    + `<div class="co-grid" style="margin-top:12px">${this.field('event.typeOther', 'Jaka to impreza?', { wide: true, attrs: 'placeholder="np. jubileusz, komunia, spotkanie klubowe"' })}`
                    + `${this.field('event.date', 'Data imprezy', { type: 'date', attrs: `min="${minDate}" max="${maxDate}"` })}`
                    + `${this.field('event.guests', 'Liczba zaproszonych dorosłych gości', { type: 'number', attrs: 'min="2" max="500" inputmode="numeric"' })}`
                    + `${this.field('event.timeFrom', 'Początek imprezy', { type: 'time' })}${this.field('event.timeTo', 'Koniec imprezy', { type: 'time' })}`
                    + `${this.field('event.venue', 'Miejsce (nazwa obiektu, np. sala, dom, ogród)', { wide: true })}</div>`
                    + `<div style="margin-top:12px">${this.address('event.address')}</div>`
                    + `<div class="co-grid" style="margin-top:12px">${this.field('event.deliveryFrom', 'Dostawa od (w dniu imprezy)', { type: 'time', errorKey: 'event.delivery' })}${this.field('event.deliveryTo', 'Dostawa do', { type: 'time', errorKey: 'event.delivery' })}`
                    + `${this.field('event.receiverName', 'Kto odbierze dostawę (pełnoletni, z dowodem)', { autocomplete: 'off' })}${this.field('event.receiverPhone', 'Telefon osoby odbierającej', { type: 'tel', autocomplete: 'off' })}</div></section>`
                    : `<section class="co-step">${head('Dostawa', 'Wysyłka kurierem na adres w Polsce.')}`
                    + `<label class="co-check"><input type="checkbox" name="shipping.same" checked><span>Wyślij na mój adres z danych zamawiającego</span></label>`
                    + `<div id="co-ship-other" hidden>${this.address('shipping', 'shipping')}</div></section>`)
                + `<section class="co-step">${head('Twoje dane')}<div class="co-grid">`
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
                    deliveryFrom: val('event.deliveryFrom'), deliveryTo: val('event.deliveryTo'), receiverName: val('event.receiverName'), receiverPhone: val('event.receiverPhone'),
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
                this.done(data, body.customer.email);
            } catch (e) {
                this.showErrors({ form: `Brak połączenia z serwerem zamówień. Spróbuj ponownie albo napisz: ${CONTACT}.` });
            } finally {
                this.sending = false;
                if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
            }
        },

        done(data, email) {
            const p = data.payment;
            const copy = v => `<button type="button" class="co-copy" data-copy="${esc(v)}">kopiuj</button>`;
            this.root.innerHTML = `<div class="co-done" role="status"><h2 style="font-family:var(--font-display);font-weight:500;font-size:2rem;color:var(--green-forest);margin:0 0 8px">Dziękujemy. ${data.kind === 'event' ? `Umowa ${esc(data.number)} zawarta` : `Zamówienie ${esc(data.number)} przyjęte`}.</h2>`
                + `<p>${data.mailed ? `Wysłaliśmy ${data.kind === 'event' ? 'treść umowy' : 'potwierdzenie'} na adres ${esc(email)}.` : `Zapisaliśmy zamówienie. Jeśli e-mail nie dotrze w ciągu kilku minut, napisz do nas: ${esc(CONTACT)}.`} Realizację zaczniemy po zaksięgowaniu wpłaty.</p>`
                + `<div class="co-pay"><dl><dt>Kwota</dt><dd>${esc(p.amount)}</dd><dt>Rachunek</dt><dd>${esc(p.bankAccount)}${copy(p.bankAccount)}</dd>`
                + (p.bankName ? `<dt>Bank</dt><dd>${esc(p.bankName)}</dd>` : '')
                + `<dt>Odbiorca</dt><dd>${esc(p.recipient)}</dd><dt>Tytuł przelewu</dt><dd>${esc(p.title)}${copy(p.title)}</dd><dt>Termin</dt><dd>${p.deadlineHours} godzin</dd></dl></div>`
                + `<p><a class="btn btn--primary" href="${esc(data.documentUrl)}" target="_blank" rel="noopener">${data.kind === 'event' ? 'Otwórz umowę' : 'Otwórz potwierdzenie'}</a> <a class="btn btn--ghost-dark" href="/zamow.html">Wróć do oferty</a></p></div>`;
            this.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        bind() {
            this.root.addEventListener('click', (event) => {
                if (stepQty(event)) return;
                const rm = event.target.closest('[data-remove]');
                if (rm) { cart.set(rm.dataset.remove, 0); this.refresh(); return; }
                if (event.target.id === 'co-place') { this.place(); return; }
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

    /* ------------------------------------------------------------- boot */

    const boot = async () => {
        const grid = document.getElementById('shop-catalog');
        const checkoutRoot = document.getElementById('shop-checkout');
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
