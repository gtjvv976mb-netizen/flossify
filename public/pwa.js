// Registers the service worker and keeps the install hook for the workspace.
// Loaded deferred by the Clinic layout. Says nothing to the console: the page
// works exactly the same when none of this is supported.
(function () {
  if (!('serviceWorker' in navigator)) return;
  var path = location.pathname;
  // The sample client sites are a deliverable, not Flossify; leave them alone.
  if (path.indexOf('/samples/') === 0) return;

  navigator.serviceWorker.register('/sw.js').catch(function () {
    /* no worker, no harm: the page is already on screen */
  });

  // On a workspace page, a [data-install] element (hidden until now) becomes
  // the way to put Flossify on the device. No such element yet: nothing shows.
  if (path.indexOf('/c/') !== 0) return;
  var pending = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    var el = document.querySelector('[data-install]');
    if (!el) return;
    e.preventDefault();
    pending = e;
    if (!el.textContent.trim()) el.textContent = 'Install Flossify on this device';
    el.hidden = false;
    el.addEventListener('click', function () {
      if (!pending) return;
      var prompt = pending;
      pending = null;
      prompt.prompt();
      prompt.userChoice.then(function () {
        el.hidden = true;
      }, function () {
        el.hidden = true;
      });
    }, { once: true });
  });

  window.addEventListener('appinstalled', function () {
    pending = null;
    var el = document.querySelector('[data-install]');
    if (el) el.hidden = true;
  });
})();
