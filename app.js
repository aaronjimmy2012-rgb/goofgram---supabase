const SUPABASE_URL = "https://ungxrpngvrivzvwifidr.supabase.co";
const SUPABASE_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let session = null;
let state = {
  profile: null,
  profiles: [],
  posts: [],
  follows: [],
  messages: [],
};
let view = "home";
let selectedUserId = null;
let query = "";
let realtimeReady = false;

const paths = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  message: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z",
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name]}"></path></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function timeAgo(value) {
  const then = new Date(value).getTime();
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function initials(profile) {
  return (profile?.display_name || profile?.username || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function currentUserId() {
  return session?.user?.id;
}

function profileById(id) {
  return state.profiles.find((profile) => profile.id === id);
}

function isFollowing(followerId, followingId) {
  return state.follows.some((follow) => follow.follower_id === followerId && follow.following_id === followingId);
}

function showError(message) {
  const error = document.querySelector("#auth-error") || document.querySelector("#page-error");
  if (error) error.textContent = message;
}

async function init() {
  if (SUPABASE_KEY.includes("PASTE_")) {
    document.querySelector("#app").innerHTML = `
      <section class="auth-wrap">
        <div class="auth-card" style="grid-template-columns:1fr">
          <div class="auth-form">
            <h2>Add your Supabase key</h2>
            <p class="muted">Open app.js and replace PASTE_YOUR_PUBLISHABLE_KEY_HERE with your Supabase publishable key.</p>
          </div>
        </div>
      </section>`;
    return;
  }

  const { data } = await supabase.auth.getSession();
  session = data.session;
  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    await loadData();
  });
  await loadData();
}

async function loadData() {
  if (!session) {
    render();
    return;
  }

  const userId = currentUserId();
  const [profilesResult, postsResult, followsResult, messagesResult] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("posts").select("*").order("created_at", { ascending: false }),
    supabase.from("follows").select("*"),
    supabase
      .from("messages")
      .select("*")
      .or(`from_id.eq.${userId},to_id.eq.${userId}`)
      .order("created_at", { ascending: true }),
  ]);

  const error = profilesResult.error || postsResult.error || followsResult.error || messagesResult.error;
  if (error) {
    renderShellError(error.message);
    return;
  }

  state.profiles = profilesResult.data || [];
  state.posts = postsResult.data || [];
  state.follows = followsResult.data || [];
  state.messages = messagesResult.data || [];
  state.profile = state.profiles.find((profile) => profile.id === userId) || null;

  if (!state.profile) await createMissingProfile();
  connectRealtime();
  render();
}

async function createMissingProfile() {
  const user = session.user;
  const fallbackName = user.user_metadata?.display_name || user.email?.split("@")[0] || "New User";
  const fallbackUsername = (user.user_metadata?.username || fallbackName).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 18);
  await supabase.from("profiles").insert({
    id: user.id,
    username: fallbackUsername || `user_${user.id.slice(0, 6)}`,
    display_name: fallbackName,
  });
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  state.profile = data;
  state.profiles = [data, ...state.profiles.filter((profile) => profile.id !== user.id)];
}

function connectRealtime() {
  if (realtimeReady || !session) return;
  realtimeReady = true;
  supabase
    .channel("goofgram-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, loadData)
    .on("postgres_changes", { event: "*", schema: "public", table: "follows" }, loadData)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadData)
    .subscribe();
}

function renderShellError(message) {
  document.querySelector("#app").innerHTML = `
    <section class="auth-wrap">
      <div class="auth-card" style="grid-template-columns:1fr">
        <div class="auth-form">
          <h2>Supabase setup error</h2>
          <p class="error">${escapeHtml(message)}</p>
          <p class="muted">Check that the SQL tables and policies were created, and that your publishable key is correct.</p>
        </div>
      </div>
    </section>`;
}

