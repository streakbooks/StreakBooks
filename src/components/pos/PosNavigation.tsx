import { Link } from "@tanstack/react-router";
export function PosNavigation() {
  return (
    <nav aria-label="Point of Sale sections" className="flex flex-wrap gap-4 text-sm">
      <Link to="/pos" className="rounded-sm text-primary underline underline-offset-4">
        Catalogue preview
      </Link>
      <Link to="/pos/registers" className="rounded-sm text-primary underline underline-offset-4">
        Registers & sessions
      </Link>
    </nav>
  );
}
