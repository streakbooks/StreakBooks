import type { AnchorHTMLAttributes } from "react";
export function Link({
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; params?: unknown }) {
  const { to: _to, params: _params, ...rest } = props;
  return (
    <a {...rest} href="#posting">
      {children}
    </a>
  );
}