function render() {
  const root = document.querySelector("#app");
  if (!session || !state.profile) {
    root.innerHTML = authView();
    wireAuth();
    return;
  }
  root.innerHTML = `
    <div class="shell">
      ${sidebar()}
      <section class="main">${topbar()}<p class="error" id="page-error"></p>${renderMain()}</section>
      ${rightbar()}
    </div>`;
  wireApp();
}

function authView() {
  return `
    <section class="auth-wrap">
      <div class="auth-card">
        <div class="auth-visual">
          <div class="brand"><span class="brand-mark">${icon("camera")}</span><span>Goofgram</span></div>
          <h1>Post. Follow. Chat.</h1>
          <p>A Netlify + Supabase social app with real signup, login, posts, follows, and messaging.</p>
        </div>
        <form class="auth-form" id="auth-form">
          <div class="tabs">
            <button type="button" class="active" data-auth-tab="login">Login</button>
            <button type="button" data-auth-tab="signup">Create account</button>
          </div>
          <h2 id="auth-title">Welcome back</h2>
          <input id="display-name" name="displayName" placeholder="Display name" autocomplete="name" hidden />
          <input id="username" name="username" placeholder="Username" autocomplete="username" hidden />
          <input name="email" placeholder="Email" autocomplete="email" type="email" required />
          <input name="password" placeholder="Password" autocomplete="current-password" type="password" required />
          <p class="error" id="auth-error" aria-live="polite"></p>
          <button class="primary" type="submit">Continue</button>
        </form>
      </div>
    </section>`;
}

function sidebar() {
  const nav = [
    ["home", "home", "Feed"],
    ["explore", "search", "Explore"],
    ["create", "plus", "Create"],
    ["messages", "message", "Messages"],
    ["profile", "user", "Profile"],
  ];
  return `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${icon("camera")}</span><span>Goofgram</span></div>
      <nav class="nav">
        ${nav.map(([id, ico, label]) => `<button class="${view === id ? "active" : ""}" data-view="${id}" title="${label}">${icon(ico)}<span>${label}</span></button>`).join("")}
      </nav>
      <div class="me-card">
        <div class="row">
          <div class="avatar">${initials(state.profile)}</div>
          <div class="meta"><div class="name">${escapeHtml(state.profile.display_name)}</div><div class="muted mini">@${escapeHtml(state.profile.username)}</div></div>
        </div>
        <button class="ghost" id="logout" style="width:100%;margin-top:12px">${icon("logout")} Logout</button>
      </div>
    </aside>`;
}

function topbar() {
  const titles = { home: "Feed", explore: "Explore", create: "Create Post", messages: "Messages", profile: "Profile" };
  return `<header class="topbar"><h1 class="view-title">${titles[view]}</h1><input class="search" id="search" placeholder="Search people or posts" value="${escapeHtml(query)}" /></header>`;
}

function rightbar() {
  const suggestions = state.profiles.filter((profile) => profile.id !== currentUserId() && !isFollowing(currentUserId(), profile.id)).slice(0, 4);
  return `<aside class="rightbar"><h2>People to follow</h2><div class="suggestions">${suggestions.length ? suggestions.map(userCardSmall).join("") : `<p class="empty">You follow everyone here.</p>`}</div></aside>`;
}

function renderMain() {
  if (view === "home") return homeView();
  if (view === "explore") return exploreView();
  if (view === "create") return createView(false);
  if (view === "messages") return messagesView();
  return profileView(selectedUserId || currentUserId());
}

function homeView() {
  const feedUserIds = new Set([currentUserId(), ...state.follows.filter((follow) => follow.follower_id === currentUserId()).map((follow) => follow.following_id)]);
  const posts = filteredPosts(state.posts.filter((post) => feedUserIds.has(post.user_id)));
  return `${createView(true)}<section class="feed">${posts.length ? posts.map(postCard).join("") : `<div class="panel empty">Follow people or create a post to start your feed.</div>`}</section>`;
}

