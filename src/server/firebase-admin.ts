import 'server-only';
import * as admin from 'firebase-admin';
import { firebaseConfig } from '@/lib/firebase';

function credential() {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (key) {
    try {
      return admin.credential.cert(JSON.parse(key));
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY inválida:', e);
    }
  }
  return admin.credential.applicationDefault();
}

/** Firebase Admin (só no servidor). Escreve o plano e os pagamentos, que o cliente só pode ler. */
export function adminApp() {
  if (admin.apps.length === 0) admin.initializeApp({ credential: credential(), projectId: firebaseConfig.projectId });
  return admin;
}

export const adminDb = () => adminApp().firestore();

/** Utilizador autenticado pelo token do Firebase (cabeçalho Authorization: Bearer …). */
export async function verifyUser(req: Request): Promise<{ uid: string; email?: string } | null> {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const d = await adminApp().auth().verifyIdToken(h.slice(7));
    return { uid: d.uid, email: d.email };
  } catch {
    return null;
  }
}
