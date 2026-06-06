/** 迷你 markdown → HTML 渲染器,从设计原型 panels2.jsx 移植(零依赖)。
 *  **先 escHtml 再渲染**,故输出可安全用于 dangerouslySetInnerHTML;输入为 agent/用户
 *  的消息文本。输出类名严格对齐 styles.css 的 .md-*,保证与原型像素一致。
 *
 *  转义策略:块级结构(blockquote `>`、heading `#`、list `-`/`1.`)需在**原始**文本上
 *  识别,故不预转义整串;改为在每个分支对抽取出的内容段先 escHtml 再 mdInline,既保留
 *  块级解析,又保证每段用户内容先转义后才进 HTML。lines[i] / 正则捕获组在
 *  noUncheckedIndexedAccess 下为 string | undefined,用 `?? ""` / 解构默认值收敛。 */

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
}

export function mdToHtml(src: string): string {
  const lines = (src || "").split("\n");
  let out = "";
  let i = 0;
  let list: "ul" | "ol" | null = null;
  const closeL = () => {
    if (list) {
      out += `</${list}>`;
      list = null;
    }
  };
  while (i < lines.length) {
    const ln = lines[i] ?? "";
    if (/^```/.test(ln.trim())) {
      closeL();
      i++;
      let code = "";
      while (i < lines.length && !/^```/.test((lines[i] ?? "").trim())) {
        code += `${lines[i] ?? ""}\n`;
        i++;
      }
      i++;
      out += `<pre class="md-pre"><code>${escHtml(code.replace(/\n$/, ""))}</code></pre>`;
      continue;
    }
    const hm = ln.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      closeL();
      const [, hashes = "", body = ""] = hm;
      out += `<div class="md-h md-h${hashes.length}">${mdInline(escHtml(body))}</div>`;
      i++;
      continue;
    }
    if (/^---+$/.test(ln.trim())) {
      closeL();
      out += '<hr class="md-hr">';
      i++;
      continue;
    }
    if (/^>\s?/.test(ln)) {
      closeL();
      out += `<blockquote class="md-bq">${mdInline(escHtml(ln.replace(/^>\s?/, "")))}</blockquote>`;
      i++;
      continue;
    }
    const um = ln.match(/^[-*]\s+(.*)$/);
    if (um) {
      if (list !== "ul") {
        closeL();
        out += '<ul class="md-ul">';
        list = "ul";
      }
      const [, item = ""] = um;
      out += `<li>${mdInline(escHtml(item))}</li>`;
      i++;
      continue;
    }
    const om = ln.match(/^(\d+)\.\s+(.*)$/);
    if (om) {
      if (list !== "ol") {
        closeL();
        out += '<ol class="md-ol">';
        list = "ol";
      }
      const [, , body = ""] = om;
      out += `<li>${mdInline(escHtml(body))}</li>`;
      i++;
      continue;
    }
    if (ln.trim() === "") {
      closeL();
      i++;
      continue;
    }
    closeL();
    out += `<p class="md-p">${mdInline(escHtml(ln))}</p>`;
    i++;
  }
  closeL();
  return out;
}
