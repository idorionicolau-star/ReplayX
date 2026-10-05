import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Configuração pública do Firebase (não é segredo: identifica o projeto no navegador).
 * Projeto próprio do ReplayX; pode ser trocado com variáveis NEXT_PUBLIC_FIREBASE_*.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCkjdIsl1Txk-jC-7aIjX6wZlQJBqSkdSo',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'coffee-spark-ai-barista-e7a91.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'coffee-spark-ai-barista-e7a91',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'coffee-spark-ai-barista-e7a91.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '447542957736',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:447542957736:web:0f04bb547a2a742b0bd49d',
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
