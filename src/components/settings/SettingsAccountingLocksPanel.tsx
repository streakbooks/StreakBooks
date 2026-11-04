import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getLockPolicy,
  getOrganisationConfig,
  setLockPolicy,
  upsertOrganisationConfig,
} from "@/lib/settings/settings-centre.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { prepareAccountingPreferences } from "@/lib/settings/accounting-preferences";
import type { SettingsDocument } from "@/lib/settings/settings-centre.functions";
import { LedgerHealthPanel } from "@/components/accounting/LedgerHealthPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Props = { companyId: string; canEdit: boolean; canLock: boolean };

export function SettingsAccountingLocksPanel({ companyId, canEdit, canLock }: Props) {
  const qc = useQueryClient();
  const fetchLock = useServerFn(getLockPolicy);
  const saveLock = useServerFn(setLockPolicy);
  const fetchCfg = useServerFn(getOrganisationConfig);
  const saveCfg = useServerFn(upsertOrganisationConfig);

  const lockQ = useQuery({
    queryKey: ["lock-policy", companyId],
    queryFn: () => fetchLock({ data: { companyId } }),
  });
  const cfgQ = useQuery({
    queryKey: ["organisation-config", companyId, "accounting"],
    queryFn: () => fetchCfg({ data: { companyId, category: "accounting" } }),
  });

  const [everyone, setEveryone] = useState("");
  const [advisors, setAdvisors] = useState("");
  const [conversion, setConversion] = useState("");
  const [reason, setReason] = useState("");
  const [warnDup, setWarnDup] = useState(true);
  const [warnControl, setWarnControl] = useState(true);
  const [warnBank, setWarnBank] = useState(true);
  const [backdated, setBackdated] = useState("90");
  const [autoCredits, setAutoCredits] = useState(false);
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [lockTouched, setLockTouched] = useState(false);
  const [cfgTouched, setCfgTouched] = useState(false);
  const [cfgErrors, setCfgErrors] = useState<Record<string, string>>({});
  const [cfgBaselineVersion, setCfgBaselineVersion] = useState<number | null>(null);
  const [lockBaselineUpdatedAt, setLockBaselineUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!lockQ.data || lockTouched) return;
    setEveryone(lockQ.data.lock_date_everyone ?? "");
    setAdvisors(lockQ.data.lock_date_except_advisors ?? "");
    setConversion(lockQ.data.conversion_date ?? "");
    setLockBaselineUpdatedAt(lockQ.data.updated_at ?? null);
  }, [lockQ.data, lockTouched]);

  useEffect(() => {
    if (!cfgQ.data?.document || cfgTouched) return;
    const d = cfgQ.data.document;
    setWarnDup(Boolean(d["warn_duplicate_document_numbers"] ?? true));
    setWarnControl(Boolean(d["warn_post_to_control_account"] ?? true));
    setWarnBank(Boolean(d["warn_bank_direct_posting"] ?? true));
    setBackdated(String(d["warn_backdated_days"] ?? 90));
    setAutoCredits(Boolean(d["auto_apply_credits"] ?? false));
    setBasis((d["reporting_basis"] as "accrual" | "cash") ?? "accrual");
    setCfgBaselineVersion(cfgQ.data.version);
  }, [cfgQ.data, cfgTouched]);

  useEffect(() => {
    if (!lockTouched && !cfgTouched) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [lockTouched, cfgTouched]);

  const cfgServerChanged = Boolean(
    cfgTouched && cfgQ.data && cfgBaselineVersion !== cfgQ.data.version,
  );
  const lockServerChanged = Boolean(
    lockTouched && lockQ.data && lockBaselineUpdatedAt !== (lockQ.data.updated_at ?? null),
  );

  const resetLockDraft = () => {
    if (!lockQ.data) return;
    setEveryone(lockQ.data.lock_date_everyone ?? "");
    setAdvisors(lockQ.data.lock_date_except_advisors ?? "");
    setConversion(lockQ.data.conversion_date ?? "");
    setReason("");
    setLockTouched(false);
    setLockBaselineUpdatedAt(lockQ.data.updated_at ?? null);
  };

  const resetCfgDraft = () => {
    const d = cfgQ.data?.document;
    if (!d) return;
    setWarnDup(Boolean(d["warn_duplicate_document_numbers"] ?? true));
    setWarnControl(Boolean(d["warn_post_to_control_account"] ?? true));
    setWarnBank(Boolean(d["warn_bank_direct_posting"] ?? true));
    setBackdated(String(d["warn_backdated_days"] ?? 90));
    setAutoCredits(Boolean(d["auto_apply_credits"] ?? false));
    setBasis((d["reporting_basis"] as "accrual" | "cash") ?? "accrual");
    setCfgErrors({});
    setCfgTouched(false);
    setCfgBaselineVersion(cfgQ.data?.version ?? null);
  };

  const lockMut = useMutation({
    mutationFn: () => {
      if (lockServerChanged) throw new Error("Lock dates changed on the server. Reload latest values.");
      return saveLock({
        data: {
          companyId,
          lockDateEveryone: everyone || null,
          lockDateExceptAdvisors: advisors || null,
          conversionDate: conversion || null,
          reason,
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["lock-policy", companyId] });
      await qc.invalidateQueries({ queryKey: ["settings-overview", companyId] });
      toast.success("Lock policy saved");
      setReason("");
      setLockTouched(false);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const cfgMut = useMutation({
    mutationFn: (payload: { document: SettingsDocument; version: number }) =>
      saveCfg({
        data: {
          companyId,
          category: "accounting",
          expectedVersion: payload.version,
          document: payload.document,
          reason: "Accounting preferences updated",
        },
      }),
    onSuccess: async (result) => {
      qc.setQueryData(["organisation-config", companyId, "accounting"], result);
      setCfgBaselineVersion(result.version);
      setCfgTouched(false);
      setCfgErrors({});
      await qc.invalidateQueries({ queryKey: ["organisation-config", companyId, "accounting"] });
      toast.success("Accounting preferences saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const savePreferences = () => {
    if (!cfgQ.data || !canEdit || cfgMut.isPending || cfgServerChanged) return;
    const validated = prepareAccountingPreferences(cfgQ.data.document, {
      reportingBasis: basis,
      warnDuplicateNumbers: warnDup,
      warnControlAccounts: warnControl,
      warnBankPosting: warnBank,
      backdatedDays: backdated,
      autoApplyCredits: autoCredits,
    });
    if (!validated.ok) {
      setCfgErrors(validated.errors);
      toast.error("Review the accounting preferences before saving.");
      return;
    }
    setCfgErrors({});
    cfgMut.mutate({ document: validated.document, version: cfgQ.data.version });
  };

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Two-tier lock dates</AlertTitle>
        <AlertDescription>
          Enforced in <code>post_journal</code> for every posting path (UI, API, import, AI). Period
          status locks on{" "}
          <Link to="/accounting" className="underline">
            Accounting → Periods
          </Link>{" "}
          still apply. Cash-basis is a reporting view only — it never rewrites posted journals.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lock dates & conversion</CardTitle>
          <CardDescription>
            Lock for everyone blocks all roles. Lock except advisers still allows owner, admin and
            accountant. Conversion / books-start blocks posting before that date.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-3">
          {!canLock ? (
            <p className="text-sm text-muted-foreground">
              You need the periods.lock permission to change lock dates.
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="settings-lock-everyone">Lock date for everyone</Label>
            <Input
              id="settings-lock-everyone"
              type="date"
              value={everyone}
              disabled={!canLock}
              onChange={(e) => {
                setEveryone(e.target.value);
                setLockTouched(true);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="settings-lock-advisers">Lock date except advisers</Label>
            <Input
              id="settings-lock-advisers"
              type="date"
              value={advisors}
              disabled={!canLock}
              onChange={(e) => {
                setAdvisors(e.target.value);
                setLockTouched(true);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="settings-lock-conversion">Conversion / books-start date</Label>
            <Input
              id="settings-lock-conversion"
              type="date"
              value={conversion}
              disabled={!canLock}
              onChange={(e) => {
                setConversion(e.target.value);
                setLockTouched(true);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Starting from another system?{" "}
              <Link to="/accounting" search={{ tab: "conversion" }} className="underline">
                Enter opening balances
              </Link>{" "}
              — it sets this date and posts one balanced opening journal.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="settings-lock-reason">Reason (required, audited)</Label>
            <Textarea
              id="settings-lock-reason"
              value={reason}
              disabled={!canLock}
              onChange={(e) => {
                setReason(e.target.value);
                setLockTouched(true);
              }}
              placeholder="e.g. Month-end close March 2026"
            />
          </div>
          {lockServerChanged ? (
            <Alert variant="destructive">
              <AlertTitle>Lock policy changed on the server</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Review the latest lock dates before saving another policy.</p>
                <Button variant="outline" size="sm" onClick={resetLockDraft}>
                  Reload latest policy
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              disabled={!canLock || !lockTouched || !reason.trim() || lockMut.isPending || lockServerChanged}
              onClick={() => lockMut.mutate()}
            >
              {lockMut.isPending ? "Saving…" : "Save lock policy"}
            </Button>
            <Button variant="outline" disabled={!lockTouched || lockMut.isPending} onClick={resetLockDraft}>
              Discard changes
            </Button>
            <span role="status" className="text-xs text-muted-foreground">
              {lockTouched ? "Unsaved lock policy changes" : "No unsaved lock policy changes"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting preferences</CardTitle>
          <CardDescription>
            Warnings and reporting defaults. Do not affect posted journals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="settings-reporting-basis">Reporting basis (view)</Label>
            <select
              id="settings-reporting-basis"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={basis}
              disabled={!canEdit}
              onChange={(e) => {
                setBasis(e.target.value as "accrual" | "cash");
                setCfgTouched(true);
              }}
            >
              <option value="accrual">Accrual</option>
              <option value="cash">Cash (reporting view)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-warn-duplicate">Warn on duplicate document numbers</Label>
            <Switch id="settings-warn-duplicate" checked={warnDup} disabled={!canEdit || !cfgQ.data} onCheckedChange={(value) => {
              setWarnDup(value);
              setCfgTouched(true);
            }} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-warn-control">Warn posting to control accounts</Label>
            <Switch id="settings-warn-control" checked={warnControl} disabled={!canEdit || !cfgQ.data} onCheckedChange={(value) => {
              setWarnControl(value);
              setCfgTouched(true);
            }} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-warn-bank">Warn bank-account direct posting</Label>
            <Switch id="settings-warn-bank" checked={warnBank} disabled={!canEdit || !cfgQ.data} onCheckedChange={(value) => {
              setWarnBank(value);
              setCfgTouched(true);
            }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="settings-backdated-days">Warn back-dated entries beyond (days)</Label>
            <Input
              id="settings-backdated-days"
              value={backdated}
              inputMode="numeric"
              aria-invalid={Boolean(cfgErrors["warn_backdated_days"])}
              aria-describedby={cfgErrors["warn_backdated_days"] ? "settings-backdated-error" : undefined}
              disabled={!canEdit || !cfgQ.data}
              onChange={(e) => {
                setBackdated(e.target.value);
                setCfgTouched(true);
                setCfgErrors({});
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-auto-credits">Auto-apply credits / prepayments</Label>
            <Switch id="settings-auto-credits" checked={autoCredits} disabled={!canEdit || !cfgQ.data} onCheckedChange={(value) => {
              setAutoCredits(value);
              setCfgTouched(true);
            }} />
          </div>
          {cfgServerChanged ? (
            <Alert variant="destructive">
              <AlertTitle>Accounting preferences changed on the server</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Your draft is preserved. Reload the latest preferences before saving.</p>
                <Button variant="outline" size="sm" onClick={resetCfgDraft}>
                  Reload latest preferences
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {cfgErrors["warn_backdated_days"] ? (
            <p id="settings-backdated-error" className="text-sm text-destructive">
              {cfgErrors["warn_backdated_days"]}
            </p>
          ) : null}
          {cfgQ.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Accounting preferences unavailable</AlertTitle>
              <AlertDescription>{friendlyAuthError(cfgQ.error)}</AlertDescription>
            </Alert>
          ) : null}
          {cfgMut.isError ? (
            <p role="alert" className="text-sm text-destructive">{friendlyAuthError(cfgMut.error)}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button disabled={!canEdit || !cfgQ.data || !cfgTouched || cfgMut.isPending || cfgServerChanged} onClick={savePreferences}>
              {cfgMut.isPending ? "Saving…" : "Save preferences"}
            </Button>
            <Button variant="outline" disabled={!cfgTouched || cfgMut.isPending} onClick={resetCfgDraft}>
              Discard changes
            </Button>
            <span role="status" className="text-xs text-muted-foreground">
              {cfgTouched ? "Unsaved accounting preferences" : "All accounting preferences saved"}
            </span>
          </div>
        </CardContent>
      </Card>

      <LedgerHealthPanel companyId={companyId} />
    </div>
  );
}
