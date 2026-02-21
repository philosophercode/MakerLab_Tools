import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock "server-only" so importing the module doesn't throw in test env
vi.mock("server-only", () => ({}));

import { rateLimit, getClientIp } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Use unique keys per test to avoid cross-test pollution
  });

  it("allows requests within the limit", () => {
    const key = "test:allow:" + Math.random();
    const result = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("tracks remaining count correctly", () => {
    const key = "test:track:" + Math.random();
    const opts = { limit: 3, windowMs: 60_000 };

    const r1 = rateLimit(key, opts);
    expect(r1).toEqual({ allowed: true, remaining: 2 });

    const r2 = rateLimit(key, opts);
    expect(r2).toEqual({ allowed: true, remaining: 1 });

    const r3 = rateLimit(key, opts);
    expect(r3).toEqual({ allowed: true, remaining: 0 });
  });

  it("rejects requests over the limit", () => {
    const key = "test:reject:" + Math.random();
    const opts = { limit: 2, windowMs: 60_000 };

    rateLimit(key, opts);
    rateLimit(key, opts);
    const r3 = rateLimit(key, opts);

    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    const key = "test:reset:" + Math.random();
    const opts = { limit: 1, windowMs: 1000 };

    rateLimit(key, opts);
    const over = rateLimit(key, opts);
    expect(over.allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1100);

    const fresh = rateLimit(key, opts);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(0);

    vi.useRealTimers();
  });

  it("isolates different keys", () => {
    const keyA = "test:isolateA:" + Math.random();
    const keyB = "test:isolateB:" + Math.random();
    const opts = { limit: 1, windowMs: 60_000 };

    rateLimit(keyA, opts);
    const rA = rateLimit(keyA, opts);
    expect(rA.allowed).toBe(false);

    const rB = rateLimit(keyB, opts);
    expect(rB.allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it("trims whitespace from forwarded IP", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  203.0.113.5  " },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "10.0.0.5" },
    });
    expect(getClientIp(req)).toBe("10.0.0.5");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "5.6.7.8",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});
