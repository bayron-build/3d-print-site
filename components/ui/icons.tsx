import type { ComponentProps } from "react";

function Icon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconChat({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-2.9A8 8 0 1 1 21 12z" />
      <path d="M8.5 11h7M8.5 14h4" />
    </Icon>
  );
}

export function IconClipboard({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M9 4h6v3H9zM15 5h3v16H6V5h3" />
      <path d="M9 12h6M9 16h4" />
    </Icon>
  );
}

export function IconPrinter({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M7 8V3h10v5M4 8h16v9h-3M7 13h10v8H7v-8zM4 17h3" />
    </Icon>
  );
}

export function IconTruck({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M2 6h12v10H2zM14 10h4l3 3v3h-7v-6z" />
      <circle cx="6.5" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </Icon>
  );
}

export function IconUpload({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 16V4M6.5 9.5 12 4l5.5 5.5M4 20h16" />
    </Icon>
  );
}

export function IconPencil({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
      <path d="m14.5 6.5 3 3" />
    </Icon>
  );
}

export function IconShieldCheck({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3l8 3v6c0 4.2-3.4 7.6-8 9-4.6-1.4-8-4.8-8-9V6l8-3z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function IconLayers({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="m3 13 9 5 9-5" />
    </Icon>
  );
}

export function IconCheck({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m5 13 4 4L19 7" />
    </Icon>
  );
}

export function IconMenu({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function IconClose({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}
