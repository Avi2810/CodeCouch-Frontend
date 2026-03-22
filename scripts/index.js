import { showToast } from './toast.js';
import { initEditor, setupYjs, setupCollab, monaco, setLanguage } from './editor.js';
// loading env variable
const API_URL = import.meta.env.VITE_API_URL;
const WS_URL = import.meta.env.VITE_WS_URL;

let currentUserName = null;
let isSignUp = false;
let roomId;
let appSocket;
let editor;
let editor_socket;
let remoteDecorations = {};

let currentLang = "python";
let langdata = {
  "python": "Python (3.12)"
};

let userIndexMap = {};
let nextIndex = 1;

const runCodeBtn = document.getElementById('play-btn');
const output_field = document.getElementById('output');

function getUserIndex(user_id) {
  if (!(user_id in userIndexMap)) {
    userIndexMap[user_id] = nextIndex;
    nextIndex++; // increment for the next new user
  }
  return userIndexMap[user_id];
}

// Show page by name
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(page => {
    page.style.display = 'none';
  });
  const page = document.getElementById(`${pageName}-page`);
  if (page) page.style.display = 'block';
}

function renderUsers(users) {
  const usersList = document.getElementById('users-list');
  usersList.innerHTML = '';

  users.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = 'joined-user-item';

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.textContent = user.alias.toUpperCase();

    const dropdown = document.createElement('div');
    dropdown.className = 'joined-user-dropdown-menu';

    const name = document.createElement('div');
    name.className = 'user-email';
    name.textContent = user.name;

    dropdown.appendChild(name);

    if (user.access){
      const roleToggle = document.createElement('div');
      roleToggle.className = 'roleToggle';

      const editorRole = document.createElement('button');
      editorRole.className = 'roleButton editorRole';
      editorRole.textContent = 'Editor';

      const viewerRole = document.createElement('button');
      viewerRole.className = 'roleButton viewerRole';
      viewerRole.textContent = 'Viewer';

      roleToggle.appendChild(editorRole);
      roleToggle.appendChild(viewerRole);

      dropdown.appendChild(roleToggle);

      if (user.access == "editor") editorRole.classList.add('active');
      else viewerRole.classList.add('active');
      if (user.access === "viewer"){
        editorRole.onclick = () => {
          appSocket.send(JSON.stringify({type: "edit_access", data: {user_id: user.user_id, access: "editor"}}));
        };
      }
      else if (user.access === "editor"){
        viewerRole.onclick = () => {
          appSocket.send(JSON.stringify({type: "edit_access", data: {user_id: user.user_id, access: "viewer"}}));
        };
      }
    }

    userItem.appendChild(avatar);
    userItem.appendChild(dropdown);
    usersList.appendChild(userItem);
  });
}

function updateUserButtons() {
  if (currentUserName) {
    const name = currentUserName;
    [
      document.getElementById('username-btn'),
      document.getElementById('username-btn-editor')
    ].forEach(btn => {
      if (btn) btn.textContent = name;
    });
  }
}

function toggleDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const isVisible = dropdown.style.display === 'flex';
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.style.display = 'none';
  });
  if (!isVisible) {
    dropdown.style.display = 'flex';
    dropdown.style.flexDirection = 'column';
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.style.display = 'none';
  });
}

