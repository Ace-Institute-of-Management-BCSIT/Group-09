const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};

function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY' && firebaseConfig.projectId !== 'YOUR_FIREBASE_PROJECT_ID';
}
