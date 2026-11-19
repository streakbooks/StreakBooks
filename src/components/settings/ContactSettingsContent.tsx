import { useEffect, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { parseContactSettingsDraft } from "@/lib/contacts/contact-settings-validation";
import {
  getContactSettings,
  saveContactSettings,
  listContactGroups,
  upsertContactGroup,
  listContactTags,
  upsertContactTag,
} from "@/lib/contacts/contacts.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ContactSettingsContent({
  embedded = false,
  sharedOnly = false,
}: {
  embedded?: boolean;
  sharedOnly?: boolean;
}) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const canManage = useCanDo("contacts.manage");
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getContactSettings);
  const saveSettings = useServerFn(saveContactSettings);
  const fetchGroups = useServerFn(listContactGroups);
  const saveGroup = useServerFn(upsertContactGroup);
  const fetchTags = useServerFn(listContactTags);
  const saveTag = useServerFn(upsertContactTag);

  const settingsQ = useQuery({
    queryKey: ["contact-settings", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSettings({ data: { companyId: companyId! } }),
  });
  const groupsQ = useQuery({
    queryKey: ["contact-groups", companyId],
    enabled: Boolean(companyId && !embedded),
    queryFn: () => fetchGroups({ data: { companyId: companyId! } }),
  });
  const tagsQ = useQuery({
    queryKey: ["contact-tags", companyId],
    enabled: Boolean(companyId && !embedded),
    queryFn: () => fetchTags({ data: { companyId: companyId! } }),
  });

  const [defaultKind, setDefaultKind] = useState("customer");
  const [prefix, setPrefix] = useState("C");
  const [nextNum, setNextNum] = useState("1001");
  const [terms, setTerms] = useState("30");
  const [groupName, setGroupName] = useState("");
  const [tagName, setTagName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingTag, setSavingTag] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    const s = settingsQ.data as
      | {
          default_kind?: unknown;
          account_number_prefix?: unknown;
          next_account_number?: unknown;
          default_payment_terms_days?: unknown;
        }
      | undefined;
    if (!s || dirty) return;
    setBaseline(JSON.stringify(s));
    setDefaultKind(String(s.default_kind ?? "customer"));
    setPrefix(String(s.account_number_prefix ?? "C"));
    setNextNum(String(s.next_account_number ?? 1001));
    setTerms(String(s.default_payment_terms_days ?? 30));
  }, [settingsQ.data, dirty]);

  const parsed = parseContactSettingsDraft({ defaultKind, prefix, nextNum, terms });
  const serverChanged = Boolean(
    dirty && settingsQ.data && JSON.stringify(settingsQ.data) !== baseline,
  );
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  const discard = () => {
    const s = settingsQ.data as
      | {
          default_kind?: unknown;
          account_number_prefix?: unknown;
          next_account_number?: unknown;
          default_payment_terms_days?: unknown;
        }
      | undefined;
    if (!s) return;
    setDefaultKind(String(s.default_kind ?? "customer"));
    setPrefix(String(s.account_number_prefix ?? "C"));
    setNextNum(String(s.next_account_number ?? 1001));
    setTerms(String(s.default_payment_terms_days ?? 30));
    setBaseline(JSON.stringify(s));
    setDirty(false);
  };

  const saveM = useMutation({
    mutationFn: () => {
      if (!canManage || !settingsQ.data || serverChanged || !parsed.ok) {
        throw new Error("Review current contact settings before saving.");
      }
      const revision = (settingsQ.data as { updated_at?: unknown }).updated_at;
      return saveSettings({
        data: {
          companyId: companyId!,
          ...parsed.value,
          expectedUpdatedAt: typeof revision === "string" ? revision : null,
        },
      });
    },
    onSuccess: async () => {
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ["contact-settings", companyId] });
      toast.success("Settings saved — existing account numbers are not renumbered");
    },
    onError: (e) => {
      toast.error(friendlyAuthError(e));
      // Preserve the draft but show the latest revision after a rejected save.
      void settingsQ.refetch();
    },
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (settingsQ.isPending) return <LoadingState />;
  if (settingsQ.isError) {
    return (
      <QueryErrorState queries={[settingsQ]} title="Could not load settings" />
    );
  }

  const workspace = (
    <>
      <section className="mb-8 max-w-lg space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium">
          {sharedOnly ? "Shared contact numbering" : "General"}
        </h2>
        {sharedOnly && (
          <p className="text-sm text-muted-foreground">
            Numbering, groups and tags are shared by customers and suppliers. The transaction
            defaults above apply to this workspace.
          </p>
        )}
        {!sharedOnly && (
          <div className="space-y-1">
            <Label>Default role for new contacts</Label>
            <Select
              value={defaultKind}
              disabled={!canManage || saveM.isPending}
              onValueChange={(value) => {
                setDefaultKind(value);
                setDirty(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="both">Customer & supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="contact-number-prefix">Account number prefix</Label>
            <Input
              id="contact-number-prefix"
              value={prefix}
              disabled={!canManage || saveM.isPending}
              aria-invalid={Boolean(!parsed.ok && parsed.errors["prefix"])}
              onChange={(e) => {
                setPrefix(e.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-next-number">Next account number</Label>
            <Input
              id="contact-next-number"
              value={nextNum}
              inputMode="numeric"
              disabled={!canManage || saveM.isPending}
              aria-invalid={Boolean(!parsed.ok && parsed.errors["nextNum"])}
              onChange={(e) => {
                setNextNum(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>
        {!sharedOnly && (
          <div className="space-y-1">
            <Label htmlFor="contact-default-terms">Default payment terms (days)</Label>
            <Input
              id="contact-default-terms"
              value={terms}
              inputMode="numeric"
              disabled={!canManage || saveM.isPending}
              aria-invalid={Boolean(!parsed.ok && parsed.errors["terms"])}
              onChange={(e) => {
                setTerms(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Changing the next number only affects new contacts. Posted documents keep their historical
          contact snapshots and amounts.
        </p>
        {!parsed.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {Object.values(parsed.errors).join(" ")}
          </p>
        ) : null}
        {serverChanged ? (
          <p role="alert" className="text-sm text-destructive">
            Contact settings changed elsewhere. Reload latest values before saving.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button
            disabled={!canManage || !dirty || !parsed.ok || serverChanged || saveM.isPending}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? "Saving…" : "Save contact settings"}
          </Button>
          <Button variant="outline" disabled={!dirty || saveM.isPending} onClick={discard}>
            {serverChanged ? "Reload latest" : "Discard changes"}
          </Button>
          <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {!canManage ? "Read-only settings" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
        </div>
      </section>

      {embedded ? (
        <Button variant="outline" size="sm" asChild>
          <Link to="/contacts/settings">Manage contact groups and tags in Contacts</Link>
        </Button>
      ) : null}
      <section hidden={embedded} className="mb-8 max-w-lg space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium">Groups</h2>
        <div className="flex gap-2">
          <Input
            placeholder="New group name"
            value={groupName}
            disabled={!canManage || savingGroup}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!canManage || !groupName.trim() || savingGroup}
            onClick={async () => {
              setSavingGroup(true);
              try {
                await saveGroup({ data: { companyId: companyId!, name: groupName } });
                setGroupName("");
                await qc.invalidateQueries({ queryKey: ["contact-groups", companyId] });
                toast.success("Group created");
              } catch (e) {
                toast.error(friendlyAuthError(e));
              } finally {
                setSavingGroup(false);
              }
            }}
          >
            Add
          </Button>
        </div>
        {groupsQ.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load groups: {friendlyAuthError(groupsQ.error)}
          </p>
        ) : null}
        <ul className="text-sm">
          {((groupsQ.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>).map(
            (g) => (
              <li key={g.id} className="border-b py-1">
                {g.name}
                {!g.is_active ? " (inactive)" : ""}
              </li>
            ),
          )}
        </ul>
      </section>

      <section hidden={embedded} className="max-w-lg space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium">Tags</h2>
        <div className="flex gap-2">
          <Input
            placeholder="New tag"
            value={tagName}
            disabled={!canManage || savingTag}
            onChange={(e) => setTagName(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!canManage || !tagName.trim() || savingTag}
            onClick={async () => {
              setSavingTag(true);
              try {
                await saveTag({ data: { companyId: companyId!, name: tagName } });
                setTagName("");
                await qc.invalidateQueries({ queryKey: ["contact-tags", companyId] });
                toast.success("Tag created");
              } catch (e) {
                toast.error(friendlyAuthError(e));
              } finally {
                setSavingTag(false);
              }
            }}
          >
            Add
          </Button>
        </div>
        {tagsQ.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load tags: {friendlyAuthError(tagsQ.error)}
          </p>
        ) : null}
        <ul className="flex flex-wrap gap-2 text-sm">
          {((tagsQ.data ?? []) as Array<{ id: string; name: string }>).map((t) => (
            <li key={t.id} className="rounded-full border px-2 py-0.5">
              {t.name}
            </li>
          ))}
        </ul>
      </section>
      <AlertDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && navigationBlocker.status === "blocked") navigationBlocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved contact settings?</AlertDialogTitle>
            <AlertDialogDescription>
              Account numbering and contact preferences have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (navigationBlocker.status === "blocked") navigationBlocker.reset();
              }}
            >
              Stay and keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={saveM.isPending}
              onClick={() => {
                if (navigationBlocker.status === "blocked") navigationBlocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return workspace;
  return (
    <ListWorkspace
      title="Contact settings"
      description="Numbering, defaults, groups and tags for this organisation."
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/contacts" search={{ view: undefined }}>
            Back to directory
          </Link>
        </Button>
      }
    >
      {workspace}
    </ListWorkspace>
  );
}
