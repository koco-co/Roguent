/** 迷你 markdown → HTML 渲染器,从设计原型 panels2.jsx 移植(零依赖)。
 *  **先 escHtml 再渲染**,故输出可安全用于 dangerouslySetInnerHTML;输入为 agent/用户
 *  的消息文本。输出类名严格对齐 styles.css 的 .md-*,保证与原型像素一致。
 *
 *  转义策略:块级结构(blockquote `>`、heading `#`、list `-`/`1.`、table `|`)需在
 *  **原始**文本上识别,故不预转义整串;改为在每个分支对抽取出的内容段先 escHtml 再
 *  mdInline,既保留块级解析,又保证每段用户内容先转义后才进 HTML。lines[i] / 正则捕获组
 *  在 noUncheckedIndexedAccess 下为 string | undefined,用 `?? ""` / 解构默认值收敛。
 *
 *  XSS 收口:所有 href/src/alt 都经 escAttr,scheme 白名单挡 javascript:/data:(图片仅
 *  放行 data:image/*)/vbscript:;img 落地前先过 isSafeImgUrl,不合规降级为纯文本。 */

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

/** 链接 url 白名单:挡 javascript:/data:/vbscript: 等危险 scheme。 */
function isUnsafeLinkUrl(url: string): boolean {
  return /^\s*(javascript|data|vbscript):/i.test(url);
}

/** 图片 src 白名单:仅放行 http(s) 与 data:image/*,其余(含 data:text/html)拒绝。 */
function isSafeImgUrl(url: string): boolean {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return true;
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(u)) return true;
  return false;
}

/** 行内语法。**入参必须已 escHtml**(故此处只认转义后的安全文本,不再产生新的 < > &)。
 *  顺序敏感:图片(![...]) 要先于链接([...]) 处理,否则 alt 文本里的 ! 会被链接规则吞掉;
 *  autolink 最后做,且只在还没被包进 <a>/<img> 的裸 url 上生效(用 negative lookbehind
 *  规避属性内的 url)。 */
