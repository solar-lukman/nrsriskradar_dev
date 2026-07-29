import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { MainLayout } from '@/components/MainLayout';
import {
  DOC_GROUPS,
  DOC_PAGES,
  ALL_DOC_ROLES,
  DOC_ROLE_LABELS,
  getPageRoles,
  type DocPage,
  type DocRole,
} from '@/docs/content';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Search, Download, X } from 'lucide-react';
import { Mermaid } from '@/components/docs/Mermaid';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { exportDocPageToPdf } from '@/lib/docPdf';
import { SeoHead } from '@/components/SeoHead';

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function extractHeadings(markdown: string) {
  const lines = markdown.split('\n');
  const headings: { level: number; text: string; id: string }[] = [];
  for (const line of lines) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      const text = m[2].replace(/`/g, '');
      headings.push({ level: m[1].length, text, id: slugify(text) });
    }
  }
  return headings;
}

function pageMatches(page: DocPage, query: string, role: DocRole | 'ALL'): boolean {
  if (role !== 'ALL') {
    const roles = getPageRoles(page);
    // Show pages that either have no explicit role (general docs) or include the selected role
    if (roles.length > 0 && !roles.includes(role)) return false;
  }
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    page.title.toLowerCase().includes(q) ||
    page.description.toLowerCase().includes(q) ||
    page.content.toLowerCase().includes(q)
  );
}

function DocsSidebar({
  activeSlug,
  query,
  setQuery,
  role,
  setRole,
  filteredPages,
}: {
  activeSlug: string;
  query: string;
  setQuery: (v: string) => void;
  role: DocRole | 'ALL';
  setRole: (v: DocRole | 'ALL') => void;
  filteredPages: DocPage[];
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card hidden lg:block">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <span className="font-semibold">Documentation</span>
      </div>
      <div className="p-3 space-y-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs…"
            className="pl-7 h-8 text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as DocRole | 'ALL')}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            {ALL_DOC_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r} — {DOC_ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(query || role !== 'ALL') && (
          <p className="text-xs text-muted-foreground px-1">
            {filteredPages.length} of {DOC_PAGES.length} pages
          </p>
        )}
      </div>
      <ScrollArea className="h-[calc(100vh-16rem)]">
        <nav className="p-3 space-y-6">
          {DOC_GROUPS.map((group) => {
            const pages = filteredPages.filter((p) => p.group === group);
            if (pages.length === 0) return null;
            return (
              <div key={group}>
                <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {group}
                </p>
                <ul className="space-y-0.5">
                  {pages.map((p) => (
                    <li key={p.slug}>
                      <Link
                        to={`/docs/${p.slug}`}
                        className={cn(
                          'block px-2 py-1.5 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                          activeSlug === p.slug && 'bg-secondary text-secondary-foreground font-medium'
                        )}
                      >
                        {p.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {filteredPages.length === 0 && (
            <p className="text-sm text-muted-foreground px-2">
              No pages match your filters.
            </p>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}

function TableOfContents({ page }: { page: DocPage }) {
  const headings = useMemo(() => extractHeadings(page.content), [page.content]);
  if (headings.length === 0) return null;
  return (
    <aside className="w-56 shrink-0 hidden xl:block">
      <div className="sticky top-20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          On this page
        </p>
        <ul className="space-y-1 border-l border-border">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={cn(
                  'block text-sm text-muted-foreground hover:text-foreground transition-colors -ml-px border-l border-transparent hover:border-primary pl-3 py-0.5',
                  h.level === 3 && 'pl-6'
                )}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function DocContent({ page }: { page: DocPage }) {
  const { hash } = useLocation();
  const [downloading, setDownloading] = useState(false);
  const roles = getPageRoles(page);

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    const id = hash.replace('#', '');
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(t);
  }, [hash, page.slug]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await exportDocPageToPdf(page);
      toast.success('PDF downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article className="flex-1 min-w-0 max-w-3xl mx-auto px-4 lg:px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            {page.group}
          </p>
          <p className="text-sm text-muted-foreground">{page.description}</p>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {roles.map((r) => (
                <Badge key={r} variant="secondary" className="text-xs">
                  {r} · {DOC_ROLE_LABELS[r]}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownload}
          disabled={downloading}
          className="shrink-0"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {downloading ? 'Preparing…' : 'Download PDF'}
        </Button>
      </div>
      <div
        className={cn(
          'prose prose-sm max-w-none',
          'prose-headings:scroll-mt-20 prose-headings:font-semibold',
          'prose-h1:text-3xl prose-h1:mb-4 prose-h1:mt-0',
          'prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-1 prose-h2:border-b prose-h2:border-border',
          'prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2',
          'prose-p:text-foreground/90 prose-p:leading-relaxed',
          'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
          'prose-strong:text-foreground prose-strong:font-semibold',
          'prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
          'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
          'prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:not-italic',
          'prose-table:text-sm prose-th:bg-muted prose-th:text-foreground prose-td:border-border prose-th:border-border',
          'prose-li:text-foreground/90 prose-ul:my-2 prose-ol:my-2'
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeSlug,
            [rehypeAutolinkHeadings, { behavior: 'wrap' }],
          ]}
          components={{
            code({ className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              const lang = match?.[1];
              const text = String(children).replace(/\n$/, '');
              if (lang === 'mermaid') {
                return <Mermaid chart={text} />;
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {page.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}

const ROLE_STORAGE_KEY = 'docs.roleFilter';

export default function Docs() {
  const { slug } = useParams<{ slug?: string }>();
  const effective = slug ?? 'overview';
  const page = DOC_PAGES.find((p) => p.slug === effective);

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<DocRole | 'ALL'>(() => {
    if (typeof window === 'undefined') return 'ALL';
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return (stored as DocRole | 'ALL') || 'ALL';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    }
  }, [role]);

  const filteredPages = useMemo(
    () => DOC_PAGES.filter((p) => pageMatches(p, query, role)),
    [query, role]
  );

  if (!page) {
    return <Navigate to="/docs/overview" replace />;
  }

  return (
    <MainLayout>
      <SeoHead
        title={page.title}
        description={page.description}
        path={`/docs/${page.slug}`}
        type="article"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: page.title,
          description: page.description,
          author: { "@type": "Organization", name: "Nigeria Revenue Service" },
          publisher: { "@type": "Organization", name: "Nigeria Revenue Service" },
        }}
      />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <DocsSidebar
          activeSlug={page.slug}
          query={query}
          setQuery={setQuery}
          role={role}
          setRole={setRole}
          filteredPages={filteredPages}
        />
        <DocContent page={page} />
        <TableOfContents page={page} />
      </div>
    </MainLayout>
  );
}
