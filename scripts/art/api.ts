import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const GEN_URL = "https://api.openai.com/v1/images/generations";
const EDIT_URL = "https://api.openai.com/v1/images/edits";

/** 生成图落在原型副本的 themes 目录(本地预览;prototype/ 已 gitignore)。 */
export function targetPath(theme: string, asset: string): string {
  return `prototype/project/public/assets/themes/${theme}/${asset}.png`;
}

export interface GenRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** 纯文生图请求(generations)。透明底;size 角色用 "1024x1536" 竖图、其余 "1024x1024"。 */
export function buildGenRequest(
  prompt: string,
  apiKey: string,
  size = "1024x1024",
): GenRequest {
  return {
    url: GEN_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size,
      background: "transparent",
      n: 1,
    }),
  };
}

/** 以参考图保持一致性的请求(edits,multipart)。 */
export async function buildEditRequest(
  prompt: string,
  apiKey: string,
  refPath: string,
  size = "1024x1024",
): Promise<{ url: string; headers: Record<string, string>; form: FormData }> {
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("background", "transparent");
  const refFile = Bun.file(refPath);
  form.append("image[]", new Blob([await refFile.arrayBuffer()]), "ref.png");
  return {
    url: EDIT_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
    form,
  };
}

/** 把 base64 PNG 写到 path(自动建目录)。 */
export async function decodeAndWrite(b64: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, Buffer.from(b64, "base64"));
}

function extractB64(json: unknown): string {
  const b64 = (json as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
  if (!b64) throw new Error(`no b64_json in response: ${JSON.stringify(json)}`);
  return b64;
}

/** 调用 generations,返回 b64_json。失败抛错(含响应文本)。 */
export async function callImageApi(req: GenRequest): Promise<string> {
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: req.body,
  });
  if (!res.ok) throw new Error(`images API ${res.status}: ${await res.text()}`);
  return extractB64(await res.json());
}

/** 调用 edits(参考图),返回 b64_json。 */
export async function callEditApi(req: {
  url: string;
  headers: Record<string, string>;
  form: FormData;
}): Promise<string> {
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: req.form,
  });
  if (!res.ok) throw new Error(`edits API ${res.status}: ${await res.text()}`);
  return extractB64(await res.json());
}
