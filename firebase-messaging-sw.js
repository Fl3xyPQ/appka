// firebase-messaging-sw.js
// Handles background push notifications from Firebase Cloud Messaging.
// This file must be at the root of your site.

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Import config — since this is a service worker we inline the values.
// After setting up firebase-config.js, copy your values here too.
firebase.initializeApp({
  apiKey:            "AIzaSyBtqcqUeWtZlf3jaQteXJOFSuL7a2FMTeg",
  authDomain:        "ours-bd76c.firebaseapp.com",
  projectId:         "ours-bd76c",
  storageBucket:     "ours-bd76c.firebasestorage.app",
  messagingSenderId: "350322585766",
  appId:             "1:350322585766:web:e203b22e1aa053dc518467",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title = 'ours.', body = '' } = payload.notification ?? {};
  self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: payload.data,
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
