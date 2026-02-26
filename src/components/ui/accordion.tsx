import * as React from "react";

import { cn } from "@/lib/utils";

type AccordionContextType = {
  openItem: string | null;
  setOpenItem: (value: string) => void;
};

const AccordionContext = React.createContext<AccordionContextType | null>(null);

function Accordion({ className, ...props }: React.ComponentProps<"div">) {
  const [openItem, setOpenItemState] = React.useState<string | null>(null);

  const setOpenItem = (value: string) => {
    setOpenItemState((prev) => (prev === value ? null : value));
  };

  return (
    <AccordionContext.Provider value={{ openItem, setOpenItem }}>
      <div className={cn("w-full", className)} {...props} />
    </AccordionContext.Provider>
  );
}

type AccordionItemProps = React.ComponentProps<"div"> & {
  value: string;
};

function AccordionItem({ className, value, ...props }: AccordionItemProps) {
  return <div data-accordion-item={value} className={cn("border-b border-white/20", className)} {...props} />;
}

type AccordionTriggerProps = React.ComponentProps<"button"> & {
  value: string;
};

function AccordionTrigger({ className, value, onClick, ...props }: AccordionTriggerProps) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) {
    throw new Error("AccordionTrigger must be used within Accordion");
  }

  const isOpen = ctx.openItem === value;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between py-3 text-left text-sm font-semibold text-green-100 transition-colors hover:text-white",
        className,
      )}
      onClick={(event) => {
        ctx.setOpenItem(value);
        onClick?.(event);
      }}
      aria-expanded={isOpen}
      {...props}
    />
  );
}

type AccordionContentProps = React.ComponentProps<"div"> & {
  value: string;
};

function AccordionContent({ className, value, ...props }: AccordionContentProps) {
  const ctx = React.useContext(AccordionContext);
  if (!ctx || ctx.openItem !== value) {
    return null;
  }

  return <div className={cn("pb-3", className)} {...props} />;
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
