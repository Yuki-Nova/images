/* OSS album - paper/ink gallery (shiro-aligned), virtual pagination */
(function () {
    'use strict';

    var PAGE_SIZE = 50;
    var CATEGORY_API = 'api/categories';
    var PROCESS_VIEW = '?x-oss-process=image/auto-orient,1/resize,w_1280/quality,q_80/format,webp';

    var data = [];
    try {
        data = JSON.parse(document.getElementById('gallery-data').textContent || '[]');
    } catch (e) { /* keep empty */ }

    var grid = document.getElementById('grid');
    var filterBar = document.getElementById('filter-bar');
    var countEl = document.getElementById('gallery-count');
    var pageInfo = document.getElementById('page-info');
    var pagePrev = document.getElementById('page-prev');
    var pageNext = document.getElementById('page-next');

    var lightbox = document.getElementById('lightbox');
    var lbImg = document.getElementById('lb-img');
    var lbName = document.getElementById('lb-name');
    var lbSub = document.getElementById('lb-sub');
    var lbCat = document.getElementById('lb-cat');
    var lbOrig = document.getElementById('lb-orig');

    var categoryMap = {};
    var filter = 'ALL';
    var page = 1;
    var filtered = [];
    var lbIndex = -1;
    var touchX = null;
    var cardEls = [];

    /* ---------- data helpers ---------- */
    function catOf(key) {
        return (categoryMap[key] || '').trim();
    }

    function buildChips() {
        var cats = [];
        data.forEach(function (d) {
            var c = catOf(d.key);
            if (c && cats.indexOf(c) === -1) cats.push(c);
        });
        cats.sort(function (a, b) { return a.localeCompare(b, 'zh'); });

        filterBar.innerHTML = '';
        [['ALL', '全部'], ['UNCAT', '未分类']].concat(cats.map(function (c) { return [c, c]; }))
            .forEach(function (pair) {
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'filter-chip' + (pair[0] === filter ? ' active' : '');
                chip.dataset.value = pair[0];
                chip.textContent = pair[1];
                chip.addEventListener('click', function () {
                    filter = pair[0];
                    page = 1;
                    filterBar.querySelectorAll('.filter-chip').forEach(function (c) {
                        c.classList.toggle('active', c.dataset.value === filter);
                    });
                    render();
                });
                filterBar.appendChild(chip);
            });
    }

    /* ---------- virtual render ---------- */
    function applyFilter() {
        filtered = data.filter(function (d) {
            var c = catOf(d.key);
            if (filter === 'ALL') return true;
            if (filter === 'UNCAT') return !c;
            return c === filter;
        });
        countEl.textContent = '共 ' + data.length + ' 张';
    }

    function render() {
        applyFilter();
        var total = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (page > total) page = total;
        var start = (page - 1) * PAGE_SIZE;
        var slice = filtered.slice(start, start + PAGE_SIZE);

        var html = slice.map(function (d, i) {
            var cat = catOf(d.key);
            var badge = cat ? '<span class="card-badge show">' + esc(cat) + '</span>' : '';
            return '<figure class="card" data-key="' + escAttr(d.key) + '" data-idx="' + (start + i) + '">' +
                '<div class="card-media">' +
                '<img src="' + escAttr(d.thumb) + '" alt="' + escAttr(d.name) + '" loading="lazy" decoding="async">' +
                badge +
                '</div>' +
                '<figcaption class="card-name" title="' + escAttr(d.name) + '">' + esc(d.name) + '</figcaption>' +
                '</figure>';
        }).join('');

        grid.innerHTML = html;
        cardEls = Array.prototype.slice.call(grid.querySelectorAll('.card'));
        pageInfo.textContent = filtered.length ? page + ' / ' + total : '0 / 0';
        pagePrev.disabled = page <= 1;
        pageNext.disabled = page >= total;
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function escAttr(s) {
        return esc(s);
    }

    /* ---------- categories ---------- */
    function useCategories(parsed) {
        categoryMap = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        buildChips();
        render();
    }

    function fetchCategories() {
        fetch(CATEGORY_API)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var parsed = data && typeof data === 'object' ? (data.categories || data) : {};
                useCategories(parsed);
            })
            .catch(function () {
                buildChips();
                render();
            });
    }

    function loadCategories() {
        // static form (GitHub Pages) has categories inlined server-side; dynamic form fetches
        var el = document.getElementById('initial-categories');
        if (el) {
            try {
                useCategories(JSON.parse(el.textContent || '{}'));
                return;
            } catch (e) { /* fall through to fetch */ }
        }
        fetchCategories();
    }

    function getToken() {
        try { return localStorage.getItem('gallery_token') || ''; } catch (e) { return ''; }
    }

    function login(password) {
        return fetch('api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password }),
        }).then(function (r) {
            if (!r.ok) throw new Error('密码错误');
            return r.json();
        }).then(function (d) {
            try { localStorage.setItem('gallery_token', d.token); } catch (e) { /* ignore */ }
            return d.token;
        });
    }

    function putCategories(token) {
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['X-Auth-Token'] = token;
        return fetch(CATEGORY_API, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({ categories: categoryMap }),
        });
    }

    function saveCategories() {
        return putCategories(getToken()).then(function (r) {
            // 401 + no token yet: ask for the admin password once, then retry with token
            if (r.status === 401 && !getToken()) {
                var pw = window.prompt('请输入管理密码以保存分类：');
                if (!pw) throw new Error('已取消保存');
                return login(pw).then(putCategories);
            }
            if (!r.ok) throw new Error('保存失败 (' + r.status + ')');
            return r.json();
        });
    }

    /* ---------- lightbox ---------- */
    function openAt(idx) {
        var d = filtered[idx];
        if (!d) return;
        lbIndex = idx;
        lbName.textContent = d.name;
        lbSub.textContent = [
            catOf(d.key) ? '分类：' + catOf(d.key) : '未分类',
            d.time ? '更新：' + d.time : '',
        ].filter(Boolean).join(' · ');
        lbCat.value = catOf(d.key);
        lbOrig.href = d.url;
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';

        // progressive: show thumbnail instantly, swap in view image when ready
        var viewUrl = d.url + PROCESS_VIEW;
        var cur = lbImg.src;
        if (cur !== viewUrl) {
            lbImg.src = d.thumb;
            if (cur !== d.thumb) {
                var pre = new Image();
                pre.onload = function () {
                    if (lbIndex === idx) lbImg.src = viewUrl;
                };
                pre.src = viewUrl;
            } else {
                lbImg.src = viewUrl;
            }
        }

        // prefetch neighbors for instant switching
        [-1, 1].forEach(function (delta) {
            var n = filtered[idx + delta];
            if (n) {
                var im = new Image();
                im.src = n.url + PROCESS_VIEW;
            }
        });
    }

    function closeLb() {
        lightbox.hidden = true;
        lbImg.src = '';
        document.body.style.overflow = '';
    }

    function step(delta) {
        var next = lbIndex + delta;
        if (next >= 0 && next < filtered.length) {
            openAt(next);
        }
    }

    function copyMarkdown() {
        var d = filtered[lbIndex];
        if (!d) return;
        var tmp = document.createElement('textarea');
        tmp.value = '![](' + d.url + ')';
        document.body.appendChild(tmp);
        tmp.select();
        try {
            document.execCommand('copy');
        } catch (e) { /* ignore */ }
        document.body.removeChild(tmp);
    }

    /* ---------- events (delegation) ---------- */
    grid.addEventListener('click', function (e) {
        var media = e.target.closest('.card-media');
        if (media) {
            var card = media.closest('.card');
            openAt(Number(card.dataset.idx));
        }
    });

    document.getElementById('lb-close').addEventListener('click', closeLb);
    document.getElementById('lb-prev').addEventListener('click', function () { step(-1); });
    document.getElementById('lb-next').addEventListener('click', function () { step(1); });
    document.getElementById('lb-copy').addEventListener('click', copyMarkdown);

    document.getElementById('lb-save-cat').addEventListener('click', function () {
        if (lbIndex < 0) return;
        var d = filtered[lbIndex];
        var val = lbCat.value.trim();
        if (val) categoryMap[d.key] = val;
        else delete categoryMap[d.key];
        saveCategories()
            .then(function () {
                lbSub.textContent = '分类：' + (val || '未分类') + '（已保存）';
                buildChips();
                render();
            })
            .catch(function (e) {
                lbSub.textContent = String(e.message || e);
            });
    });

    document.addEventListener('keydown', function (e) {
        if (lightbox.hidden) return;
        if (e.key === 'Escape') closeLb();
        else if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
    });

    lightbox.addEventListener('touchstart', function (e) {
        touchX = e.touches[0].clientX;
    }, { passive: true });

    lightbox.addEventListener('touchend', function (e) {
        if (touchX === null) return;
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
        touchX = null;
    }, { passive: true });

    pagePrev.addEventListener('click', function () {
        if (page > 1) { page -= 1; render(); }
    });
    pageNext.addEventListener('click', function () {
        if (page < Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))) { page += 1; render(); }
    });

    /* ---------- theme toggle (synced with blog) ---------- */
    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        var root = document.documentElement;
        function applyIcon() {
            themeBtn.textContent = root.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
        }
        applyIcon();
        themeBtn.addEventListener('click', function () {
            var dark = root.getAttribute('data-theme') === 'dark';
            if (dark) root.removeAttribute('data-theme');
            else root.setAttribute('data-theme', 'dark');
            try { localStorage.setItem('shiro-theme', dark ? 'light' : 'dark'); } catch (e) { /* ignore */ }
            applyIcon();
        });
    }

    /* ---------- boot ---------- */
    applyFilter();
    loadCategories();
})();
