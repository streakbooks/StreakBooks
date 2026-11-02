import { Children, isValidElement, type ReactNode } from "react";
import type { LookupOption } from "./types";
type DeclaredNode = {
  value?: unknown;
  disabled?: boolean;
  children?: ReactNode;
  label?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
};
function nodeText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<DeclaredNode>(child)
          ? nodeText(child.props.children)
          : "",
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
/** Extract stable record options from legacy declarative selectors. */
export function declaredLookupOptions(children: ReactNode): {
  options: LookupOption[];
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
} {
  const result: { options: LookupOption[]; placeholder?: string; id?: string; ariaLabel?: string } =
    { options: [] };
  function visit(nodes: ReactNode, group?: string) {
    Children.forEach(nodes, (node) => {
      if (!isValidElement<DeclaredNode>(node)) return;
      const p = node.props;
      if (p.id) result.id = p.id;
      if (p["aria-label"]) result.ariaLabel = p["aria-label"];
      if (p.placeholder) result.placeholder = p.placeholder;
      if (p.value !== undefined) {
        const id = String(p.value);
        const label = nodeText(p.children);
        if (!id) {
          result.placeholder = label;
          return;
        }
        result.options.push({
          id,
          label,
          ...(group ? { group } : {}),
          ...(p.disabled ? { disabled: true } : {}),
        });
        return;
      }
      const nextGroup = p.label ?? group;
      visit(p.children, nextGroup);
    });
  }
  visit(children);
  return result;
}
