"use client";

import { useEffect, useRef, useState } from "react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnDesktopResize = () => {
      if (window.matchMedia("(min-width: 721px)").matches) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktopResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktopResize);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button className={`stoic-menu-toggle${open ? " open" : ""}`} type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="stoic-mobile-menu" onClick={() => setOpen((value) => !value)}>
        {open ? <XMarkIcon width={19} height={19} /> : <Bars3Icon width={19} height={19} />}
     </button>
      {open && <div className="stoic-mobile-backdrop" onClick={close}>
        <nav ref={panel} id="stoic-mobile-menu" className="stoic-mobile-panel" aria-label="Mobile navigation" onClick={(event) => event.stopPropagation()}>
          <Link href="#product" onClick={close}>Product</Link>
          <Link href="#workspace" onClick={close}>Workspace</Link>
          <Link href="#self-host" onClick={close}>Self-host</Link>
          <Link href="#services" onClick={close}>Services</Link>
          <Link href="/login" className="stoic-mobile-cta" onClick={close}>Sign in</Link>
        </nav>
      </div>}
    </>
  );
}
