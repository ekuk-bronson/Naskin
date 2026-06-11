/**
 * auth.ts — persistent auth state backed by the same SQLite DB.
 *
 * SETUP — Google OAuth client IDs:
 *   1. Go to https://console.cloud.google.com → APIs & Services → Credentials
 *   2. Create "OAuth 2.0 Client IDs" for:
 *        • Web (needed for Expo Go dev)  → add redirect URI: https://auth.expo.io/@your-expo-username/FreeSkinApp
 *        • Android                       → SHA-1 from `npx expo credentials:manager`
 *        • iOS                           → Bundle ID from app.json
 *   3. Create a file called  .env  in the project root:
 *
 *        EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=xxxx.apps.googleusercontent.com
 *        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
 *        EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=xxxx.apps.googleusercontent.com
 *        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxxx.apps.googleusercontent.com
 *
 *   4. Restart the Metro bundler.
 */

import { db } from './storage';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

/** Read the persisted user from SQLite (runs synchronously on startup). */
export function getStoredUser(): User | null {
  try {
    const row = db.getFirstSync<{
      id: string;
      email: string;
      name: string;
      avatar_url: string;
    }>('SELECT id, email, name, avatar_url FROM users LIMIT 1');
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url || undefined,
    };
  } catch {
    return null;
  }
}

/** Persist (or replace) the signed-in user. */
export function storeUser(user: User): void {
  db.runSync(
    `INSERT OR REPLACE INTO users (id, email, name, avatar_url)
     VALUES (?, ?, ?, ?)`,
    [user.id, user.email, user.name, user.avatarUrl ?? ''],
  );
}

/** Remove all user records (sign out). */
export function removeUser(): void {
  db.execSync('DELETE FROM users');
}

/** Google OAuth client IDs — read from EXPO_PUBLIC_* env vars at build time. */
export const GOOGLE_CLIENT_IDS = {
  expoClientId:
    process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID ?? '',
  webClientId:
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  androidClientId:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  iosClientId:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
} as const;
