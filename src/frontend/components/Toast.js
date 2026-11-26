export function showToast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  document.querySelector('#toast-region')?.appendChild(node);
  setTimeout(() => node.remove(), 4700);
}
