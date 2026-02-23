// authFetch.js
const originalFetch = window.fetch;

window.fetch = function (url, options = {}) {
  return originalFetch(url, {
    credentials: "include",
    ...options
  });
};
