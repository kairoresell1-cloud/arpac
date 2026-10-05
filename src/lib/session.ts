import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "arpac_session";
const secretKey = () =>
  new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-cambia-in-produzione");

export async function createSessionCookie(memberId: string) {
  const token = await new SignJWT({ memberId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

/**
 * Risolve SEMPRE l'utente attivo dal cookie di sessione della richiesta
 * corrente. Non esiste e non deve mai esistere un fallback su un "utente
 * owner" statico: in modalità multi-utente senza Supabase questo causerebbe
 * all'onboarding di un membro la sovrascrittura del profilo di un altro.
 */
export async function getActiveMemberId(): Promise<string | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return (payload.memberId as string) ?? null;
  } catch {
    return null;
  }
}
