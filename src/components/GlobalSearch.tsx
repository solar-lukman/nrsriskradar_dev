import React, { useState, useEffect } from 'react';
import { Search, FileText, AlertTriangle, Shield, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;
type BCP = Tables<'business_continuity_plans'>;
type Document = Tables<'control_documents'>;

interface SearchResult {
  id: string;
  title: string;
  description: string;
  type: 'risk' | 'bcp' | 'document';
  category?: string;
  status?: string;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const performSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      const searchPattern = `%${searchQuery}%`;
      
      // Search risks
      const { data: risks } = await supabase
        .from('risks')
        .select('id, title, description, category, status')
        .or(`title.ilike.${searchPattern},description.ilike.${searchPattern}`)
        .limit(5);

      // Search BCPs
      const { data: bcps } = await supabase
        .from('business_continuity_plans')
        .select('id, title, description, business_function, status')
        .or(`title.ilike.${searchPattern},description.ilike.${searchPattern},business_function.ilike.${searchPattern}`)
        .limit(5);

      // Search documents
      const { data: documents } = await supabase
        .from('control_documents')
        .select('id, title, description, document_type, status')
        .or(`title.ilike.${searchPattern},description.ilike.${searchPattern}`)
        .limit(5);

      const combinedResults: SearchResult[] = [
        ...(risks?.map(risk => ({
          id: risk.id,
          title: risk.title,
          description: risk.description || '',
          type: 'risk' as const,
          category: risk.category,
          status: risk.status
        })) || []),
        ...(bcps?.map(bcp => ({
          id: bcp.id,
          title: bcp.title,
          description: bcp.description || bcp.business_function,
          type: 'bcp' as const,
          category: bcp.business_function,
          status: bcp.status
        })) || []),
        ...(documents?.map(doc => ({
          id: doc.id,
          title: doc.title,
          description: doc.description || '',
          type: 'document' as const,
          category: doc.document_type,
          status: doc.status
        })) || [])
      ];

      setResults(combinedResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    switch (result.type) {
      case 'risk':
        navigate('/risk-register');
        break;
      case 'bcp':
        navigate('/business-continuity');
        break;
      case 'document':
        navigate('/control-documents');
        break;
    }
    onClose();
    setQuery('');
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'risk':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'bcp':
        return <Shield className="w-4 h-4 text-primary" />;
      case 'document':
        return <FileText className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'risk':
        return 'Risk';
      case 'bcp':
        return 'BCP';
      case 'document':
        return 'Document';
      default:
        return '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search risks, BCPs, or documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-10"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <ScrollArea className="h-[400px] mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5">
                      {getIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {getTypeLabel(result.type)}
                        </Badge>
                        {result.category && (
                          <Badge variant="secondary" className="text-xs">
                            {result.category}
                          </Badge>
                        )}
                        {result.status && (
                          <Badge variant="outline" className="text-xs">
                            {result.status}
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-sm line-clamp-1">
                        {result.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {result.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : query ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Start typing to search...</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
