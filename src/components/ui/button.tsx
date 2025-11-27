import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-gold hover:shadow-gold-lg",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border-2 border-primary/50 bg-transparent text-primary hover:bg-primary/10 hover:border-primary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Casino specific variants
        gold: "bg-gradient-to-r from-gold-dark via-gold to-gold-light text-primary-foreground font-bold shadow-gold hover:shadow-gold-lg hover:-translate-y-0.5",
        felt: "bg-secondary text-secondary-foreground border border-emerald-light/30 hover:bg-emerald-light/20",
        action: "bg-muted text-foreground border border-border hover:bg-muted/80 hover:border-primary/50",
        fold: "bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30",
        call: "bg-emerald/20 text-emerald-light border border-emerald/30 hover:bg-emerald/30",
        raise: "bg-gold/20 text-gold-light border border-gold/30 hover:bg-gold/30",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-11 w-11",
        // Touch-friendly sizes
        touch: "h-12 min-w-[48px] px-6",
        "touch-lg": "h-14 min-w-[56px] px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
