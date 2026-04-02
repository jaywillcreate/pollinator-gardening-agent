// DOM elements
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const chatContainer = document.getElementById("chatContainer");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebarNewChatBtn = document.getElementById("sidebarNewChatBtn");
const sidebarSessions = document.getElementById("sidebarSessions");

let conversationHistory = [];
let isStreaming = false;
let activeSessionId = null;

const STORAGE_KEY = "pollinator-sessions";

// ── Session Storage ──

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sessions: [], activeSessionId: null };
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function getSessionTitle(session) {
  const firstUser = session.messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.content.trim();
  return text.length > 45 ? text.slice(0, 45) + "..." : text;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  const dayMs = 86400000;

  if (diff < dayMs && date.getDate() === now.getDate()) return "Today";
  if (diff < dayMs * 2 && date.getDate() === now.getDate() - 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function saveCurrentSession() {
  if (!activeSessionId || conversationHistory.length === 0) return;
  const store = loadStore();
  const idx = store.sessions.findIndex((s) => s.id === activeSessionId);
  if (idx === -1) return;
  store.sessions[idx].messages = [...conversationHistory];
  store.sessions[idx].updatedAt = new Date().toISOString();
  saveStore(store);
  renderSidebar();
}

function createNewSession() {
  // Save current first
  if (activeSessionId && conversationHistory.length > 0) {
    saveCurrentSession();
  }

  const session = {
    id: generateId(),
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const store = loadStore();
  store.sessions.unshift(session);
  store.activeSessionId = session.id;
  saveStore(store);

  activeSessionId = session.id;
  conversationHistory = [];
  messagesEl.innerHTML = "";
  welcomeEl.classList.remove("hidden");
  userInput.value = "";
  userInput.style.height = "auto";
  sendBtn.disabled = true;
  userInput.focus();
  renderSidebar();
  closeSidebar();
}

function switchSession(id) {
  if (id === activeSessionId) {
    closeSidebar();
    return;
  }

  // Save current session first
  if (activeSessionId && conversationHistory.length > 0) {
    saveCurrentSession();
  }

  const store = loadStore();
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return;

  store.activeSessionId = id;
  saveStore(store);

  activeSessionId = id;
  conversationHistory = [...session.messages];

  // Render messages
  messagesEl.innerHTML = "";
  if (conversationHistory.length === 0) {
    welcomeEl.classList.remove("hidden");
  } else {
    welcomeEl.classList.add("hidden");
    conversationHistory.forEach((msg) => {
      appendMessage(msg.role, msg.content);
    });
  }

  renderSidebar();
  closeSidebar();
  userInput.focus();
}

function deleteSession(id) {
  const store = loadStore();
  store.sessions = store.sessions.filter((s) => s.id !== id);

  if (id === activeSessionId) {
    if (store.sessions.length > 0) {
      // Switch to most recent
      store.activeSessionId = store.sessions[0].id;
      saveStore(store);
      switchSession(store.sessions[0].id);
    } else {
      // No sessions left
      store.activeSessionId = null;
      saveStore(store);
      activeSessionId = null;
      conversationHistory = [];
      messagesEl.innerHTML = "";
      welcomeEl.classList.remove("hidden");
      renderSidebar();
    }
  } else {
    saveStore(store);
    renderSidebar();
  }
}

function renderSidebar() {
  const store = loadStore();
  sidebarSessions.innerHTML = "";

  if (store.sessions.length === 0) {
    sidebarSessions.innerHTML =
      '<div class="sidebar-empty">No conversations yet</div>';
    return;
  }

  // Group by date
  const groups = {};
  store.sessions.forEach((session) => {
    const label = formatDate(session.updatedAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(session);
  });

  Object.entries(groups).forEach(([label, sessions]) => {
    const groupEl = document.createElement("div");
    groupEl.className = "sidebar-group";

    const groupLabel = document.createElement("div");
    groupLabel.className = "sidebar-group-label";
    groupLabel.textContent = label;
    groupEl.appendChild(groupLabel);

    sessions.forEach((session) => {
      const item = document.createElement("button");
      item.className =
        "sidebar-session" +
        (session.id === activeSessionId ? " active" : "");
      item.dataset.id = session.id;

      const title = document.createElement("span");
      title.className = "sidebar-session-title";
      title.textContent = getSessionTitle(session);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "sidebar-session-delete";
      deleteBtn.title = "Delete conversation";
      deleteBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';

      item.appendChild(title);
      item.appendChild(deleteBtn);
      groupEl.appendChild(item);
    });

    sidebarSessions.appendChild(groupEl);
  });
}

// ── Sidebar Toggle ──

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("visible");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
}

sidebarToggleBtn.addEventListener("click", () => {
  if (sidebar.classList.contains("open")) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

sidebarCloseBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);
sidebarNewChatBtn.addEventListener("click", createNewSession);

// Sidebar session clicks (event delegation)
sidebarSessions.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".sidebar-session-delete");
  if (deleteBtn) {
    e.stopPropagation();
    const sessionEl = deleteBtn.closest(".sidebar-session");
    deleteSession(sessionEl.dataset.id);
    return;
  }

  const sessionEl = e.target.closest(".sidebar-session");
  if (sessionEl) {
    switchSession(sessionEl.dataset.id);
  }
});

// ── Auto-resize textarea ──

userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 150) + "px";
  sendBtn.disabled = !userInput.value.trim() || isStreaming;
});

