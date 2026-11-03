import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listDocumentThemes,
  saveDocumentTheme,
  setDocumentThemeDefault,
  deleteDocumentTheme,
} from "@/lib/documents/themes/themes.functions";
import type { DocumentBranding } from "@/lib/documents/types";
import { ErrorState, LoadingState } from "@/components/common/states";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { DocumentThemeEditor } from "./DocumentThemeEditor";
export function DocumentThemes({
  companyId,
  base,
  canEdit,
}: {
  companyId: string;
  base: DocumentBranding;
  canEdit: boolean;
}) {
  const list = useServerFn(listDocumentThemes),
    save = useServerFn(saveDocumentTheme),
    setDefault = useServerFn(setDocumentThemeDefault),
    remove = useServerFn(deleteDocumentTheme);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["document-themes", companyId],
    queryFn: () => list({ data: { companyId } }),
  });
  const refresh = async () => {
    await qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey.includes(companyId) &&
        ["document-themes", "document-branding", "printable-document"].some((key) =>
          q.queryKey.includes(key),
        ),
    });
  };
  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return (
      <ErrorState
        title="Could not load themes"
        description={friendlyAuthError(q.error)}
        onRetry={() => q.refetch()}
      />
    );
  return (
    <DocumentThemeEditor
      themes={q.data.themes}
      defaults={q.data.defaults}
      base={base}
      canEdit={canEdit}
      busy={false}
      logoUrls={q.data.logoUrls}
      onSave={async (input) => {
        const saved = await save({ data: { ...input, companyId } });
        await refresh();
        return saved;
      }}
      onDefault={async (kind, themeId) => {
        await setDefault({ data: { companyId, kind, themeId } });
        await refresh();
      }}
      onDelete={async (theme) => {
        await remove({ data: { companyId, id: theme.id, revision: theme.revision } });
        await refresh();
      }}
      onUpload={async (file) => {
        const types: Record<string, string> = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
          "image/gif": "gif",
        };
        const ext = types[file.type];
        if (!ext || file.size > 2 * 1024 * 1024)
          throw new Error("Choose a PNG, JPEG, WebP or GIF image of 2 MB or less");
        const path = `${companyId}/theme-${crypto.randomUUID()}.${ext}`;
        const uploaded = await supabase.storage
          .from("org-logos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploaded.error) throw new Error(uploaded.error.message);
        const signed = await supabase.storage.from("org-logos").createSignedUrl(path, 3600);
        if (signed.error || !signed.data.signedUrl)
          throw new Error(signed.error?.message ?? "Could not load uploaded logo");
        return { path, url: signed.data.signedUrl };
      }}
    />
  );
}
