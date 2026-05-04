(function () {

// ── Theme switching ──
var STORAGE_KEY = 'hermes-dashboard-theme';
var themeBtn = document.getElementById('theme-btn');
var themeDropdown = document.getElementById('theme-dropdown');
var themeOptions = document.querySelectorAll('.theme-option');

function applyTheme(name) {
  if (name === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', name);
  }
  themeOptions.forEach(function (opt) {
    opt.classList.toggle('active', opt.getAttribute('data-theme') === name);
  });
  try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
}

// Restore saved theme
var saved = 'default';
try { saved = localStorage.getItem(STORAGE_KEY) || 'default'; } catch (e) {}
applyTheme(saved);

themeBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  themeDropdown.classList.toggle('open');
});

themeOptions.forEach(function (opt) {
  opt.addEventListener('click', function () {
    applyTheme(opt.getAttribute('data-theme'));
    themeDropdown.classList.remove('open');
  });
});

document.addEventListener('click', function (e) {
  if (!e.target.closest('.theme-switcher')) {
    themeDropdown.classList.remove('open');
  }
});



var modal = document.getElementById('project-modal');
var modalTitle = document.getElementById('modal-title');
var modalLinks = document.getElementById('modal-links');
var modalClose = document.getElementById('modal-close');
var lastCard;

// ── Icon mapping (Font Awesome 6) ──
var ICON_MAP = {
  "Website": "fa-solid fa-globe",
  "App Store": "fa-brands fa-app-store",
  "GitHub": "fa-brands fa-github",
  "Download": "fa-solid fa-download"
};

function openModal(name) {
  var p = PROJECTS[name];
  if (!p) return;
  modalTitle.textContent = name;
  modalLinks.innerHTML = '';
  p.links.forEach(function (l) {
    var a = document.createElement('a');
    a.className = 'modal-link';
    a.href = l.u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    var iconWrap = document.createElement('span');
    iconWrap.className = 'link-icon';
    var iconClass = ICON_MAP[l.t];
    if (iconClass) {
      iconWrap.innerHTML = '<i class="' + iconClass + '"></i>';
    }
    var label = document.createElement('span');
    label.textContent = l.t;
    var arrow = document.createElement('span');
    arrow.className = 'link-arrow';
    arrow.textContent = '\u2197';
    a.appendChild(iconWrap);
    a.appendChild(label);
    a.appendChild(arrow);
    modalLinks.appendChild(a);
  });
  modal.classList.add('active');
  modalClose.focus();
  trapFocus(modal);
}

function closeModal() {
  releaseFocus(modal);
  modal.classList.remove('active');
  if (lastCard) { lastCard.focus({preventScroll: true}); lastCard = null; }
}

document.querySelectorAll('.card[data-project]').forEach(function (card) {
  card.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    lastCard = card;
    openModal(card.getAttribute('data-project'));
  });
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      lastCard = card;
      openModal(card.getAttribute('data-project'));
    }
  });
});

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', function (e) {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

function trapFocus(el) {
  var selectors = 'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
  var focusable = el.querySelectorAll(selectors);
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  el.addEventListener('keydown', handler);
  el._trapHandler = handler;
}

function releaseFocus(el) {
  if (el._trapHandler) { el.removeEventListener('keydown', el._trapHandler); el._trapHandler = null; }
}
})();
