import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

let app: FirebaseApp | null = null;
let db: Database | null = null;

export function getFirebaseDb(): Database | null {
  if (db) return db;

  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;

  if (!apiKey || !databaseURL) {
    console.warn('[Firebase] 未配置 VITE_FIREBASE_API_KEY 或 VITE_FIREBASE_DATABASE_URL，实时多人在线功能不可用');
    return null;
  }

  try {
    app = initializeApp({
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
      databaseURL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || undefined,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || undefined,
    });
    db = getDatabase(app);
    return db;
  } catch (e) {
    console.error('[Firebase] 初始化失败:', e);
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  return !!(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_DATABASE_URL);
}
