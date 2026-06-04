import { expect, test } from "bun:test";
import { parseScutilProxy, resolveProxyEnv } from "./proxy";

const SCUTIL_BOTH = `<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7897
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7897
  HTTPSProxy : 127.0.0.1
  ProxyAutoConfigEnable : 0
  SOCKSEnable : 1
  SOCKSPort : 7897
  SOCKSProxy : 127.0.0.1
}`;

const SCUTIL_DISABLED = `<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 0
  ProxyAutoConfigEnable : 0
}`;

test("parseScutilProxy: 启用的 HTTP/HTTPS 代理拼成 http://host:port", () => {
  expect(parseScutilProxy(SCUTIL_BOTH)).toEqual({
    http: "http://127.0.0.1:7897",
    https: "http://127.0.0.1:7897",
  });
});

test("parseScutilProxy: 未启用 → 空", () => {
  expect(parseScutilProxy(SCUTIL_DISABLED)).toEqual({});
  expect(parseScutilProxy("")).toEqual({});
});

test("parseScutilProxy: Enable=1 但缺 host/port → 不产出该项", () => {
  expect(
    parseScutilProxy(`<dictionary> {
  HTTPSEnable : 1
  HTTPSPort : 7897
}`),
  ).toEqual({});
});

test("parseScutilProxy: 只启用 HTTPS", () => {
  expect(
    parseScutilProxy(`<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 1
  HTTPSProxy : 10.0.0.2
  HTTPSPort : 1080
}`),
  ).toEqual({ https: "http://10.0.0.2:1080" });
});

test("resolveProxyEnv: 环境已有 HTTPS_PROXY → 不覆盖(返回空)", () => {
  const out = resolveProxyEnv({ HTTPS_PROXY: "http://already:1" }, () => ({
    http: "http://sys:2",
    https: "http://sys:2",
  }));
  expect(out).toEqual({});
});

test("resolveProxyEnv: 环境已有小写 http_proxy → 不覆盖", () => {
  const out = resolveProxyEnv({ http_proxy: "http://already:1" }, () => ({
    https: "http://sys:2",
  }));
  expect(out).toEqual({});
});

test("resolveProxyEnv: 环境无代理 → 从系统代理注入大写 + 小写 + NO_PROXY", () => {
  const out = resolveProxyEnv({}, () => ({
    http: "http://127.0.0.1:7897",
    https: "http://127.0.0.1:7897",
  }));
  expect(out.HTTP_PROXY).toBe("http://127.0.0.1:7897");
  expect(out.HTTPS_PROXY).toBe("http://127.0.0.1:7897");
  expect(out.http_proxy).toBe("http://127.0.0.1:7897");
  expect(out.https_proxy).toBe("http://127.0.0.1:7897");
  expect(out.NO_PROXY).toContain("127.0.0.1");
  expect(out.NO_PROXY).toContain("localhost");
});

test("resolveProxyEnv: 只有 https 系统代理 → http 项回落 https 值", () => {
  const out = resolveProxyEnv({}, () => ({ https: "http://sys:2" }));
  expect(out.HTTP_PROXY).toBe("http://sys:2");
  expect(out.HTTPS_PROXY).toBe("http://sys:2");
});

test("resolveProxyEnv: 环境无代理且系统也无代理 → 空", () => {
  expect(resolveProxyEnv({}, () => ({}))).toEqual({});
});