async function handleAuth(name, email, password, isSignUpMode) {
  try {
    let result;

    if (isSignUpMode) {
      result = await fetch(`${API_URL}auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `name=${name}&email=${email}&password=${password}`,
      });

      if (result.status === 201) {
        showToast('Account created successfully! Please sign in.', null, 'success', 'Success');
        toggleAuthMode();
        document.getElementById('password').value = '';
        return;
      }
      else {
        result = await result.json();
        showToast(result.detail, null, 'error', 'Error');
        document.getElementById('password').value = '';
        return;
      }
    } 
    else {
      result = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `name="-"&email=${email}&password=${password}`,
      });
      

      if (result.status === 200) {
      result = await result.json();
      currentUserName = result.name;
      localStorage.setItem('token', result.access_token);
      updateUserButtons();
      showPage('rooms');
      showToast('Login successful', null, 'success', 'Success');
      }
      else {
        result = await result.json();
        showToast(result.detail, null, 'error', 'Error');
        return;
      }
  }
  } catch (error) {
    showToast(error.message || 'Authentication failed', null, 'error', 'Error');
  }
}

async function handleLogout() {
  if (editor_socket) editor_socket.close();
  if (appSocket) appSocket.close();
  let result = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  if (result.status === 200) {
    result = await result.json();
    showToast(result.message, null, 'success', 'Success');
  }
  else {
    result = await result.json();
    showToast(result.detail, null, 'error', 'Error');
  }
  currentUserName = null;
  localStorage.clear();
  showPage('auth');
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
  window.location.reload();
}

function toggleAuthMode() {
  isSignUp = !isSignUp;
  document.getElementById('name').style.display = isSignUp ? 'block' : 'none';
  const submitBtn = document.getElementById('auth-submit');
  const toggleText = document.getElementById('auth-toggle-text');
  const toggleLink = document.getElementById('auth-toggle-link');

  submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  toggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
  toggleLink.textContent = isSignUp ? 'Sign In' : 'Sign Up';
}

function showPasswordModal() {
  document.getElementById('password-modal').style.display = 'flex';
  closeAllDropdowns();
}

function closePasswordModal() {
  document.getElementById('password-modal').style.display = 'none';
  document.getElementById('password-form').reset();
}

async function handlePasswordChange(e) {
  e.preventDefault();

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', null, 'error', 'Error');
    return;
  }
  try {
    let result = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: `curr_password=${currentPassword}&new_password=${newPassword}&confirm_new_password=${confirmPassword}`
    });
    if (result.status === 200) {
      result = await result.json();
      showToast(result.message, null, 'success', 'Success');
      closePasswordModal();
    }
    else {
      result = await result.json();
      showToast(result.detail, null, 'error', 'Error');
    }
  }
  catch (error) {
    showToast(error.message || 'Failed to update password', null, 'error', 'Error');
  }
}

// Login/Signup
document.getElementById('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  handleAuth(name, email, password, isSignUp);
});

// Toggle between login and signup
document.getElementById('auth-toggle-link').addEventListener('click', (e) => {
  e.preventDefault();
  toggleAuthMode();
});

// Leave room
document.getElementById('leave-room-link-editor').addEventListener('click', (e) => {
  e.preventDefault();
  appSocket.close(1000, "You left the room");
  editor_socket.close();
  editor = null;
  editor_socket = null;
  appSocket = null;
  showPage('rooms');
  window.location.reload();
});

// trrottle Function
function throttle(fn, delay) {
  let lastCall = 0

  return (...args) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      fn(...args)
    }
  }
}

// Awareness
function initAwareness(editor, appSocket) {
  const sendAwareness = throttle((offset) => {
    appSocket.send(JSON.stringify({
      type: "awareness",
      data: offset
    }))
  }, 100)

  editor.onDidChangeCursorPosition((e) => {
    const offset = editor.getModel().getOffsetAt(e.position);
    sendAwareness(offset);
  });
}


function renderRemoteCursor(editor, user_id, alias, offset) {
  const idx = getUserIndex(user_id);
  document.documentElement.style.setProperty(`--user-${idx}`, `"${alias}"`);
  const position = editor.getModel().getPositionAt(offset);
  const decorations = {
    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
    options: {
      className: `remote-cursor u-${idx}`,
    },
    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
  };
  remoteDecorations[user_id] = editor.deltaDecorations(remoteDecorations[user_id] || [], [decorations]);
}

function update_IndexUserMap(users) {
  userIndexMap = {};
  nextIndex = 1;
  users.forEach(user => {
    userIndexMap[user.user_id] = nextIndex;
    nextIndex++;
  });
}

function updateRemoteDecorations() {
  // remove user if not in list
  Object.keys(remoteDecorations).forEach(user_id => {
    if (!userIndexMap[user_id]) {
      editor.deltaDecorations(remoteDecorations[user_id], []);
      delete remoteDecorations[user_id];
    }
  });
}


// socket actions
function initAppSocketActions(appSocket) {
  appSocket.onmessage = (event) => {
    const eventData = JSON.parse(event.data);
    if (eventData.type === "join_request") {
      document.getElementById('joinReqSound').play();
      showToast(`<strong>${eventData.data.name}</strong> wants to join the room`, {socket: appSocket, data: eventData.data.user_id }, 'question', 'Join Request');
    }
    else if (eventData.type === "user_update") {
      showToast(eventData.data, null, 'info', 'Message');
      appSocket.send(JSON.stringify({type: "get_users"}));
    }
    else if (eventData.type === "message") {
      showToast(eventData.data, null, 'info', 'Message');
    }
    else if (eventData.type === "error") {
      showToast(eventData.data, null, 'error', 'Error');
    }
    else if (eventData.type === "users_list") {
      renderUsers(eventData.data);
      update_IndexUserMap(eventData.data);
      updateRemoteDecorations();
    }
    else if (eventData.type === "editor_access") { editor.updateOptions({readOnly: !eventData.data}); runCodeBtn.disabled = !eventData.data; }
    else if (eventData.type === "connected") {
      showPage('editor');
      document.getElementById('waiting-modal').style.display = 'none';
      document.getElementById('room-id-display').textContent = `Room: ${roomId}`;
      editor = null;
      editor_socket = null;
      editor_socket = new WebSocket(`${WS_URL}/ws/room/${roomId}?token=${localStorage.getItem('token')}`);
      editor_socket.binaryType = 'arraybuffer';
      const {ydoc, ytext} = setupYjs();
      editor = initEditor(ytext);
      setupCollab(editor_socket, ydoc);
      initAwareness(editor, appSocket);
      initLanguageSelection();
    }
    else if (eventData.type === "awareness") {
      renderRemoteCursor(editor, eventData.user_id, eventData.alias, eventData.data);
    }
    else if (eventData.type === "code_output") {
      output_field.value = eventData.data.stdout || eventData.data.stderr || "No output to display.";
      runCodeBtn.disabled = false;
    }
    else if (eventData.type === "chat_message") {
      const chatArea = document.querySelector('.chat-area');
      const message = document.createElement('div');
      message.classList.add('message');
      if (eventData.name === '-your-') message.classList.add('own');
      const avatar = document.createElement('div');
      avatar.classList.add('message-avatar');
      if (eventData.name === '-your-') { avatar.textContent = "You" } else { avatar.textContent = eventData.name };
      const text = document.createElement('div');
      text.classList.add('message-text');
      text.textContent = eventData.data;
      message.appendChild(avatar);
      message.appendChild(text);
      chatArea.appendChild(message);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  }
  //Save code
  document.getElementById('editor').addEventListener('keydown', (e) => {
    if (e.key === 's' &&  e.ctrlKey) {
      e.preventDefault();
      // showToast("Code saved", null, 'success', 'Success');
      // appSocket.send(JSON.stringify({type: "execute_code", data: {language: currentLang, stdin: document.getElementById('code-input').value}}));
    }
  });

  appSocket.onclose = (event) => {
    showToast(`Disconnected from server.<br>Reason: ${event.reason}`, null, 'error', 'Message');
    document.getElementById('waiting-modal').style.display = 'none';
    showPage('rooms');
  };

  appSocket.onerror = (event) => {
    showPage('rooms');
    document.getElementById('waiting-modal').style.display = 'none';
    showToast(`Error while connecting to server.<br>Reason: ${event.reason}`, null, 'error', 'Error');
  };

}

function initAppSocket(roomId, token){
  try {appSocket.close();} catch (error) {}
  try {editor_socket.close();} catch (error) {}
  document.getElementById('waiting-modal').style.display = 'flex';
  appSocket = new WebSocket(`${WS_URL}/ws/app/${roomId}?token=${token}`);
  appSocket.binaryType = 'arraybuffer';
  initAppSocketActions(appSocket);
}


// Initialize room
function initRoom(roomId, token) {
  initAppSocket(roomId, token);
}

// Leave waiting
function leaveWaiting() {
  console.log("Leave room clicked");
  appSocket.close(1000, "You left the room");
  const waitingModal = document.getElementById('waiting-modal');
  waitingModal.style.display = 'none';
  showPage('rooms');
  }

// Create room
document.getElementById('create-room-btn').addEventListener('click', async () => {

  const waitingModal = document.getElementById('waiting-modal');
  waitingModal.style.display = 'flex';
  try {appSocket.close();} catch (error) {}
  try {editor_socket.close();} catch (error) {}
  document.getElementById("leave-room-btn").addEventListener("click", leaveWaiting);
  const result = await fetch(`${API_URL}/create-room`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  if (result.status== 200) {
    const data = await result.json();
    roomId = data.room_id;
    initRoom(roomId, localStorage.getItem('token'));
  }
  else {
    showToast("Failed to create room", null, 'error', 'Error');
    return;
  }
  
});

// Join room
document.getElementById('join-room-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById("leave-room-btn").addEventListener("click", leaveWaiting);
  roomId = document.getElementById('room-id-input').value.toUpperCase();
  initRoom(roomId, localStorage.getItem('token'));
  document.getElementById('room-id-input').value = '';
});


// Language selection
async function initLanguageSelection(){
  const langSelectBtn = document.querySelector('.lang-select');
  const langSearchWrapper = document.querySelector('.lang-search-wrapper');
  const langSearchInput = document.querySelector('.lang-search');
  const langOptionsContainer = document.querySelector('.lang-options');

  let response = await fetch(`${API_URL}/get-language-data`);
  if (response.status == 200) {
    const data = await response.json();
    langdata = data;
    langSelectBtn.innerHTML = langdata[currentLang]+ '<i class="fa-solid fa-chevron-down"></i>';
    Object.keys(langdata).forEach(lang => {
      const option = document.createElement('div');
      option.classList.add('lang');
      option.dataset.lang = lang;
      option.innerHTML = langdata[lang]; 
      if (lang === currentLang) option.innerHTML += '<i class="fa-solid fa-check"></i>';
      langOptionsContainer.appendChild(option);
    });
  }
  else {
    showToast("Failed to fetch language data", null, 'error', 'Error');
    return;
  }

  langSelectBtn.addEventListener('click', () => {
    const rect = langSelectBtn.getBoundingClientRect();
    langSearchWrapper.style.left = `${rect.left}px`;
    langSearchWrapper.classList.toggle('hidden');
    langSearchInput.focus();
  });

  const langOptions = document.querySelectorAll('.lang');
  langSearchInput.addEventListener('input', () => {
    const filter = langSearchInput.value.toLowerCase();
    langOptions.forEach(option => {
      if (option.textContent.toLowerCase().includes(filter)) {
        option.style.display = 'flex';
      } else {
        option.style.display = 'none';
      }
    });
  });

  langOptions.forEach(option => {
    option.addEventListener('click', () => {
      langOptions.forEach(opt => opt.innerHTML = langdata[opt.dataset.lang]);
      currentLang = option.dataset.lang;
      option.innerHTML = langdata[currentLang] + '<i class="fa-solid fa-check"></i>';
      langSelectBtn.innerHTML = langdata[currentLang] + '<i class="fa-solid fa-chevron-down"></i>';
      langSearchWrapper.classList.toggle('hidden');
      langSearchInput.value = '';
      langOptions.forEach(opt => opt.style.display = 'flex');
      setLanguage(editor, currentLang);
    });
  });
}



// Run code
runCodeBtn.addEventListener('click', () => {
  runCodeBtn.disabled = true;
  appSocket.send(JSON.stringify({type: "execute_code", data: {language: currentLang, stdin: document.getElementById('code-input').value}}));
});

// Chat box
document.getElementById('send-message').addEventListener('click', () => {
  const message = document.getElementById('chat-input').value;
  if (message.trim() === '') return;
  appSocket.send(JSON.stringify({type: "chat_message", data: message}));
  document.getElementById('chat-input').value = '';
});



// Open User dropdown
document.getElementById('username-btn').addEventListener('click', () => {
  toggleDropdown('user-dropdown');
});

// Open User dropdown in editor page
document.getElementById('username-btn-editor').addEventListener('click', () => {
  toggleDropdown('user-dropdown-editor');
});

// Open password modal
document.getElementById('change-password-link').addEventListener('click', (e) => {
  e.preventDefault();
  showPasswordModal();
});

// Open password modal in editor page
document.getElementById('change-password-link-editor').addEventListener('click', (e) => {
  e.preventDefault();
  showPasswordModal();
});

// Logout
document.getElementById('logout-link-rooms').addEventListener('click', (e) => {
  e.preventDefault();
  handleLogout();
});

// Logout in editor page
document.getElementById('logout-link-editor').addEventListener('click', (e) => {
  e.preventDefault();
  handleLogout();
});

// Password Modal actions
document.getElementById('modal-close').addEventListener('click', closePasswordModal);
document.getElementById('modal-cancel').addEventListener('click', closePasswordModal);
document.getElementById('password-form').addEventListener('submit', handlePasswordChange);

// Close password modal when clicked outside
document.getElementById('password-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('password-modal')) {
    closePasswordModal();
  }
});

// Close dropdown when clicked outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-menu-wrapper')) {
    closeAllDropdowns();
  }
});


const resizerLR = document.querySelector(".resizer-lr");
const leftSection = document.querySelector(".left-section");
// const rightSection = document.querySelector(".right-section");

let isResizing = false;


resizerLR.addEventListener("mousedown", (e) => {
  isResizing = true;
  document.body.style.cursor = "ew-resize";
});
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;

  const container = document.querySelector('.main-content');
  const containerRect = container.getBoundingClientRect();

  const newLeftWidth = e.clientX - containerRect.left;
  leftSection.style.width = newLeftWidth + "px";
});
document.addEventListener('mouseup', (e) => {
  isResizing = false;
  document.body.style.cursor = "default";
});

// copy room id
document.querySelector('.room-info').addEventListener('click', () => {
  navigator.clipboard.writeText(roomId);
  showToast('Room ID copied to clipboard', null, 'success', 'Success');
});


// Check if user is logged in
(async () => {
  const token = localStorage.getItem('token');
  let result;
  try{
    if (token) {
      result = await fetch(`${API_URL}/auth/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (result.status === 200) {
        result = await result.json();
        currentUserName = result.name;
        updateUserButtons();
        showPage('rooms');
        showToast('Welcome back!', null, 'success', 'Success');
      }
      else {
        localStorage.clear();
        showPage('auth');
      }
    } else {
      showPage('auth');
    }
  }
  catch (error) {
    localStorage.clear();
    showToast(error.message || 'Authentication failed', null, 'error', 'Error');
    showPage('auth');
  }
})();