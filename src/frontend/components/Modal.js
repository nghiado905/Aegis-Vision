export function Modal({ title, body, submitLabel = 'Save' }) {
  return `<div class="overlay"><form class="modal"><h2>${title}</h2>${body}<button type="submit" class="btn primary">${submitLabel}</button></form></div>`;
}
