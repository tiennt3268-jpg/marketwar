// Local accounts for the browser build. Passwords are salted and hashed (SHA-256) before storage.
// This gates access on a shared machine; it is not a substitute for server-side authentication.
import { hashString } from '../engine/rng';

const ACCOUNTS_KEY = 'marketwars:accounts';
const SESSION_KEY = 'marketwars:session';

export type Role = 'admin' | 'player';
interface Account { salt: string; hash: string; createdAt: string; role?: Role }
export interface User { username: string; role: Role }

// Built-in Game Master account. Only the salted hash is shipped, never the password.
const ADMINS: Record<string, Account> = {
  tiennt: {
    salt: '49c2cecec652e12505017f8b2f85577a',
    hash: '0300d5bd66b0178abcbf2cc963b56b005a25e7cf80e0e2b1f249ca0543146f0a',
    createdAt: '2026-10-08T00:00:00.000Z',
    role: 'admin',
  },
};

let memoryAccounts: Record<string, Account> = {};
let memorySession: string | null = null;

function readAccounts(): Record<string, Account> {
  let stored: Record<string, Account> = memoryAccounts;
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) stored = JSON.parse(raw) as Record<string, Account>;
  } catch { /* memory only */ }
  return { ...stored, ...ADMINS };
}

function writeAccounts(a: Record<string, Account>) {
  const players = Object.fromEntries(Object.entries(a).filter(([k]) => !ADMINS[k]));
  memoryAccounts = players;
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(players)); } catch { /* memory only */ }
}

async function digest(password: string, salt: string): Promise<string> {
  const text = `${salt}:${password}`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return hashString(text, 7).toString(16) + hashString(text, 13).toString(16);
  }
}

function newSalt(): string {
  try {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

const normalise = (u: string) => u.trim().toLowerCase();
const toUser = (name: string, acc: Account): User => ({ username: name, role: acc.role ?? 'player' });

export function validateUsername(u: string): string | null {
  const n = normalise(u);
  if (n.length < 3) return 'Username must be at least 3 characters';
  if (!/^[a-z0-9._-]+$/.test(n)) return 'Use letters, digits, dot, dash or underscore only';
  return null;
}

export async function register(username: string, password: string): Promise<User> {
  const err = validateUsername(username);
  if (err) throw new Error(err);
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  const n = normalise(username);
  const accounts = readAccounts();
  if (accounts[n]) throw new Error('This username is already taken');
  const salt = newSalt();
  accounts[n] = { salt, hash: await digest(password, salt), createdAt: new Date().toISOString(), role: 'player' };
  writeAccounts(accounts);
  setSession(n);
  return toUser(n, accounts[n]);
}

export async function login(username: string, password: string): Promise<User> {
  const n = normalise(username);
  const acc = readAccounts()[n];
  if (!acc || (await digest(password, acc.salt)) !== acc.hash) throw new Error('Incorrect username or password');
  setSession(n);
  return toUser(n, acc);
}

function setSession(u: string | null) {
  memorySession = u;
  try {
    if (u) sessionStorage.setItem(SESSION_KEY, u);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* memory only */ }
}

export function currentUser(): User | null {
  let name: string | null = memorySession;
  try { name = sessionStorage.getItem(SESSION_KEY) ?? name; } catch { /* memory only */ }
  if (!name) return null;
  const acc = readAccounts()[name];
  return acc ? toUser(name, acc) : null;
}

export function logout() {
  setSession(null);
}
