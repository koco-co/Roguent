import { describe, expect, it } from "bun:test";
import { buildGenRequest, decodeAndWrite, targetPath } from "./api";

describe("art api", () => {
  it("targetPath 落在 prototype 副本的 themes 目录", () => {
    expect(targetPath("cyber", "knight_m")).toBe(
      "prototype/project/public/assets/themes/cyber/knight_m.png",
    );
  });

  it("buildGenRequest 指向 generations、gpt-image-1、透明底、默认 1024 方图", () => {
    const r = buildGenRequest("a prompt", "sk-test");
    expect(r.url).toContain("/v1/images/generations");
    expect(r.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(r.body);
    expect(body.model).toBe("gpt-image-1");
    expect(body.prompt).toBe("a prompt");
    expect(body.background).toBe("transparent");
    expect(body.size).toBe("1024x1024");
  });

  it("buildGenRequest 接受竖图尺寸(角色用)", () => {
    const body = JSON.parse(buildGenRequest("p", "k", "1024x1536").body);
    expect(body.size).toBe("1024x1536");
  });

  it("decodeAndWrite 把 b64 写成文件", async () => {
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const path = `/tmp/roguent-art-test-${Date.now()}.png`;
    await decodeAndWrite(b64, path);
    const f = Bun.file(path);
    expect(await f.exists()).toBe(true);
    expect((await f.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
