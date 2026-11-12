import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/ui/Button.tsx";
import { cn } from "@/ui/cn.ts";

export interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
  retryCount: number;
}

export type ErrorFallback = ReactNode | ((props: ErrorFallbackProps) => ReactNode);

export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback: ErrorFallback;
  onError?: (error: unknown, info: ErrorInfo) => void;
  resetKeys?: readonly unknown[];
  name?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  retryCount: number;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : "Unknown rendering error");
}

function resetKeysChanged(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
): boolean {
  if (previous === next) return false;
  const previousKeys = previous ?? [];
  const nextKeys = next ?? [];
  return (
    previousKeys.length !== nextKeys.length ||
    previousKeys.some((key, index) => !Object.is(key, nextKeys[index]))
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, retryCount: 0 };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      const label = this.props.name ? `[ErrorBoundary: ${this.props.name}]` : "[ErrorBoundary]";
      console.error(label, toError(error), info.componentStack);
    }
    try {
      this.props.onError?.(error, info);
    } catch (reportingError) {
      if (import.meta.env.DEV) {
        console.error("[ErrorBoundary] The error reporter itself failed.", reportingError);
      }
    }
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps): void {
    if (this.state.error && resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      this.resetErrorBoundary();
    }
  }

  private resetErrorBoundary = (): void => {
    this.setState((state) => ({ error: null, retryCount: state.retryCount + 1 }));
  };

  render(): ReactNode {
    const { error, retryCount } = this.state;
    if (!error) return this.props.children;

    const fallbackProps: ErrorFallbackProps = {
      error,
      resetErrorBoundary: this.resetErrorBoundary,
      retryCount,
    };
    return typeof this.props.fallback === "function"
      ? this.props.fallback(fallbackProps)
      : this.props.fallback;
  }
}

export interface SectionErrorFallbackProps extends ErrorFallbackProps {
  className?: string;
  title?: string;
  description?: string;
}

export function SectionErrorFallback({
  resetErrorBoundary,
  className,
  title,
  description,
}: SectionErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <section
      role="alert"
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-auto p-4 text-center",
        className,
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/10 text-amber-300">
        <TriangleAlert size={18} aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">
          {title ?? t("error.boundary.sectionTitle")}
        </h2>
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">
          {description ?? t("error.boundary.sectionDescription")}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={resetErrorBoundary}>
        <RotateCcw size={13} aria-hidden="true" />
        {t("error.boundary.retry")}
      </Button>
    </section>
  );
}

export function AppErrorFallback({ resetErrorBoundary }: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <section
        role="alert"
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl"
      >
        <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/10 text-amber-300">
          <TriangleAlert size={20} aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-foreground">{t("error.boundary.appTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("error.boundary.appDescription")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={resetErrorBoundary}>
            <RotateCcw size={14} aria-hidden="true" />
            {t("error.boundary.retry")}
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t("error.boundary.reload")}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function AppErrorBoundary({
  children,
  onError,
}: {
  children?: ReactNode;
  onError?: ErrorBoundaryProps["onError"];
}) {
  return (
    <ErrorBoundary
      name="application"
      onError={onError}
      fallback={(props) => <AppErrorFallback {...props} />}
    >
      {children}
    </ErrorBoundary>
  );
}

export function SectionErrorBoundary({
  children,
  name,
  resetKeys,
  onError,
  className,
}: {
  children?: ReactNode;
  name?: string;
  resetKeys?: readonly unknown[];
  onError?: ErrorBoundaryProps["onError"];
  className?: string;
}) {
  return (
    <ErrorBoundary
      name={name}
      resetKeys={resetKeys}
      onError={onError}
      fallback={(props) => <SectionErrorFallback {...props} className={className} />}
    >
      {children}
    </ErrorBoundary>
  );
}
