import { buildCors } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BackupRequest {
  configuration_id: string;
  backup_type: 'incremental' | 'full' | 'differential';
  force?: boolean;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseClient.auth.getUser(token)

    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    // Verify admin access
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.role !== 'ADMIN') {
      return new Response('Forbidden', { status: 403, headers: corsHeaders })
    }

    if (req.method === 'POST') {
      const { configuration_id, backup_type, force = false }: BackupRequest = await req.json()

      // Get backup configuration
      const { data: config, error: configError } = await supabaseClient
        .from('backup_configurations')
        .select('*')
        .eq('id', configuration_id)
        .single()

      if (configError || !config) {
        return new Response('Configuration not found', { status: 404, headers: corsHeaders })
      }

      if (!config.is_active && !force) {
        return new Response('Configuration is inactive', { status: 400, headers: corsHeaders })
      }

      // Check for running backups of same type
      if (!force) {
        const { data: runningBackups } = await supabaseClient
          .from('backup_logs')
          .select('id')
          .eq('configuration_id', configuration_id)
          .eq('status', 'running')
          .limit(1)

        if (runningBackups && runningBackups.length > 0) {
          return new Response('Backup already running', { status: 409, headers: corsHeaders })
        }
      }

      // Create backup log entry
      const { data: backupLog, error: logError } = await supabaseClient
        .from('backup_logs')
        .insert({
          configuration_id,
          backup_type,
          status: 'pending',
          created_by: user.id
        })
        .select()
        .single()

      if (logError) {
        return new Response('Failed to create backup log', { status: 500, headers: corsHeaders })
      }

      // Start backup process in background
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions runtime
      EdgeRuntime.waitUntil(performBackup(supabaseClient, backupLog.id, config))

      return new Response(JSON.stringify({ 
        backup_id: backupLog.id, 
        status: 'initiated',
        message: 'Backup process started'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const backupId = url.searchParams.get('backup_id')

      if (backupId) {
        // Get specific backup status
        const { data: backup, error } = await supabaseClient
          .from('backup_logs')
          .select(`
            *,
            backup_configurations (name, backup_type, storage_location)
          `)
          .eq('id', backupId)
          .single()

        if (error) {
          return new Response('Backup not found', { status: 404, headers: corsHeaders })
        }

        return new Response(JSON.stringify(backup), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } else {
        // Get backup status summary
        const { data: summary, error } = await supabaseClient
          .rpc('get_backup_status_summary')

        if (error) {
          return new Response('Failed to get backup summary', { status: 500, headers: corsHeaders })
        }

        return new Response(JSON.stringify(summary), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  } catch (error) {
    console.error('Backup operation error:', error)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})

async function performBackup(supabaseClient: any, backupId: string, config: any) {
  try {
    console.log(`Starting backup ${backupId} for configuration ${config.name}`)

    // Update status to running
    await supabaseClient
      .from('backup_logs')
      .update({ 
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', backupId)

    // Simulate backup process - in production, this would integrate with your enterprise backup system
    const startTime = Date.now()
    
    // Mock backup duration based on type
    const duration = config.backup_type === 'full' ? 30000 : 10000 // 30s for full, 10s for incremental
    await new Promise(resolve => setTimeout(resolve, duration))

    // Mock backup results
    const mockResults = {
      file_size_bytes: config.backup_type === 'full' ? 1024 * 1024 * 500 : 1024 * 1024 * 50, // 500MB full, 50MB incremental
      records_backed_up: config.backup_type === 'full' ? 100000 : 5000,
      backup_location: `${config.storage_location}backup_${backupId}_${Date.now()}.${config.compression_enabled ? 'gz' : 'sql'}`,
      checksum: generateMockChecksum(),
      duration_seconds: Math.floor((Date.now() - startTime) / 1000)
    }

    // Update backup log with completion
    await supabaseClient
      .from('backup_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...mockResults,
        metadata: {
          enterprise_endpoint: config.enterprise_endpoint,
          encryption_enabled: config.encryption_enabled,
          compression_enabled: config.compression_enabled
        }
      })
      .eq('id', backupId)

    console.log(`Backup ${backupId} completed successfully`)

    // Log system audit
    await supabaseClient.rpc('log_system_audit', {
      p_user_id: null,
      p_action: 'backup_completed',
      p_category: 'system_access',
      p_resource_type: 'backup',
      p_resource_id: backupId,
      p_details: {
        configuration_name: config.name,
        backup_type: config.backup_type,
        file_size_mb: Math.round(mockResults.file_size_bytes / (1024 * 1024)),
        duration_seconds: mockResults.duration_seconds
      },
      p_severity: 'medium'
    })

  } catch (error) {
    console.error(`Backup ${backupId} failed:`, error)

    // Update backup log with failure
    await supabaseClient
      .from('backup_logs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: (error as any).message || 'Unknown backup error',
        duration_seconds: Math.floor((Date.now() - Date.now()) / 1000)
      })
      .eq('id', backupId)

    // Log system audit for failure
    await supabaseClient.rpc('log_system_audit', {
      p_user_id: null,
      p_action: 'backup_failed',
      p_category: 'system_access',
      p_resource_type: 'backup',
      p_resource_id: backupId,
      p_details: {
        configuration_name: config.name,
        backup_type: config.backup_type,
        error: (error as any).message
      },
      p_severity: 'high'
    })
  }
}

function generateMockChecksum(): string {
  return Array.from({ length: 64 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}