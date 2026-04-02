"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  title?: string;
  description?: string;
  onConfirm: () => void;
  children: React.ReactElement<{ onClick?: React.MouseEventHandler }>;
  destructive?: boolean;
}

export function ConfirmDialog({
  title = "Are you sure?",
  description = "This action cannot be undone.",
  onConfirm,
  children,
  destructive = true,
}: Props) {
  const [open, setOpen] = useState(false);

  const trigger = {
    ...children,
    props: {
      ...children.props,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        children.props.onClick?.(e);
        setOpen(true);
      },
    },
  };

  return (
    <>
      {trigger}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onConfirm(); setOpen(false); }}
              className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
