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

var CACHE_KEY = 'mainpage_stars';
var CACHE_TTL = 3600000;
var cache;

try {
  cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
} catch (_) { cache = {}; }
if (cache.ttl && Date.now() > cache.ttl) cache = {};

var PROJECTS = {
  Sidefy: {
    links: [
      {t:'site', u:'https://sidefyapp.com'},
      {t:'App Store', u:'https://apps.apple.com/app/id6751482006'},
      {t:'github', u:'https://github.com/sidefy-team/sidefy'}
    ],
    repo: 'sidefy-team/sidefy', fb: 16
  },
  SavePoint: {
    links: [{t:'github', u:'https://github.com/sha2kyou/Savepoint'}],
    repo: 'sha2kyou/Savepoint', fb: 6
  },
  MatrixClock: {
    links: [{t:'github', u:'https://github.com/sha2kyou/MatrixClock'}],
    repo: 'sha2kyou/MatrixClock', fb: 6
  },
  ClaudePilot: {
    links: [{t:'github', u:'https://github.com/sha2kyou/ClaudePilot'}],
    repo: 'sha2kyou/ClaudePilot', fb: 1
  },
  'pokemon-zsh': {
    links: [{t:'github', u:'https://github.com/sha2kyou/pokemon-zsh'}],
    repo: 'sha2kyou/pokemon-zsh', fb: 2
  },
  'Sidefy Plugins': {
    links: [{t:'github', u:'https://github.com/sha2kyou/sidefy-plugins'}],
    repo: 'sha2kyou/sidefy-plugins', fb: 7
  }
};

function updateStars(name, n) {
  var el = document.querySelector('.project-card[data-project="' + name + '"] .card-stars');
  if (el) el.textContent = '★ ' + n;
}

// fetch stars for all repos
Object.keys(PROJECTS).forEach(function (name) {
  var p = PROJECTS[name];
  if (!p.repo) return;
  if (cache[p.repo]) {
    p.stars = cache[p.repo];
    updateStars(name, cache[p.repo]);
    return;
  }
  fetch('https://api.github.com/repos/' + p.repo)
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (j) {
      var n = j && j.stargazers_count;
      if (typeof n === 'number') {
        cache[p.repo] = n;
        try { cache.ttl = Date.now() + CACHE_TTL; localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
        p.stars = n;
        updateStars(name, n);
      } else {
        p.stars = p.fb;
        updateStars(name, p.fb);
      }
    })
    .catch(function () {
      p.stars = p.fb;
      updateStars(name, p.fb);
    });
});

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

