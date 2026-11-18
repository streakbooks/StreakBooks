/* eslint-disable react-refresh/only-export-components -- Screen fixture emulates the router's mixed exports. */
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { role } from "./context";
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  params?: Record<string, string>;
  search?: unknown;
};
export const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { to, params, search: _search, ...props },
  ref,
) {
  return (
    <a
      {...props}
      ref={ref}
      href={Object.entries(params ?? {}).reduce(
        (url, [key, value]) => url.replace(`$${key}`, value),
        to,
      )}
    />
  );
});
export const useNavigate = () => (destination: unknown) => {
  document.body.dataset.destination = JSON.stringify(destination);
};
export const useRouteContext = () => ({ user: { id: role === "reviewer" ? "reviewer" : "maker" } });
