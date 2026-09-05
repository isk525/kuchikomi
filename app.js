import { auth, db, ensureAnonymousAuth } from "./firebase.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAt,
  endAt
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const RAMEN_OPTIONS = [
  { id: "soup", label: "スープ", multi: false, values: ["醤油", "味噌", "塩", "豚骨", "鶏白湯", "魚介", "家系", "その他"] },
  { id: "noodle", label: "麺", multi: false, values: ["細麺", "中細麺", "中太麺", "太麺", "ちぢれ麺"] },
  { id: "richness", label: "味の濃さ", multi: false, values: ["あっさり", "ほどよい", "濃厚"] },
  { id: "vibe", label: "店の雰囲気", multi: true, values: ["一人向け", "家族向け", "おしゃれ", "活気あり", "落ち着く"] },
  { id: "service", label: "接客", multi: false, values: ["接客◎", "普通", "少し気になる"] }
];

const MOVIE_OPTIONS = [
  { id: "story", label: "ストーリー・脚本", multi: true, values: ["脚本◎", "分かりやすい", "意外性あり", "考察向け", "少し難しい"] },
  { id: "visual", label: "映像", multi: true, values: ["映像◎", "迫力あり", "美しい", "落ち着いた映像"] },
  { id: "cast", label: "キャスト・演技", multi: true, values: ["キャスト◎", "演技◎", "推し出演", "配役が新鮮"] },
  { id: "music", label: "音楽", multi: true, values: ["音楽◎", "主題歌◎", "印象は控えめ"] },
  { id: "feeling", label: "観終わった気分", multi: true, values: ["泣ける", "笑える", "爽快", "余韻あり", "ハラハラ", "ほっこり"] }
];

const elements = {
  newBtn: document.getElementById("newBtn"),
  closeBtn: document.getElementById("closeBtn"),
  timelineScreen: document.getElementById("timelineScreen"),
  reviewScreen: document.getElementById("reviewScreen"),
  timeline: document.getElementById("timeline"),
  status: document.getElementById("status"),
  nickname: document.getElementById("nickname"),
  type: document.getElementById("type"),
  title: document.getElementById("title"),
  titleLabel: document.getElementById("titleLabel"),
  suggestions: document.getElementById("suggestions"),
  masterHint: document.getElementById("masterHint"),
  stars: document.getElementById("stars"),
  ratingText: document.getElementById("ratingText"),
  reviewOptions: document.getElementById("reviewOptions"),
  note: document.getElementById("note"),
  noteCount: document.getElementById("noteCount"),
  saveBtn: document.getElementById("saveBtn"),
  formError: document.getElementById("formError"),
  toast: document.getElementById("toast"),
  confirmModal: document.getElementById("confirmModal"),
  cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
  confirmDeleteBtn: document.getElementById("confirmDeleteBtn")
};

const state = {
  user: null,
  reviews: [],
  filter: "all",
  rating: 0,
  selected: {},
  pendingDeleteId: null,
  suggestionTimer: null
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function masterIdFromName(name) {
  return encodeURIComponent(name.toLocaleLowerCase("ja-JP"))
    .replaceAll("%", "_")
    .replaceAll("/", "_")
    .slice(0, 700);
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return "たった今";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(timestamp.toDate());
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.add("hidden"), 2200);
}

function showError(message = "") {
  elements.formError.textContent = message;
  elements.formError.classList.toggle("hidden", !message);
}

function openForm() {
  elements.timelineScreen.classList.add("hidden");
  elements.reviewScreen.classList.remove("hidden");
  elements.newBtn.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeForm() {
  elements.reviewScreen.classList.add("hidden");
  elements.timelineScreen.classList.remove("hidden");
  elements.newBtn.classList.remove("hidden");
  elements.suggestions.classList.add("hidden");
  showError();
}

function resetForm() {
  elements.title.value = "";
  elements.note.value = "";
  elements.noteCount.textContent = "0";
  state.rating = 0;
  state.selected = {};
  updateStars();
  renderOptions();
}

function setType(type) {
  elements.type.value = type;
  document.querySelectorAll(".genre-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === type);
  });
  elements.titleLabel.textContent = type === "ramen" ? "店名" : "映画タイトル";
  elements.title.placeholder = type === "ramen" ? "店名を入力" : "映画タイトルを入力";
  elements.masterHint.textContent = type === "ramen"
    ? "候補にない店名は、そのまま投稿すると辞書へ自動登録されます。"
    : "V1では映画タイトルは手入力です。TMDB連携は次版で追加できます。";
  elements.suggestions.classList.add("hidden");
  state.selected = {};
  renderOptions();
}

