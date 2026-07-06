(function registerPumpRServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function onLoad() {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(function ignoreServiceWorkerError() {});
  });
})();
