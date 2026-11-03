import type { ReactNode } from "react";
/** Keep the originating form mounted so opening preferences cannot discard unsaved work. */
export function SettingsSurface({
  active,
  detail,
  children,
}: {
  active: boolean;
  detail: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {active && detail}
      <div hidden={active}>{children}</div>
    </>
  );
}
