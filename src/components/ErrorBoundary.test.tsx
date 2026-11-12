import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import {
  AppErrorBoundary,
  ErrorBoundary,
  SectionErrorBoundary,
  type ErrorFallbackProps,
} from "./ErrorBoundary.tsx";

function ThrowingChild({ shouldThrow, message }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) throw new Error(message ?? "Synthetic rendering failure");
  return <p>Recovered content</p>;
}

function renderFallback({ resetErrorBoundary }: ErrorFallbackProps) {
  return <button onClick={resetErrorBoundary}>Custom retry</button>;
}

async function setLocale(code: string) {
  await act(async () => {
    await i18n.changeLanguage(code);
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await setLocale("en");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  consoleError.mockRestore();
  await setLocale("en");
});

describe("ErrorBoundary", () => {
  it("renders descendants when no error occurs", () => {
    render(
      <ErrorBoundary fallback={renderFallback}>
        <p>Healthy content</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Healthy content")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Custom retry" })).toBeNull();
  });

  it("renders the fallback and reports the original error with its component stack", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary name="test-boundary" fallback={renderFallback} onError={onError}>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("button", { name: "Custom retry" })).not.toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    const [error, info] = onError.mock.calls[0] as [unknown, { componentStack?: string }];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Synthetic rendering failure");
    expect(typeof info.componentStack).toBe("string");
    const logLabels = consoleError.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(logLabels.some((label: string) => label.includes("[ErrorBoundary: test"))).toBe(true);
  });

  it("does not expose technical error details in the fallback", () => {
    render(
      <ErrorBoundary fallback={renderFallback}>
        <ThrowingChild shouldThrow message="Secret internal detail" />
      </ErrorBoundary>,
    );

    expect(screen.queryByText(/Secret internal detail/)).toBeNull();
    expect(document.body.textContent).not.toContain("componentStack");
  });

  it("keeps unrelated content mounted when an isolated feature fails", () => {
    render(
      <div>
        <p>Unrelated application content</p>
        <SectionErrorBoundary name="library">
          <ThrowingChild shouldThrow />
        </SectionErrorBoundary>
      </div>,
    );

    expect(screen.getByText("Unrelated application content")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "This section could not be displayed" })).not.toBe(
      null,
    );
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
  });

  it("recovers through retry after the underlying problem is resolved", async () => {
    let shouldThrow = true;
    function RecoverableChild() {
      if (shouldThrow) throw new Error("Transient rendering failure");
      return <p>Recovered content</p>;
    }
    const user = userEvent.setup();
    render(
      <SectionErrorBoundary name="recoverable">
        <RecoverableChild />
      </SectionErrorBoundary>,
    );

    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered content")).not.toBeNull();
  });

  it("recovers automatically when a reset key changes", () => {
    function KeyedBoundary({ fail }: { fail: boolean }) {
      return (
        <ErrorBoundary resetKeys={[fail]} fallback={renderFallback}>
          <ThrowingChild shouldThrow={fail} />
        </ErrorBoundary>
      );
    }

    const { rerender } = render(<KeyedBoundary fail />);
    expect(screen.getByRole("button", { name: "Custom retry" })).not.toBeNull();

    rerender(<KeyedBoundary fail={false} />);

    expect(screen.getByText("Recovered content")).not.toBeNull();
  });

  it("handles application-level failures with the full-page fallback", () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild shouldThrow />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "The app could not be displayed" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reload app" })).not.toBeNull();
  });
});
