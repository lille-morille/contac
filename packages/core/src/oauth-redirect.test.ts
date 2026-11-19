import { describe, expect, it } from "vitest";
import { checkOAuthRedirect } from "./oauth-redirect.ts";

describe("checkOAuthRedirect", () => {
  it.each([
    "https://claude.ai/api/mcp/auth_callback?code=abc",
    "http://localhost:53122/callback?code=abc",
    "http://127.0.0.1:1455/auth/callback?code=abc",
    "http://[::1]:8080/callback?code=abc",
    "cursor://anysphere.cursor-retrieval/oauth/callback?code=abc",
    "com.example.agent:/oauth2redirect?code=abc",
  ])("accepts %s", (value) => {
    expect(checkOAuthRedirect(value)).toBe(new URL(value).toString());
  });

  it.each([
    ["http://evil.example/callback?code=abc", "(http://evil.example)"],
    ["https://user:pass@claude.ai/cb", "(https://claude.ai)"],
    ["javascript:alert(1)", "(javascript:)"],
    ["data:text/html,hi", "(data:)"],
    ["file:///etc/passwd", "(file:)"],
  ])("rejects %s without echoing the query", (value, shown) => {
    expect(() => checkOAuthRedirect(value)).toThrow(shown);
    expect(() => checkOAuthRedirect(value)).not.toThrow(/code=/);
  });

  it("rejects a missing or malformed address", () => {
    expect(() => checkOAuthRedirect(undefined)).toThrow("Mangler returadresse");
    expect(() => checkOAuthRedirect("not a url")).toThrow("Ugyldig returadresse");
  });
});
