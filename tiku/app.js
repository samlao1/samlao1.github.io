(function () {
  "use strict";

  const bank = window.QUESTION_BANK || { questions: [], source: "" };
  const questions = bank.questions || [];
  const STORAGE_KEY = "qualification-quiz-progress-v1";
  const filters = ["all", "single", "multiple", "boolean"];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const questionView = $("#questionView");
  const emptyView = $("#emptyView");
  const toastElement = $("#toast");

  const defaultState = () => ({
    mode: "quiz",
    filter: "all",
    currentByFilter: { all: 0, single: 0, multiple: 0, boolean: 0 },
    answers: {},
    wrongIds: [],
  });

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return defaultState();
      const state = defaultState();
      state.mode = saved.mode === "answer" ? "answer" : "quiz";
      state.filter = filters.includes(saved.filter) ? saved.filter : "all";
      state.currentByFilter = { ...state.currentByFilter, ...(saved.currentByFilter || {}) };
      state.answers = saved.answers || {};
      state.wrongIds = Array.isArray(saved.wrongIds) ? saved.wrongIds : [];
      return state;
    } catch (error) {
      return defaultState();
    }
  }

  let state = loadState();
  let toastTimer;

  function saveState(message) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      window.clearTimeout(saveState.messageTimer);
      $("#saveState").textContent = "无法保存，请检查浏览器存储权限";
      showToast("浏览器无法保存记录，本次进度仅在当前页面保留");
      return;
    }
    $("#saveState").textContent = message || "进度自动保存";
    window.clearTimeout(saveState.messageTimer);
    if (message) {
      saveState.messageTimer = window.setTimeout(() => { $("#saveState").textContent = "进度自动保存"; }, 1600);
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatText(value) { return escapeHtml(value).replace(/\n/g, "<br>"); }
  function pad(value) { return String(value).padStart(2, "0"); }

  function filteredQuestions() {
    if (state.filter === "all") return questions;
    return questions.filter((question) => question.type === state.filter);
  }

  function currentQuestion() {
    const visible = filteredQuestions();
    const rawIndex = Number(state.currentByFilter[state.filter]) || 0;
    const index = Math.max(0, Math.min(rawIndex, Math.max(visible.length - 1, 0)));
    state.currentByFilter[state.filter] = index;
    return { question: visible[index], index, visible };
  }

  function answerFor(question) {
    const record = state.answers[question.id];
    return record || { selected: [], submitted: false, correct: false };
  }

  function setCurrentById(id) {
    const question = questions.find((item) => item.id === id);
    if (!question) return;
    state.filter = question.type;
    const visible = filteredQuestions();
    state.currentByFilter[state.filter] = Math.max(0, visible.findIndex((item) => item.id === id));
    saveState();
    closeWrongModal();
    render();
  }

  function showToast(message) {
    toastElement.textContent = message;
    toastElement.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastElement.classList.remove("show"), 2200);
  }

  function updateStats() {
    const completed = Object.values(state.answers).filter((record) => record && record.submitted).length;
    const correct = Object.values(state.answers).filter((record) => record && record.submitted && record.correct).length;
    const percent = questions.length ? Math.round((completed / questions.length) * 100) : 0;
    $("#completedCount").textContent = completed;
    $("#correctCount").textContent = correct;
    $("#wrongCount").textContent = state.wrongIds.length;
    $("#wrongEntryCount").textContent = state.wrongIds.length;
    $("#progressPercent").textContent = `${percent}%`;
    $("#progressBar").style.width = `${percent}%`;
    $("#visibleCount").textContent = filteredQuestions().length;
    $$("[data-count]").forEach((element) => {
      const key = element.dataset.count;
      element.textContent = key === "all" ? questions.length : questions.filter((item) => item.type === key).length;
    });
  }

  function renderSidebar() {
    $$(".mode-button").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
    $$(".filter-button").forEach((button) => button.classList.toggle("active", button.dataset.filter === state.filter));
    updateStats();
  }

  function renderQuestion() {
    const { question, index, visible } = currentQuestion();
    if (!question) {
      questionView.classList.add("hidden");
      emptyView.classList.remove("hidden");
      $("#questionIndex").textContent = "—";
      $("#questionTotal").textContent = "—";
      $("#questionType").textContent = "暂无题目";
      $("#difficultyPill").textContent = "";
      $("#knowledgePreview").textContent = "";
      $("#prevButton").disabled = true;
      $("#nextButton").disabled = true;
      return;
    }

    questionView.classList.remove("hidden");
    emptyView.classList.add("hidden");
    const record = answerFor(question);
    const selected = Array.isArray(record.selected) ? record.selected : [];
    const submitted = Boolean(record.submitted);
    const answerKeys = question.answer || [];
    const isAnswerMode = state.mode === "answer";
    const knowledge = question.knowledge && question.knowledge.length ? question.knowledge.join(" · ") : "暂无考核点";

    $("#questionIndex").textContent = pad(index + 1);
    $("#questionTotal").textContent = visible.length;
    $("#questionType").textContent = question.typeLabel;
    $("#difficultyPill").textContent = question.difficulty;
    $("#knowledgePreview").textContent = knowledge;
    $("#questionInput").value = index + 1;
    $("#prevButton").disabled = index <= 0;
    $("#nextButton").disabled = index >= visible.length - 1;

    const optionMarkup = question.options.map((option) => {
      const isSelected = selected.includes(option.key);
      const isCorrect = answerKeys.includes(option.key);
      let optionClass = "";
      if (isAnswerMode && isCorrect) optionClass = "correct";
      if (!isAnswerMode && submitted && isCorrect) optionClass = "correct";
      if (!isAnswerMode && submitted && isSelected && !isCorrect) optionClass = "incorrect";
      if (!submitted && !isAnswerMode && isSelected) optionClass = "selected";
      const status = isAnswerMode && isCorrect ? '<span class="option-status">正确答案</span>' : (!isAnswerMode && submitted && isCorrect ? '<span class="option-status">正确答案</span>' : "");
      return `<button class="option-button ${optionClass}" data-key="${option.key}" type="button" ${isAnswerMode || submitted ? "aria-disabled=\"true\"" : ""}><span class="option-key">${option.key}</span><span class="option-label">${formatText(option.label)}</span>${status}</button>`;
    }).join("");

    let footer = "";
    if (isAnswerMode) {
      footer = `<div class="answer-mode-card"><div class="answer-mode-label">ANSWER &amp; EXPLANATION</div><p class="result-answer"><strong>正确答案：</strong>${formatText(question.answerText || answerKeys.join("、"))}</p><p class="result-explanation"><strong>解析：</strong>${formatText(question.explanation || "暂无解析")}</p></div>`;
    } else if (submitted) {
      footer = `<div class="result-panel ${record.correct ? "is-correct" : "is-wrong"}"><div class="result-title"><span>${record.correct ? "✓" : "!"}</span>${record.correct ? "回答正确" : "回答错误"}</div><p class="result-answer"><strong>正确答案：</strong>${formatText(question.answerText || answerKeys.join("、"))}</p><p class="result-explanation"><strong>解析：</strong>${formatText(question.explanation || "暂无解析")}</p></div><div class="answer-actions"><button class="secondary-button" id="retryButton" type="button">重新作答</button><button class="primary-button" id="afterSubmitNext" type="button">${index >= visible.length - 1 ? "完成本组" : "下一题 →"}</button></div>`;
    } else {
      const hint = question.type === "multiple" ? "可选择多个选项" : "请选择一个选项";
      footer = `<div class="answer-actions"><button class="primary-button" id="submitButton" type="button">提交答案</button><span class="select-hint">${hint}</span></div>`;
    }

    questionView.innerHTML = `<article class="question-card"><h3 class="question-title"><span class="question-number">Q${pad(index + 1)}</span>${formatText(question.question)}</h3><div class="option-list">${optionMarkup}</div>${footer}</article>`;
    $$(".option-button").forEach((button) => button.addEventListener("click", () => selectOption(button.dataset.key)));
    $("#submitButton")?.addEventListener("click", submitAnswer);
    $("#retryButton")?.addEventListener("click", retryAnswer);
    $("#afterSubmitNext")?.addEventListener("click", () => move(1));
  }

  function selectOption(key) {
    const { question } = currentQuestion();
    if (!question || state.mode === "answer") return;
    const record = answerFor(question);
    if (record.submitted) return;
    let selected = Array.isArray(record.selected) ? [...record.selected] : [];
    if (question.type === "multiple") {
      selected = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key].sort();
    } else {
      selected = [key];
    }
    state.answers[question.id] = { ...record, selected };
    saveState("选择已保存");
    renderQuestion();
  }

  function submitAnswer() {
    const { question } = currentQuestion();
    if (!question) return;
    const record = answerFor(question);
    const selected = [...(record.selected || [])].sort();
    if (!selected.length) {
      showToast("请先选择答案");
      return;
    }
    const expected = [...(question.answer || [])].sort();
    const correct = selected.length === expected.length && selected.every((key, index) => key === expected[index]);
    state.answers[question.id] = { selected, submitted: true, correct, answeredAt: new Date().toISOString() };
    if (!correct && !state.wrongIds.includes(question.id)) state.wrongIds.push(question.id);
    saveState(correct ? "回答正确，进度已保存" : "已记录到错题本");
    render();
  }

  function retryAnswer() {
    const { question } = currentQuestion();
    if (!question) return;
    state.answers[question.id] = { selected: [], submitted: false, correct: false };
    saveState("可以重新作答了");
    render();
  }

  function move(step) {
    const { index, visible } = currentQuestion();
    const nextIndex = Math.max(0, Math.min(index + step, visible.length - 1));
    if (nextIndex === index) {
      showToast(step > 0 ? "已经是本组最后一题" : "已经是第一题");
      return;
    }
    state.currentByFilter[state.filter] = nextIndex;
    saveState();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function jumpTo(value) {
    const { visible } = currentQuestion();
    const target = Math.max(1, Math.min(Math.trunc(Number(value)) || 1, visible.length));
    state.currentByFilter[state.filter] = target - 1;
    saveState();
    renderQuestion();
  }

  function renderWrongList() {
    const list = $("#wrongList");
    if (!state.wrongIds.length) {
      list.innerHTML = '<div class="wrong-empty">还没有错题，提交错误答案后会自动收录。</div>';
      return;
    }
    list.innerHTML = state.wrongIds.map((id) => {
      const question = questions.find((item) => item.id === id);
      if (!question) return "";
      return `<button class="wrong-item" data-id="${question.id}" type="button"><span class="wrong-item-number">${question.typeLabel}</span><span class="wrong-item-text">${formatText(question.question)}</span><span class="wrong-item-meta">${question.difficulty}</span></button>`;
    }).join("");
    $$(".wrong-item").forEach((button) => button.addEventListener("click", () => setCurrentById(button.dataset.id)));
  }

  function openWrongModal() {
    renderWrongList();
    $("#wrongModal").classList.remove("hidden");
    $("#wrongModal").setAttribute("aria-hidden", "false");
    $("#closeWrongButton").focus();
  }

  function closeWrongModal() {
    $("#wrongModal").classList.add("hidden");
    $("#wrongModal").setAttribute("aria-hidden", "true");
  }

  function render() {
    renderSidebar();
    renderQuestion();
    $("#sourceName").textContent = bank.source ? bank.source.replace(/\.xlsx$/i, "") : "2026 年岗位资格考试题库";
  }

  $$(".mode-button").forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    saveState(state.mode === "answer" ? "已切换到答案模式" : "已切换到答题模式");
    render();
  }));

  $$(".filter-button").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    saveState();
    render();
  }));

  $("#panelToggle").addEventListener("click", () => {
    const expanded = !$("#learningPanel").classList.contains("is-open");
    $("#learningPanel").classList.toggle("is-open", expanded);
    $("#panelToggle").setAttribute("aria-expanded", String(expanded));
    $("#panelToggleLabel").textContent = expanded ? "收起 ▴" : "展开 ▾";
  });

  $("#prevButton").addEventListener("click", () => move(-1));
  $("#nextButton").addEventListener("click", () => move(1));
  $("#jumpButton").addEventListener("click", () => jumpTo($("#questionInput").value));
  $("#questionInput").addEventListener("keydown", (event) => { if (event.key === "Enter") jumpTo(event.target.value); });
  $("#randomButton").addEventListener("click", () => {
    const { visible, index } = currentQuestion();
    if (visible.length < 2) return;
    let randomIndex = index;
    while (randomIndex === index) randomIndex = Math.floor(Math.random() * visible.length);
    state.currentByFilter[state.filter] = randomIndex;
    saveState("已切换到随机题目");
    renderQuestion();
  });
  $("#wrongListButton").addEventListener("click", openWrongModal);
  $("#closeWrongButton").addEventListener("click", closeWrongModal);
  $("#wrongModal").addEventListener("click", (event) => { if (event.target.id === "wrongModal") closeWrongModal(); });
  $("#backToAllButton").addEventListener("click", () => { state.filter = "all"; state.currentByFilter.all = 0; render(); });
  $("#resetButton").addEventListener("click", () => {
    if (!window.confirm("确定要清空答题进度和错题记录吗？")) return;
    state = defaultState();
    saveState("记录已重置");
    render();
    showToast("答题记录已清空");
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if (!$("#wrongModal").classList.contains("hidden")) {
      if (event.key === "Escape") closeWrongModal();
      return;
    }
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.key === "Escape") closeWrongModal();
  });

  render();
  saveState();
})();
