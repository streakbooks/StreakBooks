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
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
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
type DeclaredLookup = {
  options: LookupOption[];
  triggerClassName?: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  labelledBy?: string;
  describedBy?: string;
  invalid?: DeclaredNode["aria-invalid"];
  disabled?: boolean;
};

/** Preserve record options and trigger accessibility when adapting declarative selectors. */
export function declaredLookupOptions(children: ReactNode): DeclaredLookup {
  const result: DeclaredLookup = { options: [] };
  function visit(nodes: ReactNode, group?: string) {
    Children.forEach(nodes, (node) => {
      if (!isValidElement<DeclaredNode>(node)) return;
      const p = node.props;
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
      // Only trigger layout belongs to the resulting control, never popup/item decoration.
      const component = node.type as { displayName?: string; name?: string };
      if ((component.displayName ?? component.name) === "SelectTrigger" && p.className) {
        result.triggerClassName = p.className;
      }
      // Option metadata must never overwrite the selected control's accessibility state.
      if (p.id) result.id = p.id;
      if (p["aria-label"]) result.ariaLabel = p["aria-label"];
      if (p["aria-labelledby"]) result.labelledBy = p["aria-labelledby"];
      if (p["aria-describedby"]) result.describedBy = p["aria-describedby"];
      if (p["aria-invalid"] !== undefined) result.invalid = p["aria-invalid"];
      if (p.disabled !== undefined) result.disabled = p.disabled;
      if (p.placeholder) result.placeholder = p.placeholder;
      const nextGroup = p.label ?? group;
      visit(p.children, nextGroup);
    });
  }
  visit(children);
  return result;
}
