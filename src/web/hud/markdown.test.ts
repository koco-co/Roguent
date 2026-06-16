import { expect, test } from "bun:test";
import { mdToHtml } from "./markdown";

test("renders plain paragraph", () => {
  expect(mdToHtml("hello world")).toBe('<p class="md-p">hello world</p>');
});

test("renders bold and inline code", () => {
  expect(mdToHtml("**bold** and `code`")).toBe(
    '<p class="md-p"><strong>bold</strong> and <code class="md-code">code</code></p>',
  );
});

test("renders headings h1 and h4 with level class", () => {
  expect(mdToHtml("# A")).toBe('<div class="md-h md-h1">A</div>');
  expect(mdToHtml("#### D")).toBe('<div class="md-h md-h4">D</div>');
});

test("renders unordered list under one ul wrapper", () => {
  expect(mdToHtml("- a\n- b")).toBe(
    '<ul class="md-ul"><li>a</li><li>b</li></ul>',
  );
});

test("renders ordered list under one ol wrapper", () => {
  expect(mdToHtml("1. a\n2. b")).toBe(
    '<ol class="md-ol"><li>a</li><li>b</li></ol>',
  );
});

test("renders fenced code block, escaping html inside", () => {
  expect(mdToHtml("```\nconst x = a < b;\n```")).toBe(
    '<div class="md-codeblock"><button type="button" class="md-codecopy" data-code="const x = a &lt; b;" aria-label="复制代码" title="复制代码">⎘</button><pre class="md-pre"><code>const x = a &lt; b;</code></pre></div>',
  );
});

test("escapes fenced code copied data attribute", () => {
  expect(mdToHtml('```\nconst q = "x";\n```')).toBe(
    '<div class="md-codeblock"><button type="button" class="md-codecopy" data-code="const q = &quot;x&quot;;" aria-label="复制代码" title="复制代码">⎘</button><pre class="md-pre"><code>const q = "x";</code></pre></div>',
  );
});

test("renders blockquote", () => {
  expect(mdToHtml("> quoted")).toBe(
    '<blockquote class="md-bq">quoted</blockquote>',
  );
});

test("renders horizontal rule", () => {
  expect(mdToHtml("---")).toBe('<hr class="md-hr">');
});

test("renders link with target/rel hardening", () => {
  expect(mdToHtml("[t](https://x.dev)")).toBe(
    '<p class="md-p"><a href="https://x.dev" target="_blank" rel="noopener">t</a></p>',
  );
});

test("escapes raw html to prevent injection", () => {
  expect(mdToHtml("<img src=x onerror=alert(1)>")).toBe(
    '<p class="md-p">&lt;img src=x onerror=alert(1)&gt;</p>',
  );
});

test("returns empty string for empty input", () => {
  expect(mdToHtml("")).toBe("");
});

test("strips javascript: scheme links to plain text", () => {
  // URL regex [^)\s]+ stops at the first ')'; the trailing ')' leaks into text.
  expect(mdToHtml("[x](javascript:alert(1))")).toBe('<p class="md-p">x)</p>');
});

test("strips data: and vbscript: scheme links to plain text", () => {
  expect(mdToHtml("[a](data:text/html,x)")).toBe('<p class="md-p">a</p>');
  expect(mdToHtml("[b](vbscript:msgbox)")).toBe('<p class="md-p">b</p>');
});

test("keeps safe http/https links", () => {
  expect(mdToHtml("[t](https://x.dev)")).toBe(
    '<p class="md-p"><a href="https://x.dev" target="_blank" rel="noopener">t</a></p>',
  );
});

test("escapes double quotes in href to block attribute injection", () => {
  // 含 " 的 url 不得逃出 href 边界注入事件处理属性(XSS via attribute injection)。
  // url 正则 [^)\s]+ 在空格处停下,故攻击载荷用无空格的引号闭合形式。
  expect(mdToHtml('[click](https://evil.com"onmouseover="alert(1))')).toBe(
    '<p class="md-p"><a href="https://evil.com%22onmouseover=%22alert(1" target="_blank" rel="noopener">click</a>)</p>',
  );
});

