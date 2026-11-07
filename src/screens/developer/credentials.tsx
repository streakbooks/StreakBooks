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
import type { Permission } from "@/lib/permissions";

/**
 * API credentials workspace — fail closed until the encrypted vault issues clients.
 * Never displays recoverable secrets.
 */
export function DeveloperCredentialsPage() {
  const { can } = useCan();
  const canManage = can("developer.manage_apps" as Permission);

  if (!canManage) {
    return (
      <>
        <ListWorkspace title="API Credentials" description="Developer portal">
        <EmptyState title="No access" description="Requires developer.manage_apps." />
    </ListWorkspace>
      </>
    );
  }

  return (
    <>
      <ListWorkspace
        title="API Credentials"
        description="OAuth client identifiers and secret hashes for partner applications. Raw secrets are never stored or shown."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/developer/$section" params={{ section: "oauth" }}>
              OAuth configuration
            </Link>
          </Button>
        }
        subnav={<DeveloperSubnav current="credentials" />}
      >
      <Alert className="mb-6">
        <AlertTitle>Credential vault locked</AlertTitle>
        <AlertDescription>
          Client secret material is hash-only in the database. Issuing new clients stays disabled
          until the server-side vault is configured. Partners never receive service-role keys or
          unrestricted database access.
        </AlertDescription>
      </Alert>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Vault: not configured</Badge>
        <Badge variant="outline">Storage: hash-only</Badge>
        <Badge variant="outline">Rotation: pending vault</Badge>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client ID</TableHead>
              <TableHead>Application</TableHead>
              <TableHead>Secret prefix</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rotated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No OAuth clients issued yet. Create applications after publisher verification, then
                issue credentials when the vault is online.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="mt-6">
        <Button disabled title="Vault not configured">
          Issue client credentials
        </Button>
      </div>
        </ListWorkspace>
  );
}
