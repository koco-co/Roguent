import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

afterEach(() => {
  cleanup();
});

function SmokeWidget() {
  const [started, setStarted] = useState(false);

  return (
    <section aria-label="Smoke test widget">
      <output>{started ? "Running" : "Ready"}</output>
      <button type="button" onClick={() => setStarted(true)}>
        Start run
      </button>
    </section>
  );
}

test("renders and updates a React component in the DOM", async () => {
  render(<SmokeWidget />);

  expect(screen.getByRole("status").textContent).toBe("Ready");

  await userEvent.click(screen.getByRole("button", { name: "Start run" }));

  expect(screen.getByRole("status").textContent).toBe("Running");
});
