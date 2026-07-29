import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    themeVariables: {
      fontFamily: 'inherit',
    },
  });
  initialized = true;
}

let counter = 0;

export const Mermaid: React.FC<{ chart: string }> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    ensureInit();
    const id = `mmd-${++counter}`;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        setSvg(svg);
        setErr('');
      })
      .catch((e) => setErr(String(e?.message || e)));
  }, [chart]);

  if (err) {
    return (
      <pre className="text-xs text-destructive bg-muted p-3 rounded overflow-auto">
        Mermaid error: {err}
        {'\n\n'}
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="my-4 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default Mermaid;
