// Kapsel - the AI assistant on the private label pages of browarpogorza.pl.
// One widget, five languages, five names - each a play on the crown cap that
// closes a bottle: PL Kapsel, EN Capper, DE Kronki, ES Chapita, UK Корок.
//
// Answers stream from a Cloudflare Worker (assistant/worker.js), which holds the
// API key. A finished enquiry goes back to the same Worker, which e-mails it to the
// brewery (assistant/mail.js) after the visitor has checked every field.
//
// Loaded with defer from the landing's <head>. Stays invisible while data-endpoint
// is empty, and while the age gate or the cookie banner is on screen.
(() => {
    'use strict';

    const script = document.currentScript;
    const ENDPOINT = ((script && script.dataset.endpoint) || '').trim().replace(/\/+$/, '');
    if (!ENDPOINT || window.__kapsel) return;
    window.__kapsel = true;

    const PRIVACY_URL = '/polityka-prywatnosci.html#asystent-ai';
    const MAX_CHARS = 1200;          // the Worker enforces the same per message
    const MAX_MESSAGES = 28;         // the Worker accepts 30; keep room for the last turn
    const TRANSCRIPT_CHARS = 15000;
    const STORAGE_KEY = 'bp_kapsel_v1_';
    const SMALL = '(max-width: 720px)';
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    const STRINGS = {
        pl: {
            name: 'Kapsel',
            launcher: 'Zapytaj Kapsla',
            open: 'Otwórz czat z asystentem AI',
            subtitle: 'asystent AI Browaru Pogórza',
            greeting: 'Cześć, jestem Kapsel - asystent AI Browaru Pogórza. Wyjaśnię, jak działa piwo z własną etykietą, i pomogę przygotować zapytanie o wycenę. O co chcesz zapytać?',
            chips: ['Jak to działa?', 'Od ilu sztuk?', 'Ile trwa realizacja?', 'Wysyłka i formalności'],
            placeholder: 'Napisz pytanie...',
            send: 'Wyślij',
            typing: 'Kapsel pisze',
            briefBtn: 'Przygotuj zapytanie o wycenę',
            briefSent: 'Zapytanie wysłane',
            newChat: 'Nowa rozmowa',
            close: 'Zamknij czat',
            disclaimer: 'Kapsel to asystent AI i może się pomylić. Wiążąca jest oferta od browaru.',
            privacy: 'Prywatność',
            preparing: 'Przygotowuję podsumowanie rozmowy...',
            formTitle: 'Twoje zapytanie',
            formIntro: 'Sprawdź i uzupełnij dane - wyślemy je do browaru razem z zapisem tej rozmowy.',
            labels: {
                name: 'Imię i nazwisko', company: 'Firma', email: 'E-mail', phone: 'Telefon',
                country: 'Kraj i miasto dostawy', occasion: 'Okazja lub cel', quantity: 'Ilość',
                format: 'Format', styles: 'Styl piwa', deadline: 'Termin', artwork: 'Etykieta',
                notes: 'Uwagi', summary: 'Podsumowanie',
            },
            consent: 'Wysyłając, przekazujesz te dane Browarowi Pogórza, żeby przygotował ofertę.',
            privacyLong: 'Polityka prywatności',
            submit: 'Wyślij do browaru',
            back: 'Wróć do rozmowy',
            sending: 'Wysyłam...',
            sent: 'Dziękujemy! Zapytanie dotarło do Browaru Pogórza. Odpowiedź przyjdzie na adres {email}.',
            sendFailed: 'Nie udało się wysłać. Skopiuj podsumowanie i wyślij je na slawek@browarpogorza.pl.',
            copy: 'Kopiuj podsumowanie',
            copied: 'Skopiowano',
            emailInvalid: 'Podaj poprawny adres e-mail - na niego przyjdzie wycena.',
            errors: {
                failed: 'Coś poszło nie tak. Spróbuj jeszcze raz albo napisz na slawek@browarpogorza.pl.',
                busy: 'Mam teraz dużo rozmów. Spróbuj za chwilę albo napisz na slawek@browarpogorza.pl.',
                rate: 'Za dużo pytań naraz. Odczekaj chwilę albo napisz na slawek@browarpogorza.pl.',
                config: 'Asystent jest chwilowo niedostępny. Napisz na slawek@browarpogorza.pl albo zadzwoń: +48 734 180 172.',
                refusal: 'Na to pytanie nie odpowiem. Chętnie pomogę w sprawie piwa z własną etykietą.',
                truncated: '(odpowiedź została skrócona)',
                tooLong: 'Ta rozmowa jest już długa. Przygotuj zapytanie przyciskiem poniżej albo napisz na slawek@browarpogorza.pl.',
                briefFailed: 'Nie udało się przygotować podsumowania. Uzupełnij pola albo napisz na slawek@browarpogorza.pl.',
            },
        },
        en: {
            name: 'Capper',
            launcher: 'Ask Capper',
            open: 'Open chat with the AI assistant',
            subtitle: 'Browar Pogórza AI assistant',
            greeting: 'Hi, I\'m Capper, the AI assistant of Browar Pogórza. I can explain how beer with your own label works and help you prepare a quote request. What would you like to know?',
            chips: ['How does it work?', 'Minimum order?', 'Lead time?', 'Shipping and paperwork'],
            placeholder: 'Type your question...',
            send: 'Send',
            typing: 'Capper is typing',
            briefBtn: 'Prepare a quote request',
            briefSent: 'Enquiry sent',
            newChat: 'New chat',
            close: 'Close chat',
            disclaimer: 'Capper is an AI assistant and can make mistakes. The brewery\'s offer is what counts.',
            privacy: 'Privacy',
            preparing: 'Preparing a summary of our chat...',
            formTitle: 'Your enquiry',
            formIntro: 'Check and complete the details - we will send them to the brewery together with this chat.',
            labels: {
                name: 'Name', company: 'Company', email: 'E-mail', phone: 'Phone',
                country: 'Delivery country and city', occasion: 'Occasion or purpose', quantity: 'Quantity',
                format: 'Format', styles: 'Beer style', deadline: 'Deadline', artwork: 'Label',
                notes: 'Notes', summary: 'Summary',
            },
            consent: 'By sending, you pass these details to Browar Pogórza so it can prepare an offer.',
            privacyLong: 'Privacy policy (in Polish)',
            submit: 'Send to the brewery',
            back: 'Back to the chat',
            sending: 'Sending...',
            sent: 'Thank you! Your enquiry has reached Browar Pogórza. The reply will go to {email}.',
            sendFailed: 'Sending failed. Copy the summary and e-mail it to slawek@browarpogorza.pl.',
            copy: 'Copy summary',
            copied: 'Copied',
            emailInvalid: 'Please enter a valid e-mail address - the quote will be sent there.',
            errors: {
                failed: 'Something went wrong. Please try again or write to slawek@browarpogorza.pl.',
                busy: 'I am handling a lot of chats right now. Please try again in a moment or write to slawek@browarpogorza.pl.',
                rate: 'Too many questions at once. Please wait a moment or write to slawek@browarpogorza.pl.',
                config: 'The assistant is unavailable right now. Please write to slawek@browarpogorza.pl or call +48 734 180 172.',
                refusal: 'I can\'t answer that one. I\'m happy to help with beer under your own label.',
                truncated: '(the answer was cut short)',
                tooLong: 'This chat is getting long. Prepare your enquiry with the button below or write to slawek@browarpogorza.pl.',
                briefFailed: 'I couldn\'t prepare the summary. Please fill in the fields or write to slawek@browarpogorza.pl.',
            },
        },
        de: {
            name: 'Kronki',
            launcher: 'Kronki fragen',
            open: 'Chat mit dem KI-Assistenten öffnen',
            subtitle: 'KI-Assistent der Browar Pogórza',
            greeting: 'Guten Tag, ich bin Kronki, der KI-Assistent der Browar Pogórza. Ich erkläre Ihnen, wie Bier mit eigenem Etikett funktioniert, und helfe Ihnen, eine Angebotsanfrage vorzubereiten. Was möchten Sie wissen?',
            chips: ['Wie funktioniert das?', 'Mindestmenge?', 'Lieferzeit?', 'Versand und Formalitäten'],
            placeholder: 'Ihre Frage...',
            send: 'Senden',
            typing: 'Kronki schreibt',
            briefBtn: 'Angebotsanfrage vorbereiten',
            briefSent: 'Anfrage gesendet',
            newChat: 'Neues Gespräch',
            close: 'Chat schließen',
            disclaimer: 'Kronki ist ein KI-Assistent und kann sich irren. Verbindlich ist das Angebot der Brauerei.',
            privacy: 'Datenschutz',
            preparing: 'Ich fasse unser Gespräch zusammen...',
            formTitle: 'Ihre Anfrage',
            formIntro: 'Bitte prüfen und ergänzen Sie die Angaben - wir senden sie zusammen mit diesem Chat an die Brauerei.',
            labels: {
                name: 'Name', company: 'Firma', email: 'E-Mail', phone: 'Telefon',
                country: 'Lieferland und Ort', occasion: 'Anlass oder Zweck', quantity: 'Menge',
                format: 'Format', styles: 'Bierstil', deadline: 'Termin', artwork: 'Etikett',
                notes: 'Anmerkungen', summary: 'Zusammenfassung',
            },
            consent: 'Mit dem Senden übermitteln Sie diese Angaben an die Browar Pogórza, damit sie ein Angebot erstellen kann.',
            privacyLong: 'Datenschutzerklärung (auf Polnisch)',
            submit: 'An die Brauerei senden',
            back: 'Zurück zum Chat',
            sending: 'Wird gesendet...',
            sent: 'Vielen Dank! Ihre Anfrage ist bei der Browar Pogórza angekommen. Die Antwort geht an {email}.',
            sendFailed: 'Das Senden hat nicht geklappt. Kopieren Sie die Zusammenfassung und schicken Sie sie an slawek@browarpogorza.pl.',
            copy: 'Zusammenfassung kopieren',
            copied: 'Kopiert',
            emailInvalid: 'Bitte geben Sie eine gültige E-Mail-Adresse an - dorthin schicken wir das Angebot.',
            errors: {
                failed: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder schreiben Sie an slawek@browarpogorza.pl.',
                busy: 'Gerade laufen sehr viele Gespräche. Bitte versuchen Sie es gleich noch einmal oder schreiben Sie an slawek@browarpogorza.pl.',
                rate: 'Zu viele Fragen auf einmal. Bitte warten Sie einen Moment oder schreiben Sie an slawek@browarpogorza.pl.',
                config: 'Der Assistent ist gerade nicht erreichbar. Bitte schreiben Sie an slawek@browarpogorza.pl oder rufen Sie an: +48 734 180 172.',
                refusal: 'Darauf kann ich nicht antworten. Bei Bier mit eigenem Etikett helfe ich gern.',
                truncated: '(die Antwort wurde gekürzt)',
                tooLong: 'Dieses Gespräch ist schon lang. Bereiten Sie Ihre Anfrage mit der Schaltfläche unten vor oder schreiben Sie an slawek@browarpogorza.pl.',
                briefFailed: 'Die Zusammenfassung ließ sich nicht erstellen. Bitte füllen Sie die Felder aus oder schreiben Sie an slawek@browarpogorza.pl.',
            },
        },
        es: {
            name: 'Chapita',
            launcher: 'Pregunta a Chapita',
            open: 'Abrir chat con el asistente de IA',
            subtitle: 'asistente de IA de Browar Pogórza',
            greeting: '¡Hola! Soy Chapita, el asistente de IA de Browar Pogórza. Te explico cómo funciona la cerveza con tu propia etiqueta y te ayudo a preparar una solicitud de presupuesto. ¿Qué quieres saber?',
            chips: ['¿Cómo funciona?', '¿Pedido mínimo?', '¿Plazo de entrega?', 'Envío y trámites'],
            placeholder: 'Escribe tu pregunta...',
            send: 'Enviar',
            typing: 'Chapita está escribiendo',
            briefBtn: 'Preparar solicitud de presupuesto',
            briefSent: 'Solicitud enviada',
            newChat: 'Nueva conversación',
            close: 'Cerrar chat',
            disclaimer: 'Chapita es un asistente de IA y puede equivocarse. Lo que vale es la oferta de la cervecería.',
            privacy: 'Privacidad',
            preparing: 'Preparando un resumen de la conversación...',
            formTitle: 'Tu solicitud',
            formIntro: 'Revisa y completa los datos: los enviaremos a la cervecería junto con esta conversación.',
            labels: {
                name: 'Nombre', company: 'Empresa', email: 'Correo electrónico', phone: 'Teléfono',
                country: 'País y ciudad de entrega', occasion: 'Ocasión o finalidad', quantity: 'Cantidad',
                format: 'Formato', styles: 'Estilo de cerveza', deadline: 'Fecha límite', artwork: 'Etiqueta',
                notes: 'Notas', summary: 'Resumen',
            },
            consent: 'Al enviar, facilitas estos datos a Browar Pogórza para que prepare una oferta.',
            privacyLong: 'Política de privacidad (en polaco)',
            submit: 'Enviar a la cervecería',
            back: 'Volver a la conversación',
            sending: 'Enviando...',
            sent: '¡Gracias! Tu solicitud ha llegado a Browar Pogórza. La respuesta irá a {email}.',
            sendFailed: 'No se ha podido enviar. Copia el resumen y envíalo a slawek@browarpogorza.pl.',
            copy: 'Copiar resumen',
            copied: 'Copiado',
            emailInvalid: 'Escribe un correo electrónico válido: ahí te enviaremos el presupuesto.',
            errors: {
                failed: 'Algo ha fallado. Inténtalo de nuevo o escribe a slawek@browarpogorza.pl.',
                busy: 'Ahora mismo tengo muchas conversaciones. Inténtalo en un momento o escribe a slawek@browarpogorza.pl.',
                rate: 'Demasiadas preguntas seguidas. Espera un momento o escribe a slawek@browarpogorza.pl.',
                config: 'El asistente no está disponible ahora. Escribe a slawek@browarpogorza.pl o llama al +48 734 180 172.',
                refusal: 'A eso no puedo responder. Te ayudo con gusto con la cerveza con tu propia etiqueta.',
                truncated: '(la respuesta se ha recortado)',
                tooLong: 'Esta conversación ya es larga. Prepara tu solicitud con el botón de abajo o escribe a slawek@browarpogorza.pl.',
                briefFailed: 'No he podido preparar el resumen. Rellena los campos o escribe a slawek@browarpogorza.pl.',
            },
        },
        uk: {
            name: 'Корок',
            launcher: 'Запитати Корка',
            open: 'Відкрити чат із ШІ-асистентом',
            subtitle: 'ШІ-асистент Browar Pogórza',
            greeting: 'Вітаю! Я Корок, ШІ-асистент Browar Pogórza. Поясню, як працює пиво з власною етикеткою, і допоможу підготувати запит на ціну. Що вас цікавить?',
            chips: ['Як це працює?', 'Мінімальне замовлення?', 'Термін виконання?', 'Доставка й документи'],
            placeholder: 'Напишіть запитання...',
            send: 'Надіслати',
            typing: 'Корок пише',
            briefBtn: 'Підготувати запит на ціну',
            briefSent: 'Запит надіслано',
            newChat: 'Нова розмова',
            close: 'Закрити чат',
            disclaimer: 'Корок - ШІ-асистент, і він може помилятися. Обов’язковою є пропозиція броварні.',
            privacy: 'Конфіденційність',
            preparing: 'Готую підсумок розмови...',
            formTitle: 'Ваш запит',
            formIntro: 'Перевірте й доповніть дані - ми надішлемо їх броварні разом із цією розмовою.',
            labels: {
                name: 'Ім’я та прізвище', company: 'Компанія', email: 'E-mail', phone: 'Телефон',
                country: 'Країна й місто доставки', occasion: 'Нагода або мета', quantity: 'Кількість',
                format: 'Формат', styles: 'Стиль пива', deadline: 'Термін', artwork: 'Етикетка',
                notes: 'Примітки', summary: 'Підсумок',
            },
            consent: 'Надсилаючи, ви передаєте ці дані Browar Pogórza для підготовки пропозиції.',
            privacyLong: 'Політика конфіденційності (польською)',
            submit: 'Надіслати до броварні',
            back: 'Повернутися до розмови',
            sending: 'Надсилаю...',
            sent: 'Дякуємо! Ваш запит отримала броварня Browar Pogórza. Відповідь надійде на {email}.',
            sendFailed: 'Не вдалося надіслати. Скопіюйте підсумок і надішліть його на slawek@browarpogorza.pl.',
            copy: 'Копіювати підсумок',
            copied: 'Скопійовано',
            emailInvalid: 'Вкажіть правильну адресу e-mail - на неї надійде пропозиція.',
            errors: {
                failed: 'Щось пішло не так. Спробуйте ще раз або напишіть на slawek@browarpogorza.pl.',
                busy: 'Зараз дуже багато розмов. Спробуйте за хвилину або напишіть на slawek@browarpogorza.pl.',
                rate: 'Забагато запитань поспіль. Зачекайте трохи або напишіть на slawek@browarpogorza.pl.',
                config: 'Асистент зараз недоступний. Напишіть на slawek@browarpogorza.pl або зателефонуйте: +48 734 180 172.',
                refusal: 'На це я не відповім. Охоче допоможу з пивом під вашою етикеткою.',
                truncated: '(відповідь скорочено)',
                tooLong: 'Розмова вже довга. Підготуйте запит кнопкою нижче або напишіть на slawek@browarpogorza.pl.',
                briefFailed: 'Не вдалося підготувати підсумок. Заповніть поля або напишіть на slawek@browarpogorza.pl.',
            },
        },
    };

    const FORM_FIELDS = [
        { key: 'name', type: 'text', autocomplete: 'name' },
        { key: 'company', type: 'text', autocomplete: 'organization' },
        { key: 'email', type: 'email', autocomplete: 'email', required: true },
        { key: 'phone', type: 'tel', autocomplete: 'tel' },
        { key: 'country', type: 'text' },
        { key: 'occasion', type: 'text' },
        { key: 'quantity', type: 'text' },
        { key: 'format', type: 'text' },
        { key: 'styles', type: 'text' },
        { key: 'deadline', type: 'text' },
        { key: 'artwork', type: 'text' },
        { key: 'notes', type: 'textarea' },
        { key: 'summary', type: 'textarea' },
    ];

    const pageLang = (document.documentElement.lang || 'pl').slice(0, 2).toLowerCase();
    const LANG = Object.prototype.hasOwnProperty.call(STRINGS, pageLang) ? pageLang : 'pl';
    const S = STRINGS[LANG];

    const ICON = {
        close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        reset: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/></svg>',
        send: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    };

    // A crown cap seen from above: 21 teeth, as on a real one.
    const capSvg = cls => {
        const points = Array.from({ length: 42 }, (_, i) => {
            const angle = (i / 42) * Math.PI * 2 - Math.PI / 2;
            const radius = i % 2 ? 20.4 : 23;
            return `${(24 + radius * Math.cos(angle)).toFixed(2)},${(24 + radius * Math.sin(angle)).toFixed(2)}`;
        }).join(' ');
        return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">`
            + `<polygon class="kapsel-cap__rim" points="${points}"/>`
            + '<circle class="kapsel-cap__top" cx="24" cy="24" r="16.5"/>'
            + '<circle class="kapsel-cap__ring" cx="24" cy="24" r="11.5"/>'
            + '<path class="kapsel-cap__hop" d="M24 16.5c-3 2.2-4.2 5-4.2 7.6 0 3.3 1.9 6 4.2 7.4 2.3-1.4 4.2-4.1 4.2-7.4 0-2.6-1.2-5.4-4.2-7.6zM24 19.5v10"/>'
            + '</svg>';
    };

    const escapeHtml = s => String(s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const track = (name, params = {}) => {
        if (typeof window.gtag === 'function') window.gtag('event', name, { ...params, assistant_lang: LANG });
    };

    // ---------------------------------------------------------------- formatting

    // Built from code points so the source itself carries no long dash.
    const LONG_DASH = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, 'g');
    const MID_DASH = new RegExp(String.fromCharCode(0x2013), 'g');

    const LINK_RE = /(https:\/\/browarpogorza\.pl\/[^\s<>()"']*[^\s<>()"'.,;:!?])|(slawek@browarpogorza\.pl)|(\+48 734 180 172)/g;

    const linkify = html => html.replace(LINK_RE, (match, url, mail) => {
        if (url) return `<a href="${url}">${url}</a>`;
        if (mail) return `<a href="mailto:${mail}">${mail}</a>`;
        return `<a href="tel:+48734180172">${match}</a>`;
    });

    // The model is asked for plain text; stray markdown emphasis is dropped, not
    // rendered, and long dashes become the plain hyphen the rest of the site uses.
    const inline = text => linkify(escapeHtml(text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(LONG_DASH, ' - ')
        .replace(MID_DASH, '-')));

    const formatAnswer = text => {
        const out = [];
        let para = [];
        let list = [];
        const flushPara = () => {
            if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
            para = [];
        };
        const flushList = () => {
            if (list.length) out.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`);
            list = [];
        };
        text.replace(/\r/g, '').split('\n').forEach(line => {
            const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
            if (bullet) {
                flushPara();
                list.push(bullet[1]);
            } else if (!line.trim()) {
                flushPara();
                flushList();
            } else {
                flushList();
                para.push(line.trim());
            }
        });
        flushPara();
        flushList();
        return out.join('');
    };

    // ----------------------------------------------------------------- state

    const state = { messages: [], brief: null, briefAt: -1, sent: false, busy: false, open: false };

    const restore = () => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY + LANG) || 'null');
            if (saved && Array.isArray(saved.messages)) Object.assign(state, {
                messages: saved.messages.filter(m => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role)),
                brief: saved.brief || null,
                briefAt: Number.isInteger(saved.briefAt) ? saved.briefAt : -1,
                sent: Boolean(saved.sent),
            });
        } catch (e) { /* storage blocked or corrupt: start clean */ }
    };

    const persist = () => {
        try {
            sessionStorage.setItem(STORAGE_KEY + LANG, JSON.stringify({
                messages: state.messages, brief: state.brief, briefAt: state.briefAt, sent: state.sent,
            }));
        } catch (e) { /* private mode: the chat simply does not survive a reload */ }
    };

    const userTurns = () => state.messages.filter(m => m.role === 'user').length;

    // ------------------------------------------------------------------- DOM

    const field = f => {
        const id = `kapsel-f-${f.key}`;
        const label = `<label for="${id}">${escapeHtml(S.labels[f.key])}${f.required ? ' <span aria-hidden="true">*</span>' : ''}</label>`;
        const attrs = `id="${id}" name="${f.key}"${f.required ? ' required aria-required="true"' : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}`;
        const control = f.type === 'textarea'
            ? `<textarea ${attrs} rows="${f.key === 'summary' ? 4 : 2}" maxlength="1500"></textarea>`
            : `<input ${attrs} type="${f.type}" maxlength="300">`;
        return `<div class="kapsel-field kapsel-field--${f.key}">${label}${control}</div>`;
    };

    const root = document.createElement('div');
    root.className = 'kapsel';
    root.hidden = true;
    root.innerHTML = `
        <button type="button" class="kapsel-launcher" aria-expanded="false" aria-controls="kapsel-panel" aria-label="${escapeHtml(S.open)}">
            ${capSvg('kapsel-cap')}<span class="kapsel-launcher__label">${escapeHtml(S.launcher)}</span>
        </button>
        <div class="kapsel-panel" id="kapsel-panel" role="dialog" aria-modal="false" aria-labelledby="kapsel-title" hidden data-lenis-prevent>
            <div class="kapsel-head">
                ${capSvg('kapsel-cap kapsel-cap--head')}
                <div class="kapsel-head__text">
                    <p class="kapsel-head__title" id="kapsel-title" tabindex="-1">${escapeHtml(S.name)}</p>
                    <p class="kapsel-head__sub">${escapeHtml(S.subtitle)}</p>
                </div>
                <button type="button" class="kapsel-icon" data-act="reset" aria-label="${escapeHtml(S.newChat)}" title="${escapeHtml(S.newChat)}">${ICON.reset}</button>
                <button type="button" class="kapsel-icon" data-act="close" aria-label="${escapeHtml(S.close)}" title="${escapeHtml(S.close)}">${ICON.close}</button>
            </div>
            <div class="kapsel-chat">
                <div class="kapsel-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0"></div>
                <div class="kapsel-chips"></div>
                <form class="kapsel-compose" novalidate>
                    <textarea class="kapsel-input" rows="1" maxlength="${MAX_CHARS}" placeholder="${escapeHtml(S.placeholder)}" aria-label="${escapeHtml(S.placeholder)}"></textarea>
                    <button type="submit" class="kapsel-send" aria-label="${escapeHtml(S.send)}">${ICON.send}</button>
                </form>
                <div class="kapsel-foot">
                    <button type="button" class="kapsel-brief-btn" data-act="brief">${escapeHtml(S.briefBtn)}</button>
                    <p class="kapsel-note">${escapeHtml(S.disclaimer)} <a href="${PRIVACY_URL}" hreflang="pl">${escapeHtml(S.privacy)}</a></p>
                </div>
            </div>
            <form class="kapsel-brief" novalidate hidden>
                <p class="kapsel-brief__title">${escapeHtml(S.formTitle)}</p>
                <p class="kapsel-brief__intro">${escapeHtml(S.formIntro)}</p>
                <p class="kapsel-status" role="status" aria-live="polite"></p>
                ${FORM_FIELDS.map(field).join('')}
                <input type="text" name="_honey" class="kapsel-honey" tabindex="-1" autocomplete="off" aria-hidden="true">
                <p class="kapsel-note">${escapeHtml(S.consent)} <a href="${PRIVACY_URL}" hreflang="pl">${escapeHtml(S.privacyLong)}</a></p>
                <div class="kapsel-brief__actions">
                    <button type="submit" class="kapsel-submit">${escapeHtml(S.submit)}</button>
                    <button type="button" class="kapsel-back" data-act="back">${escapeHtml(S.back)}</button>
                    <button type="button" class="kapsel-copy" data-act="copy" hidden>${escapeHtml(S.copy)}</button>
                </div>
            </form>
        </div>`;

    const $ = sel => root.querySelector(sel);
    const launcher = $('.kapsel-launcher');
    const panel = $('.kapsel-panel');
    const title = $('.kapsel-head__title');
    const chat = $('.kapsel-chat');
    const log = $('.kapsel-log');
    const chips = $('.kapsel-chips');
    const compose = $('.kapsel-compose');
    const input = $('.kapsel-input');
    const sendBtn = $('.kapsel-send');
    const briefBtn = $('.kapsel-brief-btn');
    const resetBtn = $('[data-act="reset"]');
    const form = $('.kapsel-brief');
    const status = $('.kapsel-status');
    const copyBtn = $('.kapsel-copy');

    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const scrollDown = () => { log.scrollTop = log.scrollHeight; };

    const bubble = (role, text) => {
        const el = document.createElement('div');
        el.className = `kapsel-msg kapsel-msg--${role}`;
        if (role === 'user') el.textContent = text;
        else el.innerHTML = formatAnswer(text);
        log.appendChild(el);
        scrollDown();
        return el;
    };

    const notice = (text, tone = 'warn') => {
        const el = document.createElement('div');
        el.className = `kapsel-msg kapsel-msg--notice kapsel-msg--${tone}`;
        el.innerHTML = inline(text);
        log.appendChild(el);
        scrollDown();
        return el;
    };

    const typing = () => {
        const el = document.createElement('div');
        el.className = 'kapsel-msg kapsel-msg--assistant is-typing';
        el.innerHTML = `<span class="kapsel-dots" role="img" aria-label="${escapeHtml(S.typing)}"><i></i><i></i><i></i></span>`;
        log.appendChild(el);
        scrollDown();
        return el;
    };

    const renderChips = () => {
        chips.hidden = userTurns() > 0;
        if (chips.hidden || chips.childElementCount) return;
        chips.innerHTML = S.chips.map(c => `<button type="button" class="kapsel-chip">${escapeHtml(c)}</button>`).join('');
    };

    const renderFoot = () => {
        briefBtn.disabled = state.sent;
        briefBtn.textContent = state.sent ? S.briefSent : S.briefBtn;
    };

    const renderLog = () => {
        log.innerHTML = '';
        bubble('assistant', S.greeting);
        state.messages.forEach(m => bubble(m.role, m.content));
        renderChips();
        renderFoot();
    };

    const autosize = () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
    };

    const setBusy = busy => {
        state.busy = busy;
        sendBtn.disabled = busy;
        resetBtn.disabled = busy;
        briefBtn.disabled = busy || state.sent;
        log.setAttribute('aria-busy', String(busy));
    };

    // ------------------------------------------------------------------ network

    const errorFrom = async res => {
        if (res.status === 429) return 'rate';
        let code = '';
        try { code = (await res.json()).error || ''; } catch (e) { /* not JSON */ }
        if (res.status === 413 || code === 'too_long' || code === 'message_too_long') return 'tooLong';
        if (code === 'config' || code === 'busy') return code;
        return 'failed';
    };

    const readEvents = async (body, onEvent) => {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let cut = buffer.indexOf('\n\n');
            while (cut !== -1) {
                const block = buffer.slice(0, cut);
                buffer = buffer.slice(cut + 2);
                let event = 'message';
                let data = '';
                block.split('\n').forEach(line => {
                    if (line.startsWith('event:')) event = line.slice(6).trim();
                    else if (line.startsWith('data:')) data += line.slice(5).trim();
                });
                let parsed = {};
                try { parsed = data ? JSON.parse(data) : {}; } catch (e) { /* skip a broken frame */ }
                onEvent(event, parsed);
                cut = buffer.indexOf('\n\n');
            }
        }
    };

    const post = (path, payload) => fetch(`${ENDPOINT}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: path === '/chat' ? 'text/event-stream' : 'application/json' },
        body: JSON.stringify(payload),
    });

    // --------------------------------------------------------------------- chat

    const sendMessage = async raw => {
        const content = raw.trim().slice(0, MAX_CHARS);
        if (!content || state.busy) return;
        if (state.messages.length >= MAX_MESSAGES) {
            notice(S.errors.tooLong);
            return;
        }

        input.value = '';
        autosize();
        state.messages.push({ role: 'user', content });
        const userEl = bubble('user', content);
        renderChips();
        setBusy(true);
        const answer = typing();

        let text = '';
        let failure = '';
        let refused = false;
        let truncated = false;
        let frame = 0;
        const paint = () => {
            frame = 0;
            const follow = nearBottom();
            answer.classList.remove('is-typing');
            answer.innerHTML = formatAnswer(text);
            if (follow) scrollDown();
        };

        try {
            const res = await post('/chat', { lang: LANG, messages: state.messages });
            if (!res.ok || !res.body) {
                failure = await errorFrom(res);
            } else {
                await readEvents(res.body, (event, data) => {
                    if (event === 'text') {
                        text += data.t || '';
                        if (!frame) frame = requestAnimationFrame(paint);
                    } else if (event === 'notice') {
                        refused = refused || data.code === 'refusal';
                        truncated = truncated || data.code === 'truncated';
                    } else if (event === 'error') {
                        failure = data.code || 'failed';
                    }
                });
            }
        } catch (e) {
            failure = failure || 'failed';
        }
        if (frame) cancelAnimationFrame(frame);
        setBusy(false);

        if (text.trim()) {
            paint();
            state.messages.push({ role: 'assistant', content: text.trim() });
            if (truncated || failure) notice(S.errors.truncated, 'quiet');
            persist();
            track('assistant_message', { turn: userTurns() });
            return;
        }

        // Nothing came back: take the turn out again so the visitor can simply resend.
        state.messages.pop();
        userEl.remove();
        answer.remove();
        renderChips();
        input.value = content;
        autosize();
        notice(refused ? S.errors.refusal : (S.errors[failure] || S.errors.failed));
        persist();
    };

    const reset = () => {
        if (state.busy) return;
        Object.assign(state, { messages: [], brief: null, briefAt: -1, sent: false });
        persist();
        form.reset();
        FORM_FIELDS.forEach(f => { delete form.elements[f.key].dataset.touched; });
        showChat();
        chips.innerHTML = '';
        renderLog();
        input.focus();
    };

    // ------------------------------------------------------------------- brief

    const showChat = () => {
        form.hidden = true;
        chat.hidden = false;
    };

    const setFormBusy = busy => {
        Array.from(form.elements).forEach(el => { el.disabled = busy; });
    };

    const setStatus = (text, tone = '') => {
        status.textContent = text;
        status.className = `kapsel-status${tone ? ` kapsel-status--${tone}` : ''}`;
    };

    // A fresh summary may overwrite what an earlier one filled in, never what the
    // visitor typed themselves.
    const fillForm = brief => {
        const missing = new Set((brief && brief.missing) || []);
        FORM_FIELDS.forEach(f => {
            const el = form.elements[f.key];
            if (brief && typeof brief[f.key] === 'string' && !el.dataset.touched) el.value = brief[f.key];
            el.closest('.kapsel-field').classList.toggle('is-missing', missing.has(f.key) && !el.value);
        });
    };

    const focusFirstEmpty = () => {
        const empty = FORM_FIELDS.map(f => form.elements[f.key]).find(el => el.required && !el.value.trim());
        (empty || form.elements.email).focus();
    };

    const openBrief = async () => {
        if (state.busy) return;
        chat.hidden = true;
        form.hidden = false;
        copyBtn.hidden = true;
        setStatus('');
        track('assistant_brief', { turn: userTurns() });
        form.scrollTop = 0;

        const stale = state.brief && state.briefAt !== state.messages.length;
        if (!userTurns() || (state.brief && !stale)) {
            fillForm(state.brief);
            focusFirstEmpty();
            return;
        }

        setStatus(S.preparing, 'busy');
        setFormBusy(true);
        try {
            const res = await post('/brief', { lang: LANG, messages: state.messages });
            if (!res.ok) throw new Error(await errorFrom(res));
            const { brief } = await res.json();
            Object.assign(state, { brief, briefAt: state.messages.length });
            persist();
            setStatus('');
        } catch (e) {
            setStatus(S.errors.briefFailed, 'error');
        }
        setFormBusy(false);
        fillForm(state.brief);
        focusFirstEmpty();
    };

    const formValues = () => Object.fromEntries(FORM_FIELDS.map(f => [f.key, form.elements[f.key].value.trim()]));

    const transcript = () => state.messages
        .map(m => `${m.role === 'user' ? 'Klient' : S.name}: ${m.content}`)
        .join('\n\n')
        .slice(0, TRANSCRIPT_CHARS);

    const plainSummary = values => FORM_FIELDS
        .filter(f => values[f.key])
        .map(f => `${S.labels[f.key]}: ${values[f.key]}`)
        .join('\n');

    const submitBrief = async event => {
        event.preventDefault();
        if (form.elements._honey.value) return;
        const values = formValues();
        const email = form.elements.email;
        if (!EMAIL_RE.test(values.email)) {
            email.setAttribute('aria-invalid', 'true');
            setStatus(S.emailInvalid, 'error');
            email.focus();
            return;
        }
        email.removeAttribute('aria-invalid');

        setStatus(S.sending, 'busy');
        setFormBusy(true);
        try {
            const res = await post('/enquiry', {
                lang: LANG,
                page: location.pathname,
                fields: values,
                messages: state.messages,
                brief: { summary_pl: state.brief?.summary_pl || '', flags_pl: state.brief?.flags_pl || '' },
                honey: form.elements._honey.value,
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body.ok !== true) throw new Error(body.error || 'send');
            state.sent = true;
            persist();
            track('generate_lead', { source: 'assistant' });
            setFormBusy(false);
            showChat();
            renderFoot();
            notice(S.sent.replace('{email}', values.email), 'success');
            title.focus();
        } catch (e) {
            setFormBusy(false);
            setStatus(S.sendFailed, 'error');
            copyBtn.hidden = false;
        }
    };

    const copySummary = async () => {
        const values = formValues();
        const text = [plainSummary(values), '', transcript()].join('\n').trim();
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const area = form.elements.summary;
            area.value = text;
            area.select();
        }
        copyBtn.textContent = S.copied;
    };

    // ------------------------------------------------------------ open / close

    const lockPage = lock => {
        const small = window.matchMedia(SMALL).matches;
        document.documentElement.classList.toggle('kapsel-lock', lock && small);
    };

    const openPanel = () => {
        state.open = true;
        panel.hidden = false;
        root.classList.add('is-open');
        launcher.setAttribute('aria-expanded', 'true');
        lockPage(true);
        if (!log.childElementCount) renderLog();
        scrollDown();
        track('assistant_open');
        // On touch screens focusing the input would throw the keyboard over the answers.
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        requestAnimationFrame(() => (coarse || chat.hidden ? title : input).focus());
    };

    const closePanel = () => {
        state.open = false;
        panel.hidden = true;
        root.classList.remove('is-open');
        launcher.setAttribute('aria-expanded', 'false');
        lockPage(false);
        launcher.focus();
    };

    // The age gate and the cookie banner own the screen until they are answered.
    const blocked = () => Boolean(document.querySelector('.age-gate, .cookie-banner'));
    const refreshVisibility = () => {
        const hide = blocked();
        if (hide && state.open) closePanel();
        root.hidden = hide;
    };

    // ----------------------------------------------------------------- events

    launcher.addEventListener('click', () => (state.open ? closePanel() : openPanel()));

    panel.addEventListener('click', event => {
        const act = event.target.closest('[data-act]');
        if (act) {
            const action = act.dataset.act;
            if (action === 'close') closePanel();
            else if (action === 'reset') reset();
            else if (action === 'brief') openBrief();
            else if (action === 'back') { showChat(); input.focus(); }
            else if (action === 'copy') copySummary();
            return;
        }
        const chip = event.target.closest('.kapsel-chip');
        if (chip) sendMessage(chip.textContent);
    });

    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            closePanel();
        }
    });

    compose.addEventListener('submit', event => {
        event.preventDefault();
        sendMessage(input.value);
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            sendMessage(input.value);
        }
    });
    input.addEventListener('input', autosize);
    form.addEventListener('submit', submitBrief);
    form.addEventListener('input', event => {
        event.target.dataset.touched = '1';
        const wrap = event.target.closest('.kapsel-field');
        if (wrap) wrap.classList.remove('is-missing');
    });

    // ------------------------------------------------------------------ styles

    const CSS = `
.kapsel { --k-forest: var(--green-forest, #0F3A22); --k-deep: var(--green-deep, #1A4D2E); --k-leaf: var(--green-leaf, #2D7A3D);
  --k-sun: var(--sun, #FFC02E); --k-sun-deep: var(--sun-deep, #E89020); --k-sun-pale: var(--sun-pale, #FFF0C0);
  --k-cream: var(--cream, #FFF9EC); --k-paper: #FFFFFF; --k-ink: var(--ink, #0A1408); --k-text: var(--text, #1F2A18);
  --k-muted: var(--text-muted, #4E5A45); --k-line: rgba(15, 58, 34, 0.14);
  font-family: var(--font-sans, 'Inter', -apple-system, BlinkMacSystemFont, sans-serif); color: var(--k-text); }
.kapsel[hidden], .kapsel [hidden] { display: none !important; }
.kapsel-launcher { position: fixed; right: 24px; bottom: 24px; z-index: 850; display: inline-flex; align-items: center; gap: 10px;
  height: 56px; padding: 0 22px 0 8px; border-radius: 999px; background: var(--k-forest); color: var(--k-cream);
  font: 600 15px/1 var(--font-sans, sans-serif); box-shadow: 0 12px 32px rgba(15, 58, 34, 0.28); transition: transform .2s ease, background .2s ease; }
.kapsel-launcher:hover { background: var(--k-deep); transform: translateY(-2px); }
.kapsel-launcher:focus-visible { outline: 3px solid var(--k-sun); outline-offset: 3px; }
.kapsel.is-open .kapsel-launcher { background: var(--k-deep); }
.kapsel-cap { width: 40px; height: 40px; flex-shrink: 0; transition: transform .6s ease; }
.kapsel-launcher:hover .kapsel-cap { transform: rotate(60deg); }
.kapsel-cap__rim { fill: var(--k-sun-deep); }
.kapsel-cap__top { fill: var(--k-sun); }
.kapsel-cap__ring { fill: none; stroke: var(--k-forest); stroke-width: 1.6; opacity: .45; }
.kapsel-cap__hop { fill: none; stroke: var(--k-forest); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.kapsel-panel { position: fixed; right: 24px; bottom: 96px; z-index: 850; width: min(400px, calc(100vw - 32px));
  height: min(640px, calc(100vh - var(--nav-h, 96px) - 108px)); display: flex; flex-direction: column; overflow: hidden;
  background: var(--k-cream); border-radius: 18px; box-shadow: 0 30px 70px rgba(15, 58, 34, 0.30); border: 1px solid var(--k-line); }
.kapsel-head { display: flex; align-items: center; gap: 10px; padding: 12px 10px 12px 14px; background: var(--k-forest); color: var(--k-cream); flex-shrink: 0; }
.kapsel-cap--head { width: 38px; height: 38px; }
.kapsel-head__text { flex: 1; min-width: 0; }
.kapsel .kapsel-head__title { margin: 0; font: 600 1.45rem/1.1 var(--font-display, Georgia, serif); color: var(--k-cream); outline: none; }
.kapsel .kapsel-head__sub { margin: 2px 0 0; font-size: .78rem; line-height: 1.3; color: var(--text-light-muted, #D8E5C5); }
.kapsel-icon { width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: var(--k-cream); flex-shrink: 0; }
.kapsel-icon:hover { background: rgba(255, 249, 236, 0.12); }
.kapsel-icon:disabled { opacity: .4; cursor: default; }
.kapsel-icon svg, .kapsel-send svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.kapsel-chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.kapsel-log { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 14px 8px; display: flex; flex-direction: column; gap: 10px; outline: none; }
.kapsel-msg { max-width: 88%; padding: 10px 14px; border-radius: 16px; font-size: .94rem; line-height: 1.5; overflow-wrap: anywhere; }
.kapsel-msg p { margin: 0; }
.kapsel-msg p + p, .kapsel-msg p + ul, .kapsel-msg ul + p { margin-top: 8px; }
.kapsel-msg ul { list-style: disc; padding-left: 1.2em; margin: 0; }
.kapsel-msg li + li { margin-top: 3px; }
.kapsel-msg a { color: var(--k-leaf); text-decoration: underline; text-underline-offset: 2px; }
.kapsel-msg--assistant { align-self: flex-start; background: var(--k-paper); border: 1px solid var(--k-line); border-bottom-left-radius: 5px; }
.kapsel-msg--user { align-self: flex-end; background: var(--k-leaf); color: var(--k-cream); border-bottom-right-radius: 5px; white-space: pre-wrap; }
.kapsel-msg--notice { align-self: stretch; max-width: none; font-size: .86rem; background: var(--k-sun-pale); border-left: 3px solid var(--k-sun-deep); border-radius: 8px; }
.kapsel-msg--success { background: var(--green-mist, #E0F0BE); border-left-color: var(--k-leaf); }
.kapsel-msg--quiet { background: transparent; border: 0; padding: 0 4px; color: var(--k-muted); font-size: .8rem; }
.kapsel-dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.kapsel-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--k-leaf); opacity: .35; animation: kapsel-dot 1.2s infinite ease-in-out; }
.kapsel-dots i:nth-child(2) { animation-delay: .15s; }
.kapsel-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes kapsel-dot { 0%, 80%, 100% { opacity: .35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.kapsel-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
.kapsel-chip { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--k-leaf); color: var(--k-leaf); font-size: .84rem; font-weight: 600; line-height: 1.2; background: transparent; }
.kapsel-chip:hover { background: var(--k-leaf); color: var(--k-cream); }
.kapsel-compose { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--k-line); background: var(--k-cream); }
.kapsel-input { flex: 1; min-width: 0; resize: none; max-height: 128px; padding: 11px 13px; border: 1px solid rgba(15, 58, 34, 0.25); border-radius: 14px;
  font: 400 .95rem/1.4 var(--font-sans, sans-serif); color: var(--k-ink); background: var(--k-paper); }
.kapsel-input:focus { border-color: var(--k-leaf); outline: none; box-shadow: 0 0 0 3px rgba(45, 122, 61, 0.18); }
.kapsel-send { width: 44px; height: 44px; border-radius: 50%; background: var(--k-sun); color: var(--k-ink); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kapsel-send:hover { background: var(--sun-bright, #FFD050); }
.kapsel-send:disabled { opacity: .45; cursor: default; }
.kapsel-foot { padding: 0 12px 12px; background: var(--k-cream); }
.kapsel-brief-btn, .kapsel-submit { width: 100%; padding: 12px 14px; border-radius: 12px; background: var(--k-sun); color: var(--k-ink); font-weight: 700; font-size: .92rem; line-height: 1.25; }
.kapsel-brief-btn:hover, .kapsel-submit:hover { background: var(--sun-bright, #FFD050); }
.kapsel-brief-btn:disabled, .kapsel-submit:disabled { opacity: .55; cursor: default; }
.kapsel .kapsel-note { margin: 8px 2px 0; font-size: .72rem; line-height: 1.4; color: var(--k-muted); }
.kapsel-note a { color: inherit; text-decoration: underline; }
.kapsel-brief { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.kapsel .kapsel-brief__title { margin: 0; font: 600 1.35rem/1.15 var(--font-display, Georgia, serif); color: var(--k-ink); }
.kapsel .kapsel-brief__intro { margin: 0; font-size: .86rem; line-height: 1.45; color: var(--k-muted); }
.kapsel .kapsel-status { margin: 0; font-size: .86rem; line-height: 1.4; }
.kapsel .kapsel-status:empty { display: none; }
.kapsel-status--busy { color: var(--k-leaf); }
.kapsel-status--error { color: #9B2C1F; font-weight: 600; }
.kapsel-field { display: flex; flex-direction: column; gap: 4px; }
.kapsel-field label { font-size: .8rem; font-weight: 600; color: var(--k-ink); }
.kapsel-field input, .kapsel-field textarea { width: 100%; padding: 9px 11px; border: 1px solid rgba(15, 58, 34, 0.25); border-radius: 10px;
  font: 400 .92rem/1.4 var(--font-sans, sans-serif); color: var(--k-ink); background: var(--k-paper); resize: vertical; }
.kapsel-field input:focus, .kapsel-field textarea:focus { border-color: var(--k-leaf); outline: none; box-shadow: 0 0 0 3px rgba(45, 122, 61, 0.18); }
.kapsel-field.is-missing input, .kapsel-field.is-missing textarea { background: var(--k-sun-pale); }
.kapsel-field input[aria-invalid="true"] { border-color: #9B2C1F; }
.kapsel-honey { position: absolute !important; left: -9999px !important; width: 1px; height: 1px; opacity: 0; }
.kapsel-brief__actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.kapsel-back, .kapsel-copy { padding: 10px 14px; border-radius: 12px; border: 1px solid var(--k-leaf); color: var(--k-leaf); font-weight: 600; font-size: .9rem; }
.kapsel-back:hover, .kapsel-copy:hover { background: var(--k-leaf); color: var(--k-cream); }
body.has-kapsel .back-to-top { bottom: 92px; }
@media (max-width: 720px) {
  .kapsel-launcher { right: 16px; bottom: 92px; width: 56px; padding: 0; justify-content: center; }
  .kapsel-launcher__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .kapsel-cap { width: 42px; height: 42px; }
  .kapsel-panel { inset: 0; width: 100%; height: 100%; border-radius: 0; border: 0; z-index: 1500;
    padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .kapsel.is-open .kapsel-launcher { display: none; }
  body.has-kapsel .back-to-top { bottom: 160px; }
  html.kapsel-lock, html.kapsel-lock body { overflow: hidden; }
}
@media (prefers-reduced-motion: reduce) {
  .kapsel-launcher, .kapsel-cap { transition: none; }
  .kapsel-launcher:hover { transform: none; }
  .kapsel-launcher:hover .kapsel-cap { transform: none; }
  .kapsel-dots i { animation: none; opacity: .7; }
}
@media print { .kapsel { display: none !important; } }
`;

    // --------------------------------------------------------------------- boot

    const boot = () => {
        const style = document.createElement('style');
        style.id = 'kapsel-style';
        style.textContent = CSS;
        document.head.appendChild(style);
        restore();
        document.body.appendChild(root);
        document.body.classList.add('has-kapsel');
        refreshVisibility();
        new MutationObserver(refreshVisibility).observe(document.body, { childList: true });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
