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
