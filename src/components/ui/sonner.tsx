import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      dir="rtl"
      duration={2600}
      offset={{ bottom: 88, right: 16 }}
      mobileOffset={{ bottom: 96, right: 12 }}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:!rounded-2xl group-[.toaster]:!border group-[.toaster]:!border-border/80 group-[.toaster]:!bg-card/95 group-[.toaster]:!text-foreground group-[.toaster]:!shadow-2xl group-[.toaster]:backdrop-blur-xl group-[.toaster]:!font-[inherit]",
          title: "group-[.toast]:!text-[13px] group-[.toast]:!font-extrabold",
          description: "group-[.toast]:!text-[11.5px] group-[.toast]:!text-muted-foreground",
          actionButton: "group-[.toast]:!bg-accent group-[.toast]:!text-accent-foreground",
          cancelButton: "group-[.toast]:!bg-muted group-[.toast]:!text-muted-foreground",
          error: "group-[.toast]:!border-rose-500/45",
          success: "group-[.toast]:!border-emerald-500/35",
          warning: "group-[.toast]:!border-amber-500/40",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