// ── GFM 表格 ──────────────────────────────────────────────────────────────
test("renders GFM pipe table as table/thead/tbody", () => {
  expect(mdToHtml("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(
    '<table class="md-table"><thead><tr><th>a</th><th>b</th></tr></thead>' +
      "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
  );
});

test("table accepts alignment colons in separator row", () => {
  expect(mdToHtml("| x | y |\n| :-- | --: |\n| p | q |")).toBe(
    '<table class="md-table"><thead><tr><th>x</th><th>y</th></tr></thead>' +
      "<tbody><tr><td>p</td><td>q</td></tr></tbody></table>",
  );
});

test("table renders inline markdown inside cells", () => {
  expect(mdToHtml("| **h** |\n| --- |\n| `c` |")).toBe(
    '<table class="md-table"><thead><tr><th><strong>h</strong></th></tr></thead>' +
      '<tbody><tr><td><code class="md-code">c</code></td></tr></tbody></table>',
  );
});

test("table escapes html in cells (no injection)", () => {
  expect(mdToHtml('| <script>x</script> |\n| --- |\n| a & b "q" |')).toBe(
    '<table class="md-table"><thead><tr><th>&lt;script&gt;x&lt;/script&gt;</th></tr></thead>' +
      '<tbody><tr><td>a &amp; b "q"</td></tr></tbody></table>',
  );
});

test("pipe line without separator row is NOT a table", () => {
  expect(mdToHtml("| a | b |")).toBe('<p class="md-p">| a | b |</p>');
});

// ── 任务清单 ──────────────────────────────────────────────────────────────
test("renders task list with disabled unchecked checkbox", () => {
  expect(mdToHtml("- [ ] todo")).toBe(
    '<ul class="md-ul"><li class="md-task"><input type="checkbox" disabled>todo</li></ul>',
  );
});

test("renders task list with disabled checked checkbox (x and X)", () => {
  expect(mdToHtml("- [x] done\n- [X] also")).toBe(
    '<ul class="md-ul">' +
      '<li class="md-task"><input type="checkbox" disabled checked>done</li>' +
      '<li class="md-task"><input type="checkbox" disabled checked>also</li>' +
      "</ul>",
  );
});

test("task list item escapes html in remaining text", () => {
  expect(mdToHtml("- [ ] <b>x</b>")).toBe(
    '<ul class="md-ul"><li class="md-task"><input type="checkbox" disabled>&lt;b&gt;x&lt;/b&gt;</li></ul>',
  );
});

// ── 删除线 ────────────────────────────────────────────────────────────────
test("renders strikethrough with del element", () => {
  expect(mdToHtml("~~gone~~")).toBe('<p class="md-p"><del>gone</del></p>');
});

test("strikethrough escapes inner html", () => {
  expect(mdToHtml("~~<i>x</i>~~")).toBe(
    '<p class="md-p"><del>&lt;i&gt;x&lt;/i&gt;</del></p>',
  );
});

// ── 图片 ──────────────────────────────────────────────────────────────────
test("renders https image with src and alt", () => {
  expect(mdToHtml("![cat](https://x.dev/c.png)")).toBe(
    '<p class="md-p"><img class="md-img" src="https://x.dev/c.png" alt="cat"></p>',
  );
});

test("renders data:image/* image", () => {
  expect(mdToHtml("![p](data:image/png;base64,AAAA)")).toBe(
    '<p class="md-p"><img class="md-img" src="data:image/png;base64,AAAA" alt="p"></p>',
  );
});

test("image with javascript: url DEGRADES to alt text (no img tag)", () => {
  const html = mdToHtml("![x](javascript:alert(1))");
  expect(html).not.toContain("<img");
  // url 正则 [^)\s]+ 在首个 ) 处停下,尾随 ) 泄漏进文本(与链接同款)。
  expect(html).toBe('<p class="md-p">x)</p>');
});

test("image with data:text/html url is REJECTED (only data:image/* allowed)", () => {
  const html = mdToHtml("![y](data:text/html,<script>alert(1)</script>)");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("data:text/html");
});

test("image escapes quotes in alt and url attributes", () => {
  // alt 里的 " 与 url 里的 " 都不得逃出属性边界。
  // url 正则 [^)\s]+ 吃到首个 ) 前,含两个 ";escAttr 全转成 &quot;,不逃出属性。
  expect(mdToHtml('![a"b](https://x.dev/i.png?q="x")')).toBe(
    '<p class="md-p"><img class="md-img" src="https://x.dev/i.png?q=&quot;x&quot;" alt="a&quot;b"></p>',
  );
});

// ── 嵌套列表 ──────────────────────────────────────────────────────────────
test("nests unordered list by 2-space indentation", () => {
  expect(mdToHtml("- a\n  - b\n- c")).toBe(
    '<ul class="md-ul"><li>a</li>' +
      '<ul class="md-ul"><li>b</li></ul>' +
      "<li>c</li></ul>",
  );
});

test("nests ordered list under unordered by indentation", () => {
  expect(mdToHtml("- a\n  1. one\n  2. two")).toBe(
    '<ul class="md-ul"><li>a</li>' +
      '<ol class="md-ol"><li>one</li><li>two</li></ol>' +
      "</ul>",
  );
});

test("tab indentation nests one level", () => {
  expect(mdToHtml("- a\n\t- b")).toBe(
    '<ul class="md-ul"><li>a</li>' + '<ul class="md-ul"><li>b</li></ul></ul>',
  );
});

// ── 围栏代码块语言 ────────────────────────────────────────────────────────
test("captures fence language into code class", () => {
  expect(mdToHtml("```ts\nconst x = 1;\n```")).toBe(
    '<div class="md-codeblock"><button type="button" class="md-codecopy" data-code="const x = 1;" aria-label="复制代码" title="复制代码">⎘</button><pre class="md-pre"><code class="language-ts">const x = 1;</code></pre></div>',
  );
});

test("fence without language keeps bare code element", () => {
  expect(mdToHtml("```\nplain\n```")).toBe(
    '<div class="md-codeblock"><button type="button" class="md-codecopy" data-code="plain" aria-label="复制代码" title="复制代码">⎘</button><pre class="md-pre"><code>plain</code></pre></div>',
  );
});

test("malicious fence language token is dropped (no class injection)", () => {
  // 语言只认 [A-Za-z0-9_+-];含引号/尖括号的伪语言不得拼进 class 属性。
  const html = mdToHtml('```ts"><img src=x onerror=alert(1)>\ncode\n```');
  expect(html).not.toContain("onerror");
  expect(html).toContain("<code>code</code>");
});

// ── 自动链接 ──────────────────────────────────────────────────────────────
test("autolinks bare http(s) url into safe anchor", () => {
  expect(mdToHtml("see https://x.dev now")).toBe(
    '<p class="md-p">see <a href="https://x.dev" target="_blank" rel="noopener">https://x.dev</a> now</p>',
  );
});

test("autolink does not double-wrap an explicit markdown link", () => {
  expect(mdToHtml("[t](https://x.dev)")).toBe(
    '<p class="md-p"><a href="https://x.dev" target="_blank" rel="noopener">t</a></p>',
  );
});

// ── 通用安全 ──────────────────────────────────────────────────────────────
test("script tag is escaped in every block context", () => {
  for (const src of [
    "<script>alert(1)</script>",
    "# <script>alert(1)</script>",
    "> <script>alert(1)</script>",
    "- <script>alert(1)</script>",
  ]) {
    const html = mdToHtml(src);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  }
});
