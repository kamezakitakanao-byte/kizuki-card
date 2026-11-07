/* KIZUKI CARD  app.js
   すべてのデータは端末内（localStorage）にのみ保存。外部送信はしません。 */
(function () {
  "use strict";

  // ふりかえり会版は従来のキーをそのまま使う（既存の保存データを壊さない）
  function keysFor(id) {
    const p = id === "kai" ? "kizuki." : "kizuki." + id + ".";
    return { session: p + "session.v1", favs: p + "favs.v1", history: p + "history.v1" };
  }
  const DECK_KEY = "kizuki.deck.v1";
  const HISTORY_MAX = 500;

  /* ---------- 保存（localStorageが使えない場合はメモリで代替） ---------- */
  const mem = {};
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return key in mem ? mem[key] : fallback;
      return JSON.parse(raw);
    } catch (e) {
      return key in mem ? mem[key] : fallback;
    }
  }
  function save(key, value) {
    mem[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 容量/プライベートモード */ }
  }

  /* ---------- 状態（デッキごと） ---------- */
  let deck, KEYS, byId, CATS, LVLS, FOLLOW, QS;
  let state;
  const ui = { deepLast: -1, tab: "fav", pickCat: 0, pickLevel: 0 };

  function setDeck(id) {
    deck = DECKS[id] || DECKS.kai;
    KEYS = keysFor(deck.id);
    CATS = deck.categories; LVLS = deck.levels; FOLLOW = deck.followups; QS = deck.questions;
    byId = new Map(QS.map(q => [q.id, q]));
    const validId = x => byId.has(x);
    const s0 = load(KEYS.session, {}) || {};
    state = {
      drawn: Array.isArray(s0.drawn) ? s0.drawn.filter(validId) : [],
      current: validId(s0.current) ? s0.current : null,
      cat: Number.isInteger(s0.cat) && s0.cat >= 0 && s0.cat <= CATS.length ? s0.cat : 0,
      level: Number.isInteger(s0.level) && s0.level >= 0 && s0.level <= 4 ? s0.level : 0,
      favs: (load(KEYS.favs, []) || []).filter(validId),
      history: (load(KEYS.history, []) || []).filter(h => h && validId(h.id))
    };
    ui.deepLast = -1; ui.pickCat = state.cat; ui.pickLevel = state.level;
    save(DECK_KEY, deck.id);
  }
  setDeck(load(DECK_KEY, "kai"));

  const saveSession = () => save(KEYS.session, { drawn: state.drawn, current: state.current, cat: state.cat, level: state.level });
  const saveFavs = () => save(KEYS.favs, state.favs);
  const saveHistory = () => save(KEYS.history, state.history);

  /* ---------- ヘルパー ---------- */
  const $ = id => document.getElementById(id);
  const catName = n => CATS[n - 1];
  const levelLabel = n => "LEVEL " + n + "　" + LVLS[n - 1].name;
  const inFilter = (q, cat, level) => (cat === 0 || q.category === cat) && (level === 0 || q.level === level);
  const poolAll = () => QS.filter(q => inFilter(q, state.cat, state.level));
  const poolRemaining = () => poolAll().filter(q => !state.drawn.includes(q.id));
  const isFav = id => state.favs.includes(id);
  function filterText(cat, level) {
    return (cat === 0 ? "全カテゴリー" : catName(cat)) + " ／ " + (level === 0 ? "全レベル" : "LEVEL " + level + " " + LVLS[level - 1].name);
  }
  function fmtDate(t) {
    const d = new Date(t);
    if (isNaN(d)) return "";
    const p = n => String(n).padStart(2, "0");
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ---------- 画面切り替え ---------- */
  const screens = ["home", "card", "pick", "lists"];
  function show(name, push) {
    screens.forEach(n => { $("screen-" + n).hidden = n !== name; });
    if (name === "home") renderHome();
    if (name === "card") renderCard();
    if (name === "pick") renderPick();
    if (name === "lists") renderLists();
    window.scrollTo(0, 0);
    if (push !== false) {
      try { history.pushState({ s: name }, "", ""); } catch (e) {}
    }
  }
  window.addEventListener("popstate", e => {
    const name = e.state && e.state.s ? e.state.s : "home";
    show(name, false);
  });

  /* ---------- トースト / 確認ダイアログ ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  let modalHandler = null;
  function confirmBox(title, body, okLabel, onOk) {
    $("modal-title").textContent = title;
    $("modal-body").textContent = body;
    $("modal-ok").textContent = okLabel || "OK";
    modalHandler = onOk;
    $("modal").hidden = false;
    $("modal-cancel").focus();
  }
  function closeModal() { $("modal").hidden = true; modalHandler = null; }
  $("modal-cancel").addEventListener("click", closeModal);
  $("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  $("modal-ok").addEventListener("click", () => { const h = modalHandler; closeModal(); if (h) h(); });

  /* ---------- カードを引く ---------- */
  function draw() {
    const remain = poolRemaining();
    if (remain.length === 0) { state.current = null; saveSession(); return false; }
    const q = remain[Math.floor(Math.random() * remain.length)];
    state.drawn.push(q.id);
    state.current = q.id;
    state.history.push({ id: q.id, t: Date.now() });
    if (state.history.length > HISTORY_MAX) state.history = state.history.slice(-HISTORY_MAX);
    ui.deepLast = -1;
    saveSession(); saveHistory();
    return true;
  }

  /* ---------- ① ホーム ---------- */
  function renderHome() {
    $("home-sub").textContent = deck.sub;
    $("deck-kai").setAttribute("aria-pressed", deck.id === "kai" ? "true" : "false");
    $("deck-team").setAttribute("aria-pressed", deck.id === "team" ? "true" : "false");
    $("home-filter").textContent = filterText(state.cat, state.level);
    $("home-resume").hidden = state.current === null;
    $("home-fav-count").textContent = state.favs.length ? "（" + state.favs.length + "）" : "";
    $("home-history-count").textContent = state.history.length ? "（" + state.history.length + "）" : "";
    const total = poolAll().length;
    const done = poolAll().filter(q => state.drawn.includes(q.id)).length;
    $("home-progress").textContent = done === 0 ? "" : "今回 " + done + " / " + total + " 問";
  }
  $("home-draw").addEventListener("click", () => { draw(); show("card"); });
  $("home-resume").addEventListener("click", () => show("card"));
  $("home-pick").addEventListener("click", () => show("pick"));
  $("home-fav").addEventListener("click", () => { ui.tab = "fav"; show("lists"); });
  $("home-history").addEventListener("click", () => { ui.tab = "history"; show("lists"); });
  $("home-reset").addEventListener("click", askReset);

  function askReset() {
    confirmBox("最初からやり直しますか？",
      "今回引いたカードの記録をリセットして、すべての質問をもう一度引けるようにします。お気に入りと履歴は消えません。",
      "やり直す",
      () => {
        state.drawn = []; state.current = null; ui.deepLast = -1;
        saveSession();
        toast("リセットしました");
        renderHome(); if (!$("screen-card").hidden) renderCard();
      });
  }

  /* ---------- ② カード表示 ---------- */
  function renderCard() {
    const total = poolAll().length;
    const done = poolAll().filter(q => state.drawn.includes(q.id)).length;
    $("card-progress").textContent = "今回 " + done + " / " + total + " 問";
    $("card-bar").style.width = (total ? Math.round(done / total * 100) : 0) + "%";
    $("deep").hidden = true;

    const card = $("card");
    const q = state.current !== null ? byId.get(state.current) : null;
    const remain = poolRemaining().length;

    if (!q) {
      // 引き終わった or まだ引いていない
      card.classList.add("empty");
      $("card-cat").textContent = "KIZUKI CARD";
      $("card-level").textContent = "";
      if (remain === 0) {
        const all = state.cat === 0 && state.level === 0;
        $("card-text").textContent = all ? total + "問すべて終了しました" : "この条件の" + total + "問すべて終了しました";
        $("card-sub").textContent = all ? "おつかれさまでした。最初からやり直せます。" : "条件を変えるか、最初からやり直せます。";
      } else {
        $("card-text").textContent = "「次のカード」を押してね";
        $("card-sub").textContent = "";
      }
      setCardButtons(false, remain);
      return;
    }

    card.classList.remove("empty");
    $("card-cat").textContent = catName(q.category);
    $("card-level").textContent = levelLabel(q.level);
    $("card-text").textContent = q.text;
    $("card-sub").textContent = "No." + q.id;
    setCardButtons(true, remain);
    renderFavButton();
  }

  // 終了状態では「次のカード」を「最初からやり直す」に切り替える
  function setCardButtons(hasCard, remain) {
    const finished = !hasCard && remain === 0;   // 最後の1枚を表示中は「次のカード」のまま
    $("card-fav").hidden = !hasCard;
    $("card-deepbtn").hidden = !hasCard;
    $("card-next").textContent = finished ? "最初からやり直す" : "次のカード";
    $("card-next").dataset.mode = finished ? "reset" : "next";
    document.querySelector(".card-actions .row2").style.display = hasCard ? "grid" : "none";
    document.querySelector(".skip-note").hidden = finished;
  }

  function renderFavButton() {
    const on = state.current !== null && isFav(state.current);
    const b = $("card-fav");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.innerHTML = '<span class="star">' + (on ? "★" : "☆") + "</span> " + (on ? "お気に入り済み" : "お気に入り");
  }

  $("card-next").addEventListener("click", () => {
    if ($("card-next").dataset.mode === "reset") { askReset(); return; }
    draw();
    renderCard();
  });

  $("card-fav").addEventListener("click", () => {
    if (state.current === null) return;
    // 追加は即時。解除はカード画面では即時でも、トーストで知らせる（誤タップでも再度押せば戻る）
    toggleFav(state.current);
    renderFavButton();
  });

  function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i >= 0) { state.favs.splice(i, 1); toast("お気に入りから外しました"); }
    else { state.favs.push(id); toast("お気に入りに追加しました"); }
    saveFavs();
  }

  $("card-deepbtn").addEventListener("click", () => {
    let i;
    do { i = Math.floor(Math.random() * FOLLOW.length); } while (i === ui.deepLast && FOLLOW.length > 1);
    ui.deepLast = i;
    $("deep-text").textContent = FOLLOW[i];
    $("deep").hidden = false;
    $("card-deepbtn").textContent = "別の深掘り";
  });

  /* ---------- ③ カテゴリー・レベル選択 ---------- */
  function optButton(label, sub, num, pressed, onClick) {
    const b = document.createElement("button");
    b.className = "opt";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    const left = document.createElement("span");
    const name = document.createElement("span");
    name.className = "name"; name.textContent = label;
    left.appendChild(name);
    if (sub) { const s = document.createElement("span"); s.className = "sub"; s.textContent = sub; left.appendChild(s); }
    b.appendChild(left);
    if (num !== "") { const n = document.createElement("span"); n.className = "num"; n.textContent = num; b.appendChild(n); }
    b.addEventListener("click", onClick);
    return b;
  }

  function renderPick() {
    const cats = $("pick-cats");
    cats.textContent = "";
    cats.appendChild(optButton("全カテゴリーからランダム", "", QS.length + "問", ui.pickCat === 0, () => { ui.pickCat = 0; renderPick(); }));
    CATS.forEach((name, i) => {
      const n = i + 1;
      const cnt = QS.filter(q => q.category === n).length;
      cats.appendChild(optButton(n + ". " + name, "", cnt + "問", ui.pickCat === n, () => { ui.pickCat = n; renderPick(); }));
    });

    const lv = $("pick-levels");
    lv.textContent = "";
    lv.appendChild(optButton("すべてのレベル", "", "", ui.pickLevel === 0, () => { ui.pickLevel = 0; renderPick(); }));
    LVLS.forEach(L => {
      lv.appendChild(optButton("LEVEL " + L.n + "　" + L.name, L.desc, "", ui.pickLevel === L.n, () => { ui.pickLevel = L.n; renderPick(); }));
    });

    const cnt = QS.filter(q => inFilter(q, ui.pickCat, ui.pickLevel)).length;
    $("pick-summary").textContent = filterText(ui.pickCat, ui.pickLevel) + "：" + cnt + "問";
    $("pick-go").disabled = cnt === 0;
    $("pick-go").style.opacity = cnt === 0 ? .4 : 1;
    if (cnt === 0) $("pick-summary").textContent += "（この組み合わせの質問はありません）";
  }

  $("pick-go").addEventListener("click", () => {
    const cnt = QS.filter(q => inFilter(q, ui.pickCat, ui.pickLevel)).length;
    if (cnt === 0) return;
    state.cat = ui.pickCat; state.level = ui.pickLevel;
    state.current = null;
    saveSession();
    if (poolRemaining().length === 0) {
      toast("この条件の質問はすべて引き終わっています");
    } else {
      draw();
    }
    show("card");
  });

  /* ---------- ④ お気に入り・履歴 ---------- */
  function renderLists() {
    $("tab-fav").setAttribute("aria-selected", ui.tab === "fav" ? "true" : "false");
    $("tab-history").setAttribute("aria-selected", ui.tab === "history" ? "true" : "false");
    const body = $("list-body");
    body.textContent = "";

    const items = ui.tab === "fav"
      ? state.favs.slice().reverse().map(id => ({ id: id }))
      : state.history.slice().reverse();

    if (items.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-msg";
      p.textContent = ui.tab === "fav"
        ? "まだお気に入りはありません。\nカード画面の「☆ お気に入り」で保存できます。"
        : "まだ履歴はありません。\nカードを引くと、ここに残ります。";
      p.style.whiteSpace = "pre-line";
      body.appendChild(p);
      return;
    }

    items.forEach(it => {
      const q = byId.get(it.id);
      if (!q) return;
      const row = document.createElement("div");
      row.className = "q-item";
      const b = document.createElement("div");
      b.className = "q-body";
      const meta = document.createElement("div");
      meta.className = "q-meta";
      meta.textContent = catName(q.category) + " ・ LEVEL " + q.level + (it.t ? " ・ " + fmtDate(it.t) : "");
      const text = document.createElement("div");
      text.className = "q-text";
      text.textContent = q.text;
      b.appendChild(meta); b.appendChild(text);

      const star = document.createElement("button");
      star.className = "q-star";
      star.setAttribute("aria-label", isFav(q.id) ? "お気に入りから外す" : "お気に入りに追加");
      star.textContent = isFav(q.id) ? "★" : "☆";
      star.addEventListener("click", () => {
        if (isFav(q.id) && ui.tab === "fav") {
          // お気に入り一覧からの削除は確認してから（誤操作で消えないように）
          confirmBox("お気に入りから外しますか？", "「" + q.text + "」", "外す", () => { toggleFav(q.id); renderLists(); });
        } else {
          toggleFav(q.id);
          renderLists();
        }
      });
      row.appendChild(b); row.appendChild(star);
      body.appendChild(row);
    });

    if (ui.tab === "history") {
      const foot = document.createElement("div");
      foot.className = "list-foot";
      const clr = document.createElement("button");
      clr.className = "btn btn-sub";
      clr.textContent = "履歴を消去する";
      clr.addEventListener("click", () => {
        confirmBox("履歴を消去しますか？", "引いたカードの履歴をすべて消します。お気に入りは残ります。元には戻せません。", "消去する", () => {
          state.history = []; saveHistory(); toast("履歴を消去しました"); renderLists();
        });
      });
      foot.appendChild(clr);
      body.appendChild(foot);
    }
  }
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => { ui.tab = t.dataset.tab; renderLists(); }));

  /* ---------- デッキ切替 ---------- */
  function switchDeck(id) {
    if (deck.id === id) return;
    setDeck(id);
    renderHome();
    toast(deck.label + "に切り替えました");
  }
  $("deck-kai").addEventListener("click", () => switchDeck("kai"));
  $("deck-team").addEventListener("click", () => switchDeck("team"));

  /* ---------- 戻るボタン ---------- */
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => show(b.dataset.go)));

  /* ---------- 起動 ---------- */
  try { history.replaceState({ s: "home" }, "", ""); } catch (e) {}
  show("home", false);

  /* ---------- PWA：Service Worker 登録 ---------- */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