function createView(compact) {
  return `<form class="composer" id="post-form">${compact ? "" : `<h2 class="view-title">Share something</h2>`}<textarea id="caption" placeholder="What's happening?"></textarea><div class="composer-tools"><input id="image-url" placeholder="Image URL (optional)" /><input id="post-color" type="color" value="#f75c7c" title="Post color" /><button class="primary" type="submit">${icon("plus")} Post</button></div></form>`;
}

function exploreView() {
  const people = filteredUsers(state.profiles.filter((profile) => profile.id !== currentUserId()));
  return `<section class="stack"><div class="panel" style="padding:16px"><h2 class="view-title">People</h2><div class="people-grid" style="margin-top:12px">${people.map(userCard).join("") || `<p class="empty">No people found.</p>`}</div></div><div class="feed">${filteredPosts(state.posts).map(postCard).join("") || `<div class="panel empty">No posts match your search.</div>`}</div></section>`;
}

function profileView(userId) {
  const profile = profileById(userId) || state.profile;
  const posts = state.posts.filter((post) => post.user_id === profile.id);
  const followers = state.follows.filter((follow) => follow.following_id === profile.id).length;
  const following = state.follows.filter((follow) => follow.follower_id === profile.id).length;
  return `<section class="stack"><div class="panel profile-card"><div class="avatar lg">${initials(profile)}</div><div><h2 class="view-title">${escapeHtml(profile.display_name)}</h2><p class="muted">@${escapeHtml(profile.username)}</p><p>${escapeHtml(profile.bio || "No bio yet.")}</p><div class="stats"><span class="stat"><strong>${posts.length}</strong><span class="muted">posts</span></span><span class="stat"><strong>${followers}</strong><span class="muted">followers</span></span><span class="stat"><strong>${following}</strong><span class="muted">following</span></span></div></div><div class="stack">${profile.id === currentUserId() ? `<button class="ghost" id="logout-profile">${icon("logout")} Logout</button>` : `<button class="pill ${isFollowing(currentUserId(), profile.id) ? "following" : ""}" data-follow="${profile.id}">${isFollowing(currentUserId(), profile.id) ? "Following" : "Follow"}</button><button class="ghost" data-message="${profile.id}">${icon("message")} Message</button>`}</div></div><section class="feed">${posts.map(postCard).join("") || `<div class="panel empty">No posts yet.</div>`}</section></section>`;
}

function messagesView() {
  const partners = messagePartners();
  const activePartnerId = selectedUserId && selectedUserId !== currentUserId() ? selectedUserId : partners[0]?.id;
  const activePartner = activePartnerId ? profileById(activePartnerId) : null;
  const messages = activePartner ? threadMessages(activePartner.id) : [];
  return `<section class="messages-layout"><div class="thread-list">${partners.length ? partners.map((profile) => threadButton(profile, activePartnerId)).join("") : `<div class="empty">Follow someone or open a profile to start chatting.</div>`}</div><div class="chat-panel">${activePartner ? `<div class="chat-head"><div class="row"><div class="avatar">${initials(activePartner)}</div><div><div class="name">${escapeHtml(activePartner.display_name)}</div><div class="muted mini">@${escapeHtml(activePartner.username)}</div></div></div><button class="ghost" data-profile="${activePartner.id}">${icon("user")} Profile</button></div><div class="messages" id="messages">${messages.map(messageBubble).join("") || `<p class="empty">Say hi.</p>`}</div><form class="message-input" id="message-form" data-to="${activePartner.id}"><textarea id="message-text" placeholder="Type a message"></textarea><button class="primary" type="submit">${icon("send")}</button></form>` : `<div class="empty">Pick someone to chat with.</div>`}</div></section>`;
}

