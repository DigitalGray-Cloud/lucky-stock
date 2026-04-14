const createForm = document.querySelector("#create-form");
const postList = document.querySelector("#post-list");
const formStatus = document.querySelector("#form-status");
const refreshButton = document.querySelector("#refresh-button");
const postTemplate = document.querySelector("#post-template");

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function setStatus(target, message, type = "") {
  target.textContent = message;
  target.dataset.type = type;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "요청 처리 중 오류가 발생했습니다.");
  }
  return payload;
}

function closeEditForm(item) {
  item.querySelector(".post-view").classList.remove("hidden");
  item.querySelector(".edit-form").classList.add("hidden");
}

function openEditForm(item, post) {
  item.querySelector(".post-view").classList.add("hidden");
  const form = item.querySelector(".edit-form");
  form.classList.remove("hidden");
  form.elements.name.value = post.name;
  form.elements.message.value = post.message;
  form.elements.password.value = "";
  setStatus(form.querySelector(".item-status"), "", "");
}

function buildPostItem(post) {
  const fragment = postTemplate.content.cloneNode(true);
  const item = fragment.querySelector(".post");
  const view = item.querySelector(".post-view");
  const form = item.querySelector(".edit-form");

  item.dataset.id = post.id;
  item.querySelector(".post-name").textContent = post.name;
  item.querySelector(".post-date").textContent = formatDate(post.updatedAt || post.createdAt);
  item.querySelector(".post-message").textContent = post.message;

  item.querySelector(".edit-trigger").addEventListener("click", () => openEditForm(item, post));
  item.querySelector(".cancel-trigger").addEventListener("click", () => closeEditForm(item));

  item.querySelector(".delete-trigger").addEventListener("click", async () => {
    const password = window.prompt("삭제 비밀번호를 입력해 주세요.");
    if (password === null) return;

    try {
      await requestJson(`/api/posts/${post.id}`, {
        method: "DELETE",
        body: JSON.stringify({ password })
      });
      setStatus(formStatus, "의견을 삭제했습니다.", "ok");
      await loadPosts();
    } catch (error) {
      setStatus(formStatus, error.message, "error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const statusNode = form.querySelector(".item-status");
    setStatus(statusNode, "저장 중...", "");

    try {
      const payload = await requestJson(`/api/posts/${post.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.elements.name.value,
          message: form.elements.message.value,
          password: form.elements.password.value
        })
      });
      setStatus(formStatus, "의견을 수정했습니다.", "ok");
      closeEditForm(item);
      if (payload?.item) {
        view.querySelector(".post-name").textContent = payload.item.name;
        view.querySelector(".post-message").textContent = payload.item.message;
        view.querySelector(".post-date").textContent = formatDate(payload.item.updatedAt || payload.item.createdAt);
        post.name = payload.item.name;
        post.message = payload.item.message;
        post.updatedAt = payload.item.updatedAt;
      }
    } catch (error) {
      setStatus(statusNode, error.message, "error");
    }
  });

  return item;
}

async function loadPosts() {
  postList.innerHTML = '<li class="empty">불러오는 중...</li>';

  try {
    const payload = await requestJson("/api/posts");
    const items = payload?.items || [];

    if (!items.length) {
      postList.innerHTML = '<li class="empty">아직 등록된 의견이 없습니다. 첫 의견을 남겨 보세요.</li>';
      return;
    }

    postList.innerHTML = "";
    items.forEach((post) => {
      postList.appendChild(buildPostItem(post));
    });
  } catch (error) {
    postList.innerHTML = `<li class="empty">${error.message}</li>`;
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(formStatus, "등록 중...", "");

  try {
    await requestJson("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        name: createForm.elements.name.value,
        message: createForm.elements.message.value,
        password: createForm.elements.password.value
      })
    });
    createForm.reset();
    setStatus(formStatus, "의견을 등록했습니다.", "ok");
    await loadPosts();
  } catch (error) {
    setStatus(formStatus, error.message, "error");
  }
});

refreshButton.addEventListener("click", () => {
  setStatus(formStatus, "", "");
  loadPosts();
});

loadPosts();
