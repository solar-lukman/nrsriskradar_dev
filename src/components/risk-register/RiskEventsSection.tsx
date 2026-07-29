import React, { useState, useEffect } from 'react';
import { Zap, ChevronDown, ChevronUp, Calendar, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';

interface RiskEventsSectionProps {
  riskId: string;
  riskStatus: string;
}

export function RiskEventsSection({ riskId, riskStatus }: RiskEventsSectionProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('risk_events')
        .select('*')
        .eq('risk_id', riskId)
        .order('event_date', { ascending: false });
      setEvents(data || []);
      setLoading(false);
    };
    fetchEvents();
  }, [riskId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Loading events...</CardContent>
      </Card>
    );
  }

  if (events.length === 0 && riskStatus !== 'Crystallized') return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical': return 'destructive';
      case 'High': return 'warning';
      case 'Medium': return 'primary';
      case 'Low': return 'success';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'destructive';
      case 'Under Investigation': return 'warning';
      case 'Resolved': return 'success';
      case 'Closed': return 'secondary';
      default: return 'secondary';
    }
  };

  const getPostureColor = (posture: string) => {
    switch (posture) {
      case 'Elevated': return 'text-destructive';
      case 'Stable': return 'text-primary';
      case 'Reduced': return 'text-success';
      default: return 'text-warning';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-destructive" />
          Risk Events ({events.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crystallization events recorded.</p>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="space-y-3">
              {events.map((event) => (
                <Collapsible key={event.id} open={expandedEvent === event.id} onOpenChange={(open) => setExpandedEvent(open ? event.id : null)}>
                  <div className="border rounded-lg p-3">
                    <CollapsibleTrigger className="w-full text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityColor(event.severity) as any}>{event.severity}</Badge>
                          <span className="text-sm font-medium">{new Date(event.event_date).toLocaleDateString()}</span>
                          <Badge variant={getStatusColor(event.status) as any} className="text-xs">{event.status}</Badge>
                        </div>
                        {expandedEvent === event.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{event.event_description}</p>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="mt-3 pt-3 border-t space-y-3">
                      <div>
                        <h5 className="text-xs font-medium text-muted-foreground uppercase mb-1">Root Cause</h5>
                        <p className="text-sm">{event.root_cause}</p>
                      </div>
                      <div>
                        <h5 className="text-xs font-medium text-muted-foreground uppercase mb-1">Immediate Response</h5>
                        <p className="text-sm">{event.immediate_response}</p>
                      </div>

                      {event.corrective_actions && (event.corrective_actions as any[]).length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground uppercase mb-1">Corrective Actions</h5>
                          <div className="space-y-1">
                            {(event.corrective_actions as any[]).map((ca: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className={`w-2 h-2 rounded-full ${ca.status === 'completed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                                <span>{ca.action}</span>
                                {ca.deadline && <span className="text-xs text-muted-foreground">({ca.deadline})</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {event.financial_impact && (
                          <div>
                            <span className="text-xs text-muted-foreground">Financial Impact</span>
                            <div className="font-medium">{event.financial_impact_currency || 'NGN'} {Number(event.financial_impact).toLocaleString()}</div>
                          </div>
                        )}
                        <div>
                          <span className="text-xs text-muted-foreground">Risk Posture</span>
                          <div className={`font-medium ${getPostureColor(event.risk_posture)}`}>{event.risk_posture}</div>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Discovered</span>
                          <div>{new Date(event.discovered_date).toLocaleDateString()}</div>
                        </div>
                      </div>

                      {event.operational_impact && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground uppercase mb-1">Operational Impact</h5>
                          <p className="text-sm">{event.operational_impact}</p>
                        </div>
                      )}
                      {event.reputational_impact && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground uppercase mb-1">Reputational Impact</h5>
                          <p className="text-sm">{event.reputational_impact}</p>
                        </div>
                      )}
                      {event.lessons_learned && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground uppercase mb-1">Lessons Learned</h5>
                          <p className="text-sm">{event.lessons_learned}</p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