function postCard(post) {
  const profile = profileById(post.user_id);
  if (!profile) return "";
  return `<article class="post"><header class="post-head"><button class="avatar" data-profile="${profile.id}">${initials(profile)}</button><div><button class="ghost mini" data-profile="${profile.id}">${escapeHtml(profile.display_name)}</button><div class="muted mini">@${escapeHtml(profile.username)} · ${timeAgo(post.created_at)} ago</div></div></header><div class="post-body"><div class="photo" style="--photo-a:#f75c7c;--photo-b:#1b9aaa">${post.image_url ? `<img src="${escapeHtml(post.image_url)}" alt="Post image by ${escapeHtml(profile.display_name)}" onerror="this.remove()" />` : icon("camera")}</div><p class="caption">${escapeHtml(post.caption)}</p></div><footer class="actions"><span class="muted mini">Goofgram post</span><button class="ghost" data-message="${profile.id}">${icon("message")} Message</button></footer></article>`;
}

function userCardSmall(profile) {
  return `<div class="user-row"><button class="avatar" data-profile="${profile.id}">${initials(profile)}</button><div style="min-width:0;flex:1"><div class="name">${escapeHtml(profile.display_name)}</div><div class="muted mini">@${escapeHtml(profile.username)}</div></div><button class="pill" data-follow="${profile.id}">Follow</button></div>`;
}

function userCard(profile) {
  return `<div class="panel person-card"><div class="row"><button class="avatar" data-profile="${profile.id}">${initials(profile)}</button><div><div class="name">${escapeHtml(profile.display_name)}</div><div class="muted mini">@${escapeHtml(profile.username)}</div></div></div><p class="muted">${escapeHtml(profile.bio || "No bio yet.")}</p><div class="row spread"><button class="pill ${isFollowing(currentUserId(), profile.id) ? "following" : ""}" data-follow="${profile.id}">${isFollowing(currentUserId(), profile.id) ? "Following" : "Follow"}</button><button class="ghost" data-message="${profile.id}">${icon("message")} Message</button></div></div>`;
}

function messagePartners() {
  const ids = new Set();
  state.follows.forEach((follow) => {
    if (follow.follower_id === currentUserId()) ids.add(follow.following_id);
    if (follow.following_id === currentUserId()) ids.add(follow.follower_id);
  });
  state.messages.forEach((message) => {
    if (message.from_id === currentUserId()) ids.add(message.to_id);
    if (message.to_id === currentUserId()) ids.add(message.from_id);
  });
  return [...ids].map(profileById).filter(Boolean);
}

function threadButton(profile, activePartnerId) {
  const last = threadMessages(profile.id).at(-1);
  return `<button class="thread-button ${activePartnerId === profile.id ? "active" : ""}" data-thread="${profile.id}"><div class="avatar">${initials(profile)}</div><div><div class="name">${escapeHtml(profile.display_name)}</div><div class="muted mini">${last ? escapeHtml(last.text.slice(0, 42)) : "Start a chat"}</div></div></button>`;
}

function messageBubble(message) {
  return `<div class="bubble ${message.from_id === currentUserId() ? "mine" : ""}">${escapeHtml(message.text)}<div class="mini muted">${timeAgo(message.created_at)} ago</div></div>`;
}

function threadMessages(partnerId) {
  return state.messages.filter((message) => (message.from_id === currentUserId() && message.to_id === partnerId) || (message.from_id === partnerId && message.to_id === currentUserId()));
}

function filteredUsers(profiles) {
  const term = query.trim().toLowerCase();
  if (!term) return profiles;
  return profiles.filter((profile) => profile.username.toLowerCase().includes(term) || profile.display_name.toLowerCase().includes(term));
}

function filteredPosts(posts) {
  const term = query.trim().toLowerCase();
  if (!term) return posts;
  return posts.filter((post) => post.caption.toLowerCase().includes(term) || profileById(post.user_id)?.username.toLowerCase().includes(term));
}

