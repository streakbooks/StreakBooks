import { Link } from "@tanstack/react-router";
import { DeveloperSubnav } from "@/components/app-store/DeveloperSubnav";
import { EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import {
  developerPortalSection,
  type DeveloperPortalSectionKey,
} from "@/lib/app-store/sections";
import type { Permission } from "@/lib/permissions";
import type { ReactNode } from "react";

type PortalSectionProps = {
  sectionKey: DeveloperPortalSectionKey;
  title?: string;
  description: string;
  alertTitle: string;
  alertBody: string;
  badges?: string[];
  children?: ReactNode;
};

export function DeveloperPortalSectionShell({
  sectionKey,
  title,
  description,
  alertTitle,
  alertBody,
  badges = [],
  children,
}: PortalSectionProps) {
  const { can } = useCan();
  const section = developerPortalSection(sectionKey);
  const allowed = section.anyOf.some((permission) => can(permission as Permission));

  if (!allowed) {
    return (
      <ListWorkspace title={title ?? section.label} description="Developer portal">
        <EmptyState
          title="No access"
          description="Your role cannot open this developer workspace."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title={title ?? section.label}
      description={description}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/developer">Back to dashboard</Link>
        </Button>
      }
      subnav={<DeveloperSubnav current={sectionKey} />}
    >
      <Alert className="mb-6">
        <AlertTitle>{alertTitle}</AlertTitle>
        <AlertDescription>{alertBody}</AlertDescription>
      </Alert>
      {badges.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {badges.map((b) => (
            <Badge key={b} variant="outline">
              {b}
            </Badge>
          ))}
        </div>
      ) : null}
      {children}
    </ListWorkspace>
  );
}

export function EmptyPortalTable({
  columns,
  message,
}: {
  columns: string[];
  message: string;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={columns.length} className="text-muted-foreground">
              {message}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