function mdInline(s: string): string {
  let r = s
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    // 图片:![alt](url)。scheme 不安全则降级为纯 alt 文本,不产出 <img>。
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) =>
      isSafeImgUrl(url)
        ? `<img class="md-img" src="${escAttr(url)}" alt="${escAttr(alt)}">`
        : alt,
    )
    // 链接:[text](url)。href 内的 " 用 %22(URL 编码)闭口,挡属性注入。
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) =>
      isUnsafeLinkUrl(url)
        ? text
        : `<a href="${url.replace(/"/g, "%22")}" target="_blank" rel="noopener">${text}</a>`,
    )
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // autolink 裸 http(s) url。只在前面不是 " 或 >(即不在 href="..."/标签内)时生效,
  // 避免把已渲染锚点里的 url 二次包裹。尾随标点不并入 url。
  r = r.replace(
    /(^|[^"=>])(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/g,
    (_m, pre: string, url: string) =>
      `${pre}<a href="${escAttr(url)}" target="_blank" rel="noopener">${url}</a>`,
  );
  return r;
}

/** GFM 表格分隔行:`| --- | :--: |`,每格只含 -、:、空白,至少一个 -。 */
function isTableSep(ln: string): boolean {
  const cells = splitRow(ln);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/** 按未转义的 | 拆一行表格单元;吃掉行首尾的 | 与外侧空白。 */
function splitRow(ln: string): string[] {
  return ln
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function mdToHtml(src: string): string {
  const lines = (src || "").split("\n");
  let out = "";
  let i = 0;
  // 列表栈:每层记录类型 + 缩进列宽,支持嵌套 ul/ol。
  const stack: { tag: "ul" | "ol"; indent: number }[] = [];
  const closeAll = () => {
    while (stack.length) {
      const top = stack.pop();
      if (top) out += `</${top.tag}>`;
    }
  };

  while (i < lines.length) {
    const ln = lines[i] ?? "";
    // 围栏代码块,可带语言:```ts
    const fence = ln.trim().match(/^```(.*)$/);
    if (fence) {
      closeAll();
      const [, langRaw = ""] = fence;
      const lang = langRaw.trim().split(/\s+/)[0] ?? "";
      i++;
      let code = "";
      while (i < lines.length && !/^```/.test((lines[i] ?? "").trim())) {
        code += `${lines[i] ?? ""}\n`;
        i++;
      }
      i++;
      const codeText = code.replace(/\n$/, "");
      const langClass = /^[A-Za-z0-9_+-]+$/.test(lang)
        ? ` class="language-${lang}"`
        : "";
      out += `<div class="md-codeblock"><button type="button" class="md-codecopy" data-code="${escAttr(codeText)}" aria-label="复制代码" title="复制代码">⎘</button><pre class="md-pre"><code${langClass}>${escHtml(codeText)}</code></pre></div>`;
      continue;
    }

    // GFM 表格:当前行含 |,下一行是分隔行。
    const next = lines[i + 1] ?? "";
    if (ln.includes("|") && next.includes("|") && isTableSep(next)) {
      closeAll();
      const header = splitRow(ln);
      i += 2;
      let head = "<thead><tr>";
      for (const cell of header) head += `<th>${mdInline(escHtml(cell))}</th>`;
      head += "</tr></thead>";
      let body = "<tbody>";
      while (
        i < lines.length &&
        (lines[i] ?? "").includes("|") &&
        (lines[i] ?? "").trim() !== ""
      ) {
        const cells = splitRow(lines[i] ?? "");
        body += "<tr>";
        for (const cell of cells) body += `<td>${mdInline(escHtml(cell))}</td>`;
        body += "</tr>";
        i++;
      }
      body += "</tbody>";
      out += `<table class="md-table">${head}${body}</table>`;
      continue;
    }

    const hm = ln.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      closeAll();
      const [, hashes = "", body = ""] = hm;
      out += `<div class="md-h md-h${hashes.length}">${mdInline(escHtml(body))}</div>`;
      i++;
      continue;
    }
    if (/^---+$/.test(ln.trim())) {
      closeAll();
      out += '<hr class="md-hr">';
      i++;
      continue;
    }
    if (/^>\s?/.test(ln)) {
      closeAll();
      out += `<blockquote class="md-bq">${mdInline(escHtml(ln.replace(/^>\s?/, "")))}</blockquote>`;
      i++;
      continue;
    }

    // 列表项:抓缩进(tab 记 2 列)、标记类型、内容;支持任务清单与嵌套。
    const lm = ln.match(/^([ \t]*)([-*]|\d+\.)\s+(.*)$/);
    if (lm) {
      const [, indentRaw = "", marker = "", rest = ""] = lm;
      const indent = indentRaw.replace(/\t/g, "  ").length;
      const tag: "ul" | "ol" = /\d/.test(marker) ? "ol" : "ul";
      // 收掉比当前更深的层。
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top && top.indent > indent) {
          stack.pop();
          out += `</${top.tag}>`;
        } else break;
      }
      const top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        // 进入更深一层。
        const cls = tag === "ul" ? "md-ul" : "md-ol";
        out += `<${tag} class="${cls}">`;
        stack.push({ tag, indent });
      } else if (top.tag !== tag) {
        // 同层但类型变了:换容器。
        stack.pop();
        out += `</${top.tag}>`;
        const cls = tag === "ul" ? "md-ul" : "md-ol";
        out += `<${tag} class="${cls}">`;
        stack.push({ tag, indent });
      }
      // 任务清单:- [ ] / - [x]。
      const task = rest.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        const [, mark = " ", text = ""] = task;
        const checked = mark.toLowerCase() === "x" ? " checked" : "";
        out += `<li class="md-task"><input type="checkbox" disabled${checked}>${mdInline(escHtml(text))}</li>`;
      } else {
        out += `<li>${mdInline(escHtml(rest))}</li>`;
      }
      i++;
      continue;
    }

    if (ln.trim() === "") {
      closeAll();
      i++;
      continue;
    }
    closeAll();
    out += `<p class="md-p">${mdInline(escHtml(ln))}</p>`;
    i++;
  }
  closeAll();
  return out;
}