// Handle Enter to send (Shift+Enter for newline)
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (userInput.value.trim() && !isStreaming) {
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

// SVG diagram action buttons (event delegation)
messagesEl.addEventListener("click", (e) => {
  const downloadBtn = e.target.closest(".svg-download-btn");
  const copyBtn = e.target.closest(".svg-copy-btn");

  if (downloadBtn) {
    const container = downloadBtn.closest(".svg-diagram");
    const svgEl = container.querySelector(".svg-diagram-content svg");
    if (svgEl) downloadSVG(svgEl);
  }

  if (copyBtn) {
    const container = copyBtn.closest(".svg-diagram");
    const svgEl = container.querySelector(".svg-diagram-content svg");
    if (svgEl) copySVGSource(svgEl, copyBtn);
  }
});

function downloadSVG(svgEl) {
  const serializer = new XMLSerializer();
  const svgString =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    serializer.serializeToString(svgEl);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "garden-diagram.svg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copySVGSource(svgEl, btn) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgEl);
  navigator.clipboard.writeText(svgString).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
    setTimeout(() => {
      btn.innerHTML = original;
    }, 2000);
  });
}

// Starter cards
document.querySelectorAll(".starter-card").forEach((card) => {
  card.addEventListener("click", () => {
    const prompt = card.dataset.prompt;
    userInput.value = prompt;
    sendBtn.disabled = false;
    chatForm.dispatchEvent(new Event("submit"));
  });
});

// New chat (header button)
newChatBtn.addEventListener("click", createNewSession);

// ── Submit ──

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  // If no active session, create one
  if (!activeSessionId) {
    const session = {
      id: generateId(),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const store = loadStore();
    store.sessions.unshift(session);
    store.activeSessionId = session.id;
    saveStore(store);
    activeSessionId = session.id;
  }

  welcomeEl.classList.add("hidden");

  appendMessage("user", text);
  conversationHistory.push({ role: "user", content: text });
  saveCurrentSession();

  userInput.value = "";
  userInput.style.height = "auto";
  sendBtn.disabled = true;
  isStreaming = true;

  const { messageContent, typingEl } = appendAssistantPlaceholder();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            showError(parsed.error);
            continue;
          }
          if (parsed.text) {
            fullText += parsed.text;
            messageContent.innerHTML = renderMarkdown(fullText);
            scrollToBottom();
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (typingEl) typingEl.remove();

    if (fullText) {
      conversationHistory.push({ role: "assistant", content: fullText });
      saveCurrentSession();
    }
  } catch (err) {
    if (typingEl) typingEl.remove();
    showError("Failed to connect to the server. Is it running?");
  }

  isStreaming = false;
  sendBtn.disabled = !userInput.value.trim();
  userInput.focus();
});

