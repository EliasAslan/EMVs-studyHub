import { createClient } from '@supabase/functions-js';

export default defineEventHandler(async (event) => {
  // Get the authenticated user from Supabase
  const supabase = createClient(
    // @ts-expect-error
    event.context.client.supabaseUrl,
    // @ts-expect-error
    event.context.client.supabaseKey,
    { glob: { headers: {} } }
  );

  // Get the authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  // Get the recipient email from user settings, fallback to configured default
  const { data: settings } = await supabase
    .from('user_settings')
    .select('email')
    .eq('user_id', user.id)
    .single();

  const recipientEmail = settings?.email || process.env.DEFAULT_REMINDER_EMAIL || '';

  if (!recipientEmail) {
    return { error: 'No recipient email configured. Set it in Settings → Erinnerungen.' };
  }

  // Fetch homework due tomorrow and exams due tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Fetch homework due tomorrow (not done)
  const { data: homework, error: hwError } = await supabase
    .from('homework')
    .select('*')
    .eq('user_id', user.id)
    .eq('due_date', tomorrowStr)
    .not('done', '=', true);

  if (hwError) throw hwError;

  // Fetch exams due tomorrow
  const { data: exams, error: examError } = await supabase
    .from('exams')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', tomorrowStr);

  if (examError) throw examError;

  // Build the email content
  const lines: string[] = [];

  if (homework && homework.length > 0) {
    lines.push('📚 Hausaufgaben fällig morgen:');
    homework.forEach((h) => {
      const module = h.module_id ? h.module_id : 'Kein Modul';
      lines.push(`  • ${h.title} (Modul: ${module}) - Fällig: ${h.due_date}`);
    });
    lines.push('');
  }

  if (exams && exams.length > 0) {
    lines.push('📝 Prüfungen fällig morgen:');
    exams.forEach((e) => {
      const module = e.module_id ? e.module_id : 'Kein Modul';
      lines.push(`  • ${e.title} (Modul: ${module}) - Datum: ${e.date}`);
    });
    lines.push('');
  }

  if (!homework || homework.length === 0) {
    lines.push('Keine Hausaufgaben fällig morgen.');
    lines.push('');
  }

  if (!exams || exams.length === 0) {
    lines.push('Keine Prüfungen fällig morgen.');
    lines.push('');
  }

  lines.push('Study Hub - Deine ruhige Schulhub-App');
  lines.push('');

  // Send via Resend
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    // If no API key, return the email content for manual sending / fallback
    return {
      format: 'text',
      content: lines.join('\n'),
      note: 'No RESEND_API_KEY configured. Email content ready for manual sending or future Resend setup.',
      recipient: recipientEmail,
    };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Study Hub <notifications@study-hub.local>',
      to: recipientEmail,
      subject: 'Hausaufgaben und Prüfungen fällig morgen',
      text: lines.join('\n'),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Resend error (${res.status}): ${errorText}`);
  }

  const data = await res.json();

  return {
    success: true,
    resendId: data.id,
    recipient: recipientEmail,
    note: 'Email sent via Resend',
  };
});