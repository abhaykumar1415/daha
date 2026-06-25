import { DahaRunSummary, ParsedDahaConfig } from '../types/config.js';

export async function dispatchWebhook(summary: DahaRunSummary, config: ParsedDahaConfig): Promise<void> {
  const webhookUrl = config.notifications?.webhookUrl;
  const onFailureOnly = config.notifications?.onFailureOnly ?? true;

  if (!webhookUrl) return;
  if (onFailureOnly && summary.passed) return;

  const totalRoutes = summary.routes.length;
  let avgPerf = 0;
  let avgA11y = 0;
  let avgBp = 0;
  let avgSeo = 0;

  if (totalRoutes > 0) {
    for (const r of summary.routes) {
      avgPerf += r.medianRun.scores.performance;
      avgA11y += r.medianRun.scores.accessibility;
      avgBp += r.medianRun.scores['best-practices'];
      avgSeo += r.medianRun.scores.seo;
    }
    avgPerf = Math.round(avgPerf / totalRoutes);
    avgA11y = Math.round(avgA11y / totalRoutes);
    avgBp = Math.round(avgBp / totalRoutes);
    avgSeo = Math.round(avgSeo / totalRoutes);
  }

  const isSlack = webhookUrl.includes('hooks.slack.com');
  const isDiscord = webhookUrl.includes('discord.com/api/webhooks') || webhookUrl.includes('discordapp.com/api/webhooks');

  let body: string;

  if (isSlack) {
    // Slack Block Kit format
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `⚡ Daha Performance Check: ${summary.passed ? 'PASSED' : 'FAILED'}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Timestamp:* ${new Date(summary.timestamp).toUTCString()}\n*Routes Count:* ${totalRoutes}\n*Duration:* ${(summary.durationMs / 1000).toFixed(2)}s`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Average Scores:*\n- Performance: *${avgPerf}*\n- Accessibility: *${avgA11y}*\n- Best Practices: *${avgBp}*\n- SEO: *${avgSeo}*`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: 'Audited by Daha Platform',
          },
        ],
      },
    ];
    body = JSON.stringify({ blocks });
  } else if (isDiscord) {
    // Discord Embed format
    const embed = {
      title: `⚡ Daha Performance Check: ${summary.passed ? 'PASSED' : 'FAILED'}`,
      description: `**Timestamp:** ${new Date(summary.timestamp).toUTCString()}\n**Routes Count:** ${totalRoutes}\n**Duration:** ${(summary.durationMs / 1000).toFixed(2)}s`,
      color: summary.passed ? 0x10b981 : 0xef4444, // Green vs Red
      fields: [
        {
          name: 'Average Scores',
          value: `- Performance: **${avgPerf}**\n- Accessibility: **${avgA11y}**\n- Best Practices: **${avgBp}**\n- SEO: **${avgSeo}**`,
        },
      ],
      footer: {
        text: 'Audited by Daha Platform',
      },
    };
    body = JSON.stringify({ embeds: [embed] });
  } else {
    // Generic POST format
    body = JSON.stringify({
      timestamp: summary.timestamp,
      passed: summary.passed,
      routesCount: totalRoutes,
      durationMs: summary.durationMs,
      avgScores: {
        performance: avgPerf,
        accessibility: avgA11y,
        'best-practices': avgBp,
        seo: avgSeo,
      },
    });
  }

  try {
    const res = await globalThis.fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      console.warn(`[Daha Webhook] Failed to deliver alert: ${res.statusText}`);
    }
  } catch (err: any) {
    console.warn(`[Daha Webhook] Error sending webhook payload: ${err.message}`);
  }
}