function updateStars() {
  document.querySelectorAll(".star-button").forEach((button) => {
    const active = Number(button.dataset.rating) <= state.rating;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(Number(button.dataset.rating) === state.rating));
  });
  elements.ratingText.textContent = state.rating ? `${state.rating} / 5` : "未選択";
}

function renderOptions() {
  const groups = elements.type.value === "ramen" ? RAMEN_OPTIONS : MOVIE_OPTIONS;
  elements.reviewOptions.innerHTML = groups.map((group) => `
    <fieldset class="option-group">
      <legend>${escapeHtml(group.label)}${group.multi ? '<span>複数選択可</span>' : ""}</legend>
      <div class="chips">
        ${group.values.map((value) => `
          <button class="chip" type="button" data-group="${group.id}" data-value="${escapeHtml(value)}" data-multi="${group.multi}">${escapeHtml(value)}</button>
        `).join("")}
      </div>
    </fieldset>
  `).join("");
}

function selectChip(button) {
  const { group, value, multi } = button.dataset;
  const isMulti = multi === "true";
  const current = state.selected[group] || [];
  if (isMulti) {
    state.selected[group] = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  } else {
    state.selected[group] = current.includes(value) ? [] : [value];
  }
  document.querySelectorAll(`.chip[data-group="${group}"]`).forEach((chip) => {
    chip.classList.toggle("active", (state.selected[group] || []).includes(chip.dataset.value));
  });
}

function flattenTags() {
  return Object.values(state.selected).flat().slice(0, 12);
}

async function findRamenSuggestions(input) {
  const term = normalizeName(input);
  if (!term) {
    elements.suggestions.classList.add("hidden");
    return;
  }
  try {
    const mastersRef = collection(db, "ramenMasters");
    const q = query(mastersRef, orderBy("name"), startAt(term), endAt(`${term}\uf8ff`), limit(8));
    const snapshot = await getDocs(q);
    const names = snapshot.docs.map((item) => item.data().name).filter(Boolean);
    renderSuggestions(names);
  } catch (error) {
    console.error("候補取得エラー", error);
    elements.suggestions.classList.add("hidden");
  }
}

function renderSuggestions(names) {
  if (!names.length) {
    elements.suggestions.classList.add("hidden");
    return;
  }
  elements.suggestions.innerHTML = names.map((name) => `
    <button type="button" class="suggestion" data-name="${escapeHtml(name)}">
      <span>🍜</span><strong>${escapeHtml(name)}</strong><small>辞書から選択</small>
    </button>
  `).join("");
  elements.suggestions.classList.remove("hidden");
}

