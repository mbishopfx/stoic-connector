import Image from "next/image";

export function StoicMark({ className = "" }: { className?: string }) {
  return <Image
    className={className}
    src="/stoic-connector-directory-icon.png"
    alt=""
    aria-hidden="true"
    width={512}
    height={512}
  />;
}
