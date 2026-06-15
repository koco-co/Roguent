import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRoomStore } from "../../store";
import { AnnouncementPopup } from "./AnnouncementPopup";

afterEach(() => {
  cleanup();
  useRoomStore.setState({
    achievements: {},
    ledger: { entries: [], balances: {} },
    mailbox: { items: {}, order: [] },
    settings: null,
  });
});

test("settings hydration alone does not render a visual announcement", () => {
  useRoomStore.setState({
    settings: { metadata: { source: "settings-load" } },
  });

  render(<AnnouncementPopup />);

  expect(screen.queryByText("Settings loaded")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

test("urgent mailbox items still render a styled announcement", async () => {
  useRoomStore.setState({
    mailbox: {
      items: {
        urgent: {
          id: "urgent",
          source: "github",
          title: "CI failed",
          summary: "build failed",
          ts: Date.now(),
          status: "unread",
          priority: "high",
        },
      },
      order: ["urgent"],
    },
  });

  render(<AnnouncementPopup />);

  await waitFor(() => {
    expect(screen.getByRole("status").className).toContain(
      "announcement-popup",
    );
  });
  expect(screen.getByText("ALERT")).toBeTruthy();
  expect(screen.getByText("CI failed")).toBeTruthy();
});
