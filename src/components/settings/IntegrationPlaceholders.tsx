import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Eye, EyeOff, Database, Shield, Building2, Fingerprint, Globe2, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
};

type IntegrationDef = {
  settingKey: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  fields: FieldDef[];
  docs: string;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    settingKey: 'integration_mfiles',
    name: 'M-Files EDRMS',
    description: 'Document management & version control for control documents and policies.',
    icon: Database,
    fields: [
      { key: 'endpoint', label: 'M-Files Server URL', placeholder: 'https://mfiles.company.com', type: 'url' },
      { key: 'vault_id', label: 'Vault ID', placeholder: 'e.g. {ABC123-...-XYZ}' },
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Enter M-Files API key' },
    ],
    docs: 'Requires an M-Files application token with read/write access to the configured vault. See M-Files REST API.',
  },
  {
    settingKey: 'integration_active_directory',
    name: 'Active Directory',
    description: 'Single Sign-On and automated user/role provisioning via LDAP.',
    icon: Shield,
    fields: [
      { key: 'domain', label: 'AD Domain', placeholder: 'corp.company.com' },
      { key: 'ldap_url', label: 'LDAP URL', placeholder: 'ldaps://ad.company.com:636', type: 'url' },
      { key: 'bind_dn', label: 'Bind DN', placeholder: 'CN=svc_riskradar,OU=Service,DC=corp,DC=company,DC=com' },
      { key: 'bind_password', label: 'Bind Password', type: 'password' },
    ],
    docs: 'Service account requires read access to user/group OUs. Group-to-role mapping configured server-side.',
  },
  {
    settingKey: 'integration_cac',
    name: 'CAC Registry',
    description: 'Corporate Affairs Commission verification of taxpayer registration data.',
    icon: Building2,
    fields: [
      { key: 'endpoint', label: 'CAC API Endpoint', placeholder: 'https://api.cac.gov.ng/v1', type: 'url' },
      { key: 'environment', label: 'Environment', placeholder: 'sandbox or production' },
      { key: 'api_key', label: 'API Key', type: 'password' },
    ],
    docs: 'Requires registration with CAC eRegistration. Sandbox keys recommended for testing before go-live.',
  },
  {
    settingKey: 'integration_nimc',
    name: 'NIMC',
    description: 'National Identity verification for officers and key contacts.',
    icon: Fingerprint,
    fields: [
      { key: 'endpoint', label: 'NIMC API Endpoint', placeholder: 'https://api.nimc.gov.ng/v1', type: 'url' },
      { key: 'merchant_id', label: 'Merchant / Agent ID', placeholder: 'NIMC-AGENT-ID' },
      { key: 'api_key', label: 'API Key', type: 'password' },
    ],
    docs: 'Requires accreditation under the NIMC Verification Service Provider program.',
  },
  {
    settingKey: 'integration_nitda',
    name: 'NITDA',
    description: 'Data Protection compliance reporting under the NDPR/NDPA.',
    icon: Globe2,
    fields: [
      { key: 'endpoint', label: 'NITDA Reporting Endpoint', placeholder: 'https://ndpr.nitda.gov.ng/api', type: 'url' },
      { key: 'organisation_code', label: 'Organisation Code', placeholder: 'NDPA-ORG-XXXX' },
      { key: 'api_key', label: 'API Key', type: 'password' },
    ],
    docs: 'Used to file annual data protection compliance reports and breach notifications. Codes issued upon NDPA registration.',
  },
];

interface IntegrationCardProps {
  def: IntegrationDef;
}

function IntegrationCard({ def }: IntegrationCardProps) {
  const { toast } = useToast();
  const Icon = def.icon;
  const [values, setValues] = useState<Record<string, any>>({ enabled: false, status: 'coming_soon' });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', def.settingKey)
        .maybeSingle();
      if (active && data?.setting_value) {
        setValues({ ...(data.setting_value as any) });
      }
    })();
    return () => { active = false; };
  }, [def.settingKey]);

  const setField = (k: string, v: any) => setValues(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ setting_value: values, updated_at: new Date().toISOString() })
        .eq('setting_key', def.settingKey);
      if (error) throw error;
      toast({ title: 'Saved', description: `${def.name} settings updated.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const isComingSoon = (values.status ?? 'coming_soon') === 'coming_soon';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Icon className="w-5 h-5 mt-0.5 text-primary" />
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {def.name}
                {isComingSoon ? (
                  <Badge variant="secondary">Coming Soon</Badge>
                ) : (
                  <Badge variant={values.enabled ? 'default' : 'outline'}>
                    {values.enabled ? 'Enabled' : 'Configured'}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{def.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enable-${def.settingKey}`} className="text-xs text-muted-foreground">
              Enable
            </Label>
            <Switch
              id={`enable-${def.settingKey}`}
              checked={!!values.enabled}
              onCheckedChange={(v) => setValues(prev => ({ ...prev, enabled: v, status: v ? 'configured' : 'coming_soon' }))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isComingSoon && (
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-xs">
              This integration is a placeholder. Save your credentials now — backend API calls will be wired in a future release.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {def.fields.map(f => {
            const isSecret = f.type === 'password';
            const reveal = !!showSecrets[f.key];
            return (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <div className="relative">
                  <Input
                    type={isSecret && !reveal ? 'password' : 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                  {isSecret && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setShowSecrets(prev => ({ ...prev, [f.key]: !reveal }))}
                    >
                      {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">{def.docs}</p>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Saving…' : `Save ${def.name}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function IntegrationPlaceholders() {
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="w-4 h-4" />
        <AlertDescription className="text-sm">
          External integration placeholders for enterprise systems. Credentials are stored securely in <code>system_settings</code>; API wiring will be activated as each integration goes live. See{' '}
          <code>docs/integration-requirements.md</code> for vendor onboarding details.
        </AlertDescription>
      </Alert>
      {INTEGRATIONS.map(def => (
        <IntegrationCard key={def.settingKey} def={def} />
      ))}
    </div>
  );
}