function wireAuth() {
  let mode = "login";
  const form = document.querySelector("#auth-form");
  const displayName = document.querySelector("#display-name");
  const username = document.querySelector("#username");
  const title = document.querySelector("#auth-title");
  const error = document.querySelector("#auth-error");

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.authTab;
      document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
      displayName.hidden = mode === "login";
      username.hidden = mode === "login";
      displayName.required = mode === "signup";
      username.required = mode === "signup";
      title.textContent = mode === "login" ? "Welcome back" : "Create your account";
      error.textContent = "";
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const data = Object.fromEntries(new FormData(form));
    try {
      if (mode === "login") {
        const result = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
        if (result.error) throw result.error;
        return;
      }

      const usernameValue = String(data.username || "").trim().toLowerCase();
      if (!/^[a-z0-9_]{3,18}$/.test(usernameValue)) throw new Error("Use 3-18 letters, numbers, or underscores for the username.");
      const signup = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { username: usernameValue, display_name: data.displayName || usernameValue } },
      });
      if (signup.error) throw signup.error;
      if (!signup.data.session) throw new Error("Account created. Check your email to confirm it, then log in.");
      await supabase.from("profiles").insert({
        id: signup.data.user.id,
        username: usernameValue,
        display_name: data.displayName || usernameValue,
      });
      await loadData();
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

function wireApp() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.view;
    if (view === "profile") selectedUserId = currentUserId();
    render();
  }));
  document.querySelector("#logout")?.addEventListener("click", logout);
  document.querySelector("#logout-profile")?.addEventListener("click", logout);
  document.querySelector("#search")?.addEventListener("input", (event) => {
    query = event.target.value;
    render();
    document.querySelector("#search")?.focus();
  });
  document.querySelector("#post-form")?.addEventListener("submit", createPost);
  document.querySelectorAll("[data-follow]").forEach((button) => button.addEventListener("click", () => toggleFollow(button.dataset.follow)));
  document.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => {
    selectedUserId = button.dataset.profile;
    view = "profile";
    render();
  }));
  document.querySelectorAll("[data-message]").forEach((button) => button.addEventListener("click", () => {
    selectedUserId = button.dataset.message;
    view = "messages";
    render();
    scrollMessages();
  }));
  document.querySelectorAll("[data-thread]").forEach((button) => button.addEventListener("click", () => {
    selectedUserId = button.dataset.thread;
    render();
    scrollMessages();
  }));
  document.querySelector("#message-form")?.addEventListener("submit", sendMessage);
  scrollMessages();
}

async function createPost(event) {
  event.preventDefault();
  const caption = document.querySelector("#caption").value.trim();
  const imageUrl = document.querySelector("#image-url").value.trim();
  if (!caption && !imageUrl) return;
  const { error } = await supabase.from("posts").insert({
    user_id: currentUserId(),
    caption: caption || "Shared a new photo.",
    image_url: imageUrl,
  });
  if (error) return showError(error.message);
  view = "home";
  await loadData();
}

async function toggleFollow(profileId) {
  if (isFollowing(currentUserId(), profileId)) {
    const { error } = await supabase.from("follows").delete().eq("follower_id", currentUserId()).eq("following_id", profileId);
    if (error) return showError(error.message);
  } else {
    const { error } = await supabase.from("follows").insert({ follower_id: currentUserId(), following_id: profileId });
    if (error) return showError(error.message);
  }
  await loadData();
}

async function sendMessage(event) {
  event.preventDefault();
  const textarea = document.querySelector("#message-text");
  const text = textarea.value.trim();
  if (!text) return;
  const { error } = await supabase.from("messages").insert({ from_id: currentUserId(), to_id: event.currentTarget.dataset.to, text });
  if (error) return showError(error.message);
  textarea.value = "";
  await loadData();
  scrollMessages();
}

async function logout() {
  await supabase.auth.signOut();
  session = null;
  state = { profile: null, profiles: [], posts: [], follows: [], messages: [] };
  render();
}

function scrollMessages() {
  requestAnimationFrame(() => {
    const messages = document.querySelector("#messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

init();
