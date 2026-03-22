function showToast(message, callback, type = 'info', title = '') {
  const container = document.getElementById('toast-container');

  const icons = {
    question: '?',
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = document.createElement('div');
  icon.className = `toast-icon ${type}`;
  icon.textContent = icons[type] || icons.info;

  const content = document.createElement('div');
  content.className = 'toast-content';

  if (title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;
    content.appendChild(titleEl);
  }

  const messageEl = document.createElement('div');
  messageEl.className = 'toast-message';
  messageEl.innerHTML = message;
  content.appendChild(messageEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => removeToast(toast);

  toast.appendChild(icon);
  toast.appendChild(content);
  if (type === 'question') {
    const actions = document.createElement('div');
    actions.className = 'toast-actions';

    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn approve';
    approveBtn.textContent = '✓';
    approveBtn.onclick = () => {
      callback.socket.send(JSON.stringify({type: "join_response", data: callback.data}));
      // alert(callback.data);
      removeToast(toast);
    };

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn reject';
    rejectBtn.textContent = '×';
    rejectBtn.onclick = () => {
      callback.socket.send(JSON.stringify({type: "reject_join_response", data: callback.data}));
      removeToast(toast)};

    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    toast.appendChild(actions);
  }
  if (type !== 'question') toast.appendChild(closeBtn);

  container.appendChild(toast);

  if (type === 'question') return;
  const duration = type === 'question' ? 300000 : 3500;
  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  toast.classList.add('removing');
  setTimeout(() => {
    toast.remove();
  }, 300);
}

export { showToast };