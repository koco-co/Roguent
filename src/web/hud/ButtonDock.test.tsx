import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createSession } from "../../shared/domain";
import type { MailboxItem } from "../../shared/events";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { ButtonDock } from "./ButtonDock";

function item(overrides: Partial<MailboxItem>): MailboxItem {
  return {
    id: "i1",
    source: "github",
    title: "CI failed",
    summary: "build failed on main",
    ts: Date.UTC(2026, 0, 2, 10),
    status: "unread",
    kind: "event",
    priority: "high",
    ...overrides,
  };
}

function seedMailbox(items: MailboxItem[]) {
  useRoomStore.setState({
    sessions: {
      s1: createSession({ id: "s1", title: "Roguent", model: "sonnet" }),
    },
    currentSessionId: "s1",
    mailbox: {
      items: Object.fromEntries(items.map((mail) => [mail.id, mail])),
      order: items.map((mail) => mail.id),
    },
  });
}

afterEach(() => {
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    connectorStatus: {},
    mailbox: { items: {}, order: [] },
  });
  useUiStore.setState({ activePanel: null });
});

// 邮箱槽未读徽标接真:status==="unread" 条数 = 徽标文本。只邮箱槽接真;board(公告)无未读概念。
test("dock mailbox slot shows unread count badge when there are unread items", () => {
  seedMailbox([
    item({ id: "u1", status: "unread" }),
    item({ id: "u2", status: "unread" }),
    item({ id: "r1", status: "read" }),
    item({ id: "a1", status: "archived" }),
  ]);

  render(<ButtonDock />);

  // 邮箱按钮(label 信箱 → tip 文本)所在的 iconbtn 内出现徽标数字 2。
  const mailButton = screen.getByText("信箱").closest("button");
  expect(mailButton).not.toBeNull();
  if (!mailButton) throw new Error("mailbox button not found");
  expect(within(mailButton).getByText("2")).toBeTruthy();
});

test("dock mailbox slot renders no badge when there are no unread items", () => {
  seedMailbox([
    item({ id: "r1", status: "read" }),
    item({ id: "a1", status: "archived" }),
  ]);

  render(<ButtonDock />);

  const mailButton = screen.getByText("信箱").closest("button");
  expect(mailButton).not.toBeNull();
  if (!mailButton) throw new Error("mailbox button not found");
  // 无未读 → iconbtn 内不应有 .badge 角标。
  expect(mailButton.querySelector(".badge")).toBeNull();
});

test("dock board slot never renders an unread badge (no 'unread' concept)", () => {
  seedMailbox([item({ id: "u1", status: "unread" })]);

  render(<ButtonDock />);

  const boardButton = screen.getByText("公告").closest("button");
  expect(boardButton).not.toBeNull();
  if (!boardButton) throw new Error("board button not found");
  expect(boardButton.querySelector(".badge")).toBeNull();
});
