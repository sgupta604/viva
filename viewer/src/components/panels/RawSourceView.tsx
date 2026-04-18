import { lazy, Suspense, useEffect, useState } from "react";
import type { FileNode } from "@/lib/graph/types";

// Monaco core + the React wrapper both live in a single lazy chunk. The dynamic
// import pulls `loader` and the pre-bundled `monaco-editor` together, calls
// `loader.config({ monaco })` BEFORE the editor mounts, and only then exposes
// the default export. This guarantees the wrapper never tries to fetch Monaco
// from jsdelivr at runtime (TR1 offline guarantee).
const Monaco = lazy(async () => {
  const [{ loader, default: Editor }, monaco] = await Promise.all([
    import("@monaco-editor/react"),
    import("monaco-editor"),
  ]);
  loader.config({ monaco });
  // Kick off init so that the first render does not race the loader.
  await loader.init();
  return { default: Editor };
});

const LANG: Record<string, string> = {
  xml: "xml",
  yaml: "yaml",
  json: "json",
  ini: "plaintext",
};

interface Props {
  file: FileNode;
}

export function RawSourceView({ file }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setErr(null);
    const url = `source/${file.path}`;
    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 404) {
            if (!cancelled) setErr("source not shipped — rerun crawler with --emit-sources");
            return null;
          }
          throw new Error(`HTTP ${r.status}`);
        }
        return r.text();
      })
      .then((t) => {
        if (cancelled || t === null) return;
        setText(t);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [file.path]);

  if (err) {
    return (
      <div className="p-4 text-xs text-neutral-400" data-testid="raw-source-missing">
        {err}
      </div>
    );
  }
  if (text === null) {
    return <div className="p-4 text-xs text-neutral-500">loading source…</div>;
  }
  return (
    <Suspense fallback={<div className="p-4 text-xs text-neutral-500">loading editor…</div>}>
      <div className="h-full" data-testid="raw-source-editor">
        <Monaco
          height="100%"
          language={LANG[file.kind] ?? "plaintext"}
          value={text}
          theme="vs-dark"
          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
        />
      </div>
    </Suspense>
  );
}
