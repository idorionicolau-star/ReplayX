'use client';
import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export interface SessionUser {
  uid: string;
  name: string;
  email: string | null;
  photo: string | null;
  guest: boolean;
  /** O e-mail está verificado (contas Google estão). */
  emailVerified: boolean;
  /** Quando a conta foi criada (ms) — conta para o período de teste do Pro. */
  createdAt: number | null;
}

interface AuthState {
  user: SessionUser | null;
  ready: boolean;
}

const GUEST_KEY = 'rx-guest';
const GUEST_USER: SessionUser = { uid: 'guest', name: 'Convidado', email: null, photo: null, guest: true, emailVerified: false, createdAt: null };

export const useAuth = create<AuthState>(() => ({ user: null, ready: false }));

function fromFirebase(u: User): SessionUser {
  const created = u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : NaN;
  return {
    uid: u.uid,
    name: u.displayName || u.email?.split('@')[0] || 'Trader',
    email: u.email,
    photo: u.photoURL,
    guest: false,
    emailVerified: u.emailVerified,
    createdAt: Number.isFinite(created) ? created : null,
  };
}

let started = false;
export function startAuth() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const guest = localStorage.getItem(GUEST_KEY) === '1';
  try {
    getRedirectResult(auth()).catch(() => undefined);
    onAuthStateChanged(auth(), (u) => {
      if (u) {
        localStorage.removeItem(GUEST_KEY);
        useAuth.setState({ user: fromFirebase(u), ready: true });
      } else if (localStorage.getItem(GUEST_KEY) === '1') {
        useAuth.setState({ user: GUEST_USER, ready: true });
      } else useAuth.setState({ user: null, ready: true });
    });
  } catch {
    // sem Firebase (ex.: configuração inválida): permite modo convidado
    useAuth.setState({ user: guest ? GUEST_USER : null, ready: true });
  }
}

/** Mensagens de erro do Firebase em português. */
export function authError(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? '');
  const map: Record<string, string> = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'Não existe conta com este e-mail.',
    'auth/wrong-password': 'Palavra-passe incorreta.',
    'auth/invalid-credential': 'E-mail ou palavra-passe incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar".',
    'auth/weak-password': 'A palavra-passe precisa de pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiadas tentativas. Espere um pouco e tente de novo.',
    'auth/network-request-failed': 'Sem ligação à internet.',
    'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
    'auth/cancelled-popup-request': 'Pedido cancelado.',
    'auth/unauthorized-domain': `Este domínio (${typeof window !== 'undefined' ? window.location.hostname : ''}) ainda não está autorizado no Firebase. Adicione-o em Firebase Console → Authentication → Settings → Authorized domains, ou entre como convidado.`,
    'auth/operation-not-allowed': 'Este método de entrada não está ativo no Firebase (Authentication → Sign-in method).',
  };
  return map[code] ?? ((e as Error)?.message || 'Não foi possível entrar.');
}

export async function loginGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth(), provider);
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? '');
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth(), provider);
      return;
    }
    throw e;
  }
}

export async function loginEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth(), email.trim(), password);
}

export async function registerEmail(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth(), email.trim(), password);
  if (name.trim()) {
    await updateProfile(cred.user, { displayName: name.trim() });
    useAuth.setState({ user: fromFirebase(cred.user) });
  }
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth(), email.trim());
}

export function enterAsGuest() {
  localStorage.setItem(GUEST_KEY, '1');
  useAuth.setState({ user: GUEST_USER, ready: true });
}

export async function logout() {
  localStorage.removeItem(GUEST_KEY);
  try {
    await signOut(auth());
  } catch {
    /* nada */
  }
  useAuth.setState({ user: null, ready: true });
}
