/** Print the same rendered sheet in an isolated frame; the browser provides Save as PDF. */
export async function printThemePreview(element: HTMLElement): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title = "Document print preview";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(frame);
  try {
    const target = frame.contentDocument;
    if (!target) throw new Error("Print preview is unavailable");
    target.open();
    target.write(
      "<!doctype html><html><head><title>StreakBooks theme preview</title></head><body></body></html>",
    );
    target.close();
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"],style')).map(
      (node) => {
        const clone = node.cloneNode(true);
        if (clone instanceof HTMLLinkElement)
          return new Promise<void>((resolve, reject) => {
            clone.onload = () => resolve();
            clone.onerror = () => reject(new Error("Print styles could not be loaded"));
            target.head.appendChild(clone);
          });
        target.head.appendChild(clone);
        return Promise.resolve();
      },
    );
    target.body.appendChild(element.cloneNode(true));
    await Promise.all(styles);
    await target.fonts.ready;
    await Promise.all(
      Array.from(target.images).map(async (img) => {
        try {
          await img.decode();
        } catch {
          throw new Error("The logo could not be loaded for printing. Reload or replace the logo.");
        }
      }),
    );
    const win = frame.contentWindow;
    if (!win) throw new Error("Print preview is unavailable");
    win.addEventListener("afterprint", () => frame.remove(), { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 120000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}
