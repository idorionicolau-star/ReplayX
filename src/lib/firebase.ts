import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Configuração pública do Firebase (não é segredo: identifica o projeto no navegador).
 * Usa o mesmo projeto do MajorDocs por omissão; pode ser trocado com variáveis NEXT_PUBLIC_FIREBASE_*.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyB4HFV5VZ9FU3vQ3bu04KV_sHhioECJqNo',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'atrevamoneytracker.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'atrevamoneytracker',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'atrevamoneytracker.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '882443102074',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:882443102074:web:17ba3de56b34350bd718c3',
};

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function auth(): Auth {
  return getAuth(firebaseApp());
}

export function db(): Firestore {
  return getFirestore(firebaseApp());
}
