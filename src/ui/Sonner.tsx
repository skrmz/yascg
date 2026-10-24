import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      closeButton
      className="app-no-print"
      toastOptions={{
        classNames: {
          toast: "border border-border bg-card text-card-foreground shadow-lg",
          title: "text-sm font-medium text-foreground",
          description: "text-xs text-muted-foreground",
          closeButton: "border-border bg-card text-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
