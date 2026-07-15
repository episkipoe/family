const USER_NAME_KEY = 'familyPlanner.userName';

const currentUserName = document.querySelector('#currentUserName');
const changeNameButton = document.querySelector('#changeNameButton');
const nameDialog = document.querySelector('#nameDialog');
const nameForm = document.querySelector('#nameForm');
const nameInput = document.querySelector('#nameInput');

function loadUserName() {
  return localStorage.getItem(USER_NAME_KEY) || '';
}

function renderUserName() {
  currentUserName.textContent = loadUserName() || 'Not set';
}

function saveUserName(name) {
  const cleaned = String(name || '').trim().slice(0, 80);
  if (!cleaned) return false;
  localStorage.setItem(USER_NAME_KEY, cleaned);
  renderUserName();
  return true;
}

function openNameDialog() {
  nameInput.value = loadUserName();
  if (typeof nameDialog.showModal === 'function') {
    nameDialog.showModal();
    return;
  }

  saveUserName(prompt('What name should we use for games?'));
}

nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (saveUserName(nameInput.value)) {
    nameDialog.close();
  }
});

changeNameButton.addEventListener('click', openNameDialog);

renderUserName();