// ── Message Rendering ──

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "\u{1F9D1}\u200D\u{1F33E}" : "\u{1F41D}";

  const body = document.createElement("div");
  body.className = "message-body";

  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = role === "user" ? "You" : "Garden Advisor";

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = role === "user" ? escapeHtml(text) : renderMarkdown(text);

  body.appendChild(label);
  body.appendChild(content);
  wrapper.appendChild(avatar);
  wrapper.appendChild(body);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function appendAssistantPlaceholder() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "\u{1F41D}";

  const body = document.createElement("div");
  body.className = "message-body";

  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = "Garden Advisor";

  const content = document.createElement("div");
  content.className = "message-content";

  const typing = document.createElement("div");
  typing.className = "typing-indicator";
  typing.innerHTML = "<span></span><span></span><span></span>";
  content.appendChild(typing);

  body.appendChild(label);
  body.appendChild(content);
  wrapper.appendChild(avatar);
  wrapper.appendChild(body);
  messagesEl.appendChild(wrapper);
  scrollToBottom();

  return { messageContent: content, typingEl: typing };
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function sanitizeSVG(raw) {
  let svg = raw.trim();
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  svg = svg.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  svg = svg.replace(/(href\s*=\s*["'])javascript:[^"']*(["'])/gi, "$1#$2");
  svg = svg.replace(/(xlink:href\s*=\s*["'])javascript:[^"']*(["'])/gi, "$1#$2");
  return svg;
}

function buildSvgContainer(svgMarkup, index) {
  return `<div class="svg-diagram" data-svg-index="${index}">
    <div class="svg-diagram-header">
      <span class="svg-diagram-label">Garden Diagram</span>
      <div class="svg-diagram-actions">
        <button class="svg-download-btn" title="Download SVG">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Download
        </button>
        <button class="svg-copy-btn" title="Copy SVG code">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy SVG
        </button>
      </div>
    </div>
    <div class="svg-diagram-content">${svgMarkup}</div>
  </div>`;
}

function renderMarkdown(text) {
  // 1. Extract SVG blocks before escaping
  const svgBlocks = [];
  let processed = text.replace(/```svg\n([\s\S]*?)```/g, (match, svgCode) => {
    const sanitized = sanitizeSVG(svgCode);
    const index = svgBlocks.length;
    svgBlocks.push(sanitized);
    return `SVG_PLACEHOLDER_${index}`;
  });

  // 2. Escape HTML
  let html = escapeHtml(processed);

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Paragraphs — wrap remaining bare text lines
  html = html.replace(/^(?!<[huplo]|<li|<hr|<pre|<code)(.+)$/gm, "<p>$1</p>");

  // Clean up extra breaks
  html = html.replace(/\n{2,}/g, "\n");

  // 3. Replace SVG placeholders with rendered containers
  svgBlocks.forEach((svg, i) => {
    const container = buildSvgContainer(svg, i);
    html = html.replace(`<p>SVG_PLACEHOLDER_${i}</p>`, container);
    html = html.replace(`SVG_PLACEHOLDER_${i}`, container);
  });

  return html;
}

function showError(msg) {
  const existing = document.querySelector(".error-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "error-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ── Initialize ──

function init() {
  const store = loadStore();
  activeSessionId = store.activeSessionId;

  if (activeSessionId) {
    const session = store.sessions.find((s) => s.id === activeSessionId);
    if (session && session.messages.length > 0) {
      conversationHistory = [...session.messages];
      welcomeEl.classList.add("hidden");
      conversationHistory.forEach((msg) => {
        appendMessage(msg.role, msg.content);
      });
    }
  }

  renderSidebar();
}

init();
