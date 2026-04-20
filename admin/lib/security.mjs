import crypto from "node:crypto";
import cookie from "cookie";
import {
  cookieSecure,
  maxLoginFailures,
  lockoutMs,
  sessionCookieName,
  sessionTtlMs,
} from "./config.mjs";

function now() {
  return Date.now();
}

export function getClientIp(req) {
  const headerIp =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"];

  if (typeof headerIp === "string" && headerIp.length > 0) {
    return headerIp.split(",")[0].trim();
  }

  return req.socket.remoteAddress ?? "unknown";
}

export function getAttemptKey(ip, username) {
  return `${ip}::${username}`;
}

export function getLockStatus(securityStore, ip, username) {
  const state = securityStore.read();
  const key = getAttemptKey(ip, username);
  const entry = state[key];

  if (!entry?.lockedUntil) {
    return null;
  }

  if (entry.lockedUntil <= now()) {
    delete state[key];
    securityStore.write(state);
    return null;
  }

  return {
    lockedUntil: entry.lockedUntil,
    remainingMs: entry.lockedUntil - now(),
  };
}

export function recordLoginFailure(securityStore, ip, username) {
  const state = securityStore.read();
  const key = getAttemptKey(ip, username);
  const current = state[key] ?? { count: 0, lockedUntil: null };
  current.count += 1;
  current.lastFailureAt = now();

  if (current.count >= maxLoginFailures) {
    current.lockedUntil = now() + lockoutMs;
  }

  state[key] = current;
  securityStore.write(state);

  return current;
}

export function clearLoginFailures(securityStore, ip, username) {
  const state = securityStore.read();
  const key = getAttemptKey(ip, username);
  if (state[key]) {
    delete state[key];
    securityStore.write(state);
  }
}

export function createSession(sessionsStore, username) {
  const sessions = sessionsStore.read();
  const token = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(24).toString("hex");
  sessions[token] = {
    username,
    csrfToken,
    expiresAt: now() + sessionTtlMs,
    createdAt: now(),
  };
  sessionsStore.write(sessions);
  return { token, csrfToken };
}

export function destroySession(sessionsStore, token) {
  const sessions = sessionsStore.read();
  if (sessions[token]) {
    delete sessions[token];
    sessionsStore.write(sessions);
  }
}

export function getSessionFromRequest(req, sessionsStore) {
  const parsed = cookie.parse(req.headers.cookie ?? "");
  const token = parsed[sessionCookieName];
  if (!token) {
    return null;
  }

  const sessions = sessionsStore.read();
  const session = sessions[token];
  if (!session) {
    return null;
  }

  if (session.expiresAt <= now()) {
    delete sessions[token];
    sessionsStore.write(sessions);
    return null;
  }

  return { token, ...session };
}

export function buildSessionCookie(token) {
  return cookie.serialize(sessionCookieName, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: sessionTtlMs / 1000,
  });
}

export function buildExpiredSessionCookie() {
  return cookie.serialize(sessionCookieName, "", {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