async function upsertRamenMaster(name) {
  const id = masterIdFromName(name);
  const masterRef = doc(db, "ramenMasters", id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(masterRef);
    if (snapshot.exists()) {
      transaction.update(masterRef, {
        reviewCount: increment(1),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.set(masterRef, {
        name,
        reviewCount: 1,
        createdBy: state.user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  });
}

async function saveReview() {
  showError();
  const displayName = normalizeName(elements.nickname.value);
  const title = normalizeName(elements.title.value);
  const type = elements.type.value;
  const note = elements.note.value.trim();

  if (!displayName) return showError("ニックネームを入力してください。");
  if (!title) return showError(type === "ramen" ? "店名を入力してください。" : "映画タイトルを入力してください。");
  if (!state.rating) return showError("星評価を選択してください。");
  if (!state.user) return showError("認証処理中です。画面を更新して再度お試しください。");

  elements.saveBtn.disabled = true;
  elements.saveBtn.textContent = "投稿中...";
  localStorage.setItem("kuchikomiNickname", displayName);

  try {
    await addDoc(collection(db, "reviews"), {
      type,
      title,
      rating: state.rating,
      tags: flattenTags(),
      note,
      displayName,
      userId: state.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (type === "ramen") {
      await upsertRamenMaster(title);
    }

    resetForm();
    closeForm();
    showToast("レビューを投稿しました");
  } catch (error) {
    console.error("投稿エラー", error);
    showError("投稿できませんでした。Firestoreルールを確認してください。");
  } finally {
    elements.saveBtn.disabled = false;
    elements.saveBtn.textContent = "タイムラインに投稿";
  }
}

function renderTimeline() {
  const filtered = state.filter === "all"
    ? state.reviews
    : state.reviews.filter((review) => review.type === state.filter);

  if (!filtered.length) {
    elements.timeline.innerHTML = `
      <div class="empty-state">
        <div>${state.filter === "movie" ? "🎬" : "🍜"}</div>
        <h3>まだレビューがありません</h3>
        <p>最初のレビューを投稿してみましょう。</p>
      </div>`;
    return;
  }

  elements.timeline.innerHTML = filtered.map((review) => {
    const ownPost = state.user && review.userId === state.user.uid;
    const stars = "★".repeat(Number(review.rating) || 0) + "☆".repeat(5 - (Number(review.rating) || 0));
    return `
      <article class="review-card">
        <div class="review-head">
          <div class="avatar">${escapeHtml((review.displayName || "ゲ").slice(0, 1).toUpperCase())}</div>
          <div class="review-user">
            <strong>${escapeHtml(review.displayName || "ゲスト")}</strong>
            <span>${escapeHtml(formatDate(review.createdAt))}</span>
          </div>
          <span class="genre-badge ${review.type}">${review.type === "ramen" ? "🍜 ラーメン" : "🎬 映画"}</span>
        </div>
        <div class="review-body">
          <h2>${escapeHtml(review.title)}</h2>
          <div class="card-stars" aria-label="${Number(review.rating) || 0}点">${stars}</div>
          ${(review.tags || []).length ? `<div class="tag-list">${review.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          ${review.note ? `<p>${escapeHtml(review.note).replaceAll("\n", "<br>")}</p>` : ""}
          ${ownPost ? `<button class="delete-button" type="button" data-delete-id="${review.id}">削除</button>` : ""}
        </div>
      </article>`;
  }).join("");
}

function subscribeReviews() {
  const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    state.reviews = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    elements.status.classList.add("hidden");
    renderTimeline();
  }, (error) => {
    console.error("読み込みエラー", error);
    elements.status.textContent = "レビューを読み込めませんでした。Firestoreルールをご確認ください。";
    elements.status.classList.add("error-status");
  });
}

function askDelete(id) {
  state.pendingDeleteId = id;
  elements.confirmModal.classList.remove("hidden");
}

async function confirmDelete() {
  if (!state.pendingDeleteId) return;
  try {
    await deleteDoc(doc(db, "reviews", state.pendingDeleteId));
    showToast("レビューを削除しました");
  } catch (error) {
    console.error("削除エラー", error);
    showToast("削除できませんでした");
  } finally {
    state.pendingDeleteId = null;
    elements.confirmModal.classList.add("hidden");
  }
}

function bindEvents() {
  elements.newBtn.addEventListener("click", openForm);
  elements.closeBtn.addEventListener("click", closeForm);
  elements.saveBtn.addEventListener("click", saveReview);
  elements.note.addEventListener("input", () => { elements.noteCount.textContent = String(elements.note.value.length); });

  document.querySelectorAll(".genre-button").forEach((button) => {
    button.addEventListener("click", () => setType(button.dataset.type));
  });
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
      renderTimeline();
    });
  });
  elements.stars.addEventListener("click", (event) => {
    const button = event.target.closest(".star-button");
    if (!button) return;
    state.rating = Number(button.dataset.rating);
    updateStars();
  });
  elements.reviewOptions.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (button) selectChip(button);
  });
  elements.title.addEventListener("input", () => {
    if (elements.type.value !== "ramen") return;
    window.clearTimeout(state.suggestionTimer);
    state.suggestionTimer = window.setTimeout(() => findRamenSuggestions(elements.title.value), 250);
  });
  elements.suggestions.addEventListener("click", (event) => {
    const suggestion = event.target.closest(".suggestion");
    if (!suggestion) return;
    elements.title.value = suggestion.dataset.name;
    elements.suggestions.classList.add("hidden");
  });
  elements.timeline.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (button) askDelete(button.dataset.deleteId);
  });
  elements.cancelDeleteBtn.addEventListener("click", () => {
    state.pendingDeleteId = null;
    elements.confirmModal.classList.add("hidden");
  });
  elements.confirmDeleteBtn.addEventListener("click", confirmDelete);
}

async function init() {
  elements.nickname.value = localStorage.getItem("kuchikomiNickname") || "";
  renderOptions();
  updateStars();
  bindEvents();
  try {
    state.user = await ensureAnonymousAuth();
    subscribeReviews();
  } catch (error) {
    console.error("認証エラー", error);
    elements.status.textContent = "匿名認証に失敗しました。Firebase Authenticationの匿名認証設定をご確認ください。";
    elements.status.classList.add("error-status");
  }
}

init();
