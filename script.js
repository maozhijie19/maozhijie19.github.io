(function () {
// inject corner frames from template
(function () {
  var tpl = document.getElementById('corner-tpl');
  if (tpl) {
    document.querySelectorAll('.project-card-inner, .modal-box-inner').forEach(function (el) {
      el.insertBefore(tpl.content.cloneNode(true), el.firstChild);
    });
  }
})();

var PROJECTS = {
  Sidefy: {
    links: [
      {t:'site', u:'https://sidefyapp.com'},
      {t:'App Store', u:'https://apps.apple.com/app/id6751482006'},
      {t:'github', u:'https://github.com/sidefy-team/sidefy'}
    ]
  },
  SavePoint: {
    links: [{t:'github', u:'https://github.com/sha2kyou/Savepoint'}]
  },
  MatrixClock: {
    links: [{t:'github', u:'https://github.com/sha2kyou/MatrixClock'}]
  },
  ClaudePilot: {
    links: [{t:'github', u:'https://github.com/sha2kyou/ClaudePilot'}]
  },
  'pokemon-zsh': {
    links: [{t:'github', u:'https://github.com/sha2kyou/pokemon-zsh'}]
  },
  'Sidefy Plugins': {
    links: [{t:'github', u:'https://github.com/sha2kyou/sidefy-plugins'}]
  }
};

// modal logic
var modal = document.getElementById('project-modal');
var modalTitle = document.getElementById('modal-title');
var modalLinks = document.getElementById('modal-links');
var modalClose = document.getElementById('modal-close');
var lastCard;

function openModal(name) {
  var p = PROJECTS[name];
  if (!p) return;
  modalTitle.textContent = '❯ ' + name;

  var html = '';
  p.links.forEach(function (l) {
    html += '<a class="modal-link" href="' + l.u + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="link-label">' + l.t + '</span>' +
      '<span class="link-arrow">↗</span>' +
      '</a>';
  });
  modalLinks.innerHTML = html;

  modal.classList.add('active');
  modalClose.focus();
}

function closeModal() {
  modal.classList.remove('active');
  if (lastCard) { lastCard.focus({preventScroll:true}); lastCard = null; }
}

document.querySelectorAll('.project-card[data-project]').forEach(function (card) {
  card.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    lastCard = card;
    openModal(card.getAttribute('data-project'));
  });
});

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', function (e) {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});
})();

