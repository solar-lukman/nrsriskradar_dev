import { buildCors } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    if (req.method === 'GET') {
      // Get all active backup configurations and their schedules
      const { data: configs, error } = await supabaseClient
        .from('backup_configurations')
        .select('*')
        .eq('is_active', true)
        .order('created_at')

      if (error) {
        return new Response('Failed to fetch configurations', { status: 500, headers: corsHeaders })
      }

      // Calculate next run times for each configuration
      const scheduledBackups = configs.map(config => {
        const nextRun = calculateNextCronRun(config.schedule_cron)
        return {
          ...config,
          next_run: nextRun,
          overdue: nextRun < new Date()
        }
      })

      return new Response(JSON.stringify(scheduledBackups), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'POST') {
      // Manually trigger scheduled backups check
      const { data: configs, error } = await supabaseClient
        .from('backup_configurations')
        .select('*')
        .eq('is_active', true)

      if (error) {
        return new Response('Failed to fetch configurations', { status: 500, headers: corsHeaders })
      }

      const triggeredBackups = []
      const now = new Date()

      for (const config of configs) {
        const nextRun = calculateNextCronRun(config.schedule_cron)
        
        // Check if backup should run (within 5 minutes of scheduled time)
        const timeDiff = Math.abs(now.getTime() - nextRun.getTime())
        const shouldRun = timeDiff <= 5 * 60 * 1000 // 5 minutes

        if (shouldRun) {
          // Check if backup is not already running
          const { data: runningBackups } = await supabaseClient
            .from('backup_logs')
            .select('id')
            .eq('configuration_id', config.id)
            .eq('status', 'running')
            .limit(1)

          if (!runningBackups || runningBackups.length === 0) {
            // Schedule the backup
            const { data: backupLog } = await supabaseClient
              .from('backup_logs')
              .insert({
                configuration_id: config.id,
                backup_type: config.backup_type,
                status: 'pending',
                created_by: null // System-triggered
              })
              .select()
              .single()

            if (backupLog) {
              triggeredBackups.push({
                configuration_id: config.id,
                configuration_name: config.name,
                backup_id: backupLog.id,
                backup_type: config.backup_type
              })

              // Trigger the backup via backup-operations function
              try {
                const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/backup-operations`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    configuration_id: config.id,
                    backup_type: config.backup_type,
                    force: false
                  })
                })

                if (!response.ok) {
                  console.error(`Failed to trigger backup for ${config.name}`)
                }
              } catch (error) {
                console.error(`Error triggering backup for ${config.name}:`, error)
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({
        triggered_backups: triggeredBackups,
        total_configurations: configs.length,
        triggered_count: triggeredBackups.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  } catch (error) {
    console.error('Backup scheduler error:', error)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})

function calculateNextCronRun(cronExpression: string): Date {
  // Simple cron parser for common patterns
  // Format: minute hour day month dayOfWeek
  const parts = cronExpression.split(' ')
  if (parts.length !== 5) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000) // Default to tomorrow
  }

  const [minute, hour, , , dayOfWeek] = parts
  const now = new Date()
  const next = new Date(now)

  // Set the time
  if (hour !== '*') {
    next.setHours(parseInt(hour))
  }
  if (minute !== '*') {
    next.setMinutes(parseInt(minute))
  }
  next.setSeconds(0)
  next.setMilliseconds(0)

  // If time has passed today, move to tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }

  // Handle day of week (0 = Sunday, 6 = Saturday)
  if (dayOfWeek !== '*') {
    const targetDay = parseInt(dayOfWeek)
    const currentDay = next.getDay()
    
    if (targetDay !== currentDay) {
      const daysToAdd = (targetDay - currentDay + 7) % 7
      next.setDate(next.getDate() + daysToAdd)
    }
  }

  return next
}