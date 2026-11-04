export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ListState = {
  q: string;
  status: string;
  from: string;
  to: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const initialListState = (sort: string): ListState => ({
  q: "",
  status: "all",
  from: "",
  to: "",
  sort,
  dir: "desc",
  page: 0,
  pageSize: 50,
});
